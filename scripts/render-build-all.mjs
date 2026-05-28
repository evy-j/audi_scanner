import { spawn } from "node:child_process";

const steps = [
  ["db:generate", "npm", ["run", "db:generate"]],
  ["build:packages", "npm", ["run", "build:packages"]],
  ["build:api", "npm", ["--workspace", "@audit-scanner/api", "run", "build"]],
  ["build:worker", "npm", ["--workspace", "@audit-scanner/worker", "run", "build"]],
];

const stepTimeoutMs = Number(process.env.RENDER_BUILD_STEP_TIMEOUT_MS || 240_000);
const heartbeatMs = Number(process.env.RENDER_BUILD_HEARTBEAT_MS || 15_000);

function now() {
  return new Date().toISOString();
}

function runStep([name, command, args]) {
  return new Promise((resolve, reject) => {
    console.log(`[render:build] ${now()} starting ${name}: ${command} ${args.join(" ")}`);
    const started = Date.now();
    let lastOutput = Date.now();
    let finished = false;

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: {
        ...process.env,
        CI: "true",
        TSC_NONPOLLING_WATCHER: "1",
        TSC_WATCHFILE: "UseFsEvents",
        TSC_WATCHDIRECTORY: "UseFsEvents",
      },
    });

    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - started) / 1000);
      const quiet = Math.round((Date.now() - lastOutput) / 1000);
      console.log(`[render:build] ${now()} ${name} still running (${elapsed}s elapsed, ${quiet}s quiet)`);
    }, heartbeatMs);

    const timeout = setTimeout(() => {
      if (finished) return;
      console.error(`[render:build] ${now()} ${name} timed out after ${Math.round(stepTimeoutMs / 1000)}s`);
      console.error(`[render:build] ${name} last output was ${Math.round((Date.now() - lastOutput) / 1000)}s ago`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, stepTimeoutMs);

    child.stdout.on("data", (chunk) => {
      lastOutput = Date.now();
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      lastOutput = Date.now();
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      finished = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      finished = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      const elapsed = Math.round((Date.now() - started) / 1000);
      if (code === 0) {
        console.log(`[render:build] ${now()} completed ${name} in ${elapsed}s`);
        resolve();
        return;
      }
      reject(new Error(`${name} failed with code ${code ?? "null"} signal ${signal ?? "null"}`));
    });
  });
}

for (const step of steps) {
  await runStep(step);
}

console.log(`[render:build] ${now()} all build steps completed`);
