import type { JobsOptions } from "bullmq";
import {
  SCAN_QUEUE_NAMES,
  type ScanOrchestratorJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "./priority.js";
import type { QueueRegistry } from "./queue-registry.js";

export class ScanJobProducer {
  constructor(private readonly queueRegistry: QueueRegistry) {}

  async enqueueScan(data: ScanOrchestratorJobData, options: JobsOptions = {}) {
    const queue = this.queueRegistry.getQueue(SCAN_QUEUE_NAMES.scanOrchestrator);

    return queue.add("scan.orchestrate", data, {
      jobId: `scan:${data.scanId}:orchestrator`,
      priority: toBullPriority(data.priority),
      ...options
    });
  }
}
