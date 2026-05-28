import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireFindingProjectAccess, requireOrganizationParam, requireOrgSecuritySetting, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { aiRateLimit, fuzzRateLimit, remediationRateLimit, simulationRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { organizationEvidenceQuery, findingParams } from "./findings.schemas.js";
import { FindingsController } from "./findings.controller.js";
import { ReviewController } from "../review/review.controller.js";
import {
  findingAssignmentBody,
  findingCommentBody,
  reviewOrganizationQuery,
  reviewStatusBody,
  suppressFindingBody,
  unsuppressFindingBody
} from "../review/review.schemas.js";
import { AnalysisIrController } from "../analysis-ir/analysis-ir.controller.js";
import { irFindingParams, irOrganizationQuery } from "../analysis-ir/analysis-ir.schemas.js";
import { AiValidationController } from "../ai-validation/ai-validation.controller.js";
import {
  aiValidationFindingParams,
  aiValidationOrganizationQuery
} from "../ai-validation/ai-validation.schemas.js";
import { RemediationController } from "../remediation/remediation.controller.js";
import {
  remediationFindingParams,
  remediationOrganizationQuery
} from "../remediation/remediation.schemas.js";
import { SimulationController } from "../simulations/simulation.controller.js";
import {
  simulationFindingParams,
  simulationOrganizationQuery
} from "../simulations/simulation.schemas.js";
import { FuzzingController } from "../fuzzing/fuzzing.controller.js";
import { fuzzFindingParams, fuzzOrganizationQuery } from "../fuzzing/fuzzing.schemas.js";

const controller = new FindingsController();
const reviewController = new ReviewController();
const analysisIrController = new AnalysisIrController();
const aiValidationController = new AiValidationController();
const remediationController = new RemediationController();
const simulationController = new SimulationController();
const fuzzingController = new FuzzingController();

export const findingRoutes = Router();

findingRoutes.use(authenticateJwtOrApiKey);

findingRoutes.get(
  "/:findingId",
  validateRequest({ params: findingParams, query: organizationEvidenceQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.get)
);

findingRoutes.get(
  "/:findingId/evidence",
  validateRequest({ params: findingParams, query: organizationEvidenceQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.evidence)
);

findingRoutes.get(
  "/:findingId/code-links",
  validateRequest({ params: irFindingParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.findingCodeLinks)
);

findingRoutes.get(
  "/:findingId/ai-validation",
  validateRequest({ params: aiValidationFindingParams, query: aiValidationOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(aiValidationController.findingValidation)
);

findingRoutes.post(
  "/:findingId/ai-validate",
  aiRateLimit,
  validateRequest({ params: aiValidationFindingParams, query: aiValidationOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(aiValidationController.enqueueFindingValidation)
);

findingRoutes.get(
  "/:findingId/remediation",
  validateRequest({ params: remediationFindingParams, query: remediationOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(remediationController.findingRemediation)
);

findingRoutes.post(
  "/:findingId/remediate",
  remediationRateLimit,
  validateRequest({ params: remediationFindingParams, query: remediationOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(remediationController.remediateFinding)
);

findingRoutes.get(
  "/:findingId/simulations",
  validateRequest({ params: simulationFindingParams, query: simulationOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(simulationController.findingSimulations)
);

findingRoutes.post(
  "/:findingId/simulate",
  simulationRateLimit,
  validateRequest({ params: simulationFindingParams, query: simulationOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("simulation:run"),
  requireOrgSecuritySetting("simulationAllowed"),
  asyncHandler(simulationController.simulateFinding)
);

findingRoutes.get(
  "/:findingId/fuzz",
  validateRequest({ params: fuzzFindingParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(fuzzingController.findingFuzz)
);

findingRoutes.post(
  "/:findingId/fuzz",
  fuzzRateLimit,
  validateRequest({ params: fuzzFindingParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("fuzz:run"),
  requireOrgSecuritySetting("fuzzingAllowed"),
  asyncHandler(fuzzingController.fuzzFinding)
);

findingRoutes.get(
  "/:findingId/review",
  validateRequest({ params: findingParams, query: reviewOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(reviewController.getReview)
);

findingRoutes.post(
  "/:findingId/review/status",
  validateRequest({ params: findingParams, query: reviewOrganizationQuery, body: reviewStatusBody }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(reviewController.changeStatus)
);

findingRoutes.post(
  "/:findingId/comments",
  validateRequest({ params: findingParams, query: reviewOrganizationQuery, body: findingCommentBody }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(reviewController.addComment)
);

findingRoutes.post(
  "/:findingId/assign",
  validateRequest({ params: findingParams, query: reviewOrganizationQuery, body: findingAssignmentBody }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(reviewController.assign)
);

findingRoutes.post(
  "/:findingId/suppress",
  validateRequest({ params: findingParams, query: reviewOrganizationQuery, body: suppressFindingBody }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(reviewController.suppress)
);

findingRoutes.post(
  "/:findingId/unsuppress",
  validateRequest({ params: findingParams, query: reviewOrganizationQuery, body: unsuppressFindingBody }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(reviewController.unsuppress)
);
