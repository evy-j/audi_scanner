import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import {
  requireFindingProjectAccess,
  requireOrganizationParam,
  requirePermissions,
  requireScanProjectAccess
} from "../../common/middleware/authorize.middleware.js";
import { monitorRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { ThreatKnowledgeController } from "./threat.controller.js";
import {
  createThreatIntelBody,
  createThreatSignatureBody,
  detectorPrecisionQuery,
  falsePositiveFeedbackBody,
  findingThreatParams,
  scanThreatParams,
  threatIntelImportBody,
  threatIntelListQuery,
  threatOrganizationQuery,
  threatSignatureListQuery,
  threatSignatureMatchParams,
  threatSignatureParams
} from "./threat.schemas.js";

const controller = new ThreatKnowledgeController();

export const threatKnowledgeRoutes = Router();

threatKnowledgeRoutes.use(authenticateJwtOrApiKey);

threatKnowledgeRoutes.get(
  "/threat-intel",
  validateRequest({ query: threatIntelListQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listThreatIntel)
);

threatKnowledgeRoutes.post(
  "/threat-intel",
  validateRequest({ query: threatOrganizationQuery, body: createThreatIntelBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.createThreatIntel)
);

threatKnowledgeRoutes.post(
  "/threat-intel/import",
  monitorRateLimit,
  validateRequest({ query: threatOrganizationQuery, body: threatIntelImportBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.importThreatIntel)
);

threatKnowledgeRoutes.get(
  "/threat-signatures",
  validateRequest({ query: threatSignatureListQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listThreatSignatures)
);

threatKnowledgeRoutes.post(
  "/threat-signatures",
  validateRequest({ query: threatOrganizationQuery, body: createThreatSignatureBody }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.createThreatSignature)
);

threatKnowledgeRoutes.get(
  "/threat-signatures/:signatureId",
  validateRequest({ params: threatSignatureParams, query: threatOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.getThreatSignature)
);

threatKnowledgeRoutes.post(
  "/threat-signatures/:signatureId/match-scan/:scanId",
  monitorRateLimit,
  validateRequest({ params: threatSignatureMatchParams, query: threatOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.matchSignatureToScan)
);

threatKnowledgeRoutes.get(
  "/scans/:scanId/threat-matches",
  validateRequest({ params: scanThreatParams, query: threatOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listScanMatches)
);

threatKnowledgeRoutes.get(
  "/findings/:findingId/threat-matches",
  validateRequest({ params: findingThreatParams, query: threatOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listFindingMatches)
);

threatKnowledgeRoutes.get(
  "/detectors/precision",
  validateRequest({ query: detectorPrecisionQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listDetectorPrecision)
);

threatKnowledgeRoutes.get(
  "/scans/:scanId/threat-summary",
  validateRequest({ params: scanThreatParams, query: threatOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.scanThreatSummary)
);

threatKnowledgeRoutes.post(
  "/findings/:findingId/false-positive-feedback",
  validateRequest({ params: findingThreatParams, query: threatOrganizationQuery, body: falsePositiveFeedbackBody }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(controller.addFalsePositiveFeedback)
);

threatKnowledgeRoutes.get(
  "/findings/:findingId/false-positive-feedback",
  validateRequest({ params: findingThreatParams, query: threatOrganizationQuery }),
  requireOrganizationParam(),
  requireFindingProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.listFalsePositiveFeedback)
);
