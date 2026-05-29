import { randomUUID } from "node:crypto";
import type { AnalyzerJobData, AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";
import { CancelledScanError } from "../../common/errors.js";
import { logger } from "../../common/logger.js";
import { env } from "../../config/environment.js";
import type {
  AnalyzerExecutionResult,
  ScannerExecutionService
} from "../scan-services.js";
import { ContainerSandboxExecutor } from "./container-sandbox.executor.js";
import { ScannerCommandBuilder } from "./command-builders.js";
import { ScannerExecutionFailedError } from "./errors.js";
import { parseScannerJson } from "./json-parser.js";
import { LocalScannerArtifactStore } from "./local-artifact-store.js";
import { ScannerExecutionPolicyFactory } from "./scanner-policy.js";
import { discoverSourceTarget } from "./source-discovery.js";
import { sanitizePathSegment } from "./safe-path.js";
import type { StandardizedScannerJsonResult } from "./scanner-execution.types.js";
import { extractAnalyzerVersion } from "./version-extractor.js";

const SUPPORTED_ANALYZERS = new Set<AnalyzerName>(["slither", "mythril", "semgrep", "aderyn", "foundry"]);

export class ContainerizedScannerExecutionService implements ScannerExecutionService {
  constructor(
    private readonly artifactStore = new LocalScannerArtifactStore(),
    private readonly policyFactory = new ScannerExecutionPolicyFactory(),
    private readonly commandBuilder = new ScannerCommandBuilder(),
    private readonly sandboxExecutor = new ContainerSandboxExecutor()
  ) {}

  async cleanupStaleTempWorkspaces(): Promise<number> {
    return this.artifactStore.cleanupStaleRunWorkspaces();
  }

  async execute(data: AnalyzerJobData, signal?: AbortSignal): Promise<AnalyzerExecutionResult> {
    if (!SUPPORTED_ANALYZERS.has(data.analyzer)) {
      throw new Error(`Unsupported scanner analyzer: ${data.analyzer}`);
    }

    const startedAt = new Date();
    const policy = this.policyFactory.create(data);
    const workspaceHostPath = await this.artifactStore.resolvePreparedArtifact(data.preparedArtifactKey);

    await this.artifactStore.ensureDirectoryExists(workspaceHostPath);

    const runWorkspace = await this.artifactStore.createRunWorkspace({
      scanId: data.scanId,
      analyzer: data.analyzer
    });

    try {
      const discovery = await discoverSourceTarget(workspaceHostPath);
      const command = this.commandBuilder.build(data, discovery);
      const containerName = buildContainerName(data.analyzer, data.scanId);

      const execution = await this.sandboxExecutor.execute(
        {
          analyzer: data.analyzer,
          containerName,
          image: policy.image,
          workspaceHostPath,
          outputHostPath: runWorkspace.outputHostPath,
          command,
          policy,
          environment: {
            HOME: "/home/scanner",
            XDG_CACHE_HOME: "/tmp/.cache",
            TMPDIR: "/tmp",
            CI: "true",
            SCANNER_UMASK: "0022"
          },
          labels: {
            [`${env.SCANNER_DOCKER_LABEL_PREFIX}.sandbox`]: "true",
            [`${env.SCANNER_DOCKER_LABEL_PREFIX}.scan_id`]: data.scanId,
            [`${env.SCANNER_DOCKER_LABEL_PREFIX}.organization_id`]: data.organizationId,
            [`${env.SCANNER_DOCKER_LABEL_PREFIX}.analyzer`]: data.analyzer,
            [`${env.SCANNER_DOCKER_LABEL_PREFIX}.trace_id`]: data.traceId
          }
        },
        {
          signal,
          onLog: (entry) => {
            logger.debug(
              {
                analyzer: data.analyzer,
                scanId: data.scanId,
                stream: entry.stream,
                chunk: entry.chunk.slice(0, 4_000)
              },
              "scanner log chunk"
            );
          }
        }
      );

      const stdoutArtifactKey = await this.artifactStore.writeTextArtifact(
        runWorkspace.artifactPrefix,
        "logs/stdout.log",
        execution.stdout
      );
      const stderrArtifactKey = await this.artifactStore.writeTextArtifact(
        runWorkspace.artifactPrefix,
        "logs/stderr.log",
        execution.stderr
      );

      await this.artifactStore.importRunOutput(runWorkspace, {
        maxArtifacts: policy.maxOutputArtifacts,
        maxBytes: policy.maxOutputArtifactBytes
      });

      let rawArtifactKey = `${runWorkspace.artifactPrefix}/${command.outputFileName}`;

      if (command.expectsJsonOnStdout && execution.stdout.trim()) {
        await this.artifactStore.writeTextArtifact(
          runWorkspace.artifactPrefix,
          command.outputFileName,
          execution.stdout
        );
      }

      let rawOutputText = await this.artifactStore.readTextArtifact(
        runWorkspace.artifactPrefix,
        command.outputFileName
      );

      if (!rawOutputText && execution.stdout.trim()) {
        rawArtifactKey = await this.artifactStore.writeTextArtifact(
          runWorkspace.artifactPrefix,
          command.outputFileName,
          execution.stdout
        );
        rawOutputText = execution.stdout;
      }

      rawOutputText ??= "";
      const parsed = parseScannerJson(rawOutputText);
      const analyzerVersion = extractAnalyzerVersion(data.analyzer, parsed.value);
      const completedAt = new Date();
      const initialArtifacts = await this.artifactStore.collectArtifacts(runWorkspace.artifactPrefix);
      const warnings = buildWarnings(execution.stderr, parsed.error);

      const standardized: StandardizedScannerJsonResult = {
        schemaVersion: "scanner-result/v1",
        analyzer: data.analyzer,
        analyzerVersion,
        status: execution.status,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: execution.durationMs,
        exitCode: execution.exitCode,
        signal: execution.signal,
        command: {
          executable: command.executable,
          args: command.args
        },
        sandbox: {
          image: policy.image,
          networkMode: policy.networkMode,
          ipcMode: policy.ipcMode,
          cpuCores: policy.resources.cpuCores,
          memoryMb: policy.resources.memoryMb,
          pidsLimit: policy.resources.pidsLimit,
          maxOutputArtifacts: policy.maxOutputArtifacts,
          maxOutputArtifactBytes: policy.maxOutputArtifactBytes,
          readOnlyRootFilesystem: policy.readOnlyRootFilesystem,
          noNewPrivileges: policy.noNewPrivileges,
          dockerPullPolicy: policy.dockerPullPolicy,
          containerUser: policy.containerUser,
          seccompProfile: policy.seccompProfile,
          appArmorProfile: policy.appArmorProfile,
          disableSwap: policy.disableSwap,
          tmpfsNoExec: policy.tmpfsNoExec,
          nofileLimit: policy.nofileLimit
        },
        artifacts: initialArtifacts,
        rawOutput: parsed.value,
        parse: {
          ok: parsed.ok,
          ...(parsed.error ? { error: parsed.error } : {})
        },
        logs: {
          stdoutArtifactKey,
          stderrArtifactKey
        },
        warnings
      };

      const standardizedArtifactKey = await this.artifactStore.writeJsonArtifact(
        runWorkspace.artifactPrefix,
        "scanner-result.json",
        standardized
      );
      const rawArtifactMetadata = await this.artifactStore.getArtifactMetadata(rawArtifactKey);

      if (execution.status === "CANCELED") {
        throw new CancelledScanError(data.scanId);
      }

      if (execution.status !== "COMPLETED" || !parsed.ok) {
        throw new ScannerExecutionFailedError(
          `${data.analyzer} execution failed with status ${execution.status}${
            warnings.length > 0 ? `: ${warnings.join("\n").slice(0, 2_000)}` : ""
          }`,
          {
            analyzer: data.analyzer,
            scanId: data.scanId,
            status: parsed.ok ? execution.status : "FAILED",
            exitCode: execution.exitCode,
            rawArtifactKey,
            rawArtifactChecksumSha256: rawArtifactMetadata?.sha256,
            standardizedArtifactKey
          }
        );
      }

      return {
        rawArtifactKey,
        rawArtifactChecksumSha256: rawArtifactMetadata?.sha256,
        standardizedArtifactKey,
        analyzerVersion,
        exitCode: execution.exitCode,
        durationMs: execution.durationMs,
        ...(warnings.length > 0 ? { warnings } : {})
      };
    } finally {
      await this.artifactStore.cleanupRunWorkspace(runWorkspace).catch((error: unknown) => {
        logger.warn(
          {
            error,
            analyzer: data.analyzer,
            scanId: data.scanId,
            tempHostPath: runWorkspace.tempHostPath
          },
          "failed to clean up scanner temp workspace"
        );
      });
    }
  }
}

function buildContainerName(analyzer: AnalyzerName, scanId: string): string {
  return `audit-scan-${sanitizePathSegment(analyzer)}-${sanitizePathSegment(scanId)}-${randomUUID().slice(0, 8)}`;
}

function buildWarnings(stderr: string, parseError?: string): string[] {
  const warnings: string[] = [];

  if (parseError) {
    warnings.push(`JSON parse warning: ${parseError}`);
  }

  const trimmedStderr = stderr.trim();
  if (trimmedStderr) {
    warnings.push(trimmedStderr.slice(0, 8_000));
  }

  return warnings;
}
