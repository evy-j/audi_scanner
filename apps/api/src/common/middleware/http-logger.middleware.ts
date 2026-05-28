import type { RequestHandler } from "express";
import { logger } from "../logging/logger.js";

export const httpLoggerMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const payload = {
      requestId: req.id,
      traceId: req.traceId,
      correlationId: req.correlationId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ipAddress: req.ip,
      principalType: req.auth?.type ?? null,
      organizationId: req.auth?.organizationId ?? null
    };

    if (res.statusCode >= 500) {
      logger.error(payload, "request completed");
    } else if (res.statusCode >= 400) {
      logger.warn(payload, "request completed");
    } else {
      logger.info(payload, "request completed");
    }
  });

  next();
};
