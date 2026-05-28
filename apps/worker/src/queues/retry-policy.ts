import type { BackoffOptions, JobsOptions } from "bullmq";
import {
  SCAN_QUEUE_NAMES,
  type ScanQueueName
} from "@audit-scanner/shared/queues/scan-jobs";

export interface QueueRetryPolicy {
  attempts: number;
  backoff: BackoffOptions;
  timeoutMs: number;
}

export const RETRY_POLICIES: Record<ScanQueueName, QueueRetryPolicy> = {
  [SCAN_QUEUE_NAMES.scanOrchestrator]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    timeoutMs: 10 * 60_000
  },
  [SCAN_QUEUE_NAMES.sourcePrepare]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    timeoutMs: 5 * 60_000
  },
  [SCAN_QUEUE_NAMES.buildCompile]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    timeoutMs: 60 * 60_000
  },
  [SCAN_QUEUE_NAMES.analyzerSlither]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 20_000 },
    timeoutMs: 15 * 60_000
  },
  [SCAN_QUEUE_NAMES.analyzerMythril]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 },
    timeoutMs: 60 * 60_000
  },
  [SCAN_QUEUE_NAMES.analyzerSemgrep]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 20_000 },
    timeoutMs: 15 * 60_000
  },
  [SCAN_QUEUE_NAMES.analyzerAderyn]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 20_000 },
    timeoutMs: 15 * 60_000
  },
  [SCAN_QUEUE_NAMES.analyzerFoundry]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    timeoutMs: 30 * 60_000
  },
  [SCAN_QUEUE_NAMES.findingsNormalize]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    timeoutMs: 5 * 60_000
  },
  [SCAN_QUEUE_NAMES.riskScore]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    timeoutMs: 3 * 60_000
  },
  [SCAN_QUEUE_NAMES.aiValidate]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    timeoutMs: 10 * 60_000
  },
  [SCAN_QUEUE_NAMES.aiReport]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    timeoutMs: 10 * 60_000
  },
  [SCAN_QUEUE_NAMES.pdfGenerate]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 20_000 },
    timeoutMs: 10 * 60_000
  },
  [SCAN_QUEUE_NAMES.notificationsDispatch]: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    timeoutMs: 2 * 60_000
  }
};

export function getDefaultJobOptions(queueName: ScanQueueName): JobsOptions {
  const policy = RETRY_POLICIES[queueName];

  return {
    attempts: policy.attempts,
    backoff: policy.backoff,
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 10_000
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 50_000
    }
  };
}
