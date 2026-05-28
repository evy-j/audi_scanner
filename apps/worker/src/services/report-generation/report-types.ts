import type {
  NormalizedSeverity,
  SeverityCounts,
  VulnerabilityCategory,
  VulnerabilityNormalizationOutput
} from "@audit-scanner/scanner-core";

export type ReportRiskRating = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";

export interface ReportGenerationInput {
  reportNumber: string;
  normalization: VulnerabilityNormalizationOutput;
  riskScore: number;
  normalizedArtifactKey: string;
  generatedAt: string;
}

export interface AuditReportDocument {
  schemaVersion: "audit-report/v1";
  reportNumber: string;
  scanId: string;
  organizationId: string;
  generatedAt: string;
  title: string;
  riskScore: number;
  riskRating: ReportRiskRating;
  executiveSummary: string;
  scope: AuditReportScope;
  severityAnalysis: SeverityAnalysis;
  findings: AuditReportFinding[];
  recommendations: string[];
  methodology: string[];
  ai: AiReportMetadata;
  sourceArtifacts: {
    normalizedArtifactKey: string;
  };
}

export interface AuditReportScope {
  analyzerCoverage: Record<string, number>;
  totalAnalyzerFindings: number;
  uniqueVulnerabilities: number;
}

export interface SeverityAnalysis {
  counts: SeverityCounts;
  narrative: string;
  highestSeverity: NormalizedSeverity | "NONE";
}

export interface AuditReportFinding {
  id: string;
  fingerprint: string;
  title: string;
  category: VulnerabilityCategory;
  severity: NormalizedSeverity;
  confidence: string;
  riskScore: number;
  affectedLocations: string[];
  cweIds: string[];
  swcIds: string[];
  owaspSmartContractTop10: string[];
  attackExplanation: string;
  evidenceSummary: string;
  remediation: string;
  secureCodeExample: SecureCodeExample;
  references: string[];
  analyzers: string[];
}

export interface SecureCodeExample {
  language: "solidity" | "text";
  code: string;
  notes: string;
}

export interface AiReportMetadata {
  provider: string;
  model?: string | undefined;
  used: boolean;
  generatedAt?: string | undefined;
  promptVersion: string;
}

export interface AiFindingEnrichment {
  findingId: string;
  attackExplanation?: string | undefined;
  remediation?: string | undefined;
  secureCodeExample?: string | undefined;
  secureCodeNotes?: string | undefined;
}

export interface AiReportEnrichment {
  executiveSummary?: string | undefined;
  severityNarrative?: string | undefined;
  recommendations?: string[] | undefined;
  findings?: AiFindingEnrichment[] | undefined;
}
