import type { Redis } from "ioredis";
import { env } from "../config/environment.js";
import { buildRedisKey } from "../redis/redis-connection.js";

const acquireLeaseScript = `
local key = KEYS[1]
local owner = ARGV[1]
local now = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local max = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
local count = redis.call('ZCARD', key)
if count >= max then
  return 0
end
redis.call('ZADD', key, now + ttl, owner)
redis.call('PEXPIRE', key, ttl)
return 1
`;

const renewLeaseScript = `
local key = KEYS[1]
local owner = ARGV[1]
local now = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local exists = redis.call('ZSCORE', key, owner)
if not exists then
  return 0
end
redis.call('ZADD', key, now + ttl, owner)
redis.call('PEXPIRE', key, ttl)
return 1
`;

export interface ConcurrencyLease {
  organizationId: string;
  owner: string;
  release: () => Promise<void>;
  renew: () => Promise<boolean>;
}

export class OrganizationConcurrencyLimiter {
  constructor(private readonly redis: Redis) {}

  async acquire(organizationId: string, owner: string): Promise<ConcurrencyLease | null> {
    const key = this.getLeaseKey(organizationId);
    const acquired = await this.redis.eval(
      acquireLeaseScript,
      1,
      key,
      owner,
      Date.now().toString(),
      env.ORG_CONCURRENCY_LEASE_MS.toString(),
      env.DEFAULT_ORG_CONCURRENCY.toString()
    );

    if (Number(acquired) !== 1) {
      return null;
    }

    return {
      organizationId,
      owner,
      release: async () => {
        await this.redis.zrem(key, owner);
      },
      renew: async () => {
        const renewed = await this.redis.eval(
          renewLeaseScript,
          1,
          key,
          owner,
          Date.now().toString(),
          env.ORG_CONCURRENCY_LEASE_MS.toString()
        );
        return Number(renewed) === 1;
      }
    };
  }

  private getLeaseKey(organizationId: string): string {
    return buildRedisKey("org", organizationId, "scan-concurrency");
  }
}
