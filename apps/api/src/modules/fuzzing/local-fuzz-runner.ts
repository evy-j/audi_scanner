import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "../../config/environment.js";
import { redactSecrets } from "../remediation/redaction.js";

export interface LocalFuzzCommand {
  command: "forge" | "echidna" | "medusa" | "hardhat" | "npx" | "node" | "npm";
  args: string[];
  cwd?: string | undefined;
}

export interface LocalFuzzRunResult {
  commandExecuted: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const ALLOWED_COMMANDS = new Set(["forge", "echidna", "medusa", "hardhat", "npx", "node", "npm"]);
const DISALLOWED_ARGS = /--private-key|--mnemonic|--broadcast|--rpc-url|--fork-url|--sender|--unlocked/iu;

export class LocalFuzzRunner {
  async run(input: LocalFuzzCommand): Promise<LocalFuzzRunResult> {
    assertAllowed(input);
    const started = Date.now();
    const cwd = await safeWorkingDirectory(input.cwd);

    return new Promise((resolve, reject) => {
      const child = spawn(input.command, input.args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: safeEnv()
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        child.kill();
        resolve({
          commandExecuted: commandPreview(input),
          exitCode: null,
          timedOut: true,
          stdout: truncate(stdout),
          stderr: truncate(stderr),
          durationMs: Date.now() - started
        });
      }, env.FUZZING_MAX_DURATION_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = truncate(stdout + chunk.toString("utf8"));
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = truncate(stderr + chunk.toString("utf8"));
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          commandExecuted: commandPreview(input),
          exitCode,
          timedOut: false,
          stdout: truncate(stdout),
          stderr: truncate(stderr),
          durationMs: Date.now() - started
        });
      });
    });
  }
}

function assertAllowed(input: LocalFuzzCommand): void {
  if (!ALLOWED_COMMANDS.has(input.command)) {
    throw new Error("Fuzz command is not allowlisted");
  }
  if (input.args.some((arg) => DISALLOWED_ARGS.test(arg))) {
    throw new Error("Fuzz command includes a disallowed live-signing, fork, or broadcast argument");
  }
}

async function safeWorkingDirectory(cwd?: string | undefined): Promise<string> {
  if (!cwd) {
    return fs.mkdtemp(path.join(os.tmpdir(), "web3guard-fuzz-"));
  }
  const resolved = path.resolve(cwd);
  const workspace = path.resolve(process.cwd());
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Fuzz working directory must stay inside the workspace");
  }
  return resolved;
}

function safeEnv(): NodeJS.ProcessEnv {
  const { PATH, Path, SystemRoot, WINDIR } = process.env;
  return { PATH, Path, SystemRoot, WINDIR };
}

function commandPreview(input: LocalFuzzCommand): string {
  return redactSecrets([input.command, ...input.args].join(" "));
}

function truncate(value: string): string {
  return redactSecrets(value).slice(0, env.FUZZING_MAX_OUTPUT_BYTES);
}
