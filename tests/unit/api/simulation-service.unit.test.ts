import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config/environment.js";
import { decideSimulation } from "../../../apps/api/src/modules/simulations/decision.js";
import { SimulationPlanBuilder } from "../../../apps/api/src/modules/simulations/simulation-plan-builder.js";
import { SimulationService } from "../../../apps/api/src/modules/simulations/simulation.service.js";

const baseContext = {
  id: "finding-1",
  scanId: "scan-1",
  title: "Access control issue",
  description: "Owner-only function may be reachable",
  category: "ACCESS_CONTROL",
  severity: "HIGH",
  confidenceState: "CANDIDATE",
  status: "OPEN",
  filePath: "src/Vault.sol",
  lineStart: 10,
  lineEnd: 12,
  analyzer: "slither",
  review: { status: "UNREVIEWED" },
  scan: {
    id: "scan-1",
    organizationId: "org-1",
    projectId: "project-1",
    chainId: null,
    targets: [{ targetType: "SOURCE", normalizedAddress: null, contractAddress: null, metadata: null }],
    buildRuns: [],
    compilerArtifacts: [],
    testRuns: []
  },
  evidenceItems: [
    {
      id: "evidence-1",
      evidenceType: "ANALYZER_FINDING",
      ruleId: "access-control",
      detectorName: "slither",
      message: "Privileged function lacks expected guard",
      filePath: "src/Vault.sol",
      startLine: 10,
      endLine: 12,
      snippet: "function sweep() external {}",
      analyzerRun: { toolName: "slither" }
    }
  ],
  codeLinks: [],
  aiFindingValidations: [],
  remediationRuns: []
};

const anvilAvailable = [
  { toolName: "anvil", available: true, status: "AVAILABLE", version: "anvil 1.0.0", errorCategory: null },
  { toolName: "forge", available: true, status: "AVAILABLE", version: "forge 1.0.0", errorCategory: null },
  { toolName: "hardhat", available: false, status: "TOOL_NOT_INSTALLED", version: null, errorCategory: "TOOL_NOT_INSTALLED" },
  { toolName: "node", available: true, status: "AVAILABLE", version: "v20", errorCategory: null },
  { toolName: "npm", available: true, status: "AVAILABLE", version: "10", errorCategory: null }
] as any;

const originalSimulationEnabled = env.SIMULATION_ENABLED;

afterEach(() => {
  env.SIMULATION_ENABLED = originalSimulationEnabled;
});

describe("SimulationService", () => {
  it("persists NOT_ASSESSED when simulation is disabled", async () => {
    env.SIMULATION_ENABLED = false;
    const harness = createHarness(baseContext, []);

    const result = await harness.service.simulateFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("NOT_ASSESSED");
    expect(harness.repository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "NOT_ASSESSED",
        decision: expect.objectContaining({ decision: "NOT_ASSESSED" })
      })
    );
  });

  it("marks suppressed findings NOT_ELIGIBLE", async () => {
    env.SIMULATION_ENABLED = true;
    const harness = createHarness({ ...baseContext, status: "SUPPRESSED" }, anvilAvailable);

    const result = await harness.service.simulateFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("NOT_ELIGIBLE");
  });

  it("marks contradicted AI findings NOT_ELIGIBLE", async () => {
    env.SIMULATION_ENABLED = true;
    const harness = createHarness(
      { ...baseContext, aiFindingValidations: [{ decision: "CONTRADICTED", reasoningSummary: "contradicted", contradictionNotes: null }] },
      anvilAvailable
    );

    const result = await harness.service.simulateFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("NOT_ELIGIBLE");
  });

  it("persists TOOL_NOT_INSTALLED when anvil is missing", async () => {
    env.SIMULATION_ENABLED = true;
    const harness = createHarness(baseContext, [{ ...anvilAvailable[0], available: false, status: "TOOL_NOT_INSTALLED" }]);

    const result = await harness.service.simulateFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("TOOL_NOT_INSTALLED");
  });

  it("returns INCONCLUSIVE for unsupported executable context", async () => {
    env.SIMULATION_ENABLED = true;
    const harness = createHarness(baseContext, anvilAvailable);

    const result = await harness.service.simulateFinding("finding-1", { organizationId: "org-1" });

    expect(result.status).toBe("INCONCLUSIVE");
  });
});

describe("Simulation plan and decision safety", () => {
  it("builds plans from persisted evidence identifiers only", () => {
    const built = new SimulationPlanBuilder().build(baseContext as any, anvilAvailable, true, "localhost");

    expect(built.plan.source.evidenceIds).toEqual(["evidence-1"]);
    expect(JSON.stringify(built.plan)).not.toContain("unpersisted");
  });

  it("requires trace or asset delta proof before REPRODUCED", () => {
    expect(
      decideSimulation({
        executionCompleted: true,
        observedExpectedCondition: true,
        traceArtifactCount: 0,
        assetDeltaCount: 0
      }).decision
    ).toBe("INCONCLUSIVE");

    expect(
      decideSimulation({
        executionCompleted: true,
        observedExpectedCondition: true,
        traceArtifactCount: 1,
        assetDeltaCount: 0
      }).decision
    ).toBe("REPRODUCED");
  });
});

function createHarness(context: any, tools: any[]) {
  const repository = {
    findingContext: vi.fn(async () => context),
    createRun: vi.fn(async () => ({ id: "sim-1" })),
    persistPlan: vi.fn(async () => ({ id: "plan-1" })),
    completeRun: vi.fn(async (input) => ({
      id: "sim-1",
      status: input.status,
      decision: input.decision.decision
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
  const runner = { run: vi.fn() };
  return {
    repository,
    service: new SimulationService(
      repository as any,
      new SimulationPlanBuilder(),
      toolDetector as any,
      artifactStore as any,
      runner as any,
      { assertAndConsume: vi.fn(async () => undefined) } as any
    )
  };
}
