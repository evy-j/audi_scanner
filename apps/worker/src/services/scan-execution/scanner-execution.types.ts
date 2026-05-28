import type { AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";

export type ScannerExecutionStatus = "COMPLETED" | "FAILED" | "TIMED_OUT" | "CANCELED";

export interface ScannerResourceLimits {
  cpuCores: number;
  memoryMb: number;
  pidsLimit: number;
}

export interface ScannerExecutionPolicy {
  analyzer: AnalyzerName;
  image: string;
  timeoutMs: number;
  resources: ScannerResourceLimits;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxOutputArtifacts: number;
  maxOutputArtifactBytes: number;
  networkMode: "none" | "bridge";
  ipcMode: "none" | "private";
  readOnlyRootFilesystem: boolean;
  noNewPrivileges: boolean;
  dockerPullPolicy: "never" | "missing" | "always";
  containerUser: string;
  seccompProfile: string | null;
  appArmorProfile: string | null;
  disableSwap: boolean;
  tmpfsNoExec: boolean;
  nofileLimit: number;
}

export interface ScannerCommandPlan {
  executable: string;
  args: string[];
  outputFileName: string;
  expectsJsonOnStdout: boolean;
}

export interface SandboxExecutionRequest {
  analyzer: AnalyzerName;
  containerName: string;
  image: string;
  workspaceHostPath: string;
  outputHostPath: string;
  command: ScannerCommandPlan;
  policy: ScannerExecutionPolicy;
  environment: Record<string, string>;
  labels: Record<string, string>;
}

export interface SandboxExecutionResult {
  status: ScannerExecutionStatus;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  canceled: boolean;
  durationMs: number;
}

export interface ScannerArtifactDescriptor {
  artifactKey: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
}

export interface StandardizedScannerJsonResult {
  schemaVersion: "scanner-result/v1";
  analyzer: AnalyzerName;
  analyzerVersion: string;
  status: ScannerExecutionStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  command: {
    executable: string;
    args: string[];
  };
  sandbox: {
    image: string;
    networkMode: "none" | "bridge";
    ipcMode: "none" | "private";
    cpuCores: number;
    memoryMb: number;
    pidsLimit: number;
    maxOutputArtifacts: number;
    maxOutputArtifactBytes: number;
    readOnlyRootFilesystem: boolean;
    noNewPrivileges: boolean;
    dockerPullPolicy: "never" | "missing" | "always";
    containerUser: string;
    seccompProfile: string | null;
    appArmorProfile: string | null;
    disableSwap: boolean;
    tmpfsNoExec: boolean;
    nofileLimit: number;
  };
  artifacts: ScannerArtifactDescriptor[];
  rawOutput: unknown;
  parse: {
    ok: boolean;
    error?: string | undefined;
  };
  logs: {
    stdoutArtifactKey: string;
    stderrArtifactKey: string;
  };
  warnings: string[];
}
