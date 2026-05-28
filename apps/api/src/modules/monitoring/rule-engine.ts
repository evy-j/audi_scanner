import type { AlertSeverity, MonitorRuleKind, MonitorTargetKind } from "@prisma/client";
import { ADMIN_FUNCTION_SELECTORS, COMMON_EVENT_TOPICS, COMMON_TOPIC_TO_EVENT_NAME } from "./event-signatures.js";
import { getDecodedBigInt } from "./event-decoder.js";
import { inputSelector } from "./rpc-provider.js";

export interface MonitorRuleConfig {
  id: string;
  kind: MonitorRuleKind;
  severity: AlertSeverity;
  eventSignature?: string | null | undefined;
  functionSelector?: string | null | undefined;
  threshold?: string | null | undefined;
  config?: Record<string, unknown> | null | undefined;
}

export interface RuleTarget {
  id: string;
  projectId: string;
  organizationId: string;
  scanId?: string | null | undefined;
  chainId: number;
  address: string;
  normalizedAddress: string;
  kind: MonitorTargetKind;
  providerName?: string | null | undefined;
}

export interface PersistedObservedEvent {
  id: string;
  transactionId?: string | null | undefined;
  chainId: number;
  address: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  eventSignature?: string | null | undefined;
  eventName?: string | null | undefined;
  topics: string[];
  data: string;
  decodedData?: Record<string, unknown> | null | undefined;
  decodeStatus: string;
  rawArtifactPath?: string | null | undefined;
  rawArtifactChecksumSha256?: string | null | undefined;
  providerName?: string | null | undefined;
  observedAt: Date;
}

export interface PersistedObservedTransaction {
  id: string;
  chainId: number;
  hash: string;
  blockNumber: bigint;
  blockHash: string;
  fromAddress?: string | null | undefined;
  toAddress?: string | null | undefined;
  inputSelector?: string | null | undefined;
  input?: string | null | undefined;
  providerName?: string | null | undefined;
  observedAt: Date;
}

export interface AlertEvidenceCandidate {
  eventId?: string | null | undefined;
  transactionId?: string | null | undefined;
  ruleKind: MonitorRuleKind;
  targetAddress: string;
  chainId: number;
  transactionHash: string;
  blockNumber: bigint;
  logIndex?: number | null | undefined;
  txInputSelector?: string | null | undefined;
  providerName?: string | null | undefined;
  decodedData?: Record<string, unknown> | null | undefined;
  rawData?: Record<string, unknown> | null | undefined;
  rawArtifactPath?: string | null | undefined;
  rawArtifactChecksumSha256?: string | null | undefined;
  observedAt: Date;
}

export interface AlertCandidate {
  targetId: string;
  ruleId?: string | null | undefined;
  scanId?: string | null | undefined;
  chainId: number;
  kind: MonitorRuleKind;
  severity: AlertSeverity;
  title: string;
  summary: string;
  idempotencyKey: string;
  targetAddress: string;
  transactionHash?: string | null | undefined;
  blockNumber?: bigint | null | undefined;
  logIndex?: number | null | undefined;
  providerName?: string | null | undefined;
  observedAt: Date;
  metadata?: Record<string, unknown> | undefined;
  evidence: AlertEvidenceCandidate[];
}

export class MonitorRuleEngine {
  evaluateEvent(target: RuleTarget, rules: MonitorRuleConfig[], event: PersistedObservedEvent): AlertCandidate[] {
    const signature = event.eventSignature?.toLowerCase() ?? event.topics[0]?.toLowerCase() ?? null;
    const commonName = signature ? COMMON_TOPIC_TO_EVENT_NAME.get(signature) ?? null : null;
    const candidates: AlertCandidate[] = [];

    for (const rule of rules) {
      if (rule.kind === "ORACLE_DEVIATION" && !hasOracleReference(rule)) {
        continue;
      }
      if (rule.kind === "CUSTOM_EVENT_MATCH" && rule.eventSignature?.toLowerCase() === signature) {
        candidates.push(this.eventAlert(target, rule, event, "Custom event signature observed", "A configured custom event signature was observed for this target."));
      }
      if (rule.kind === "PROXY_UPGRADE" && (signature === COMMON_EVENT_TOPICS.Upgraded.toLowerCase() || signature === COMMON_EVENT_TOPICS.AdminChanged.toLowerCase())) {
        candidates.push(this.eventAlert(target, rule, event, "Proxy upgrade/admin signature observed", "A proxy upgrade or admin-change event signature was observed with transaction evidence."));
      }
      if (rule.kind === "ADMIN_ROLE_CHANGE" && ["RoleGranted", "RoleRevoked", "AdminChanged", "Upgraded"].includes(commonName ?? "")) {
        candidates.push(this.eventAlert(target, rule, event, "Admin or role-change signature observed", "A privileged role/admin change signature was observed with on-chain evidence."));
      }
      if (rule.kind === "OWNERSHIP_TRANSFER" && signature === COMMON_EVENT_TOPICS.OwnershipTransferred.toLowerCase()) {
        candidates.push(this.eventAlert(target, rule, event, "Ownership transfer signature observed", "An ownership transfer signature was observed with on-chain evidence."));
      }
      if (rule.kind === "PAUSE_UNPAUSE" && (signature === COMMON_EVENT_TOPICS.Paused.toLowerCase() || signature === COMMON_EVENT_TOPICS.Unpaused.toLowerCase())) {
        candidates.push(this.eventAlert(target, rule, event, "Pause-state change signature observed", "A pause or unpause signature was observed with on-chain evidence."));
      }
      if (rule.kind === "LARGE_TOKEN_TRANSFER" && signature === COMMON_EVENT_TOPICS.Transfer.toLowerCase()) {
        const threshold = thresholdFor(rule);
        const amount = getDecodedBigInt(event.decodedData, "value");
        if (threshold !== null && amount !== null && amount >= threshold) {
          candidates.push(this.eventAlert(target, rule, event, "Large token transfer observed", `A token transfer met the configured threshold of ${threshold.toString()} base units.`));
        }
      }
      if (rule.kind === "LIQUIDITY_REMOVAL" && (signature === COMMON_EVENT_TOPICS.Burn.toLowerCase() || signature === COMMON_EVENT_TOPICS.Sync.toLowerCase())) {
        candidates.push(this.eventAlert(target, rule, event, "Liquidity event signature observed", "A configured liquidity event signature was observed. No financial loss is inferred without price or liquidity data."));
      }
    }

    return candidates.filter((candidate) => candidate.evidence.length > 0);
  }

  evaluateTransaction(target: RuleTarget, rules: MonitorRuleConfig[], transaction: PersistedObservedTransaction): AlertCandidate[] {
    const selector = transaction.inputSelector ?? inputSelector(transaction.input);
    if (!selector) return [];

    const candidates: AlertCandidate[] = [];
    for (const rule of rules.filter((item) => item.kind === "PRIVILEGED_FUNCTION_CALL")) {
      const watchedSelectors = selectorsFor(rule);
      if (!watchedSelectors.has(selector.toLowerCase())) continue;
      const evidence: AlertEvidenceCandidate = {
        transactionId: transaction.id,
        ruleKind: rule.kind,
        targetAddress: target.normalizedAddress,
        chainId: target.chainId,
        transactionHash: transaction.hash,
        blockNumber: transaction.blockNumber,
        txInputSelector: selector,
        providerName: transaction.providerName ?? target.providerName ?? null,
        rawData: { inputSelector: selector },
        observedAt: transaction.observedAt
      };
      candidates.push({
        targetId: target.id,
        ruleId: rule.id,
        scanId: target.scanId ?? null,
        chainId: target.chainId,
        kind: rule.kind,
        severity: rule.severity,
        title: "Privileged function selector observed",
        summary: "A configured privileged function selector appeared in a transaction sent to the monitored target.",
        idempotencyKey: `${target.chainId}:${rule.id}:${transaction.hash}:selector:${selector}`,
        targetAddress: target.normalizedAddress,
        transactionHash: transaction.hash,
        blockNumber: transaction.blockNumber,
        providerName: transaction.providerName ?? target.providerName ?? null,
        observedAt: transaction.observedAt,
        metadata: { selector },
        evidence: [evidence]
      });
    }
    return candidates.filter((candidate) => candidate.evidence.length > 0);
  }

  evaluateActivityDrift(input: {
    target: RuleTarget;
    rule: MonitorRuleConfig;
    currentEventCount: number;
    baselineEventCount: number | null;
    evidenceEvent: PersistedObservedEvent | null;
  }): AlertCandidate | null {
    if (input.rule.kind !== "CONTRACT_ACTIVITY_DRIFT" && input.rule.kind !== "UNKNOWN_EVENT_SPIKE") return null;
    if (!input.evidenceEvent || input.baselineEventCount === null || input.baselineEventCount <= 0) return null;
    const multiplier = numericConfig(input.rule, "multiplier") ?? 3;
    if (input.currentEventCount < input.baselineEventCount * multiplier) return null;
    return this.eventAlert(
      input.target,
      input.rule,
      input.evidenceEvent,
      "Contract activity drift observed",
      `Observed event volume ${input.currentEventCount} exceeded the previous baseline ${input.baselineEventCount} by the configured anomaly multiplier. This is an anomaly signal, not an exploit claim.`,
      { currentEventCount: input.currentEventCount, baselineEventCount: input.baselineEventCount, multiplier }
    );
  }

  private eventAlert(
    target: RuleTarget,
    rule: MonitorRuleConfig,
    event: PersistedObservedEvent,
    title: string,
    summary: string,
    metadata: Record<string, unknown> = {}
  ): AlertCandidate {
    const evidence: AlertEvidenceCandidate = {
      eventId: event.id,
      transactionId: event.transactionId ?? null,
      ruleKind: rule.kind,
      targetAddress: target.normalizedAddress,
      chainId: target.chainId,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      providerName: event.providerName ?? target.providerName ?? null,
      decodedData: event.decodedData ?? null,
      rawData: {
        topics: event.topics,
        data: event.data,
        decodeStatus: event.decodeStatus
      },
      rawArtifactPath: event.rawArtifactPath ?? null,
      rawArtifactChecksumSha256: event.rawArtifactChecksumSha256 ?? null,
      observedAt: event.observedAt
    };
    return {
      targetId: target.id,
      ruleId: rule.id,
      scanId: target.scanId ?? null,
      chainId: target.chainId,
      kind: rule.kind,
      severity: rule.severity,
      title,
      summary,
      idempotencyKey: `${target.chainId}:${rule.id}:${event.transactionHash}:${event.logIndex}`,
      targetAddress: target.normalizedAddress,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      providerName: event.providerName ?? target.providerName ?? null,
      observedAt: event.observedAt,
      metadata,
      evidence: [evidence]
    };
  }
}

function thresholdFor(rule: MonitorRuleConfig): bigint | null {
  const raw = rule.threshold ?? (typeof rule.config?.threshold === "string" ? rule.config.threshold : null);
  if (!raw || !/^\d+$/u.test(raw)) return null;
  return BigInt(raw);
}

function selectorsFor(rule: MonitorRuleConfig): Set<string> {
  const configured = Array.isArray(rule.config?.selectors)
    ? rule.config.selectors.filter((item): item is string => typeof item === "string")
    : [];
  return new Set([
    rule.functionSelector,
    ...configured,
    ...Object.values(ADMIN_FUNCTION_SELECTORS)
  ].filter((item): item is string => typeof item === "string" && /^0x[0-9a-fA-F]{8}$/u.test(item)).map((item) => item.toLowerCase()));
}

function hasOracleReference(rule: MonitorRuleConfig): boolean {
  return Boolean(rule.config?.referenceFeed || rule.config?.referenceSource);
}

function numericConfig(rule: MonitorRuleConfig, key: string): number | null {
  const value = rule.config?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
