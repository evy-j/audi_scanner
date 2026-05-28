import type { Prisma, SimulationKind, SimulationSafetyLevel, SimulationStatus } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { redactSecrets } from "../remediation/redaction.js";
import type { SimulationFindingContext, SimulationPlan, SimulationEligibilityResult } from "./simulation-plan-builder.js";
import type { StoredSimulationArtifact } from "./simulation-artifact-store.js";
import type { SimulationDecisionResult } from "./decision.js";

export interface CreateSimulationRunInput {
  organizationId: string | null;
  projectId: string | null;
  scanId: string;
  findingId: string;
  status: SimulationStatus;
  kind: SimulationKind;
  safetyLevel: SimulationSafetyLevel;
  decision?: SimulationStatus | undefined;
  forkChainId?: number | null | undefined;
  forkBlockNumber?: bigint | null | undefined;
  rpcProviderName?: string | null | undefined;
  commandExecuted?: string | null | undefined;
  inputEvidenceChecksum?: string | null | undefined;
  notEligibleReason?: string | null | undefined;
  errorCategory?: string | null | undefined;
  error?: string | null | undefined;
  startedAt?: Date | null | undefined;
  finishedAt?: Date | null | undefined;
  durationMs?: number | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PersistSimulationPlanInput {
  runId: string;
  organizationId: string | null;
  projectId: string | null;
  scanId: string;
  findingId: string;
  plan: SimulationPlan;
  planArtifact: StoredSimulationArtifact;
  eligibility: SimulationEligibilityResult;
  artifacts?: Array<{ artifactType: string; artifact: StoredSimulationArtifact }> | undefined;
}

export interface CompleteSimulationInput {
  runId: string;
  startedAt: Date;
  status: SimulationStatus;
  decision: SimulationDecisionResult;
  stdoutArtifact?: StoredSimulationArtifact | null | undefined;
  stderrArtifact?: StoredSimulationArtifact | null | undefined;
  traceArtifact?: StoredSimulationArtifact | null | undefined;
  assetDeltas?: Array<{
    assetType: string;
    assetAddress?: string | null | undefined;
    accountAddress?: string | null | undefined;
    delta: string;
    unit?: string | null | undefined;
    direction?: string | null | undefined;
    summary?: string | null | undefined;
  }> | undefined;
  commandExecuted?: string | null | undefined;
  errorCategory?: string | null | undefined;
  error?: string | null | undefined;
}

export class SimulationRepository {
  async findingContext(findingId: string, organizationId: string): Promise<SimulationFindingContext | null> {
    const finding = await prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null, scan: { organizationId, deletedAt: null } },
      include: {
        review: true,
        scan: {
          include: {
            targets: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
            buildRuns: { orderBy: { startedAt: "desc" }, take: 10 },
            compilerArtifacts: { orderBy: [{ createdAt: "desc" }, { artifactPath: "asc" }], take: 40 },
            testRuns: { orderBy: { startedAt: "desc" }, take: 10 }
          }
        },
        evidenceItems: {
          orderBy: { createdAt: "asc" },
          include: { analyzerRun: true }
        },
        codeLinks: {
          orderBy: { createdAt: "asc" },
          include: {
            contractSymbol: true,
            functionSymbol: true,
            externalCallSite: true,
            storageLayoutEntry: true
          }
        },
        aiFindingValidations: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        remediationRuns: {
          orderBy: { createdAt: "desc" },
          take: 2,
          include: { suggestions: { orderBy: { createdAt: "asc" }, take: 2 } }
        }
      }
    });

    return finding as unknown as SimulationFindingContext | null;
  }

  async findingSimulations(findingId: string, organizationId: string) {
    const finding = await prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null, scan: { organizationId, deletedAt: null } },
      select: { id: true, scanId: true, scan: { select: { organizationId: true, projectId: true } } }
    });
    if (!finding) return null;

    const runs = await prisma.simulationRun.findMany({
      where: { findingId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: simulationRunInclude()
    });

    return {
      findingId,
      scanId: finding.scanId,
      organizationId: finding.scan.organizationId,
      projectId: finding.scan.projectId,
      status: runs[0]?.status ?? "NOT_ASSESSED",
      decision: runs[0]?.decision ?? "NOT_ASSESSED",
      runs
    };
  }

  async scanSummary(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!scan) return null;

    const runs = await prisma.simulationRun.findMany({
      where: { scanId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: simulationRunInclude()
    });
    const statusCounts = initialStatusCounts();
    const decisionCounts = initialStatusCounts();
    for (const run of runs) {
      statusCounts[run.status] += 1;
      decisionCounts[run.decision] += 1;
    }

    return {
      scanId,
      organizationId,
      projectId: scan.projectId,
      simulationCount: runs.length,
      status: runs[0]?.status ?? "NOT_ASSESSED",
      decision: runs[0]?.decision ?? "NOT_ASSESSED",
      statusCounts,
      decisionCounts,
      runs
    };
  }

  createRun(input: CreateSimulationRunInput) {
    return prisma.simulationRun.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        findingId: input.findingId,
        status: input.status,
        kind: input.kind,
        safetyLevel: input.safetyLevel,
        decision: input.decision ?? "NOT_ASSESSED",
        forkChainId: input.forkChainId ?? null,
        forkBlockNumber: input.forkBlockNumber ?? null,
        rpcProviderName: input.rpcProviderName ?? null,
        commandExecuted: input.commandExecuted ? redactSecrets(input.commandExecuted) : null,
        inputEvidenceChecksum: input.inputEvidenceChecksum ?? null,
        notEligibleReason: input.notEligibleReason ? redactSecrets(input.notEligibleReason) : null,
        errorCategory: input.errorCategory ?? null,
        error: input.error ? redactSecrets(input.error).slice(0, 2_000) : null,
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null,
        durationMs: input.durationMs ?? null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      },
      include: simulationRunInclude()
    });
  }

  async persistPlan(input: PersistSimulationPlanInput) {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.simulationPlan.create({
        data: {
          simulationRunId: input.runId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: input.findingId,
          kind: input.plan.kind,
          planVersion: input.plan.version,
          title: input.plan.title,
          summary: input.plan.summary,
          assumptions: input.plan.assumptions,
          limitations: input.plan.limitations,
          commandPreview: input.plan.commandPreview,
          planArtifactPath: input.planArtifact.artifactKey,
          planChecksumSha256: input.planArtifact.checksum,
          metadata: toJsonValue({
            executable: input.plan.executable,
            unsupportedReason: input.plan.unsupportedReason,
            source: input.plan.source
          })
        }
      });

      await tx.simulationEligibility.create({
        data: {
          simulationRunId: input.runId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: input.findingId,
          eligible: input.eligibility.eligible,
          status: input.eligibility.eligible ? "SUCCEEDED" : "NOT_ELIGIBLE",
          reason: input.eligibility.reason,
          safetyLevel: input.eligibility.safetyLevel,
          toolAvailability: toJsonValue(input.eligibility.toolAvailability),
          limitations: input.eligibility.limitations
        }
      });

      for (const [index, step] of input.plan.steps.entries()) {
        await tx.simulationStep.create({
          data: {
            simulationRunId: input.runId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId,
            sortOrder: index + 1,
            title: step.title,
            description: step.description,
            expectedSignal: step.expectedSignal,
            status: "NOT_ASSESSED"
          }
        });
      }

      await tx.simulationArtifact.create({
        data: artifactData(input, "PLAN_JSON", input.planArtifact)
      });
      for (const artifact of input.artifacts ?? []) {
        await tx.simulationArtifact.create({
          data: artifactData(input, artifact.artifactType, artifact.artifact)
        });
      }

      return plan;
    });
  }

  async completeRun(input: CompleteSimulationInput) {
    const run = await prisma.simulationRun.findUniqueOrThrow({
      where: { id: input.runId },
      select: { id: true, organizationId: true, projectId: true, scanId: true, findingId: true }
    });

    return prisma.$transaction(async (tx) => {
      const artifactIds: string[] = [];
      for (const artifact of [
        input.stdoutArtifact ? { type: "STDOUT", artifact: input.stdoutArtifact } : null,
        input.stderrArtifact ? { type: "STDERR", artifact: input.stderrArtifact } : null,
        input.traceArtifact ? { type: "TRACE", artifact: input.traceArtifact } : null
      ].filter(Boolean) as Array<{ type: string; artifact: StoredSimulationArtifact }>) {
        const created = await tx.simulationArtifact.create({
          data: artifactData({ ...run, runId: run.id }, artifact.type, artifact.artifact)
        });
        artifactIds.push(created.id);
      }

      if (input.traceArtifact) {
        await tx.simulationTrace.create({
          data: {
            simulationRunId: run.id,
            organizationId: run.organizationId,
            projectId: run.projectId,
            scanId: run.scanId,
            findingId: run.findingId,
            traceKind: "LOCAL_FORK",
            artifactPath: input.traceArtifact.artifactKey,
            checksumSha256: input.traceArtifact.checksum,
            summary: "Local fork trace artifact captured from simulation runner."
          }
        });
      }

      for (const delta of input.assetDeltas ?? []) {
        await tx.simulationAssetDelta.create({
          data: {
            simulationRunId: run.id,
            organizationId: run.organizationId,
            projectId: run.projectId,
            scanId: run.scanId,
            findingId: run.findingId,
            assetType: delta.assetType,
            assetAddress: delta.assetAddress ?? null,
            accountAddress: delta.accountAddress ?? null,
            delta: delta.delta,
            unit: delta.unit ?? null,
            direction: delta.direction ?? null,
            summary: delta.summary ?? null
          }
        });
      }

      await tx.simulationDecision.create({
        data: {
          simulationRunId: run.id,
          organizationId: run.organizationId,
          projectId: run.projectId,
          scanId: run.scanId,
          findingId: run.findingId,
          decision: input.decision.decision,
          rationale: input.decision.rationale,
          evidenceArtifactIds: artifactIds,
          suggestedConfidenceAdjustment: input.decision.suggestedConfidenceAdjustment
        }
      });

      return tx.simulationRun.update({
        where: { id: run.id },
        data: {
          status: input.status,
          decision: input.decision.decision,
          commandExecuted: input.commandExecuted ? redactSecrets(input.commandExecuted) : null,
          stdoutArtifactPath: input.stdoutArtifact?.artifactKey ?? null,
          stdoutChecksumSha256: input.stdoutArtifact?.checksum ?? null,
          stderrArtifactPath: input.stderrArtifact?.artifactKey ?? null,
          stderrChecksumSha256: input.stderrArtifact?.checksum ?? null,
          traceArtifactPath: input.traceArtifact?.artifactKey ?? null,
          traceChecksumSha256: input.traceArtifact?.checksum ?? null,
          assetDeltaSummary: toJsonValue({
            count: input.assetDeltas?.length ?? 0,
            deltas: input.assetDeltas ?? []
          }),
          errorCategory: input.errorCategory ?? null,
          error: input.error ? redactSecrets(input.error).slice(0, 2_000) : null,
          suggestedConfidenceAdjustment: input.decision.suggestedConfidenceAdjustment,
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - input.startedAt.getTime())
        },
        include: simulationRunInclude()
      });
    });
  }

  getRun(simulationId: string, organizationId: string) {
    return prisma.simulationRun.findFirst({
      where: { id: simulationId, scan: { organizationId, deletedAt: null } },
      include: simulationRunInclude()
    });
  }

  async artifacts(simulationId: string, organizationId: string) {
    const run = await this.getRun(simulationId, organizationId);
    if (!run) return null;
    return {
      simulationId,
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
        action: "SIMULATION_RUN",
        resource: "SIMULATION",
        resourceId: input.resourceId,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }
}

export function simulationRunInclude() {
  return {
    plans: { orderBy: { createdAt: "desc" }, take: 5 },
    steps: { orderBy: { sortOrder: "asc" } },
    traces: { orderBy: { createdAt: "desc" }, take: 10 },
    assetDeltas: { orderBy: { createdAt: "desc" }, take: 20 },
    eligibilityRecords: { orderBy: { createdAt: "desc" }, take: 5 },
    artifacts: { orderBy: { createdAt: "desc" }, take: 20 },
    decisions: { orderBy: { createdAt: "desc" }, take: 5 }
  } satisfies Prisma.SimulationRunInclude;
}

function artifactData(
  input: { runId: string; organizationId: string | null; projectId: string | null; scanId: string; findingId: string },
  artifactType: string,
  artifact: StoredSimulationArtifact
) {
  return {
    simulationRunId: input.runId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    scanId: input.scanId,
    findingId: input.findingId,
    artifactType,
    artifactPath: artifact.artifactKey,
    checksumSha256: artifact.checksum,
    sizeBytes: artifact.sizeBytes,
    redacted: true
  };
}

function initialStatusCounts(): Record<SimulationStatus, number> {
  return {
    QUEUED: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    TIMEOUT: 0,
    TOOL_NOT_INSTALLED: 0,
    PROVIDER_NOT_CONFIGURED: 0,
    NOT_ASSESSED: 0,
    NOT_ELIGIBLE: 0,
    REPRODUCED: 0,
    NOT_REPRODUCED: 0,
    INCONCLUSIVE: 0
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
