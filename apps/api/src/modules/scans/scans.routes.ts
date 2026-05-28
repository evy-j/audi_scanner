import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import {
  requireOrganizationParam,
  requireOrgSecuritySetting,
  requirePermissions,
  requireProjectAccess,
  requireScanProjectAccess
} from "../../common/middleware/authorize.middleware.js";
import { aiRateLimit, fuzzRateLimit, reportRateLimit, scanRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { auditLog } from "../../common/middleware/audit-log.middleware.js";
import {
  createScanSchema,
  listScansQuery,
  scanParams
} from "./scans.schemas.js";
import { organizationQuery } from "../../common/validation/common-schemas.js";
import { ScansController } from "./scans.controller.js";
import { FindingsController } from "../findings/findings.controller.js";
import { listScanFindingsQuery, scanFindingParams } from "../findings/findings.schemas.js";
import { ReviewController } from "../review/review.controller.js";
import {
  baselineComparisonQuery,
  reviewOrganizationQuery,
  sarifExportQuery
} from "../review/review.schemas.js";
import { AnalysisIrController } from "../analysis-ir/analysis-ir.controller.js";
import {
  irContractParams,
  irOrganizationQuery,
  irScanParams
} from "../analysis-ir/analysis-ir.schemas.js";
import { BuildsController } from "../builds/builds.controller.js";
import {
  buildOrganizationQuery,
  buildScanParams,
  retryAnalyzersBody
} from "../builds/builds.schemas.js";
import { AiValidationController } from "../ai-validation/ai-validation.controller.js";
import {
  aiValidationOrganizationQuery,
  aiValidationScanParams
} from "../ai-validation/ai-validation.schemas.js";
import { RemediationController } from "../remediation/remediation.controller.js";
import {
  remediationOrganizationQuery,
  remediationScanParams
} from "../remediation/remediation.schemas.js";
import { ReportsController } from "../reports/reports.controller.js";
import { scanReportParams } from "../reports/reports.schemas.js";
import { SimulationController } from "../simulations/simulation.controller.js";
import { simulationOrganizationQuery, simulationScanParams } from "../simulations/simulation.schemas.js";
import { FuzzingController } from "../fuzzing/fuzzing.controller.js";
import { fuzzOrganizationQuery, fuzzScanParams } from "../fuzzing/fuzzing.schemas.js";

const controller = new ScansController();
const findingsController = new FindingsController();
const reviewController = new ReviewController();
const analysisIrController = new AnalysisIrController();
const buildsController = new BuildsController();
const aiValidationController = new AiValidationController();
const remediationController = new RemediationController();
const reportsController = new ReportsController();
const simulationController = new SimulationController();
const fuzzingController = new FuzzingController();

export const scanRoutes = Router();

scanRoutes.use(authenticateJwtOrApiKey);

scanRoutes.get(
  "/",
  validateRequest({ query: listScansQuery }),
  requireOrganizationParam(),
  requirePermissions("scans:read"),
  asyncHandler(controller.list)
);

scanRoutes.post(
  "/",
  scanRateLimit,
  validateRequest({ body: createScanSchema }),
  requireOrganizationParam(),
  requireProjectAccess(),
  requirePermissions("scans:create"),
  auditLog("SCAN_START", "SCAN"),
  asyncHandler(controller.create)
);

scanRoutes.get(
  "/:scanId/findings",
  validateRequest({ params: scanFindingParams, query: listScanFindingsQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(findingsController.listByScan)
);

scanRoutes.get(
  "/:scanId/reports",
  validateRequest({ params: scanReportParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("reports:read"),
  asyncHandler(reportsController.listByScan)
);

scanRoutes.post(
  "/:scanId/reports/generate",
  reportRateLimit,
  validateRequest({ params: scanReportParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("reports:export"),
  asyncHandler(reportsController.generate)
);

scanRoutes.get(
  "/:scanId/evidence-summary",
  validateRequest({ params: scanFindingParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(findingsController.evidenceSummary)
);

scanRoutes.get(
  "/:scanId/review-summary",
  validateRequest({ params: scanParams, query: reviewOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(reviewController.reviewSummary)
);

scanRoutes.get(
  "/:scanId/baseline-comparison",
  validateRequest({ params: scanParams, query: baselineComparisonQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(reviewController.baselineComparison)
);

scanRoutes.get(
  "/:scanId/export/sarif",
  validateRequest({ params: scanParams, query: sarifExportQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(reviewController.exportSarif)
);

scanRoutes.get(
  "/:scanId/ir-summary",
  validateRequest({ params: irScanParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.summary)
);

scanRoutes.get(
  "/:scanId/build-profile",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(buildsController.buildProfile)
);

scanRoutes.get(
  "/:scanId/build-runs",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(buildsController.buildRuns)
);

scanRoutes.get(
  "/:scanId/compiler-artifacts",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(buildsController.compilerArtifacts)
);

scanRoutes.get(
  "/:scanId/test-runs",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(buildsController.testRuns)
);

scanRoutes.get(
  "/:scanId/tool-availability",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(buildsController.toolAvailability)
);

scanRoutes.get(
  "/:scanId/ai-validation-summary",
  validateRequest({ params: aiValidationScanParams, query: aiValidationOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(aiValidationController.scanSummary)
);

scanRoutes.post(
  "/:scanId/ai-validate",
  aiRateLimit,
  validateRequest({ params: aiValidationScanParams, query: aiValidationOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:update"),
  asyncHandler(aiValidationController.enqueueScanValidation)
);

scanRoutes.get(
  "/:scanId/remediation-summary",
  validateRequest({ params: remediationScanParams, query: remediationOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(remediationController.scanSummary)
);

scanRoutes.get(
  "/:scanId/simulation-summary",
  validateRequest({ params: simulationScanParams, query: simulationOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(simulationController.scanSummary)
);

scanRoutes.get(
  "/:scanId/fuzz-summary",
  validateRequest({ params: fuzzScanParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(fuzzingController.scanSummary)
);

scanRoutes.post(
  "/:scanId/fuzz",
  fuzzRateLimit,
  validateRequest({ params: fuzzScanParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("fuzz:run"),
  requireOrgSecuritySetting("fuzzingAllowed"),
  asyncHandler(fuzzingController.fuzzScan)
);

scanRoutes.get(
  "/:scanId/invariants",
  validateRequest({ params: fuzzScanParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(fuzzingController.scanInvariants)
);

scanRoutes.post(
  "/:scanId/invariants/run",
  fuzzRateLimit,
  validateRequest({ params: fuzzScanParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("fuzz:run"),
  requireOrgSecuritySetting("fuzzingAllowed"),
  asyncHandler(fuzzingController.runScanInvariants)
);

scanRoutes.post(
  "/:scanId/retry-build",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("scans:create"),
  auditLog("SCAN_START", "SCAN"),
  asyncHandler(buildsController.retryBuild)
);

scanRoutes.post(
  "/:scanId/retry-analyzers",
  validateRequest({ params: buildScanParams, query: buildOrganizationQuery, body: retryAnalyzersBody }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("scans:create"),
  auditLog("SCAN_START", "SCAN"),
  asyncHandler(buildsController.retryAnalyzers)
);

scanRoutes.get(
  "/:scanId/contracts/:contractId/functions",
  validateRequest({ params: irContractParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.functions)
);

scanRoutes.get(
  "/:scanId/contracts",
  validateRequest({ params: irScanParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.contracts)
);

scanRoutes.get(
  "/:scanId/call-graph",
  validateRequest({ params: irScanParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.callGraph)
);

scanRoutes.get(
  "/:scanId/external-calls",
  validateRequest({ params: irScanParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.externalCalls)
);

scanRoutes.get(
  "/:scanId/storage-layout",
  validateRequest({ params: irScanParams, query: irOrganizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(analysisIrController.storageLayout)
);

scanRoutes.get(
  "/:scanId",
  validateRequest({ params: scanParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("scans:read"),
  asyncHandler(controller.get)
);

scanRoutes.post(
  "/:scanId/cancel",
  validateRequest({ params: scanParams, query: organizationQuery }),
  requireOrganizationParam(),
  requireScanProjectAccess(),
  requirePermissions("scans:cancel"),
  auditLog("SCAN_CANCEL", "SCAN"),
  asyncHandler(controller.cancel)
);
