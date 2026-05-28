import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import {
  getScanEventChannel,
  type ScanEventType,
  type ScanLifecycleStatus,
  type ScanProgressEvent
} from "@audit-scanner/shared/queues/scan-events";
import type { ScanQueueJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { buildRedisKey } from "../redis/redis-connection.js";

export class ProgressPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly workerId: string
  ) {}

  async publish(
    job: Job<ScanQueueJobData>,
    event: {
      type: ScanEventType;
      status: ScanLifecycleStatus;
      progress: number;
      message: string;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    const sequence = await this.redis.incr(getSequenceKey(job.data.scanId));
    const payload: ScanProgressEvent = {
      eventId: `${job.data.scanId}:${sequence}`,
      sequence,
      type: event.type,
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: event.status,
      progress: event.progress,
      message: event.message,
      queueName: job.queueName,
      workerId: this.workerId,
      emittedAt: new Date().toISOString(),
      ...(job.id ? { jobId: job.id } : {}),
      traceId: job.data.traceId,
      ...(job.data.correlationId ? { correlationId: job.data.correlationId } : {}),
      ...(event.data ? { data: event.data } : {})
    };

    await Promise.all([
      job.updateProgress(payload),
      this.persistState(payload),
      this.appendTimeline(payload),
      this.redis.publish(getScanEventChannel(job.data.scanId), JSON.stringify(payload))
    ]);
  }

  private async persistState(event: ScanProgressEvent): Promise<void> {
    await this.redis.hset(getStateKey(event.scanId), {
      organizationId: event.organizationId,
      status: event.status,
      progress: event.progress.toString(),
      message: event.message,
      sequence: event.sequence.toString(),
      eventId: event.eventId,
      updatedAt: event.emittedAt,
      workerId: event.workerId ?? "",
      queueName: event.queueName ?? "",
      traceId: event.traceId ?? "",
      correlationId: event.correlationId ?? ""
    });
  }

  private async appendTimeline(event: ScanProgressEvent): Promise<void> {
    const key = getTimelineKey(event.scanId);
    await this.redis.rpush(key, JSON.stringify(event));
    await this.redis.ltrim(key, -500, -1);
  }
}

function getSequenceKey(scanId: string): string {
  return buildRedisKey("scan", scanId, "events", "sequence");
}

function getStateKey(scanId: string): string {
  return buildRedisKey("scan", scanId, "state");
}

function getTimelineKey(scanId: string): string {
  return buildRedisKey("scan", scanId, "timeline");
}
