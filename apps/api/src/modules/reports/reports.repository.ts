import { prisma } from "../../infra/prisma/prisma.js";
import type { Prisma, ReportExportFormat, ReportStatus } from "@prisma/client";
import type { ListReportsQuery } from "./reports.schemas.js";

export class ReportsRepository {
  async list(query: ListReportsQuery) {
    const cursor = query.cursor
      ? await prisma.report.findFirst({
          where: {
            id: query.cursor,
            organizationId: query.organizationId,
            deletedAt: null,
            ...(query.scanId ? { scanId: query.scanId } : {}),
            ...(query.status ? { status: query.status } : {})
          },
          select: { id: true, createdAt: true }
        })
      : null;

    if (query.cursor && !cursor) {
      return [];
    }

    return prisma.report.findMany({
      where: {
        organizationId: query.organizationId,
        deletedAt: null,
        ...(query.scanId ? { scanId: query.scanId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit,
      include: reportInclude()
    });
  }

  listByScan(scanId: string, organizationId: string) {
    return prisma.report.findMany({
      where: { scanId, organizationId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: reportInclude()
    });
  }

  findById(reportId: string) {
    return prisma.report.findFirst({
      where: { id: reportId, deletedAt: null },
      include: reportInclude()
    });
  }

  findPublicByShareTokenHash(shareTokenHash: string) {
    return prisma.reportShareLink.findUnique({
      where: { shareTokenHash },
      include: {
        report: {
          include: reportInclude()
        }
      }
    });
  }

  securitySettings(organizationId: string) {
    return prisma.securitySetting.findUnique({ where: { organizationId } });
  }

  scanForReport(scanId: string, organizationId: string, includeSuppressed: boolean) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        targets: true,
        analyzerRuns: { orderBy: { startedAt: "desc" } },
        buildProfiles: { orderBy: { createdAt: "desc" } },
        buildRuns: { orderBy: { startedAt: "desc" } },
        compilerArtifacts: { orderBy: [{ createdAt: "desc" }, { artifactPath: "asc" }] },
        testRuns: {
          orderBy: { startedAt: "desc" },
          include: { results: { orderBy: { createdAt: "asc" } } }
        },
        analyzerToolAvailability: { orderBy: [{ toolName: "asc" }, { checkedAt: "desc" }] },
        analysisIrRuns: { orderBy: { createdAt: "desc" }, take: 5 },
        contractSymbols: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 50 },
        functionSymbols: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 80 },
        externalCallSites: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 80 },
        storageLayoutEntries: { orderBy: [{ contractName: "asc" }, { slot: "asc" }], take: 80 },
        fuzzRuns: {
          orderBy: { createdAt: "desc" },
          take: 25,
          include: {
            artifacts: { orderBy: { createdAt: "desc" }, take: 5 },
            counterexamples: { orderBy: { createdAt: "desc" }, take: 5 },
            coverageSummaries: { orderBy: { createdAt: "desc" }, take: 3 },
            invariantResults: { orderBy: { createdAt: "desc" }, take: 5 }
          }
        },
        monitorTargets: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            rules: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
            cursors: { orderBy: { updatedAt: "desc" }, take: 1 },
            alerts: { orderBy: { createdAt: "desc" }, take: 5, include: { evidence: { orderBy: { createdAt: "asc" } } } }
          }
        },
        monitorRuns: { orderBy: { createdAt: "desc" }, take: 10 },
        monitorAlerts: {
          orderBy: { createdAt: "desc" },
          take: 25,
          include: { evidence: { orderBy: { createdAt: "asc" } } }
        },
        threatSignatureMatches: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            signature: true,
            alert: { select: { id: true, title: true, severity: true, kind: true } },
            finding: { select: { id: true, title: true, severity: true, status: true } }
          }
        },
        detectorPrecisionMetrics: { orderBy: { measuredAt: "desc" }, take: 25 },
        falsePositiveFeedback: { orderBy: { createdAt: "desc" }, take: 25 },
        incidentReferences: { orderBy: { createdAt: "desc" }, take: 25 },
        threatIntelEntries: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 25 },
        vulnerabilities: {
          where: {
            deletedAt: null,
            ...(includeSuppressed
              ? {}
              : {
                  NOT: [
                    { status: "SUPPRESSED" },
                    { review: { is: { status: "SUPPRESSED" } } }
                  ]
                })
          },
          orderBy: [{ severity: "desc" }, { priorityScore: "desc" }, { createdAt: "desc" }],
          include: {
            evidenceItems: {
              orderBy: { createdAt: "asc" },
              include: { analyzerRun: true }
            },
            review: true,
            codeLinks: {
              include: {
                contractSymbol: true,
                functionSymbol: true,
                externalCallSite: true,
                storageLayoutEntry: true
              }
            },
            aiFindingValidations: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { aiValidationRun: true }
            },
            remediationRuns: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { suggestions: { orderBy: { createdAt: "asc" }, take: 1 } }
            },
            simulationRuns: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                artifacts: { orderBy: { createdAt: "desc" }, take: 5 },
                decisions: { orderBy: { createdAt: "desc" }, take: 1 }
              }
            },
            fuzzRuns: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                artifacts: { orderBy: { createdAt: "desc" }, take: 5 },
                counterexamples: { orderBy: { createdAt: "desc" }, take: 3 },
                coverageSummaries: { orderBy: { createdAt: "desc" }, take: 1 },
                invariantResults: { orderBy: { createdAt: "desc" }, take: 3 }
              }
            },
            threatSignatureMatches: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { signature: true }
            },
            falsePositiveFeedback: { orderBy: { createdAt: "desc" }, take: 5 },
            incidentReferences: { orderBy: { createdAt: "desc" }, take: 5 }
          }
        }
      }
    });
  }

  async createReport(input: {
    organizationId: string;
    projectId: string | null;
    scanId: string;
    createdByUserId?: string | undefined;
    title: string;
    executiveSummary: string;
    riskScore: number;
    includeSuppressed: boolean;
    reportNumber: string;
    sections: Array<{ key: string; title: string; body: string; checksum: string; metadata?: Record<string, unknown> | undefined }>;
    disclaimer: string;
    inputChecksum: string;
    jsonArtifactPath: string;
    markdownArtifactPath: string;
    htmlArtifactPath: string;
    checksumSha256: string;
    billingMetadata?: Record<string, unknown> | undefined;
  }) {
    const version = await this.nextVersion(input.scanId);
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          createdByUserId: input.createdByUserId ?? null,
          reportNumber: input.reportNumber,
          version,
          status: "SUCCEEDED",
          title: input.title,
          executiveSummary: input.executiveSummary,
          riskScore: input.riskScore,
          includeSuppressed: input.includeSuppressed,
          jsonArtifactPath: input.jsonArtifactPath,
          markdownArtifactPath: input.markdownArtifactPath,
          htmlArtifactPath: input.htmlArtifactPath,
          checksumSha256: input.checksumSha256,
          generatedAt: now,
          publishedAt: now,
          metadata: toJsonValue({
            inputChecksum: input.inputChecksum,
            ...(input.billingMetadata ? { billing: input.billingMetadata } : {})
          })
        }
      });

      await tx.reportSection.createMany({
        data: input.sections.map((section, index) => ({
          reportId: report.id,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          sectionKey: section.key,
          title: section.title,
          sortOrder: index + 1,
          body: section.body,
          checksumSha256: section.checksum,
          ...(section.metadata ? { metadata: toJsonValue(section.metadata) } : {})
        }))
      });

      await tx.reportDisclaimer.create({
        data: {
          reportId: report.id,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          version: "p6-public-beta/v1",
          text: input.disclaimer
        }
      });

      await tx.reportGenerationRun.create({
        data: {
          reportId: report.id,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          requestedByUserId: input.createdByUserId ?? null,
          status: "SUCCEEDED",
          inputDataChecksum: input.inputChecksum,
          outputArtifactPath: input.jsonArtifactPath,
          outputArtifactChecksumSha256: input.checksumSha256,
          startedAt: now,
          finishedAt: now
        }
      });

      return tx.report.findUniqueOrThrow({ where: { id: report.id }, include: reportInclude() });
    });
  }

  createExport(input: {
    reportId: string;
    organizationId: string;
    projectId: string | null;
    scanId: string;
    requestedByUserId?: string | undefined;
    format: ReportExportFormat;
    status: ReportStatus;
    artifactPath?: string | null | undefined;
    checksumSha256?: string | null | undefined;
    errorCategory?: string | null | undefined;
    error?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    const now = new Date();
    return prisma.reportExport.create({
      data: {
        reportId: input.reportId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        requestedByUserId: input.requestedByUserId ?? null,
        format: input.format,
        status: input.status,
        artifactPath: input.artifactPath ?? null,
        checksumSha256: input.checksumSha256 ?? null,
        startedAt: now,
        finishedAt: now,
        errorCategory: input.errorCategory ?? null,
        error: input.error ?? null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }

  createShareLink(input: {
    reportId: string;
    organizationId: string;
    projectId: string | null;
    scanId: string;
    createdByUserId?: string | undefined;
    shareTokenHash: string;
    tokenPrefix: string;
    includeSuppressed: boolean;
    expiresAt: Date;
  }) {
    return prisma.reportShareLink.create({
      data: {
        reportId: input.reportId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        createdByUserId: input.createdByUserId ?? null,
        shareTokenHash: input.shareTokenHash,
        tokenPrefix: input.tokenPrefix,
        includeSuppressed: input.includeSuppressed,
        expiresAt: input.expiresAt
      }
    });
  }

  revokeShareLinks(reportId: string, organizationId: string) {
    return prisma.reportShareLink.updateMany({
      where: { reportId, organizationId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  touchShareLink(id: string) {
    return prisma.reportShareLink.update({
      where: { id },
      data: { lastAccessedAt: new Date() }
    });
  }

  audit(input: {
    organizationId: string | null;
    actorUserId?: string | undefined;
    action: "REPORT_GENERATE" | "REPORT_EXPORT" | "REPORT_SHARE" | "REPORT_REVOKE";
    resource: "REPORT" | "REPORT_EXPORT" | "REPORT_SHARE_LINK";
    resourceId: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }

  private async nextVersion(scanId: string): Promise<number> {
    const latest = await prisma.report.findFirst({
      where: { scanId },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    return (latest?.version ?? 0) + 1;
  }
}

export function reportInclude() {
  return {
    scan: true,
    sections: { orderBy: { sortOrder: "asc" } },
    exports: { orderBy: { createdAt: "desc" }, take: 20 },
    shareLinks: { orderBy: { createdAt: "desc" }, take: 5 },
    disclaimers: { orderBy: { createdAt: "desc" }, take: 5 },
    generationRuns: { orderBy: { createdAt: "desc" }, take: 5 }
  } satisfies Prisma.ReportInclude;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
