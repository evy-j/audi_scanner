import { redis, redisKey } from "../../infra/queues/redis.js";

export interface FixedWindowRateLimitResult {
  totalHits: number;
  resetTime: Date;
  retryAfterMs: number;
  limited: boolean;
}

export class RedisFixedWindowRateLimiter {
  constructor(
    private readonly namespace: string,
    private readonly windowMs: number,
    private readonly limit: number
  ) {}

  async consume(key: string): Promise<FixedWindowRateLimitResult> {
    const rateLimitKey = this.getKey(key);
    const totalHits = await redis.incr(rateLimitKey);

    if (totalHits === 1) {
      await redis.pexpire(rateLimitKey, this.windowMs);
    }

    const ttlMs = await redis.pttl(rateLimitKey);
    const retryAfterMs = Math.max(ttlMs, 0);

    return {
      totalHits,
      resetTime: new Date(Date.now() + retryAfterMs),
      retryAfterMs,
      limited: totalHits > this.limit
    };
  }

  async decrement(key: string): Promise<void> {
    const rateLimitKey = this.getKey(key);
    const totalHits = await redis.decr(rateLimitKey);

    if (totalHits <= 0) {
      await redis.del(rateLimitKey);
    }
  }

  async resetKey(key: string): Promise<void> {
    await redis.del(this.getKey(key));
  }

  private getKey(key: string): string {
    return redisKey("rate-limit", this.namespace, Buffer.from(key).toString("base64url"));
  }
}
