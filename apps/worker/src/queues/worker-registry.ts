import { DelayedError, Job, UnrecoverableError, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "../common/logger.js";
import { logger } from "../common/logger.js";
import { getErrorMessage } from "../common/errors.js";
import { withTimeout } from "../common/timeout.js";
import { env } from "../config/environment.js";
import type { ScanQueueJobData, ScanQueueName } from "@audit-scanner/shared/queues/scan-jobs";
import { createWorkerOptions } from "./queue-options.js";
import { RETRY_POLICIES } from "./retry-policy.js";
import { CancellationService } from "./cancellation.service.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { OrganizationConcurrencyLimiter } from "./concurrency-limiter.js";
import { ProgressPublisher } from "./progress-publisher.js";
import type { QueueRegistry } from "./queue-registry.js";
import type { WorkerHeartbeatService } from "./heartbeat.service.js";
import type { ScanLifecycleStore } from "../lifecycle/scan-lifecycle.service.js";

export interface WorkerJobContext<TData extends ScanQueueJobData = ScanQueueJobData> {
  job: Job<TData>;
  signal?: AbortSignal | undefined;
  workerId: string;
  queues: QueueRegistry;
  progress: ProgressPublisher;
  cancellation: CancellationService;
  log: Logger;
  assertNotCancelled: () => Promise<void>;
}

export type QueueProcessor<TData extends ScanQueueJobData = ScanQueueJobData> = (
  context: WorkerJobContext<TData>
) => Promise<unknown>;

export interface RegisterWorkerOptions<TData extends ScanQueueJobData = ScanQueueJobData> {
  queueName: ScanQueueName;
  concurrency: number;
  processor: QueueProcessor<TData>;
}

export class WorkerRegistry {
  private readonly workers: Worker[] = [];
  private readonly cancellation: CancellationService;
  private readonly deadLetter: DeadLetterService;
  private readonly concurrencyLimiter: OrganizationConcurrencyLimiter;
  private readonly progress: ProgressPublisher;

  constructor(
    private readonly queueRegistry: QueueRegistry,
    private readonly redis: Redis,
    private readonly workerId: string,
    private readonly heartbeat: WorkerHeartbeatService,
    private readonly lifecycle?: ScanLifecycleStore | undefined
  ) {
    this.cancellation = new CancellationService(redis);
    this.deadLetter = new DeadLetterService(queueRegistry);
    this.concurrencyLimiter = new OrganizationConcurrencyLimiter(redis);
    this.progress = new ProgressPublisher(redis, workerId);
  }

  register<TData extends ScanQueueJobData>(options: RegisterWorkerOptions<TData>): Worker {
    const worker = new Worker<TData>(
      options.queueName,
      async (job, token, signal) => {
        return this.runWithGuards(options.queueName, job, options.processor, signal, token);
      },
      createWorkerOptions(options.concurrency)
    );

    worker.on("active", (job) => {
      logger.info(
        {
          queueName: options.queueName,
          jobId: job.id,
          scanId: job.data.scanId,
          organizationId: job.data.organizationId
        },
        "job started"
      );
    });

    worker.on("completed", (job) => {
      logger.info(
        {
          queueName: options.queueName,
          jobId: job.id,
          scanId: job.data.scanId,
          organizationId: job.data.organizationId,
          attemptsMade: job.attemptsMade
        },
        "job completed"
      );
    });

    worker.on("failed", (job, error) => {
      logger.error(
        {
          queueName: options.queueName,
          jobId: job?.id,
          scanId: job?.data.scanId,
          organizationId: job?.data.organizationId,
          attemptsMade: job?.attemptsMade,
          error
        },
        "job failed"
      );

      void this.deadLetter.moveIfExhausted(options.queueName, job, error);

      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        const canceled = error.message.includes("was cancelled");
        void this.lifecycle?.transition({
          scanId: job.data.scanId,
          organizationId: job.data.organizationId,
          status: canceled ? "CANCELED" : "FAILED",
          progress: canceled ? 100 : 0,
          message: error.message,
          traceId: job.data.traceId,
          correlationId: job.data.correlationId,
          jobId: job.id,
          queueName: options.queueName,
          workerId: this.workerId,
          metadata: {
            attemptsMade: job.attemptsMade
          }
        });
        void this.progress.publish(job, {
          type: canceled ? "scan.canceled" : "scan.failed",
          status: canceled ? "CANCELED" : "FAILED",
          progress: canceled ? 100 : 0,
          message: error.message,
          data: {
            queueName: options.queueName,
            attemptsMade: job.attemptsMade
          }
        });
      }
    });

    worker.on("stalled", (jobId) => {
      logger.warn({ queueName: options.queueName, jobId }, "job stalled");
    });

    worker.on("lockRenewalFailed", (jobIds) => {
      logger.error({ queueName: options.queueName, jobIds }, "job lock renewal failed");
    });

    worker.on("error", (error) => {
      logger.error({ queueName: options.queueName, error }, "worker error");
    });

    this.workers.push(worker);
    return worker;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private async runWithGuards<TData extends ScanQueueJobData>(
    queueName: ScanQueueName,
    job: Job<TData>,
    processor: QueueProcessor<TData>,
    signal?: AbortSignal,
    token?: string
  ): Promise<unknown> {
    const jobId = job.id ?? `${queueName}:unknown`;
    const leaseOwner = `${this.workerId}:${queueName}:${jobId}`;
    const policy = RETRY_POLICIES[queueName];
    let lease = await this.concurrencyLimiter.acquire(job.data.organizationId, leaseOwner);

    if (!lease) {
      logger.warn(
        {
          queueName,
          jobId,
          scanId: job.data.scanId,
          organizationId: job.data.organizationId
        },
        "organization concurrency limit reached"
      );

      await job.moveToDelayed(Date.now() + env.ORG_CONCURRENCY_REQUEUE_DELAY_MS, token);
      throw new DelayedError();
    }

    const leaseRenewal = setInterval(() => {
      void lease?.renew().catch((error) => {
        logger.error({ error, queueName, jobId }, "failed to renew organization lease");
      });
    }, Math.max(1_000, Math.floor(policy.timeoutMs / 20)));

    const cancellationPoller = this.createCancellationPoller(job, queueName);
    const combinedSignal = combineSignals(signal, cancellationPoller.signal);

    this.heartbeat.track(jobId);

    try {
      await this.cancellation.assertNotCancelled(job.data.scanId);

      return await withTimeout(
        queueName,
        policy.timeoutMs,
        async (timeoutSignal) => {
          const runtimeSignal = combineSignals(combinedSignal, timeoutSignal);

          return processor({
            job,
            workerId: this.workerId,
            queues: this.queueRegistry,
            progress: this.progress,
            cancellation: this.cancellation,
            log: logger,
            ...(runtimeSignal ? { signal: runtimeSignal } : {}),
            assertNotCancelled: async () => {
              if (runtimeSignal?.aborted) {
                throw new UnrecoverableError(getErrorMessage(runtimeSignal.reason));
              }
              await this.cancellation.assertNotCancelled(job.data.scanId);
            }
          });
        },
        combinedSignal
      );
    } finally {
      clearInterval(leaseRenewal);
      cancellationPoller.stop();
      this.heartbeat.untrack(jobId);
      await lease.release();
    }
  }

  private createCancellationPoller<TData extends ScanQueueJobData>(
    job: Job<TData>,
    queueName: ScanQueueName
  ): { signal: AbortSignal; stop: () => void } {
    const controller = new AbortController();
    const interval = setInterval(() => {
      void this.cancellation.getCancellation(job.data.scanId).then((record) => {
        if (record && !controller.signal.aborted) {
          logger.warn(
            {
              queueName,
              jobId: job.id,
              scanId: job.data.scanId,
              reason: record.reason
            },
            "job cancellation requested"
          );
          controller.abort(record.reason);
        }
      });
    }, 1_000);

    return {
      signal: controller.signal,
      stop: () => clearInterval(interval)
    };
  }
}

function combineSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) {
    return undefined;
  }

  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  return AbortSignal.any(activeSignals);
}
