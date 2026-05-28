import { z } from "zod";
import { organizationQuery } from "../../common/validation/common-schemas.js";

const uuid = z.string().uuid();
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "Expected an EVM address");

export const projectMonitorParams = z.object({
  projectId: uuid
});

export const monitorTargetParams = z.object({
  targetId: uuid
});

export const webhookParams = z.object({
  projectId: uuid,
  webhookId: uuid
});

export const alertParams = z.object({
  alertId: uuid
});

export const scanMonitoringParams = z.object({
  scanId: uuid
});

export const monitoringOrganizationQuery = organizationQuery;

export const alertListQuery = organizationQuery.extend({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED", "SUPPRESSED"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

export const createMonitorTargetBody = z.object({
  chainId: z.number().int().positive().optional(),
  address: address.optional(),
  kind: z.enum(["CONTRACT", "PROXY", "TOKEN", "POOL", "GOVERNANCE", "WALLET", "PROJECT"]).optional(),
  displayName: z.string().trim().min(1).max(180).optional(),
  scanId: uuid.optional(),
  status: z.enum(["ACTIVE", "PAUSED", "DISABLED"]).optional(),
  abi: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
  rules: z.array(z.object({
    kind: z.enum([
      "PROXY_UPGRADE",
      "ADMIN_ROLE_CHANGE",
      "PRIVILEGED_FUNCTION_CALL",
      "OWNERSHIP_TRANSFER",
      "PAUSE_UNPAUSE",
      "LIQUIDITY_REMOVAL",
      "LARGE_TOKEN_TRANSFER",
      "ORACLE_DEVIATION",
      "CONTRACT_ACTIVITY_DRIFT",
      "UNKNOWN_EVENT_SPIKE",
      "CUSTOM_EVENT_MATCH"
    ]),
    severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    threshold: z.string().regex(/^\d+$/u).optional(),
    functionSelector: z.string().regex(/^0x[a-fA-F0-9]{8}$/u).optional(),
    eventSignature: z.string().trim().min(1).max(160).optional(),
    config: z.record(z.unknown()).optional()
  })).max(25).optional()
}).refine((value) => value.address || value.scanId, {
  message: "Either address or scanId is required"
});

export const updateMonitorTargetBody = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "DISABLED"]).optional(),
  kind: z.enum(["CONTRACT", "PROXY", "TOKEN", "POOL", "GOVERNANCE", "WALLET", "PROJECT"]).optional(),
  displayName: z.string().trim().min(1).max(180).nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const alertStatusBody = z.object({
  reason: z.string().trim().max(1000).optional()
});

export const alertCommentBody = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const createWebhookBody = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  url: z.string().url(),
  signingSecret: z.string().min(16).max(512),
  metadata: z.record(z.unknown()).optional()
});

export type CreateMonitorTargetBody = z.infer<typeof createMonitorTargetBody>;
export type UpdateMonitorTargetBody = z.infer<typeof updateMonitorTargetBody>;
export type AlertListQuery = z.infer<typeof alertListQuery>;
export type AlertStatusBody = z.infer<typeof alertStatusBody>;
export type AlertCommentBody = z.infer<typeof alertCommentBody>;
export type CreateWebhookBody = z.infer<typeof createWebhookBody>;
