import { prisma } from "../../infra/prisma/prisma.js";
import type { ListScanFindingsQuery } from "./findings.schemas.js";

export class FindingsRepository {
  async listByScan(scanId: string, query: ListScanFindingsQuery) {
    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId: query.organizationId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!scan) {
      return null;
    }

    const where = {
      scanId,
      deletedAt: null,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.state ? { confidenceState: query.state } : {})
    };
    const cursor = query.cursor
      ? await prisma.vulnerability.findFirst({
          where: { id: query.cursor, ...where },
          select: { id: true, priorityScore: true, createdAt: true }
        })
      : null;

    if (query.cursor && !cursor) {
      return [];
    }

    return prisma.vulnerability.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { priorityScore: { lt: cursor.priorityScore } },
                { priorityScore: cursor.priorityScore, createdAt: { lt: cursor.createdAt } },
                {
                  priorityScore: cursor.priorityScore,
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id }
                }
              ]
            }
          : {})
      },
      orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: query.limit,
      include: {
        evidenceItems: {
          orderBy: { createdAt: "asc" },
          include: {
            analyzerRun: true,
            analyzerEvidence: true,
            traceEvidence: true
          }
        },
        decisions: {
          orderBy: { decidedAt: "desc" },
          take: 1
        },
        review: true
      }
    });
  }

  findById(findingId: string) {
    return prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null },
      include: {
        scan: true,
        evidenceItems: {
          orderBy: { createdAt: "asc" },
          include: {
            analyzerRun: true,
            analyzerEvidence: true,
            traceEvidence: true,
            sourceRange: true
          }
        },
        decisions: {
          orderBy: { decidedAt: "desc" },
          take: 5
        },
        review: {
          include: {
            events: {
              orderBy: { createdAt: "desc" },
              take: 100
            },
            comments: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 50
            },
            assignments: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 20
            },
            suppressionRule: true
          }
        },
        detectorMetadata: true
      }
    });
  }

  async listEvidence(findingId: string, organizationId?: string | undefined) {
    const finding = await prisma.vulnerability.findFirst({
      where: {
        id: findingId,
        deletedAt: null,
        ...(organizationId ? { scan: { organizationId } } : {})
      },
      select: { id: true }
    });

    if (!finding) {
      return null;
    }

    return prisma.findingEvidence.findMany({
      where: { findingId },
      orderBy: { createdAt: "asc" },
      include: {
        analyzerRun: true,
        analyzerEvidence: true,
        traceEvidence: true,
        sourceRange: true,
        detectorMetadata: true
      }
    });
  }

  async evidenceSummary(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        analyzerRuns: {
          orderBy: { startedAt: "asc" }
        },
        vulnerabilities: {
          where: { deletedAt: null },
          select: {
            severity: true,
            confidenceState: true,
            priorityScore: true,
            exploitabilityScore: true,
            evidenceQuality: true
          }
        }
      }
    });

    if (!scan) {
      return null;
    }

    const evidenceCount = await prisma.findingEvidence.count({
      where: { finding: { scanId } }
    });

    return {
      scanId,
      organizationId,
      analyzerRuns: scan.analyzerRuns,
      findingCount: scan.vulnerabilities.length,
      evidenceCount,
      severityCounts: countBy(scan.vulnerabilities, "severity"),
      stateCounts: countBy(scan.vulnerabilities, "confidenceState"),
      maxPriorityScore: maxNumber(scan.vulnerabilities.map((finding) => Number(finding.priorityScore))),
      maxExploitabilityScore: maxNumber(
        scan.vulnerabilities.map((finding) => Number(finding.exploitabilityScore))
      ),
      averageEvidenceQuality: averageNumber(
        scan.vulnerabilities.map((finding) => Number(finding.evidenceQuality))
      )
    };
  }
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[key]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function maxNumber(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function averageNumber(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}
