import type { QueueOptions, WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";
import { env } from "../config/environment.js";
import { createRedisConnection } from "../redis/redis-connection.js";

export function createQueueOptions(connection?: Redis): QueueOptions {
  return {
    connection: connection ?? createRedisConnection("queue"),
    prefix: env.REDIS_KEY_PREFIX,
    streams: {
      events: {
        maxLen: env.QUEUE_EVENTS_MAX_LEN
      }
    }
  };
}

export function createWorkerOptions(concurrency: number): WorkerOptions {
  return {
    connection: createRedisConnection("worker"),
    prefix: env.REDIS_KEY_PREFIX,
    concurrency,
    lockDuration: env.JOB_LOCK_DURATION_MS,
    stalledInterval: env.JOB_STALLED_INTERVAL_MS,
    maxStalledCount: env.JOB_MAX_STALLED_COUNT
  };
}
