import type { RequestHandler } from "express";
import type { AuditAction, AuditResource } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { logger } from "../logging/logger.js";

export function auditLog(action: AuditAction, resource: AuditResource): RequestHandler {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) {
        return;
      }

      void prisma.auditLog
        .create({
          data: {
            organizationId: req.auth?.organizationId ?? null,
            actorUserId: req.auth?.userId ?? null,
            action,
            resource,
            resourceId: getResourceId(req.params) ?? null,
            ipAddress: req.ip ?? null,
            userAgent: req.header("user-agent") ?? null,
            requestId: req.id ?? null,
            metadata: {
              method: req.method,
              path: req.path,
              principalType: req.auth?.type ?? null
            }
          }
        })
        .catch((error) => logger.warn({ err: error, requestId: req.id }, "audit log write failed"));
    });

    next();
  };
}

function getResourceId(params: Record<string, string>): string | undefined {
  return (
    params.id ??
    params.userId ??
    params.organizationId ??
    params.scanId ??
    params.reportId ??
    params.vulnerabilityId ??
    params.apiKeyId
  );
}
