import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireOrganizationParam, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { RemediationController } from "./remediation.controller.js";
import {
  remediationOrganizationQuery,
  remediationParams,
  remediationRejectBody,
  remediationReviewBody
} from "./remediation.schemas.js";

const controller = new RemediationController();

export const remediationRoutes = Router();

remediationRoutes.use(authenticateJwtOrApiKey);

remediationRoutes.post(
  "/:remediationId/review",
  validateRequest({ params: remediationParams, query: remediationOrganizationQuery, body: remediationReviewBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.review)
);

remediationRoutes.post(
  "/:remediationId/mark-reviewed",
  validateRequest({ params: remediationParams, query: remediationOrganizationQuery, body: remediationReviewBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.markReviewed)
);

remediationRoutes.post(
  "/:remediationId/reject",
  validateRequest({ params: remediationParams, query: remediationOrganizationQuery, body: remediationRejectBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.reject)
);
