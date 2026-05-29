import type { AnalyzerJobData, AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import type { ScannerExecutionPolicy } from "./scanner-execution.types.js";

export class ScannerExecutionPolicyFactory {
  create(data: AnalyzerJobData): ScannerExecutionPolicy {
    const resources = getResourcesForAnalyzer(data.analyzer);

    return {
      analyzer: data.analyzer,
      image: getImageForAnalyzer(data.analyzer),
      timeoutMs: data.timeoutMs,
      resources,
      maxStdoutBytes: env.SCANNER_MAX_STDOUT_BYTES,
      maxStderrBytes: env.SCANNER_MAX_STDERR_BYTES,
      maxOutputArtifacts: env.SCANNER_MAX_OUTPUT_ARTIFACTS,
      maxOutputArtifactBytes: env.SCANNER_MAX_OUTPUT_ARTIFACT_BYTES,
      networkMode: env.SCANNER_NETWORK_MODE,
      ipcMode: env.SCANNER_IPC_MODE,
      readOnlyRootFilesystem: env.SCANNER_READ_ONLY_ROOT_FILESYSTEM,
      noNewPrivileges: env.SCANNER_NO_NEW_PRIVILEGES,
      dockerPullPolicy: env.SCANNER_DOCKER_PULL_POLICY,
      containerUser: env.SCANNER_CONTAINER_USER,
      seccompProfile: env.SCANNER_SECCOMP_PROFILE,
      appArmorProfile: env.SCANNER_APPARMOR_PROFILE,
      disableSwap: env.SCANNER_DISABLE_SWAP,
      tmpfsNoExec: env.SCANNER_TMPFS_NOEXEC,
      nofileLimit: env.SCANNER_ULIMIT_NOFILE
    };
  }
}

function getImageForAnalyzer(analyzer: AnalyzerName): string {
  switch (analyzer) {
    case "slither":
      return env.SLITHER_SCANNER_IMAGE;
    case "mythril":
      return env.MYTHRIL_SCANNER_IMAGE;
    case "semgrep":
      return env.SEMGREP_SCANNER_IMAGE;
    case "aderyn":
      return env.ADERYN_SCANNER_IMAGE;
    case "foundry":
      return env.FOUNDRY_SCANNER_IMAGE;
  }
}

function dataImageUnsupported(analyzer: AnalyzerName): never {
  throw new Error(`No scanner image is configured for analyzer: ${analyzer}`);
}

function getResourcesForAnalyzer(analyzer: AnalyzerName) {
  switch (analyzer) {
    case "slither":
      return {
        cpuCores: env.SLITHER_CPU_LIMIT,
        memoryMb: env.SLITHER_MEMORY_MB,
        pidsLimit: env.SCANNER_PIDS_LIMIT
      };
    case "mythril":
      return {
        cpuCores: env.MYTHRIL_CPU_LIMIT,
        memoryMb: env.MYTHRIL_MEMORY_MB,
        pidsLimit: env.SCANNER_PIDS_LIMIT
      };
    case "semgrep":
      return {
        cpuCores: env.SEMGREP_CPU_LIMIT,
        memoryMb: env.SEMGREP_MEMORY_MB,
        pidsLimit: env.SCANNER_PIDS_LIMIT
      };
    case "aderyn":
      return {
        cpuCores: env.ADERYN_CPU_LIMIT,
        memoryMb: env.ADERYN_MEMORY_MB,
        pidsLimit: env.SCANNER_PIDS_LIMIT
      };
    case "foundry":
      return {
        cpuCores: env.SCANNER_DEFAULT_CPU_LIMIT,
        memoryMb: env.SCANNER_DEFAULT_MEMORY_MB,
        pidsLimit: env.SCANNER_PIDS_LIMIT
      };
  }
}
