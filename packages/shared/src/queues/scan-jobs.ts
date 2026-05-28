export const SCAN_QUEUE_PREFIX = "audit-scanner";

export const SCAN_QUEUE_NAMES = {
  scanOrchestrator: "scan.orchestrator",
  sourcePrepare: "source.prepare",
  buildCompile: "build.compile",
  analyzerSlither: "analyzer.slither",
  analyzerMythril: "analyzer.mythril",
  analyzerSemgrep: "analyzer.semgrep",
  analyzerAderyn: "analyzer.aderyn",
  analyzerFoundry: "analyzer.foundry",
  findingsNormalize: "findings.normalize",
  riskScore: "risk.score",
  aiValidate: "ai.validate",
  aiReport: "ai.report",
  pdfGenerate: "pdf.generate",
  notificationsDispatch: "notifications.dispatch"
} as const;

export type ScanQueueName = (typeof SCAN_QUEUE_NAMES)[keyof typeof SCAN_QUEUE_NAMES];

export const DEAD_LETTER_QUEUE_PREFIX = "dead";

export function getDeadLetterQueueName(queueName: ScanQueueName): string {
  return `${DEAD_LETTER_QUEUE_PREFIX}.${queueName}`;
}

export type AnalyzerName = "slither" | "mythril" | "semgrep" | "aderyn" | "foundry";

export type ScanPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface ScanJobBase {
  scanId: string;
  organizationId: string;
  requestedByUserId?: string | undefined;
  traceId: string;
  correlationId?: string | undefined;
  priority: ScanPriority;
  attemptContext?: {
    parentJobId?: string | undefined;
    submittedAt: string;
  };
}

export interface ScanOrchestratorJobData extends ScanJobBase {
  target: {
    type: "ADDRESS" | "SOURCE" | "REPOSITORY" | "BYTECODE";
    chainId?: string;
    address?: string;
    repositoryUrl?: string;
    artifactKey?: string;
  };
  analyzers: AnalyzerName[];
}

export interface SourcePrepareJobData extends ScanJobBase {
  target: ScanOrchestratorJobData["target"];
  analyzers: AnalyzerName[];
}

export interface BuildJobData extends ScanJobBase {
  preparedArtifactKey: string;
  analyzers: AnalyzerName[];
}

export interface AnalyzerJobData extends ScanJobBase {
  analyzer: AnalyzerName;
  preparedArtifactKey: string;
  scannerImage: string;
  timeoutMs: number;
}

export interface FindingsNormalizeJobData extends ScanJobBase {
  analyzerArtifactKeys: string[];
  analyzerFailures?: Record<string, string> | undefined;
  analysisPartial?: boolean | undefined;
}

export interface RiskScoreJobData extends ScanJobBase {
  vulnerabilityCount: number;
  normalizedArtifactKey?: string | undefined;
  normalizationRiskScore?: number | undefined;
  severityCounts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  } | undefined;
  analysisPartial?: boolean | undefined;
  analyzerFailures?: Record<string, string> | undefined;
}

export interface AiValidationJobData extends ScanJobBase {
  scope: "FINDING" | "SCAN_SUMMARY";
  findingId?: string | undefined;
}

export interface ReportJobData extends ScanJobBase {
  riskScore: number;
  vulnerabilityCount?: number | undefined;
  normalizedArtifactKey?: string | undefined;
  severityCounts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  } | undefined;
  analysisPartial?: boolean | undefined;
  analyzerFailures?: Record<string, string> | undefined;
  reportId?: string | undefined;
  reportArtifactKey?: string | undefined;
}

export interface NotificationJobData extends ScanJobBase {
  eventType: "SCAN_COMPLETED" | "SCAN_PARTIAL" | "SCAN_FAILED" | "SCAN_CANCELED";
  payload: Record<string, unknown>;
}

export interface DeadLetterJobData {
  failedQueueName: string;
  failedJobId?: string;
  failedJobName: string;
  failedJobData: unknown;
  failedReason: string;
  stacktrace?: string[];
  attemptsMade: number;
  movedAt: string;
  traceId?: string;
  scanId?: string;
  organizationId?: string;
}

export type ScanQueueJobData =
  | ScanOrchestratorJobData
  | SourcePrepareJobData
  | BuildJobData
  | AnalyzerJobData
  | FindingsNormalizeJobData
  | RiskScoreJobData
  | AiValidationJobData
  | ReportJobData
  | NotificationJobData;
