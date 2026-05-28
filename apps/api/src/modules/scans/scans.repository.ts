import { prisma } from "../../infra/prisma/prisma.js";
import type { Prisma, ScanStatus } from "@prisma/client";
import type { ScanOrchestratorJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { scanOrchestratorOutboxEventType } from "../../infra/outbox/scan-outbox.relay.js";
import type { CreateScanInput, ListScansQuery } from "./scans.schemas.js";

export class ScansRepository {
  async create(input: CreateScanInput, createdById: string, queueJob: ScanOrchestratorJobData) {
    return prisma.$transaction(async (tx) => {
      const scan = await tx.scan.create({
        data: {
          id: queueJob.scanId,
          organizationId: input.organizationId,
          createdById,
          projectId: input.projectId ?? null,
          chainId: input.chainId ?? input.target.chainId ?? null,
          contractId: input.contractId ?? null,
          title: input.title ?? null,
          type: input.target.type,
          status: "QUEUED",
          priority: input.priority,
          progress: 0,
          queuedAt: new Date(),
          metadata: {
            traceId: queueJob.traceId,
            ...(queueJob.correlationId ? { correlationId: queueJob.correlationId } : {}),
            ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {})
          }
        }
      });

      await tx.scanTarget.create({
        data: {
          scanId: scan.id,
          chainId: input.target.chainId ?? input.chainId ?? null,
          targetType: mapTargetType(input.target.type),
          contractAddress: input.target.address ?? null,
          normalizedAddress: input.target.address?.toLowerCase() ?? null,
          repositoryUrl: input.target.repositoryUrl ?? null,
          artifactStorageKey: input.target.artifactKey ?? null
        }
      });
      await tx.scanEvent.create({
        data: {
          scanId: scan.id,
          organizationId: scan.organizationId,
          sequence: 1,
          type: "scan.queued",
          status: "QUEUED",
          progress: 0,
          message: "Scan was queued",
          traceId: queueJob.traceId,
          correlationId: queueJob.correlationId ?? null,
          data: {
            priority: input.priority,
            analyzers: input.analyzers
          }
        }
      });
      await tx.outboxMessage.create({
        data: {
          organizationId: scan.organizationId,
          aggregateType: "Scan",
          aggregateId: scan.id,
          eventType: scanOrchestratorOutboxEventType(),
          payload: toJsonObject(queueJob),
          traceId: queueJob.traceId,
          correlationId: queueJob.correlationId ?? null
        }
      });

      return scan;
    });
  }

  async list(query: ListScansQuery) {
    const cursor = query.cursor
      ? await prisma.scan.findFirst({
          where: {
            id: query.cursor,
            organizationId: query.organizationId,
            deletedAt: null,
            ...(query.status ? { status: query.status } : {})
          },
          select: { id: true, createdAt: true }
        })
      : null;

    if (query.cursor && !cursor) {
      return [];
    }

    return prisma.scan.findMany({
      where: {
        organizationId: query.organizationId,
        deletedAt: null,
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
      include: {
        contract: true,
        reports: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
  }

  findById(scanId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, deletedAt: null },
      include: {
        targets: true,
        vulnerabilities: {
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }]
        },
        reports: {
          orderBy: { createdAt: "desc" }
        },
        analyzerRuns: {
          orderBy: { startedAt: "desc" }
        },
        events: {
          orderBy: [{ sequence: "asc" }, { emittedAt: "asc" }]
        }
      }
    });
  }

  updateStatus(scanId: string, data: Prisma.ScanUpdateInput) {
    return prisma.scan.update({
      where: { id: scanId },
      data
    });
  }

  sourceArtifact(sourceArtifactId: string) {
    const db = prisma as any;
    return db.sourceArtifact.findFirst({
      where: { id: sourceArtifactId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        status: true,
        storageKey: true
      }
    });
  }

  markSourceArtifactScan(sourceArtifactId: string, scanId: string) {
    const db = prisma as any;
    return db.sourceArtifact.update({
      where: { id: sourceArtifactId },
      data: { scanId }
    });
  }

  async recordScanEvent(input: {
    scanId: string;
    organizationId: string;
    type: string;
    status: ScanStatus;
    progress: number;
    message: string;
    traceId?: string | undefined;
    correlationId?: string | undefined;
    data?: Record<string, unknown> | undefined;
  }) {
    const sequence = (await prisma.scanEvent.count({ where: { scanId: input.scanId } })) + 1;
    return prisma.scanEvent.create({
      data: {
        scanId: input.scanId,
        organizationId: input.organizationId,
        sequence,
        type: input.type,
        status: input.status,
        progress: input.progress,
        message: input.message,
        traceId: input.traceId ?? null,
        correlationId: input.correlationId ?? null,
        data: toJsonObject(input.data ?? {})
      }
    });
  }
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function mapTargetType(type: CreateScanInput["target"]["type"]) {
  switch (type) {
    case "ADDRESS":
      return "ADDRESS";
    case "SOURCE":
      return "SOURCE_ARCHIVE";
    case "REPOSITORY":
      return "REPOSITORY";
    case "BYTECODE":
      return "BYTECODE";
  }
}
