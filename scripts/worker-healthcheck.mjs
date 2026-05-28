import { spawnSync } from "node:child_process";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableReadyCheck: false,
  commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 5_000),
  retryStrategy: null
});
redis.on("error", () => undefined);

try {
  await redis.connect();
  await redis.ping();

  if (process.env.DATABASE_URL) {
    const postgres = spawnSync("pg_isready", ["-d", process.env.DATABASE_URL], {
      stdio: "ignore",
      env: process.env
    });

    if (postgres.status !== 0) {
      throw new Error("PostgreSQL readiness check failed");
    }
  }

  if (process.env.SCANNER_EXECUTION_MODE === "container") {
    const docker = spawnSync(process.env.SCANNER_DOCKER_BINARY ?? "docker", ["version"], {
      stdio: "ignore",
      env: process.env
    });

    if (docker.status !== 0) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
