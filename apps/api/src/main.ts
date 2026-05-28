import { prisma } from "@audit-scanner/database";
import { createApiApp } from "./app.js";
import { env, validateApiStartupConfig } from "./config/environment.js";
import { logger } from "./common/logging/logger.js";
import { redis, shouldUseExternalRedis } from "./infra/queues/redis.js";
import { ScanOutboxRelay } from "./infra/outbox/scan-outbox.relay.js";
import { ScanRealtimeGateway } from "./realtime/scan-realtime.gateway.js";

validateApiStartupConfig();
const app = createApiApp();

const apiHost = process.env.HOST || "0.0.0.0";
const server = app.listen(env.PORT, apiHost, () => {
  logger.info(
    { port: env.PORT, host: apiHost, basePath: env.API_BASE_PATH, realtimePath: env.REALTIME_WS_PATH },
    "api server started"
  );
});

server.on("error", (error) => {
  logger.fatal({ err: error, port: env.PORT, host: apiHost }, "api server failed to bind");
  process.exit(1);
});
server.requestTimeout = env.HTTP_REQUEST_TIMEOUT_MS;
server.headersTimeout = env.HTTP_HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = env.HTTP_KEEP_ALIVE_TIMEOUT_MS;
server.maxHeadersCount = 100;
const realtimeGateway = new ScanRealtimeGateway(server);
const scanOutboxRelay = shouldUseExternalRedis() ? new ScanOutboxRelay() : null;
scanOutboxRelay?.start();
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.warn({ signal }, "api server shutting down");
  const forcedExit = setTimeout(() => {
    logger.fatal({ signal }, "api server shutdown grace period exceeded");
    process.exit(1);
  }, env.HTTP_SHUTDOWN_GRACE_MS);
  forcedExit.unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "http server shutdown failed");
      process.exit(1);
    }

    scanOutboxRelay?.stop();
    await Promise.allSettled([realtimeGateway.close(), prisma.$disconnect(), redis.quit()]);
    clearTimeout(forcedExit);
    logger.info("api server stopped");
    process.exit(0);
  });
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled promise rejection");
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  process.exit(1);
});
