import type { AnalyzerJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import type { SourceDiscoveryResult } from "./source-discovery.js";
import type { ScannerCommandPlan } from "./scanner-execution.types.js";

export class ScannerCommandBuilder {
  build(data: AnalyzerJobData, discovery: SourceDiscoveryResult): ScannerCommandPlan {
    switch (data.analyzer) {
      case "slither":
        return buildSlitherCommand(discovery);
      case "mythril":
        return buildMythrilCommand(data, discovery);
      case "semgrep":
        return buildSemgrepCommand();
      case "aderyn":
        return buildAderynCommand();
      case "foundry":
        throw new Error("Foundry execution is not supported by this scan execution service");
    }
  }
}

function buildAderynCommand(): ScannerCommandPlan {
  return {
    executable: "aderyn",
    args: [
      ".",
      "--output",
      "json"
    ],
    outputFileName: "aderyn.json",
    expectsJsonOnStdout: true
  };
}

function buildSlitherCommand(discovery: SourceDiscoveryResult): ScannerCommandPlan {
  return {
    executable: "slither",
    args: [
      discovery.solidityFiles.length > 1 ? env.SCANNER_WORKSPACE_MOUNT_PATH : discovery.containerTarget,
      "--json",
      `${env.SCANNER_OUTPUT_MOUNT_PATH}/slither.json`,
      "--disable-color",
      "--no-fail"
    ],
    outputFileName: "slither.json",
    expectsJsonOnStdout: false
  };
}

function buildMythrilCommand(
  data: AnalyzerJobData,
  discovery: SourceDiscoveryResult
): ScannerCommandPlan {
  const timeoutSeconds = Math.max(1, Math.floor(data.timeoutMs / 1000) - 5);

  return {
    executable: "myth",
    args: [
      "analyze",
      discovery.containerTarget,
      "-o",
      "jsonv2",
      "-t",
      env.MYTHRIL_TRANSACTION_COUNT.toString(),
      "--execution-timeout",
      timeoutSeconds.toString(),
      "--solver-timeout",
      env.MYTHRIL_SOLVER_TIMEOUT_MS.toString(),
      "--max-depth",
      env.MYTHRIL_MAX_DEPTH.toString()
    ],
    outputFileName: "mythril.json",
    expectsJsonOnStdout: true
  };
}

function buildSemgrepCommand(): ScannerCommandPlan {
  return {
    executable: "semgrep",
    args: [
      "scan",
      "--config",
      env.SEMGREP_RULESET,
      "--json",
      "--json-output",
      `${env.SCANNER_OUTPUT_MOUNT_PATH}/semgrep.json`,
      "--no-git-ignore",
      "--disable-version-check",
      "--metrics",
      "off",
      "--jobs",
      env.SEMGREP_JOBS.toString(),
      env.SCANNER_WORKSPACE_MOUNT_PATH
    ],
    outputFileName: "semgrep.json",
    expectsJsonOnStdout: false
  };
}
