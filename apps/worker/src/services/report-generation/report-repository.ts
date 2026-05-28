import { prisma } from "@audit-scanner/database";
import type { Prisma } from "@prisma/client";
import type { AuditReportDocument } from "./report-types.js";

export interface CreateAuditReportRecordInput {
  report: AuditReportDocument;
  createdById?: string | undefined;
  markdownArtifactKey: string;
  jsonArtifactKey: string;
}

export class AuditReportRepository {
  async createReadyReport(input: CreateAuditReportRecordInput) {
    const version = await this.nextReportVersion(input.report.scanId);
    const severityCounts = input.report.severityAnalysis.counts;
    const ai = input.report.ai;
    const metadata: Prisma.InputJsonObject = {
      jsonArtifactKey: input.jsonArtifactKey,
      normalizedArtifactKey: input.report.sourceArtifacts.normalizedArtifactKey,
      severityCounts: {
        critical: severityCounts.critical,
        high: severityCounts.high,
        medium: severityCounts.medium,
        low: severityCounts.low,
        informational: severityCounts.informational
      },
      riskRating: input.report.riskRating,
      ai: {
        provider: ai.provider,
        used: ai.used,
        promptVersion: ai.promptVersion,
        ...(ai.model !== undefined ? { model: ai.model } : {}),
        ...(ai.generatedAt !== undefined ? { generatedAt: ai.generatedAt } : {})
      }
    };

    return prisma.$transaction(async (tx) => {
      const report = await tx.auditReport.create({
        data: {
          scanId: input.report.scanId,
          organizationId: input.report.organizationId,
          createdById: input.createdById ?? null,
          reportNumber: input.report.reportNumber,
          version,
          status: "READY",
          title: input.report.title,
          executiveSummary: input.report.executiveSummary,
          riskScore: input.report.riskScore,
          storageKey: input.markdownArtifactKey,
          generatedAt: new Date(input.report.generatedAt),
          metadata
        }
      });

      await tx.scan.update({
        where: { id: input.report.scanId },
        data: {
          riskScore: input.report.riskScore,
          status: "REPORTING"
        }
      });

      return report;
    });
  }

  updatePdfArtifact(input: {
    reportId: string;
    pdfArtifactKey: string;
    checksumSha256: string;
  }) {
    return prisma.auditReport.update({
      where: { id: input.reportId },
      data: {
        pdfStorageKey: input.pdfArtifactKey,
        checksumSha256: input.checksumSha256,
        publishedAt: new Date()
      }
    });
  }

  private async nextReportVersion(scanId: string): Promise<number> {
    const current = await prisma.auditReport.aggregate({
      where: { scanId },
      _max: { version: true }
    });

    return (current._max.version ?? 0) + 1;
  }
}
