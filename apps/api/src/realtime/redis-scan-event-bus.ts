import {
  getScanEventChannel,
  type ScanProgressEvent
} from "@audit-scanner/shared/queues/scan-events";
import { env } from "../config/environment.js";
import { logger } from "../common/logging/logger.js";
import { createRedisConnection, redis, redisKey } from "../infra/queues/redis.js";
import type { ScanRealtimeState } from "./realtime.types.js";

export type ScanEventHandler = (event: ScanProgressEvent) => void;

export class RedisScanEventBus {
  private readonly subscriber = createRedisConnection("pubsub");
  private readonly channelRefCounts = new Map<string, number>();

  constructor(private readonly onEvent: ScanEventHandler) {
    this.subscriber.on("message", (channel: string, rawMessage: string) => {
      const event = parseScanProgressEvent(rawMessage);
      if (!event) {
        logger.warn({ channel }, "invalid realtime scan event ignored");
        return;
      }

      this.onEvent(event);
    });
  }

  async subscribe(scanId: string): Promise<void> {
    const current = this.channelRefCounts.get(scanId) ?? 0;

    if (current === 0) {
      await this.subscriber.subscribe(getScanEventChannel(scanId));
    }

    this.channelRefCounts.set(scanId, current + 1);
  }

  async unsubscribe(scanId: string): Promise<void> {
    const current = this.channelRefCounts.get(scanId) ?? 0;
    if (current <= 1) {
      this.channelRefCounts.delete(scanId);
      await this.subscriber.unsubscribe(getScanEventChannel(scanId));
      return;
    }

    this.channelRefCounts.set(scanId, current - 1);
  }

  async getState(scanId: string): Promise<ScanRealtimeState | null> {
    const state = await redis.hgetall(getScanStateKey(scanId));
    if (Object.keys(state).length === 0) {
      return null;
    }

    return {
      scanId,
      organizationId: state.organizationId ?? "",
      status: state.status ?? "UNKNOWN",
      progress: Number.parseInt(state.progress ?? "0", 10),
      message: state.message ?? "",
      sequence: Number.parseInt(state.sequence ?? "0", 10),
      ...(state.eventId ? { eventId: state.eventId } : {}),
      ...(state.updatedAt ? { updatedAt: state.updatedAt } : {}),
      ...(state.workerId ? { workerId: state.workerId } : {}),
      ...(state.queueName ? { queueName: state.queueName } : {})
    };
  }

  async getTimelineSince(scanId: string, lastEventSequence: number): Promise<ScanProgressEvent[]> {
    const rawEvents = await redis.lrange(getScanTimelineKey(scanId), -env.REALTIME_REPLAY_MAX_EVENTS, -1);

    return rawEvents
      .map(parseScanProgressEvent)
      .filter((event): event is ScanProgressEvent => Boolean(event))
      .filter((event: ScanProgressEvent) => event.sequence > lastEventSequence)
      .sort((left: ScanProgressEvent, right: ScanProgressEvent) => left.sequence - right.sequence);
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
  }
}

function parseScanProgressEvent(value: string): ScanProgressEvent | null {
  try {
    const parsed = JSON.parse(value) as ScanProgressEvent;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.sequence !== "number" ||
      typeof parsed.scanId !== "string" ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.status !== "string" ||
      typeof parsed.progress !== "number" ||
      typeof parsed.message !== "string" ||
      typeof parsed.emittedAt !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getScanStateKey(scanId: string): string {
  return redisKey("scan", scanId, "state");
}

function getScanTimelineKey(scanId: string): string {
  return redisKey("scan", scanId, "timeline");
}
