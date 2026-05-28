import type {
  AccessStatus,
  AlertSeverity,
  AlertStatus,
  MonitorEventStatus,
  MonitorRuleKind,
  MonitorStatus,
  MonitorTargetKind,
  Prisma
} from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { redactMonitoringText, sha256 } from "./redaction.js";
import type { AlertCandidate, MonitorRuleConfig } from "./rule-engine.js";

export interface CreateMonitorTargetInput {
  organizationId: string;
  projectId: string;
  scanId?: string | null | undefined;
  contractId?: string | null | undefined;
  chainId: number;
  address: string;
  normalizedAddress: string;
  kind: MonitorTargetKind;
  status: MonitorStatus;
  displayName?: string | null | undefined;
  source: string;
  providerName?: string | null | undefined;
  abi?: unknown;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreateMonitorRuleInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  kind: MonitorRuleKind;
  severity: AlertSeverity;
  name: string;
  eventSignature?: string | null | undefined;
  functionSelector?: string | null | undefined;
  threshold?: string | null | undefined;
  config?: Record<string, unknown> | undefined;
}

export interface PersistTransactionInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  monitorRunId: string;
  scanId?: string | null | undefined;
  chainId: number;
  hash: string;
  blockNumber: bigint;
  blockHash: string;
  fromAddress?: string | null | undefined;
  toAddress?: string | null | undefined;
  inputSelector?: string | null | undefined;
  input?: string | null | undefined;
  value?: string | null | undefined;
  providerName?: string | null | undefined;
  observedAt: Date;
}

export interface PersistEventInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  monitorRunId: string;
  transactionId?: string | null | undefined;
  scanId?: string | null | undefined;
  chainId: number;
  address: string;
  normalizedAddress: string;
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
  status?: MonitorEventStatus | undefined;
  providerName?: string | null | undefined;
  observedAt: Date;
  metadata?: Record<string, unknown> | undefined;
}

export class MonitoringRepository {
  project(projectId: string, organizationId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true }
    });
  }

  scanForTargetSetup(scanId: string, organizationId: string, projectId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, projectId, deletedAt: null },
      include: {
        targets: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        contract: true,
        compilerArtifacts: { orderBy: [{ createdAt: "desc" }, { artifactPath: "asc" }], take: 50 }
      }
    });
  }

  scanMonitoringSummary(scanId: string, organizationId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        monitorTargets: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            rules: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
            cursors: { orderBy: { updatedAt: "desc" }, take: 1 }
          }
        },
        monitorRuns: { orderBy: { createdAt: "desc" }, take: 10 },
        monitorAlerts: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { evidence: { orderBy: { createdAt: "asc" } } }
        }
      }
    });
  }

  listTargets(projectId: string, organizationId: string) {
    return prisma.monitorTarget.findMany({
      where: { projectId, organizationId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: targetInclude()
    });
  }

  async upsertTarget(input: CreateMonitorTargetInput) {
    const target = await prisma.monitorTarget.upsert({
      where: {
        projectId_chainId_normalizedAddress: {
          projectId: input.projectId,
          chainId: input.chainId,
          normalizedAddress: input.normalizedAddress
        }
      },
      create: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId ?? null,
        contractId: input.contractId ?? null,
        chainId: input.chainId,
        address: input.address,
        normalizedAddress: input.normalizedAddress,
        kind: input.kind,
        status: input.status,
        displayName: input.displayName ?? null,
        source: input.source,
        providerName: input.providerName ?? null,
        abi: input.abi ? toJsonValue(input.abi) : undefined,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.MonitorTargetUncheckedCreateInput,
      update: {
        deletedAt: null,
        scanId: input.scanId ?? undefined,
        contractId: input.contractId ?? undefined,
        kind: input.kind,
        status: input.status,
        displayName: input.displayName ?? undefined,
        providerName: input.providerName ?? undefined,
        abi: input.abi ? toJsonValue(input.abi) : undefined,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.MonitorTargetUncheckedUpdateInput,
      include: targetInclude()
    });
    return target;
  }

  async ensureRules(targetId: string, rules: CreateMonitorRuleInput[]) {
    const existing = await prisma.monitorRule.findMany({
      where: { targetId, deletedAt: null },
      select: { kind: true, functionSelector: true, eventSignature: true }
    });
    const seen = new Set(existing.map((item) => `${item.kind}:${item.functionSelector ?? ""}:${item.eventSignature ?? ""}`));
    const created = [];
    for (const rule of rules) {
      const key = `${rule.kind}:${rule.functionSelector ?? ""}:${rule.eventSignature ?? ""}`;
      if (seen.has(key)) continue;
      created.push(await prisma.monitorRule.create({
        data: {
          organizationId: rule.organizationId,
          projectId: rule.projectId,
          targetId,
          kind: rule.kind,
          severity: rule.severity,
          name: rule.name,
          eventSignature: rule.eventSignature ?? null,
          functionSelector: rule.functionSelector ?? null,
          threshold: rule.threshold ?? null,
          config: rule.config ? toJsonValue(rule.config) : undefined
        } as Prisma.MonitorRuleUncheckedCreateInput
      }));
    }
    return created;
  }

  updateTarget(targetId: string, organizationId: string, input: {
    status?: MonitorStatus | undefined;
    kind?: MonitorTargetKind | undefined;
    displayName?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.monitorTarget.updateMany({
      where: { id: targetId, organizationId, deletedAt: null },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }

  async getTarget(targetId: string, organizationId: string) {
    return prisma.monitorTarget.findFirst({
      where: { id: targetId, organizationId, deletedAt: null },
      include: targetInclude()
    });
  }

  deleteTarget(targetId: string, organizationId: string) {
    return prisma.monitorTarget.updateMany({
      where: { id: targetId, organizationId, deletedAt: null },
      data: { status: "DISABLED", deletedAt: new Date() }
    });
  }

  activeTargetsForProject(projectId: string, organizationId: string) {
    return prisma.monitorTarget.findMany({
      where: { projectId, organizationId, deletedAt: null, status: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: targetInclude()
    });
  }

  createRun(input: {
    organizationId: string;
    projectId: string;
    targetId?: string | null | undefined;
    scanId?: string | null | undefined;
    chainId?: number | null | undefined;
    status: MonitorEventStatus;
    providerName?: string | null | undefined;
    fromBlock?: bigint | null | undefined;
    toBlock?: bigint | null | undefined;
    latestBlock?: bigint | null | undefined;
    startedAt: Date;
    errorCategory?: string | null | undefined;
    error?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.monitorRun.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetId: input.targetId ?? null,
        scanId: input.scanId ?? null,
        chainId: input.chainId ?? null,
        status: input.status,
        providerName: input.providerName ?? null,
        fromBlock: input.fromBlock ?? null,
        toBlock: input.toBlock ?? null,
        latestBlock: input.latestBlock ?? null,
        startedAt: input.startedAt,
        errorCategory: input.errorCategory ?? null,
        error: redactMonitoringText(input.error) ?? null,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.MonitorRunUncheckedCreateInput
    });
  }

  completeRun(runId: string, input: {
    status: MonitorEventStatus;
    eventCount: number;
    transactionCount: number;
    alertCount: number;
    latestBlock?: bigint | null | undefined;
    errorCategory?: string | null | undefined;
    error?: string | null | undefined;
    startedAt: Date;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.monitorRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        eventCount: input.eventCount,
        transactionCount: input.transactionCount,
        alertCount: input.alertCount,
        latestBlock: input.latestBlock ?? undefined,
        errorCategory: input.errorCategory ?? null,
        error: redactMonitoringText(input.error) ?? null,
        finishedAt: new Date(),
        durationMs: Math.max(0, Date.now() - input.startedAt.getTime()),
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.MonitorRunUncheckedUpdateInput,
      include: monitorRunInclude()
    });
  }

  cursor(projectId: string, chainId: number, targetId: string | null) {
    return prisma.monitorCursor.findFirst({
      where: { projectId, chainId, targetId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async upsertCursor(input: {
    organizationId: string;
    projectId: string;
    targetId?: string | null | undefined;
    chainId: number;
    providerName?: string | null | undefined;
    lastProcessedBlock?: bigint | null | undefined;
    lastProcessedBlockHash?: string | null | undefined;
    lastFinalizedBlock?: bigint | null | undefined;
    status: MonitorEventStatus;
    errorCategory?: string | null | undefined;
    error?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    const existing = await prisma.monitorCursor.findFirst({
      where: { projectId: input.projectId, chainId: input.chainId, targetId: input.targetId ?? null },
      select: { id: true }
    });
    if (!existing) {
      return prisma.monitorCursor.create({
        data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetId: input.targetId ?? null,
        chainId: input.chainId,
        providerName: input.providerName ?? null,
        lastProcessedBlock: input.lastProcessedBlock ?? null,
        lastProcessedBlockHash: input.lastProcessedBlockHash ?? null,
        lastFinalizedBlock: input.lastFinalizedBlock ?? null,
        status: input.status,
        errorCategory: input.errorCategory ?? null,
        error: redactMonitoringText(input.error) ?? null,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
        } as Prisma.MonitorCursorUncheckedCreateInput
      });
    }
    return prisma.monitorCursor.update({
      where: { id: existing.id },
      data: {
        providerName: input.providerName ?? undefined,
        lastProcessedBlock: input.lastProcessedBlock ?? undefined,
        lastProcessedBlockHash: input.lastProcessedBlockHash ?? undefined,
        lastFinalizedBlock: input.lastFinalizedBlock ?? undefined,
        status: input.status,
        errorCategory: input.errorCategory ?? null,
        error: redactMonitoringText(input.error) ?? null,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.MonitorCursorUncheckedUpdateInput
    });
  }

  upsertTransaction(input: PersistTransactionInput) {
    return prisma.onchainTransaction.upsert({
      where: { chainId_hash: { chainId: input.chainId, hash: input.hash } },
      create: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetId: input.targetId,
        monitorRunId: input.monitorRunId,
        scanId: input.scanId ?? null,
        chainId: input.chainId,
        hash: input.hash,
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        fromAddress: input.fromAddress ?? null,
        toAddress: input.toAddress ?? null,
        inputSelector: input.inputSelector ?? null,
        input: input.input ?? null,
        value: input.value ?? null,
        providerName: input.providerName ?? null,
        observedAt: input.observedAt
      },
      update: {
        targetId: input.targetId,
        monitorRunId: input.monitorRunId,
        scanId: input.scanId ?? undefined,
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        fromAddress: input.fromAddress ?? undefined,
        toAddress: input.toAddress ?? undefined,
        inputSelector: input.inputSelector ?? undefined,
        input: input.input ?? undefined,
        value: input.value ?? undefined,
        providerName: input.providerName ?? undefined,
        observedAt: input.observedAt
      } as Prisma.OnchainTransactionUncheckedUpdateInput
    });
  }

  upsertEvent(input: PersistEventInput) {
    return prisma.onchainEvent.upsert({
      where: {
        chainId_transactionHash_logIndex: {
          chainId: input.chainId,
          transactionHash: input.transactionHash,
          logIndex: input.logIndex
        }
      },
      create: eventData(input),
      update: {
        targetId: input.targetId,
        monitorRunId: input.monitorRunId,
        transactionId: input.transactionId ?? undefined,
        scanId: input.scanId ?? undefined,
        blockNumber: input.blockNumber,
        blockHash: input.blockHash,
        eventSignature: input.eventSignature ?? null,
        eventName: input.eventName ?? null,
        topics: input.topics,
        data: input.data,
        decodedData: input.decodedData ? toJsonValue(input.decodedData) : undefined,
        decodeStatus: input.decodeStatus,
        rawArtifactPath: input.rawArtifactPath ?? null,
        rawArtifactChecksumSha256: input.rawArtifactChecksumSha256 ?? null,
        status: input.status ?? "OBSERVED",
        providerName: input.providerName ?? undefined,
        observedAt: input.observedAt,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.OnchainEventUncheckedUpdateInput
    });
  }

  async createAlert(candidate: AlertCandidate, organizationId: string, projectId: string, monitorRunId: string | null) {
    if (candidate.evidence.length === 0) return null;
    const existing = await prisma.monitorAlert.findUnique({
      where: { idempotencyKey: candidate.idempotencyKey },
      include: alertInclude()
    });
    if (existing) return existing;

    return prisma.$transaction(async (tx) => {
      const alert = await tx.monitorAlert.create({
        data: {
          organizationId,
          projectId,
          targetId: candidate.targetId,
          monitorRuleId: candidate.ruleId ?? null,
          monitorRunId,
          scanId: candidate.scanId ?? null,
          chainId: candidate.chainId,
          kind: candidate.kind,
          severity: candidate.severity,
          status: "OPEN",
          title: candidate.title,
          summary: candidate.summary,
          idempotencyKey: candidate.idempotencyKey,
          targetAddress: candidate.targetAddress,
          transactionHash: candidate.transactionHash ?? null,
          blockNumber: candidate.blockNumber ?? null,
          logIndex: candidate.logIndex ?? null,
          providerName: candidate.providerName ?? null,
          observedAt: candidate.observedAt,
          metadata: candidate.metadata ? toJsonValue(candidate.metadata) : undefined
        } as Prisma.MonitorAlertUncheckedCreateInput
      });
      await tx.alertEvidence.createMany({
        data: candidate.evidence.map((evidence) => ({
          alertId: alert.id,
          organizationId,
          projectId,
          scanId: candidate.scanId ?? null,
          eventId: evidence.eventId ?? null,
          transactionId: evidence.transactionId ?? null,
          ruleKind: evidence.ruleKind,
          targetAddress: evidence.targetAddress,
          chainId: evidence.chainId,
          transactionHash: evidence.transactionHash,
          blockNumber: evidence.blockNumber,
          logIndex: evidence.logIndex ?? null,
          txInputSelector: evidence.txInputSelector ?? null,
          providerName: evidence.providerName ?? null,
          decodedData: evidence.decodedData ? toJsonValue(evidence.decodedData) : undefined,
          rawData: evidence.rawData ? toJsonValue(evidence.rawData) : undefined,
          rawArtifactPath: evidence.rawArtifactPath ?? null,
          rawArtifactChecksumSha256: evidence.rawArtifactChecksumSha256 ?? null,
          observedAt: evidence.observedAt
        })) as Prisma.AlertEvidenceCreateManyInput[]
      });
      await tx.alertStatusEvent.create({
        data: {
          alertId: alert.id,
          organizationId,
          projectId,
          previousStatus: null,
          newStatus: "OPEN",
          reason: "Alert opened from persisted on-chain evidence."
        }
      });
      return tx.monitorAlert.findUniqueOrThrow({ where: { id: alert.id }, include: alertInclude() });
    });
  }

  listAlerts(projectId: string, organizationId: string, input: { status?: AlertStatus | undefined; limit: number }) {
    return prisma.monitorAlert.findMany({
      where: { projectId, organizationId, ...(input.status ? { status: input.status } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
      include: alertInclude()
    });
  }

  getAlert(alertId: string, organizationId: string) {
    return prisma.monitorAlert.findFirst({
      where: { id: alertId, organizationId },
      include: alertInclude()
    });
  }

  async updateAlertStatus(alertId: string, organizationId: string, status: AlertStatus, actorUserId?: string, reason?: string) {
    const alert = await this.getAlert(alertId, organizationId);
    if (!alert) return null;
    return prisma.$transaction(async (tx) => {
      await tx.monitorAlert.update({
        where: { id: alert.id },
        data: {
          status,
          resolvedAt: status === "RESOLVED" ? new Date() : undefined,
          dismissedAt: status === "DISMISSED" ? new Date() : undefined
        } as Prisma.MonitorAlertUncheckedUpdateInput
      });
      await tx.alertStatusEvent.create({
        data: {
          alertId: alert.id,
          organizationId,
          projectId: alert.projectId,
          actorUserId: actorUserId ?? null,
          previousStatus: alert.status,
          newStatus: status,
          reason: reason ?? null
        }
      });
      return tx.monitorAlert.findUniqueOrThrow({ where: { id: alert.id }, include: alertInclude() });
    });
  }

  async addComment(alertId: string, organizationId: string, actorUserId: string | undefined, body: string) {
    const alert = await this.getAlert(alertId, organizationId);
    if (!alert) return null;
    return prisma.alertComment.create({
      data: {
        alertId: alert.id,
        organizationId,
        projectId: alert.projectId,
        actorUserId: actorUserId ?? null,
        body
      }
    });
  }

  listWebhooks(projectId: string, organizationId: string) {
    return prisma.projectWebhook.findMany({
      where: { projectId, organizationId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: webhookPublicSelect()
    });
  }

  activeWebhooks(projectId: string, organizationId: string) {
    return prisma.projectWebhook.findMany({
      where: { projectId, organizationId, deletedAt: null, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });
  }

  createWebhook(input: {
    organizationId: string;
    projectId: string;
    name?: string | null | undefined;
    url: string;
    redactedUrl: string;
    signingSecret: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.projectWebhook.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        name: input.name ?? null,
        url: input.url,
        redactedUrl: input.redactedUrl,
        urlSha256: sha256(input.url),
        signingSecret: input.signingSecret,
        signingSecretHash: sha256(input.signingSecret),
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.ProjectWebhookUncheckedCreateInput,
      select: webhookPublicSelect()
    });
  }

  deleteWebhook(projectId: string, webhookId: string, organizationId: string) {
    return prisma.projectWebhook.updateMany({
      where: { id: webhookId, projectId, organizationId, deletedAt: null },
      data: { status: "DISABLED" as AccessStatus, deletedAt: new Date() }
    });
  }

  createDelivery(input: {
    alertId: string;
    webhookId: string;
    organizationId: string;
    projectId: string;
    status: string;
    attempts: number;
    payloadChecksumSha256: string;
    responseStatus?: number | null | undefined;
    errorCategory?: string | null | undefined;
    error?: string | null | undefined;
    deliveredAt?: Date | null | undefined;
    nextAttemptAt?: Date | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.alertWebhookDelivery.create({
      data: {
        alertId: input.alertId,
        webhookId: input.webhookId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: input.status,
        attempts: input.attempts,
        payloadChecksumSha256: input.payloadChecksumSha256,
        responseStatus: input.responseStatus ?? null,
        errorCategory: input.errorCategory ?? null,
        error: redactMonitoringText(input.error) ?? null,
        deliveredAt: input.deliveredAt ?? null,
        nextAttemptAt: input.nextAttemptAt ?? null,
        metadata: input.metadata ? toJsonValue(input.metadata) : undefined
      } as Prisma.AlertWebhookDeliveryUncheckedCreateInput
    });
  }

  touchWebhook(webhookId: string) {
    return prisma.projectWebhook.update({
      where: { id: webhookId },
      data: { lastDeliveredAt: new Date() }
    });
  }

  latestProjectRun(projectId: string, organizationId: string) {
    return prisma.monitorRun.findFirst({
      where: { projectId, organizationId },
      orderBy: { createdAt: "desc" },
      include: monitorRunInclude()
    });
  }
}

export function targetInclude() {
  return {
    rules: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    cursors: { orderBy: { updatedAt: "desc" }, take: 1 },
    runs: { orderBy: { createdAt: "desc" }, take: 3 },
    alerts: { orderBy: { createdAt: "desc" }, take: 5, include: { evidence: { orderBy: { createdAt: "asc" }, take: 5 } } }
  } satisfies Prisma.MonitorTargetInclude;
}

export function monitorRunInclude() {
  return {
    events: { orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }], take: 20 },
    transactions: { orderBy: { blockNumber: "desc" }, take: 20 },
    alerts: { orderBy: { createdAt: "desc" }, take: 20, include: { evidence: { orderBy: { createdAt: "asc" } } } }
  } satisfies Prisma.MonitorRunInclude;
}

export function alertInclude() {
  return {
    target: true,
    monitorRule: true,
    evidence: { orderBy: { createdAt: "asc" } },
    comments: { orderBy: { createdAt: "asc" } },
    statusEvents: { orderBy: { createdAt: "asc" } },
    webhookDeliveries: { orderBy: { createdAt: "desc" }, take: 10 }
  } satisfies Prisma.MonitorAlertInclude;
}

export function toRuleConfig(rule: {
  id: string;
  kind: MonitorRuleKind;
  severity: AlertSeverity;
  eventSignature: string | null;
  functionSelector: string | null;
  threshold: string | null;
  config: Prisma.JsonValue | null;
}): MonitorRuleConfig {
  return {
    id: rule.id,
    kind: rule.kind,
    severity: rule.severity,
    eventSignature: rule.eventSignature,
    functionSelector: rule.functionSelector,
    threshold: rule.threshold,
    config: isRecord(rule.config) ? rule.config : null
  };
}

function eventData(input: PersistEventInput): Prisma.OnchainEventCreateInput {
  return {
    organization: { connect: { id: input.organizationId } },
    project: { connect: { id: input.projectId } },
    target: { connect: { id: input.targetId } },
    monitorRun: { connect: { id: input.monitorRunId } },
    ...(input.transactionId ? { transaction: { connect: { id: input.transactionId } } } : {}),
    ...(input.scanId ? { scan: { connect: { id: input.scanId } } } : {}),
    chainId: input.chainId,
    address: input.address,
    normalizedAddress: input.normalizedAddress,
    blockNumber: input.blockNumber,
    blockHash: input.blockHash,
    transactionHash: input.transactionHash,
    logIndex: input.logIndex,
    eventSignature: input.eventSignature ?? null,
    eventName: input.eventName ?? null,
    topics: input.topics,
    data: input.data,
    decodedData: input.decodedData ? toJsonValue(input.decodedData) : undefined,
    decodeStatus: input.decodeStatus,
    rawArtifactPath: input.rawArtifactPath ?? null,
    rawArtifactChecksumSha256: input.rawArtifactChecksumSha256 ?? null,
    status: input.status ?? "OBSERVED",
    providerName: input.providerName ?? null,
    observedAt: input.observedAt,
    metadata: input.metadata ? toJsonValue(input.metadata) : undefined
  } as Prisma.OnchainEventCreateInput;
}

function webhookPublicSelect() {
  return {
    id: true,
    organizationId: true,
    projectId: true,
    name: true,
    redactedUrl: true,
    urlSha256: true,
    signingSecretHash: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    lastDeliveredAt: true,
    metadata: true
  } satisfies Prisma.ProjectWebhookSelect;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))) as Prisma.InputJsonValue;
}
