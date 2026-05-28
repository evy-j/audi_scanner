export type SecurityOsPhaseStatus =
  | "COMPLETED_BEFORE_THIS_PACK"
  | "SCAFFOLD_READY"
  | "DEEP_FOUNDATION_READY"
  | "IMPLEMENTED_FOUNDATION"
  | "REQUIRES_REAL_PROVIDER_OR_HUMAN_OPERATION";

export interface SecurityOsPhase {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly status: SecurityOsPhaseStatus;
  readonly safetyBoundaries: readonly string[];
  readonly requiredRealInputs: readonly string[];
  readonly primaryArtifacts: readonly string[];
  readonly nextImplementationFocus: readonly string[];
}

const COMMON_SAFETY_BOUNDARIES = [
  "No fabricated security results, audits, certifications, payments, events, or provider status.",
  "No exploit instructions, transaction broadcasting, autonomous exploitation, or unauthorized scanning.",
  "No auto-confirming findings or auto-applying remediation patches.",
  "No raw secrets, tokens, keys, seed phrases, or private source exposure in logs, APIs, reports, or public pages.",
  "All public-facing claims must say readiness/pre-audit unless backed by human sign-off and real evidence."
] as const;

export const SECURITY_OS_PHASES: readonly SecurityOsPhase[] = [
  {
    id: "P14",
    title: "Multi-chain expansion and chain registry",
    objective: "Add chain registry, explorer metadata, RPC safety, analyzer chain context, multi-chain report sections, and chain-specific monitoring constraints.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Configured chain metadata", "RPC provider names and redacted URLs", "Explorer/API configuration", "Known contract addresses from scans or user input"],
    primaryArtifacts: ["docs/P14_multi-chain_expansion_and_chain_registry.md", "Phase registry entry P14"],
    nextImplementationFocus: ["Add chain registry, explorer metadata, RPC safety, analyzer chain context, multi-chain report sections, and chain-specific monitoring constraints.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P15",
    title: "Formal verification and specification layer",
    objective: "Add formal/spec readiness for SMTChecker/Scribble/Certora-style adapters with real-only proof status and no fake verification claims.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Installed formal verification tools", "Compiler artifacts", "User-authored specs or generated draft specs", "Proof artifacts"],
    primaryArtifacts: ["docs/P15_formal_verification_and_specification_layer.md", "Phase registry entry P15"],
    nextImplementationFocus: ["Add formal/spec readiness for SMTChecker/Scribble/Certora-style adapters with real-only proof status and no fake verification claims.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P16",
    title: "Manual auditor workflow and report sign-off",
    objective: "Add human audit rooms, reviewer assignment, severity override governance, dual-review sign-off, locked final reports, and audit delivery workflow.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Real auditor user accounts", "Org/project membership", "Manual review evidence", "Client-approved scope"],
    primaryArtifacts: ["docs/P16_manual_auditor_workflow_and_report_sign-off.md", "Phase registry entry P16"],
    nextImplementationFocus: ["Add human audit rooms, reviewer assignment, severity override governance, dual-review sign-off, locked final reports, and audit delivery workflow.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P17",
    title: "Public trust registry and project scorecards",
    objective: "Add public verified report registry, risk trend scorecards, monitoring status pages, redaction rules, and no-certified-audit disclaimers.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Published report IDs", "Explicit public-share consent", "Redaction policy", "Monitoring/report evidence"],
    primaryArtifacts: ["docs/P17_public_trust_registry_and_project_scorecards.md", "Phase registry entry P17"],
    nextImplementationFocus: ["Add public verified report registry, risk trend scorecards, monitoring status pages, redaction rules, and no-certified-audit disclaimers.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P18",
    title: "Advanced threat intelligence and incident correlation",
    objective: "Extend threat knowledge into incident timelines, campaign correlation, wallet/contract labels with provenance, and confidence-scored indicators.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Provenance-backed incident sources", "Confidence-scored indicators", "Manual review notes", "Monitoring/threat evidence"],
    primaryArtifacts: ["docs/P18_advanced_threat_intelligence_and_incident_correlation.md", "Phase registry entry P18"],
    nextImplementationFocus: ["Extend threat knowledge into incident timelines, campaign correlation, wallet/contract labels with provenance, and confidence-scored indicators.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P19",
    title: "Production scale, observability, and cost controls",
    objective: "Add platform observability, job queue scaling policy, worker isolation, cost budgets, artifact retention, and operational SLO runbooks.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Metrics backend", "Worker/runtime telemetry", "Cost limits", "Artifact retention policy"],
    primaryArtifacts: ["docs/P19_production_scale,_observability,_and_cost_controls.md", "Phase registry entry P19"],
    nextImplementationFocus: ["Add platform observability, job queue scaling policy, worker isolation, cost budgets, artifact retention, and operational SLO runbooks.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P20",
    title: "Auditor marketplace and private audit rooms",
    objective: "Add private engagement workflow, auditor profiles, client/auditor comment threads, report approval packages, and marketplace-safe non-fake availability.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Auditor profiles from real users", "Engagement contracts outside scanner", "Client scope approval", "Manual sign-off"],
    primaryArtifacts: ["docs/P20_auditor_marketplace_and_private_audit_rooms.md", "Phase registry entry P20"],
    nextImplementationFocus: ["Add private engagement workflow, auditor profiles, client/auditor comment threads, report approval packages, and marketplace-safe non-fake availability.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P21",
    title: "Researcher bounty and competitive review workflow",
    objective: "Add bounty/contest lifecycle, submission triage, duplicate handling, reward accounting placeholders, and disclosure policy governance.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Program owner approval", "Submission policy", "Reward policy", "Disclosure policy"],
    primaryArtifacts: ["docs/P21_researcher_bounty_and_competitive_review_workflow.md", "Phase registry entry P21"],
    nextImplementationFocus: ["Add bounty/contest lifecycle, submission triage, duplicate handling, reward accounting placeholders, and disclosure policy governance.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P22",
    title: "Detector benchmark and model evaluation harness",
    objective: "Add benchmark corpus metadata, detector precision regression tests, AI validation evals, false-positive tracking, and release gates.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Benchmark corpus", "Expected findings labels", "Model/provider eval configs", "CI release gates"],
    primaryArtifacts: ["docs/P22_detector_benchmark_and_model_evaluation_harness.md", "Phase registry entry P22"],
    nextImplementationFocus: ["Add benchmark corpus metadata, detector precision regression tests, AI validation evals, false-positive tracking, and release gates.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P23",
    title: "Incident response and SOC workflows",
    objective: "Add alert escalation, incident rooms, timeline/evidence packs, post-mortems, on-call handoff, and read-only response playbooks.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Real monitoring alerts", "Incident owner", "Evidence timeline", "Escalation policy"],
    primaryArtifacts: ["docs/P23_incident_response_and_soc_workflows.md", "Phase registry entry P23"],
    nextImplementationFocus: ["Add alert escalation, incident rooms, timeline/evidence packs, post-mortems, on-call handoff, and read-only response playbooks.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P24",
    title: "Compliance and enterprise evidence packs",
    objective: "Add SOC2/ISO-readiness evidence collection, controls mapping, retention proofs, audit exports, without claiming certification.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Control mapping", "Retention evidence", "Access logs", "Third-party certification evidence only if real"],
    primaryArtifacts: ["docs/P24_compliance_and_enterprise_evidence_packs.md", "Phase registry entry P24"],
    nextImplementationFocus: ["Add SOC2/ISO-readiness evidence collection, controls mapping, retention proofs, audit exports, without claiming certification.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P25",
    title: "Self-hosted enterprise appliance and deployment hardening",
    objective: "Add self-hosted deployment blueprint, KMS/secrets policy, backup/restore, private networking, and tenant isolation verification.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Deployment target", "Secrets/KMS provider", "Backup storage", "Network policy"],
    primaryArtifacts: ["docs/P25_self-hosted_enterprise_appliance_and_deployment_hardening.md", "Phase registry entry P25"],
    nextImplementationFocus: ["Add self-hosted deployment blueprint, KMS/secrets policy, backup/restore, private networking, and tenant isolation verification.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
  {
    id: "P25_PLUS",
    title: "Real operations, auditors, customers, and trust moat",
    objective: "Non-code milestone for real auditors, public track record, client audits, legal/compliance, support, incident response, and brand trust.",
    status: "DEEP_FOUNDATION_READY",
    safetyBoundaries: COMMON_SAFETY_BOUNDARIES,
    requiredRealInputs: ["Real customers", "Human audit team", "Legal/compliance process", "Support and incident response operations"],
    primaryArtifacts: ["docs/P25_PLUS_real_operations,_auditors,_customers,_and_trust_moat.md", "Phase registry entry P25_PLUS"],
    nextImplementationFocus: ["Non-code milestone for real auditors, public track record, client audits, legal/compliance, support, incident response, and brand trust.", "Wire real providers/tools only when configured.", "Add tests before enabling production usage."]
  },
] as const;

export function listSecurityOsPhases(): readonly SecurityOsPhase[] {
  return SECURITY_OS_PHASES;
}

export function getSecurityOsPhase(id: string): SecurityOsPhase | undefined {
  const normalized = id.trim().toUpperCase();
  return SECURITY_OS_PHASES.find((phase) => phase.id === normalized);
}

export function getSecurityOsProgress() {
  const completedBeforeThisPack = 14;
  const scaffolded = SECURITY_OS_PHASES.length;
  return {
    completedBeforeThisPack,
    scaffolded,
    totalTracked: completedBeforeThisPack + scaffolded,
    note:
      "P14/P14B have practical chain/explorer foundation. P15-P25+ now include deep persistence/API/UI/docs foundations, but external tools, real auditors, customer track record, and certifications are not fabricated."
  } as const;
}
