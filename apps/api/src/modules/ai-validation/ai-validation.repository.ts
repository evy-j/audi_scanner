import { prisma } from "../../infra/prisma/prisma.js";

export class AiValidationRepository {
  async scanSummary(scanId: string, organizationId: string) {
    const scan = await this.scanContext(scanId, organizationId);
    if (!scan) return null;

    const runs = await prisma.aiValidationRun.findMany({
      where: { scanId, scope: "SCAN_SUMMARY" },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: {
        reviewNotes: {
          orderBy: { createdAt: "desc" },
          take: 20
        },
        providerUsage: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    return { scanId, organizationId, status: runs[0]?.status ?? "NOT_ASSESSED", runs };
  }

  async findingValidation(findingId: string, organizationId: string) {
    const finding = await this.findingContext(findingId, organizationId);
    if (!finding) return null;

    const validations = await prisma.aiFindingValidation.findMany({
      where: { findingId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        aiValidationRun: {
          include: {
            providerUsage: {
              orderBy: { createdAt: "desc" },
              take: 5
            },
            reviewNotes: {
              orderBy: { createdAt: "desc" },
              take: 10
            }
          }
        },
        evidenceCritiques: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const latestRun = await prisma.aiValidationRun.findFirst({
      where: { findingId, scope: "FINDING" },
      orderBy: { startedAt: "desc" }
    });

    return {
      findingId,
      scanId: finding.scanId,
      organizationId,
      status: validations[0]?.aiValidationRun.status ?? latestRun?.status ?? "NOT_ASSESSED",
      validations,
      latestRun
    };
  }

  scanContext(scanId: string, organizationId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true, priority: true }
    });
  }

  findingContext(findingId: string, organizationId: string) {
    return prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null, scan: { organizationId, deletedAt: null } },
      select: {
        id: true,
        scanId: true,
        scan: {
          select: {
            id: true,
            organizationId: true,
            projectId: true,
            priority: true
          }
        }
      }
    });
  }
}
