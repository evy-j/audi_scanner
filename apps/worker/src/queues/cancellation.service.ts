import { UnrecoverableError } from "bullmq";
import type { Redis } from "ioredis";
import { CancelledScanError } from "../common/errors.js";
import { buildRedisKey } from "../redis/redis-connection.js";

const DEFAULT_CANCELLATION_TTL_SECONDS = 24 * 60 * 60;

export interface CancellationRecord {
  scanId: string;
  reason: string;
  requestedBy?: string | undefined;
  requestedAt: string;
}

export class CancellationService {
  constructor(private readonly redis: Redis) {}

  async requestCancellation(record: Omit<CancellationRecord, "requestedAt">): Promise<void> {
    const payload: CancellationRecord = {
      ...record,
      requestedAt: new Date().toISOString()
    };

    await this.redis.set(
      this.getCancellationKey(record.scanId),
      JSON.stringify(payload),
      "EX",
      DEFAULT_CANCELLATION_TTL_SECONDS
    );
  }

  async clearCancellation(scanId: string): Promise<void> {
    await this.redis.del(this.getCancellationKey(scanId));
  }

  async getCancellation(scanId: string): Promise<CancellationRecord | null> {
    const value = await this.redis.get(this.getCancellationKey(scanId));
    if (!value) {
      return null;
    }

    return JSON.parse(value) as CancellationRecord;
  }

  async assertNotCancelled(scanId: string): Promise<void> {
    const cancellation = await this.getCancellation(scanId);
    if (cancellation) {
      throw new UnrecoverableError(new CancelledScanError(scanId).message);
    }
  }

  private getCancellationKey(scanId: string): string {
    return buildRedisKey("scan", scanId, "cancel");
  }
}
