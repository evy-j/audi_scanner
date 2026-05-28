import {
  SCAN_QUEUE_NAMES,
  type AnalyzerJobData,
  type FindingsNormalizeJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import type { AnalyzerRunStatus } from "@prisma/client";
import { toBullPriority } from "../queues/priority.js";
import type { AnalyzerCompletionState } from "../queues/scan-stage-coordinator.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import { CancelledScanError } from "../common/errors.js";
import { ScannerExecutionFailedError } from "../services/scan-execution/errors.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createAnalyzerProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<AnalyzerJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();
    const analyzerRun = await dependencies.persistence.startAnalyzerRun(job.data);

    await progress.publish(job, {
      type: "analyzer.started",
      status: "ANALYZING",
      progress: 30,
      message: `${job.data.analyzer} analysis started`,
      data: {
        analyzer: job.data.analyzer
      }
    });

    if (job.data.analyzer === "foundry") {
      const message = "Foundry tests are executed by the P3 build/test runner and are persisted as test runs";
      await dependencies.persistence.finalizeAnalyzerRun({
        analyzerRunId: analyzerRun.id,
        status: "NOT_ASSESSED",
        startedAt: analyzerRun.startedAt,
        error: message,
        metadata: {
          preparedArtifactKey: job.data.preparedArtifactKey,
          reason: message
        }
      });
      await dependencies.persistence.recordToolAvailability({
        scanId: job.data.scanId,
        organizationId: job.data.organizationId,
        toolName: "foundry",
        available: false,
        status: "NOT_ASSESSED",
        errorCategory: "NOT_ASSESSED",
        error: message
      });
      const completion = await dependencies.stageCoordinator.recordAnalyzerFailure(
        job.data.scanId,
        job.data.analyzer,
        message
      );
      await enqueueNextStageIfReady(dependencies, job.data, job.id, completion, progress, job);
      return {
        analyzer: job.data.analyzer,
        status: "NOT_ASSESSED",
        assessed: false
      };
    }

    try {
      const result = await dependencies.scannerExecution.execute(job.data, signal);
      await dependencies.persistence.finalizeAnalyzerRun({
        analyzerRunId: analyzerRun.id,
        status: "COMPLETED",
        startedAt: analyzerRun.startedAt,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        rawArtifactKey: result.rawArtifactKey,
        rawArtifactChecksumSha256: result.rawArtifactChecksumSha256,
        standardizedArtifactKey: result.standardizedArtifactKey,
        metadata: {
          preparedArtifactKey: job.data.preparedArtifactKey,
          scannerImage: job.data.scannerImage,
          timeoutMs: job.data.timeoutMs,
          analyzerVersion: result.analyzerVersion,
          warnings: result.warnings ?? []
        }
      });
      await dependencies.persistence.recordToolAvailability({
        scanId: job.data.scanId,
        organizationId: job.data.organizationId,
        toolName: job.data.analyzer,
        toolVersion: result.analyzerVersion,
        available: true,
        status: "AVAILABLE",
        artifactKey: result.standardizedArtifactKey,
        metadata: {
          rawArtifactKey: result.rawArtifactKey,
          rawArtifactChecksumSha256: result.rawArtifactChecksumSha256 ?? null
        }
      });

      const completion = await dependencies.stageCoordinator.recordAnalyzerCompletion(
        job.data.scanId,
        job.data.analyzer,
        result.rawArtifactKey
      );

      await progress.publish(job, {
        type: "analyzer.completed",
        status: "ANALYZING",
        progress: Math.min(70, 30 + completion.completedCount * 10),
        message: `${job.data.analyzer} analysis completed`,
        data: {
          analyzer: job.data.analyzer,
          analyzerVersion: result.analyzerVersion,
          completedCount: completion.completedCount,
          failedCount: completion.failedCount,
          expectedCount: completion.expectedCount
        }
      });

      await enqueueNextStageIfReady(dependencies, job.data, job.id, completion, progress, job);
      return result;
    } catch (error) {
      const status = classifyAnalyzerFailure(error);
      await dependencies.persistence.finalizeAnalyzerRun({
        analyzerRunId: analyzerRun.id,
        status,
        startedAt: analyzerRun.startedAt,
        exitCode: error instanceof ScannerExecutionFailedError ? error.details.exitCode : null,
        rawArtifactKey: error instanceof ScannerExecutionFailedError ? error.details.rawArtifactKey : undefined,
        rawArtifactChecksumSha256:
          error instanceof ScannerExecutionFailedError ? error.details.rawArtifactChecksumSha256 : undefined,
        standardizedArtifactKey:
          error instanceof ScannerExecutionFailedError ? error.details.standardizedArtifactKey : undefined,
        error: error instanceof Error ? error.message : String(error)
      });
      await dependencies.persistence.recordToolAvailability({
        scanId: job.data.scanId,
        organizationId: job.data.organizationId,
        toolName: job.data.analyzer,
        available: false,
        status,
        errorCategory: status,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof CancelledScanError || status === "CANCELED") {
        throw error;
      }

      if (shouldRetry(status, job.attemptsMade, job.opts.attempts ?? 1)) {
        throw error;
      }

      const failureMessage = `${job.data.analyzer} analysis ${formatAnalyzerRunStatus(status)}`;
      const completion = await dependencies.stageCoordinator.recordAnalyzerFailure(
        job.data.scanId,
        job.data.analyzer,
        failureMessage
      );

      await progress.publish(job, {
        type: "analyzer.failed",
        status: "ANALYZING",
        progress: Math.min(70, 30 + completion.completedCount * 10),
        message: failureMessage,
        data: {
          analyzer: job.data.analyzer,
          analyzerStatus: status,
          completedCount: completion.completedCount,
          failedCount: completion.failedCount,
          expectedCount: completion.expectedCount
        }
      });

      await enqueueNextStageIfReady(dependencies, job.data, job.id, completion, progress, job);
      return {
        analyzer: job.data.analyzer,
        status,
        assessed: false
      };
    }
  };
}

async function enqueueNextStageIfReady(
  dependencies: ProcessorDependencies,
  data: AnalyzerJobData,
  parentJobId: string | undefined,
  completion: AnalyzerCompletionState,
  progress: Parameters<QueueProcessor<AnalyzerJobData>>[0]["progress"],
  job: Parameters<QueueProcessor<AnalyzerJobData>>[0]["job"]
): Promise<void> {
  if (!completion.complete) {
    return;
  }

  if (completion.artifactKeys.length === 0) {
    await dependencies.lifecycle.transition({
      scanId: data.scanId,
      organizationId: data.organizationId,
      status: "FAILED",
      progress: 0,
      message: "Scan failed because no analyzer completed successfully",
      traceId: data.traceId,
      correlationId: data.correlationId,
      metadata: {
        analyzerFailures: completion.failures
      }
    });

    await progress.publish(job, {
      type: "scan.failed",
      status: "FAILED",
      progress: 0,
      message: "Scan failed because no analyzer completed successfully",
      data: {
        analyzerFailures: completion.failures
      }
    });
    return;
  }

  const normalizeJob: FindingsNormalizeJobData = {
    scanId: data.scanId,
    organizationId: data.organizationId,
    requestedByUserId: data.requestedByUserId,
    traceId: data.traceId,
    correlationId: data.correlationId,
    priority: data.priority,
    analyzerArtifactKeys: completion.artifactKeys,
    analyzerFailures: completion.failures,
    analysisPartial: completion.failedCount > 0,
    attemptContext: {
      parentJobId,
      submittedAt: new Date().toISOString()
    }
  };

  await dependencies.queues.getQueue(SCAN_QUEUE_NAMES.findingsNormalize).add(
    "findings.normalize",
    normalizeJob,
    {
      jobId: `scan:${data.scanId}:findings.normalize`,
      priority: toBullPriority(data.priority)
    }
  );
}

function classifyAnalyzerFailure(error: unknown): AnalyzerRunStatus {
  if (error instanceof CancelledScanError) {
    return "CANCELED";
  }

  if (error instanceof ScannerExecutionFailedError) {
    if (error.details.status === "TIMED_OUT") {
      return "TIMEOUT";
    }
    if (error.details.status === "CANCELED") {
      return "CANCELED";
    }
    if (isToolNotInstalledMessage(error.message)) {
      return "TOOL_NOT_INSTALLED";
    }
    return "FAILED";
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/unsupported scanner analyzer|not assessed/i.test(message)) {
    return "NOT_ASSESSED";
  }
  if (/not configured|provider/i.test(message)) {
    return "PROVIDER_NOT_CONFIGURED";
  }
  if (isToolNotInstalledMessage(message)) {
    return "TOOL_NOT_INSTALLED";
  }
  if (/timeout|timed out/i.test(message)) {
    return "TIMEOUT";
  }
  return "FAILED";
}

function isToolNotInstalledMessage(message: string): boolean {
  return /ENOENT|command not found|executable file not found|no such image|pull access denied|image.*not found|docker.*not found/i.test(message);
}

function shouldRetry(status: AnalyzerRunStatus, attemptsMade: number, configuredAttempts: number): boolean {
  const remainingAttempts = configuredAttempts - attemptsMade - 1;
  return remainingAttempts > 0 && (status === "FAILED" || status === "TIMEOUT");
}

function formatAnalyzerRunStatus(status: AnalyzerRunStatus): string {
  return status.toLowerCase().replace(/_/gu, " ");
}
