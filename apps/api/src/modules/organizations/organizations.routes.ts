import { Router } from "express";
import { authenticateJwt } from "../../common/middleware/authenticate.middleware.js";
import {
  requireOrganizationParam,
  requirePermissions
} from "../../common/middleware/authorize.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { auditLog } from "../../common/middleware/audit-log.middleware.js";
import { organizationParam } from "../../common/validation/common-schemas.js";
import { OrganizationsController } from "./organizations.controller.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema
} from "./organizations.schemas.js";

const controller = new OrganizationsController();

export const organizationRoutes = Router();

organizationRoutes.use(authenticateJwt);

organizationRoutes.get("/", asyncHandler(controller.list));
organizationRoutes.post(
  "/",
  validateRequest({ body: createOrganizationSchema }),
  auditLog("CREATE", "ORGANIZATION"),
  asyncHandler(controller.create)
);

organizationRoutes.get(
  "/:organizationId",
  validateRequest({ params: organizationParam }),
  requireOrganizationParam(),
  asyncHandler(controller.get)
);

organizationRoutes.patch(
  "/:organizationId",
  validateRequest({ params: organizationParam, body: updateOrganizationSchema }),
  requireOrganizationParam(),
  requirePermissions("organizations:update"),
  auditLog("UPDATE", "ORGANIZATION"),
  asyncHandler(controller.update)
);

organizationRoutes.delete(
  "/:organizationId",
  validateRequest({ params: organizationParam }),
  requireOrganizationParam(),
  requirePermissions("organizations:delete"),
  auditLog("DELETE", "ORGANIZATION"),
  asyncHandler(controller.remove)
);

organizationRoutes.get(
  "/:organizationId/members",
  validateRequest({ params: organizationParam }),
  requireOrganizationParam(),
  requirePermissions("organizations:read"),
  asyncHandler(controller.members)
);

organizationRoutes.get(
  "/:organizationId/usage",
  validateRequest({ params: organizationParam }),
  requireOrganizationParam(),
  requirePermissions("organizations:read"),
  asyncHandler(controller.usage)
);
