import { describe, expect, it } from "vitest";

describe("scanner artifact contract", () => {
  it("documents the normalized scanner-result envelope", () => {
    const artifact = {
      schemaVersion: "scanner-result/v1",
      analyzer: "semgrep",
      analyzerVersion: "test",
      status: "COMPLETED",
      startedAt: new Date(0).toISOString(),
      completedAt: new Date(1).toISOString(),
      durationMs: 1,
      exitCode: 0,
      command: {
        executable: "semgrep",
        args: ["--json", "/workspace"]
      },
      sandbox: {
        image: "audit-scanner/scanner-semgrep:latest",
        networkMode: "none",
        ipcMode: "none",
        cpuCores: 1,
        memoryMb: 2048,
        pidsLimit: 256,
        maxOutputArtifacts: 64,
        maxOutputArtifactBytes: 104_857_600,
        readOnlyRootFilesystem: true,
        noNewPrivileges: true,
        dockerPullPolicy: "never",
        containerUser: "10001:10001",
        seccompProfile: "docker/security/seccomp-scanner.json",
        appArmorProfile: null,
        disableSwap: true,
        tmpfsNoExec: true,
        nofileLimit: 1024
      },
      artifacts: [],
      rawOutput: {},
      parse: { ok: true },
      logs: {
        stdoutArtifactKey: "scanner-runs/scan/semgrep/stdout.log",
        stderrArtifactKey: "scanner-runs/scan/semgrep/stderr.log"
      },
      warnings: []
    };

    expect(artifact.schemaVersion).toBe("scanner-result/v1");
    expect(artifact.sandbox.networkMode).toBe("none");
    expect(artifact.sandbox.noNewPrivileges).toBe(true);
  });
});
