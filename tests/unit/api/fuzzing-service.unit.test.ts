import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config/environment.js";
import { parseCoverageSummary, parseFoundryFuzzOutput } from "../../../apps/api/src/modules/fuzzing/foundry-parser.js";
import { InvariantCandidateBuilder } from "../../../apps/api/src/modules/fuzzing/invariant-builder.js";
import { FuzzingService } from "../../../apps/api/src/modules/fuzzing/fuzzing.service.js";

const baseContext = {
  scan: {
    id: "scan-1",
    organizationId: "org-1",
    projectId: "project-1",
    title: "Vault scan",
    buildProfiles: [{ id: "profile-1", toolKind: "FOUNDRY", projectRoot: ".", configFile: "foundry.toml" }],
    buildRuns: [{ id: "build-1", toolKind: "FOUNDRY", status: "SUCCEEDED", command: "forge build", artifactPath: null, artifactChecksumSha256: null }],
    compilerArtifacts: [{ id: "artifact-1", artifactKind: "abi", artifactPath: "out/Vault.sol/Vault.json", checksumSha256: "abc", contractName: "Vault", sourceFilePath: "src/Vault.sol" }],
    testRuns: [{ id: "test-1", toolKind: "FOUNDRY", status: "PASSED", command: "forge test", artifactPath: null, artifactChecksumSha256: null }],
    contractSymbols: [{ id: "contract-1", name: "Vault", fullyQualifiedName: "src/Vault.sol:Vault", filePath: "src/Vault.sol", startLine: 1, endLine: 100 }],
    functionSymbols: [{ id: "function-1", name: "withdraw", canonicalName: "Vault.withdraw", visibility: "external", filePath: "src/Vault.sol", startLine: 20, endLine: 40 }],
    stateVariableSymbols: [{ id: "state-1", name: "balances", typeName: "mapping(address=>uint256)", visibility: "private", filePath: "src/Vault.sol", startLine: 5, endLine: 5 }],
    externalCallSites: [{ id: "call-1", callKind: "CALL", targetExpression: "msg.sender.call", stateUpdateAfterCall: true, filePath: "src/Vault.sol", startLine: 30, endLine: 30 }],
    storageLayoutEntries: [],
    simulationRuns: [{ id: "simulation-1", status: "INCONCLUSIVE", decision: "INCONCLUSIVE" }]
  },
  finding: {
    id: "finding-1",
    scanId: "scan-1",
    title: "Reentrancy-sensitive withdraw",
    description: "External call before all accounting is finalized",
    category: "REENTRANCY",
    status: "OPEN",
    filePath: "src/Vault.sol",
    lineStart: 20,
    lineEnd: 40,
    review: { status: "UNREVIEWED" },
    evidenceItems: [{ id: "evidence-1", message: "External call pattern", filePath: "src/Vault.sol", startLine: 30, endLine: 30, snippet: "call" }],
    codeLinks: [],
    aiFindingValidations: []
  }
};

const forgeAvailable = [
  { toolName: "forge", toolKind: "FOUNDRY", available: true, status: "AVAILABLE", version: "forge 1.0.0", errorCategory: null },
  { toolName: "echidna", toolKind: "ECHIDNA", available: false, status: "TOOL_NOT_INSTALLED", version: null, errorCategory: "TOOL_NOT_INSTALLED" },
  { toolName: "medusa", toolKind: "MEDUSA", available: false, status: "TOOL_NOT_INSTALLED", version: null, errorCategory: "TOOL_NOT_INSTALLED" },
  { toolName: "hardhat", toolKind: "HARDHAT", available: false, status: "TOOL_NOT_INSTALLED", version: null, errorCategory: "TOOL_NOT_INSTALLED" },
  { toolName: "node", toolKind: "UNKNOWN", available: true, status: "AVAILABLE", version: "v20", errorCategory: null },
  { toolName: "npm", toolKind: "UNKNOWN", available: true, status: "AVAILABLE", version: "10", errorCategory: null }
] as any;

const originalFuzzingEnabled = env.FUZZING_ENABLED;

afterEach(() => {
  env.FUZZING_ENABLED = originalFuzzingEnabled;
});

describe("FuzzingService", () => {
  it("persists NOT_ASSESSED when fuzzing is disabled", async () => {
    env.FUZZING_ENABLED = false;
    const harness = createHarness(baseContext, []);

    const result = await harness.service.fuzzFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("NOT_ASSESSED");
    expect(harness.repository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "NOT_ASSESSED",
        parserResult: expect.objectContaining({ invariantStatus: "NOT_ASSESSED" })
      })
    );
  });

  it("persists TOOL_NOT_INSTALLED when forge is missing", async () => {
    env.FUZZING_ENABLED = true;
    const harness = createHarness(baseContext, [{ ...forgeAvailable[0], available: false, status: "TOOL_NOT_INSTALLED" }]);

    const result = await harness.service.fuzzFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("TOOL_NOT_INSTALLED");
  });

  it("marks suppressed findings NOT_ELIGIBLE", async () => {
    env.FUZZING_ENABLED = true;
    const harness = createHarness({ ...baseContext, finding: { ...baseContext.finding, status: "SUPPRESSED" } }, forgeAvailable);

    const result = await harness.service.fuzzFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("NOT_ELIGIBLE");
  });
});

describe("Invariant builder and parsers", () => {
  it("uses persisted identifiers only for invariant candidates", () => {
    const built = new InvariantCandidateBuilder().build(baseContext as any, forgeAvailable, true);

    expect(built.plan.source.evidenceIds).toEqual(["evidence-1"]);
    expect(built.plan.invariants.length).toBeGreaterThan(0);
    expect(JSON.stringify(built.plan)).not.toContain("unpersisted");
  });

  it("detects Foundry pass/fail/counterexample output", () => {
    expect(parseFoundryFuzzOutput({ stdout: "Suite result: ok. 1 passed", stderr: "", exitCode: 0 }).status).toBe("PASSED");
    const failed = parseFoundryFuzzOutput({
      stdout: "FAIL. Counterexample: calldata=0x1234\nargs: [1]",
      stderr: "",
      exitCode: 1
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.counterexample).toContain("Counterexample");
  });

  it("stores real coverage only when coverage output exists", () => {
    expect(parseCoverageSummary("no coverage table").status).toBe("NOT_ASSESSED");
    expect(parseCoverageSummary("Total | 90.00% | 88.00% | 70.00% | 95.00%").lineCoveragePct).toBe(90);
  });

  it("treats malformed tool output as INCONCLUSIVE", () => {
    expect(parseFoundryFuzzOutput({ stdout: "unexpected text", stderr: "", exitCode: 0 }).status).toBe("INCONCLUSIVE");
  });
});

function createHarness(context: any, tools: any[]) {
  const repository = {
    findingContext: vi.fn(async () => context),
    scanContext: vi.fn(async () => context),
    createRun: vi.fn(async () => ({ id: "fuzz-1" })),
    persistPlan: vi.fn(async () => ({})),
    completeRun: vi.fn(async (input) => ({
      id: "fuzz-1",
      status: input.status,
      invariantStatus: input.parserResult.invariantStatus
    })),
    audit: vi.fn(async () => ({}))
  };
  const toolDetector = { detect: vi.fn(async () => tools) };
  const artifactStore = {
    writeJsonArtifact: vi.fn(async (_prefix: string, relativePath: string) => ({
      artifactKey: relativePath,
      checksum: `checksum-${relativePath}`,
      sizeBytes: 10
    })),
    writeTextArtifact: vi.fn(async (_prefix: string, relativePath: string) => ({
      artifactKey: relativePath,
      checksum: `checksum-${relativePath}`,
      sizeBytes: 10
    }))
  };
  const runner = { run: vi.fn(async () => ({ commandExecuted: "forge test", exitCode: 0, timedOut: false, stdout: "Suite result: ok", stderr: "", durationMs: 10 })) };
  return {
    repository,
    service: new FuzzingService(
      repository as any,
      new InvariantCandidateBuilder(),
      toolDetector as any,
      artifactStore as any,
      runner as any,
      { assertAndConsume: vi.fn(async () => undefined) } as any
    )
  };
}
