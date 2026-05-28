import type { SimulationStatus } from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { env } from "../../config/environment.js";
import { decideSimulation } from "./decision.js";
import { LocalForkRunner } from "./local-fork-runner.js";
import {
  LocalSimulationArtifactStore,
  simulationArtifactPrefix,
  type SimulationArtifactStore
} from "./simulation-artifact-store.js";
import { SimulationPlanBuilder } from "./simulation-plan-builder.js";
import { SimulationRepository } from "./simulation.repository.js";
import { LocalSimulationToolDetector, type SimulationToolDetector } from "./tool-detector.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";

export interface SimulationActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export class SimulationService {
  constructor(
    private readonly repository = new SimulationRepository(),
    private readonly planBuilder = new SimulationPlanBuilder(),
    private readonly toolDetector: SimulationToolDetector = new LocalSimulationToolDetector(),
    private readonly artifactStore: SimulationArtifactStore = new LocalSimulationArtifactStore(),
    private readonly runner = new LocalForkRunner(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async findingSimulations(findingId: string, organizationId: string) {
    const result = await this.repository.findingSimulations(findingId, organizationId);
    if (!result) throw ApiError.notFound("Finding");
    return {
      simulation: simulationState(),
      ...result
    };
  }

  async scanSummary(scanId: string, organizationId: string) {
    const result = await this.repository.scanSummary(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return {
      simulation: simulationState(),
      ...result
    };
  }

  async get(simulationId: string, organizationId: string) {
    const run = await this.repository.getRun(simulationId, organizationId);
    if (!run) throw ApiError.notFound("Simulation");
    return run;
  }

  async artifacts(simulationId: string, organizationId: string) {
    const artifacts = await this.repository.artifacts(simulationId, organizationId);
    if (!artifacts) throw ApiError.notFound("Simulation");
    return artifacts;
  }

  async simulateFinding(findingId: string, actor: SimulationActor) {
    const finding = await this.repository.findingContext(findingId, actor.organizationId);
    if (!finding) throw ApiError.notFound("Finding");
    await this.usageLimits.assertAndConsume(actor.organizationId, "SIMULATIONS_PER_MONTH", {
      resourceType: "SIMULATION_RUN"
    });

    const tools = env.SIMULATION_ENABLED ? await this.toolDetector.detect() : [];
    const built = this.planBuilder.build(finding, tools, env.SIMULATION_ENABLED, rpcProviderName());
    const startedAt = new Date();
    const artifactPrefix = simulationArtifactPrefix(finding.scan.id, finding.id);
    const planArtifact = await this.artifactStore.writeJsonArtifact(artifactPrefix, "simulation-plan.json", {
      eligibility: built.eligibility,
      plan: built.plan
    });
    const skeletonArtifact = built.plan.generatedSkeleton
      ? await this.artifactStore.writeTextArtifact(artifactPrefix, "local-simulation-skeleton.t.sol", built.plan.generatedSkeleton)
      : null;

    const run = await this.repository.createRun({
      organizationId: finding.scan.organizationId,
      projectId: finding.scan.projectId,
      scanId: finding.scan.id,
      findingId: finding.id,
      status: "RUNNING",
      kind: built.plan.kind,
      safetyLevel: built.eligibility.safetyLevel,
      decision: "NOT_ASSESSED",
      rpcProviderName: built.plan.rpcProviderName,
      commandExecuted: built.plan.commandPreview,
      inputEvidenceChecksum: built.checksum,
      notEligibleReason: built.eligibility.reason,
      startedAt,
      metadata: {
        requestedByUserId: actor.actorUserId ?? null,
        simulationPlanVersion: built.plan.version,
        safetyDisclaimer: "Simulation runs only in a local fork/test environment and does not broadcast live transactions."
      }
    });

    await this.repository.persistPlan({
      runId: run.id,
      organizationId: finding.scan.organizationId,
      projectId: finding.scan.projectId,
      scanId: finding.scan.id,
      findingId: finding.id,
      plan: built.plan,
      planArtifact,
      eligibility: built.eligibility,
      artifacts: skeletonArtifact ? [{ artifactType: "TEST_SKELETON", artifact: skeletonArtifact }] : []
    });

    const final = await this.finishRun(run.id, startedAt, artifactPrefix, built);
    await this.repository.audit({
      organizationId: finding.scan.organizationId,
      actorUserId: actor.actorUserId,
      resourceId: run.id,
      metadata: {
        findingId: finding.id,
        scanId: finding.scan.id,
        status: final.status,
        decision: final.decision
      }
    });

    return {
      enqueued: false,
      ran: final.status !== "NOT_ASSESSED" && final.status !== "NOT_ELIGIBLE" && final.status !== "TOOL_NOT_INSTALLED",
      status: final.status,
      decision: final.decision,
      simulationId: final.id,
      run: final
    };
  }

  private async finishRun(
    runId: string,
    startedAt: Date,
    artifactPrefix: string,
    built: ReturnType<SimulationPlanBuilder["build"]>
  ) {
    if (!env.SIMULATION_ENABLED) {
      return this.repository.completeRun({
        runId,
        startedAt,
        status: "NOT_ASSESSED",
        decision: {
          decision: "NOT_ASSESSED",
          rationale: "Simulation is disabled for this environment.",
          suggestedConfidenceAdjustment: null
        },
        errorCategory: "NOT_ASSESSED",
        error: "Simulation is disabled by configuration"
      });
    }

    if (!built.eligibility.eligible) {
      const status = statusForNotEligible(built.eligibility.reason);
      return this.repository.completeRun({
        runId,
        startedAt,
        status,
        decision: {
          decision: status === "TOOL_NOT_INSTALLED" ? "TOOL_NOT_INSTALLED" : "NOT_ELIGIBLE",
          rationale: built.eligibility.reason ?? "Finding is not eligible for local simulation.",
          suggestedConfidenceAdjustment: null
        },
        errorCategory: status,
        error: built.eligibility.reason ?? "Finding is not eligible for local simulation"
      });
    }

    if (!built.plan.executable || !built.plan.commandPreview) {
      return this.repository.completeRun({
        runId,
        startedAt,
        status: "INCONCLUSIVE",
        decision: decideSimulation({
          executionCompleted: false,
          observedExpectedCondition: false,
          traceArtifactCount: 0,
          assetDeltaCount: 0,
          unsupportedContext: true
        }),
        errorCategory: "INCONCLUSIVE",
        error: built.plan.unsupportedReason ?? "Persisted context does not support safe automatic execution"
      });
    }

    const result = await this.runner.run({
      command: "anvil",
      args: ["--version"]
    });
    const stdoutArtifact = result.stdout
      ? await this.artifactStore.writeTextArtifact(artifactPrefix, "stdout.txt", result.stdout)
      : null;
    const stderrArtifact = result.stderr
      ? await this.artifactStore.writeTextArtifact(artifactPrefix, "stderr.txt", result.stderr)
      : null;
    const decision = decideSimulation({
      executionCompleted: !result.timedOut && result.exitCode === 0,
      observedExpectedCondition: false,
      traceArtifactCount: 0,
      assetDeltaCount: 0,
      timedOut: result.timedOut,
      failed: !result.timedOut && result.exitCode !== 0
    });

    return this.repository.completeRun({
      runId,
      startedAt,
      status: result.timedOut ? "TIMEOUT" : result.exitCode === 0 ? decision.decision : "FAILED",
      decision,
      stdoutArtifact,
      stderrArtifact,
      commandExecuted: result.commandExecuted,
      errorCategory: result.timedOut ? "TIMEOUT" : result.exitCode === 0 ? null : "COMMAND_FAILED",
      error: result.exitCode === 0 ? null : `Simulation command exited with code ${result.exitCode ?? "unknown"}`
    });
  }
}

function simulationState() {
  return {
    enabled: env.SIMULATION_ENABLED,
    safetyLevel: env.SIMULATION_ENABLED ? env.SIMULATION_SAFETY_LEVEL : "DISABLED",
    rpcProviderName: rpcProviderName(),
    warning: "Simulation runs only in a local fork/test environment and does not broadcast live transactions."
  };
}

function rpcProviderName(): string | null {
  if (!env.SIMULATION_RPC_URL) return null;
  try {
    return new URL(env.SIMULATION_RPC_URL).hostname;
  } catch {
    return "configured-rpc";
  }
}

function statusForNotEligible(reason: string | null): SimulationStatus {
  if (reason?.toLowerCase().includes("anvil")) return "TOOL_NOT_INSTALLED";
  return "NOT_ELIGIBLE";
}
