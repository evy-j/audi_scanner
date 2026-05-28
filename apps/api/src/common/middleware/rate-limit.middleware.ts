import type { Request, Response } from "express";
import rateLimit, { MemoryStore, type IncrementResponse, type Options, type Store } from "express-rate-limit";
import { env } from "../../config/environment.js";
import { ApiError } from "../errors/api-error.js";
import { logger } from "../logging/logger.js";
import { RedisFixedWindowRateLimiter } from "../rate-limit/redis-fixed-window-rate-limiter.js";

function structuredRateLimitHandler(req: Request, res: Response) {
  const error = new ApiError(429, "RATE_LIMITED", "Too many requests");
  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      requestId: req.id
    }
  });
}

class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly limiter: RedisFixedWindowRateLimiter;

  constructor(
    private readonly namespace: string,
    private readonly windowMs: number
  ) {
    this.limiter = new RedisFixedWindowRateLimiter(namespace, windowMs, Number.MAX_SAFE_INTEGER);
  }

  async increment(key: string): Promise<IncrementResponse> {
    try {
      const result = await this.limiter.consume(key);

      return {
        totalHits: result.totalHits,
        resetTime: result.resetTime
      };
    } catch (error) {
      logger.warn(
        { namespace: this.namespace, err: error },
        "redis rate-limit store unavailable; allowing request in fail-open mode"
      );

      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs)
      };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.limiter.decrement(key);
    } catch (error) {
      logger.warn({ namespace: this.namespace, err: error }, "redis rate-limit decrement failed; ignored");
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.limiter.resetKey(key);
    } catch (error) {
      logger.warn({ namespace: this.namespace, err: error }, "redis rate-limit reset failed; ignored");
    }
  }
}

export const globalRateLimit = rateLimit({
  ...baseOptions("global", env.RATE_LIMIT_MAX_REQUESTS)
});

export const authRateLimit = rateLimit({
  ...baseOptions("auth", env.AUTH_RATE_LIMIT_MAX_REQUESTS)
});

export const scanRateLimit = rateLimit({
  ...baseOptions("scan", env.SCAN_RATE_LIMIT_MAX_REQUESTS)
});

export const aiRateLimit = rateLimit({
  ...baseOptions("ai", env.ACTION_RATE_LIMIT_MAX_REQUESTS)
});

export const remediationRateLimit = rateLimit({
  ...baseOptions("remediation", env.ACTION_RATE_LIMIT_MAX_REQUESTS)
});

export const simulationRateLimit = rateLimit({
  ...baseOptions("simulation", env.ACTION_RATE_LIMIT_MAX_REQUESTS)
});

export const fuzzRateLimit = rateLimit({
  ...baseOptions("fuzz", env.ACTION_RATE_LIMIT_MAX_REQUESTS)
});

export const monitorRateLimit = rateLimit({
  ...baseOptions("monitor", env.ACTION_RATE_LIMIT_MAX_REQUESTS)
});

export const reportRateLimit = rateLimit({
  ...baseOptions("report", env.ACTION_RATE_LIMIT_MAX_REQUESTS)
});

export const apiKeyRateLimit = rateLimit({
  ...baseOptions("api-key", env.AUTH_RATE_LIMIT_MAX_REQUESTS)
});

export function buildRateLimit(options: {
  namespace: string;
  limit: number;
  windowMs?: number | undefined;
  store?: "redis" | "memory" | undefined;
}) {
  return rateLimit(baseOptions(options.namespace, options.limit, options.windowMs, options.store));
}

function baseOptions(
  namespace: string,
  limit: number,
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  store = env.RATE_LIMIT_STORE
): Partial<Options> {
  return {
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isHealthProbeRequest,
    store: createStore(namespace, windowMs, store),
    handler: structuredRateLimitHandler
  };
}

function isHealthProbeRequest(req: Request): boolean {
  const path = req.path || req.originalUrl.split("?")[0] || "";

  return (
    path === "/health" ||
    path === "/ready" ||
    path === "/version" ||
    path === "/api/v1/health" ||
    path === "/api/v1/health/deep" ||
    path === "/api/v1/ready" ||
    path === "/api/v1/version"
  );
}

function createStore(namespace: string, windowMs: number, store: "redis" | "memory"): Store {
  if (store === "memory") {
    logger.warn({ namespace, environment: env.NODE_ENV }, "using in-memory rate limit store; configure REDIS_URL + RATE_LIMIT_STORE=redis for multi-instance production");
    return new MemoryStore();
  }

  return new RedisRateLimitStore(namespace, windowMs);
}
