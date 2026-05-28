import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireOrganizationParam, requirePermissions, requireProjectAccess } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { OrganizationsController } from "../organizations/organizations.controller.js";
import { ApiKeysController } from "../api-keys/api-keys.controller.js";
import { apiKeyRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { createOrganizationSchema, updateOrganizationSchema } from "../organizations/organizations.schemas.js";
import { createApiKeySchema } from "../api-keys/api-keys.schemas.js";
import { EnterpriseController } from "./enterprise.controller.js";
import {
  apiKeyRevokeParams,
  auditLogQuery,
  dataDeletionBody,
  dataExportBody,
  inviteMemberBody,
  orgMemberParams,
  orgParams,
  projectMemberBody,
  projectMemberParams,
  projectParams,
  retentionBody,
  securitySettingsBody,
  ssoBody,
  updateMemberBody,
  updateProjectMemberBody
} from "./enterprise.schemas.js";

const enterprise = new EnterpriseController();
const organizations = new OrganizationsController();
const apiKeys = new ApiKeysController();

export const enterpriseRoutes = Router();

enterpriseRoutes.use(authenticateJwtOrApiKey);

enterpriseRoutes.get("/orgs", asyncHandler(organizations.list));
enterpriseRoutes.post("/orgs", validateRequest({ body: createOrganizationSchema }), asyncHandler(organizations.create));
enterpriseRoutes.get("/orgs/:orgId", validateRequest({ params: orgParams }), requireOrganizationParam("orgId"), (req, _res, next) => {
  req.params.organizationId = req.params.orgId!;
  next();
}, asyncHandler(organizations.get));
enterpriseRoutes.patch(
  "/orgs/:orgId",
  validateRequest({ params: orgParams, body: updateOrganizationSchema }),
  requireOrganizationParam("orgId"),
  requirePermissions("org:manage"),
  (req, _res, next) => {
    req.params.organizationId = req.params.orgId!;
    next();
  },
  asyncHandler(organizations.update)
);

enterpriseRoutes.get(
  "/orgs/:orgId/members",
  validateRequest({ params: orgParams }),
  requireOrganizationParam("orgId"),
  requirePermissions("org:manage"),
  asyncHandler(enterprise.members)
);
enterpriseRoutes.post(
  "/orgs/:orgId/members/invite",
  validateRequest({ params: orgParams, body: inviteMemberBody }),
  requireOrganizationParam("orgId"),
  requirePermissions("org:manage"),
  asyncHandler(enterprise.inviteMember)
);
enterpriseRoutes.patch(
  "/orgs/:orgId/members/:memberId",
  validateRequest({ params: orgMemberParams, body: updateMemberBody }),
  requireOrganizationParam("orgId"),
  requirePermissions("org:manage"),
  asyncHandler(enterprise.updateMember)
);
enterpriseRoutes.delete(
  "/orgs/:orgId/members/:memberId",
  validateRequest({ params: orgMemberParams }),
  requireOrganizationParam("orgId"),
  requirePermissions("org:manage"),
  asyncHandler(enterprise.removeMember)
);

enterpriseRoutes.get(
  "/projects/:projectId/members",
  validateRequest({ params: projectParams, query: auditLogQuery.pick({ organizationId: true }) }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("project:read"),
  asyncHandler(enterprise.projectMembers)
);
enterpriseRoutes.post(
  "/projects/:projectId/members",
  validateRequest({ params: projectParams, query: auditLogQuery.pick({ organizationId: true }), body: projectMemberBody }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("project:update"),
  asyncHandler(enterprise.addProjectMember)
);
enterpriseRoutes.patch(
  "/projects/:projectId/members/:memberId",
  validateRequest({ params: projectMemberParams, query: auditLogQuery.pick({ organizationId: true }), body: updateProjectMemberBody }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("project:update"),
  asyncHandler(enterprise.updateProjectMember)
);
enterpriseRoutes.delete(
  "/projects/:projectId/members/:memberId",
  validateRequest({ params: projectMemberParams, query: auditLogQuery.pick({ organizationId: true }) }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("project:update"),
  asyncHandler(enterprise.removeProjectMember)
);

enterpriseRoutes.get("/orgs/:orgId/audit-logs", validateRequest({ params: orgParams, query: auditLogQuery.omit({ organizationId: true }) }), requireOrganizationParam("orgId"), requirePermissions("audit_log:read"), asyncHandler(enterprise.auditLogs));
enterpriseRoutes.get("/orgs/:orgId/sso", validateRequest({ params: orgParams }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.getSso));
enterpriseRoutes.post("/orgs/:orgId/sso", validateRequest({ params: orgParams, body: ssoBody }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.upsertSso));
enterpriseRoutes.patch("/orgs/:orgId/sso", validateRequest({ params: orgParams, body: ssoBody.partial() }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.patchSso));
enterpriseRoutes.delete("/orgs/:orgId/sso", validateRequest({ params: orgParams }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.deleteSso));

enterpriseRoutes.get("/orgs/:orgId/data-retention", validateRequest({ params: orgParams }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.getRetention));
enterpriseRoutes.patch("/orgs/:orgId/data-retention", validateRequest({ params: orgParams, body: retentionBody }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.updateRetention));
enterpriseRoutes.post("/orgs/:orgId/data-export-requests", validateRequest({ params: orgParams, body: dataExportBody }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.createExportRequest));
enterpriseRoutes.post("/orgs/:orgId/data-deletion-requests", validateRequest({ params: orgParams, body: dataDeletionBody }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.createDeletionRequest));

enterpriseRoutes.get("/orgs/:orgId/security-settings", validateRequest({ params: orgParams }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.getSecuritySettings));
enterpriseRoutes.patch("/orgs/:orgId/security-settings", validateRequest({ params: orgParams, body: securitySettingsBody }), requireOrganizationParam("orgId"), requirePermissions("org:manage"), asyncHandler(enterprise.updateSecuritySettings));

enterpriseRoutes.get("/orgs/:orgId/api-keys", validateRequest({ params: orgParams }), requireOrganizationParam("orgId"), requirePermissions("api_key:read"), (req, _res, next) => {
  req.params.organizationId = req.params.orgId!;
  next();
}, asyncHandler(apiKeys.list));
enterpriseRoutes.post("/orgs/:orgId/api-keys", apiKeyRateLimit, validateRequest({ params: orgParams, body: createApiKeySchema }), requireOrganizationParam("orgId"), requirePermissions("api_key:create"), (req, _res, next) => {
  req.params.organizationId = req.params.orgId!;
  next();
}, asyncHandler(apiKeys.create));
enterpriseRoutes.post("/api-keys/:apiKeyId/revoke", apiKeyRateLimit, validateRequest({ params: apiKeyRevokeParams, query: auditLogQuery.pick({ organizationId: true }) }), requireOrganizationParam(), requirePermissions("api_key:revoke"), (req, _res, next) => {
  req.params.organizationId = String(req.query.organizationId);
  next();
}, asyncHandler(apiKeys.revoke));
