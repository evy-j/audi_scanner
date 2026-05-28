import type { RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";
import { tokenService } from "../security/token.service.js";

export const authenticateJwt: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.header("authorization"));
  if (!token) {
    next(ApiError.unauthorized());
    return;
  }

  try {
    req.auth = tokenService.verifyAccessToken(token);
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired access token"));
  }
};

export const optionalJwt: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.header("authorization"));
  if (!token) {
    next();
    return;
  }

  try {
    req.auth = tokenService.verifyAccessToken(token);
  } catch {
    // Optional auth deliberately ignores invalid tokens.
  }

  next();
};

function extractBearerToken(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
