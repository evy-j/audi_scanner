#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const enableWorker = String(process.env.SINGLE_SERVICE_WORKER_ENABLED ?? "false").trim().toLowerCase();
const shouldStartWorker = ["1", "true", "yes", "y", "on"].includes(enableWorker);
const strictWorker = ["1", "true", "yes", "y", "on"].includes(
  String(process.env.SINGLE_SERVICE_WORKER_STRICT ?? "false").trim().toLowerCase()
);
const apiPort = Number(process.env.PORT || 4000);
const apiHealthUrl = process.env.RENDER_API_HEALTH_URL || `http://127.0.0.1:${apiPort}/health`;
const apiStartupTimeoutMs = Number(process.env.RENDER_API_STARTUP_TIMEOUT_MS || 90_000);
const apiProbeIntervalMs = Number(process.env.RENDER_API_PROBE_INTERVAL_MS || 1_500);
const children = new Map();
let shuttingDown = false;
let apiReady = false;

function log(service, message) {
  process.stdout.write(`[render:${service}] ${message}\n`);
}

function startProcess(service, args, options = {}) {
  log(service, `${npmCommand} ${args.join(" ")}`);
  const child = spawn(npmCommand, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      HOST: process.env.HOST || "0.0.0.0"
    },
    shell: false
  });

  children.set(service, child);

  child.on("exit", (code, signal) => {
    children.delete(service);
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    log(service, `process exited with ${reason}`);

    if (service === "worker" && !strictWorker) {
      log(service, "worker exit is non-fatal in single-service mode; api remains running");
      return;
    }

    if (options.nonFatal) {
      return;
    }

    shutdown(code && code > 0 ? code : 1);
  });

  child.on("error", (error) => {
    log(service, `failed to start: ${error.message}`);
    if (service === "worker" && !strictWorker) {
      return;
    }
    shutdown(1);
  });

  return child;
}

function requestHealth(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode && response.statusCode >= 200 && response.statusCode < 500));
    });
    request.setTimeout(2_500, () => {
      request.destroy(new Error("health probe timeout"));
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForApi() {
  const deadline = Date.now() + apiStartupTimeoutMs;
  log("supervisor", `waiting for api on ${apiHealthUrl}`);

  while (!shuttingDown && Date.now() < deadline) {
    const healthy = await requestHealth(apiHealthUrl);
    if (healthy) {
      apiReady = true;
      log("supervisor", "api is listening; Render gateway can route traffic");
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, apiProbeIntervalMs));
  }

  log("supervisor", `api did not become reachable within ${apiStartupTimeoutMs}ms`);
  return false;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const [service, child] of children.entries()) {
    log(service, "stopping");
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 5_000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => {
  log("supervisor", `uncaught exception: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  shutdown(1);
});
process.on("unhandledRejection", (reason) => {
  log("supervisor", `unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
  shutdown(1);
});

startProcess("api", ["run", "start:api"]);

const apiStarted = await waitForApi();
if (!apiStarted) {
  shutdown(1);
} else if (shouldStartWorker) {
  log("worker", strictWorker ? "enabled in strict mode" : "enabled in non-fatal single-service mode");
  startProcess("worker", ["run", "start:worker"], { nonFatal: !strictWorker });
} else {
  log("worker", "disabled; set SINGLE_SERVICE_WORKER_ENABLED=true to run worker in the same Render Web Service");
}

setInterval(() => {
  if (!apiReady || shuttingDown) {
    return;
  }
  const apiChild = children.get("api");
  if (!apiChild || apiChild.exitCode !== null) {
    log("supervisor", "api child is no longer running");
    shutdown(1);
  }
}, 10_000).unref();
