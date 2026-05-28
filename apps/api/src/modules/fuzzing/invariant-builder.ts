import { createHash } from "node:crypto";
import type { AiValidationDecision, FuzzToolKind } from "@prisma/client";
import { truncateAndRedact } from "../remediation/redaction.js";
import type { FuzzToolAvailability } from "./tool-detector.js";

export const FUZZ_PLAN_VERSION = "p8-fuzzing-invariants/v1";

const DISQUALIFYING_AI_DECISIONS = new Set<AiValidationDecision>([
  "CONTRADICTED",
  "LIKELY_FALSE_POSITIVE"
]);

export interface FuzzScanContext {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string | null;
  buildProfiles: Array<{ id: string; toolKind: string; projectRoot: string; configFile: string | null }>;
  buildRuns: Array<{ id: string; toolKind: string; status: string; command: string; artifactPath: string | null; artifactChecksumSha256: string | null }>;
  compilerArtifacts: Array<{ id: string; artifactKind: string; artifactPath: string; checksumSha256: string; contractName: string | null; sourceFilePath: string | null }>;
  testRuns: Array<{ id: string; toolKind: string; status: string; command: string; artifactPath: string | null; artifactChecksumSha256: string | null }>;
  contractSymbols: Array<{ id: string; name: string; fullyQualifiedName: string; filePath: string; startLine: number | null; endLine: number | null }>;
  functionSymbols: Array<{ id: string; name: string; canonicalName: string; visibility: string | null; filePath: string; startLine: number | null; endLine: number | null }>;
  stateVariableSymbols: Array<{ id: string; name: string; typeName: string | null; visibility: string | null; filePath: string; startLine: number | null; endLine: number | null }>;
  externalCallSites: Array<{ id: string; callKind: string; targetExpression: string | null; stateUpdateAfterCall: boolean | null; filePath: string | null; startLine: number | null; endLine: number | null }>;
  storageLayoutEntries: Array<{ id: string; label: string; slot: string; contractName: string; typeName: string | null }>;
  simulationRuns: Array<{ id: string; status: string; decision: string }>;
}

export interface FuzzFindingContext {
  id: string;
  scanId: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  review?: { status: string } | null;
  evidenceItems: Array<{ id: string; message: string | null; filePath: string | null; startLine: number | null; endLine: number | null; snippet: string | null }>;
  codeLinks: Array<{
    id: string;
    contractSymbol?: { id: string; name: string; fullyQualifiedName: string | null; filePath: string } | null;
    functionSymbol?: { id: string; name: string; canonicalName: string | null; visibility: string | null; filePath: string; startLine?: number | null; endLine?: number | null } | null;
    externalCallSite?: { id: string; targetExpression: string | null; stateUpdateAfterCall: boolean | null } | null;
    storageLayoutEntry?: { id: string; label: string; slot: string; contractName: string; typeName: string | null } | null;
  }>;
  aiFindingValidations: Array<{ decision: AiValidationDecision; reasoningSummary: string; contradictionNotes: string | null }>;
}

export interface FuzzContext {
  scan: FuzzScanContext;
  finding?: FuzzFindingContext | null | undefined;
}

export interface FuzzEligibility {
  eligible: boolean;
  status: "ELIGIBLE" | "NOT_ELIGIBLE" | "NOT_ASSESSED" | "TOOL_NOT_INSTALLED";
  reason: string | null;
  safetyLevel: "LOCAL_ONLY" | "DISABLED";
  toolAvailability: FuzzToolAvailability[];
  limitations: string[];
}

export interface InvariantCandidate {
  category: string;
  name: string;
  description: string;
  expression: string | null;
  skeleton: string | null;
  sourceIds: string[];
}

export interface FuzzTargetCandidate {
  targetType: string;
  contractName: string | null;
  functionName: string | null;
  filePath: string | null;
  sourceRange: { startLine: number | null; endLine: number | null } | null;
  abiArtifactPath: string | null;
}

export interface FuzzPlan {
  version: string;
  title: string;
  summary: string;
  toolKind: FuzzToolKind;
  assumptions: string[];
  limitations: string[];
  commandPreview: string | null;
  executable: boolean;
  unsupportedReason: string | null;
  projectRoot: string | null;
  invariantOnly: boolean;
  targets: FuzzTargetCandidate[];
  invariants: InvariantCandidate[];
  testCases: Array<{ title: string; framework: FuzzToolKind; skeleton: string; commandPreview: string | null }>;
  source: {
    scanId: string;
    findingId: string | null;
    evidenceIds: string[];
    contractSymbolIds: string[];
    functionSymbolIds: string[];
    stateVariableIds: string[];
    compilerArtifactIds: string[];
    testRunIds: string[];
    simulationRunIds: string[];
  };
}

export interface BuiltFuzzPlan {
  eligibility: FuzzEligibility;
  plan: FuzzPlan;
  checksum: string;
}

export class InvariantCandidateBuilder {
  build(
    context: FuzzContext,
    tools: FuzzToolAvailability[],
    fuzzingEnabled: boolean,
    invariantOnly = false
  ): BuiltFuzzPlan {
    const limitations = [
      "Fuzzing runs only in a local or sandboxed environment and does not broadcast live transactions.",
      "Generated invariants are defensive suggestions unless a configured local tool executes them.",
      "P8 stores fuzz and invariant outputs separately and never auto-confirms findings."
    ];
    const toolKind = chooseToolKind(tools);
    const eligibility = assessEligibility(context, tools, fuzzingEnabled, limitations);
    const plan = buildPlan(context, eligibility, toolKind, invariantOnly);
    return {
      eligibility,
      plan,
      checksum: checksumJson({ eligibility, plan })
    };
  }
}

function assessEligibility(
  context: FuzzContext,
  tools: FuzzToolAvailability[],
  fuzzingEnabled: boolean,
  limitations: string[]
): FuzzEligibility {
  if (!fuzzingEnabled) {
    return notEligible("Fuzzing is disabled for this environment", "NOT_ASSESSED", "DISABLED", tools, limitations);
  }

  const finding = context.finding;
  if (finding?.status === "SUPPRESSED" || finding?.review?.status === "SUPPRESSED") {
    return notEligible("Suppressed findings are not eligible for fuzzing", "NOT_ELIGIBLE", "LOCAL_ONLY", tools, limitations);
  }

  const latestDecision = finding?.aiFindingValidations[0]?.decision ?? null;
  if (latestDecision && DISQUALIFYING_AI_DECISIONS.has(latestDecision)) {
    return notEligible(`AI validation decision ${latestDecision} is not eligible for fuzzing`, "NOT_ELIGIBLE", "LOCAL_ONLY", tools, limitations);
  }

  if (context.scan.compilerArtifacts.length === 0 || (context.scan.testRuns.length === 0 && context.scan.buildRuns.length === 0)) {
    return notEligible("Persisted P3 compiler/build/test context is required for fuzzing", "NOT_ELIGIBLE", "LOCAL_ONLY", tools, limitations);
  }

  if (context.scan.contractSymbols.length === 0 && context.scan.functionSymbols.length === 0 && !finding) {
    return notEligible("No persisted contract, function, or finding context is available for fuzzing", "NOT_ELIGIBLE", "LOCAL_ONLY", tools, limitations);
  }

  const forge = tools.find((tool) => tool.toolName === "forge");
  if (!forge?.available) {
    return notEligible("Required local fuzz tool forge is not installed", "TOOL_NOT_INSTALLED", "LOCAL_ONLY", tools, limitations);
  }

  return {
    eligible: true,
    status: "ELIGIBLE",
    reason: null,
    safetyLevel: "LOCAL_ONLY",
    toolAvailability: tools,
    limitations
  };
}

function buildPlan(
  context: FuzzContext,
  eligibility: FuzzEligibility,
  toolKind: FuzzToolKind,
  invariantOnly: boolean
): FuzzPlan {
  const scan = context.scan;
  const finding = context.finding ?? null;
  const foundryProfile = scan.buildProfiles.find((profile) => profile.toolKind === "FOUNDRY");
  const evidenceIds = finding?.evidenceItems.map((item) => item.id) ?? [];
  const compilerArtifactIds = scan.compilerArtifacts.map((artifact) => artifact.id);
  const targets = buildTargets(context);
  const invariants = buildInvariantCandidates(context);
  const hasExecutableContext = Boolean(eligibility.eligible && foundryProfile && targets.length > 0 && scan.compilerArtifacts.length > 0);

  return {
    version: FUZZ_PLAN_VERSION,
    title: finding
      ? `Fuzz and invariant checks for ${truncateAndRedact(finding.title, 120)}`
      : `Fuzz and invariant checks for scan ${scan.id}`,
    summary: hasExecutableContext
      ? "Run local Foundry fuzz/invariant tests against persisted project context and store real artifacts only."
      : "Persist deterministic defensive invariant candidates; execution is inconclusive until local tool/project context is complete.",
    toolKind,
    assumptions: [
      "Only persisted scanner/build/code-intelligence data is used.",
      "No live transactions are broadcast.",
      "No private keys, seed phrases, or production signers are collected."
    ],
    limitations: eligibility.limitations,
    commandPreview: hasExecutableContext ? "forge test --fuzz-runs <configured>" : null,
    executable: hasExecutableContext,
    unsupportedReason: hasExecutableContext ? null : eligibility.reason ?? "No complete local Foundry project context is available.",
    projectRoot: foundryProfile?.projectRoot ?? null,
    invariantOnly,
    targets,
    invariants,
    testCases: invariants.length > 0 && targets.length > 0
      ? [
          {
            title: "Human-reviewed local invariant harness skeleton",
            framework: "FOUNDRY",
            skeleton: foundrySkeleton(context, invariants),
            commandPreview: "forge test --fuzz-runs <configured>"
          }
        ]
      : [],
    source: {
      scanId: scan.id,
      findingId: finding?.id ?? null,
      evidenceIds,
      contractSymbolIds: scan.contractSymbols.map((symbol) => symbol.id),
      functionSymbolIds: scan.functionSymbols.map((symbol) => symbol.id),
      stateVariableIds: scan.stateVariableSymbols.map((symbol) => symbol.id),
      compilerArtifactIds,
      testRunIds: scan.testRuns.map((run) => run.id),
      simulationRunIds: scan.simulationRuns.map((run) => run.id)
    }
  };
}

function buildTargets(context: FuzzContext): FuzzTargetCandidate[] {
  const artifact = context.scan.compilerArtifacts[0] ?? null;
  const linkedContract = context.finding?.codeLinks.find((link) => link.contractSymbol)?.contractSymbol;
  const linkedFunction = context.finding?.codeLinks.find((link) => link.functionSymbol)?.functionSymbol;
  const contract = linkedContract ?? context.scan.contractSymbols[0] ?? null;
  const fn = linkedFunction ?? context.scan.functionSymbols[0] ?? null;
  const filePath = context.finding?.filePath ?? contract?.filePath ?? fn?.filePath ?? artifact?.sourceFilePath ?? null;
  const sourceRange = context.finding
    ? { startLine: context.finding.lineStart, endLine: context.finding.lineEnd }
    : fn
      ? { startLine: fn.startLine ?? null, endLine: fn.endLine ?? null }
      : null;

  if (!contract && !fn && !filePath) return [];

  return [
    {
      targetType: context.finding ? "FINDING" : "SCAN_CONTRACT",
      contractName: contract?.fullyQualifiedName ?? contract?.name ?? artifact?.contractName ?? null,
      functionName: fn?.canonicalName ?? fn?.name ?? null,
      filePath,
      sourceRange,
      abiArtifactPath: artifact?.artifactPath ?? null
    }
  ];
}

function buildInvariantCandidates(context: FuzzContext): InvariantCandidate[] {
  const candidates: InvariantCandidate[] = [];
  const haystack = [
    context.finding?.title,
    context.finding?.description,
    context.finding?.category,
    ...context.scan.stateVariableSymbols.map((item) => item.name),
    ...context.scan.functionSymbols.map((item) => item.name),
    ...context.scan.storageLayoutEntries.map((item) => item.label)
  ].filter(Boolean).join(" ").toLowerCase();

  if (/balance|reserve|total.?supply|asset/u.test(haystack)) {
    candidates.push(candidate("BALANCE_CONSERVATION", "balance_conservation", "Total tracked assets should remain conserved across fuzzed operations.", "sum(balances) <= accountedAssets", ids(context)));
  }
  if (/access|auth|owner|admin|role|permission/u.test(haystack)) {
    candidates.push(candidate("ACCESS_CONTROL_CONSISTENCY", "access_control_consistency", "Privileged functions should remain unreachable to unauthorized callers.", "unauthorizedCallerCannotChangePrivilegedState", ids(context)));
  }
  if (/pause|paused|pausable/u.test(haystack)) {
    candidates.push(candidate("PAUSED_STATE_RESTRICTIONS", "paused_state_restrictions", "State-changing functions should honor persisted paused-state restrictions.", "whenPausedStateChangingActionsRevert", ids(context)));
  }
  if (/proxy|upgrade|implementation|admin slot/u.test(haystack)) {
    candidates.push(candidate("UPGRADE_ADMIN_RESTRICTIONS", "upgrade_admin_restrictions", "Upgrade or admin functions should preserve persisted authorization boundaries.", "unauthorizedUpgradeCannotSucceed", ids(context)));
  }
  if (context.scan.externalCallSites.some((site) => /transfer|call|send/u.test(site.targetExpression ?? "")) || /transfer|withdraw/u.test(haystack)) {
    candidates.push(candidate("NO_UNAUTHORIZED_ASSET_TRANSFER", "no_unauthorized_asset_transfer", "Unauthorized fuzzed callers should not move assets from protected accounting paths.", "unauthorizedAssetTransferDoesNotOccur", ids(context)));
  }
  if (/oracle|price|twap/u.test(haystack)) {
    candidates.push(candidate("ORACLE_VALUE_BOUNDS", "oracle_value_bounds_placeholder", "Oracle value bounds can be checked only when persisted oracle context identifies trusted feeds.", null, ids(context)));
  }
  if (context.scan.externalCallSites.some((site) => site.stateUpdateAfterCall) || /reentran|external call/u.test(haystack)) {
    candidates.push(candidate("REENTRANCY_SENSITIVE_PATTERN", "reentrancy_sensitive_pattern", "External-call paths should not allow reentrant state inconsistencies in local fuzz harnesses.", "noReentrantStateInconsistency", ids(context)));
  }

  return candidates.length > 0
    ? candidates
    : [candidate("GENERIC_STATE_CONSISTENCY", "generic_state_consistency", "Persisted state and function context should be reviewed for project-specific invariants.", null, ids(context))];
}

function candidate(category: string, name: string, description: string, expression: string | null, sourceIds: string[]): InvariantCandidate {
  return { category, name, description, expression, skeleton: null, sourceIds };
}

function ids(context: FuzzContext): string[] {
  return [
    ...(context.finding?.evidenceItems.map((item) => item.id) ?? []),
    ...context.scan.contractSymbols.slice(0, 5).map((item) => item.id),
    ...context.scan.functionSymbols.slice(0, 5).map((item) => item.id)
  ];
}

function foundrySkeleton(context: FuzzContext, invariants: InvariantCandidate[]): string {
  const title = context.finding ? `Finding ${context.finding.id}` : `Scan ${context.scan.id}`;
  return [
    "// P8 local-only fuzz/invariant skeleton. Requires human review before use.",
    "// This file is not executed automatically and does not broadcast live transactions.",
    "contract LocalOnlyInvariantHarness {",
    `  // Context: ${title}`,
    ...invariants.slice(0, 5).flatMap((invariant) => [
      `  // Candidate: ${invariant.category} - ${invariant.description}`,
      `  function invariant_${invariant.name}() public view {`,
      "    // Implement project-specific defensive assertion using persisted artifacts only.",
      "  }"
    ]),
    "}"
  ].join("\n");
}

function chooseToolKind(tools: FuzzToolAvailability[]): FuzzToolKind {
  return tools.find((tool) => tool.toolName === "forge" && tool.available)?.toolKind ?? "FOUNDRY";
}

function notEligible(
  reason: string,
  status: FuzzEligibility["status"],
  safetyLevel: FuzzEligibility["safetyLevel"],
  tools: FuzzToolAvailability[],
  limitations: string[]
): FuzzEligibility {
  return { eligible: false, status, reason, safetyLevel, toolAvailability: tools, limitations };
}

function checksumJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))).digest("hex");
}
