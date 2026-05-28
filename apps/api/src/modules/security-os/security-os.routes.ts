
import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { SecurityOsController } from "./security-os.controller.js";

const controller = new SecurityOsController();
const read = requirePermissions("vulnerabilities:read");
const write = requirePermissions("vulnerabilities:update");

export const securityOsRoutes = Router();

securityOsRoutes.use(authenticateJwtOrApiKey);
securityOsRoutes.get("/security-os/phases", asyncHandler(controller.list));
securityOsRoutes.get("/security-os/phases/:phaseId", asyncHandler(controller.get));

securityOsRoutes.get("/security-os/deep/phases", requirePermissions("vulnerabilities:read"), asyncHandler(controller.listDeepPhases));
securityOsRoutes.get("/security-os/deep/phases/:phaseId", requirePermissions("vulnerabilities:read"), asyncHandler(controller.getDeepPhase));
securityOsRoutes.get("/security-os/deep/summary", requirePermissions("vulnerabilities:read"), asyncHandler(controller.deepSummary));
securityOsRoutes.get("/security-os/deep/artifacts", requirePermissions("vulnerabilities:read"), asyncHandler(controller.listArtifacts));
securityOsRoutes.post("/security-os/deep/artifacts", requirePermissions("vulnerabilities:update"), asyncHandler(controller.createArtifact));
securityOsRoutes.get("/security-os/deep/artifacts/:artifactId", requirePermissions("vulnerabilities:read"), asyncHandler(controller.getArtifact));
securityOsRoutes.patch("/security-os/deep/artifacts/:artifactId/status", requirePermissions("vulnerabilities:update"), asyncHandler(controller.updateArtifactStatus));
securityOsRoutes.post("/security-os/deep/phases/:phaseId/defaults", requirePermissions("vulnerabilities:update"), asyncHandler(controller.createPhaseDefaults));
securityOsRoutes.get("/security-os/deep/audit", requirePermissions("audit_log:read"), asyncHandler(controller.listAudit));


securityOsRoutes.get("/security-os/trust-operations/templates", read, asyncHandler(controller.listRealTrustOperations));
securityOsRoutes.get("/security-os/trust-operations/templates/:operationKey", read, asyncHandler(controller.getRealTrustOperation));
securityOsRoutes.post("/security-os/trust-operations/templates/:operationKey/default", write, asyncHandler(controller.createRealTrustOperationDefault));

function artifactRoutes(path: string, phase: string, type: string) {
  securityOsRoutes.get(path, read, asyncHandler(controller.listTyped(phase, type)));
  securityOsRoutes.post(path, write, asyncHandler(controller.createTyped(phase, type)));
}

artifactRoutes("/security-os/formal-verification/specs", "P15", "FORMAL_SPEC");
artifactRoutes("/security-os/formal-verification/runs", "P15", "FORMAL_RUN");
artifactRoutes("/security-os/formal-verification/proofs", "P15", "FORMAL_PROOF_ARTIFACT");
artifactRoutes("/security-os/manual-audits/engagements", "P16", "AUDIT_ENGAGEMENT");
artifactRoutes("/security-os/manual-audits/signoffs", "P16", "AUDIT_SIGNOFF");
artifactRoutes("/security-os/trust-registry/scorecards", "P17", "PUBLIC_SCORECARD");
artifactRoutes("/security-os/trust-registry/entries", "P17", "TRUST_REGISTRY_ENTRY");
artifactRoutes("/security-os/advanced-threat-intel/incidents", "P18", "INCIDENT_REFERENCE");
artifactRoutes("/security-os/advanced-threat-intel/indicators", "P18", "THREAT_INDICATOR");
artifactRoutes("/security-os/operations/observability", "P19", "OBSERVABILITY_SNAPSHOT");
artifactRoutes("/security-os/operations/cost-budgets", "P19", "COST_BUDGET");
artifactRoutes("/security-os/auditor-marketplace/rooms", "P20", "AUDIT_ROOM");
artifactRoutes("/security-os/auditor-marketplace/profiles", "P20", "MARKETPLACE_PROFILE");
artifactRoutes("/security-os/researcher-bounties/programs", "P21", "BOUNTY_PROGRAM");
artifactRoutes("/security-os/researcher-bounties/submissions", "P21", "BOUNTY_SUBMISSION");
artifactRoutes("/security-os/detector-evals/datasets", "P22", "DETECTOR_BENCHMARK");
artifactRoutes("/security-os/detector-evals/runs", "P22", "EVAL_RUN");
artifactRoutes("/security-os/incident-response/cases", "P23", "INCIDENT_CASE");
artifactRoutes("/security-os/incident-response/timeline-events", "P23", "INCIDENT_TIMELINE_EVENT");
artifactRoutes("/security-os/compliance/controls", "P24", "COMPLIANCE_CONTROL");
artifactRoutes("/security-os/compliance/evidence-packs", "P24", "COMPLIANCE_EVIDENCE_PACK");
artifactRoutes("/security-os/enterprise-appliance/deployments", "P25", "APPLIANCE_DEPLOYMENT");
artifactRoutes("/security-os/enterprise-appliance/upgrade-plans", "P25", "APPLIANCE_UPGRADE_PLAN");
artifactRoutes("/security-os/trust-operations/milestones", "P25_PLUS", "TRUST_OPERATION_MILESTONE");


artifactRoutes("/security-os/trust-operations/formal-tool-adapters", "P25_PLUS", "FORMAL_TOOL_ADAPTER");
artifactRoutes("/security-os/trust-operations/auditors", "P25_PLUS", "AUDITOR_ONBOARDING");
artifactRoutes("/security-os/trust-operations/customer-pilots", "P25_PLUS", "CUSTOMER_PILOT");
artifactRoutes("/security-os/trust-operations/public-track-record", "P25_PLUS", "PUBLIC_TRACK_RECORD");
artifactRoutes("/security-os/trust-operations/legal-compliance", "P25_PLUS", "LEGAL_COMPLIANCE_OPERATION");
artifactRoutes("/security-os/trust-operations/runbooks", "P25_PLUS", "OPERATIONS_RUNBOOK");
