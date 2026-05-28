import { describe, expect, it } from "vitest";
import { ScannerExecutionPolicyFactory } from "../../../apps/worker/src/services/scan-execution/scanner-policy.js";
import type { AnalyzerJobData } from "../../../packages/shared/src/queues/scan-jobs.js";

const baseJob: Omit<AnalyzerJobData, "analyzer"> = {
  scanId: "scan-1",
  organizationId: "org-1",
  traceId: "trace-1",
  priority: "NORMAL",
  preparedArtifactKey: "prepared/org-1/scan-1",
  scannerImage: "ignored",
  timeoutMs: 60_000
};

describe("ScannerExecutionPolicyFactory", () => {
  it("applies hardened defaults for semgrep", () => {
    const policy = new ScannerExecutionPolicyFactory().create({
      ...baseJob,
      analyzer: "semgrep"
    });

    expect(policy.image).toBe("audit-scanner/scanner-semgrep:latest");
    expect(policy.networkMode).toBe("none");
    expect(policy.ipcMode).toBe("none");
    expect(policy.readOnlyRootFilesystem).toBe(true);
    expect(policy.noNewPrivileges).toBe(true);
    expect(policy.resources.memoryMb).toBeGreaterThanOrEqual(2048);
    expect(policy.resources.pidsLimit).toBeGreaterThan(0);
  });

  it("applies hardened defaults for aderyn", () => {
    const policy = new ScannerExecutionPolicyFactory().create({
      ...baseJob,
      analyzer: "aderyn"
    });

    expect(policy.image).toBe("audit-scanner/scanner-aderyn:latest");
    expect(policy.networkMode).toBe("none");
    expect(policy.noNewPrivileges).toBe(true);
  });
});
