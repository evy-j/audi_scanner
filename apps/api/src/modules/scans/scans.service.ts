import { randomBytes, randomUUID } from "node:crypto";
import { ApiError } from "../../common/errors/api-error.js";
import { env } from "../../config/environment.js";
import { logger } from "../../common/logging/logger.js";
import { redis, redisKey } from "../../infra/queues/redis.js";
import { ScanQueueProducer } from "../../infra/queues/scan-queue.producer.js";
import { ScanOutboxRelay } from "../../infra/outbox/scan-outbox.relay.js";
import { publishScanProgressEvent } from "../../infra/realtime/scan-progress-event.publisher.js";
import { ScansRepository } from "./scans.repository.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import type { ScanOrchestratorJobData } from "@audit-scanner/shared/queues/scan-jobs";
import type { CreateScanInput, ListScansQuery } from "./scans.schemas.js";

export class ScansService {
  constructor(
    private readonly repository = new ScansRepository(),
    private readonly queueProducer = new ScanQueueProducer(),
    private readonly outboxRelay = new ScanOutboxRelay(queueProducer),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async create(
    input: CreateScanInput,
    userId: string,
    context: { traceId?: string | undefined; correlationId?: string | undefined } = {}
  ) {
    const normalizedInput = await this.normalizeSourceArtifactInput(input);
    this.assertSupportedScanMode(normalizedInput);
    await this.usageLimits.assertAndConsume(normalizedInput.organizationId, "SCANS_PER_MONTH", {
      resourceType: "SCAN"
    });
    await this.assertAdmissionCapacity();
    const traceId = context.traceId ?? randomBytes(16).toString("hex");
    const provisionalScanId = randomUUID();
    const queueJob: ScanOrchestratorJobData = {
      scanId: provisionalScanId,
      organizationId: normalizedInput.organizationId,
      requestedByUserId: userId,
      traceId,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      priority: normalizedInput.priority,
      target: {
        type: normalizedInput.target.type,
        ...(normalizedInput.target.chainId ? { chainId: normalizedInput.target.chainId } : {}),
        ...(normalizedInput.target.address ? { address: normalizedInput.target.address } : {}),
        ...(normalizedInput.target.repositoryUrl ? { repositoryUrl: normalizedInput.target.repositoryUrl } : {}),
        ...(normalizedInput.target.artifactKey ? { artifactKey: normalizedInput.target.artifactKey } : {})
      },
      analyzers: normalizedInput.analyzers
    };

    const scan = await this.repository.create(normalizedInput, userId, {
      ...queueJob,
      scanId: provisionalScanId
    });
    if (normalizedInput.sourceArtifactId) {
      await this.repository.markSourceArtifactScan(normalizedInput.sourceArtifactId, scan.id).catch((error: unknown) => {
        logger.warn({ err: error, scanId: scan.id, sourceArtifactId: normalizedInput.sourceArtifactId }, "source artifact scan link failed");
      });
    }

    await this.outboxRelay.processPending().catch((error) => {
      logger.warn({ err: error, scanId: scan.id, traceId }, "scan outbox relay deferred");
    });
    await publishScanProgressEvent({
      type: "scan.queued",
      scanId: scan.id,
      organizationId: scan.organizationId,
      status: "QUEUED",
      progress: 0,
      message: "Scan was queued",
      traceId,
      correlationId: context.correlationId,
      data: {
        priority: normalizedInput.priority,
        analyzers: normalizedInput.analyzers
      }
    }).catch((error) => {
      logger.warn({ err: error, scanId: scan.id }, "queued realtime event publish failed");
    });

    return scan;
  }

  list(query: ListScansQuery) {
    return this.repository.list(query);
  }

    private async assertAdmissionCapacity(): Promise<void> {
    const queuedJobs = await this.queueProducer.getAdmissionDepth();
    if (queuedJobs >= env.SCAN_ADMISSION_MAX_QUEUED_JOBS) {
      throw ApiError.serviceUnavailable("Scan admission is temporarily saturated", {
        queuedJobs,
        limit: env.SCAN_ADMISSION_MAX_QUEUED_JOBS
      });
    }
  }

  private assertSupportedScanMode(input: CreateScanInput): void {
    if (input.target.type !== "SOURCE") {
      if (input.target.type === "ADDRESS" && (input as any).explorerSourceEnabled) {
        throw ApiError.conflict("P14B_ADDRESS_SCAN_HINT: use POST /chains/:chainId/contracts/:address/scan to fetch verified explorer source and queue a SOURCE scan. Direct ADDRESS scans never fabricate source.");
      }
      throw ApiError.notImplemented(
        `${input.target.type} scans require a real SOURCE artifact in this pipeline. For verified contracts use the P14B explorer source scan endpoint.`
      );
    }
  }

  private async normalizeSourceArtifactInput(input: CreateScanInput): Promise<CreateScanInput> {
    if (!input.sourceArtifactId) return input;
    const artifact = await this.repository.sourceArtifact(input.sourceArtifactId);
    if (!artifact || artifact.organizationId !== input.organizationId) {
      throw ApiError.accessDenied("Access denied");
    }
    if (input.projectId && artifact.projectId && artifact.projectId !== input.projectId) {
      throw ApiError.accessDenied("Access denied");
    }
    if (artifact.status !== "STORED" || !artifact.storageKey) {
      throw ApiError.conflict("Source artifact must be STORED before a scan can start");
    }
    return {
      ...input,
      projectId: input.projectId ?? artifact.projectId ?? undefined,
      target: {
        ...input.target,
        type: "SOURCE",
        artifactKey: artifact.storageKey
      }
    };
  }

  async get(scanId: string, organizationId?: string | undefined) {
    const scan = await this.repository.findById(scanId);
    if (!scan || (organizationId && scan.organizationId !== organizationId)) {
      throw ApiError.notFound("Scan");
    }

    return scan;
  }

  async cancel(scanId: string, organizationId?: string | undefined, requestedBy?: string | undefined) {
    const scan = await this.get(scanId, organizationId);

    if (["COMPLETED", "FAILED", "CANCELED"].includes(scan.status)) {
      throw ApiError.conflict("Scan is already finalized");
    }

    await redis.set(
      redisKey("scan", scanId, "cancel"),
      JSON.stringify({
        scanId,
        reason: "User requested cancellation",
        requestedBy,
        requestedAt: new Date().toISOString()
      }),
      "EX",
      24 * 60 * 60
    );

    const updated = await this.repository.updateStatus(scanId, {
      status: "CANCELED",
      canceledAt: new Date()
    });
    const traceId = getMetadataString(scan.metadata, "traceId");
    const correlationId = getMetadataString(scan.metadata, "correlationId");
    await this.repository.recordScanEvent({
      scanId,
      organizationId: scan.organizationId,
      type: "scan.canceled",
      status: "CANCELED",
      progress: 100,
      message: "Scan cancellation was requested",
      traceId,
      correlationId,
      data: {
        ...(requestedBy ? { requestedBy } : {})
      }
    });

    await publishScanProgressEvent({
      type: "scan.canceled",
      scanId,
      organizationId: scan.organizationId,
      status: "CANCELED",
      progress: 100,
      message: "Scan cancellation was requested",
      traceId,
      correlationId,
      data: {
        ...(requestedBy ? { requestedBy } : {})
      }
    }).catch((error) => {
      logger.warn({ err: error, scanId }, "canceled realtime event publish failed");
    });

    return updated;
  }
}

function getMetadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object" || !(key in metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
