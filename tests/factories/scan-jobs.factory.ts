import type {
  AnalyzerJobData,
  ScanOrchestratorJobData,
  SourcePrepareJobData
} from "../../packages/shared/src/queues/scan-jobs.js";
import { testId } from "./ids.js";

export function createScanOrchestratorJob(
  overrides: Partial<ScanOrchestratorJobData> = {}
): ScanOrchestratorJobData {
  const scanId = overrides.scanId ?? testId("scan");
  return {
    scanId,
    organizationId: overrides.organizationId ?? testId("org"),
    requestedByUserId: overrides.requestedByUserId ?? testId("user"),
    traceId: overrides.traceId ?? testId("trace"),
    priority: overrides.priority ?? "NORMAL",
    target: overrides.target ?? {
      type: "SOURCE",
      artifactKey: `source-fixtures/${scanId}`
    },
    analyzers: overrides.analyzers ?? ["semgrep"],
    ...(overrides.attemptContext ? { attemptContext: overrides.attemptContext } : {})
  };
}

export function createSourcePrepareJob(
  overrides: Partial<SourcePrepareJobData> = {}
): SourcePrepareJobData {
  const orchestrator = createScanOrchestratorJob(overrides);
  return {
    ...orchestrator,
    target: overrides.target ?? orchestrator.target,
    analyzers: overrides.analyzers ?? orchestrator.analyzers
  };
}

export function createAnalyzerJob(overrides: Partial<AnalyzerJobData> = {}): AnalyzerJobData {
  const scanId = overrides.scanId ?? testId("scan");
  return {
    scanId,
    organizationId: overrides.organizationId ?? testId("org"),
    requestedByUserId: overrides.requestedByUserId ?? testId("user"),
    traceId: overrides.traceId ?? testId("trace"),
    priority: overrides.priority ?? "NORMAL",
    analyzer: overrides.analyzer ?? "semgrep",
    preparedArtifactKey: overrides.preparedArtifactKey ?? `prepared-sources/org/${scanId}`,
    scannerImage: overrides.scannerImage ?? "audit-scanner/scanner-semgrep:latest",
    timeoutMs: overrides.timeoutMs ?? 60_000,
    ...(overrides.attemptContext ? { attemptContext: overrides.attemptContext } : {})
  };
}
