import type { PatchSafetyStatus, Prisma, RemediationStatus } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import type { RemediationOutput } from "./remediation-prompt.js";
import { redactSecrets } from "./redaction.js";

export interface CreateRemediationRunInput {
  organizationId: string | null;
  projectId: string | null;
  scanId: string;
  findingId: string;
  provider: string;
  model: string | null;
  promptVersion: string;
  status: RemediationStatus;
  safetyStatus?: PatchSafetyStatus | undefined;
  inputArtifactPath?: string | null | undefined;
  inputEvidenceChecksum?: string | null | undefined;
  startedAt?: Date | null | undefined;
  finishedAt?: Date | null | undefined;
  durationMs?: number | null | undefined;
  errorCategory?: string | null | undefined;
  error?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PersistRemediationOutputInput {
  runId: string;
  organizationId: string | null;
  projectId: string | null;
  scanId: string;
  findingId: string;
  output: RemediationOutput;
  allowDiffs: boolean;
  startedAt: Date;
  outputArtifactPath: string | null;
  outputArtifactChecksumSha256: string | null;
  usage?: {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    costEstimate?: number | undefined;
    currency?: string | undefined;
  } | undefined;
}

export class RemediationRepository {
  async findingRemediation(findingId: string, organizationId: string) {
    const finding = await prisma.vulnerability.findFirst({
      where: { id: findingId, deletedAt: null, scan: { organizationId, deletedAt: null } },
      select: { id: true, scanId: true }
    });
    if (!finding) {
      return null;
    }

    const runs = await prisma.remediationRun.findMany({
      where: { findingId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: remediationRunInclude()
    });

    return {
      findingId,
      scanId: finding.scanId,
      organizationId,
      status: runs[0]?.status ?? "NOT_ASSESSED",
      runs
    };
  }

  async scanSummary(scanId: string, organizationId: string) {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!scan) {
      return null;
    }

    const runs = await prisma.remediationRun.findMany({
      where: { scanId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: remediationRunInclude()
    });

    const statusCounts = initialStatusCounts();
    for (const run of runs) {
      statusCounts[run.status] += 1;
    }

    return {
      scanId,
      organizationId,
      projectId: scan.projectId,
      remediationCount: runs.length,
      status: runs[0]?.status ?? "NOT_ASSESSED",
      statusCounts,
      runs
    };
  }

  createRun(input: CreateRemediationRunInput) {
    return prisma.remediationRun.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        findingId: input.findingId,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        status: input.status,
        safetyStatus: input.safetyStatus ?? "NOT_ASSESSED",
        inputArtifactPath: input.inputArtifactPath ?? null,
        inputEvidenceChecksum: input.inputEvidenceChecksum ?? null,
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null,
        durationMs: input.durationMs ?? null,
        errorCategory: input.errorCategory ?? null,
        error: input.error ? redactSecrets(input.error).slice(0, 2_000) : null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }

  failRun(
    runId: string,
    startedAt: Date,
    input: {
      status: RemediationStatus;
      errorCategory: string;
      error: string;
      outputArtifactPath?: string | null | undefined;
      outputArtifactChecksumSha256?: string | null | undefined;
    }
  ) {
    return prisma.remediationRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        finishedAt: new Date(),
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        errorCategory: input.errorCategory,
        error: redactSecrets(input.error).slice(0, 2_000),
        outputArtifactPath: input.outputArtifactPath ?? null,
        outputArtifactChecksumSha256: input.outputArtifactChecksumSha256 ?? null
      }
    });
  }

  async persistOutput(input: PersistRemediationOutputInput) {
    const output = input.output;
    const diffs = input.allowDiffs ? output.diffs : [];
    const kind = diffs.length > 0 ? "SECURE_DIFF_SUGGESTION" : "GUIDANCE";

    return prisma.$transaction(async (tx) => {
      const suggestion = await tx.remediationSuggestion.create({
        data: {
          remediationRunId: input.runId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: input.findingId,
          kind: "GUIDANCE",
          safetyStatus: output.safetyStatus,
          title: output.guidance.title,
          body: guidanceBody(output),
          behaviorChangeNotes: output.behaviorChangeNotes,
          limitations: output.guidance.limitations,
          requiresHumanReview: true,
          metadata: toJsonValue({ steps: output.guidance.steps })
        }
      });

      for (const diff of diffs) {
        await tx.remediationDiff.create({
          data: {
            remediationRunId: input.runId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId,
            safetyStatus: output.safetyStatus,
            filePath: diff.filePath,
            originalStartLine: diff.originalRange.startLine,
            originalEndLine: diff.originalRange.endLine,
            originalStartColumn: diff.originalRange.startColumn ?? null,
            originalEndColumn: diff.originalRange.endColumn ?? null,
            proposedPatch: diff.proposedPatch,
            explanation: diff.explanation,
            risk: diff.risk,
            behaviorChangeNotes: diff.behaviorChangeNotes,
            requiresHumanReview: true
          }
        });
      }

      for (const test of output.tests) {
        await tx.remediationTestSuggestion.create({
          data: {
            remediationRunId: input.runId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId,
            kind: "TEST_SUGGESTION",
            title: test.title,
            testFramework: test.testFramework,
            description: test.description,
            skeleton: test.skeleton ?? null,
            expectedFailingBefore: test.expectedFailingBefore,
            expectedFixedAfter: test.expectedFixedAfter,
            requiresHumanReview: true
          }
        });
      }

      for (const item of output.checklist) {
        await tx.remediationChecklistItem.create({
          data: {
            remediationRunId: input.runId,
            organizationId: input.organizationId,
            projectId: input.projectId,
            scanId: input.scanId,
            findingId: input.findingId,
            kind: "REGRESSION_CHECKLIST",
            item,
            requiresHumanReview: true
          }
        });
      }

      return tx.remediationRun.update({
        where: { id: input.runId },
        data: {
          status: "SUCCEEDED",
          kind,
          safetyStatus: output.safetyStatus,
          outputArtifactPath: input.outputArtifactPath,
          outputArtifactChecksumSha256: input.outputArtifactChecksumSha256,
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - input.startedAt.getTime()),
          inputTokens: input.usage?.inputTokens ?? null,
          outputTokens: input.usage?.outputTokens ?? null,
          totalTokens: input.usage?.totalTokens ?? null,
          costEstimate: input.usage?.costEstimate ?? null,
          currency: input.usage?.currency ?? null,
          metadata: toJsonValue({
            guidanceSuggestionId: suggestion.id,
            diffCount: diffs.length,
            diffSuggestionsSuppressed: !input.allowDiffs && output.diffs.length > 0
          })
        },
        include: remediationRunInclude()
      });
    });
  }

  async runForReview(remediationId: string, organizationId: string) {
    return prisma.remediationRun.findFirst({
      where: {
        id: remediationId,
        scan: { organizationId, deletedAt: null }
      },
      include: remediationRunInclude()
    });
  }

  async createReviewEvent(input: {
    remediationId: string;
    organizationId: string | null;
    projectId: string | null;
    scanId: string;
    findingId: string;
    actorUserId?: string | undefined;
    action: string;
    previousValue?: Record<string, unknown> | null | undefined;
    newValue?: Record<string, unknown> | null | undefined;
    comment?: string | undefined;
  }) {
    return prisma.remediationReviewEvent.create({
      data: {
        remediationRunId: input.remediationId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        findingId: input.findingId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        ...(input.previousValue ? { previousValue: toJsonValue(input.previousValue) } : {}),
        ...(input.newValue ? { newValue: toJsonValue(input.newValue) } : {}),
        comment: input.comment ? redactSecrets(input.comment) : null
      }
    });
  }

  async markReviewed(remediationId: string, actorUserId?: string | undefined) {
    return prisma.remediationRun.update({
      where: { id: remediationId },
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId ?? null
      },
      include: remediationRunInclude()
    });
  }

  async reject(remediationId: string, actorUserId?: string | undefined) {
    return prisma.remediationRun.update({
      where: { id: remediationId },
      data: {
        rejectedAt: new Date(),
        rejectedByUserId: actorUserId ?? null,
        safetyStatus: "UNSAFE"
      },
      include: remediationRunInclude()
    });
  }
}

function remediationRunInclude() {
  return {
    suggestions: { orderBy: { createdAt: "asc" } },
    diffs: { orderBy: { createdAt: "asc" } },
    testSuggestions: { orderBy: { createdAt: "asc" } },
    checklistItems: { orderBy: { createdAt: "asc" } },
    reviewEvents: { orderBy: { createdAt: "desc" }, take: 50 }
  } satisfies Prisma.RemediationRunInclude;
}

function guidanceBody(output: RemediationOutput): string {
  return [
    output.guidance.summary,
    "",
    "Steps:",
    ...output.guidance.steps.map((step) => `- ${step}`),
    "",
    "Limitations:",
    ...output.guidance.limitations.map((limitation) => `- ${limitation}`)
  ].join("\n");
}

function initialStatusCounts(): Record<RemediationStatus, number> {
  return {
    QUEUED: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    TIMEOUT: 0,
    PROVIDER_NOT_CONFIGURED: 0,
    NOT_ELIGIBLE: 0,
    NOT_ASSESSED: 0
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
