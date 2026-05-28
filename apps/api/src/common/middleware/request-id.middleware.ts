import { randomBytes, randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const incomingCorrelationId = req.header("x-correlation-id");
  const incomingTraceId = req.header("x-trace-id") ?? traceIdFromTraceparent(req.header("traceparent"));
  req.id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.correlationId =
    incomingCorrelationId && incomingCorrelationId.length <= 128 ? incomingCorrelationId : req.id;
  req.traceId = incomingTraceId && isTraceId(incomingTraceId) ? incomingTraceId : randomBytes(16).toString("hex");
  res.setHeader("x-request-id", req.id);
  res.setHeader("x-correlation-id", req.correlationId);
  res.setHeader("x-trace-id", req.traceId);
  next();
};

function traceIdFromTraceparent(traceparent?: string): string | null {
  const match = traceparent?.match(/^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/iu);
  return match?.[1]?.toLowerCase() ?? null;
}

function isTraceId(value: string): boolean {
  return /^[\da-f]{32}$/iu.test(value);
}
