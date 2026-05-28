import {
  SCAN_QUEUE_NAMES,
  type ReportJobData,
  type RiskScoreJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "../queues/priority.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createRiskScoreProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<RiskScoreJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "SCORING",
      progress: 82,
      message: "Calculating scan risk score",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId
    });

    await progress.publish(job, {
      type: "risk.scoring",
      status: "SCORING",
      progress: 82,
      message: "Calculating scan risk score"
    });

    const result = await dependencies.riskScoring.score(job.data, signal);

    const reportJob: ReportJobData = {
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      requestedByUserId: job.data.requestedByUserId,
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      priority: job.data.priority,
      riskScore: result.riskScore,
      vulnerabilityCount: job.data.vulnerabilityCount,
      normalizedArtifactKey: job.data.normalizedArtifactKey,
      severityCounts: result.severityCounts,
      analysisPartial: job.data.analysisPartial,
      analyzerFailures: job.data.analyzerFailures,
      attemptContext: {
        parentJobId: job.id,
        submittedAt: new Date().toISOString()
      }
    };

    await dependencies.queues.getQueue(SCAN_QUEUE_NAMES.aiReport).add("ai.report", reportJob, {
      jobId: `scan:${job.data.scanId}:ai.report`,
      priority: toBullPriority(job.data.priority)
    });

    return result;
  };
}
