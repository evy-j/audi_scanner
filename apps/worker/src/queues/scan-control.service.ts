import type { JobType } from "bullmq";
import type { Redis } from "ioredis";
import { SCAN_QUEUE_NAMES } from "@audit-scanner/shared/queues/scan-jobs";
import { logger } from "../common/logger.js";
import { CancellationService } from "./cancellation.service.js";
import type { QueueRegistry } from "./queue-registry.js";

const CANCELLABLE_WAITING_STATES: JobType[] = ["waiting", "delayed", "prioritized"];

export class ScanControlService {
  private readonly cancellation: CancellationService;

  constructor(
    private readonly queueRegistry: QueueRegistry,
    redis: Redis
  ) {
    this.cancellation = new CancellationService(redis);
  }

  async cancelScan(input: {
    scanId: string;
    reason: string;
    requestedBy?: string | undefined;
  }): Promise<{ removedWaitingJobs: number }> {
    await this.cancellation.requestCancellation(input);

    let removedWaitingJobs = 0;

    for (const queueName of Object.values(SCAN_QUEUE_NAMES)) {
      const queue = this.queueRegistry.getQueue(queueName);
      let start = 0;
      let jobs = await queue.getJobs(CANCELLABLE_WAITING_STATES, start, start + 999, true);

      while (jobs.length > 0) {
        await Promise.all(
          jobs
            .filter((job) => job.data.scanId === input.scanId)
            .map(async (job) => {
              await job.remove();
              removedWaitingJobs += 1;
            })
        );

        start += 1_000;
        jobs = await queue.getJobs(CANCELLABLE_WAITING_STATES, start, start + 999, true);
      }
    }

    logger.warn(
      {
        scanId: input.scanId,
        requestedBy: input.requestedBy,
        removedWaitingJobs
      },
      "scan cancellation requested"
    );

    return { removedWaitingJobs };
  }
}
