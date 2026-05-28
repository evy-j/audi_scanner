import { createHash } from "node:crypto";
import type { AiValidationDecision, SimulationKind } from "@prisma/client";
import { truncateAndRedact } from "../remediation/redaction.js";
import type { SimulationToolAvailability } from "./tool-detector.js";

export const SIMULATION_PLAN_VERSION = "p7-safe-fork-simulation/v1";

const ELIGIBLE_REVIEW_STATUSES = new Set(["ACCEPTED", "NEEDS_REVIEW", "UNREVIEWED"]);
const DISQUALIFYING_AI_DECISIONS = new Set<AiValidationDecision>([
  "CONTRADICTED",
  "LIKELY_FALSE_POSITIVE"
]);

export interface SimulationFindingContext {
  id: string;
  scanId: string;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  confidenceState: string;
  status: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  analyzer: string;
  review?: { status: string } | null;
  scan: {
    id: string;
    organizationId: string;
    projectId: string | null;
    chainId: string | null;
    targets: Array<{
      targetType: string;
      normalizedAddress: string | null;
      contractAddress: string | null;
      metadata: unknown;
    }>;
    buildRuns: Array<{ id: string; toolKind: string; command: string; status: string; artifactPath: string | null; artifactChecksumSha256: string | null }>;
    compilerArtifacts: Array<{ id: string; artifactKind: string; artifactPath: string; checksumSha256: string; contractName: string | null; sourceFilePath: string | null }>;
    testRuns: Array<{ id: string; toolKind: string; command: string; status: string; artifactPath: string | null; artifactChecksumSha256: string | null }>;
  };
  evidenceItems: Array<{
    id: string;
    evidenceType: string;
    ruleId: string | null;
    detectorName: string | null;
    message: string | null;
    filePath: string | null;
    startLine: number | null;
    endLine: number | null;
    snippet: string | null;
    analyzerRun?: { toolName: string } | null;
  }>;
  codeLinks: Array<{
    id: string;
    linkType: string;
    filePath: string | null;
    startLine: number | null;
    endLine: number | null;
    contractSymbol?: { name: string; fullyQualifiedName: string | null } | null;
    functionSymbol?: { name: string; canonicalName: string | null; visibility: string | null } | null;
    externalCallSite?: { callKind: string; targetExpression: string | null; stateUpdateAfterCall: boolean | null } | null;
    storageLayoutEntry?: { label: string; slot: string; contractName: string } | null;
  }>;
  aiFindingValidations: Array<{
    decision: AiValidationDecision;
    reasoningSummary: string;
    contradictionNotes: string | null;
  }>;
  remediationRuns: Array<{
    status: string;
    suggestions: Array<{ title: string; body: string }>;
  }>;
}

export interface SimulationEligibilityResult {
  eligible: boolean;
  status: "ELIGIBLE" | "NOT_ELIGIBLE";
  reason: string | null;
  safetyLevel: "LOCAL_ONLY" | "DISABLED";
  limitations: string[];
  toolAvailability: SimulationToolAvailability[];
}

export interface SimulationPlanStep {
  title: string;
  description: string;
  expectedSignal: string | null;
}

export interface SimulationPlan {
  version: string;
  kind: SimulationKind;
  title: string;
  summary: string;
  assumptions: string[];
  limitations: string[];
  steps: SimulationPlanStep[];
  commandPreview: string | null;
  executable: boolean;
  unsupportedReason: string | null;
  generatedSkeleton: string | null;
  forkChainId: number | null;
  forkBlockNumber: bigint | null;
  rpcProviderName: string | null;
  source: {
    findingId: string;
    scanId: string;
    evidenceIds: string[];
    codeLinkIds: string[];
    compilerArtifactIds: string[];
    testRunIds: string[];
    remediationRunStatuses: string[];
  };
}

export interface BuiltSimulationPlan {
  eligibility: SimulationEligibilityResult;
  plan: SimulationPlan;
  checksum: string;
}

export class SimulationPlanBuilder {
  build(
    finding: SimulationFindingContext,
    tools: SimulationToolAvailability[],
    simulationEnabled: boolean,
    rpcProviderName: string | null
  ): BuiltSimulationPlan {
    const kind = kindForFinding(finding);
    const latestDecision = finding.aiFindingValidations[0]?.decision ?? null;
    const reviewStatus = finding.review?.status ?? "UNREVIEWED";
    const limitations = [
      "Simulation runs only in a local fork/test environment and does not broadcast live transactions.",
      "Simulation output is a proof artifact only, not a certified exploit claim.",
      "P7 does not update finding confidence, review status, or severity automatically."
    ];
    const eligibility = assessEligibility({
      finding,
      reviewStatus,
      latestDecision,
      tools,
      simulationEnabled,
      limitations
    });
    const plan = buildPlan(finding, kind, eligibility, rpcProviderName);
    return {
      eligibility,
      plan,
      checksum: checksumJson({ eligibility, plan })
    };
  }
}

function assessEligibility(input: {
  finding: SimulationFindingContext;
  reviewStatus: string;
  latestDecision: AiValidationDecision | null;
  tools: SimulationToolAvailability[];
  simulationEnabled: boolean;
  limitations: string[];
}): SimulationEligibilityResult {
  if (!input.simulationEnabled) {
    return notEligible("Simulation is disabled for this environment", "DISABLED", input.limitations, input.tools);
  }
  if (input.finding.status === "SUPPRESSED" || input.reviewStatus === "SUPPRESSED") {
    return notEligible("Suppressed findings are not eligible for simulation", "LOCAL_ONLY", input.limitations, input.tools);
  }
  if (input.finding.evidenceItems.length === 0) {
    return notEligible("Finding has no persisted P1 evidence", "LOCAL_ONLY", input.limitations, input.tools);
  }
  if (!ELIGIBLE_REVIEW_STATUSES.has(input.reviewStatus)) {
    return notEligible(`Review status ${input.reviewStatus} is not eligible for simulation`, "LOCAL_ONLY", input.limitations, input.tools);
  }
  if (input.latestDecision && DISQUALIFYING_AI_DECISIONS.has(input.latestDecision)) {
    return notEligible(`AI validation decision ${input.latestDecision} is not eligible for simulation`, "LOCAL_ONLY", input.limitations, input.tools);
  }
  if (!hasPersistedContext(input.finding)) {
    return notEligible("Finding does not have enough persisted evidence, code, build, or compiler context", "LOCAL_ONLY", input.limitations, input.tools);
  }
  const anvil = input.tools.find((tool) => tool.toolName === "anvil");
  if (!anvil?.available) {
    return notEligible("Required local fork tool anvil is not installed", "LOCAL_ONLY", input.limitations, input.tools);
  }
  return {
    eligible: true,
    status: "ELIGIBLE",
    reason: null,
    safetyLevel: "LOCAL_ONLY",
    limitations: input.limitations,
    toolAvailability: input.tools
  };
}

function notEligible(
  reason: string,
  safetyLevel: "LOCAL_ONLY" | "DISABLED",
  limitations: string[],
  tools: SimulationToolAvailability[]
): SimulationEligibilityResult {
  return {
    eligible: false,
    status: "NOT_ELIGIBLE",
    reason,
    safetyLevel,
    limitations,
    toolAvailability: tools
  };
}

function hasPersistedContext(finding: SimulationFindingContext): boolean {
  return (
    finding.evidenceItems.length > 0 ||
    finding.codeLinks.length > 0 ||
    finding.scan.compilerArtifacts.length > 0 ||
    finding.scan.buildRuns.length > 0 ||
    finding.scan.testRuns.length > 0
  );
}

function kindForFinding(finding: SimulationFindingContext): SimulationKind {
  const haystack = `${finding.title} ${finding.description ?? ""} ${finding.category} ${finding.evidenceItems.map((item) => item.message ?? "").join(" ")}`.toLowerCase();
  if (/access|auth|owner|privilege|permission/u.test(haystack)) return "ACCESS_CONTROL_CHECK";
  if (/proxy|upgrade|implementation|admin slot/u.test(haystack)) return "PROXY_UPGRADE_CHECK";
  if (/reentran|external call|call.value|low-level call/u.test(haystack)) return "REENTRANCY_PROBE";
  if (/oracle|price|twap/u.test(haystack)) return "ORACLE_MANIPULATION_CHECK";
  return "GENERIC_REPRODUCTION";
}

function buildPlan(
  finding: SimulationFindingContext,
  kind: SimulationKind,
  eligibility: SimulationEligibilityResult,
  rpcProviderName: string | null
): SimulationPlan {
  const target = finding.scan.targets.find((item) => item.normalizedAddress ?? item.contractAddress);
  const privilegedFunction = finding.codeLinks.find((link) => link.functionSymbol)?.functionSymbol;
  const hasAbiContext = finding.scan.compilerArtifacts.some((artifact) => /abi|build-info|artifact/iu.test(artifact.artifactKind));
  const externalCall = finding.codeLinks.find((link) => link.externalCallSite)?.externalCallSite;
  const storageReference = finding.codeLinks.find((link) => link.storageLayoutEntry)?.storageLayoutEntry;
  const evidenceIds = finding.evidenceItems.map((item) => item.id);
  const base = {
    version: SIMULATION_PLAN_VERSION,
    kind,
    title: `${kind.replace(/_/gu, " ")} for ${truncateAndRedact(finding.title, 120)}`,
    assumptions: [
      "Only persisted scanner data is used.",
      "No transaction is broadcast to a live network.",
      "No private keys, seed phrases, or production signers are collected."
    ],
    limitations: eligibility.limitations,
    source: {
      findingId: finding.id,
      scanId: finding.scanId,
      evidenceIds,
      codeLinkIds: finding.codeLinks.map((link) => link.id),
      compilerArtifactIds: finding.scan.compilerArtifacts.map((artifact) => artifact.id),
      testRunIds: finding.scan.testRuns.map((run) => run.id),
      remediationRunStatuses: finding.remediationRuns.map((run) => run.status)
    },
    forkChainId: null,
    forkBlockNumber: null,
    rpcProviderName
  };

  if (kind === "ACCESS_CONTROL_CHECK") {
    const executable = Boolean(target && privilegedFunction && hasAbiContext && eligibility.eligible);
    return {
      ...base,
      summary: executable
        ? "Build a local-only call simulation for a privileged function using persisted ABI/address context."
        : "Persisted address, ABI, or privileged-function context is incomplete; the simulation can only document an inconclusive plan.",
      steps: [
        step("Load persisted ABI/address context", "Use persisted scan target and compiler artifact metadata only.", target ? "target context present" : null),
        step("Check privileged function reachability", `Function: ${privilegedFunction?.canonicalName ?? privilegedFunction?.name ?? "Not available"}.`, "local trace or revert reason"),
        step("Record local proof artifact", "Persist command output, trace, and asset deltas only if produced locally.", "trace or asset delta artifact")
      ],
      commandPreview: executable ? "anvil --fork-url [REDACTED_RPC_URL] --fork-block-number <configured>" : null,
      executable: false,
      unsupportedReason: executable ? "Execution is deferred until a concrete local test harness is available." : "Missing ABI/address/function context.",
      generatedSkeleton: null
    };
  }

  if (kind === "PROXY_UPGRADE_CHECK") {
    const executable = Boolean(target && storageReference && eligibility.eligible);
    return {
      ...base,
      summary: executable
        ? "Check proxy/admin upgrade reachability on a local fork using persisted storage layout references."
        : "Proxy admin/storage layout evidence is incomplete; the plan is inconclusive.",
      steps: [
        step("Inspect proxy storage evidence", `Storage reference: ${storageReference?.contractName ?? "Not available"} ${storageReference?.label ?? ""}`.trim(), "proxy/admin storage reference"),
        step("Attempt local-only admin reachability check", "Use a local fork and read-only/static-call style checks where possible.", "local trace artifact"),
        step("Persist decision", "Require trace proof before marking reproduced.", "decision artifact")
      ],
      commandPreview: executable ? "anvil --fork-url [REDACTED_RPC_URL]" : null,
      executable: false,
      unsupportedReason: executable ? "Execution is deferred until a concrete proxy harness is available." : "Missing proxy/admin/storage context.",
      generatedSkeleton: null
    };
  }

  if (kind === "REENTRANCY_PROBE") {
    const exactContext = Boolean(externalCall && finding.filePath && finding.lineStart);
    return {
      ...base,
      summary: exactContext
        ? "Generate a local Foundry-style skeleton for human review; no exploit claim is made without a failing local trace."
        : "External call inventory or source location is incomplete; the plan is inconclusive.",
      steps: [
        step("Review external call inventory", `External call: ${truncateAndRedact(externalCall?.targetExpression, 500) ?? "Not available"}.`, "external call context"),
        step("Prepare local harness skeleton", "Create a non-broadcasting test skeleton only when exact context exists.", "test skeleton artifact"),
        step("Require trace proof", "Only a local failing test with trace or asset delta can reproduce the finding.", "local trace or asset delta")
      ],
      commandPreview: exactContext ? "forge test --match-test <human-reviewed-local-simulation-test>" : null,
      executable: false,
      unsupportedReason: exactContext ? "Skeleton only; human review is required before execution." : "Missing exact external-call/source context.",
      generatedSkeleton: exactContext ? foundrySkeleton(finding) : null
    };
  }

  return {
    ...base,
    summary: "Generic reproduction can only replay persisted build/test/analyzer context. It does not create an exploit sequence.",
    steps: [
      step("Review persisted analyzer evidence", `Evidence IDs: ${evidenceIds.join(", ") || "None"}.`, "persisted evidence"),
      step("Review build/test context", `Build runs: ${finding.scan.buildRuns.length}; test runs: ${finding.scan.testRuns.length}.`, "build/test artifact"),
      step("Persist inconclusive proof when executable context is absent", "No exploitability claim is made without local trace or asset delta proof.", "decision artifact")
    ],
    commandPreview: null,
    executable: false,
    unsupportedReason: "No deterministic local reproduction harness is available from persisted context.",
    generatedSkeleton: null
  };
}

function step(title: string, description: string, expectedSignal: string | null): SimulationPlanStep {
  return { title, description: truncateAndRedact(description, 2_000) ?? description, expectedSignal };
}

function foundrySkeleton(finding: SimulationFindingContext): string {
  return [
    "// P7 local-only simulation skeleton. Requires human review before use.",
    "// This file is not executed automatically and does not broadcast live transactions.",
    "contract LocalOnlyReentrancySimulation {",
    `  // Finding: ${finding.id}`,
    `  // Source: ${finding.filePath ?? "unknown"}:${finding.lineStart ?? "?"}`,
    "  function test_requiresHumanReview_beforeExecution() public {",
    "    // Arrange local fork state using persisted project artifacts only.",
    "    // Act through a human-reviewed local harness.",
    "    // Assert trace or asset-delta proof before any reproduced decision.",
    "  }",
    "}"
  ].join("\n");
}

function checksumJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
