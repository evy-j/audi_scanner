import { Queue, QueueEvents } from "bullmq";
import type { Redis } from "ioredis";
import {
  getDeadLetterQueueName,
  SCAN_QUEUE_NAMES,
  type DeadLetterJobData,
  type ScanQueueJobData,
  type ScanQueueName
} from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../config/environment.js";
import { logger } from "../common/logger.js";
import { createRedisConnection } from "../redis/redis-connection.js";
import { createQueueOptions } from "./queue-options.js";
import { getDefaultJobOptions } from "./retry-policy.js";

export type ScanQueue = Queue<ScanQueueJobData>;
export type DeadLetterQueue = Queue<DeadLetterJobData>;

const queueNames = Object.values(SCAN_QUEUE_NAMES);

const globalConcurrencyByQueue: Record<ScanQueueName, number> = {
  [SCAN_QUEUE_NAMES.scanOrchestrator]: env.GLOBAL_CONCURRENCY_SCAN_ORCHESTRATOR,
  [SCAN_QUEUE_NAMES.sourcePrepare]: env.GLOBAL_CONCURRENCY_SOURCE_PREPARE,
  [SCAN_QUEUE_NAMES.buildCompile]: env.GLOBAL_CONCURRENCY_BUILD_COMPILE,
  [SCAN_QUEUE_NAMES.analyzerSlither]: env.GLOBAL_CONCURRENCY_SLITHER,
  [SCAN_QUEUE_NAMES.analyzerMythril]: env.GLOBAL_CONCURRENCY_MYTHRIL,
  [SCAN_QUEUE_NAMES.analyzerSemgrep]: env.GLOBAL_CONCURRENCY_SEMGREP,
  [SCAN_QUEUE_NAMES.analyzerAderyn]: env.GLOBAL_CONCURRENCY_ADERYN,
  [SCAN_QUEUE_NAMES.analyzerFoundry]: env.GLOBAL_CONCURRENCY_FOUNDRY,
  [SCAN_QUEUE_NAMES.findingsNormalize]: env.GLOBAL_CONCURRENCY_FINDINGS_NORMALIZE,
  [SCAN_QUEUE_NAMES.riskScore]: env.GLOBAL_CONCURRENCY_RISK_SCORE,
  [SCAN_QUEUE_NAMES.aiValidate]: env.GLOBAL_CONCURRENCY_AI_VALIDATE,
  [SCAN_QUEUE_NAMES.aiReport]: env.GLOBAL_CONCURRENCY_AI_REPORT,
  [SCAN_QUEUE_NAMES.pdfGenerate]: env.GLOBAL_CONCURRENCY_PDF_GENERATE,
  [SCAN_QUEUE_NAMES.notificationsDispatch]: env.GLOBAL_CONCURRENCY_NOTIFICATIONS
};

export class QueueRegistry {
  private readonly queues = new Map<ScanQueueName, ScanQueue>();
  private readonly deadLetterQueues = new Map<ScanQueueName, DeadLetterQueue>();
  private readonly queueEvents = new Map<ScanQueueName, QueueEvents>();
  private readonly sharedQueueConnection: Redis;

  constructor() {
    this.sharedQueueConnection = createRedisConnection("queue");
    const sharedQueueOptions = createQueueOptions(this.sharedQueueConnection);

    for (const queueName of queueNames) {
      this.queues.set(
        queueName,
        new Queue<ScanQueueJobData>(queueName, {
          ...sharedQueueOptions,
          defaultJobOptions: getDefaultJobOptions(queueName)
        })
      );

      this.deadLetterQueues.set(
        queueName,
        new Queue<DeadLetterJobData>(getDeadLetterQueueName(queueName), {
          ...sharedQueueOptions,
          defaultJobOptions: {
            attempts: 1,
            removeOnComplete: false,
            removeOnFail: false
          }
        })
      );

      if (env.WORKER_QUEUE_EVENTS_ENABLED) {
        this.queueEvents.set(
          queueName,
          new QueueEvents(queueName, {
            connection: createRedisConnection("events"),
            prefix: env.REDIS_KEY_PREFIX
          })
        );
      }
    }

    if (!env.WORKER_QUEUE_EVENTS_ENABLED) {
      logger.warn(
        "BullMQ QueueEvents are disabled to reduce Redis connections in single-service/free Redis mode"
      );
    }
  }

  getQueue(queueName: ScanQueueName): ScanQueue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue is not registered: ${queueName}`);
    }

    return queue;
  }

  getDeadLetterQueue(queueName: ScanQueueName): DeadLetterQueue {
    const queue = this.deadLetterQueues.get(queueName);
    if (!queue) {
      throw new Error(`Dead-letter queue is not registered: ${queueName}`);
    }

    return queue;
  }

  getQueueEvents(queueName: ScanQueueName): QueueEvents {
    const events = this.queueEvents.get(queueName);
    if (!events) {
      throw new Error(`QueueEvents is not registered or disabled: ${queueName}`);
    }

    return events;
  }

  async configureGlobalConcurrency(): Promise<void> {
    await Promise.all(
      queueNames.map(async (queueName) => {
        const queue = this.getQueue(queueName);
        const concurrency = globalConcurrencyByQueue[queueName];
        await queue.setGlobalConcurrency(concurrency);
        logger.info({ queueName, concurrency }, "configured queue global concurrency");
      })
    );
  }

  async close(): Promise<void> {
    await Promise.all([
      ...Array.from(this.queueEvents.values()).map((events) => events.close()),
      ...Array.from(this.queues.values()).map((queue) => queue.close()),
      ...Array.from(this.deadLetterQueues.values()).map((queue) => queue.close())
    ]);
    this.sharedQueueConnection.disconnect();
  }
}
