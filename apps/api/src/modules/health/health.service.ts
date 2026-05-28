import { prisma } from "../../infra/prisma/prisma.js";
import { probeRedisConnection, type RedisProbeResult } from "../../infra/queues/redis.js";
import { env, redactConfigValue } from "../../config/environment.js";
import { versionMetadata } from "../../common/version/version-metadata.js";

type CheckStatus = "ok" | "failed" | "not_configured" | "degraded" | "disabled";

type ReadyInput = {
  checks: {
    database: CheckStatus;
    storage: CheckStatus;
    redis: CheckStatus;
    workerQueue: CheckStatus;
  };
};

export class HealthService {
  shallow() {
    return {
      status: "ok",
      service: "audit-scanner-api",
      api: "ok" as CheckStatus,
      storageDriver: env.STORAGE_DRIVER,
      aiConfigured: isAiConfigured(),
      version: versionMetadata(),
      timestamp: new Date().toISOString()
    };
  }

  async deep() {
    const [database, redisProbe] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      probeRedisConnection()
    ]);

    const databaseStatus: CheckStatus = database.status === "fulfilled" ? "ok" : "failed";
    const redisResult: RedisProbeResult = redisProbe.status === "fulfilled"
      ? redisProbe.value
      : {
          ok: false as const,
          mode: "redis" as const,
          reason: redisProbe.reason instanceof Error ? redisProbe.reason.message : "Redis probe failed"
        };
    const redisStatus: CheckStatus = redisResult.ok
      ? redisResult.mode === "redis" ? "ok" : redisResult.mode === "disabled" ? "disabled" : "degraded"
      : "failed";
    const workerQueueStatus: CheckStatus = workerQueueStatusFromRedis(redisStatus);
    const diagnostics = env.READINESS_DIAGNOSTICS || redisStatus === "failed"
      ? {
          database: database.status === "rejected" ? safeErrorSummary(database.reason) : undefined,
          redis: redisResult.ok ? undefined : {
            code: redisResult.code,
            message: redactConfigValue(redisResult.reason),
            target: redisResult.target,
            mode: redisResult.mode,
            hint: redisFailureHint(redisResult.reason)
          }
        }
      : undefined;

    const serviceOk = databaseStatus === "ok" && storageStatus() !== "failed";

    return {
      status: serviceOk && redisStatus === "ok" ? "ok" : serviceOk ? "degraded" : "failed",
      service: "audit-scanner-api",
      api: "ok" as CheckStatus,
      checks: {
        database: databaseStatus,
        redis: redisStatus,
        workerQueue: workerQueueStatus,
        storage: storageStatus(),
        ai: isAiConfigured() ? "ok" : "not_configured"
      },
      queue: {
        backend: queueBackendMode(),
        readinessStrict: isQueueStrict(),
        redisTarget: redisResult.target,
        redisLatencyMs: redisResult.ok ? redisResult.latencyMs : undefined,
        note: queueReadinessNote(redisStatus, workerQueueStatus)
      },
      ...(diagnostics ? { diagnostics } : {}),
      storageDriver: env.STORAGE_DRIVER,
      aiConfigured: isAiConfigured(),
      version: versionMetadata(),
      timestamp: new Date().toISOString()
    };
  }

  async ready() {
    const deep = await this.deep();
    const ready = isReady(deep);
    return {
      status: ready ? (deep.status === "degraded" ? "ready_degraded" : "ready") : "not_ready",
      service: deep.service,
      checks: deep.checks,
      queue: deep.queue,
      ...("diagnostics" in deep ? { diagnostics: deep.diagnostics } : {}),
      storageDriver: deep.storageDriver,
      aiConfigured: deep.aiConfigured,
      version: deep.version,
      timestamp: deep.timestamp
    };
  }

  version() {
    return {
      service: "audit-scanner-api",
      ...versionMetadata(),
      timestamp: new Date().toISOString()
    };
  }
}

export function isReadyForHttp(result: { status: string }): boolean {
  return result.status === "ready" || result.status === "ready_degraded";
}

function isReady(deep: ReadyInput): boolean {
  if (deep.checks.database !== "ok") return false;
  if (deep.checks.storage === "failed") return false;
  if (isQueueStrict()) {
    return deep.checks.redis === "ok" && deep.checks.workerQueue === "ok";
  }
  return true;
}

function isQueueStrict(): boolean {
  return env.QUEUE_READY_STRICT || env.SINGLE_SERVICE_WORKER_STRICT;
}

function queueBackendMode(): "redis" | "memory" | "disabled" {
  if (env.QUEUE_BACKEND === "disabled") return "disabled";
  if (env.QUEUE_BACKEND === "redis") return "redis";
  if (env.REDIS_REQUIRED) return "redis";
  return "memory";
}

function workerQueueStatusFromRedis(redisStatus: CheckStatus): CheckStatus {
  if (queueBackendMode() === "disabled") return "disabled";
  if (queueBackendMode() === "memory") return "degraded";
  return redisStatus === "ok" ? "ok" : "failed";
}

function queueReadinessNote(redisStatus: CheckStatus, workerQueueStatus: CheckStatus): string {
  if (redisStatus === "ok" && workerQueueStatus === "ok") {
    return "Redis-backed worker queue is reachable.";
  }
  if (isQueueStrict()) {
    return "Queue strict mode is enabled, so Redis/workerQueue must be ok before this service is ready.";
  }
  return "API is ready in degraded mode. Queue/worker is not marked ok until Redis is reachable; this is real-only and not a fake queue success.";
}

function redisFailureHint(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes("https://") || normalized.includes("rest url") || normalized.includes("redis_url must start")) {
    return "Use the Upstash Redis/TLS URL, not the REST URL. It should look like rediss://default:***@host:6379.";
  }
  if (normalized.includes("econnreset") || normalized.includes("epipe")) {
    return "Redis TCP connection is being reset. This is commonly caused by wrong endpoint type, connection limits, TLS/proxy issues, or a Redis provider tier that cannot handle the worker connection count.";
  }
  if (normalized.includes("timeout")) {
    return "Render could not complete Redis connect/ping in time. Check REDIS_URL, region, provider status, and REDIS_CONNECT_FAMILY=4.";
  }
  return "Check REDIS_URL format, provider status, and whether the Redis plan supports BullMQ/ioredis TCP connections.";
}

function storageStatus(): CheckStatus {
  if (env.STORAGE_DRIVER === "local") return "ok";
  return env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? "ok" : "not_configured";
}

function isAiConfigured(): boolean {
  if (!env.AI_ENABLED || env.AI_PROVIDER === "DISABLED") return false;
  if (!env.AI_MODEL) return false;
  if (env.AI_PROVIDER === "LOCAL") return Boolean(env.AI_BASE_URL);
  return Boolean(env.AI_API_KEY);
}

function safeErrorSummary(error: unknown) {
  const value = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    meta?: unknown;
    clientVersion?: unknown;
  };

  return {
    name: typeof value?.name === "string" ? value.name : "Error",
    code: typeof value?.code === "string" ? value.code : undefined,
    message: typeof value?.message === "string" ? redactConfigValue(value.message) : "Unknown database readiness error",
    clientVersion: typeof value?.clientVersion === "string" ? value.clientVersion : undefined,
    meta: sanitizeMeta(value?.meta)
  };
}

function sanitizeMeta(meta: unknown): unknown {
  if (!meta || typeof meta !== "object") return undefined;
  try {
    return JSON.parse(redactConfigValue(JSON.stringify(meta)));
  } catch {
    return undefined;
  }
}
