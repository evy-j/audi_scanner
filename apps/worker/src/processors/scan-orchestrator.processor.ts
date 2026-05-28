import {
  SCAN_QUEUE_NAMES,
  type ScanOrchestratorJobData,
  type SourcePrepareJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "../queues/priority.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createScanOrchestratorProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<ScanOrchestratorJobData> {
  return async ({ job, progress, assertNotCancelled }) => {
    await assertNotCancelled();

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "QUEUED",
      progress: 5,
      message: "Scan orchestration started",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId
    });

    await progress.publish(job, {
      type: "scan.queued",
      status: "QUEUED",
      progress: 5,
      message: "Scan queued"
    });

    await dependencies.stageCoordinator.initializeAnalyzerStage(job.data.scanId, job.data.analyzers);

    const sourceJob: SourcePrepareJobData = {
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      requestedByUserId: job.data.requestedByUserId,
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      priority: job.data.priority,
      target: job.data.target,
      analyzers: job.data.analyzers,
      attemptContext: {
        parentJobId: job.id,
        submittedAt: new Date().toISOString()
      }
    };

    await dependencies.queues.getQueue(SCAN_QUEUE_NAMES.sourcePrepare).add(
      "source.prepare",
      sourceJob,
      {
        jobId: `scan:${job.data.scanId}:source.prepare`,
        priority: toBullPriority(job.data.priority)
      }
    );

    return {
      enqueued: SCAN_QUEUE_NAMES.sourcePrepare
    };
  };
}
