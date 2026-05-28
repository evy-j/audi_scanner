import type { RequestHandler } from "express";
import { prisma } from "../../infra/prisma/prisma.js";
import { ApiError } from "../errors/api-error.js";
import { getApiKeyPrefix, verifyApiKeyHash } from "../security/api-key-hash.js";
import { logger } from "../logging/logger.js";
import { authenticateJwt } from "./authenticate.middleware.js";
import { asyncHandler } from "./async-handler.js";

export const authenticateApiKey: RequestHandler = asyncHandler(async (req, _res, next) => {
  const key = req.header("x-api-key") ?? extractBearerToken(req.header("authorization"));
  if (!key) {
    next(ApiError.unauthorized("API key is required"));
    return;
  }

  const prefix = getApiKeyPrefix(key);
  if (!prefix) {
    next(ApiError.unauthorized("Invalid API key format"));
    return;
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyPrefix: prefix }
  });

  if (
    !apiKey ||
    apiKey.status !== "ACTIVE" ||
    apiKey.deletedAt ||
    (apiKey.expiresAt && apiKey.expiresAt <= new Date()) ||
    !verifyApiKeyHash(key, apiKey.keyHash)
  ) {
    if (apiKey) {
      void prisma.apiKeyAuditEvent.create({
        data: {
          organizationId: apiKey.organizationId,
          projectId: apiKey.projectId ?? null,
          apiKeyId: apiKey.id,
          actorUserId: apiKey.createdById ?? null,
          action: "DENIED",
          keyPrefix: apiKey.keyPrefix,
          requestId: req.id ?? null
        }
      }).catch((error) => logger.warn({ err: error, apiKeyId: apiKey.id }, "api key denied audit failed"));
    }
    next(ApiError.unauthorized("Invalid API key"));
    return;
  }

  req.auth = {
    type: "apiKey",
    apiKeyId: apiKey.id,
    organizationId: apiKey.organizationId,
    ...(apiKey.projectId ? { projectId: apiKey.projectId } : {}),
    ...((apiKey as any).githubRepositoryId ? { githubRepositoryId: (apiKey as any).githubRepositoryId } : {}),
    ...(apiKey.createdById ? { userId: apiKey.createdById } : {}),
    permissions: [],
    scopes: apiKey.scopes
  };

  void prisma.$transaction([
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    }),
    prisma.apiKeyAuditEvent.create({
      data: {
        organizationId: apiKey.organizationId,
        projectId: apiKey.projectId ?? null,
        apiKeyId: apiKey.id,
        actorUserId: apiKey.createdById ?? null,
        action: "USED",
        keyPrefix: apiKey.keyPrefix,
        requestId: req.id ?? null
      }
    })
  ]).catch((error) => logger.warn({ err: error, apiKeyId: apiKey.id }, "api key usage audit failed"));

  next();
});

export const authenticateJwtOrApiKey: RequestHandler = (req, res, next) => {
  const authorization = req.header("authorization");
  if (req.header("x-api-key") || authorization?.startsWith("Bearer ask_")) {
    void authenticateApiKey(req, res, next);
    return;
  }

  authenticateJwt(req, res, next);
};

function extractBearerToken(headerValue?: string): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
