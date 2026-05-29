import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const steps = [
  ["db:generate", ["run", "db:generate"]],
  ["build:packages", ["run", "build:packages"]],
  ["build:api", ["--workspace", "@audit-scanner/api", "run", "build"]],
  ["build:worker", ["--workspace", "@audit-scanner/worker", "run", "build"]],
];

function stamp() {
  return new Date().toISOString();
}

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;

  // Most reliable path when this script is launched through npm run.
  if (npmExecPath && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
      printable: `node ${npmExecPath} ${args.join(" ")}`,
    };
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return {
    command,
    args,
    shell: process.platform === "win32",
    printable: `${command} ${args.join(" ")}`,
  };
}

function runStep(name, args) {
  return new Promise((resolve, reject) => {
    const invocation = npmInvocation(args);
    console.log(`[render:build] ${stamp()} starting ${name}: ${invocation.printable}`);

    const child = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
      shell: invocation.shell,
      windowsHide: true,
    });

    const heartbeat = setInterval(() => {
      console.log(`[render:build] ${stamp()} ${name} still running...`);
    }, 30000);

    child.on("error", (error) => {
      clearInterval(heartbeat);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearInterval(heartbeat);
      if (code === 0) {
        console.log(`[render:build] ${stamp()} completed ${name}`);
        resolve();
        return;
      }
      reject(new Error(`${name} failed with code=${code ?? "none"} signal=${signal ?? "none"}`));
    });
  });
}

for (const [name, args] of steps) {
  await runStep(name, args);
}

console.log(`[render:build] ${stamp()} all build steps completed`);
