import type { NotificationJobData } from "@audit-scanner/shared/queues/scan-jobs";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createNotificationProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<NotificationJobData> {
  return async ({ job, assertNotCancelled, signal }) => {
    await assertNotCancelled();
    await dependencies.notifications.dispatch(job.data, signal);

    return {
      dispatched: true,
      eventType: job.data.eventType
    };
  };
}
