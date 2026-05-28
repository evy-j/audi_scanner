import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import {
  requireOrganizationParam,
  requirePermissions
} from "../../common/middleware/authorize.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { auditLog } from "../../common/middleware/audit-log.middleware.js";
import {
  listVulnerabilitiesQuery,
  updateVulnerabilitySchema,
  vulnerabilityParams
} from "./vulnerabilities.schemas.js";
import { VulnerabilitiesController } from "./vulnerabilities.controller.js";
import { organizationQuery } from "../../common/validation/common-schemas.js";

const controller = new VulnerabilitiesController();

export const vulnerabilityRoutes = Router();

vulnerabilityRoutes.use(authenticateJwtOrApiKey);

vulnerabilityRoutes.get(
  "/",
  validateRequest({ query: listVulnerabilitiesQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.list)
);

vulnerabilityRoutes.get(
  "/:vulnerabilityId",
  validateRequest({ params: vulnerabilityParams, query: organizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.get)
);

vulnerabilityRoutes.patch(
  "/:vulnerabilityId",
  validateRequest({ params: vulnerabilityParams, query: organizationQuery, body: updateVulnerabilitySchema }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  auditLog("UPDATE", "VULNERABILITY"),
  asyncHandler(controller.update)
);
