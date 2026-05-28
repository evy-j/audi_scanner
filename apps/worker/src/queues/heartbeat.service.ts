import type { Redis } from "ioredis";
import { env } from "../config/environment.js";
import { logger } from "../common/logger.js";
import { buildRedisKey } from "../redis/redis-connection.js";

export interface WorkerHeartbeatState {
  workerId: string;
  queues: string[];
  activeJobIds: string[];
  pid: number;
  hostname?: string;
  startedAt: string;
  beatAt: string;
}

export class WorkerHeartbeatService {
  private interval?: NodeJS.Timeout;
  private readonly startedAt = new Date().toISOString();
  private activeJobIds = new Set<string>();

  constructor(
    private readonly redis: Redis,
    private readonly workerId: string,
    private readonly queues: string[]
  ) {}

  track(jobId: string): void {
    this.activeJobIds.add(jobId);
  }

  untrack(jobId: string): void {
    this.activeJobIds.delete(jobId);
  }

  start(): void {
    this.interval = setInterval(() => {
      void this.beat().catch((error) => {
        logger.error({ error, workerId: this.workerId }, "failed to write worker heartbeat");
      });
    }, env.WORKER_HEARTBEAT_INTERVAL_MS);

    void this.beat();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }

    await this.redis.del(this.getHeartbeatKey());
  }

  async beat(): Promise<void> {
    const state: WorkerHeartbeatState = {
      workerId: this.workerId,
      queues: this.queues,
      activeJobIds: Array.from(this.activeJobIds),
      pid: process.pid,
      startedAt: this.startedAt,
      beatAt: new Date().toISOString(),
      ...(env.WORKER_HOSTNAME ? { hostname: env.WORKER_HOSTNAME } : {})
    };

    await this.redis.set(
      this.getHeartbeatKey(),
      JSON.stringify(state),
      "PX",
      env.WORKER_HEARTBEAT_TTL_MS
    );
  }

  private getHeartbeatKey(): string {
    return buildRedisKey("worker", this.workerId, "heartbeat");
  }
}
