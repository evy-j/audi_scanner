export type ScanStatus =
  | "DRAFT"
  | "QUEUED"
  | "PREPARING"
  | "RUNNING"
  | "ANALYZING"
  | "NORMALIZING"
  | "SCORING"
  | "REPORTING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export type Severity = "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Scan {
  id: string;
  organizationId: string;
  projectId?: string | null;
  chainId?: string | null;
  contractId?: string | null;
  type: string;
  status: ScanStatus;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title?: string | null;
  progress: number;
  riskScore: number | string;
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  targets?: ScanTarget[];
  vulnerabilities?: Vulnerability[];
  reports?: AuditReport[];
  analyzerRuns?: AnalyzerRun[];
  events?: ScanEvent[];
}

export interface ScanTarget {
  id: string;
  targetType: string;
  contractAddress?: string | null;
  normalizedAddress?: string | null;
  repositoryUrl?: string | null;
  artifactStorageKey?: string | null;
}

export interface Vulnerability {
  id: string;
  scanId: string;
  analyzer: string;
  externalRuleId?: string | null;
  fingerprint: string;
  category: string;
  title: string;
  description?: string | null;
  severity: Severity;
  confidence: string;
  confidenceState?: string;
  status: string;
  severityScore?: number | string;
  confidenceScore?: number | string;
  exploitabilityScore?: number | string;
  priorityScore?: number | string;
  evidenceQuality?: number | string;
  filePath?: string | null;
  contractName?: string | null;
  functionName?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  remediation?: string | null;
  createdAt: string;
  evidenceItems?: FindingEvidence[];
  decisions?: FindingDecision[];
  review?: FindingReview | null;
  codeLinks?: FindingCodeLink[];
}

export interface FindingEvidence {
  id: string;
  findingId: string;
  analyzerRunId?: string | null;
  evidenceType: "ANALYZER" | "SOURCE" | "TRACE";
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  startColumn?: number | null;
  endColumn?: number | null;
  snippet?: string | null;
  ruleId?: string | null;
  detectorName?: string | null;
  message?: string | null;
  confidenceContribution: number | string;
  rawArtifactPath?: string | null;
  rawArtifactChecksum?: string | null;
  analyzerRun?: AnalyzerRun | null;
  analyzerEvidence?: unknown;
  traceEvidence?: unknown;
}

export interface FindingDecision {
  id: string;
  state: string;
  severityScore: number | string;
  confidenceScore: number | string;
  exploitabilityScore: number | string;
  priorityScore: number | string;
  reason: string;
  decidedAt: string;
}

export type FindingReviewStatus =
  | "UNREVIEWED"
  | "NEEDS_REVIEW"
  | "ACCEPTED"
  | "FALSE_POSITIVE"
  | "RISK_ACCEPTED"
  | "FIXED"
  | "WONT_FIX"
  | "DUPLICATE"
  | "SUPPRESSED";

export interface FindingReview {
  id: string;
  organizationId: string;
  projectId: string;
  scanId: string;
  findingId: string;
  status: FindingReviewStatus;
  statusBeforeSuppression?: FindingReviewStatus | null;
  severityOverride?: Severity | null;
  confidenceOverride?: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  assignedToTeam?: string | null;
  events?: FindingReviewEvent[];
  comments?: FindingComment[];
  assignments?: FindingAssignment[];
  suppressionRule?: FindingSuppressionRule | null;
}

export interface FindingReviewEvent {
  id: string;
  action: string;
  actorUserId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  createdAt: string;
}

export interface FindingComment {
  id: string;
  actorUserId?: string | null;
  body: string;
  createdAt: string;
}

export interface FindingAssignment {
  id: string;
  actorUserId?: string | null;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  assigneeTeam?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface FindingSuppressionRule {
  id: string;
  projectId: string;
  analyzerName?: string | null;
  ruleId?: string | null;
  filePath?: string | null;
  functionName?: string | null;
  fingerprint?: string | null;
  severity?: Severity | null;
  messageContains?: string | null;
  reason: string;
  active: boolean;
  createdAt: string;
}

export interface CodeOwnerRule {
  id: string;
  projectId: string;
  pathPattern: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerTeam?: string | null;
  severityThreshold?: Severity | null;
  active: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  findingCount: number;
  suppressedCount: number;
  statusCounts: Record<string, number>;
  severityCounts: Record<string, number>;
}

export interface BaselineComparison {
  scanId: string;
  organizationId: string;
  projectId: string;
  baseScanId?: string | null;
  newFindings: Vulnerability[];
  existingFindings: Vulnerability[];
  fixedFindings: Vulnerability[];
  regressedFindings: Vulnerability[];
  suppressedFindings: Vulnerability[];
}

export interface AnalyzerRun {
  id: string;
  scanId: string;
  analyzer: string;
  toolName: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  error?: string | null;
  rawArtifactKey?: string | null;
  rawArtifactChecksumSha256?: string | null;
  standardizedArtifactKey?: string | null;
}

export interface EvidenceSummary {
  scanId: string;
  organizationId: string;
  analyzerRuns: AnalyzerRun[];
  findingCount: number;
  evidenceCount: number;
  severityCounts: Record<string, number>;
  stateCounts: Record<string, number>;
  maxPriorityScore: number;
  maxExploitabilityScore: number;
  averageEvidenceQuality: number;
}

export type ExtractionStatus = "EXTRACTED" | "PARTIAL" | "NOT_ASSESSED" | "FAILED";
export type BuildToolKind = "FOUNDRY" | "HARDHAT" | "TRUFFLE" | "NPM_SOLIDITY" | "PLAIN_SOLIDITY" | "UNKNOWN";
export type BuildRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMEOUT" | "TOOL_NOT_INSTALLED" | "NOT_ASSESSED";
export type TestRunStatus = "QUEUED" | "RUNNING" | "PASSED" | "FAILED" | "TIMEOUT" | "TOOL_NOT_INSTALLED" | "NOT_ASSESSED";
export type AiValidationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMEOUT" | "PROVIDER_NOT_CONFIGURED" | "NOT_ASSESSED";
export type AiValidationDecision =
  | "EVIDENCE_STRONG"
  | "EVIDENCE_MEDIUM"
  | "EVIDENCE_WEAK"
  | "LIKELY_FALSE_POSITIVE"
  | "NEEDS_HUMAN_REVIEW"
  | "CONTRADICTED"
  | "NOT_ENOUGH_EVIDENCE";
export type AiValidationScope = "FINDING" | "SCAN_SUMMARY" | "REVIEW_ASSIST" | "REMEDIATION_EXPLANATION";
export type RemediationStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMEOUT"
  | "PROVIDER_NOT_CONFIGURED"
  | "NOT_ELIGIBLE"
  | "NOT_ASSESSED";
export type RemediationKind =
  | "GUIDANCE"
  | "SECURE_DIFF_SUGGESTION"
  | "TEST_SUGGESTION"
  | "REGRESSION_CHECKLIST";
export type PatchSafetyStatus =
  | "SAFE_TO_REVIEW"
  | "NEEDS_HUMAN_REVIEW"
  | "BEHAVIOR_CHANGING"
  | "UNSAFE"
  | "NOT_ASSESSED";
export type SimulationStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMEOUT"
  | "TOOL_NOT_INSTALLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "NOT_ASSESSED"
  | "NOT_ELIGIBLE"
  | "REPRODUCED"
  | "NOT_REPRODUCED"
  | "INCONCLUSIVE";
export type SimulationKind =
  | "FORK_REPLAY"
  | "INVARIANT_CHECK"
  | "ACCESS_CONTROL_CHECK"
  | "REENTRANCY_PROBE"
  | "ORACLE_MANIPULATION_CHECK"
  | "PROXY_UPGRADE_CHECK"
  | "GENERIC_REPRODUCTION";
export type SimulationSafetyLevel = "LOCAL_ONLY" | "TESTNET_ONLY" | "DISABLED";
export type FuzzRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "TIMEOUT"
  | "TOOL_NOT_INSTALLED"
  | "NOT_ASSESSED"
  | "NOT_ELIGIBLE"
  | "INCONCLUSIVE";
export type FuzzToolKind = "FOUNDRY" | "ECHIDNA" | "MEDUSA" | "HARDHAT" | "UNKNOWN";
export type InvariantStatus = "PASSED" | "FAILED" | "INCONCLUSIVE" | "NOT_ASSESSED";
export type MonitorStatus = "ACTIVE" | "PAUSED" | "DISABLED" | "ERROR";
export type MonitorTargetKind = "CONTRACT" | "PROXY" | "TOKEN" | "POOL" | "GOVERNANCE" | "WALLET" | "PROJECT";
export type MonitorRuleKind =
  | "PROXY_UPGRADE"
  | "ADMIN_ROLE_CHANGE"
  | "PRIVILEGED_FUNCTION_CALL"
  | "OWNERSHIP_TRANSFER"
  | "PAUSE_UNPAUSE"
  | "LIQUIDITY_REMOVAL"
  | "LARGE_TOKEN_TRANSFER"
  | "ORACLE_DEVIATION"
  | "CONTRACT_ACTIVITY_DRIFT"
  | "UNKNOWN_EVENT_SPIKE"
  | "CUSTOM_EVENT_MATCH";
export type MonitorEventStatus = "OBSERVED" | "CONFIRMED" | "REORGED" | "FAILED" | "NOT_ASSESSED";
export type AlertSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED" | "SUPPRESSED";

export interface AiProviderState {
  configured: boolean;
  provider: string;
  model?: string | null;
  status: "CONFIGURED" | "PROVIDER_NOT_CONFIGURED";
}

export interface AiProviderUsage {
  id: string;
  provider: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costEstimate?: number | string | null;
  currency?: string | null;
  createdAt: string;
}

export interface AiReviewNote {
  id: string;
  scope: AiValidationScope;
  noteType: string;
  title?: string | null;
  body: string;
  evidenceIdsUsed: string[];
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AiEvidenceCritique {
  id: string;
  findingEvidenceId?: string | null;
  evidenceReference?: string | null;
  supportLevel?: string | null;
  critique: string;
  missingContext?: string | null;
  createdAt: string;
}

export interface AiValidationRun {
  id: string;
  scanId: string;
  findingId?: string | null;
  provider: string;
  model?: string | null;
  promptVersion: string;
  scope: AiValidationScope;
  status: AiValidationStatus;
  decision?: AiValidationDecision | null;
  falsePositiveRisk?: number | null;
  evidenceCoverageScore?: number | null;
  hallucinationRisk?: number | null;
  outputArtifactPath?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  errorCategory?: string | null;
  error?: string | null;
  reviewNotes?: AiReviewNote[];
  providerUsage?: AiProviderUsage[];
}

export interface AiFindingValidation {
  id: string;
  decision: AiValidationDecision;
  reasoningSummary: string;
  evidenceIdsUsed: string[];
  missingEvidence: string[];
  contradictionNotes?: string | null;
  suggestedReviewStatus?: FindingReviewStatus | null;
  confidenceAdjustmentSuggestion?: number | string | null;
  falsePositiveRisk: number;
  evidenceCoverageScore: number;
  hallucinationRisk: number;
  humanReviewerChecklist: string[];
  remediationExplanation?: string | null;
  createdAt: string;
  aiValidationRun?: AiValidationRun;
  evidenceCritiques?: AiEvidenceCritique[];
}

export interface AiScanValidationSummary {
  provider: AiProviderState;
  scanId: string;
  organizationId: string;
  status: AiValidationStatus;
  runs: AiValidationRun[];
}

export interface AiFindingValidationResponse {
  provider: AiProviderState;
  findingId: string;
  scanId: string;
  organizationId: string;
  status: AiValidationStatus;
  validations: AiFindingValidation[];
  latestRun?: AiValidationRun | null;
}

export interface RemediationEligibility {
  eligible: boolean;
  status: "ELIGIBLE" | "NOT_ELIGIBLE";
  reason?: string | null;
  guidanceOnly: boolean;
}

export interface RemediationSuggestion {
  id: string;
  kind: RemediationKind;
  safetyStatus: PatchSafetyStatus;
  title: string;
  body: string;
  behaviorChangeNotes: string[];
  limitations: string[];
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface RemediationDiff {
  id: string;
  safetyStatus: PatchSafetyStatus;
  filePath: string;
  originalStartLine?: number | null;
  originalEndLine?: number | null;
  originalStartColumn?: number | null;
  originalEndColumn?: number | null;
  proposedPatch: string;
  explanation: string;
  risk: string;
  behaviorChangeNotes: string[];
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface RemediationTestSuggestion {
  id: string;
  kind: RemediationKind;
  title: string;
  testFramework?: string | null;
  description: string;
  skeleton?: string | null;
  expectedFailingBefore?: string | null;
  expectedFixedAfter?: string | null;
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface RemediationChecklistItem {
  id: string;
  kind: RemediationKind;
  item: string;
  requiresHumanReview: boolean;
  createdAt: string;
}

export interface RemediationReviewEvent {
  id: string;
  action: string;
  actorUserId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  comment?: string | null;
  createdAt: string;
}

export interface RemediationRun {
  id: string;
  scanId: string;
  findingId: string;
  provider: string;
  model?: string | null;
  promptVersion: string;
  status: RemediationStatus;
  kind: RemediationKind;
  safetyStatus: PatchSafetyStatus;
  inputEvidenceChecksum?: string | null;
  outputArtifactPath?: string | null;
  outputArtifactChecksumSha256?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorCategory?: string | null;
  error?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costEstimate?: number | string | null;
  currency?: string | null;
  reviewedAt?: string | null;
  rejectedAt?: string | null;
  suggestions?: RemediationSuggestion[];
  diffs?: RemediationDiff[];
  testSuggestions?: RemediationTestSuggestion[];
  checklistItems?: RemediationChecklistItem[];
  reviewEvents?: RemediationReviewEvent[];
}

export interface FindingRemediationResponse {
  provider: AiProviderState;
  findingId: string;
  scanId: string;
  organizationId: string;
  status: RemediationStatus;
  eligibility: RemediationEligibility;
  diffSuggestionsAllowed: boolean;
  limitations: string[];
  runs: RemediationRun[];
}

export interface ScanRemediationSummary {
  provider: AiProviderState;
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  remediationCount: number;
  status: RemediationStatus;
  statusCounts: Record<string, number>;
  runs: RemediationRun[];
}

export interface SimulationToolAvailability {
  toolName: string;
  available: boolean;
  status: string;
  version?: string | null;
  errorCategory?: string | null;
}

export interface SimulationState {
  enabled: boolean;
  safetyLevel: SimulationSafetyLevel;
  rpcProviderName?: string | null;
  warning: string;
}

export interface SimulationEligibilityRecord {
  id: string;
  eligible: boolean;
  status: SimulationStatus;
  reason?: string | null;
  safetyLevel: SimulationSafetyLevel;
  toolAvailability?: SimulationToolAvailability[] | null;
  limitations: string[];
  createdAt: string;
}

export interface SimulationArtifact {
  id: string;
  artifactType: string;
  artifactPath: string;
  checksumSha256: string;
  sizeBytes?: number | null;
  redacted: boolean;
  createdAt: string;
}

export interface SimulationPlan {
  id: string;
  kind: SimulationKind;
  title: string;
  summary: string;
  assumptions: string[];
  limitations: string[];
  commandPreview?: string | null;
  planArtifactPath?: string | null;
  planChecksumSha256?: string | null;
  createdAt: string;
}

export interface SimulationStep {
  id: string;
  sortOrder: number;
  title: string;
  description: string;
  expectedSignal?: string | null;
  status: SimulationStatus;
  createdAt: string;
}

export interface SimulationTrace {
  id: string;
  traceKind: string;
  artifactPath?: string | null;
  checksumSha256?: string | null;
  summary?: string | null;
  createdAt: string;
}

export interface SimulationAssetDelta {
  id: string;
  assetType: string;
  assetAddress?: string | null;
  accountAddress?: string | null;
  delta: string;
  unit?: string | null;
  direction?: string | null;
  summary?: string | null;
  createdAt: string;
}

export interface SimulationDecision {
  id: string;
  decision: SimulationStatus;
  rationale: string;
  evidenceArtifactIds: string[];
  suggestedConfidenceAdjustment?: string | null;
  createdAt: string;
}

export interface SimulationRun {
  id: string;
  scanId: string;
  findingId: string;
  status: SimulationStatus;
  kind: SimulationKind;
  safetyLevel: SimulationSafetyLevel;
  forkChainId?: number | null;
  forkBlockNumber?: string | number | null;
  rpcProviderName?: string | null;
  commandExecuted?: string | null;
  inputEvidenceChecksum?: string | null;
  stdoutArtifactPath?: string | null;
  stdoutChecksumSha256?: string | null;
  stderrArtifactPath?: string | null;
  stderrChecksumSha256?: string | null;
  traceArtifactPath?: string | null;
  traceChecksumSha256?: string | null;
  assetDeltaSummary?: Record<string, unknown> | null;
  decision: SimulationStatus;
  notEligibleReason?: string | null;
  errorCategory?: string | null;
  error?: string | null;
  suggestedConfidenceAdjustment?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  plans?: SimulationPlan[];
  steps?: SimulationStep[];
  traces?: SimulationTrace[];
  assetDeltas?: SimulationAssetDelta[];
  eligibilityRecords?: SimulationEligibilityRecord[];
  artifacts?: SimulationArtifact[];
  decisions?: SimulationDecision[];
}

export interface FindingSimulationResponse {
  simulation: SimulationState;
  findingId: string;
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  status: SimulationStatus;
  decision: SimulationStatus;
  runs: SimulationRun[];
}

export interface ScanSimulationSummary {
  simulation: SimulationState;
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  simulationCount: number;
  status: SimulationStatus;
  decision: SimulationStatus;
  statusCounts: Record<string, number>;
  decisionCounts: Record<string, number>;
  runs: SimulationRun[];
}

export interface FuzzToolAvailability {
  toolName: string;
  toolKind: FuzzToolKind;
  available: boolean;
  status: string;
  version?: string | null;
  errorCategory?: string | null;
}

export interface FuzzingState {
  enabled: boolean;
  safetyLevel: "LOCAL_ONLY" | "DISABLED";
  defaultRuns: number;
  warning: string;
}

export interface FuzzArtifact {
  id: string;
  artifactType: string;
  artifactPath: string;
  checksumSha256: string;
  sizeBytes?: number | null;
  redacted: boolean;
  createdAt: string;
}

export interface FuzzTarget {
  id: string;
  targetType: string;
  contractName?: string | null;
  functionName?: string | null;
  filePath?: string | null;
  sourceRange?: Record<string, unknown> | null;
  abiArtifactPath?: string | null;
  createdAt: string;
}

export interface FuzzTestCase {
  id: string;
  title: string;
  framework: FuzzToolKind;
  skeleton?: string | null;
  generatedOnly: boolean;
  status: FuzzRunStatus;
  commandPreview?: string | null;
  createdAt: string;
}

export interface FuzzCounterexample {
  id: string;
  summary: string;
  artifactPath?: string | null;
  checksumSha256?: string | null;
  rawExcerpt?: string | null;
  createdAt: string;
}

export interface InvariantDefinition {
  id: string;
  category: string;
  name: string;
  description: string;
  expression?: string | null;
  skeleton?: string | null;
  source: string;
  status: InvariantStatus;
  createdAt: string;
}

export interface InvariantResult {
  id: string;
  status: InvariantStatus;
  summary: string;
  counterexampleArtifactPath?: string | null;
  counterexampleChecksumSha256?: string | null;
  gasUsed?: string | number | null;
  createdAt: string;
}

export interface InvariantRun {
  id: string;
  toolKind: FuzzToolKind;
  status: InvariantStatus;
  commandExecuted?: string | null;
  errorCategory?: string | null;
  error?: string | null;
  createdAt: string;
  results?: InvariantResult[];
}

export interface CoverageSummary {
  id: string;
  toolKind: FuzzToolKind;
  status: InvariantStatus;
  lineCoveragePct?: number | string | null;
  functionCoveragePct?: number | string | null;
  branchCoveragePct?: number | string | null;
  artifactPath?: string | null;
  checksumSha256?: string | null;
  createdAt: string;
}

export interface FuzzRun {
  id: string;
  scanId: string;
  findingId?: string | null;
  toolKind: FuzzToolKind;
  status: FuzzRunStatus;
  safetyLevel: string;
  commandExecuted?: string | null;
  inputContextChecksum?: string | null;
  stdoutArtifactPath?: string | null;
  stdoutChecksumSha256?: string | null;
  stderrArtifactPath?: string | null;
  stderrChecksumSha256?: string | null;
  counterexampleArtifactPath?: string | null;
  counterexampleChecksumSha256?: string | null;
  invariantStatus?: InvariantStatus | null;
  gasUsed?: string | number | null;
  errorCategory?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  targets?: FuzzTarget[];
  testCases?: FuzzTestCase[];
  counterexamples?: FuzzCounterexample[];
  invariantRuns?: InvariantRun[];
  invariantDefinitions?: InvariantDefinition[];
  invariantResults?: InvariantResult[];
  coverageSummaries?: CoverageSummary[];
  artifacts?: FuzzArtifact[];
}

export interface FindingFuzzResponse {
  fuzzing: FuzzingState;
  findingId: string;
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  status: FuzzRunStatus;
  invariantStatus: InvariantStatus;
  runs: FuzzRun[];
}

export interface ScanFuzzSummary {
  fuzzing: FuzzingState;
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  fuzzRunCount: number;
  status: FuzzRunStatus;
  invariantStatus: InvariantStatus;
  statusCounts: Record<string, number>;
  invariantCounts: Record<string, number>;
  runs: FuzzRun[];
}

export interface ScanInvariantResponse {
  fuzzing: FuzzingState;
  id: string;
  organizationId: string;
  projectId?: string | null;
  invariantDefinitions: InvariantDefinition[];
  invariantRuns: InvariantRun[];
}

export interface MonitoringState {
  enabled: boolean;
  status: "ACTIVE" | "DISABLED" | "NOT_ASSESSED";
  chainId?: number | null;
  providerName?: string | null;
  pollIntervalMs: number;
  maxBlockRange: number;
  reorgDepth: number;
  maxEventsPerRun: number;
  webhooksEnabled: boolean;
  warning: string;
}

export interface MonitorRule {
  id: string;
  kind: MonitorRuleKind;
  status: MonitorStatus;
  severity: AlertSeverity;
  name: string;
  eventSignature?: string | null;
  functionSelector?: string | null;
  threshold?: string | null;
  config?: Record<string, unknown> | null;
  createdAt: string;
}

export interface MonitorCursor {
  id: string;
  chainId: number;
  providerName?: string | null;
  lastProcessedBlock?: string | number | null;
  lastFinalizedBlock?: string | number | null;
  status: MonitorEventStatus;
  errorCategory?: string | null;
  error?: string | null;
  updatedAt: string;
}

export interface MonitorRun {
  id: string;
  status: MonitorEventStatus;
  providerName?: string | null;
  fromBlock?: string | number | null;
  toBlock?: string | number | null;
  latestBlock?: string | number | null;
  eventCount: number;
  transactionCount: number;
  alertCount: number;
  errorCategory?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface AlertEvidence {
  id: string;
  ruleKind: MonitorRuleKind;
  targetAddress: string;
  chainId: number;
  transactionHash: string;
  blockNumber: string | number;
  logIndex?: number | null;
  txInputSelector?: string | null;
  providerName?: string | null;
  decodedData?: Record<string, unknown> | null;
  rawData?: Record<string, unknown> | null;
  rawArtifactPath?: string | null;
  rawArtifactChecksumSha256?: string | null;
  observedAt: string;
}

export interface MonitorAlert {
  id: string;
  projectId: string;
  targetId?: string | null;
  kind: MonitorRuleKind;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  summary: string;
  targetAddress: string;
  transactionHash?: string | null;
  blockNumber?: string | number | null;
  logIndex?: number | null;
  providerName?: string | null;
  observedAt: string;
  evidence?: AlertEvidence[];
  webhookDeliveries?: AlertWebhookDelivery[];
}

export interface MonitorTarget {
  id: string;
  projectId: string;
  scanId?: string | null;
  chainId: number;
  address: string;
  normalizedAddress: string;
  kind: MonitorTargetKind;
  status: MonitorStatus;
  displayName?: string | null;
  source: string;
  providerName?: string | null;
  rules?: MonitorRule[];
  cursors?: MonitorCursor[];
  runs?: MonitorRun[];
  alerts?: MonitorAlert[];
  createdAt: string;
}

export interface AlertWebhookDelivery {
  id: string;
  status: string;
  attempts: number;
  responseStatus?: number | null;
  errorCategory?: string | null;
  error?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export interface ProjectWebhook {
  id: string;
  projectId: string;
  name?: string | null;
  redactedUrl: string;
  urlSha256: string;
  signingSecretHash: string;
  status: string;
  lastDeliveredAt?: string | null;
  createdAt: string;
}

export interface MonitorTargetsResponse {
  monitoring: MonitoringState;
  targets: MonitorTarget[];
}

export interface MonitorAlertsResponse {
  monitoring: MonitoringState;
  alerts: MonitorAlert[];
}

export interface ScanMonitoringSummary {
  monitoring: MonitoringState;
  id: string;
  organizationId: string;
  projectId?: string | null;
  monitorTargets: MonitorTarget[];
  monitorRuns: MonitorRun[];
  monitorAlerts: MonitorAlert[];
}

export type ThreatIntelSourceType =
  | "INTERNAL_SCAN"
  | "USER_FEEDBACK"
  | "PUBLIC_REPORT"
  | "INCIDENT_WRITEUP"
  | "AUDIT_REPORT"
  | "MONITORING_EVENT"
  | "SIMULATION_ARTIFACT"
  | "FUZZ_ARTIFACT"
  | "MANUAL_REVIEW"
  | "UNKNOWN";

export type ThreatIntelConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERIFIED" | "DISPUTED";

export type ThreatSignatureKind =
  | "REENTRANCY"
  | "ACCESS_CONTROL"
  | "ORACLE_MANIPULATION"
  | "PROXY_UPGRADE"
  | "STORAGE_COLLISION"
  | "GOVERNANCE"
  | "BRIDGE"
  | "RUGPULL"
  | "HONEYPOT"
  | "DOS"
  | "INTEGER_PRECISION"
  | "UNCHECKED_CALL"
  | "FRONT_RUNNING"
  | "MEV"
  | "LIQUIDITY_RISK"
  | "UNKNOWN";

export type ThreatMatchStatus = "MATCHED" | "PARTIAL" | "NOT_MATCHED" | "INCONCLUSIVE" | "NOT_ASSESSED";

export interface ThreatSignature {
  id: string;
  kind: ThreatSignatureKind;
  name: string;
  description: string;
  defensiveSummary: string;
  confidence: ThreatIntelConfidence;
  affectedAnalyzers: string[];
  affectedRuleIds: string[];
  evidenceRequirements: string[];
  pattern?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  source?: ThreatSource | null;
  threatIntelEntry?: Pick<ThreatIntelEntry, "id" | "title" | "sourceType" | "confidence" | "provenanceUrl" | "provenanceHash" | "provenanceReference"> | null;
  conditions?: ThreatSignatureCondition[];
  createdAt: string;
}

export interface ThreatSignatureCondition {
  id: string;
  conditionKey: string;
  conditionType: string;
  operator: string;
  expectedValue?: unknown;
  evidenceType?: string | null;
  required: boolean;
}

export interface ThreatSource {
  id: string;
  sourceType: ThreatIntelSourceType;
  title?: string | null;
  provenanceUrl?: string | null;
  provenanceHash?: string | null;
  provenanceReference?: string | null;
  artifactPath?: string | null;
  artifactChecksumSha256?: string | null;
  confidence: ThreatIntelConfidence;
  createdAt: string;
}

export interface ThreatIntelEntry {
  id: string;
  sourceType: ThreatIntelSourceType;
  confidence: ThreatIntelConfidence;
  title: string;
  summary: string;
  provenanceUrl?: string | null;
  provenanceHash?: string | null;
  provenanceReference?: string | null;
  reviewerNotes?: string | null;
  sources?: ThreatSource[];
  incidentReferences?: IncidentReference[];
  signatures?: ThreatSignature[];
  createdAt: string;
}

export interface ThreatSignatureMatch {
  id: string;
  signatureId: string;
  scanId?: string | null;
  findingId?: string | null;
  alertId?: string | null;
  status: ThreatMatchStatus;
  confidence: ThreatIntelConfidence;
  matchScore: string | number;
  evidenceIdsUsed: string[];
  missingEvidence: string[];
  suggestedPriorityAdjustment?: string | number | null;
  humanReviewChecklist: string[];
  rationale: string;
  signature: ThreatSignature;
  finding?: Pick<Vulnerability, "id" | "title" | "severity" | "confidence" | "status" | "analyzer" | "externalRuleId"> | null;
  alert?: Pick<MonitorAlert, "id" | "title" | "severity" | "kind" | "transactionHash" | "blockNumber" | "logIndex"> | null;
  createdAt: string;
}

export interface DetectorPrecisionMetric {
  id: string;
  analyzer?: string | null;
  ruleId?: string | null;
  severity?: Severity | null;
  truePositiveCount: number;
  falsePositiveCount: number;
  suppressionCount: number;
  acceptedCount: number;
  reproducedCount: number;
  notReproducedCount: number;
  precisionEstimate: string | number;
  measuredAt: string;
}

export interface FalsePositiveFeedback {
  id: string;
  findingId: string;
  signatureId?: string | null;
  signatureMatchId?: string | null;
  reason: string;
  evidenceIds: string[];
  confidence: ThreatIntelConfidence;
  reviewerNotes?: string | null;
  createdAt: string;
}

export interface IncidentReference {
  id: string;
  sourceType: ThreatIntelSourceType;
  title: string;
  url?: string | null;
  referenceHash?: string | null;
  summary: string;
  confidence: ThreatIntelConfidence;
  createdAt: string;
}

export interface ScanThreatSummary {
  scanId: string;
  matchCount: number;
  highConfidenceMatches: number;
  falsePositiveFeedbackCount: number;
  incidentReferenceCount: number;
  threatIntelEntryCount: number;
  matches: ThreatSignatureMatch[];
  detectorPrecisionMetrics: DetectorPrecisionMetric[];
  falsePositiveFeedback: FalsePositiveFeedback[];
  incidentReferences: IncidentReference[];
  limitations: string[];
}

export interface DetectorPrecisionResponse {
  metrics: DetectorPrecisionMetric[];
}

export interface BuildProfile {
  id: string;
  scanId: string;
  toolKind: BuildToolKind;
  toolName: string;
  toolVersion?: string | null;
  projectRoot: string;
  configFile?: string | null;
  confidence: number | string;
  detectionReason: string;
}

export interface CompilerArtifact {
  id: string;
  scanId: string;
  buildRunId?: string | null;
  toolKind: BuildToolKind;
  artifactKind: string;
  artifactPath: string;
  artifactKey: string;
  checksumSha256: string;
  sizeBytes: number;
  compilerVersion?: string | null;
  contractName?: string | null;
  sourceFilePath?: string | null;
}

export interface TestResult {
  id: string;
  testRunId: string;
  suiteName?: string | null;
  testName: string;
  status: string;
  durationMs?: number | null;
  failureMessage?: string | null;
  gasUsed?: number | string | null;
}

export interface TestRun {
  id: string;
  scanId: string;
  buildRunId?: string | null;
  toolKind: BuildToolKind;
  command: string;
  status: TestRunStatus;
  exitCode?: number | null;
  stdoutArtifactKey?: string | null;
  stderrArtifactKey?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorCategory?: string | null;
  error?: string | null;
  results?: TestResult[];
}

export interface BuildRun {
  id: string;
  scanId: string;
  buildProfileId?: string | null;
  toolKind: BuildToolKind;
  command: string;
  status: BuildRunStatus;
  exitCode?: number | null;
  stdoutArtifactKey?: string | null;
  stderrArtifactKey?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorCategory?: string | null;
  error?: string | null;
  artifactChecksumSha256?: string | null;
  artifactPath?: string | null;
  compilerArtifacts?: CompilerArtifact[];
  testRuns?: TestRun[];
}

export interface AnalyzerToolAvailability {
  id: string;
  scanId: string;
  toolKind: BuildToolKind;
  toolName: string;
  toolVersion?: string | null;
  available: boolean;
  status: string;
  detectionCommand?: string | null;
  errorCategory?: string | null;
  error?: string | null;
  artifactKey?: string | null;
  checkedAt: string;
}

export interface AnalysisIrRun {
  id: string;
  scanId: string;
  analyzerRunId?: string | null;
  artifactKey?: string | null;
  artifactChecksum?: string | null;
  extractionStatus: ExtractionStatus;
  startedAt: string;
  finishedAt?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AnalysisIrSummary {
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  extractionStatus: ExtractionStatus;
  latestRun?: AnalysisIrRun | null;
  runs: AnalysisIrRun[];
  contractCount: number;
  functionCount: number;
  modifierCount: number;
  eventCount: number;
  stateVariableCount: number;
  callGraphEdgeCount: number;
  externalCallCount: number;
  storageLayoutCount: number;
  sourceMapCount: number;
  findingCodeLinkCount: number;
}

export interface ContractSymbol {
  id: string;
  name: string;
  kind?: string | null;
  fullyQualifiedName: string;
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  extractionStatus: ExtractionStatus;
  inheritance: string[];
  _count?: {
    functions: number;
    modifiers: number;
    stateVariables: number;
    events: number;
    codeLinks: number;
  };
}

export interface FunctionSymbol {
  id: string;
  contractName: string;
  name: string;
  canonicalName: string;
  kind?: string | null;
  visibility?: string | null;
  stateMutability?: string | null;
  payable: boolean;
  selector?: string | null;
  modifiers: string[];
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  extractionStatus: ExtractionStatus;
}

export interface CallGraphEdge {
  id: string;
  fromContract: string;
  fromFunction: string;
  toContract?: string | null;
  toFunction?: string | null;
  callKind: string;
  targetExpression?: string | null;
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  extractionStatus: ExtractionStatus;
}

export interface ExternalCallSite {
  id: string;
  contractName: string;
  functionName: string;
  callKind: string;
  targetExpression?: string | null;
  valueTransfer: boolean;
  lowLevel: boolean;
  confidence: number | string;
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  extractionStatus: ExtractionStatus;
}

export interface StorageLayoutEntry {
  id: string;
  contractName: string;
  label: string;
  slot: string;
  offset: number;
  typeName: string;
  encoding?: string | null;
  numberOfBytes?: string | null;
  extractionStatus: ExtractionStatus;
}

export interface FindingCodeLink {
  id: string;
  findingId: string;
  linkType: string;
  confidence: number | string;
  reason?: string | null;
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  extractionStatus: ExtractionStatus;
  contractSymbol?: ContractSymbol | null;
  functionSymbol?: FunctionSymbol | null;
  externalCallSite?: ExternalCallSite | null;
  storageLayoutEntry?: StorageLayoutEntry | null;
  analysisIrRun?: AnalysisIrRun | null;
}

export interface ScanEvent {
  id: string;
  scanId: string;
  type: string;
  status: ScanStatus;
  progress: number;
  message: string;
  traceId?: string | null;
  correlationId?: string | null;
  emittedAt: string;
}

export interface AuditReport {
  id: string;
  scanId: string;
  organizationId: string;
  projectId?: string | null;
  reportNumber?: string | null;
  version: number;
  status: string;
  title: string;
  executiveSummary?: string | null;
  riskScore: number | string;
  includeSuppressed?: boolean;
  storageKey?: string | null;
  pdfStorageKey?: string | null;
  htmlArtifactPath?: string | null;
  markdownArtifactPath?: string | null;
  jsonArtifactPath?: string | null;
  checksumSha256?: string | null;
  generatedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  sections?: ReportSection[];
  exports?: ReportExport[];
  shareLinks?: ReportShareLink[];
  disclaimers?: ReportDisclaimer[];
}

export interface ReportSection {
  id: string;
  sectionKey: string;
  title: string;
  sortOrder: number;
  body: string;
  checksumSha256: string;
  metadata?: Record<string, unknown> | null;
}

export interface ReportExport {
  id: string;
  format: "HTML" | "PDF" | "JSON" | "SARIF" | "MARKDOWN";
  status: string;
  artifactPath?: string | null;
  checksumSha256?: string | null;
  errorCategory?: string | null;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

export interface ReportShareLink {
  id: string;
  tokenPrefix: string;
  includeSuppressed: boolean;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreatedReportShareLink extends ReportShareLink {
  shareToken: string;
}

export interface ReportDisclaimer {
  id: string;
  version: string;
  text: string;
  createdAt: string;
}

export interface UsageSummary {
  organizationId: string;
  plan: {
    id: string;
    tier: "FREE_BETA" | "DEVELOPER" | "TEAM" | "ENTERPRISE";
    name: string;
  };
  periodStart: string;
  periodEnd: string;
  counters: Array<{
    metric: string;
    used: number;
    limit: number;
    remaining: number;
  }>;
}

export type BillingProvider = "DISABLED" | "RAZORPAY" | "STRIPE" | "MANUAL";
export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "INCOMPLETE"
  | "FREE_BETA"
  | "MANUAL_OVERRIDE"
  | "SUSPENDED";
export type CheckoutStatus = "CREATED" | "COMPLETED" | "CANCELED" | "EXPIRED" | "PROVIDER_NOT_CONFIGURED" | "FAILED";

export interface BillingPlan {
  id: string;
  slug: string;
  tier: "FREE_BETA" | "DEVELOPER" | "TEAM" | "ENTERPRISE";
  name: string;
  description?: string | null;
  monthlyPriceMinor: number;
  currency: string;
  features?: string[] | null;
  entitlementLimits?: Record<string, number> | null;
  contactSales: boolean;
  active: boolean;
  prices?: BillingPrice[];
  entitlements?: BillingEntitlement[];
}

export interface BillingPrice {
  id: string;
  billingPlanId: string;
  provider: BillingProvider;
  providerPriceId?: string | null;
  nickname?: string | null;
  currency: string;
  unitAmountMinor: number;
  interval: string;
  active: boolean;
}

export interface BillingEntitlement {
  id: string;
  key: string;
  displayName: string;
  limit: number;
  enabled: boolean;
  resetPeriod: string;
}

export interface BillingStatus {
  enabled: boolean;
  provider: BillingProvider;
  configured: boolean;
  status: "CONFIGURED" | "PROVIDER_NOT_CONFIGURED";
  testMode: boolean;
  currency: string;
  checkoutConfigured: boolean;
  webhookConfigured: boolean;
  publishableKey?: string | null;
  message: string;
}

export interface BillingSubscriptionResponse {
  billing: BillingStatus;
  subscription: {
    id?: string;
    organizationId: string;
    status: SubscriptionStatus;
    provider: string;
    plan?: { id?: string; tier?: string; name?: string } | null;
  };
  customer?: Record<string, unknown> | null;
  manualOverrides: Array<Record<string, unknown>>;
  usage: UsageSummary;
}

export interface BillingPlansResponse {
  billing: BillingStatus;
  plans: BillingPlan[];
}

export interface BillingCheckoutResponse {
  status: CheckoutStatus | "PROVIDER_NOT_CONFIGURED";
  checkoutUrl?: string | null;
  message?: string;
  checkoutSession?: {
    id: string;
    status: CheckoutStatus;
    provider: BillingProvider;
    amountMinor: number;
    currency: string;
  };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  billingEmail?: string | null;
  createdAt: string;
}

export type EnterpriseRoleType = "OWNER" | "ADMIN" | "SECURITY_LEAD" | "AUDITOR" | "DEVELOPER" | "VIEWER" | "BILLING_ADMIN" | "READONLY";

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  roleType: EnterpriseRoleType;
  status: string;
  invitedEmail?: string | null;
  title?: string | null;
  createdAt: string;
  user?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
    status: string;
  };
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  roleType: EnterpriseRoleType;
  status: string;
  createdAt: string;
  user?: {
    id: string;
    email?: string | null;
    displayName?: string | null;
    status: string;
  };
}

export interface SecuritySetting {
  id: string;
  organizationId: string;
  require2fa: boolean;
  sessionTimeoutMinutes: number;
  allowedDomains: string[];
  apiKeyMaxLifetimeDays: number;
  publicReportSharingAllowed: boolean;
  webhookAllowed: boolean;
  simulationAllowed: boolean;
  fuzzingAllowed: boolean;
  monitoringAllowed: boolean;
}

export interface SsoConnection {
  id?: string;
  organizationId: string;
  providerKind: "OIDC" | "SAML";
  status: "NOT_CONFIGURED" | "CONFIGURED_NOT_ACTIVE" | "ACTIVE" | "DISABLED" | "ERROR";
  issuerUrl?: string | null;
  clientId?: string | null;
  allowedDomains?: string[];
  activeLoginFlow?: boolean;
}

export interface DataRetentionPolicy {
  id: string;
  organizationId: string;
  scanArtifactRetentionDays: number;
  reportRetentionDays: number;
  auditLogRetentionDays: number;
}

export interface EnterpriseAuditLogs {
  legacy: Array<Record<string, unknown>>;
  access: Array<Record<string, unknown>>;
  admin: Array<Record<string, unknown>>;
  apiKeys: Array<Record<string, unknown>>;
}

export interface ApiKeyRecord {
  id: string;
  organizationId: string;
  projectId?: string | null;
  githubRepositoryId?: string | null;
  name: string;
  keyPrefix: string;
  status: string;
  scopes: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface CreatedApiKey extends ApiKeyRecord {
  apiKey: string;
}

export interface GitHubAppStatus {
  configured: boolean;
  status: "CONFIGURED" | "NOT_CONFIGURED";
  message: string;
  appName?: string | null;
  missing: string[];
  clientConfigured: boolean;
  webhookConfigured: boolean;
}

export interface GitHubInstallation {
  id: string;
  organizationId: string;
  installationId: string;
  accountLogin: string;
  accountType?: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED" | "NOT_CONFIGURED";
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepository {
  id: string;
  organizationId: string;
  projectId?: string | null;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  installationId: string;
  defaultBranch?: string | null;
  visibility?: string | null;
  status: "CONNECTED" | "REMOVED" | "SUSPENDED";
  repositoryScans?: RepositoryScan[];
  sourceArtifacts?: SourceArtifact[];
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryScan {
  id: string;
  organizationId: string;
  projectId?: string | null;
  githubRepositoryId?: string | null;
  sourceArtifactId?: string | null;
  scanId?: string | null;
  source: "GITHUB_APP" | "CLI" | "CI";
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "PROVIDER_NOT_CONFIGURED" | "TOKEN_ERROR" | "MANUAL_SETUP_REQUIRED" | "NOT_ASSESSED";
  branch?: string | null;
  commitSha?: string | null;
  pullRequestNumber?: number | null;
  errorCategory?: string | null;
  logs?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SourceArtifact {
  id: string;
  organizationId: string;
  projectId?: string | null;
  githubRepositoryId?: string | null;
  scanId?: string | null;
  repoFullName?: string | null;
  branch?: string | null;
  commitSha?: string | null;
  pullRequestNumber?: number | null;
  originKind: "GITHUB_APP_ARCHIVE" | "GITHUB_APP_CHECKOUT" | "CLI_UPLOAD" | "CI_UPLOAD" | "LOCAL_PATH_REFERENCE" | "MANUAL_UPLOAD";
  status: "QUEUED" | "INGESTING" | "STORED" | "FAILED" | "REJECTED" | "EXPIRED" | "DELETED";
  storageKey?: string | null;
  archiveChecksum?: string | null;
  fileCount: number;
  totalSizeBytes: string | number;
  ignoredFileCount: number;
  rejectedFileCount: number;
  storedAt?: string | null;
  createdAt: string;
}

export interface SourceManifest {
  id: string;
  sourceArtifactId: string;
  manifestChecksum: string;
  fileCount: number;
  totalSizeBytes: string | number;
  ignoredFileCount: number;
  rejectedFileCount: number;
  manifest: Record<string, unknown>;
  createdAt: string;
}

export interface RepositoryScanBridgeResponse {
  status: string;
  repositoryScanId?: string;
  scan?: Scan;
  sourceArtifact?: SourceArtifact;
  artifact?: SourceArtifact;
  runId?: string;
  message?: string;
}

export interface ScanProgressEvent {
  eventId: string;
  sequence: number;
  type: string;
  scanId: string;
  organizationId: string;
  status: ScanStatus | string;
  progress: number;
  message: string;
  jobId?: string;
  queueName?: string;
  workerId?: string;
  data?: Record<string, unknown>;
  emittedAt: string;
}

export interface ChainExplorer {
  id: string;
  chainId: string;
  name: string;
  baseUrl: string;
  apiBaseUrl?: string | null;
  apiKeyEnvKey?: string | null;
  status: string;
  supportsContractVerification: boolean;
  createdAt: string;
}

export interface ChainFeatureSupport {
  id: string;
  chainId: string;
  featureKey: string;
  status: "SUPPORTED" | "PARTIAL" | "NOT_SUPPORTED" | "NOT_ASSESSED";
  notes?: string | null;
  requiredConfig?: Record<string, unknown> | null;
}

export interface ChainRpcEndpoint {
  id: string;
  organizationId?: string | null;
  projectId?: string | null;
  chainId: string;
  providerName: string;
  endpointEnvKey: string;
  endpointEnvKeyHash?: string;
  redactedHost?: string | null;
  priority: number;
  status: "ACTIVE" | "DISABLED" | "ERROR" | "NOT_CONFIGURED";
  lastHealthStatus?: string | null;
  lastCheckedAt?: string | null;
}

export interface ChainRegistryItem {
  id: string;
  name: string;
  slug: string;
  chainType: "EVM" | "SOLANA" | "COSMOS" | "SUBSTRATE" | "OTHER";
  environment: "MAINNET" | "TESTNET" | "DEVNET" | "LOCAL";
  status: "ACTIVE" | "DISABLED" | "DEPRECATED";
  networkId?: number | null;
  caip2Id?: string | null;
  nativeSymbol?: string | null;
  explorers?: ChainExplorer[];
  features?: ChainFeatureSupport[];
}

export interface ChainRegistryResponse {
  chains: ChainRegistryItem[];
  policy: {
    realOnly: boolean;
    rawRpcUrlsPersisted: boolean;
    explorerApiKeysPersisted: boolean;
    nonEvmAdaptersExecutable: boolean;
    notes: string[];
  };
}


export interface ContractVerificationResponse {
  chain: ChainRegistryItem;
  address: string;
  normalizedAddress: string;
  verification?: Record<string, unknown> | null;
  abi?: Record<string, unknown> | null;
  explorerLinks?: { addressUrl?: string | null; txUrl?: string | null } | null;
  limitations: string[];
}

export interface ExplorerFetchResponse {
  status: string;
  runId?: string;
  message?: string;
  verification?: Record<string, unknown>;
  sourceArtifact?: SourceArtifact | Record<string, unknown> | null;
  abiAvailable?: boolean;
  explorerLinks?: { addressUrl?: string | null };
  limitations?: string[];
}

export interface ExplorerScanResponse {
  status: string;
  scan?: Scan;
  sourceArtifact?: SourceArtifact | Record<string, unknown>;
  verification?: Record<string, unknown>;
  message?: string;
}
