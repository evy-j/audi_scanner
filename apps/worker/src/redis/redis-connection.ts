import { Redis, type RedisOptions } from "ioredis";
import { env, redactConfigValue } from "../config/environment.js";
import { logger } from "../common/logger.js";

export type RedisConnectionRole = "queue" | "worker" | "events" | "pubsub" | "health";

export function createRedisConnection(role: RedisConnectionRole): Redis {
  const connection = new Redis(env.REDIS_URL, buildRedisConnectionOptions(role));

  connection.on("connect", () => {
    logger.info({ role }, "redis connection established");
  });

  connection.on("error", (error: Error) => {
    logger.error({ role, error }, "redis connection error");
  });

  connection.on("close", () => {
    logger.warn({ role }, "redis connection closed");
  });

  return connection;
}

export function buildRedisConnectionOptions(role: RedisConnectionRole, overrides: RedisOptions = {}): RedisOptions {
  const url = safeParseUrl(env.REDIS_URL);
  const useTls = env.REDIS_ENABLE_TLS || url?.protocol === "rediss:";
  const family = env.REDIS_CONNECT_FAMILY === 0 ? undefined : env.REDIS_CONNECT_FAMILY;

  return {
    connectionName: `audit-scanner:${role}:${process.pid}`,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: role === "health" ? true : false,
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

export async function assertRedisReadyForWorker(): Promise<void> {
  if (!env.WORKER_REDIS_PREFLIGHT) return;
  if (!isRedisTcpUrl(env.REDIS_URL)) {
    throw new Error("REDIS_URL must start with redis:// or rediss:// for the BullMQ worker. Upstash REST URLs that start with https:// are not compatible.");
  }

  const redis = new Redis(env.REDIS_URL, buildRedisConnectionOptions("health"));
  try {
    await withTimeout(redis.connect(), env.REDIS_HEALTH_TIMEOUT_MS, "Redis connect timeout");
    const response = await withTimeout(redis.ping(), env.REDIS_HEALTH_TIMEOUT_MS, "Redis ping timeout");
    if (response !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${String(response)}`);
    }
  } catch (error) {
    const value = error as { message?: unknown; code?: unknown; syscall?: unknown };
    const message = typeof value?.message === "string" ? redactConfigValue(value.message) : "Redis worker preflight failed";
    const code = typeof value?.code === "string" ? value.code : undefined;
    const syscall = typeof value?.syscall === "string" ? value.syscall : undefined;
    throw new Error([message, code ? `code=${code}` : undefined, syscall ? `syscall=${syscall}` : undefined].filter(Boolean).join(" "));
  } finally {
    redis.disconnect();
  }
}

export function buildRedisKey(...parts: Array<string | number>): string {
  return [env.REDIS_KEY_PREFIX, ...parts].join(":");
}

function isRedisTcpUrl(value: string): boolean {
  const url = safeParseUrl(value);
  return Boolean(url && ["redis:", "rediss:"].includes(url.protocol));
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
