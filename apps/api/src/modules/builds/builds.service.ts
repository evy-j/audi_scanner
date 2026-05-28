import { randomBytes } from "node:crypto";
import { ApiError } from "../../common/errors/api-error.js";
import { ScanQueueProducer } from "../../infra/queues/scan-queue.producer.js";
import { BuildsRepository } from "./builds.repository.js";
import type { RetryAnalyzersBody } from "./builds.schemas.js";
import type { AnalyzerName, BuildJobData } from "@audit-scanner/shared/queues/scan-jobs";

export class BuildsService {
  constructor(
    private readonly repository = new BuildsRepository(),
    private readonly queueProducer = new ScanQueueProducer()
  ) {}

  async buildProfile(scanId: string, organizationId: string) {
    const result = await this.repository.buildProfile(scanId, organizationId);
    if (result === undefined) throw ApiError.notFound("Scan");
    return result;
  }

  async buildRuns(scanId: string, organizationId: string) {
    const result = await this.repository.buildRuns(scanId, organizationId);
    if (result === null) throw ApiError.notFound("Scan");
    return result;
  }

  async compilerArtifacts(scanId: string, organizationId: string) {
    const result = await this.repository.compilerArtifacts(scanId, organizationId);
    if (result === null) throw ApiError.notFound("Scan");
    return result;
  }

  async testRuns(scanId: string, organizationId: string) {
    const result = await this.repository.testRuns(scanId, organizationId);
    if (result === null) throw ApiError.notFound("Scan");
    return result;
  }

  async toolAvailability(scanId: string, organizationId: string) {
    const result = await this.repository.toolAvailability(scanId, organizationId);
    if (result === null) throw ApiError.notFound("Scan");
    return result;
  }

  async retryBuild(scanId: string, organizationId: string, requestedByUserId?: string | undefined) {
    const context = await this.repository.retryContext(scanId, organizationId);
    if (!context) throw ApiError.notFound("Scan");
    const job = buildJob(context, requestedByUserId);
    await this.queueProducer.enqueueBuild(job);
    return { enqueued: true, queue: "build.compile", scanId, analyzers: job.analyzers };
  }

  async retryAnalyzers(
    scanId: string,
    organizationId: string,
    body: RetryAnalyzersBody,
    requestedByUserId?: string | undefined
  ) {
    const context = await this.repository.retryContext(scanId, organizationId);
    if (!context) throw ApiError.notFound("Scan");
    const analyzers = body.analyzers ?? context.analyzers;
    await Promise.all(
      analyzers.map((analyzer) =>
        this.queueProducer.enqueueAnalyzer({
          ...baseJob(context, requestedByUserId),
          analyzer,
          preparedArtifactKey: context.preparedArtifactKey,
          scannerImage: scannerImageByAnalyzer[analyzer],
          timeoutMs: timeoutByAnalyzer[analyzer]
        })
      )
    );
    return { enqueued: true, queue: "analyzer.*", scanId, analyzers };
  }
}

type RetryContext = NonNullable<Awaited<ReturnType<BuildsRepository["retryContext"]>>>;

function buildJob(context: RetryContext, requestedByUserId?: string | undefined): BuildJobData {
  return {
    ...baseJob(context, requestedByUserId),
    preparedArtifactKey: context.preparedArtifactKey,
    analyzers: context.analyzers
  };
}

function baseJob(context: RetryContext, requestedByUserId?: string | undefined) {
  return {
    scanId: context.scan.id,
    organizationId: context.scan.organizationId,
    requestedByUserId,
    traceId: randomBytes(16).toString("hex"),
    correlationId: undefined,
    priority: context.scan.priority
  };
}

const scannerImageByAnalyzer: Record<AnalyzerName, string> = {
  slither: "audit-scanner/scanner-slither:latest",
  mythril: "audit-scanner/scanner-mythril:latest",
  semgrep: "audit-scanner/scanner-semgrep:latest",
  aderyn: "audit-scanner/scanner-aderyn:latest",
  foundry: "audit-scanner/scanner-foundry:latest"
};

const timeoutByAnalyzer: Record<AnalyzerName, number> = {
  slither: 15 * 60_000,
  mythril: 60 * 60_000,
  semgrep: 15 * 60_000,
  aderyn: 15 * 60_000,
  foundry: 30 * 60_000
};
