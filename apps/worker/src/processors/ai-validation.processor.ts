import type { AiValidationJobData } from "@audit-scanner/shared/queues/scan-jobs";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createAiValidationProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<AiValidationJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    await progress.publish(job, {
      type: "ai.validation.started",
      status: "COMPLETED",
      progress: 100,
      message: "AI evidence validation started",
      data: {
        scope: job.data.scope,
        findingId: job.data.findingId ?? null
      }
    });

    const result = await dependencies.aiValidation.validate(job.data, signal);

    await progress.publish(job, {
      type: "ai.validation.completed",
      status: "COMPLETED",
      progress: 100,
      message: "AI evidence validation completed",
      data: {
        scope: result.scope,
        status: result.status,
        decision: result.decision ?? null,
        aiValidationRunId: result.aiValidationRunId ?? null
      }
    });

    return result;
  };
}
