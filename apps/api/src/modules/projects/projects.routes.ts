import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireOrganizationParam, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { ReviewController } from "../review/review.controller.js";
import {
  codeOwnerRuleBody,
  projectParams,
  projectRuleParams,
  reviewOrganizationQuery,
  suppressionRuleBody
} from "../review/review.schemas.js";

const controller = new ReviewController();

export const projectRoutes = Router();

projectRoutes.use(authenticateJwtOrApiKey);

projectRoutes.get(
  "/:projectId/suppression-rules",
  validateRequest({ params: projectParams, query: reviewOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listSuppressionRules)
);

projectRoutes.post(
  "/:projectId/suppression-rules",
  validateRequest({ params: projectParams, query: reviewOrganizationQuery, body: suppressionRuleBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.createSuppressionRule)
);

projectRoutes.delete(
  "/:projectId/suppression-rules/:ruleId",
  validateRequest({ params: projectRuleParams, query: reviewOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.deleteSuppressionRule)
);

projectRoutes.get(
  "/:projectId/codeowners",
  validateRequest({ params: projectParams, query: reviewOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listCodeOwners)
);

projectRoutes.post(
  "/:projectId/codeowners",
  validateRequest({ params: projectParams, query: reviewOrganizationQuery, body: codeOwnerRuleBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.createCodeOwner)
);

projectRoutes.delete(
  "/:projectId/codeowners/:ruleId",
  validateRequest({ params: projectRuleParams, query: reviewOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.deleteCodeOwner)
);
