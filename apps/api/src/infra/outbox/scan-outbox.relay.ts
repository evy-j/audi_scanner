import { prisma } from "@audit-scanner/database";
import type { ScanOrchestratorJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import { logger } from "../../common/logging/logger.js";
import { ScanQueueProducer } from "../queues/scan-queue.producer.js";

const SCAN_ORCHESTRATOR_EVENT_TYPE = "scan.orchestrator.enqueue";

export class ScanOutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly queueProducer = new ScanQueueProducer()) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.processPending().catch((error) => {
        logger.error({ err: error }, "scan outbox relay failed");
      });
    }, env.OUTBOX_RELAY_INTERVAL_MS);
    this.timer.unref();

    void this.processPending().catch((error) => {
      logger.error({ err: error }, "initial scan outbox relay failed");
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processPending(): Promise<number> {
    if (this.running) {
      return 0;
    }

    this.running = true;
    try {
      const now = new Date();
      const messages = await prisma.outboxMessage.findMany({
        where: {
          eventType: SCAN_ORCHESTRATOR_EVENT_TYPE,
          status: "PENDING",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
        },
        orderBy: { createdAt: "asc" },
        take: env.OUTBOX_RELAY_BATCH_SIZE
      });

      let processed = 0;
      for (const message of messages) {
        const claimed = await prisma.outboxMessage.updateMany({
          where: {
            id: message.id,
            status: "PENDING"
          },
          data: {
            status: "PROCESSING",
            lockedAt: new Date()
          }
        });

        if (claimed.count !== 1) {
          continue;
        }

        try {
          await this.queueProducer.enqueue(message.payload as unknown as ScanOrchestratorJobData);
          await prisma.outboxMessage.update({
            where: { id: message.id },
            data: {
              status: "PROCESSED",
              processedAt: new Date(),
              error: null
            }
          });
          processed += 1;
        } catch (error) {
          const attempts = message.attempts + 1;
          const exhausted = attempts >= env.OUTBOX_RELAY_MAX_ATTEMPTS;
          await prisma.outboxMessage.update({
            where: { id: message.id },
            data: {
              status: exhausted ? "FAILED" : "PENDING",
              attempts,
              lockedAt: null,
              nextAttemptAt: exhausted ? null : new Date(Date.now() + retryDelayMs(attempts)),
              error: error instanceof Error ? error.message : String(error)
            }
          });
          logger.warn(
            {
              err: error,
              outboxMessageId: message.id,
              scanId: message.aggregateId,
              attempts,
              exhausted,
              traceId: message.traceId,
              correlationId: message.correlationId
            },
            "scan outbox enqueue failed"
          );
        }
      }

      return processed;
    } finally {
      this.running = false;
    }
  }
}

export function scanOrchestratorOutboxEventType(): string {
  return SCAN_ORCHESTRATOR_EVENT_TYPE;
}

function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}
