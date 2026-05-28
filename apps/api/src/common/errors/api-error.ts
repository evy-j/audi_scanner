export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "LIMIT_EXCEEDED"
  | "ENTITLEMENT_DENIED"
  | "PAYMENT_REQUIRED"
  | "SUBSCRIPTION_EXPIRED"
  | "PROVIDER_NOT_CONFIGURED"
  | "CHECKOUT_FAILED"
  | "CONFIGURATION_ERROR"
  | "DATABASE_UNAVAILABLE"
  | "REDIS_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication is required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Insufficient permissions"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static accessDenied(message = "Access denied"): ApiError {
    return new ApiError(403, "ACCESS_DENIED", message);
  }

  static notFound(resource = "Resource"): ApiError {
    return new ApiError(404, "NOT_FOUND", `${resource} was not found`);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, "CONFLICT", message);
  }

  static limitExceeded(message: string, details?: unknown): ApiError {
    return new ApiError(402, "LIMIT_EXCEEDED", message, details);
  }

  static entitlementDenied(message: string, details?: unknown): ApiError {
    return new ApiError(402, "ENTITLEMENT_DENIED", message, details);
  }

  static paymentRequired(message: string, details?: unknown): ApiError {
    return new ApiError(402, "PAYMENT_REQUIRED", message, details);
  }

  static subscriptionExpired(message: string, details?: unknown): ApiError {
    return new ApiError(402, "SUBSCRIPTION_EXPIRED", message, details);
  }

  static providerNotConfigured(message: string, details?: unknown): ApiError {
    return new ApiError(503, "PROVIDER_NOT_CONFIGURED", message, details);
  }

  static checkoutFailed(message: string, details?: unknown): ApiError {
    return new ApiError(502, "CHECKOUT_FAILED", message, details);
  }

  static serviceUnavailable(message: string, details?: unknown): ApiError {
    return new ApiError(503, "SERVICE_UNAVAILABLE", message, details);
  }

  static configuration(message: string, details?: unknown): ApiError {
    return new ApiError(500, "CONFIGURATION_ERROR", message, details);
  }

  static databaseUnavailable(message = "Database is unavailable"): ApiError {
    return new ApiError(503, "DATABASE_UNAVAILABLE", message);
  }

  static redisUnavailable(message = "Redis is unavailable"): ApiError {
    return new ApiError(503, "REDIS_UNAVAILABLE", message);
  }

  static validation(details: unknown): ApiError {
    return new ApiError(422, "VALIDATION_ERROR", "Request validation failed", details);
  }

  static notImplemented(message: string): ApiError {
    return new ApiError(501, "NOT_IMPLEMENTED", message);
  }
}
