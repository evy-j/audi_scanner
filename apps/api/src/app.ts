import express from "express";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./infra/prisma/prisma.js";
import { env } from "./config/environment.js";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware.js";
import { httpLoggerMiddleware } from "./common/middleware/http-logger.middleware.js";
import { globalRateLimit } from "./common/middleware/rate-limit.middleware.js";
import { errorHandler } from "./common/errors/error-handler.js";
import { ApiError } from "./common/errors/api-error.js";
import { redis } from "./infra/queues/redis.js";
import { v1Router } from "./routes/v1/index.js";
import { HealthService, isReadyForHttp } from "./modules/health/health.service.js";

export function createApiApp() {
  const app = express();
  const health = new HealthService();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(requestIdMiddleware);
  app.use(httpLoggerMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"]
        }
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      frameguard: { action: "deny" },
      noSniff: true,
      referrerPolicy: { policy: "no-referrer" }
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(ApiError.forbidden("CORS origin denied"));
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["authorization", "content-type", "x-api-key", "x-request-id", "x-correlation-id"],
      credentials: true
    })
  );
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    next();
  });
  app.use(express.json({
    limit: "25mb",
    verify: (req, _res, buffer) => {
      (req as express.Request).rawBody = Buffer.from(buffer);
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  // Render and uptime probes must never depend on Redis-backed rate limiting.
  // If Redis is unstable, /health should still prove that the HTTP server is alive,
  // and /ready should return a controlled 503 payload instead of a generic 500.
  app.get("/health", (_req, res) => {
    res.json(health.shallow());
  });

  app.get("/ready", async (_req, res) => {
    try {
      const result = await health.ready();
      res.status(isReadyForHttp(result) ? 200 : 503).json(result);
    } catch (error) {
      res.status(503).json({
        status: "not_ready",
        service: "audit-scanner-api",
        checks: {
          database: "failed",
          redis: "failed",
          workerQueue: "failed",
          storage: "not_configured",
          ai: "not_configured"
        },
        diagnostics: {
          error: error instanceof Error ? error.message : "readiness check failed"
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  app.use(globalRateLimit);

  app.use(env.API_BASE_PATH, v1Router);
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route was not found",
        requestId: _req.id,
        traceId: _req.traceId,
        correlationId: _req.correlationId
      }
    });
  });
  app.use(errorHandler);

  return app;
}

function isAllowedCorsOrigin(origin: string): boolean {
  if (env.CORS_ORIGINS.includes(origin)) {
    return true;
  }

  return env.NODE_ENV === "development" && env.CORS_ORIGINS.length === 0 && isLocalhostOrigin(origin);
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}
