import {
  SCAN_QUEUE_NAMES,
  type BuildJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "../queues/priority.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";
import { analyzerQueueName, createAnalyzerJob } from "./source-prepare.processor.js";

export function createBuildProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<BuildJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "ANALYZING",
      progress: 28,
      message: "Detecting build profile and capturing compiler artifacts",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId
    });

    await progress.publish(job, {
      type: "build.started",
      status: "ANALYZING",
      progress: 28,
      message: "Build profile detection started"
    });

    const result = await dependencies.buildExecution.detectBuildProfile(job.data, signal);

    await progress.publish(job, {
      type: "build.completed",
      status: "ANALYZING",
      progress: 32,
      message: "Build profile detection completed",
      data: {
        status: result.status,
        buildRunId: result.buildRunId,
        compilerArtifactCount: result.compilerArtifactCount,
        testRunCount: result.testRunCount
      }
    });

    await Promise.all(
      job.data.analyzers.map(async (analyzer) => {
        const analyzerJob = createAnalyzerJob({
          source: job.data,
          analyzer,
          parentJobId: job.id
        });

        await dependencies.queues.getQueue(analyzerQueueName(analyzer)).add(
          `analyzer.${analyzer}`,
          analyzerJob,
          {
            jobId: `scan:${job.data.scanId}:analyzer:${analyzer}`,
            priority: toBullPriority(job.data.priority)
          }
        );
      })
    );

    return {
      ...result,
      enqueued: job.data.analyzers.length > 0 ? SCAN_QUEUE_NAMES.findingsNormalize : undefined
    };
  };
}
