import { Redis, type RedisOptions } from "ioredis";
import { env, redactConfigValue } from "../../config/environment.js";
import { logger } from "../../common/logging/logger.js";

export type ApiRedisConnectionRole = "api" | "queue" | "pubsub" | "health";

type StoredValue = {
  value: string;
  expiresAt: number | null;
};

type RedisProbeOk = {
  ok: true;
  mode: "redis" | "memory" | "disabled";
  target?: string | undefined;
  latencyMs?: number | undefined;
};

type RedisProbeFailed = {
  ok: false;
  mode: "redis" | "memory" | "disabled";
  target?: string | undefined;
  reason: string;
  code?: string | undefined;
};

export type RedisProbeResult = RedisProbeOk | RedisProbeFailed;

const memoryValues = new Map<string, StoredValue>();
const memoryHashes = new Map<string, Record<string, string>>();
const memoryLists = new Map<string, string[]>();

export function createRedisConnection(role: ApiRedisConnectionRole): Redis {
  if (!shouldUseExternalRedis()) {
    logger.warn(
      { role, rateLimitStore: env.RATE_LIMIT_STORE, queueBackend: env.QUEUE_BACKEND, redisRequired: env.REDIS_REQUIRED },
      "using in-process memory redis compatibility store; Redis-backed BullMQ queues are disabled"
    );
    return createMemoryRedisCompatibility(role) as unknown as Redis;
  }

  const connection = new Redis(env.REDIS_URL, buildRedisConnectionOptions(role));

  connection.on("connect", () => {
    logger.info({ role }, "redis connection established");
  });

  connection.on("error", (error: Error) => {
    logger.error({ role, err: error }, "redis connection error");
  });

  connection.on("close", () => {
    logger.warn({ role }, "redis connection closed");
  });

  return connection;
}

export function buildRedisConnectionOptions(role: ApiRedisConnectionRole, overrides: RedisOptions = {}): RedisOptions {
  const url = safeParseUrl(env.REDIS_URL);
  const useTls = env.REDIS_ENABLE_TLS || url?.protocol === "rediss:";
  const family = env.REDIS_CONNECT_FAMILY === 0 ? undefined : env.REDIS_CONNECT_FAMILY;

  return {
    connectionName: `audit-scanner:${role}:${process.pid}`,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: role === "health" || role === "api" ? true : false,
    enableOfflineQueue: role === "health" ? false : true,
    connectTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
    commandTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
    keepAlive: 10_000,
    ...(family ? { family } : {}),
    retryStrategy(times: number) {
      if (role === "health") return null;
      return Math.min(Math.max(times, 1) * 750, 7_500);
    },
    reconnectOnError() {
      return role !== "health";
    },
    ...(useTls && url ? { tls: { servername: url.hostname } } : {}),
    ...overrides
  };
}

export const redis = createRedisConnection("api");

export function redisKey(...parts: Array<string | number>): string {
  return [env.REDIS_KEY_PREFIX, ...parts].join(":");
}

export function wantsExternalRedis(): boolean {
  if (env.QUEUE_BACKEND === "disabled") return false;
  if (env.QUEUE_BACKEND === "redis") return true;
  return env.REDIS_REQUIRED || env.RATE_LIMIT_STORE === "redis";
}

export function shouldUseExternalRedis(): boolean {
  return wantsExternalRedis() && isRedisTcpUrl();
}

export function isRedisTcpUrl(value = env.REDIS_URL): boolean {
  const url = safeParseUrl(value);
  return Boolean(url && ["redis:", "rediss:"].includes(url.protocol));
}

export function getRedisTargetSummary(value = env.REDIS_URL): string | undefined {
  const url = safeParseUrl(value);
  if (!url) return undefined;
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${url.hostname}${port}`;
}

export async function probeRedisConnection(): Promise<RedisProbeResult> {
  if (!wantsExternalRedis()) {
    return {
      ok: true,
      mode: env.QUEUE_BACKEND === "disabled" ? "disabled" : "memory"
    };
  }

  if (!isRedisTcpUrl()) {
    return {
      ok: false,
      mode: "redis",
      target: getRedisTargetSummary(),
      reason: "REDIS_URL must start with redis:// or rediss://. Upstash REST URLs that start with https:// are not compatible with BullMQ/ioredis queues. Copy the Redis/TLS URL, not the REST URL."
    };
  }

  const startedAt = Date.now();
  const health = new Redis(env.REDIS_URL, buildRedisConnectionOptions("health"));

  try {
    await withTimeout(health.connect(), env.REDIS_HEALTH_TIMEOUT_MS, "Redis connect timeout");
    const pong = await withTimeout(health.ping(), env.REDIS_HEALTH_TIMEOUT_MS, "Redis ping timeout");
    if (pong !== "PONG") {
      return {
        ok: false,
        mode: "redis",
        target: getRedisTargetSummary(),
        reason: `Unexpected Redis ping response: ${String(pong)}`
      };
    }
    return {
      ok: true,
      mode: "redis",
      target: getRedisTargetSummary(),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    const summary = summarizeRedisError(error);
    return {
      ok: false,
      mode: "redis",
      target: getRedisTargetSummary(),
      reason: summary.message,
      code: summary.code
    };
  } finally {
    health.disconnect();
  }
}

function summarizeRedisError(error: unknown): { message: string; code?: string | undefined } {
  const value = error as { message?: unknown; code?: unknown; syscall?: unknown };
  const message = typeof value?.message === "string" ? redactConfigValue(value.message) : "Redis readiness check failed";
  const code = typeof value?.code === "string" ? value.code : undefined;
  const syscall = typeof value?.syscall === "string" ? ` (${value.syscall})` : "";
  return { message: `${message}${syscall}`, code };
}

function safeParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createMemoryRedisCompatibility(role: ApiRedisConnectionRole) {
  const api = {
    on(_event: string, _listener: (...args: unknown[]) => void) {
      return api;
    },
    async quit() {
      return "OK";
    },
    async disconnect() {
      return undefined;
    },
    async ping() {
      return "PONG";
    },
    async incr(key: string) {
      const current = Number.parseInt(getString(key) ?? "0", 10) || 0;
      const next = current + 1;
      setString(key, String(next), null);
      return next;
    },
    async decr(key: string) {
      const current = Number.parseInt(getString(key) ?? "0", 10) || 0;
      const next = current - 1;
      setString(key, String(next), null);
      return next;
    },
    async pexpire(key: string, ttlMs: number) {
      const existing = memoryValues.get(key);
      if (!existing || isExpired(existing)) return 0;
      existing.expiresAt = Date.now() + ttlMs;
      return 1;
    },
    async pttl(key: string) {
      const existing = memoryValues.get(key);
      if (!existing) return -2;
      if (existing.expiresAt === null) return -1;
      const ttl = existing.expiresAt - Date.now();
      if (ttl <= 0) {
        memoryValues.delete(key);
        return -2;
      }
      return ttl;
    },
    async del(...keys: string[]) {
      let deleted = 0;
      for (const key of keys) {
        if (memoryValues.delete(key)) deleted += 1;
        if (memoryHashes.delete(key)) deleted += 1;
        if (memoryLists.delete(key)) deleted += 1;
      }
      return deleted;
    },
    async set(key: string, value: string, mode?: string, ttlSeconds?: number) {
      const expiresAt = mode?.toUpperCase() === "EX" && typeof ttlSeconds === "number"
        ? Date.now() + ttlSeconds * 1000
        : null;
      setString(key, value, expiresAt);
      return "OK";
    },
    async get(key: string) {
      return getString(key);
    },
    async call(command: string, ...args: string[]) {
      if (command.toUpperCase() === "GETDEL") {
        const key = args[0];
        const value = key ? getString(key) : null;
        if (key) memoryValues.delete(key);
        return value;
      }
      throw new Error(`Memory redis compatibility store does not implement ${command} for ${role}`);
    },
    async hset(key: string, values: Record<string, unknown>) {
      const current = memoryHashes.get(key) ?? {};
      for (const [field, value] of Object.entries(values)) {
        current[field] = String(value);
      }
      memoryHashes.set(key, current);
      return Object.keys(values).length;
    },
    async hgetall(key: string) {
      return memoryHashes.get(key) ?? {};
    },
    async rpush(key: string, ...values: string[]) {
      const current = memoryLists.get(key) ?? [];
      current.push(...values);
      memoryLists.set(key, current);
      return current.length;
    },
    async ltrim(key: string, start: number, stop: number) {
      const current = memoryLists.get(key) ?? [];
      const normalizedStart = start < 0 ? Math.max(current.length + start, 0) : start;
      const normalizedStop = stop < 0 ? current.length + stop : stop;
      memoryLists.set(key, current.slice(normalizedStart, normalizedStop + 1));
      return "OK";
    },
    async lrange(key: string, start: number, stop: number) {
      const current = memoryLists.get(key) ?? [];
      const normalizedStart = start < 0 ? Math.max(current.length + start, 0) : start;
      const normalizedStop = stop < 0 ? current.length + stop : stop;
      return current.slice(normalizedStart, normalizedStop + 1);
    },
    async publish(_channel: string, _message: string) {
      return 0;
    },
    async subscribe(_channel: string) {
      return 0;
    },
    async unsubscribe(_channel: string) {
      return 0;
    }
  };
  return api;
}

function getString(key: string): string | null {
  const existing = memoryValues.get(key);
  if (!existing) return null;
  if (isExpired(existing)) {
    memoryValues.delete(key);
    return null;
  }
  return existing.value;
}

function setString(key: string, value: string, expiresAt: number | null) {
  memoryValues.set(key, { value, expiresAt });
}

function isExpired(value: StoredValue): boolean {
  return value.expiresAt !== null && value.expiresAt <= Date.now();
}
