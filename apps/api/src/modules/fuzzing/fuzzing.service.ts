import type { FuzzRunStatus, InvariantStatus } from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { env } from "../../config/environment.js";
import {
  LocalFuzzArtifactStore,
  fuzzArtifactPrefix,
  type FuzzArtifactStore
} from "./fuzz-artifact-store.js";
import { parseCoverageSummary, parseFoundryFuzzOutput, type FoundryFuzzParseResult } from "./foundry-parser.js";
import { InvariantCandidateBuilder, type BuiltFuzzPlan } from "./invariant-builder.js";
import { LocalFuzzRunner, type LocalFuzzRunner as FuzzRunner } from "./local-fuzz-runner.js";
import { FuzzingRepository } from "./fuzzing.repository.js";
import { LocalFuzzToolDetector, type FuzzToolDetector } from "./tool-detector.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";

export interface FuzzActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export class FuzzingService {
  constructor(
    private readonly repository = new FuzzingRepository(),
    private readonly builder = new InvariantCandidateBuilder(),
    private readonly toolDetector: FuzzToolDetector = new LocalFuzzToolDetector(),
    private readonly artifactStore: FuzzArtifactStore = new LocalFuzzArtifactStore(),
    private readonly runner: FuzzRunner = new LocalFuzzRunner(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async scanSummary(scanId: string, organizationId: string) {
    const result = await this.repository.scanSummary(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return { fuzzing: fuzzingState(), ...result };
  }

  async findingFuzz(findingId: string, organizationId: string) {
    const result = await this.repository.findingFuzz(findingId, organizationId);
    if (!result) throw ApiError.notFound("Finding");
    return { fuzzing: fuzzingState(), ...result };
  }

  async scanInvariants(scanId: string, organizationId: string) {
    const result = await this.repository.scanInvariants(scanId, organizationId);
    if (!result) throw ApiError.notFound("Scan");
    return { fuzzing: fuzzingState(), ...result };
  }

  async get(fuzzRunId: string, organizationId: string) {
    const run = await this.repository.getRun(fuzzRunId, organizationId);
    if (!run) throw ApiError.notFound("Fuzz run");
    return run;
  }

  async artifacts(fuzzRunId: string, organizationId: string) {
    const artifacts = await this.repository.artifacts(fuzzRunId, organizationId);
    if (!artifacts) throw ApiError.notFound("Fuzz run");
    return artifacts;
  }

  fuzzScan(scanId: string, actor: FuzzActor) {
    return this.execute({ scanId, actor, invariantOnly: false });
  }

  fuzzFinding(findingId: string, actor: FuzzActor) {
    return this.execute({ findingId, actor, invariantOnly: false });
  }

  runScanInvariants(scanId: string, actor: FuzzActor) {
    return this.execute({ scanId, actor, invariantOnly: true });
  }

  private async execute(input: {
    scanId?: string | undefined;
    findingId?: string | undefined;
    actor: FuzzActor;
    invariantOnly: boolean;
  }) {
    const context = input.findingId
      ? await this.repository.findingContext(input.findingId, input.actor.organizationId)
      : await this.repository.scanContext(input.scanId!, input.actor.organizationId);
    if (!context) throw ApiError.notFound(input.findingId ? "Finding" : "Scan");
    await this.usageLimits.assertAndConsume(input.actor.organizationId, "FUZZ_RUNS_PER_MONTH", {
      resourceType: input.invariantOnly ? "INVARIANT_RUN" : "FUZZ_RUN"
    });

    const tools = env.FUZZING_ENABLED ? await this.toolDetector.detect() : [];
    const built = this.builder.build(context, tools, env.FUZZING_ENABLED, input.invariantOnly);
    const startedAt = new Date();
    const scanId = context.scan.id;
    const findingId = context.finding?.id ?? null;
    const artifactPrefix = fuzzArtifactPrefix(scanId, findingId);
    const planArtifact = await this.artifactStore.writeJsonArtifact(artifactPrefix, "fuzz-plan.json", {
      eligibility: built.eligibility,
      plan: built.plan
    });
    const skeleton = built.plan.testCases[0]?.skeleton ?? null;
    const skeletonArtifact = skeleton
      ? await this.artifactStore.writeTextArtifact(artifactPrefix, "LocalOnlyInvariantHarness.t.sol", skeleton)
      : null;

    const run = await this.repository.createRun({
      organizationId: context.scan.organizationId,
      projectId: context.scan.projectId,
      scanId,
      findingId,
      status: "RUNNING",
      toolKind: built.plan.toolKind,
      commandExecuted: built.plan.commandPreview,
      inputContextChecksum: built.checksum,
      startedAt,
      metadata: {
        requestedByUserId: input.actor.actorUserId ?? null,
        fuzzPlanVersion: built.plan.version,
        invariantOnly: input.invariantOnly,
        safetyDisclaimer: "Fuzzing runs only in a local/sandbox environment and does not broadcast live transactions."
      }
    });

    await this.repository.persistPlan({
      runId: run.id,
      organizationId: context.scan.organizationId,
      projectId: context.scan.projectId,
      scanId,
      findingId,
      plan: built.plan,
      built,
      planArtifact,
      skeletonArtifact
    });

    const final = await this.finishRun(run.id, startedAt, artifactPrefix, built);
    await this.repository.audit({
      organizationId: context.scan.organizationId,
      actorUserId: input.actor.actorUserId,
      resourceId: run.id,
      metadata: {
        scanId,
        findingId,
        status: final.status,
        invariantStatus: final.invariantStatus
      }
    });

    return {
      enqueued: false,
      ran: final.status !== "NOT_ASSESSED" && final.status !== "NOT_ELIGIBLE" && final.status !== "TOOL_NOT_INSTALLED",
      status: final.status,
      invariantStatus: final.invariantStatus ?? "NOT_ASSESSED",
      fuzzRunId: final.id,
      run: final
    };
  }

  private async finishRun(
    runId: string,
    startedAt: Date,
    artifactPrefix: string,
    built: BuiltFuzzPlan
  ) {
    if (!env.FUZZING_ENABLED) {
      return this.completeOperational(runId, startedAt, "NOT_ASSESSED", "NOT_ASSESSED", "Fuzzing is disabled for this environment.", "NOT_ASSESSED");
    }

    if (!built.eligibility.eligible) {
      const status = statusForEligibility(built.eligibility.status);
      const invariantStatus: InvariantStatus = status === "TOOL_NOT_INSTALLED" ? "NOT_ASSESSED" : "INCONCLUSIVE";
      return this.completeOperational(
        runId,
        startedAt,
        status,
        invariantStatus,
        built.eligibility.reason ?? "Fuzzing is not eligible for this context.",
        status
      );
    }

    if (!built.plan.executable || !built.plan.projectRoot) {
      return this.completeOperational(
        runId,
        startedAt,
        "INCONCLUSIVE",
        "INCONCLUSIVE",
        built.plan.unsupportedReason ?? "Persisted context does not include an executable local fuzz harness.",
        "INCONCLUSIVE"
      );
    }

    try {
      const result = await this.runner.run({
        command: "forge",
        args: ["test", "--fuzz-runs", String(env.FUZZING_DEFAULT_RUNS)],
        cwd: built.plan.projectRoot
      });
      const stdoutArtifact = result.stdout ? await this.artifactStore.writeTextArtifact(artifactPrefix, "stdout.txt", result.stdout) : null;
      const stderrArtifact = result.stderr ? await this.artifactStore.writeTextArtifact(artifactPrefix, "stderr.txt", result.stderr) : null;
      const parsed = parseFoundryFuzzOutput(result);
      const counterexampleArtifact = parsed.counterexample
        ? await this.artifactStore.writeTextArtifact(artifactPrefix, "counterexample.txt", parsed.counterexample)
        : null;
      const coverage = parseCoverageSummary(`${result.stdout}\n${result.stderr}`);
      return this.repository.completeRun({
        runId,
        startedAt,
        status: parsed.status,
        parserResult: parsed,
        stdoutArtifact,
        stderrArtifact,
        counterexampleArtifact,
        coverage: coverage.status === "NOT_ASSESSED" ? null : coverage,
        commandExecuted: result.commandExecuted,
        errorCategory: parsed.status === "PASSED" ? null : parsed.status,
        error: parsed.status === "PASSED" ? null : parsed.summary
      });
    } catch (cause) {
      return this.completeOperational(
        runId,
        startedAt,
        "FAILED",
        "INCONCLUSIVE",
        cause instanceof Error ? cause.message : "Local fuzz execution failed",
        "COMMAND_FAILED"
      );
    }
  }

  private completeOperational(
    runId: string,
    startedAt: Date,
    status: FuzzRunStatus,
    invariantStatus: InvariantStatus,
    reason: string,
    errorCategory: string
  ) {
    return this.repository.completeRun({
      runId,
      startedAt,
      status,
      parserResult: operationalResult(invariantStatus, reason),
      errorCategory,
      error: reason
    });
  }
}

function fuzzingState() {
  return {
    enabled: env.FUZZING_ENABLED,
    safetyLevel: env.FUZZING_ENABLED ? env.FUZZING_SAFETY_LEVEL : "DISABLED",
    defaultRuns: env.FUZZING_DEFAULT_RUNS,
    warning: "Fuzzing runs only in a local/sandbox environment and does not broadcast live transactions."
  };
}

function operationalResult(invariantStatus: InvariantStatus, reason: string): FoundryFuzzParseResult {
  return {
    status: invariantStatus === "PASSED" ? "PASSED" : invariantStatus === "FAILED" ? "FAILED" : "INCONCLUSIVE",
    invariantStatus,
    summary: reason,
    counterexample: null,
    gasUsed: null
  };
}

function statusForEligibility(status: BuiltFuzzPlan["eligibility"]["status"]): FuzzRunStatus {
  if (status === "TOOL_NOT_INSTALLED") return "TOOL_NOT_INSTALLED";
  if (status === "NOT_ASSESSED") return "NOT_ASSESSED";
  return "NOT_ELIGIBLE";
}
