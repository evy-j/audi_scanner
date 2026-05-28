
export type SecurityOsDeepPhaseId =
  | "P15"
  | "P16"
  | "P17"
  | "P18"
  | "P19"
  | "P20"
  | "P21"
  | "P22"
  | "P23"
  | "P24"
  | "P25"
  | "P25_PLUS";

export type SecurityOsArtifactType =
  | "FORMAL_SPEC"
  | "FORMAL_RUN"
  | "FORMAL_PROOF_ARTIFACT"
  | "AUDIT_ENGAGEMENT"
  | "AUDIT_SIGNOFF"
  | "PUBLIC_SCORECARD"
  | "TRUST_REGISTRY_ENTRY"
  | "INCIDENT_REFERENCE"
  | "THREAT_INDICATOR"
  | "OBSERVABILITY_SNAPSHOT"
  | "COST_BUDGET"
  | "AUDIT_ROOM"
  | "MARKETPLACE_PROFILE"
  | "BOUNTY_PROGRAM"
  | "BOUNTY_SUBMISSION"
  | "DETECTOR_BENCHMARK"
  | "EVAL_RUN"
  | "INCIDENT_CASE"
  | "INCIDENT_TIMELINE_EVENT"
  | "COMPLIANCE_CONTROL"
  | "COMPLIANCE_EVIDENCE_PACK"
  | "APPLIANCE_DEPLOYMENT"
  | "APPLIANCE_UPGRADE_PLAN"
  | "TRUST_OPERATION_MILESTONE"
  | "FORMAL_TOOL_ADAPTER"
  | "AUDITOR_ONBOARDING"
  | "CUSTOMER_PILOT"
  | "PUBLIC_TRACK_RECORD"
  | "LEGAL_COMPLIANCE_OPERATION"
  | "OPERATIONS_RUNBOOK";

export type SecurityOsArtifactStatus =
  | "DRAFT"
  | "NOT_ASSESSED"
  | "CONFIGURED"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED"
  | "NEEDS_HUMAN_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "REVOKED";

export interface SecurityOsCapability {
  readonly key: string;
  readonly label: string;
  readonly artifactType: SecurityOsArtifactType;
  readonly realInputs: readonly string[];
  readonly safeDefaultStatus: SecurityOsArtifactStatus;
  readonly blocksFakeClaims: readonly string[];
}

export interface SecurityOsDeepPhase {
  readonly id: SecurityOsDeepPhaseId;
  readonly title: string;
  readonly implementationStatus: "DEEP_FOUNDATION_READY" | "EXTERNAL_TOOLS_REQUIRED" | "HUMAN_OPERATION_REQUIRED";
  readonly objective: string;
  readonly safetyBoundaries: readonly string[];
  readonly capabilities: readonly SecurityOsCapability[];
  readonly apiNamespaces: readonly string[];
  readonly uiSurfaces: readonly string[];
  readonly nextRealityCheck: readonly string[];
}

const REAL_ONLY = [
  "No fabricated results, proofs, attestations, incidents, certifications, marketplace availability, customer claims, or provider status.",
  "No exploit instructions, no transaction broadcasting, no autonomous exploitation, no credential attacks, and no unauthorized scanning.",
  "No auto-confirming findings, no auto-applying remediation, and no certified audit claim without human sign-off and real evidence.",
  "All external tool/provider outputs must be marked PROVIDER_NOT_CONFIGURED, TOOL_NOT_INSTALLED, NOT_ASSESSED, or FAILED when unavailable.",
  "Every public/trust/compliance output must show provenance, evidence references, and limitations."
] as const;

export const SECURITY_OS_ARTIFACT_TYPES: readonly SecurityOsArtifactType[] = [
  "FORMAL_SPEC", "FORMAL_RUN", "FORMAL_PROOF_ARTIFACT", "AUDIT_ENGAGEMENT", "AUDIT_SIGNOFF", "PUBLIC_SCORECARD", "TRUST_REGISTRY_ENTRY", "INCIDENT_REFERENCE", "THREAT_INDICATOR", "OBSERVABILITY_SNAPSHOT", "COST_BUDGET", "AUDIT_ROOM", "MARKETPLACE_PROFILE", "BOUNTY_PROGRAM", "BOUNTY_SUBMISSION", "DETECTOR_BENCHMARK", "EVAL_RUN", "INCIDENT_CASE", "INCIDENT_TIMELINE_EVENT", "COMPLIANCE_CONTROL", "COMPLIANCE_EVIDENCE_PACK", "APPLIANCE_DEPLOYMENT", "APPLIANCE_UPGRADE_PLAN", "TRUST_OPERATION_MILESTONE", "FORMAL_TOOL_ADAPTER", "AUDITOR_ONBOARDING", "CUSTOMER_PILOT", "PUBLIC_TRACK_RECORD", "LEGAL_COMPLIANCE_OPERATION", "OPERATIONS_RUNBOOK"
] as const;

export const SECURITY_OS_ARTIFACT_STATUSES: readonly SecurityOsArtifactStatus[] = [
  "DRAFT", "NOT_ASSESSED", "CONFIGURED", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED", "NEEDS_HUMAN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "REVOKED"
] as const;

export const SECURITY_OS_DEEP_PHASES: readonly SecurityOsDeepPhase[] = [
  {
    id: "P15",
    title: "Formal verification and specification layer",
    implementationStatus: "EXTERNAL_TOOLS_REQUIRED",
    objective: "Persist formal specs, tool run requests, proof artifacts, and real-only verification status for SMTChecker/Scribble/Certora-style flows.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "spec-drafts", label: "Specification drafts and review state", artifactType: "FORMAL_SPEC", realInputs: ["Contract/source context", "User-authored or generated draft spec", "Reviewer notes"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["Does not call a draft a proof", "Does not claim verification until a tool artifact exists"] },
      { key: "tool-runs", label: "Formal tool run records", artifactType: "FORMAL_RUN", realInputs: ["Installed SMTChecker/Scribble/Certora-compatible tool", "Compiler artifacts", "Run command and checksum"], safeDefaultStatus: "NOT_ASSESSED", blocksFakeClaims: ["Missing tool is NOT_ASSESSED/TOOL_NOT_INSTALLED", "No fake pass/fail"] },
      { key: "proof-artifacts", label: "Proof/counterexample artifact vault", artifactType: "FORMAL_PROOF_ARTIFACT", realInputs: ["Real solver output", "Checksum", "Source range"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["Proof requires checksum/provenance", "Counterexample is not turned into exploit instructions"] }
    ],
    apiNamespaces: ["/security-os/formal-verification/specs", "/security-os/formal-verification/runs", "/security-os/formal-verification/proofs"],
    uiSurfaces: ["/security-os/deep", "Formal verification panel"],
    nextRealityCheck: ["Wire actual SMTChecker/Scribble/Certora adapter only when installed/configured", "Add per-tool parsers", "Require human proof review before report claim"]
  },
  {
    id: "P16",
    title: "Manual auditor workflow and report sign-off",
    implementationStatus: "HUMAN_OPERATION_REQUIRED",
    objective: "Add human audit engagements, scoped review tasks, dual sign-off, locked report approval, and evidence-backed manual overrides.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "audit-engagements", label: "Audit engagement workspace", artifactType: "AUDIT_ENGAGEMENT", realInputs: ["Client scope", "Auditor users", "Project membership"], safeDefaultStatus: "CONFIGURED", blocksFakeClaims: ["No fake auditor availability", "No fake signed audit"] },
      { key: "signoffs", label: "Dual-review report sign-off", artifactType: "AUDIT_SIGNOFF", realInputs: ["Reviewer identity", "Report ID", "Approval checklist"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["Cannot publish without real actor", "Does not claim certification"] }
    ],
    apiNamespaces: ["/security-os/manual-audits/engagements", "/security-os/manual-audits/signoffs"],
    uiSurfaces: ["Manual audit room", "Report approval workflow"],
    nextRealityCheck: ["Map sign-off permissions to P11 RBAC", "Add immutable report lock", "Add client approval states"]
  },
  {
    id: "P17",
    title: "Public trust registry and project scorecards",
    implementationStatus: "DEEP_FOUNDATION_READY",
    objective: "Create redacted public scorecards and registry entries from real reports, monitoring alerts, and explicit share consent only.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "scorecards", label: "Public risk scorecards", artifactType: "PUBLIC_SCORECARD", realInputs: ["Published report", "Monitoring summary", "Redaction policy"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No score without report evidence", "Public link redacts suppressed/private data"] },
      { key: "registry", label: "Trust registry entries", artifactType: "TRUST_REGISTRY_ENTRY", realInputs: ["Project consent", "Report ID", "Evidence references"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No certified badge unless separately verified", "No fake customer/project listings"] }
    ],
    apiNamespaces: ["/security-os/trust-registry/scorecards", "/security-os/trust-registry/entries"],
    uiSurfaces: ["Public registry admin", "Project scorecard preview"],
    nextRealityCheck: ["Add public rendering guard", "Add score version history", "Add score explainability"]
  },
  {
    id: "P18",
    title: "Advanced threat intelligence and incident correlation",
    implementationStatus: "DEEP_FOUNDATION_READY",
    objective: "Persist provenance-backed incident references, indicators, contract/wallet labels, and correlation hypotheses without defamatory identity claims.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "incident-references", label: "Incident timeline references", artifactType: "INCIDENT_REFERENCE", realInputs: ["Public URL/hash/manual source", "Confidence", "Reviewer notes"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["Requires provenance", "No fake incident history"] },
      { key: "threat-indicators", label: "Contract/wallet/rule indicators", artifactType: "THREAT_INDICATOR", realInputs: ["Evidence IDs", "Confidence score", "Source type"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No identity claims", "Label is confidence-scored context, not proof"] }
    ],
    apiNamespaces: ["/security-os/advanced-threat-intel/incidents", "/security-os/advanced-threat-intel/indicators"],
    uiSurfaces: ["Threat intel workspace", "Incident correlation panel"],
    nextRealityCheck: ["Add indicator dedupe", "Add campaign graph", "Add manual dispute workflow"]
  },
  {
    id: "P19",
    title: "Production scale, observability, and cost controls",
    implementationStatus: "DEEP_FOUNDATION_READY",
    objective: "Track operational snapshots, queue health, worker capacity, retention posture, and budget guardrails from real telemetry only.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "observability", label: "Operational observability snapshots", artifactType: "OBSERVABILITY_SNAPSHOT", realInputs: ["Queue metrics", "Worker health", "API version"], safeDefaultStatus: "NOT_ASSESSED", blocksFakeClaims: ["No fake uptime/SLO", "Missing metrics are NOT_ASSESSED"] },
      { key: "cost-budgets", label: "Cost and quota budget controls", artifactType: "COST_BUDGET", realInputs: ["Plan limits", "Worker cost policy", "Usage meters"], safeDefaultStatus: "CONFIGURED", blocksFakeClaims: ["No fake cloud spend", "Budget is policy, not invoice"] }
    ],
    apiNamespaces: ["/security-os/operations/observability", "/security-os/operations/cost-budgets"],
    uiSurfaces: ["Ops command center", "Cost guardrails"],
    nextRealityCheck: ["Wire metrics backend", "Add SLO alerting", "Add worker autoscaling gates"]
  },
  {
    id: "P20",
    title: "Auditor marketplace and private audit rooms",
    implementationStatus: "HUMAN_OPERATION_REQUIRED",
    objective: "Add private audit rooms, auditor profiles, engagement evidence, message threads, and approval packages without fake marketplace availability.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "audit-rooms", label: "Private audit rooms", artifactType: "AUDIT_ROOM", realInputs: ["Engagement", "Participants", "Scope"], safeDefaultStatus: "CONFIGURED", blocksFakeClaims: ["No fake auditor profile", "No public audit claim without sign-off"] },
      { key: "marketplace-profiles", label: "Auditor marketplace profiles", artifactType: "MARKETPLACE_PROFILE", realInputs: ["Real user account", "Portfolio evidence", "Verification state"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No fake availability", "No fake credentials"] }
    ],
    apiNamespaces: ["/security-os/auditor-marketplace/rooms", "/security-os/auditor-marketplace/profiles"],
    uiSurfaces: ["Audit room", "Auditor profile admin"],
    nextRealityCheck: ["Add messaging storage", "Add engagement contracts", "Add conflict-of-interest checks"]
  },
  {
    id: "P21",
    title: "Researcher bounty and competitive review workflow",
    implementationStatus: "HUMAN_OPERATION_REQUIRED",
    objective: "Add bounty programs, private submissions, triage, duplicate handling, reward recommendations, and safe disclosure governance.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "bounty-programs", label: "Bounty/contest programs", artifactType: "BOUNTY_PROGRAM", realInputs: ["Program owner", "Scope", "Disclosure policy"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No fake rewards", "No public program unless published"] },
      { key: "submissions", label: "Researcher submissions", artifactType: "BOUNTY_SUBMISSION", realInputs: ["Researcher", "Finding evidence", "Triage notes"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No exploit publication", "No automatic reward approval"] }
    ],
    apiNamespaces: ["/security-os/researcher-bounties/programs", "/security-os/researcher-bounties/submissions"],
    uiSurfaces: ["Bounty admin", "Submission triage"],
    nextRealityCheck: ["Add duplicate matching", "Add payout provider only when configured", "Add disclosure embargo workflow"]
  },
  {
    id: "P22",
    title: "Detector benchmark and model evaluation harness",
    implementationStatus: "DEEP_FOUNDATION_READY",
    objective: "Persist benchmark datasets, expected labels, detector/model eval runs, regression gates, and release readiness decisions.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "benchmarks", label: "Detector benchmark datasets", artifactType: "DETECTOR_BENCHMARK", realInputs: ["Corpus", "Expected labels", "License/provenance"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No fake precision", "No unlabeled corpus claim"] },
      { key: "eval-runs", label: "Evaluation runs and release gates", artifactType: "EVAL_RUN", realInputs: ["Detector version", "Dataset ID", "Result artifact"], safeDefaultStatus: "NOT_ASSESSED", blocksFakeClaims: ["No fake model score", "Missing output is NOT_ASSESSED"] }
    ],
    apiNamespaces: ["/security-os/detector-evals/datasets", "/security-os/detector-evals/runs"],
    uiSurfaces: ["Detector evaluation lab", "Release gate report"],
    nextRealityCheck: ["Add corpus runner", "Add model/provider eval adapter", "Add CI release gate"]
  },
  {
    id: "P23",
    title: "Incident response and SOC workflows",
    implementationStatus: "HUMAN_OPERATION_REQUIRED",
    objective: "Add incident cases, alert escalation, timelines, read-only playbooks, communications, and post-mortem artifacts.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "incident-cases", label: "Incident response cases", artifactType: "INCIDENT_CASE", realInputs: ["Monitoring alert", "Owner", "Severity"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No fake incident", "No automatic mitigation"] },
      { key: "timeline", label: "Incident timeline and evidence", artifactType: "INCIDENT_TIMELINE_EVENT", realInputs: ["Alert/event evidence", "Actor", "Timestamp"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No fabricated event", "No private data public by default"] }
    ],
    apiNamespaces: ["/security-os/incident-response/cases", "/security-os/incident-response/timeline-events"],
    uiSurfaces: ["SOC incident room", "Post-mortem builder"],
    nextRealityCheck: ["Add escalation integrations", "Add on-call routing", "Add read-only playbooks"]
  },
  {
    id: "P24",
    title: "Compliance and enterprise evidence packs",
    implementationStatus: "DEEP_FOUNDATION_READY",
    objective: "Map platform evidence to compliance-control readiness packs without claiming SOC2/ISO certification.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "controls", label: "Compliance control mapping", artifactType: "COMPLIANCE_CONTROL", realInputs: ["Control framework", "Evidence IDs", "Owner"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["Readiness only", "No certification claim"] },
      { key: "evidence-packs", label: "Enterprise evidence packs", artifactType: "COMPLIANCE_EVIDENCE_PACK", realInputs: ["Audit logs", "Retention policy", "Export checksum"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No fake third-party audit", "No public secrets"] }
    ],
    apiNamespaces: ["/security-os/compliance/controls", "/security-os/compliance/evidence-packs"],
    uiSurfaces: ["Compliance evidence center", "Enterprise export"],
    nextRealityCheck: ["Add framework templates", "Add export approvals", "Add external auditor evidence import"]
  },
  {
    id: "P25",
    title: "Self-hosted enterprise appliance and deployment hardening",
    implementationStatus: "EXTERNAL_TOOLS_REQUIRED",
    objective: "Track self-hosted deployment topology, secrets/KMS policy, backup/restore, upgrade plan, and appliance readiness checks.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "deployments", label: "Self-hosted deployment records", artifactType: "APPLIANCE_DEPLOYMENT", realInputs: ["Deployment target", "Network policy", "Secrets provider"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No fake deployment health", "No secrets stored"] },
      { key: "upgrades", label: "Upgrade and rollback plans", artifactType: "APPLIANCE_UPGRADE_PLAN", realInputs: ["Version", "Backup status", "Migration plan"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No fake backup", "No automatic destructive upgrade"] }
    ],
    apiNamespaces: ["/security-os/enterprise-appliance/deployments", "/security-os/enterprise-appliance/upgrade-plans"],
    uiSurfaces: ["Self-hosted appliance admin", "Upgrade readiness"],
    nextRealityCheck: ["Add Helm/Terraform artifacts", "Add backup restore test", "Add offline/license mode"]
  },
  {
    id: "P25_PLUS",
    title: "Real operations, auditors, customers, and trust moat",
    implementationStatus: "HUMAN_OPERATION_REQUIRED",
    objective: "Track real-world trust operations: formal tool adapters, auditor onboarding, customer pilots, public track record, legal/compliance operations, and production runbooks.",
    safetyBoundaries: REAL_ONLY,
    capabilities: [
      { key: "trust-milestones", label: "Operations and trust milestones", artifactType: "TRUST_OPERATION_MILESTONE", realInputs: ["Real customer/auditor evidence", "Public references where allowed", "Owner notes"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No fake customers", "No fake brand/trust score"] },
      { key: "formal-tool-adapters", label: "Formal tool adapter activation", artifactType: "FORMAL_TOOL_ADAPTER", realInputs: ["Installed tool path or SaaS provider config", "Version/checksum", "Sample run artifact"], safeDefaultStatus: "NOT_ASSESSED", blocksFakeClaims: ["No fake formal proof", "No configured status without real tool metadata"] },
      { key: "auditor-onboarding", label: "Auditor onboarding and verification", artifactType: "AUDITOR_ONBOARDING", realInputs: ["Real user account", "Signed NDA/contract reference", "Portfolio or credential evidence", "Conflict-of-interest declaration"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No fake auditors", "No fake credentials", "No public availability until approved"] },
      { key: "customer-pilots", label: "Customer pilot and reference tracking", artifactType: "CUSTOMER_PILOT", realInputs: ["Real organization/project", "Consent status", "Pilot scope", "Support notes"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No fake customers", "No public logo/reference without explicit consent"] },
      { key: "public-track-record", label: "Public track record evidence", artifactType: "PUBLIC_TRACK_RECORD", realInputs: ["Published report link", "Customer consent", "Scorecard/report evidence", "Date and version"], safeDefaultStatus: "NEEDS_HUMAN_REVIEW", blocksFakeClaims: ["No fake audit history", "No certification claim without real authority"] },
      { key: "legal-compliance-ops", label: "Legal and compliance operations", artifactType: "LEGAL_COMPLIANCE_OPERATION", realInputs: ["Policy document", "Owner", "Review date", "Jurisdiction/legal counsel reference when available"], safeDefaultStatus: "DRAFT", blocksFakeClaims: ["No legal certification claim", "No compliance claim without evidence"] },
      { key: "operations-runbooks", label: "Production operations runbooks", artifactType: "OPERATIONS_RUNBOOK", realInputs: ["Runbook owner", "Escalation path", "SLO/SLA target", "Drill or incident evidence"], safeDefaultStatus: "CONFIGURED", blocksFakeClaims: ["No fake uptime", "No fake incident response team"] }
    ],
    apiNamespaces: ["/security-os/trust-operations/milestones", "/security-os/trust-operations/formal-tool-adapters", "/security-os/trust-operations/auditors", "/security-os/trust-operations/customer-pilots", "/security-os/trust-operations/public-track-record", "/security-os/trust-operations/legal-compliance", "/security-os/trust-operations/runbooks"],
    uiSurfaces: ["Trust moat tracker", "Real operations activation console", "/security-os/real-ops"],
    nextRealityCheck: ["Recruit real auditors", "Run real private audits", "Collect customer references with consent", "Wire formal tool adapters only when installed/configured", "Operate legal/support/incident workflows with real owners"]
  }
] as const;

export function listSecurityOsDeepPhases(): readonly SecurityOsDeepPhase[] {
  return SECURITY_OS_DEEP_PHASES;
}

export function getSecurityOsDeepPhase(id: string): SecurityOsDeepPhase | undefined {
  const normalized = id.trim().toUpperCase() as SecurityOsDeepPhaseId;
  return SECURITY_OS_DEEP_PHASES.find((phase) => phase.id === normalized);
}

export function isSecurityOsArtifactType(value: string): value is SecurityOsArtifactType {
  return (SECURITY_OS_ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function isSecurityOsArtifactStatus(value: string): value is SecurityOsArtifactStatus {
  return (SECURITY_OS_ARTIFACT_STATUSES as readonly string[]).includes(value);
}

export function getSecurityOsDeepProgress() {
  const totalCapabilities = SECURITY_OS_DEEP_PHASES.reduce((sum, phase) => sum + phase.capabilities.length, 0);
  return {
    phases: SECURITY_OS_DEEP_PHASES.length,
    capabilities: totalCapabilities,
    implementation: "P15-P25+ deep foundation APIs, persistence contracts, UI surfaces, and docs are present. External tools, real auditors, real customers, and third-party certifications are intentionally not fabricated.",
    certikLevelReality: "Feature architecture is moving toward a security platform. Company-level parity still requires human auditors, real customers, public track record, legal/compliance, and operations."
  } as const;
}
