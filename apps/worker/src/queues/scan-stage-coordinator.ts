import type { Redis } from "ioredis";
import type { AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";
import { buildRedisKey } from "../redis/redis-connection.js";

const STAGE_TTL_SECONDS = 24 * 60 * 60;

export interface AnalyzerCompletionState {
  complete: boolean;
  completedCount: number;
  failedCount: number;
  expectedCount: number;
  artifactKeys: string[];
  failures: Record<string, string>;
}

export class ScanStageCoordinator {
  constructor(private readonly redis: Redis) {}

  async initializeAnalyzerStage(scanId: string, analyzers: AnalyzerName[]): Promise<void> {
    const keys = this.getAnalyzerKeys(scanId);
    const pipeline = this.redis.pipeline();

    pipeline.del(keys.expected, keys.completed, keys.failed, keys.artifacts);
    pipeline.set(keys.expected, analyzers.length.toString(), "EX", STAGE_TTL_SECONDS);

    for (const key of Object.values(keys)) {
      pipeline.expire(key, STAGE_TTL_SECONDS);
    }

    await pipeline.exec();
  }

  async recordAnalyzerCompletion(
    scanId: string,
    analyzer: AnalyzerName,
    artifactKey: string
  ): Promise<AnalyzerCompletionState> {
    const keys = this.getAnalyzerKeys(scanId);

    await this.redis
      .pipeline()
      .sadd(keys.completed, analyzer)
      .hset(keys.artifacts, analyzer, artifactKey)
      .expire(keys.completed, STAGE_TTL_SECONDS)
      .expire(keys.artifacts, STAGE_TTL_SECONDS)
      .exec();

    return this.getAnalyzerCompletionState(scanId);
  }

  async recordAnalyzerFailure(
    scanId: string,
    analyzer: AnalyzerName,
    reason: string
  ): Promise<AnalyzerCompletionState> {
    const keys = this.getAnalyzerKeys(scanId);

    await this.redis
      .pipeline()
      .hset(keys.failed, analyzer, reason)
      .expire(keys.failed, STAGE_TTL_SECONDS)
      .exec();

    return this.getAnalyzerCompletionState(scanId);
  }

  async getAnalyzerCompletionState(scanId: string): Promise<AnalyzerCompletionState> {
    const keys = this.getAnalyzerKeys(scanId);
    const [expectedValue, completed, failed, artifactMap] = await Promise.all([
      this.redis.get(keys.expected),
      this.redis.smembers(keys.completed),
      this.redis.hgetall(keys.failed),
      this.redis.hgetall(keys.artifacts)
    ]);

    const expectedCount = Number(expectedValue ?? 0);
    const failedCount = Object.keys(failed).length;
    const artifactKeys = completed
      .map((analyzer: string) => artifactMap[analyzer])
      .filter((artifactKey): artifactKey is string => Boolean(artifactKey));

    return {
      complete: expectedCount > 0 && completed.length + failedCount >= expectedCount,
      completedCount: completed.length,
      failedCount,
      expectedCount,
      artifactKeys,
      failures: failed
    };
  }

  private getAnalyzerKeys(scanId: string) {
    return {
      expected: buildRedisKey("scan", scanId, "analyzers", "expected"),
      completed: buildRedisKey("scan", scanId, "analyzers", "completed"),
      failed: buildRedisKey("scan", scanId, "analyzers", "failed"),
      artifacts: buildRedisKey("scan", scanId, "analyzers", "artifacts")
    };
  }
}
