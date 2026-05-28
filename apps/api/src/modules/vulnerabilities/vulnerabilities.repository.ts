import { prisma } from "../../infra/prisma/prisma.js";
import type {
  ListVulnerabilitiesQuery,
  UpdateVulnerabilityInput
} from "./vulnerabilities.schemas.js";

export class VulnerabilitiesRepository {
  async list(query: ListVulnerabilitiesQuery) {
    const baseWhere = {
      deletedAt: null,
      ...(query.scanId ? { scanId: query.scanId } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
      scan: {
        organizationId: query.organizationId
      }
    };
    const cursor = query.cursor
      ? await prisma.vulnerability.findFirst({
          where: {
            id: query.cursor,
            ...baseWhere
          },
          select: { id: true, severity: true, createdAt: true }
        })
      : null;

    if (query.cursor && !cursor) {
      return [];
    }

    return prisma.vulnerability.findMany({
      where: {
        ...baseWhere,
        ...(cursor ? buildVulnerabilityCursorWhere(cursor) : {})
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: query.limit
    });
  }

  findById(vulnerabilityId: string) {
    return prisma.vulnerability.findFirst({
      where: { id: vulnerabilityId, deletedAt: null },
      include: { scan: true, contract: true }
    });
  }

  update(vulnerabilityId: string, input: UpdateVulnerabilityInput) {
    return prisma.vulnerability.update({
      where: { id: vulnerabilityId },
      data: input
    });
  }
}

const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;

function buildVulnerabilityCursorWhere(cursor: {
  id: string;
  severity: (typeof severityOrder)[number];
  createdAt: Date;
}) {
  const cursorIndex = severityOrder.indexOf(cursor.severity);
  const lowerSeverities = severityOrder.slice(cursorIndex + 1);

  return {
    OR: [
      ...(lowerSeverities.length > 0 ? [{ severity: { in: lowerSeverities } }] : []),
      { severity: cursor.severity, createdAt: { lt: cursor.createdAt } },
      { severity: cursor.severity, createdAt: cursor.createdAt, id: { lt: cursor.id } }
    ]
  };
}
