import type {
  AnalyzerJobData,
  AiValidationJobData,
  BuildJobData,
  FindingsNormalizeJobData,
  NotificationJobData,
  ReportJobData,
  RiskScoreJobData,
  SourcePrepareJobData
} from "@audit-scanner/shared/queues/scan-jobs";

export interface PreparedSourceResult {
  preparedArtifactKey: string;
  compilerVersion?: string;
  framework?: "hardhat" | "foundry" | "unknown";
}

export interface AnalyzerExecutionResult {
  rawArtifactKey: string;
  rawArtifactChecksumSha256?: string | undefined;
  standardizedArtifactKey: string;
  analyzerVersion: string;
  exitCode: number | null;
  durationMs: number;
  warnings?: string[];
}

export interface FindingsNormalizationResult {
  vulnerabilityCount: number;
  normalizedArtifactKey?: string;
  riskScore?: number;
  severityCounts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}

export interface RiskScoreResult {
  riskScore: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}

export interface AiValidationResult {
  aiValidationRunId?: string | undefined;
  status: string;
  scope: "FINDING" | "SCAN_SUMMARY";
  decision?: string | undefined;
}

export interface AuditReportResult {
  reportId: string;
  reportArtifactKey: string;
}

export interface PdfGenerationResult {
  pdfArtifactKey: string;
  checksumSha256: string;
}

export interface SourcePreparationService {
  prepare(data: SourcePrepareJobData, signal?: AbortSignal): Promise<PreparedSourceResult>;
}

export interface ScannerExecutionService {
  execute(data: AnalyzerJobData, signal?: AbortSignal): Promise<AnalyzerExecutionResult>;
}

export interface BuildExecutionResult {
  buildRunId?: string | undefined;
  compilerArtifactCount: number;
  testRunCount: number;
  status: string;
}

export interface BuildExecutionService {
  detectBuildProfile(data: BuildJobData, signal?: AbortSignal): Promise<BuildExecutionResult>;
}

export interface FindingsNormalizationService {
  normalize(
    data: FindingsNormalizeJobData,
    signal?: AbortSignal
  ): Promise<FindingsNormalizationResult>;
}

export interface RiskScoringService {
  score(data: RiskScoreJobData, signal?: AbortSignal): Promise<RiskScoreResult>;
}

export interface AiValidationService {
  validate(data: AiValidationJobData, signal?: AbortSignal): Promise<AiValidationResult>;
}

export interface ReportGenerationService {
  generate(data: ReportJobData, signal?: AbortSignal): Promise<AuditReportResult>;
  renderPdf(report: AuditReportResult, signal?: AbortSignal): Promise<PdfGenerationResult>;
}

export interface NotificationDispatchService {
  dispatch(data: NotificationJobData, signal?: AbortSignal): Promise<void>;
}

class NotConfiguredService {
  protected notConfigured(component: string): never {
    throw new Error(`${component} is not configured`);
  }
}

export class NotConfiguredSourcePreparationService
  extends NotConfiguredService
  implements SourcePreparationService
{
  async prepare(): Promise<PreparedSourceResult> {
    this.notConfigured("SourcePreparationService");
  }
}

export class NotConfiguredFindingsNormalizationService
  extends NotConfiguredService
  implements FindingsNormalizationService
{
  async normalize(): Promise<FindingsNormalizationResult> {
    this.notConfigured("FindingsNormalizationService");
  }
}

export class NotConfiguredBuildExecutionService
  extends NotConfiguredService
  implements BuildExecutionService
{
  async detectBuildProfile(): Promise<BuildExecutionResult> {
    this.notConfigured("BuildExecutionService");
  }
}

export class NotConfiguredRiskScoringService extends NotConfiguredService implements RiskScoringService {
  async score(): Promise<RiskScoreResult> {
    this.notConfigured("RiskScoringService");
  }
}

export class NotConfiguredAiValidationService
  extends NotConfiguredService
  implements AiValidationService
{
  async validate(): Promise<AiValidationResult> {
    this.notConfigured("AiValidationService");
  }
}

export class NotConfiguredReportGenerationService
  extends NotConfiguredService
  implements ReportGenerationService
{
  async generate(): Promise<AuditReportResult> {
    this.notConfigured("ReportGenerationService");
  }

  async renderPdf(): Promise<PdfGenerationResult> {
    this.notConfigured("ReportGenerationService.renderPdf");
  }
}

export class NotConfiguredNotificationDispatchService
  extends NotConfiguredService
  implements NotificationDispatchService
{
  async dispatch(): Promise<void> {
    this.notConfigured("NotificationDispatchService");
  }
}
