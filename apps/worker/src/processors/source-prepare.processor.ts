import {
  SCAN_QUEUE_NAMES,
  type AnalyzerJobData,
  type AnalyzerName,
  type BuildJobData,
  type ScanQueueName,
  type SourcePrepareJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "../queues/priority.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

const analyzerQueueByName: Record<AnalyzerName, ScanQueueName> = {
  slither: SCAN_QUEUE_NAMES.analyzerSlither,
  mythril: SCAN_QUEUE_NAMES.analyzerMythril,
  semgrep: SCAN_QUEUE_NAMES.analyzerSemgrep,
  aderyn: SCAN_QUEUE_NAMES.analyzerAderyn,
  foundry: SCAN_QUEUE_NAMES.analyzerFoundry
};

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

export function createSourcePrepareProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<SourcePrepareJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "PREPARING",
      progress: 15,
      message: "Preparing scan source workspace",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId
    });

    await progress.publish(job, {
      type: "scan.preparing",
      status: "PREPARING",
      progress: 15,
      message: "Preparing scan source workspace"
    });

    const prepared = await dependencies.sourcePreparation.prepare(job.data, signal);

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "ANALYZING",
      progress: 25,
      message: "Build detection queued",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      metadata: {
        preparedArtifactKey: prepared.preparedArtifactKey,
        compilerVersion: prepared.compilerVersion,
        framework: prepared.framework
      }
    });

    await progress.publish(job, {
      type: "scan.analyzing",
      status: "ANALYZING",
      progress: 25,
      message: "Build detection queued"
    });

    const buildJob: BuildJobData = {
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      requestedByUserId: job.data.requestedByUserId,
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      priority: job.data.priority,
      preparedArtifactKey: prepared.preparedArtifactKey,
      analyzers: job.data.analyzers,
      attemptContext: {
        parentJobId: job.id,
        submittedAt: new Date().toISOString()
      }
    };

    await dependencies.queues.getQueue(SCAN_QUEUE_NAMES.buildCompile).add(
      "build.compile",
      buildJob,
      {
        jobId: `scan:${job.data.scanId}:build.compile`,
        priority: toBullPriority(job.data.priority)
      }
    );

    return {
      preparedArtifactKey: prepared.preparedArtifactKey,
      analyzers: job.data.analyzers,
      enqueued: SCAN_QUEUE_NAMES.buildCompile
    };
  };
}

export function createAnalyzerJob(input: {
  source: BuildJobData;
  analyzer: AnalyzerName;
  parentJobId?: string | undefined;
}): AnalyzerJobData {
  return {
    scanId: input.source.scanId,
    organizationId: input.source.organizationId,
    requestedByUserId: input.source.requestedByUserId,
    traceId: input.source.traceId,
    correlationId: input.source.correlationId,
    priority: input.source.priority,
    analyzer: input.analyzer,
    preparedArtifactKey: input.source.preparedArtifactKey,
    scannerImage: scannerImageByAnalyzer[input.analyzer],
    timeoutMs: timeoutByAnalyzer[input.analyzer],
    attemptContext: {
      parentJobId: input.parentJobId,
      submittedAt: new Date().toISOString()
    }
  };
}

export function analyzerQueueName(analyzer: AnalyzerName): ScanQueueName {
  return analyzerQueueByName[analyzer];
}
