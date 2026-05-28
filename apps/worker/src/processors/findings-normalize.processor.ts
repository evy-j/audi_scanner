import {
  SCAN_QUEUE_NAMES,
  type FindingsNormalizeJobData,
  type RiskScoreJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "../queues/priority.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createFindingsNormalizeProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<FindingsNormalizeJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "NORMALIZING",
      progress: 75,
      message: "Normalizing analyzer findings",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId
    });

    await progress.publish(job, {
      type: "findings.normalizing",
      status: "NORMALIZING",
      progress: 75,
      message: "Normalizing analyzer findings"
    });

    const result = await dependencies.findingsNormalization.normalize(job.data, signal);

    const riskJob: RiskScoreJobData = {
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      requestedByUserId: job.data.requestedByUserId,
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      priority: job.data.priority,
      vulnerabilityCount: result.vulnerabilityCount,
      normalizedArtifactKey: result.normalizedArtifactKey,
      normalizationRiskScore: result.riskScore,
      severityCounts: result.severityCounts,
      analysisPartial: job.data.analysisPartial,
      analyzerFailures: job.data.analyzerFailures,
      attemptContext: {
        parentJobId: job.id,
        submittedAt: new Date().toISOString()
      }
    };

    await dependencies.queues.getQueue(SCAN_QUEUE_NAMES.riskScore).add("risk.score", riskJob, {
      jobId: `scan:${job.data.scanId}:risk.score`,
      priority: toBullPriority(job.data.priority)
    });

    return result;
  };
}
