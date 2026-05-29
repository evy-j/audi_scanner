export type AnalyzerName = "slither" | "mythril" | "semgrep" | "aderyn" | "foundry";

export type NormalizedSeverity = "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type NormalizedConfidence = "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED";

export type VulnerabilityCategory =
  | "REENTRANCY"
  | "INTEGER_OVERFLOW"
  | "TX_ORIGIN"
  | "ACCESS_CONTROL"
  | "DELEGATECALL"
  | "ORACLE_MANIPULATION"
  | "FLASH_LOAN"
  | "SELFDESTRUCT"
  | "UPGRADEABILITY"
  | "UNSAFE_EXTERNAL_CALL"
  | "HONEYPOT"
  | "RUG_PULL"
  | "SUSPICIOUS_OWNERSHIP"
  | "GAS_OPTIMIZATION"
  | "INSECURE_RANDOMNESS"
  | "DENIAL_OF_SERVICE"
  | "BUSINESS_LOGIC"
  | "OTHER";

export type OwaspSmartContractCategory =
  | "SC_ACCESS_CONTROL"
  | "SC_PRICE_ORACLE_MANIPULATION"
  | "SC_LOGIC_ERRORS"
  | "SC_LACK_OF_INPUT_VALIDATION"
  | "SC_REENTRANCY"
  | "SC_UNCHECKED_EXTERNAL_CALLS"
  | "SC_FLASH_LOAN_ATTACKS"
  | "SC_INTEGER_OVERFLOW_UNDERFLOW"
  | "SC_INSECURE_RANDOMNESS"
  | "SC_DENIAL_OF_SERVICE"
  | "SC_UPGRADEABILITY"
  | "SC_OTHER";

export interface SourceLocation {
  filePath?: string | undefined;
  contractName?: string | undefined;
  functionName?: string | undefined;
  lineStart?: number | undefined;
  lineEnd?: number | undefined;
  columnStart?: number | undefined;
  columnEnd?: number | undefined;
}

export interface NormalizedEvidence {
  summary: string;
  code?: string | undefined;
  trace?: unknown;
  raw?: unknown;
}

export type FindingEvidenceType = "ANALYZER" | "SOURCE" | "TRACE";

export interface NormalizedFindingEvidence {
  evidenceType: FindingEvidenceType;
  analyzer: AnalyzerName;
  toolName: string;
  filePath?: string | undefined;
  startLine?: number | undefined;
  endLine?: number | undefined;
  startColumn?: number | undefined;
  endColumn?: number | undefined;
  snippet?: string | undefined;
  ruleId?: string | undefined;
  detectorName?: string | undefined;
  message: string;
  confidenceContribution: number;
  rawArtifactPath: string;
  rawArtifactChecksum?: string | undefined;
  raw?: unknown;
}

export interface AnalyzerNormalizationInput {
  analyzer: AnalyzerName;
  analyzerVersion: string;
  artifactKey: string;
  rawOutput: unknown;
}

export interface NormalizedFinding {
  id: string;
  analyzer: AnalyzerName;
  analyzerVersion: string;
  artifactKey: string;
  ruleId: string;
  title: string;
  description: string;
  category: VulnerabilityCategory;
  severity: NormalizedSeverity;
  confidence: NormalizedConfidence;
  cweIds: string[];
  swcIds: string[];
  owaspSmartContractTop10: OwaspSmartContractCategory[];
  owaspWebTop10: string[];
  location: SourceLocation;
  evidence: NormalizedEvidence;
  evidenceItems: NormalizedFindingEvidence[];
  remediation?: string | undefined;
  references: string[];
  fingerprint: string;
  dedupeKey: string;
  raw: unknown;
}

export interface AggregatedVulnerability {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  category: VulnerabilityCategory;
  severity: NormalizedSeverity;
  confidence: NormalizedConfidence;
  riskScore: number;
  cweIds: string[];
  swcIds: string[];
  owaspSmartContractTop10: OwaspSmartContractCategory[];
  owaspWebTop10: string[];
  references: string[];
  primaryLocation: SourceLocation;
  locations: SourceLocation[];
  analyzerCount: number;
  analyzers: AnalyzerName[];
  findingIds: string[];
  evidence: NormalizedEvidence[];
  evidenceItems: NormalizedFindingEvidence[];
  remediation?: string | undefined;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

export interface NormalizationSummary {
  totalAnalyzerFindings: number;
  uniqueVulnerabilities: number;
  severityCounts: SeverityCounts;
  highestRiskScore: number;
  averageRiskScore: number;
  analyzerCoverage: Record<AnalyzerName, number>;
}

export interface VulnerabilityNormalizationInput {
  scanId: string;
  organizationId: string;
  analyzers: AnalyzerNormalizationInput[];
}

export interface VulnerabilityNormalizationOutput {
  schemaVersion: "vulnerability-normalization/v1";
  scanId: string;
  organizationId: string;
  generatedAt: string;
  findings: NormalizedFinding[];
  vulnerabilities: AggregatedVulnerability[];
  summary: NormalizationSummary;
}

export interface AnalyzerOutputNormalizer {
  supports(analyzer: AnalyzerName): boolean;
  normalize(input: AnalyzerNormalizationInput): NormalizedFinding[];
}
