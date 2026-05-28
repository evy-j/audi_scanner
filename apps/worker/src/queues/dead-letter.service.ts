import type { Job } from "bullmq";
import { randomUUID } from "node:crypto";
import {
  type DeadLetterJobData,
  type ScanQueueJobData,
  type ScanQueueName
} from "@audit-scanner/shared/queues/scan-jobs";
import { getErrorStack } from "../common/errors.js";
import { logger } from "../common/logger.js";
import type { QueueRegistry } from "./queue-registry.js";

export class DeadLetterService {
  constructor(private readonly queueRegistry: QueueRegistry) {}

  async moveIfExhausted(
    queueName: ScanQueueName,
    job: Job<ScanQueueJobData> | undefined,
    error: Error
  ): Promise<void> {
    if (!job) {
      logger.error({ queueName, error }, "worker failure without job context");
      return;
    }

    if (error.message.includes("was cancelled")) {
      logger.info(
        { queueName, jobId: job.id, scanId: job.data.scanId },
        "cancelled job skipped dead-letter routing"
      );
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    const stacktrace = getErrorStack(error);
    const payload: DeadLetterJobData = {
      failedQueueName: queueName,
      failedJobName: job.name,
      failedJobData: job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
      movedAt: new Date().toISOString(),
      traceId: job.data.traceId,
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      ...(stacktrace ? { stacktrace } : {}),
      ...(job.id ? { failedJobId: job.id } : {})
    };

    await this.queueRegistry
      .getDeadLetterQueue(queueName)
      .add("dead-letter", payload, {
        jobId: `${queueName}:${job.id ?? randomUUID()}`,
        removeOnComplete: false,
        removeOnFail: false
      });

    logger.error(
      {
        queueName,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        scanId: job.data.scanId,
        organizationId: job.data.organizationId
      },
      "job moved to dead-letter queue"
    );
  }
}
