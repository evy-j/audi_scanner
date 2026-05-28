import { logger } from "./common/logger.js";
import { createScanWorkerApplication } from "./app.js";
import { env, validateWorkerStartupConfig } from "./config/environment.js";
import { assertRedisReadyForWorker } from "./redis/redis-connection.js";

validateWorkerStartupConfig();

try {
  await assertRedisReadyForWorker();
} catch (error) {
  logger.error(
    { error, strict: env.SINGLE_SERVICE_WORKER_STRICT },
    "worker redis preflight failed; worker will not start until Redis is reachable"
  );

  if (!env.SINGLE_SERVICE_WORKER_STRICT) {
    logger.warn(
      "single-service worker is non-strict; exiting worker without killing the Render web API"
    );
    process.exit(0);
  }

  process.exit(1);
}

const application = createScanWorkerApplication();

const shutdown = async (signal: NodeJS.Signals) => {
  logger.warn({ signal }, "received shutdown signal");
  try {
    await application.stop();
    process.exit(0);
  } catch (error) {
    logger.fatal({ error }, "failed to stop scan worker application cleanly");
    process.exit(1);
  }
};

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled promise rejection");
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "uncaught exception");
  process.exit(1);
});

await application.start();
