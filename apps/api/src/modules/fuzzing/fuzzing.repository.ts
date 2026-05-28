import type { FuzzRunStatus, InvariantStatus, Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { redactSecrets } from "../remediation/redaction.js";
import type { StoredFuzzArtifact } from "./fuzz-artifact-store.js";
import type { BuiltFuzzPlan, FuzzContext, FuzzPlan } from "./invariant-builder.js";
import type { FoundryFuzzParseResult, CoverageParseResult } from "./foundry-parser.js";

export interface CreateFuzzRunInput {
  organizationId: string | null;
  projectId: string | null;
  scanId: string;
  findingId?: string | null | undefined;
  status: FuzzRunStatus;
  toolKind: FuzzPlan["toolKind"];
  commandExecuted?: string | null | undefined;
  inputContextChecksum?: string | null | undefined;
  startedAt?: Date | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PersistFuzzPlanInput {
  runId: string;
  organizationId: string | null;
  projectId: string | null;
  scanId: string;
  findingId?: string | null | undefined;
  plan: FuzzPlan;
  built: BuiltFuzzPlan;
  planArtifact: StoredFuzzArtifact;
  skeletonArtifact?: StoredFuzzArtifact | null | undefined;
}

export interface CompleteFuzzRunInput {
  runId: string;
  startedAt: Date;
  status: FuzzRunStatus;
  parserResult: FoundryFuzzParseResult;
  stdoutArtifact?: StoredFuzzArtifact | null | undefined;
  stderrArtifact?: StoredFuzzArtifact | null | undefined;
  counterexampleArtifact?: StoredFuzzArtifact | null | undefined;
  coverage?: CoverageParseResult | null | undefined;
  commandExecuted?: string | null | undefined;
  errorCategory?: string | null | undefined;
  error?: string | null | undefined;
}

export class FuzzingRepository {
  async scanContext(scanId: string, organizationId: string): Promise<FuzzContext | null> {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: scanFuzzInclude()
    });
    if (!scan) return null;
    return { scan } as unknown as FuzzContext;
  }

  async findingContext(findingId: string, organizationId: string): Promise<FuzzContext | null> {
    const finding = await prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null, scan: { organizationId, deletedAt: null } },
      include: {
        review: true,
        evidenceItems: { orderBy: { createdAt: "asc" } },
        codeLinks: {
          orderBy: { createdAt: "asc" },
          include: {
            contractSymbol: true,
            functionSymbol: true,
            externalCallSite: true,
            storageLayoutEntry: true
          }
        },
        aiFindingValidations: { orderBy: { createdAt: "desc" }, take: 1 },
        scan: { include: scanFuzzInclude() }
      }
    });
    if (!finding) return null;
    return { scan: finding.scan, finding } as unknown as FuzzContext;
  }

  async scanSummary(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!scan) return null;
    const runs = await prisma.fuzzRun.findMany({
      where: { scanId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: fuzzRunInclude()
    });
    const statusCounts = initialFuzzStatusCounts();
    const invariantCounts = initialInvariantStatusCounts();
    for (const run of runs) {
      statusCounts[run.status] += 1;
      if (run.invariantStatus) invariantCounts[run.invariantStatus] += 1;
    }
    return {
      scanId,
      organizationId,
      projectId: scan.projectId,
      fuzzRunCount: runs.length,
      status: runs[0]?.status ?? "NOT_ASSESSED",
      invariantStatus: runs[0]?.invariantStatus ?? "NOT_ASSESSED",
      statusCounts,
      invariantCounts,
      runs
    };
  }

  async findingFuzz(findingId: string, organizationId: string) {
    const finding = await prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null, scan: { organizationId, deletedAt: null } },
      select: { id: true, scanId: true, scan: { select: { organizationId: true, projectId: true } } }
    });
    if (!finding) return null;
    const runs = await prisma.fuzzRun.findMany({
      where: { findingId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: fuzzRunInclude()
    });
    return {
      findingId,
      scanId: finding.scanId,
      organizationId: finding.scan.organizationId,
      projectId: finding.scan.projectId,
      status: runs[0]?.status ?? "NOT_ASSESSED",
      invariantStatus: runs[0]?.invariantStatus ?? "NOT_ASSESSED",
      runs
    };
  }

  scanInvariants(scanId: string, organizationId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        invariantDefinitions: { orderBy: { createdAt: "desc" }, take: 50 },
        invariantRuns: { orderBy: { createdAt: "desc" }, take: 10, include: { results: { orderBy: { createdAt: "desc" }, take: 20 } } }
      }
    });
  }

  createRun(input: CreateFuzzRunInput) {
    return prisma.fuzzRun.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        findingId: input.findingId ?? null,
        status: input.status,
        toolKind: input.toolKind,
        safetyLevel: "LOCAL_ONLY",
        commandExecuted: input.commandExecuted ? redactSecrets(input.commandExecuted) : null,
        inputContextChecksum: input.inputContextChecksum ?? null,
        startedAt: input.startedAt ?? null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      },
      include: fuzzRunInclude()
    });
  }

  async persistPlan(input: PersistFuzzPlanInput) {
    await prisma.$transaction(async (tx) => {
      await tx.fuzzArtifact.create({
        data: artifactData(input, "PLAN_JSON", input.planArtifact)
      });
      if (input.skeletonArtifact) {
        await tx.fuzzArtifact.create({
          data: artifactData(input, "FOUNDRY_SKELETON", input.skeletonArtifact)
        });
      }
      for (const target of input.plan.targets) {
        await tx.fuzzTarget.create({
          data: {
            fuzzRunId: input.runId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId ?? null,
            targetType: target.targetType,
            contractName: target.contractName,
            functionName: target.functionName,
            filePath: target.filePath,
            ...(target.sourceRange ? { sourceRange: toJsonValue(target.sourceRange) } : {}),
            abiArtifactPath: target.abiArtifactPath
          }
        });
      }
      for (const testCase of input.plan.testCases) {
        await tx.fuzzTestCase.create({
          data: {
            fuzzRunId: input.runId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId ?? null,
            title: testCase.title,
            framework: testCase.framework,
            skeleton: testCase.skeleton,
            generatedOnly: true,
            commandPreview: testCase.commandPreview
          }
        });
      }
      const invariantRun = await tx.invariantRun.create({
        data: {
          fuzzRunId: input.runId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: input.findingId ?? null,
          toolKind: input.plan.toolKind,
          status: "NOT_ASSESSED",
          metadata: toJsonValue({
            eligibility: input.built.eligibility,
            invariantOnly: input.plan.invariantOnly
          })
        }
      });
      for (const invariant of input.plan.invariants) {
        await tx.invariantDefinition.create({
          data: {
            fuzzRunId: input.runId,
            invariantRunId: invariantRun.id,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId ?? null,
            category: invariant.category,
            name: invariant.name,
            description: invariant.description,
            expression: invariant.expression,
            skeleton: invariant.skeleton,
            source: "PERSISTED_CONTEXT",
            status: "NOT_ASSESSED",
            metadata: toJsonValue({ sourceIds: invariant.sourceIds })
          }
        });
      }
    });
  }

  async completeRun(input: CompleteFuzzRunInput) {
    const run = await prisma.fuzzRun.findUniqueOrThrow({
      where: { id: input.runId },
      select: { id: true, organizationId: true, projectId: true, scanId: true, findingId: true }
    });
    return prisma.$transaction(async (tx) => {
      const artifactRecords: string[] = [];
      for (const artifact of [
        input.stdoutArtifact ? { type: "STDOUT", artifact: input.stdoutArtifact } : null,
        input.stderrArtifact ? { type: "STDERR", artifact: input.stderrArtifact } : null,
        input.counterexampleArtifact ? { type: "COUNTEREXAMPLE", artifact: input.counterexampleArtifact } : null
      ].filter(Boolean) as Array<{ type: string; artifact: StoredFuzzArtifact }>) {
        const created = await tx.fuzzArtifact.create({
          data: artifactData({ ...run, runId: run.id }, artifact.type, artifact.artifact)
        });
        artifactRecords.push(created.id);
      }

      if (input.counterexampleArtifact && input.parserResult.counterexample) {
        await tx.fuzzCounterexample.create({
          data: {
            fuzzRunId: run.id,
            organizationId: run.organizationId,
            projectId: run.projectId,
            scanId: run.scanId,
            findingId: run.findingId,
            summary: input.parserResult.summary,
            artifactPath: input.counterexampleArtifact.artifactKey,
            checksumSha256: input.counterexampleArtifact.checksum,
            rawExcerpt: input.parserResult.counterexample
          }
        });
      }

      const invariantRun = await tx.invariantRun.findFirst({
        where: { fuzzRunId: run.id },
        orderBy: { createdAt: "desc" }
      });
      if (invariantRun) {
        await tx.invariantRun.update({
          where: { id: invariantRun.id },
          data: {
            status: input.parserResult.invariantStatus,
            commandExecuted: input.commandExecuted ? redactSecrets(input.commandExecuted) : null,
            finishedAt: new Date(),
            durationMs: Math.max(0, Date.now() - input.startedAt.getTime()),
            errorCategory: input.errorCategory ?? null,
            error: input.error ? redactSecrets(input.error).slice(0, 2_000) : null
          }
        });
        await tx.invariantResult.create({
          data: {
            fuzzRunId: run.id,
            invariantRunId: invariantRun.id,
            organizationId: run.organizationId,
            projectId: run.projectId,
            scanId: run.scanId,
            findingId: run.findingId,
            status: input.parserResult.invariantStatus,
            summary: input.parserResult.summary,
            counterexampleArtifactPath: input.counterexampleArtifact?.artifactKey ?? null,
            counterexampleChecksumSha256: input.counterexampleArtifact?.checksum ?? null,
            gasUsed: input.parserResult.gasUsed,
            metadata: toJsonValue({ artifactIds: artifactRecords })
          }
        });
      }

      if (input.coverage) {
        await tx.coverageSummary.create({
          data: {
            fuzzRunId: run.id,
            organizationId: run.organizationId,
            projectId: run.projectId,
            scanId: run.scanId,
            findingId: run.findingId,
            toolKind: "FOUNDRY",
            status: input.coverage.status,
            lineCoveragePct: input.coverage.lineCoveragePct,
            functionCoveragePct: input.coverage.functionCoveragePct,
            branchCoveragePct: input.coverage.branchCoveragePct,
            metadata: toJsonValue({ rawSummary: input.coverage.rawSummary })
          }
        });
      }

      return tx.fuzzRun.update({
        where: { id: run.id },
        data: {
          status: input.status,
          invariantStatus: input.parserResult.invariantStatus,
          commandExecuted: input.commandExecuted ? redactSecrets(input.commandExecuted) : null,
          stdoutArtifactPath: input.stdoutArtifact?.artifactKey ?? null,
          stdoutChecksumSha256: input.stdoutArtifact?.checksum ?? null,
          stderrArtifactPath: input.stderrArtifact?.artifactKey ?? null,
          stderrChecksumSha256: input.stderrArtifact?.checksum ?? null,
          counterexampleArtifactPath: input.counterexampleArtifact?.artifactKey ?? null,
          counterexampleChecksumSha256: input.counterexampleArtifact?.checksum ?? null,
          ...(input.coverage ? { coverageData: toJsonValue(input.coverage) } : {}),
          gasUsed: input.parserResult.gasUsed,
          errorCategory: input.errorCategory ?? null,
          error: input.error ? redactSecrets(input.error).slice(0, 2_000) : null,
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - input.startedAt.getTime())
        },
        include: fuzzRunInclude()
      });
    });
  }

  getRun(fuzzRunId: string, organizationId: string) {
    return prisma.fuzzRun.findFirst({
      where: { id: fuzzRunId, scan: { organizationId, deletedAt: null } },
      include: fuzzRunInclude()
    });
  }

  async artifacts(fuzzRunId: string, organizationId: string) {
    const run = await this.getRun(fuzzRunId, organizationId);
    if (!run) return null;
    return {
      fuzzRunId,
      scanId: run.scanId,
      findingId: run.findingId,
      artifacts: run.artifacts
    };
  }

  audit(input: {
    organizationId: string | null;
    actorUserId?: string | undefined;
    resourceId: string;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: "FUZZ_RUN",
        resource: "FUZZ_RUN",
        resourceId: input.resourceId,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }
}

export function fuzzRunInclude() {
  return {
    targets: { orderBy: { createdAt: "asc" } },
    testCases: { orderBy: { createdAt: "asc" } },
    counterexamples: { orderBy: { createdAt: "desc" }, take: 10 },
    invariantRuns: { orderBy: { createdAt: "desc" }, take: 5, include: { results: { orderBy: { createdAt: "desc" }, take: 20 } } },
    invariantDefinitions: { orderBy: { createdAt: "asc" }, take: 50 },
    invariantResults: { orderBy: { createdAt: "desc" }, take: 20 },
    coverageSummaries: { orderBy: { createdAt: "desc" }, take: 5 },
    artifacts: { orderBy: { createdAt: "desc" }, take: 30 }
  } satisfies Prisma.FuzzRunInclude;
}

function scanFuzzInclude() {
  return {
    buildProfiles: { orderBy: { createdAt: "desc" }, take: 10 },
    buildRuns: { orderBy: { startedAt: "desc" }, take: 10 },
    compilerArtifacts: { orderBy: [{ createdAt: "desc" }, { artifactPath: "asc" }], take: 50 },
    testRuns: { orderBy: { startedAt: "desc" }, take: 20 },
    contractSymbols: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 50 },
    functionSymbols: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 80 },
    stateVariableSymbols: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 80 },
    externalCallSites: { orderBy: [{ filePath: "asc" }, { startLine: "asc" }], take: 80 },
    storageLayoutEntries: { orderBy: [{ contractName: "asc" }, { slot: "asc" }], take: 80 },
    simulationRuns: { orderBy: { createdAt: "desc" }, take: 5 }
  } satisfies Prisma.ScanInclude;
}

function artifactData(
  input: { runId: string; organizationId: string | null; projectId: string | null; scanId: string; findingId?: string | null | undefined },
  artifactType: string,
  artifact: StoredFuzzArtifact
) {
  return {
    fuzzRunId: input.runId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    scanId: input.scanId,
    findingId: input.findingId ?? null,
    artifactType,
    artifactPath: artifact.artifactKey,
    checksumSha256: artifact.checksum,
    sizeBytes: artifact.sizeBytes,
    redacted: true
  };
}

function initialFuzzStatusCounts(): Record<FuzzRunStatus, number> {
  return {
    QUEUED: 0,
    RUNNING: 0,
    PASSED: 0,
    FAILED: 0,
    TIMEOUT: 0,
    TOOL_NOT_INSTALLED: 0,
    NOT_ASSESSED: 0,
    NOT_ELIGIBLE: 0,
    INCONCLUSIVE: 0
  };
}

function initialInvariantStatusCounts(): Record<InvariantStatus, number> {
  return {
    PASSED: 0,
    FAILED: 0,
    INCONCLUSIVE: 0,
    NOT_ASSESSED: 0
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))) as Prisma.InputJsonValue;
}
