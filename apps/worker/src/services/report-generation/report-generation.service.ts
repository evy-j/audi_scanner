import { randomBytes } from "node:crypto";
import path from "node:path";
import type { VulnerabilityNormalizationOutput } from "@audit-scanner/scanner-core";
import type { ReportJobData } from "@audit-scanner/shared/queues/scan-jobs";
import type {
  AuditReportResult,
  PdfGenerationResult,
  ReportGenerationService
} from "../scan-services.js";
import { LocalScannerArtifactStore } from "../scan-execution/local-artifact-store.js";
import { sanitizePathSegment, toPosixPath } from "../scan-execution/safe-path.js";
import { sha256Buffer } from "../scan-execution/hash.js";
import { AuditReportBuilder } from "./report-builder.js";
import { MarkdownAuditReportRenderer } from "./renderers/markdown-renderer.js";
import { BasicPdfRenderer } from "./renderers/basic-pdf-renderer.js";
import { AuditReportRepository } from "./report-repository.js";
import { AiReportPromptOrchestrator } from "./ai/prompt-orchestrator.js";
import { createAiReportProvider } from "./ai/provider-factory.js";

export class LocalAuditReportGenerationService implements ReportGenerationService {
  constructor(
    private readonly artifactStore = new LocalScannerArtifactStore(),
    private readonly builder = new AuditReportBuilder(),
    private readonly markdownRenderer = new MarkdownAuditReportRenderer(),
    private readonly pdfRenderer = new BasicPdfRenderer(),
    private readonly repository = new AuditReportRepository(),
    private readonly aiOrchestrator = new AiReportPromptOrchestrator(createAiReportProvider())
  ) {}

  async generate(data: ReportJobData, signal?: AbortSignal): Promise<AuditReportResult> {
    assertNotAborted(signal);

    if (!data.normalizedArtifactKey) {
      throw new Error("AI report generation requires normalizedArtifactKey");
    }

    const normalization = await this.readNormalizationOutput(data.normalizedArtifactKey);
    const generatedAt = new Date().toISOString();
    const reportNumber = generateReportNumber();
    const baseReport = this.builder.build({
      reportNumber,
      normalization,
      riskScore: data.riskScore,
      normalizedArtifactKey: data.normalizedArtifactKey,
      generatedAt
    });
    const report = await this.aiOrchestrator.enrich(baseReport, signal);
    const markdown = this.markdownRenderer.render(report);
    const artifactPrefix = toPosixPath(
      path.join("reports", sanitizePathSegment(data.scanId), sanitizePathSegment(reportNumber))
    );
    const [jsonArtifactKey, markdownArtifactKey] = await Promise.all([
      this.artifactStore.writeJsonArtifact(artifactPrefix, "audit-report.json", report),
      this.artifactStore.writeTextArtifact(artifactPrefix, "audit-report.md", markdown)
    ]);
    const record = await this.repository.createReadyReport({
      report,
      ...(data.requestedByUserId ? { createdById: data.requestedByUserId } : {}),
      jsonArtifactKey,
      markdownArtifactKey
    });

    return {
      reportId: record.id,
      reportArtifactKey: markdownArtifactKey
    };
  }

  async renderPdf(report: AuditReportResult, signal?: AbortSignal): Promise<PdfGenerationResult> {
    assertNotAborted(signal);

    const markdown = await this.artifactStore.readTextByArtifactKey(report.reportArtifactKey);
    if (!markdown) {
      throw new Error(`Report markdown artifact was not found: ${report.reportArtifactKey}`);
    }

    const artifactPrefix = getArtifactPrefix(report.reportArtifactKey);
    const pdf = this.pdfRenderer.render(markdown, {
      title: "Smart Contract Security Audit",
      reportNumber: extractReportNumber(markdown) ?? report.reportId
    });
    const checksumSha256 = sha256Buffer(pdf);
    const pdfArtifactKey = await this.artifactStore.writeBinaryArtifact(
      artifactPrefix,
      "audit-report.pdf",
      pdf
    );

    await this.repository.updatePdfArtifact({
      reportId: report.reportId,
      pdfArtifactKey,
      checksumSha256
    });

    return {
      pdfArtifactKey,
      checksumSha256
    };
  }

  private async readNormalizationOutput(artifactKey: string): Promise<VulnerabilityNormalizationOutput> {
    const text = await this.artifactStore.readTextByArtifactKey(artifactKey);
    if (!text) {
      throw new Error(`Normalized vulnerability artifact was not found: ${artifactKey}`);
    }

    const parsed = JSON.parse(text) as VulnerabilityNormalizationOutput;
    if (parsed.schemaVersion !== "vulnerability-normalization/v1" || !Array.isArray(parsed.vulnerabilities)) {
      throw new Error(`Invalid normalized vulnerability artifact: ${artifactKey}`);
    }

    return parsed;
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
  }
}

function generateReportNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/gu, "");
  return `ASC-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function getArtifactPrefix(artifactKey: string): string {
  const normalized = artifactKey.replace(/\\/gu, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    throw new Error(`Invalid report artifact key: ${artifactKey}`);
  }

  return normalized.slice(0, index);
}

function extractReportNumber(markdown: string): string | null {
  const match = markdown.match(/^report_number:\s*(.+)$/mu);
  return match?.[1]?.trim() ?? null;
}
