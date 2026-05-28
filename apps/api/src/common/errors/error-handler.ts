import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "./api-error.js";
import { logger } from "../logging/logger.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = req.id;
  const traceId = req.traceId;
  const correlationId = req.correlationId;

  if (error instanceof ZodError) {
    const apiError = ApiError.validation(error.flatten());
    res.status(apiError.statusCode).json(toPayload(apiError, requestId, traceId, correlationId));
    return;
  }

  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId, traceId, correlationId }, "request failed");
    }
    res.status(error.statusCode).json(toPayload(error, requestId, traceId, correlationId));
    return;
  }

  logger.error({ err: error, requestId, traceId, correlationId }, "unhandled request error");
  const internal = new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  res.status(500).json(toPayload(internal, requestId, traceId, correlationId));
};

function toPayload(
  error: ApiError,
  requestId?: string,
  traceId?: string,
  correlationId?: string
) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
      traceId,
      correlationId
    }
  };
}
