import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000003"
};

const db = vi.hoisted(() => ({
  prisma: {
    scan: { findFirst: vi.fn() },
    buildProfile: { create: vi.fn() },
    buildRun: { create: vi.fn(), update: vi.fn() },
    compilerArtifact: { create: vi.fn() },
    testRun: { create: vi.fn(), update: vi.fn() },
    testResult: { create: vi.fn() },
    analyzerToolAvailability: { upsert: vi.fn() }
  }
}));

vi.mock("@audit-scanner/database", () => ({
  prisma: db.prisma
}));

let tempRoot: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "audit-build-runner-"));
  db.prisma.scan.findFirst.mockResolvedValue({
    id: ids.scanId,
    organizationId: ids.organizationId,
    projectId: ids.projectId
  });
  db.prisma.buildProfile.create.mockResolvedValue({ id: "build-profile-id" });
  db.prisma.buildRun.create.mockResolvedValue({ id: "build-run-id" });
  db.prisma.buildRun.update.mockResolvedValue({});
  db.prisma.testRun.create.mockResolvedValue({ id: "test-run-id" });
  db.prisma.testRun.update.mockResolvedValue({});
  db.prisma.testResult.create.mockResolvedValue({});
  db.prisma.compilerArtifact.create.mockResolvedValue({});
  db.prisma.analyzerToolAvailability.upsert.mockResolvedValue({});
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("LocalBuildExecutionService", () => {
  it("persists TOOL_NOT_INSTALLED when forge is missing", async () => {
    const artifactStore = artifactStoreMock();
    const runner = {
      run: vi.fn(async () => ({
        status: "TOOL_NOT_INSTALLED",
        exitCode: null,
        stdout: "",
        stderr: "forge: command not found",
        durationMs: 12,
        errorCategory: "TOOL_NOT_INSTALLED"
      }))
    };
    const service = await serviceWith({
      artifactStore,
      detection: foundryDetection(),
      runner,
      analysisIr: { persistForScan: vi.fn() }
    });

    const result = await service.detectBuildProfile(buildJob());

    expect(result.status).toBe("TOOL_NOT_INSTALLED");
    expect(db.prisma.buildRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "TOOL_NOT_INSTALLED",
          errorCategory: "TOOL_NOT_INSTALLED"
        })
      })
    );
    expect(db.prisma.analyzerToolAvailability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          toolName: "forge",
          available: false,
          status: "TOOL_NOT_INSTALLED"
        })
      })
    );
  });

  it("captures real build-info artifacts and triggers P2B IR extraction", async () => {
    await fs.mkdir(path.join(tempRoot, "out", "build-info"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "out", "build-info", "build.json"),
      JSON.stringify(solcBuildInfo())
    );
    const artifactStore = artifactStoreMock();
    const analysisIr = { persistForScan: vi.fn() };
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({
          status: "COMPLETED",
          exitCode: 0,
          stdout: "forge 1.0.0",
          stderr: "",
          durationMs: 5
        })
        .mockResolvedValueOnce({
          status: "COMPLETED",
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 20
        })
        .mockResolvedValueOnce({
          status: "COMPLETED",
          exitCode: 0,
          stdout: "Ran 1 test for test/Vault.t.sol:VaultTest\n[PASS] testWithdraw() (gas: 100)",
          stderr: "",
          durationMs: 15
        })
    };
    const service = await serviceWith({
      artifactStore,
      detection: foundryDetection(),
      runner,
      analysisIr
    });

    const result = await service.detectBuildProfile(buildJob());

    expect(result.compilerArtifactCount).toBe(1);
    expect(db.prisma.compilerArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          artifactKind: "FOUNDRY_BUILD_INFO",
          checksumSha256: expect.any(String)
        })
      })
    );
    expect(db.prisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testName: "testWithdraw()",
          status: "PASSED"
        })
      })
    );
    expect(analysisIr.persistForScan).toHaveBeenCalledWith(ids.scanId, ids.organizationId);
  });
});

async function serviceWith(input: {
  artifactStore: unknown;
  detection: unknown;
  runner: unknown;
  analysisIr: unknown;
}) {
  const { LocalBuildExecutionService } = await import(
    "../../../apps/worker/src/services/build/local-build-execution.service.js"
  );
  return new LocalBuildExecutionService(
    input.artifactStore as never,
    input.detection as never,
    input.runner as never,
    input.analysisIr as never
  );
}

function artifactStoreMock() {
  return {
    resolvePreparedArtifact: vi.fn(async () => tempRoot),
    ensureDirectoryExists: vi.fn(),
    writeTextArtifact: vi.fn(async (prefix: string, relativePath: string) => `${prefix}/${relativePath}`),
    writeBinaryArtifact: vi.fn(async (prefix: string, relativePath: string) => `${prefix}/${relativePath}`)
  };
}

function foundryDetection() {
  return {
    detect: vi.fn(async () => ({
      toolKind: "FOUNDRY",
      toolName: "foundry",
      projectRoot: ".",
      configFile: "foundry.toml",
      confidence: 0.98,
      detectionReason: "foundry.toml was found",
      solidityFileCount: 1
    }))
  };
}

function buildJob() {
  return {
    scanId: ids.scanId,
    organizationId: ids.organizationId,
    traceId: "trace-id",
    priority: "NORMAL" as const,
    preparedArtifactKey: "prepared/org/scan",
    analyzers: ["slither" as const]
  };
}

function solcBuildInfo() {
  return {
    id: "build-info",
    solcVersion: "0.8.24",
    output: {
      sources: {
        "contracts/Vault.sol": {
          id: 0,
          ast: { nodeType: "SourceUnit", nodes: [] }
        }
      },
      contracts: {
        "contracts/Vault.sol": {
          Vault: {
            abi: [],
            evm: {
              deployedBytecode: {
                sourceMap: "0:1:0"
              }
            },
            storageLayout: {
              storage: []
            }
          }
        }
      }
    }
  };
}
