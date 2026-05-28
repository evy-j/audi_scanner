import type { Redis } from "ioredis";
import { prisma } from "@audit-scanner/database";
import type { Prisma, ScanStatus } from "@prisma/client";
import type {
  ScanLifecycleStatus,
  ScanProgressEvent
} from "@audit-scanner/shared/queues/scan-events";
import { buildRedisKey } from "../redis/redis-connection.js";

export interface ScanLifecycleTransition {
  scanId: string;
  organizationId: string;
  status: ScanLifecycleStatus;
  progress: number;
  message: string;
  traceId?: string;
  correlationId?: string | undefined;
  jobId?: string | undefined;
  queueName?: string | undefined;
  workerId?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface ScanLifecycleStore {
  transition(transition: ScanLifecycleTransition): Promise<void>;
  appendTimelineEvent(event: ScanProgressEvent): Promise<void>;
}

export class PersistentScanLifecycleStore implements ScanLifecycleStore {
  private readonly redisStore: RedisScanLifecycleStore;

  constructor(redis: Redis) {
    this.redisStore = new RedisScanLifecycleStore(redis);
  }

  async transition(transition: ScanLifecycleTransition): Promise<void> {
    const now = new Date();
    const status = toPrismaScanStatus(transition.status);

    await prisma.$transaction(async (tx) => {
      const sequence = (await tx.scanEvent.count({ where: { scanId: transition.scanId } })) + 1;

      await tx.scan.update({
        where: { id: transition.scanId },
        data: buildScanUpdate(status, transition, now)
      });

      await tx.scanEvent.create({
        data: {
          scanId: transition.scanId,
          organizationId: transition.organizationId,
          sequence,
          type: eventTypeForStatus(status),
          status,
          progress: transition.progress,
          message: transition.message,
          jobId: transition.jobId ?? null,
          queueName: transition.queueName ?? null,
          workerId: transition.workerId ?? null,
          traceId: transition.traceId ?? null,
          correlationId: transition.correlationId ?? null,
          ...(transition.metadata ? { data: toJsonObject(transition.metadata) } : {}),
          emittedAt: now
        }
      });
    });

    await this.redisStore.transition(transition);
  }

  appendTimelineEvent(event: ScanProgressEvent): Promise<void> {
    return this.redisStore.appendTimelineEvent(event);
  }
}

export class RedisScanLifecycleStore implements ScanLifecycleStore {
  constructor(private readonly redis: Redis) {}

  async transition(transition: ScanLifecycleTransition): Promise<void> {
    await this.redis.hset(this.getStateKey(transition.scanId), {
      organizationId: transition.organizationId,
      status: transition.status,
      progress: transition.progress.toString(),
      message: transition.message,
      updatedAt: new Date().toISOString(),
      ...(transition.traceId ? { traceId: transition.traceId } : {}),
      ...(transition.metadata ? { metadata: JSON.stringify(transition.metadata) } : {})
    });
  }

  async appendTimelineEvent(event: ScanProgressEvent): Promise<void> {
    await this.redis.rpush(this.getTimelineKey(event.scanId), JSON.stringify(event));
    await this.redis.ltrim(this.getTimelineKey(event.scanId), -500, -1);
  }

  private getStateKey(scanId: string): string {
    return buildRedisKey("scan", scanId, "state");
  }

  private getTimelineKey(scanId: string): string {
    return buildRedisKey("scan", scanId, "timeline");
  }
}

function buildScanUpdate(
  status: ScanStatus,
  transition: ScanLifecycleTransition,
  now: Date
): Prisma.ScanUpdateInput {
  const data: Prisma.ScanUpdateInput = {
    status,
    progress: transition.progress
  };

  if (status === "PREPARING") {
    data.startedAt = now;
  }

  if (status === "COMPLETED" || status === "PARTIAL" || status === "FAILED") {
    data.completedAt = now;
  }

  if (status === "CANCELED") {
    data.canceledAt = now;
  }

  if (status === "FAILED") {
    data.errorMessage = transition.message;
  }

  return data;
}

function toPrismaScanStatus(status: ScanLifecycleStatus): ScanStatus {
  return status === "PARTIAL_COMPLETED" ? "PARTIAL" : (status as ScanStatus);
}

function eventTypeForStatus(status: ScanStatus): string {
  switch (status) {
    case "QUEUED":
      return "scan.queued";
    case "PREPARING":
      return "scan.preparing";
    case "ANALYZING":
      return "scan.analyzing";
    case "NORMALIZING":
      return "findings.normalizing";
    case "SCORING":
      return "risk.scoring";
    case "REPORTING":
      return "report.generating";
    case "COMPLETED":
      return "scan.completed";
    case "PARTIAL":
      return "scan.partial";
    case "CANCELED":
      return "scan.canceled";
    case "FAILED":
      return "scan.failed";
    default:
      return `scan.${status.toLowerCase()}`;
  }
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}
