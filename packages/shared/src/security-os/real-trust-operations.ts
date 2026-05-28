import type { SecurityOsArtifactStatus, SecurityOsArtifactType } from "./deep-phases.js";

export type RealTrustOperationKey =
  | "formal-tool-adapters"
  | "auditor-onboarding"
  | "customer-pilots"
  | "public-track-record"
  | "legal-compliance"
  | "operations-runbooks";

export type RealTrustOperationClaimPolicy = "PRIVATE_ONLY" | "CONSENT_REQUIRED" | "EVIDENCE_REQUIRED" | "EXTERNAL_VALIDATION_REQUIRED";

export interface RealTrustOperationTemplate {
  readonly key: RealTrustOperationKey;
  readonly title: string;
  readonly artifactType: SecurityOsArtifactType;
  readonly safeDefaultStatus: SecurityOsArtifactStatus;
  readonly claimPolicy: RealTrustOperationClaimPolicy;
  readonly requiredEvidence: readonly string[];
  readonly blockedClaims: readonly string[];
  readonly recommendedOwner: string;
  readonly apiPath: string;
}

export const REAL_TRUST_OPERATION_TEMPLATES: readonly RealTrustOperationTemplate[] = [
  {
    key: "formal-tool-adapters",
    title: "Formal tool adapter activation",
    artifactType: "FORMAL_TOOL_ADAPTER",
    safeDefaultStatus: "NOT_ASSESSED",
    claimPolicy: "EVIDENCE_REQUIRED",
    requiredEvidence: ["tool name", "installed version or SaaS provider status", "run command/config", "sample artifact checksum", "reviewer approval"],
    blockedClaims: ["formal verification passed", "proof complete", "Certora/SMT/Scribble verified"],
    recommendedOwner: "Security engineering lead",
    apiPath: "/security-os/trust-operations/formal-tool-adapters"
  },
  {
    key: "auditor-onboarding",
    title: "Real auditor onboarding",
    artifactType: "AUDITOR_ONBOARDING",
    safeDefaultStatus: "NEEDS_HUMAN_REVIEW",
    claimPolicy: "EXTERNAL_VALIDATION_REQUIRED",
    requiredEvidence: ["real user identity", "NDA/contract reference", "portfolio evidence", "skills assessment", "conflict-of-interest declaration"],
    blockedClaims: ["verified auditor", "available for audit", "senior auditor"],
    recommendedOwner: "Audit operations lead",
    apiPath: "/security-os/trust-operations/auditors"
  },
  {
    key: "customer-pilots",
    title: "Customer pilot tracking",
    artifactType: "CUSTOMER_PILOT",
    safeDefaultStatus: "DRAFT",
    claimPolicy: "CONSENT_REQUIRED",
    requiredEvidence: ["real organization", "pilot scope", "private consent state", "support owner", "success criteria"],
    blockedClaims: ["customer logo", "case study", "production user"],
    recommendedOwner: "Founder / customer success",
    apiPath: "/security-os/trust-operations/customer-pilots"
  },
  {
    key: "public-track-record",
    title: "Public track record evidence",
    artifactType: "PUBLIC_TRACK_RECORD",
    safeDefaultStatus: "NEEDS_HUMAN_REVIEW",
    claimPolicy: "CONSENT_REQUIRED",
    requiredEvidence: ["published report URL or hash", "customer consent", "report version", "public disclaimer", "revocation policy"],
    blockedClaims: ["certified audit", "official security rating", "public endorsement"],
    recommendedOwner: "Trust and safety owner",
    apiPath: "/security-os/trust-operations/public-track-record"
  },
  {
    key: "legal-compliance",
    title: "Legal and compliance operations",
    artifactType: "LEGAL_COMPLIANCE_OPERATION",
    safeDefaultStatus: "DRAFT",
    claimPolicy: "EXTERNAL_VALIDATION_REQUIRED",
    requiredEvidence: ["policy document", "jurisdiction", "owner", "review date", "counsel/reference when available"],
    blockedClaims: ["SOC2 certified", "ISO certified", "legally approved"],
    recommendedOwner: "Operations/legal owner",
    apiPath: "/security-os/trust-operations/legal-compliance"
  },
  {
    key: "operations-runbooks",
    title: "Production operations runbooks",
    artifactType: "OPERATIONS_RUNBOOK",
    safeDefaultStatus: "CONFIGURED",
    claimPolicy: "EVIDENCE_REQUIRED",
    requiredEvidence: ["runbook owner", "escalation path", "SLO/SLA target", "support window", "drill/incident artifact"],
    blockedClaims: ["24/7 SOC", "99.99% uptime", "incident response team ready"],
    recommendedOwner: "DevOps/security operations lead",
    apiPath: "/security-os/trust-operations/runbooks"
  }
] as const;

export function listRealTrustOperationTemplates(): readonly RealTrustOperationTemplate[] {
  return REAL_TRUST_OPERATION_TEMPLATES;
}

export function getRealTrustOperationTemplate(key: string): RealTrustOperationTemplate | undefined {
  return REAL_TRUST_OPERATION_TEMPLATES.find((item) => item.key === key);
}
