import { Queue } from "bullmq";
import {
  SCAN_QUEUE_NAMES,
  type AnalyzerJobData,
  type AiValidationJobData,
  type BuildJobData,
  type ScanOrchestratorJobData,
  type ScanPriority
} from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import { logger } from "../../common/logging/logger.js";
import { redis, shouldUseExternalRedis } from "./redis.js";

type AnalyzerQueueMap = {
  slither: Queue<AnalyzerJobData>;
  mythril: Queue<AnalyzerJobData>;
  semgrep: Queue<AnalyzerJobData>;
  aderyn: Queue<AnalyzerJobData>;
  foundry: Queue<AnalyzerJobData>;
};

type DisabledQueueResult = {
  id: string;
  name: string;
  queueMode: "disabled";
};

export class ScanQueueProducer {
  private readonly redisBacked = shouldUseExternalRedis();
  private readonly queue?: Queue<ScanOrchestratorJobData>;
  private readonly buildQueue?: Queue<BuildJobData>;
  private readonly aiValidationQueue?: Queue<AiValidationJobData>;
  private readonly analyzerQueues?: AnalyzerQueueMap;

  constructor() {
    if (!this.redisBacked) {
      logger.warn(
        {
          rateLimitStore: env.RATE_LIMIT_STORE,
          redisRequired: env.REDIS_REQUIRED
        },
        "scan queues disabled because external Redis is not configured; set REDIS_REQUIRED=true and REDIS_URL to enable worker-backed scans"
      );
      return;
    }

    this.queue = new Queue<ScanOrchestratorJobData>(SCAN_QUEUE_NAMES.scanOrchestrator, {
      connection: redis,
      prefix: env.REDIS_KEY_PREFIX,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 50_000 }
      }
    });
    this.buildQueue = new Queue<BuildJobData>(SCAN_QUEUE_NAMES.buildCompile, {
      connection: redis,
      prefix: env.REDIS_KEY_PREFIX
    });
    this.aiValidationQueue = new Queue<AiValidationJobData>(SCAN_QUEUE_NAMES.aiValidate, {
      connection: redis,
      prefix: env.REDIS_KEY_PREFIX
    });
    this.analyzerQueues = {
      slither: new Queue<AnalyzerJobData>(SCAN_QUEUE_NAMES.analyzerSlither, { connection: redis, prefix: env.REDIS_KEY_PREFIX }),
      mythril: new Queue<AnalyzerJobData>(SCAN_QUEUE_NAMES.analyzerMythril, { connection: redis, prefix: env.REDIS_KEY_PREFIX }),
      semgrep: new Queue<AnalyzerJobData>(SCAN_QUEUE_NAMES.analyzerSemgrep, { connection: redis, prefix: env.REDIS_KEY_PREFIX }),
      aderyn: new Queue<AnalyzerJobData>(SCAN_QUEUE_NAMES.analyzerAderyn, { connection: redis, prefix: env.REDIS_KEY_PREFIX }),
      foundry: new Queue<AnalyzerJobData>(SCAN_QUEUE_NAMES.analyzerFoundry, { connection: redis, prefix: env.REDIS_KEY_PREFIX })
    };
  }

  enqueue(data: ScanOrchestratorJobData) {
    if (!this.queue) {
      return this.disabledResult("scan.orchestrate", data.scanId);
    }

    return this.queue.add("scan.orchestrate", data, {
      jobId: `scan:${data.scanId}:orchestrator`,
      priority: toBullPriority(data.priority)
    });
  }

  enqueueBuild(data: BuildJobData) {
    if (!this.buildQueue) {
      return this.disabledResult("build.compile", data.scanId);
    }

    return this.buildQueue.add("build.compile", data, {
      jobId: `scan:${data.scanId}:build.compile:retry:${Date.now()}`,
      priority: toBullPriority(data.priority)
    });
  }

  enqueueAnalyzer(data: AnalyzerJobData) {
    const analyzerQueue = this.analyzerQueues?.[data.analyzer];
    if (!analyzerQueue) {
      return this.disabledResult(`analyzer.${data.analyzer}`, data.scanId);
    }

    return analyzerQueue.add(`analyzer.${data.analyzer}`, data, {
      jobId: `scan:${data.scanId}:analyzer:${data.analyzer}:retry:${Date.now()}`,
      priority: toBullPriority(data.priority)
    });
  }

  enqueueAiValidation(data: AiValidationJobData) {
    if (!this.aiValidationQueue) {
      return this.disabledResult("ai.validate", data.scanId);
    }

    return this.aiValidationQueue.add("ai.validate", data, {
      jobId: `scan:${data.scanId}:ai.validate:${data.scope.toLowerCase()}:${data.findingId ?? "scan"}:${Date.now()}`,
      priority: toBullPriority(data.priority)
    });
  }

  async getAdmissionDepth(): Promise<number> {
    if (!this.queue) {
      return 0;
    }

    const counts = await this.queue.getJobCounts("waiting", "delayed", "prioritized");
    return (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
  }

  private async disabledResult(name: string, scanId: string): Promise<DisabledQueueResult> {
    logger.warn(
      { name, scanId },
      "queue operation skipped because Redis-backed worker queues are disabled in this deployment"
    );
    return {
      id: `disabled:${scanId}:${name}`,
      name,
      queueMode: "disabled"
    };
  }
}

function toBullPriority(priority: ScanPriority): number {
  switch (priority) {
    case "CRITICAL":
      return 1;
    case "HIGH":
      return 5;
    case "NORMAL":
      return 10;
    case "LOW":
      return 20;
  }
}
