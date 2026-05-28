import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { env } from "../../config/environment.js";
import { getErrorMessage } from "../../common/errors.js";
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult
} from "./scanner-execution.types.js";

export type SandboxLogSink = (entry: {
  stream: "stdout" | "stderr";
  chunk: string;
}) => void;

export class ContainerSandboxExecutor {
  async execute(
    request: SandboxExecutionRequest,
    options: {
      signal?: AbortSignal | undefined;
      onLog?: SandboxLogSink | undefined;
    } = {}
  ): Promise<SandboxExecutionResult> {
    const startedAt = Date.now();
    const args = buildDockerRunArgs(request);
    const child = spawn(env.SCANNER_DOCKER_BINARY, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let canceled = false;
    let stopRequested = false;
    let outputLimitError: string | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      void stopContainer(request.containerName);
      child.kill("SIGTERM");
    }, request.policy.timeoutMs);

    const abortHandler = () => {
      canceled = true;
      void stopContainer(request.containerName);
      child.kill("SIGTERM");
    };

    options.signal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = appendBounded(stdout, text, request.policy.maxStdoutBytes, "stdout");
      options.onLog?.({ stream: "stdout", chunk: text });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = appendBounded(stderr, text, request.policy.maxStderrBytes, "stderr");
      options.onLog?.({ stream: "stderr", chunk: text });
    });

    child.on("error", (error) => {
      stderr = appendBounded(
        stderr,
        `\nscanner process spawn failed: ${getErrorMessage(error)}\n`,
        request.policy.maxStderrBytes,
        "stderr"
      );
    });

    const [exitCode, signal] = (await once(child, "close")) as [
      number | null,
      NodeJS.Signals | null
    ];

    settled = true;
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortHandler);

    const durationMs = Date.now() - startedAt;
    const finalStderr = outputLimitError ? `${stderr}\n${outputLimitError}\n` : stderr;
    if (timedOut || canceled || outputLimitError) {
      await removeContainer(request.containerName);
    }

    return {
      status: getExecutionStatus(exitCode, timedOut, canceled, Boolean(outputLimitError)),
      exitCode,
      signal,
      stdout,
      stderr: finalStderr,
      timedOut,
      canceled,
      durationMs
    };

    function appendBounded(
      current: string,
      next: string,
      maxBytes: number,
      streamName: "stdout" | "stderr"
    ): string {
      const updated = current + next;
      if (Buffer.byteLength(updated, "utf8") <= maxBytes) {
        return updated;
      }

      outputLimitError = `${streamName} exceeded ${maxBytes} bytes`;
      void stopContainer(request.containerName);
      child.kill("SIGTERM");
      return current;
    }

    async function stopContainer(containerName: string): Promise<void> {
      if (settled || stopRequested) {
        return;
      }

      stopRequested = true;
      const stop = spawn(
        env.SCANNER_DOCKER_BINARY,
        ["stop", "--time", env.SCANNER_STOP_GRACE_SECONDS.toString(), containerName],
        {
          stdio: "ignore",
          windowsHide: true
        }
      );

      stop.on("error", () => undefined);
      await once(stop, "close").catch(() => undefined);
    }

    async function removeContainer(containerName: string): Promise<void> {
      const remove = spawn(env.SCANNER_DOCKER_BINARY, ["rm", "--force", containerName], {
        stdio: "ignore",
        windowsHide: true
      });

      remove.on("error", () => undefined);
      await once(remove, "close").catch(() => undefined);
    }
  }
}

function buildDockerRunArgs(request: SandboxExecutionRequest): string[] {
  validateRequest(request);

  const args = [
    "run",
    "--rm",
    "--name",
    request.containerName,
    "--pull",
    request.policy.dockerPullPolicy,
    "--network",
    request.policy.networkMode,
    "--ipc",
    request.policy.ipcMode,
    "--user",
    request.policy.containerUser,
    "--hostname",
    "scanner-sandbox",
    "--privileged=false",
    "--init",
    "--stop-timeout",
    env.SCANNER_STOP_GRACE_SECONDS.toString(),
    "--cpus",
    request.policy.resources.cpuCores.toString(),
    "--memory",
    `${request.policy.resources.memoryMb}m`,
    "--pids-limit",
    request.policy.resources.pidsLimit.toString(),
    "--ulimit",
    `nofile=${request.policy.nofileLimit}:${request.policy.nofileLimit}`,
    "--cap-drop",
    "ALL",
    "--tmpfs",
    buildTmpfsMount(request.policy.tmpfsNoExec),
    "--mount",
    buildBindMount(request.workspaceHostPath, env.SCANNER_WORKSPACE_MOUNT_PATH, true),
    "--mount",
    buildBindMount(request.outputHostPath, env.SCANNER_OUTPUT_MOUNT_PATH, false),
    "-w",
    env.SCANNER_WORKSPACE_MOUNT_PATH
  ];

  if (request.policy.disableSwap) {
    args.push("--memory-swap", `${request.policy.resources.memoryMb}m`);
  }

  if (request.policy.readOnlyRootFilesystem) {
    args.push("--read-only");
  }

  if (request.policy.noNewPrivileges) {
    args.push("--security-opt", "no-new-privileges:true");
  }

  if (request.policy.seccompProfile) {
    args.push("--security-opt", `seccomp=${path.resolve(request.policy.seccompProfile)}`);
  }

  if (request.policy.appArmorProfile) {
    args.push("--security-opt", `apparmor=${request.policy.appArmorProfile}`);
  }

  for (const [key, value] of Object.entries(request.labels)) {
    args.push("--label", `${key}=${sanitizeDockerValue(value)}`);
  }

  for (const [key, value] of Object.entries(request.environment)) {
    args.push("-e", `${key}=${value}`);
  }

  args.push(request.image, request.command.executable, ...request.command.args);

  return args;
}

function buildTmpfsMount(noExec: boolean): string {
  const options = ["rw", "nosuid", "nodev", `size=${env.SCANNER_TMPFS_SIZE_MB}m`];
  if (noExec) {
    options.splice(3, 0, "noexec");
  }
  return `/tmp:${options.join(",")}`;
}

function buildBindMount(hostPath: string, containerPath: string, readonly: boolean): string {
  const source = path.resolve(hostPath);
  if (source.includes(",")) {
    throw new Error(`Docker bind mount source cannot contain a comma: ${source}`);
  }
  if (!path.isAbsolute(source)) {
    throw new Error(`Docker bind mount source must be absolute: ${hostPath}`);
  }
  return [
    "type=bind",
    `source=${source}`,
    `target=${containerPath}`,
    readonly ? "readonly" : "rw",
    "bind-propagation=rprivate"
  ].join(",");
}

function validateRequest(request: SandboxExecutionRequest): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(request.containerName)) {
    throw new Error(`Unsafe Docker container name: ${request.containerName}`);
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(request.command.executable)) {
    throw new Error(`Unsafe scanner executable: ${request.command.executable}`);
  }

  for (const argument of request.command.args) {
    if (argument.includes("\0")) {
      throw new Error("Scanner command argument contains a null byte");
    }
  }

  for (const [key, value] of Object.entries(request.environment)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || value.includes("\0")) {
      throw new Error(`Unsafe scanner environment entry: ${key}`);
    }
  }
}

function sanitizeDockerValue(value: string): string {
  return value.replace(/[\r\n\t\0]/g, "-").slice(0, 256);
}

function getExecutionStatus(
  exitCode: number | null,
  timedOut: boolean,
  canceled: boolean,
  outputLimitExceeded: boolean
): SandboxExecutionResult["status"] {
  if (canceled) {
    return "CANCELED";
  }
  if (timedOut) {
    return "TIMED_OUT";
  }
  if (outputLimitExceeded) {
    return "FAILED";
  }
  return exitCode === 0 ? "COMPLETED" : "FAILED";
}
