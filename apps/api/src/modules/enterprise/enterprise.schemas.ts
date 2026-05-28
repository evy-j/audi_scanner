import { z } from "zod";
import { organizationQuery } from "../../common/validation/common-schemas.js";

export const orgParams = z.object({ orgId: z.string().uuid() });
export const orgMemberParams = orgParams.extend({ memberId: z.string().uuid() });
export const projectParams = z.object({ projectId: z.string().uuid() });
export const projectMemberParams = projectParams.extend({ memberId: z.string().uuid() });
export const apiKeyRevokeParams = z.object({ apiKeyId: z.string().uuid() });

export const roleType = z.enum(["OWNER", "ADMIN", "SECURITY_LEAD", "AUDITOR", "DEVELOPER", "VIEWER", "BILLING_ADMIN", "READONLY"]);

export const inviteMemberBody = z.object({
  email: z.string().email().max(320),
  roleType: roleType.default("VIEWER"),
  title: z.string().max(120).optional()
});

export const updateMemberBody = z.object({
  roleType: roleType.optional(),
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"]).optional(),
  title: z.string().max(120).optional()
}).refine((input) => Object.keys(input).length > 0, { message: "At least one field is required" });

export const projectMemberBody = z.object({
  userId: z.string().uuid(),
  roleType: roleType.default("DEVELOPER")
});

export const updateProjectMemberBody = z.object({
  roleType: roleType.optional(),
  status: z.enum(["ACTIVE", "REMOVED"]).optional()
}).refine((input) => Object.keys(input).length > 0, { message: "At least one field is required" });

export const ssoBody = z.object({
  providerKind: z.enum(["OIDC", "SAML"]).default("OIDC"),
  issuerUrl: z.string().url().optional(),
  clientId: z.string().max(240).optional(),
  clientSecret: z.string().max(400).optional(),
  allowedDomains: z.array(z.string().min(1).max(160)).max(50).default([]),
  status: z.enum(["NOT_CONFIGURED", "CONFIGURED_NOT_ACTIVE", "ACTIVE", "DISABLED", "ERROR"]).default("CONFIGURED_NOT_ACTIVE")
});

export const retentionBody = z.object({
  scanArtifactRetentionDays: z.number().int().min(1).max(3650).optional(),
  reportRetentionDays: z.number().int().min(1).max(3650).optional(),
  auditLogRetentionDays: z.number().int().min(30).max(3650).optional()
}).refine((input) => Object.keys(input).length > 0, { message: "At least one retention field is required" });

export const dataExportBody = z.object({
  projectId: z.string().uuid().optional(),
  scope: z.string().min(1).max(80).default("ORGANIZATION"),
  reason: z.string().max(2000).optional()
});

export const dataDeletionBody = z.object({
  projectId: z.string().uuid().optional(),
  scope: z.string().min(1).max(80).default("ORGANIZATION"),
  reason: z.string().min(10).max(2000)
});

export const securitySettingsBody = z.object({
  require2fa: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(15).max(43200).optional(),
  allowedDomains: z.array(z.string().min(1).max(160)).max(50).optional(),
  apiKeyMaxLifetimeDays: z.number().int().min(1).max(3650).optional(),
  publicReportSharingAllowed: z.boolean().optional(),
  webhookAllowed: z.boolean().optional(),
  simulationAllowed: z.boolean().optional(),
  fuzzingAllowed: z.boolean().optional(),
  monitoringAllowed: z.boolean().optional()
}).refine((input) => Object.keys(input).length > 0, { message: "At least one security setting is required" });

export const auditLogQuery = organizationQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
