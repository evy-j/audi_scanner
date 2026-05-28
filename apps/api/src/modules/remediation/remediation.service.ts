import { z } from "zod";
import { ApiError } from "../../common/errors/api-error.js";
import {
  LocalRemediationArtifactStore,
  remediationArtifactPrefix,
  type RemediationArtifactStore
} from "./artifact-store.js";
import { RemediationPackBuilder } from "./remediation-pack-builder.js";
import {
  buildRemediationPrompt,
  parseRemediationOutput,
  REMEDIATION_PROMPT_VERSION,
  sanitizeRemediationOutput
} from "./remediation-prompt.js";
import {
  createRemediationProvider,
  ProviderNotConfiguredError,
  type RemediationProvider
} from "./provider.js";
import { RemediationRepository } from "./remediation.repository.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";

export interface RemediationActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export class RemediationService {
  constructor(
    private readonly repository = new RemediationRepository(),
    private readonly packBuilder = new RemediationPackBuilder(),
    private readonly provider: RemediationProvider = createRemediationProvider(),
    private readonly artifactStore: RemediationArtifactStore = new LocalRemediationArtifactStore(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async findingRemediation(findingId: string, organizationId: string) {
    const [remediation, builtPack] = await Promise.all([
      this.repository.findingRemediation(findingId, organizationId),
      this.packBuilder.buildFindingPack(findingId, organizationId)
    ]);
    if (!remediation || !builtPack) {
      throw ApiError.notFound("Finding");
    }

    return {
      provider: this.providerState(),
      eligibility: builtPack.pack.eligibility,
      diffSuggestionsAllowed: builtPack.pack.diffSuggestionsAllowed,
      limitations: builtPack.pack.limitations,
      ...remediation
    };
  }

  async scanSummary(scanId: string, organizationId: string) {
    const summary = await this.repository.scanSummary(scanId, organizationId);
    if (!summary) {
      throw ApiError.notFound("Scan");
    }
    return {
      provider: this.providerState(),
      ...summary
    };
  }

  async remediateFinding(findingId: string, actor: RemediationActor) {
    const built = await this.packBuilder.buildFindingPack(findingId, actor.organizationId);
    if (!built) {
      throw ApiError.notFound("Finding");
    }
    await this.usageLimits.assertAndConsume(actor.organizationId, "REMEDIATION_RUNS_PER_MONTH", {
      resourceType: "FINDING",
      resourceId: findingId
    });

    const startedAt = new Date();
    const baseRun = {
      organizationId: built.pack.scan.organizationId,
      projectId: built.pack.scan.projectId,
      scanId: built.pack.scan.id,
      findingId: built.pack.finding.id,
      provider: this.provider.providerName,
      model: this.provider.model ?? null,
      promptVersion: REMEDIATION_PROMPT_VERSION,
      inputEvidenceChecksum: built.checksum,
      startedAt,
      metadata: {
        remediationPackVersion: built.pack.version,
        diffSuggestionsAllowed: built.pack.diffSuggestionsAllowed,
        requestedByUserId: actor.actorUserId ?? null
      }
    };

    if (!built.pack.eligibility.eligible) {
      const run = await this.repository.createRun({
        ...baseRun,
        status: "NOT_ELIGIBLE",
        safetyStatus: "NOT_ASSESSED",
        finishedAt: startedAt,
        durationMs: 0,
        errorCategory: "NOT_ELIGIBLE",
        error: built.pack.eligibility.reason ?? "Finding is not eligible for remediation"
      });
      return {
        enqueued: false,
        ran: false,
        status: "NOT_ELIGIBLE",
        reason: built.pack.eligibility.reason,
        remediationId: run.id,
        run
      };
    }

    if (!this.provider.isConfigured()) {
      const run = await this.repository.createRun({
        ...baseRun,
        status: "PROVIDER_NOT_CONFIGURED",
        safetyStatus: "NOT_ASSESSED",
        finishedAt: startedAt,
        durationMs: 0,
        errorCategory: "PROVIDER_NOT_CONFIGURED",
        error: "AI remediation provider is disabled or missing required configuration"
      });
      return {
        enqueued: false,
        ran: false,
        status: "PROVIDER_NOT_CONFIGURED",
        reason: "AI remediation provider is disabled or missing required configuration",
        remediationId: run.id,
        run
      };
    }

    const artifactPrefix = remediationArtifactPrefix(built.pack.scan.id, built.pack.finding.id);
    const inputArtifact = await this.artifactStore.writeJsonArtifact(
      artifactPrefix,
      "input-remediation-pack.json",
      built.pack
    );
    const run = await this.repository.createRun({
      ...baseRun,
      status: "RUNNING",
      inputArtifactPath: inputArtifact.artifactKey
    });

    try {
      const prompts = buildRemediationPrompt(built.pack);
      const providerResult = await this.provider.generateJson({
        ...prompts,
        schemaName: "P5Remediation"
      });
      const parsed = parseRemediationOutput(providerResult.json);
      const sanitized = sanitizeRemediationOutput(parsed);
      const outputArtifact = await this.artifactStore.writeJsonArtifact(
        artifactPrefix,
        "output-remediation.json",
        sanitized
      );
      const persistedRun = await this.repository.persistOutput({
        runId: run.id,
        organizationId: built.pack.scan.organizationId,
        projectId: built.pack.scan.projectId,
        scanId: built.pack.scan.id,
        findingId: built.pack.finding.id,
        output: sanitized,
        allowDiffs: built.pack.diffSuggestionsAllowed,
        startedAt,
        outputArtifactPath: outputArtifact.artifactKey,
        outputArtifactChecksumSha256: outputArtifact.checksum,
        usage: providerResult.usage
      });

      return {
        enqueued: false,
        ran: true,
        status: persistedRun.status,
        remediationId: persistedRun.id,
        run: persistedRun
      };
    } catch (error) {
      const failed = await this.repository.failRun(run.id, startedAt, {
        status: statusForError(error),
        errorCategory: errorCategory(error),
        error: errorMessage(error)
      });
      return {
        enqueued: false,
        ran: true,
        status: failed.status,
        remediationId: failed.id,
        errorCategory: failed.errorCategory,
        error: failed.error
      };
    }
  }

  async review(remediationId: string, actor: RemediationActor, input: { comment?: string | undefined }) {
    const run = await this.repository.runForReview(remediationId, actor.organizationId);
    if (!run) {
      throw ApiError.notFound("Remediation");
    }
    return this.repository.createReviewEvent({
      remediationId: run.id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      scanId: run.scanId,
      findingId: run.findingId,
      actorUserId: actor.actorUserId,
      action: "COMMENTED",
      newValue: { comment: input.comment ?? null },
      comment: input.comment
    });
  }

  async markReviewed(remediationId: string, actor: RemediationActor, input: { comment?: string | undefined }) {
    const run = await this.repository.runForReview(remediationId, actor.organizationId);
    if (!run) {
      throw ApiError.notFound("Remediation");
    }
    await this.repository.createReviewEvent({
      remediationId: run.id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      scanId: run.scanId,
      findingId: run.findingId,
      actorUserId: actor.actorUserId,
      action: "MARKED_REVIEWED",
      previousValue: { reviewedAt: run.reviewedAt },
      newValue: { reviewed: true },
      comment: input.comment
    });
    return this.repository.markReviewed(remediationId, actor.actorUserId);
  }

  async reject(remediationId: string, actor: RemediationActor, input: { reason?: string | undefined }) {
    const run = await this.repository.runForReview(remediationId, actor.organizationId);
    if (!run) {
      throw ApiError.notFound("Remediation");
    }
    await this.repository.createReviewEvent({
      remediationId: run.id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      scanId: run.scanId,
      findingId: run.findingId,
      actorUserId: actor.actorUserId,
      action: "REJECTED",
      previousValue: { safetyStatus: run.safetyStatus },
      newValue: { safetyStatus: "UNSAFE" },
      comment: input.reason
    });
    return this.repository.reject(remediationId, actor.actorUserId);
  }

  private providerState() {
    const configured = this.provider.isConfigured();
    return {
      configured,
      provider: this.provider.providerName,
      model: this.provider.model ?? null,
      status: configured ? "CONFIGURED" : "PROVIDER_NOT_CONFIGURED"
    };
  }
}

function statusForError(error: unknown) {
  if (error instanceof ProviderNotConfiguredError) {
    return "PROVIDER_NOT_CONFIGURED";
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "TIMEOUT";
  }
  if (error instanceof Error && /timeout|aborted|abort/i.test(error.message)) {
    return "TIMEOUT";
  }
  return "FAILED";
}

function errorCategory(error: unknown): string {
  if (error instanceof ProviderNotConfiguredError) {
    return "PROVIDER_NOT_CONFIGURED";
  }
  if (statusForError(error) === "TIMEOUT") {
    return "TIMEOUT";
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return "SCHEMA_VALIDATION";
  }
  return "PROVIDER_ERROR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
