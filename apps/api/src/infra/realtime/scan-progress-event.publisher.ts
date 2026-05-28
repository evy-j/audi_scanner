import {
  getScanEventChannel,
  type ScanEventType,
  type ScanLifecycleStatus,
  type ScanProgressEvent
} from "@audit-scanner/shared/queues/scan-events";
import { redis, redisKey } from "../queues/redis.js";

export interface PublishScanProgressEventInput {
  type: ScanEventType;
  scanId: string;
  organizationId: string;
  status: ScanLifecycleStatus;
  progress: number;
  message: string;
  traceId?: string | undefined;
  correlationId?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

export async function publishScanProgressEvent(
  input: PublishScanProgressEventInput
): Promise<ScanProgressEvent> {
  const sequence = await redis.incr(getSequenceKey(input.scanId));
  const event: ScanProgressEvent = {
    eventId: `${input.scanId}:${sequence}`,
    sequence,
    type: input.type,
    scanId: input.scanId,
    organizationId: input.organizationId,
    status: input.status,
    progress: input.progress,
    message: input.message,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    emittedAt: new Date().toISOString(),
    ...(input.data ? { data: input.data } : {})
  };

  const timelineKey = getTimelineKey(input.scanId);

  await Promise.all([
    redis.hset(getStateKey(input.scanId), {
      organizationId: event.organizationId,
      status: event.status,
      progress: event.progress.toString(),
      message: event.message,
      sequence: event.sequence.toString(),
      eventId: event.eventId,
      updatedAt: event.emittedAt,
      traceId: event.traceId ?? "",
      correlationId: event.correlationId ?? ""
    }),
    redis.rpush(timelineKey, JSON.stringify(event)),
    redis.publish(getScanEventChannel(input.scanId), JSON.stringify(event))
  ]);

  await redis.ltrim(timelineKey, -500, -1);

  return event;
}

function getSequenceKey(scanId: string): string {
  return redisKey("scan", scanId, "events", "sequence");
}

function getStateKey(scanId: string): string {
  return redisKey("scan", scanId, "state");
}

function getTimelineKey(scanId: string): string {
  return redisKey("scan", scanId, "timeline");
}
