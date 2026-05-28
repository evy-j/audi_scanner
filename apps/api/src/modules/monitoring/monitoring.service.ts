import type { AlertStatus, MonitorEventStatus, MonitorTargetKind, Prisma } from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { env } from "../../config/environment.js";
import { prisma } from "../../infra/prisma/prisma.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import { BillingEntitlementService, ENTITLEMENT_KEYS } from "../billing/entitlements.service.js";
import { decodeLogWithAbi } from "./event-decoder.js";
import { ADMIN_FUNCTION_SELECTORS, COMMON_EVENT_SIGNATURES, COMMON_EVENT_TOPICS } from "./event-signatures.js";
import {
  LocalMonitorArtifactStore,
  monitorArtifactPrefix,
  type MonitorArtifactStore
} from "./monitor-artifact-store.js";
import { MONITORING_SAFETY_POLICY } from "./monitoring.policy.js";
import {
  MonitoringRepository,
  toRuleConfig,
  type CreateMonitorRuleInput,
  type CreateMonitorTargetInput
} from "./monitoring.repository.js";
import { redactRpcUrl, sha256 } from "./redaction.js";
import { inputSelector, ViemReadOnlyProvider, type EvmReadOnlyProvider, type ObservedLog, type ObservedTransaction } from "./rpc-provider.js";
import { MonitorRuleEngine, type PersistedObservedEvent, type RuleTarget } from "./rule-engine.js";
import { WebhookDeliveryService } from "./webhook-delivery.js";

export interface MonitoringActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export interface CreateTargetInput {
  chainId?: number | undefined;
  address?: string | undefined;
  kind?: MonitorTargetKind | undefined;
  displayName?: string | undefined;
  scanId?: string | undefined;
  status?: "ACTIVE" | "PAUSED" | "DISABLED" | undefined;
  abi?: unknown;
  metadata?: Record<string, unknown> | undefined;
  rules?: Array<{
    kind: CreateMonitorRuleInput["kind"];
    severity?: CreateMonitorRuleInput["severity"] | undefined;
    threshold?: string | undefined;
    functionSelector?: string | undefined;
    eventSignature?: string | undefined;
    config?: Record<string, unknown> | undefined;
  }> | undefined;
}

export class MonitoringService {
  constructor(
    private readonly repository = new MonitoringRepository(),
    private readonly artifactStore: MonitorArtifactStore = new LocalMonitorArtifactStore(),
    private readonly ruleEngine = new MonitorRuleEngine(),
    private readonly webhooks = new WebhookDeliveryService(repository),
    private readonly usageLimits = new UsageLimitService(),
    private readonly providerFactory: (rpcUrl: string) => EvmReadOnlyProvider = (rpcUrl) => new ViemReadOnlyProvider(rpcUrl),
    private readonly entitlements = new BillingEntitlementService()
  ) {}

  async listTargets(projectId: string, organizationId: string) {
    await this.assertProject(projectId, organizationId);
    return {
      monitoring: monitoringState(),
      targets: await this.repository.listTargets(projectId, organizationId)
    };
  }

  async createTarget(projectId: string, actor: MonitoringActor, input: CreateTargetInput) {
    await this.assertProject(projectId, actor.organizationId);
    const created = [];
    if (input.scanId) {
      const scan = await this.repository.scanForTargetSetup(input.scanId, actor.organizationId, projectId);
      if (!scan) throw ApiError.notFound("Scan");
      const targets = collectTargetsFromScan(scan, input, actor.organizationId, projectId);
      if (targets.length === 0) {
        throw ApiError.badRequest("No persisted scan contract addresses are available for monitoring target setup");
      }
      for (const target of targets) {
        created.push(await this.persistTargetWithRules(target, input.rules));
      }
    } else {
      if (!input.address) throw ApiError.badRequest("Contract address is required");
      const chainId = input.chainId ?? env.MONITORING_CHAIN_ID;
      if (!chainId) throw ApiError.badRequest("chainId is required when MONITORING_CHAIN_ID is not configured");
      const normalizedAddress = normalizeAddress(input.address);
      created.push(await this.persistTargetWithRules({
        organizationId: actor.organizationId,
        projectId,
        scanId: null,
        contractId: null,
        chainId,
        address: input.address,
        normalizedAddress,
        kind: input.kind ?? "CONTRACT",
        status: input.status ?? "DISABLED",
        displayName: input.displayName ?? null,
        source: "MANUAL",
        providerName: providerName(),
        abi: input.abi,
        metadata: input.metadata
      }, input.rules));
    }

    if (created.some((target) => target.status === "ACTIVE")) {
      await this.usageLimits.assertAndConsume(actor.organizationId, "MONITORED_PROJECTS", {
        resourceType: "PROJECT",
        resourceId: projectId
      });
    }

    return { monitoring: monitoringState(), targets: created };
  }

  async updateTarget(targetId: string, actor: MonitoringActor, input: {
    status?: "ACTIVE" | "PAUSED" | "DISABLED" | undefined;
    kind?: MonitorTargetKind | undefined;
    displayName?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    const result = await this.repository.updateTarget(targetId, actor.organizationId, input);
    if (result.count === 0) throw ApiError.notFound("Monitor target");
    const target = await this.repository.getTarget(targetId, actor.organizationId);
    return target;
  }

  async deleteTarget(targetId: string, actor: MonitoringActor) {
    const result = await this.repository.deleteTarget(targetId, actor.organizationId);
    if (result.count === 0) throw ApiError.notFound("Monitor target");
    return { ok: true };
  }

  async runOnce(projectId: string, actor: MonitoringActor) {
    await this.assertProject(projectId, actor.organizationId);
    const startedAt = new Date();

    if (!env.MONITORING_ENABLED) {
      const run = await this.repository.createRun({
        organizationId: actor.organizationId,
        projectId,
        status: "NOT_ASSESSED",
        providerName: providerName(),
        startedAt,
        errorCategory: "DISABLED",
        error: "Monitoring is disabled by configuration",
        metadata: { policy: MONITORING_SAFETY_POLICY }
      });
      const final = await this.repository.completeRun(run.id, {
        status: "NOT_ASSESSED",
        eventCount: 0,
        transactionCount: 0,
        alertCount: 0,
        errorCategory: "DISABLED",
        error: "Monitoring is disabled by configuration",
        startedAt
      });
      return { monitoring: monitoringState(), ran: false, status: "DISABLED", run: final };
    }

    if (!env.MONITORING_RPC_URL || !env.MONITORING_CHAIN_ID) {
      const run = await this.repository.createRun({
        organizationId: actor.organizationId,
        projectId,
        status: "NOT_ASSESSED",
        providerName: providerName(),
        startedAt,
        errorCategory: "RPC_NOT_CONFIGURED",
        error: "Monitoring RPC URL or chain id is not configured"
      });
      const final = await this.repository.completeRun(run.id, {
        status: "NOT_ASSESSED",
        eventCount: 0,
        transactionCount: 0,
        alertCount: 0,
        errorCategory: "RPC_NOT_CONFIGURED",
        error: "Monitoring RPC URL or chain id is not configured",
        startedAt
      });
      return { monitoring: monitoringState(), ran: false, status: "RPC_NOT_CONFIGURED", run: final };
    }

    const allTargets = await this.repository.activeTargetsForProject(projectId, actor.organizationId);
    const targets = allTargets.filter((target) => target.chainId === env.MONITORING_CHAIN_ID);
    if (targets.length === 0) {
      const run = await this.repository.createRun({
        organizationId: actor.organizationId,
        projectId,
        chainId: env.MONITORING_CHAIN_ID,
        status: "NOT_ASSESSED",
        providerName: providerName(),
        startedAt,
        errorCategory: "NO_ACTIVE_TARGETS",
        error: "No active monitoring targets are configured for this project and chain"
      });
      const final = await this.repository.completeRun(run.id, {
        status: "NOT_ASSESSED",
        eventCount: 0,
        transactionCount: 0,
        alertCount: 0,
        errorCategory: "NO_ACTIVE_TARGETS",
        error: "No active monitoring targets are configured for this project and chain",
        startedAt
      });
      return { monitoring: monitoringState(), ran: false, status: "NOT_ASSESSED", run: final };
    }

    const provider = this.providerFactory(env.MONITORING_RPC_URL);
    const latestBlock = await withRetry(() => provider.getLatestBlockNumber());
    const finalizedBlock = latestBlock > BigInt(env.MONITORING_REORG_DEPTH)
      ? latestBlock - BigInt(env.MONITORING_REORG_DEPTH)
      : 0n;
    const projectRun = await this.repository.createRun({
      organizationId: actor.organizationId,
      projectId,
      chainId: env.MONITORING_CHAIN_ID,
      status: "OBSERVED",
      providerName: providerName(),
      latestBlock,
      startedAt,
      metadata: { redactedRpcUrl: redactRpcUrl(env.MONITORING_RPC_URL), policy: MONITORING_SAFETY_POLICY }
    });

    let eventCount = 0;
    let transactionCount = 0;
    const createdAlerts = [];
    const transactionCache = new Map<string, Awaited<ReturnType<MonitoringRepository["upsertTransaction"]>>>();

    try {
      for (const target of targets) {
        const cursor = await this.repository.cursor(projectId, env.MONITORING_CHAIN_ID, target.id);
        const fromBlock = computeFromBlock(cursor?.lastProcessedBlock ?? null, finalizedBlock);
        const toBlock = fromBlock > finalizedBlock
          ? finalizedBlock
          : minBigInt(finalizedBlock, fromBlock + BigInt(env.MONITORING_MAX_BLOCK_RANGE - 1));
        if (fromBlock > toBlock) {
          continue;
        }
        const rules = target.rules.map(toRuleConfig);
        const logs = (await withRetry(() => provider.getLogs({
          address: target.normalizedAddress,
          fromBlock,
          toBlock
        }))).slice(0, Math.max(0, env.MONITORING_MAX_EVENTS_PER_RUN - eventCount));

        const persistedEvents = [];
        for (const log of logs) {
          const tx = await this.persistTransactionForLog(target, projectRun.id, provider, log, transactionCache);
          if (tx) transactionCount += transactionCache.has(log.transactionHash.toLowerCase()) ? 0 : 1;
          const event = await this.persistEvent(projectRun.id, target, log, tx?.id ?? null);
          const ruleEvent = eventToRuleEvent(event);
          persistedEvents.push(ruleEvent);
          eventCount += 1;
          const candidates = this.ruleEngine.evaluateEvent(targetToRuleTarget(target), rules, ruleEvent);
          for (const candidate of candidates) {
            const alert = await this.repository.createAlert(candidate, actor.organizationId, projectId, projectRun.id);
            if (alert) createdAlerts.push(alert);
          }
          if (eventCount >= env.MONITORING_MAX_EVENTS_PER_RUN) break;
        }

        const watchedTxAlerts = await this.scanTargetTransactions({
          provider,
          target,
          rules,
          projectRunId: projectRun.id,
          fromBlock,
          toBlock,
          transactionCache
        });
        transactionCount += watchedTxAlerts.transactionCount;
        createdAlerts.push(...watchedTxAlerts.alerts);

        const activityRule = rules.find((rule) => rule.kind === "CONTRACT_ACTIVITY_DRIFT" || rule.kind === "UNKNOWN_EVENT_SPIKE");
        const baseline = baselineCount(cursor?.metadata);
        if (activityRule) {
          const drift = this.ruleEngine.evaluateActivityDrift({
            target: targetToRuleTarget(target),
            rule: activityRule,
            currentEventCount: persistedEvents.length,
            baselineEventCount: baseline,
            evidenceEvent: persistedEvents[0] ?? null
          });
          if (drift) {
            const alert = await this.repository.createAlert(drift, actor.organizationId, projectId, projectRun.id);
            if (alert) createdAlerts.push(alert);
          }
        }

        await this.repository.upsertCursor({
          organizationId: actor.organizationId,
          projectId,
          targetId: target.id,
          chainId: env.MONITORING_CHAIN_ID,
          providerName: providerName(),
          lastProcessedBlock: toBlock,
          lastFinalizedBlock: finalizedBlock,
          status: "OBSERVED",
          metadata: {
            baselineEventCount: persistedEvents.length,
            previousBaselineEventCount: baseline,
            eip1967: await safeStorageSnapshot(provider, target.normalizedAddress, toBlock)
          }
        });
      }

      const final = await this.repository.completeRun(projectRun.id, {
        status: "OBSERVED",
        eventCount,
        transactionCount,
        alertCount: createdAlerts.length,
        latestBlock,
        startedAt,
        metadata: { redactedRpcUrl: redactRpcUrl(env.MONITORING_RPC_URL) }
      });
      await this.webhooks.deliverForAlerts(createdAlerts);
      return {
        monitoring: monitoringState(),
        ran: true,
        status: final.status,
        run: final,
        alertCount: createdAlerts.length
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Monitoring provider error";
      const final = await this.repository.completeRun(projectRun.id, {
        status: "FAILED",
        eventCount,
        transactionCount,
        alertCount: createdAlerts.length,
        latestBlock,
        errorCategory: "PROVIDER_ERROR",
        error: message,
        startedAt
      });
      return { monitoring: monitoringState(), ran: true, status: "PROVIDER_ERROR", run: final };
    }
  }

  async listAlerts(projectId: string, organizationId: string, input: { status?: AlertStatus | undefined; limit: number }) {
    await this.assertProject(projectId, organizationId);
    return {
      monitoring: monitoringState(),
      alerts: await this.repository.listAlerts(projectId, organizationId, input)
    };
  }

  async getAlert(alertId: string, organizationId: string) {
    const alert = await this.repository.getAlert(alertId, organizationId);
    if (!alert) throw ApiError.notFound("Alert");
    return alert;
  }

  async transitionAlert(alertId: string, actor: MonitoringActor, status: AlertStatus, reason?: string | undefined) {
    const alert = await this.repository.updateAlertStatus(alertId, actor.organizationId, status, actor.actorUserId, reason);
    if (!alert) throw ApiError.notFound("Alert");
    return alert;
  }

  async addComment(alertId: string, actor: MonitoringActor, body: string) {
    const comment = await this.repository.addComment(alertId, actor.organizationId, actor.actorUserId, body);
    if (!comment) throw ApiError.notFound("Alert");
    return comment;
  }

  async scanSummary(scanId: string, organizationId: string) {
    const summary = await this.repository.scanMonitoringSummary(scanId, organizationId);
    if (!summary) throw ApiError.notFound("Scan");
    return { monitoring: monitoringState(), ...summary };
  }

  async listWebhooks(projectId: string, organizationId: string) {
    await this.assertProject(projectId, organizationId);
    return { webhooks: await this.repository.listWebhooks(projectId, organizationId) };
  }

  async createWebhook(projectId: string, actor: MonitoringActor, input: { url: string; name?: string | undefined; signingSecret: string; metadata?: Record<string, unknown> | undefined }) {
    await this.assertProject(projectId, actor.organizationId);
    const activeWebhookCount = await prisma.projectWebhook.count({
      where: { organizationId: actor.organizationId, deletedAt: null, status: "ACTIVE" }
    });
    await this.entitlements.assertMaxAllowed(actor.organizationId, ENTITLEMENT_KEYS.webhooks, activeWebhookCount, 1, {
      projectId,
      resourceType: "PROJECT_WEBHOOK",
      actorUserId: actor.actorUserId
    });
    return this.repository.createWebhook({
      organizationId: actor.organizationId,
      projectId,
      name: input.name,
      url: input.url,
      redactedUrl: redactWebhookUrl(input.url),
      signingSecret: input.signingSecret,
      metadata: input.metadata
    });
  }

  async deleteWebhook(projectId: string, webhookId: string, actor: MonitoringActor) {
    const result = await this.repository.deleteWebhook(projectId, webhookId, actor.organizationId);
    if (result.count === 0) throw ApiError.notFound("Webhook");
    return { ok: true };
  }

  private async assertProject(projectId: string, organizationId: string) {
    const project = await this.repository.project(projectId, organizationId);
    if (!project) throw ApiError.notFound("Project");
    return project;
  }

  private async persistTargetWithRules(target: CreateMonitorTargetInput, rules?: CreateTargetInput["rules"]) {
    const persisted = await this.repository.upsertTarget(target);
    await this.repository.ensureRules(persisted.id, buildRulesForTarget(persisted, rules));
    const hydrated = await this.repository.getTarget(persisted.id, persisted.organizationId);
    if (!hydrated) throw ApiError.notFound("Monitor target");
    return hydrated;
  }

  private async persistTransactionForLog(
    target: TargetWithRules,
    monitorRunId: string,
    provider: EvmReadOnlyProvider,
    log: ObservedLog,
    cache: Map<string, Awaited<ReturnType<MonitoringRepository["upsertTransaction"]>>>
  ) {
    const key = log.transactionHash.toLowerCase();
    const existing = cache.get(key);
    if (existing) return existing;
    const transaction = await withRetry(() => provider.getTransaction(log.transactionHash));
    if (!transaction) return null;
    const persisted = await this.repository.upsertTransaction({
      organizationId: target.organizationId,
      projectId: target.projectId,
      targetId: target.id,
      monitorRunId,
      scanId: target.scanId,
      chainId: target.chainId,
      hash: transaction.hash,
      blockNumber: transaction.blockNumber || log.blockNumber,
      blockHash: transaction.blockHash === "0x" ? log.blockHash : transaction.blockHash,
      fromAddress: transaction.from,
      toAddress: transaction.to,
      inputSelector: inputSelector(transaction.input),
      input: transaction.input,
      value: transaction.value?.toString() ?? null,
      providerName: providerName(),
      observedAt: new Date()
    });
    cache.set(key, persisted);
    return persisted;
  }

  private async persistEvent(monitorRunId: string, target: TargetWithRules, log: ObservedLog, transactionId: string | null) {
    const decoded = decodeLogWithAbi({ abi: target.abi, topics: log.topics, data: log.data });
    const rawArtifact = await this.artifactStore.writeJsonArtifact(
      monitorArtifactPrefix(target.projectId, monitorRunId),
      `raw-events/${log.transactionHash}-${log.logIndex}.json`,
      { log, decodedStatus: decoded.decodeStatus }
    );
    return this.repository.upsertEvent({
      organizationId: target.organizationId,
      projectId: target.projectId,
      targetId: target.id,
      monitorRunId,
      transactionId,
      scanId: target.scanId,
      chainId: target.chainId,
      address: log.address,
      normalizedAddress: normalizeAddress(log.address),
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      eventSignature: log.topics[0]?.toLowerCase() ?? null,
      eventName: decoded.eventName,
      topics: log.topics,
      data: log.data,
      decodedData: decoded.decodedData,
      decodeStatus: decoded.decodeStatus,
      rawArtifactPath: rawArtifact.artifactKey,
      rawArtifactChecksumSha256: rawArtifact.checksum,
      status: "OBSERVED",
      providerName: providerName(),
      observedAt: new Date()
    });
  }

  private async scanTargetTransactions(input: {
    provider: EvmReadOnlyProvider;
    target: TargetWithRules;
    rules: ReturnType<typeof toRuleConfig>[];
    projectRunId: string;
    fromBlock: bigint;
    toBlock: bigint;
    transactionCache: Map<string, Awaited<ReturnType<MonitoringRepository["upsertTransaction"]>>>;
  }): Promise<{ transactionCount: number; alerts: Array<NonNullable<Awaited<ReturnType<MonitoringRepository["createAlert"]>>>> }> {
    if (!input.provider.getBlockTransactions || !input.rules.some((rule) => rule.kind === "PRIVILEGED_FUNCTION_CALL")) {
      return { transactionCount: 0, alerts: [] };
    }
    const alerts = [];
    let transactionCount = 0;
    for (let blockNumber = input.fromBlock; blockNumber <= input.toBlock; blockNumber += 1n) {
      const txs = await withRetry(() => input.provider.getBlockTransactions!(blockNumber));
      for (const transaction of txs) {
        if (normalizeAddress(transaction.to) !== input.target.normalizedAddress) continue;
        const key = transaction.hash.toLowerCase();
        let persisted = input.transactionCache.get(key);
        if (!persisted) {
          persisted = await this.repository.upsertTransaction({
            organizationId: input.target.organizationId,
            projectId: input.target.projectId,
            targetId: input.target.id,
            monitorRunId: input.projectRunId,
            scanId: input.target.scanId,
            chainId: input.target.chainId,
            hash: transaction.hash,
            blockNumber: transaction.blockNumber || blockNumber,
            blockHash: transaction.blockHash,
            fromAddress: transaction.from,
            toAddress: transaction.to,
            inputSelector: inputSelector(transaction.input),
            input: transaction.input,
            value: transaction.value?.toString() ?? null,
            providerName: providerName(),
            observedAt: new Date()
          });
          input.transactionCache.set(key, persisted);
          transactionCount += 1;
        }
        const candidates = this.ruleEngine.evaluateTransaction(targetToRuleTarget(input.target), input.rules, {
          id: persisted.id,
          chainId: persisted.chainId,
          hash: persisted.hash,
          blockNumber: persisted.blockNumber,
          blockHash: persisted.blockHash,
          fromAddress: persisted.fromAddress,
          toAddress: persisted.toAddress,
          inputSelector: persisted.inputSelector,
          input: persisted.input,
          providerName: persisted.providerName,
          observedAt: persisted.observedAt
        });
        for (const candidate of candidates) {
          const alert = await this.repository.createAlert(candidate, input.target.organizationId, input.target.projectId, input.projectRunId);
          if (alert) alerts.push(alert);
        }
      }
    }
    return { transactionCount, alerts };
  }
}

type TargetWithRules = Awaited<ReturnType<MonitoringRepository["activeTargetsForProject"]>>[number];

function monitoringState() {
  return {
    enabled: env.MONITORING_ENABLED,
    status: env.MONITORING_ENABLED ? (env.MONITORING_RPC_URL && env.MONITORING_CHAIN_ID ? "ACTIVE" : "NOT_ASSESSED") : "DISABLED",
    chainId: env.MONITORING_CHAIN_ID ?? null,
    providerName: providerName(),
    pollIntervalMs: env.MONITORING_POLL_INTERVAL_MS,
    maxBlockRange: env.MONITORING_MAX_BLOCK_RANGE,
    reorgDepth: env.MONITORING_REORG_DEPTH,
    maxEventsPerRun: env.MONITORING_MAX_EVENTS_PER_RUN,
    webhooksEnabled: env.MONITORING_WEBHOOKS_ENABLED,
    warning: MONITORING_SAFETY_POLICY.warning
  };
}

function providerName(): string | null {
  if (!env.MONITORING_RPC_URL) return env.MONITORING_PROVIDER_NAME || null;
  return env.MONITORING_PROVIDER_NAME || new URL(env.MONITORING_RPC_URL).hostname;
}

function normalizeAddress(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function buildRulesForTarget(target: { organizationId: string; projectId: string; id: string; kind: MonitorTargetKind }, configured?: CreateTargetInput["rules"]): CreateMonitorRuleInput[] {
  const base: CreateMonitorRuleInput[] = [
    { organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "PROXY_UPGRADE", severity: "HIGH", name: "Proxy upgrade event signatures", eventSignature: COMMON_EVENT_SIGNATURES.Upgraded },
    { organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "ADMIN_ROLE_CHANGE", severity: "HIGH", name: "Admin and role changes" },
    { organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "OWNERSHIP_TRANSFER", severity: "HIGH", name: "Ownership transfers", eventSignature: COMMON_EVENT_SIGNATURES.OwnershipTransferred },
    { organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "PAUSE_UNPAUSE", severity: "MEDIUM", name: "Pause-state changes" },
    { organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "PRIVILEGED_FUNCTION_CALL", severity: "MEDIUM", name: "Privileged function selectors", config: { selectors: Object.values(ADMIN_FUNCTION_SELECTORS) } },
    { organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "CONTRACT_ACTIVITY_DRIFT", severity: "LOW", name: "Contract activity drift", config: { multiplier: 3 } }
  ];
  if (target.kind === "TOKEN") {
    base.push({ organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "LARGE_TOKEN_TRANSFER", severity: "MEDIUM", name: "Large token transfers", eventSignature: COMMON_EVENT_SIGNATURES.Transfer });
  }
  if (target.kind === "POOL") {
    base.push({ organizationId: target.organizationId, projectId: target.projectId, targetId: target.id, kind: "LIQUIDITY_REMOVAL", severity: "MEDIUM", name: "Liquidity event signatures", eventSignature: COMMON_EVENT_SIGNATURES.Burn });
  }
  for (const rule of configured ?? []) {
    base.push({
      organizationId: target.organizationId,
      projectId: target.projectId,
      targetId: target.id,
      kind: rule.kind,
      severity: rule.severity ?? "MEDIUM",
      name: rule.kind.replace(/_/gu, " ").toLowerCase(),
      eventSignature: rule.eventSignature,
      functionSelector: rule.functionSelector,
      threshold: rule.threshold,
      config: rule.config
    });
  }
  return base;
}

function collectTargetsFromScan(
  scan: NonNullable<Awaited<ReturnType<MonitoringRepository["scanForTargetSetup"]>>>,
  input: CreateTargetInput,
  organizationId: string,
  projectId: string
): CreateMonitorTargetInput[] {
  const chainId = input.chainId ?? env.MONITORING_CHAIN_ID;
  if (!chainId) throw ApiError.badRequest("chainId is required when MONITORING_CHAIN_ID is not configured");
  const addresses = new Map<string, { address: string; source: string; kind: MonitorTargetKind; contractId?: string | null }>();
  for (const target of scan.targets) {
    const address = target.normalizedAddress ?? target.contractAddress;
    if (isAddress(address)) addresses.set(normalizeAddress(address), { address: address!, source: "SCAN_TARGET", kind: input.kind ?? "CONTRACT" });
  }
  if (isAddress(scan.contract?.normalizedAddress ?? scan.contract?.address)) {
    const address = scan.contract!.normalizedAddress ?? scan.contract!.address;
    addresses.set(normalizeAddress(address), { address, source: "SCAN_CONTRACT", kind: input.kind ?? "CONTRACT", contractId: scan.contractId });
  }
  for (const [address, source] of explicitMetadataAddresses(scan.metadata).concat(scan.compilerArtifacts.flatMap((artifact) => explicitMetadataAddresses(artifact.metadata)))) {
    addresses.set(normalizeAddress(address), { address, source, kind: kindFromMetadataSource(source, input.kind) });
  }
  const abi = input.abi ?? bestAbi(scan.compilerArtifacts);
  return [...addresses.values()].map((item) => ({
    organizationId,
    projectId,
    scanId: scan.id,
    contractId: item.contractId ?? null,
    chainId,
    address: item.address,
    normalizedAddress: normalizeAddress(item.address),
    kind: item.kind,
    status: input.status ?? "DISABLED",
    displayName: input.displayName ?? scan.title ?? null,
    source: item.source,
    providerName: providerName(),
    abi,
    metadata: { ...(input.metadata ?? {}), source: item.source }
  }));
}

function bestAbi(artifacts: Array<{ abi: Prisma.JsonValue | null }>): unknown {
  const withAbi = artifacts.filter((artifact) => Array.isArray(artifact.abi));
  return withAbi.length === 1 ? withAbi[0]?.abi : undefined;
}

function explicitMetadataAddresses(value: Prisma.JsonValue | null | undefined, prefix = "metadata"): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const results: Array<[string, string]> = [];
  for (const [key, item] of Object.entries(value)) {
    const source = `${prefix}.${key}`;
    if (typeof item === "string" && /(?:address|proxy|admin|token|pool|governance)/iu.test(key) && isAddress(item)) {
      results.push([item, source]);
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      results.push(...explicitMetadataAddresses(item as Prisma.JsonObject, source));
    }
  }
  return results;
}

function kindFromMetadataSource(source: string, fallback?: MonitorTargetKind): MonitorTargetKind {
  if (/proxy/iu.test(source)) return "PROXY";
  if (/token/iu.test(source)) return "TOKEN";
  if (/pool/iu.test(source)) return "POOL";
  if (/governance/iu.test(source)) return "GOVERNANCE";
  return fallback ?? "CONTRACT";
}

function computeFromBlock(lastProcessed: bigint | null, finalizedBlock: bigint): bigint {
  if (lastProcessed !== null) return lastProcessed + 1n;
  const range = BigInt(env.MONITORING_MAX_BLOCK_RANGE);
  return finalizedBlock > range ? finalizedBlock - range + 1n : 0n;
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function baselineCount(metadata: Prisma.JsonValue | null | undefined): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata.baselineEventCount;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function safeStorageSnapshot(provider: EvmReadOnlyProvider, address: string, blockNumber: bigint) {
  if (!provider.getStorageAt) return { status: "NOT_ASSESSED" };
  const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e0197a0e061c4a2bc43b27d2bfbd6103";
  return {
    status: "OBSERVED",
    implementationSlot,
    implementationValue: await provider.getStorageAt({ address, slot: implementationSlot, blockNumber }),
    adminSlot,
    adminValue: await provider.getStorageAt({ address, slot: adminSlot, blockNumber })
  };
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      return await operation();
    } catch {
      throw first;
    }
  }
}

function targetToRuleTarget(target: TargetWithRules): RuleTarget {
  return {
    id: target.id,
    organizationId: target.organizationId,
    projectId: target.projectId,
    scanId: target.scanId,
    chainId: target.chainId,
    address: target.address,
    normalizedAddress: target.normalizedAddress,
    kind: target.kind,
    providerName: target.providerName
  };
}

function eventToRuleEvent(event: Awaited<ReturnType<MonitoringRepository["upsertEvent"]>>): PersistedObservedEvent {
  return {
    id: event.id,
    transactionId: event.transactionId,
    chainId: event.chainId,
    address: event.address,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
    eventSignature: event.eventSignature,
    eventName: event.eventName,
    topics: event.topics,
    data: event.data,
    decodedData: isRecord(event.decodedData) ? event.decodedData : null,
    decodeStatus: event.decodeStatus,
    rawArtifactPath: event.rawArtifactPath,
    rawArtifactChecksumSha256: event.rawArtifactChecksumSha256,
    providerName: event.providerName,
    observedAt: event.observedAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function redactWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    if (url.search) url.search = "?[REDACTED]";
    return url.toString();
  } catch {
    return "[REDACTED_WEBHOOK_URL]";
  }
}

function isAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/u.test(value);
}
