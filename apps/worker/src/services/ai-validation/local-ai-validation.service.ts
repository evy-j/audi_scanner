import { randomBytes } from "node:crypto";
import { prisma } from "@audit-scanner/database";
import type { AiValidationDecision, AiValidationStatus, Prisma } from "@prisma/client";
import type { AiValidationJobData } from "@audit-scanner/shared/queues/scan-jobs";
import type { AiValidationResult, AiValidationService } from "../scan-services.js";
import { LocalScannerArtifactStore } from "../scan-execution/local-artifact-store.js";
import {
  AiEvidencePackBuilder,
  scopeToPrisma,
  type FindingEvidencePack,
  type ScanEvidencePack
} from "./evidence-pack-builder.js";
import {
  AI_VALIDATION_PROMPT_VERSION,
  buildFindingValidationPrompt,
  buildScanSummaryPrompt,
  parseAiFindingValidationOutput,
  parseAiScanSummaryOutput,
  type AiFindingValidationOutput,
  type AiScanSummaryOutput
} from "./prompt-builder.js";
import {
  createAiValidationProvider,
  ProviderNotConfiguredError,
  type AiValidationJsonResult,
  type AiValidationProvider,
  type AiValidationProviderUsage
} from "./provider.js";
import { redactSecrets } from "./redaction.js";

export class LocalAiValidationService implements AiValidationService {
  constructor(
    private readonly artifactStore = new LocalScannerArtifactStore(),
    private readonly evidencePackBuilder = new AiEvidencePackBuilder(),
    private readonly provider: AiValidationProvider = createAiValidationProvider()
  ) {}

  async validate(
    data: AiValidationJobData,
    signal?: AbortSignal
  ): Promise<AiValidationResult> {
    if (!this.provider.isConfigured()) {
      return this.persistProviderNotConfigured(data);
    }

    if (data.scope === "FINDING") {
      if (!data.findingId) {
        return this.persistNotAssessed(data, "Finding-level AI validation requires findingId");
      }
      return this.validateFinding(data, signal);
    }

    return this.validateScanSummary(data, signal);
  }

  private async validateFinding(
    data: AiValidationJobData,
    signal?: AbortSignal
  ): Promise<AiValidationResult> {
    const pack = await this.evidencePackBuilder.buildFindingPack(data.findingId!, data.organizationId);
    if (!pack) {
      return this.persistNotAssessed(data, "Finding was not found for this organization");
    }

    const run = await this.createRunningRun(data, pack, pack.finding.id);

    try {
      const prompts = buildFindingValidationPrompt(pack);
      const providerResult = await this.provider.generateJson({
        ...prompts,
        schemaName: "AiFindingValidation",
        ...(signal ? { signal } : {})
      });
      const parsed = parseAiFindingValidationOutput(providerResult.json);
      const output = await this.writeOutputArtifact(run.artifactPrefix, parsed);
      const validation = await this.persistFindingValidation(run.id, pack, parsed, providerResult);
      await this.finalizeRun(run.id, run.startedAt, {
        status: "SUCCEEDED",
        decision: parsed.decision,
        falsePositiveRisk: parsed.falsePositiveRisk,
        evidenceCoverageScore: parsed.evidenceCoverageScore,
        hallucinationRisk: parsed.hallucinationRisk,
        confidenceAdjustmentSuggestion: parsed.confidenceAdjustmentSuggestion,
        outputArtifactPath: output.artifactKey,
        outputArtifactChecksumSha256: output.checksum ?? undefined,
        metadata: {
          findingValidationId: validation.id,
          evidenceIdsUsed: parsed.evidenceIdsUsed
        }
      });
      await this.persistUsage(run.id, pack.scan, pack.finding.id, providerResult.usage);
      return {
        aiValidationRunId: run.id,
        status: "SUCCEEDED",
        scope: "FINDING",
        decision: parsed.decision
      };
    } catch (error) {
      return this.failRun(run.id, run.startedAt, data.scope, error);
    }
  }

  private async validateScanSummary(
    data: AiValidationJobData,
    signal?: AbortSignal
  ): Promise<AiValidationResult> {
    const pack = await this.evidencePackBuilder.buildScanSummaryPack(data.scanId, data.organizationId);
    if (!pack) {
      return this.persistNotAssessed(data, "Scan was not found for this organization");
    }

    const run = await this.createRunningRun(data, pack, null);

    try {
      const prompts = buildScanSummaryPrompt(pack);
      const providerResult = await this.provider.generateJson({
        ...prompts,
        schemaName: "AiScanSummary",
        ...(signal ? { signal } : {})
      });
      const parsed = parseAiScanSummaryOutput(providerResult.json);
      const output = await this.writeOutputArtifact(run.artifactPrefix, parsed);
      await this.persistScanSummaryNotes(run.id, pack, parsed);
      await this.finalizeRun(run.id, run.startedAt, {
        status: "SUCCEEDED",
        outputArtifactPath: output.artifactKey,
        outputArtifactChecksumSha256: output.checksum ?? undefined,
        metadata: {
          topEvidenceBackedRisks: parsed.topEvidenceBackedRisks.length,
          weakEvidenceFindings: parsed.weakEvidenceFindings.length,
          likelyFalsePositives: parsed.likelyFalsePositives.length
        }
      });
      await this.persistUsage(run.id, pack.scan, null, providerResult.usage);
      return {
        aiValidationRunId: run.id,
        status: "SUCCEEDED",
        scope: "SCAN_SUMMARY"
      };
    } catch (error) {
      return this.failRun(run.id, run.startedAt, data.scope, error);
    }
  }

  private async createRunningRun(
    data: AiValidationJobData,
    pack: FindingEvidencePack | ScanEvidencePack,
    findingId: string | null
  ): Promise<{ id: string; startedAt: Date; artifactPrefix: string }> {
    const startedAt = new Date();
    const artifactPrefix = artifactPrefixFor(data.scanId, data.scope);
    const input = await this.writeInputArtifact(artifactPrefix, pack);
    const record = await prisma.aiValidationRun.create({
      data: {
        organizationId: pack.scan.organizationId,
        projectId: pack.scan.projectId,
        scanId: pack.scan.id,
        findingId,
        provider: this.provider.providerName,
        model: this.provider.model ?? null,
        promptVersion: AI_VALIDATION_PROMPT_VERSION,
        scope: scopeToPrisma(data.scope),
        status: "RUNNING",
        inputArtifactKey: input.artifactKey,
        inputArtifactChecksum: input.checksum,
        startedAt,
        metadata: toJsonObject({
          traceId: data.traceId,
          correlationId: data.correlationId ?? null,
          evidencePackVersion: pack.version
        })
      }
    });

    return { id: record.id, startedAt, artifactPrefix };
  }

  private async persistFindingValidation(
    runId: string,
    pack: FindingEvidencePack,
    output: AiFindingValidationOutput,
    providerResult: AiValidationJsonResult
  ) {
    const validation = await prisma.aiFindingValidation.create({
      data: {
        aiValidationRunId: runId,
        organizationId: pack.scan.organizationId,
        projectId: pack.scan.projectId,
        scanId: pack.scan.id,
        findingId: pack.finding.id,
        decision: output.decision,
        reasoningSummary: redactSecrets(output.reasoningSummary),
        evidenceIdsUsed: output.evidenceIdsUsed,
        missingEvidence: output.missingEvidence.map(redactSecrets),
        contradictionNotes: output.contradictionNotes ? redactSecrets(output.contradictionNotes) : null,
        suggestedReviewStatus: output.suggestedReviewStatus ?? null,
        confidenceAdjustmentSuggestion: output.confidenceAdjustmentSuggestion ?? null,
        falsePositiveRisk: output.falsePositiveRisk,
        evidenceCoverageScore: output.evidenceCoverageScore,
        hallucinationRisk: output.hallucinationRisk,
        humanReviewerChecklist: output.humanReviewerChecklist.map(redactSecrets),
        remediationExplanation: output.remediationExplanation ? redactSecrets(output.remediationExplanation) : null,
        rawOutput: toJsonValue(providerResult.json)
      }
    });

    const evidenceIds = new Set(pack.p1Evidence.map((evidence) => evidence.id));
    for (const critique of output.evidenceCritiques) {
      if (!evidenceIds.has(critique.evidenceId)) {
        continue;
      }
      await prisma.aiEvidenceCritique.create({
        data: {
          aiValidationRunId: runId,
          aiFindingValidationId: validation.id,
          organizationId: pack.scan.organizationId,
          projectId: pack.scan.projectId,
          scanId: pack.scan.id,
          findingId: pack.finding.id,
          findingEvidenceId: critique.evidenceId,
          evidenceReference: critique.evidenceId,
          supportLevel: critique.supportLevel,
          critique: redactSecrets(critique.critique),
          missingContext: critique.missingContext ? redactSecrets(critique.missingContext) : null
        }
      });
    }

    await prisma.aiReviewNote.create({
      data: {
        aiValidationRunId: runId,
        organizationId: pack.scan.organizationId,
        projectId: pack.scan.projectId,
        scanId: pack.scan.id,
        findingId: pack.finding.id,
        scope: "REVIEW_ASSIST",
        noteType: "FINDING_VALIDATION",
        title: `AI validation: ${output.decision}`,
        body: redactSecrets(output.reasoningSummary),
        evidenceIdsUsed: output.evidenceIdsUsed,
        metadata: toJsonObject({
          missingEvidence: output.missingEvidence,
          contradictionNotes: output.contradictionNotes ?? null,
          humanReviewerChecklist: output.humanReviewerChecklist
        })
      }
    });

    return validation;
  }

  private async persistScanSummaryNotes(
    runId: string,
    pack: ScanEvidencePack,
    output: AiScanSummaryOutput
  ): Promise<void> {
    await prisma.aiReviewNote.create({
      data: {
        aiValidationRunId: runId,
        organizationId: pack.scan.organizationId,
        projectId: pack.scan.projectId,
        scanId: pack.scan.id,
        findingId: null,
        scope: "SCAN_SUMMARY",
        noteType: "SCAN_VALIDATION_SUMMARY",
        title: "AI validation scan summary",
        body: redactSecrets(
          [
            `Top evidence-backed risks: ${output.topEvidenceBackedRisks.length}`,
            `Weak evidence findings: ${output.weakEvidenceFindings.length}`,
            `Likely false positives: ${output.likelyFalsePositives.length}`,
            `Not Assessed areas: ${output.notAssessedAreas.join("; ") || "none listed"}`
          ].join("\n")
        ),
        evidenceIdsUsed: output.topEvidenceBackedRisks.flatMap((risk) => risk.evidenceIdsUsed),
        metadata: toJsonValue(output)
      }
    });
  }

  private async persistUsage(
    runId: string,
    scan: { id: string; organizationId: string; projectId: string | null },
    findingId: string | null,
    usage: AiValidationProviderUsage | undefined
  ): Promise<void> {
    if (!usage) {
      return;
    }
    await prisma.aiProviderUsage.create({
      data: {
        aiValidationRunId: runId,
        organizationId: scan.organizationId,
        projectId: scan.projectId,
        scanId: scan.id,
        findingId,
        provider: this.provider.providerName,
        model: this.provider.model ?? null,
        promptVersion: AI_VALIDATION_PROMPT_VERSION,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        costEstimate: usage.costEstimate ?? null,
        currency: usage.currency ?? null
      }
    });
  }

  private async persistProviderNotConfigured(data: AiValidationJobData): Promise<AiValidationResult> {
    const scan = await prisma.scan.findFirst({
      where: { id: data.scanId, organizationId: data.organizationId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!scan) {
      throw new Error("Scan was not found for this organization");
    }
    const startedAt = new Date();
    const run = await prisma.aiValidationRun.create({
      data: {
        organizationId: scan.organizationId,
        projectId: scan.projectId,
        scanId: scan.id,
        findingId: data.findingId ?? null,
        provider: this.provider.providerName,
        model: this.provider.model ?? null,
        promptVersion: AI_VALIDATION_PROMPT_VERSION,
        scope: scopeToPrisma(data.scope),
        status: "PROVIDER_NOT_CONFIGURED",
        startedAt,
        finishedAt: startedAt,
        durationMs: 0,
        errorCategory: "PROVIDER_NOT_CONFIGURED",
        error: "AI validation provider is disabled or missing required configuration",
        metadata: toJsonObject({ traceId: data.traceId, correlationId: data.correlationId ?? null })
      }
    });
    return {
      aiValidationRunId: run.id,
      status: "PROVIDER_NOT_CONFIGURED",
      scope: data.scope
    };
  }

  private async persistNotAssessed(
    data: AiValidationJobData,
    reason: string
  ): Promise<AiValidationResult> {
    const scan = await prisma.scan.findFirst({
      where: { id: data.scanId, organizationId: data.organizationId, deletedAt: null },
      select: { id: true, organizationId: true, projectId: true }
    });
    if (!scan) {
      throw new Error("Scan was not found for this organization");
    }
    const startedAt = new Date();
    const run = await prisma.aiValidationRun.create({
      data: {
        organizationId: scan.organizationId,
        projectId: scan.projectId,
        scanId: scan.id,
        findingId: data.findingId ?? null,
        provider: this.provider.providerName,
        model: this.provider.model ?? null,
        promptVersion: AI_VALIDATION_PROMPT_VERSION,
        scope: scopeToPrisma(data.scope),
        status: "NOT_ASSESSED",
        startedAt,
        finishedAt: startedAt,
        durationMs: 0,
        errorCategory: "NOT_ASSESSED",
        error: reason,
        metadata: toJsonObject({ traceId: data.traceId, correlationId: data.correlationId ?? null })
      }
    });
    return {
      aiValidationRunId: run.id,
      status: "NOT_ASSESSED",
      scope: data.scope
    };
  }

  private async failRun(
    runId: string,
    startedAt: Date,
    scope: "FINDING" | "SCAN_SUMMARY",
    error: unknown
  ): Promise<AiValidationResult> {
    const status = statusForError(error);
    await this.finalizeRun(runId, startedAt, {
      status,
      errorCategory: errorCategory(error),
      error: errorMessage(error)
    });
    return { aiValidationRunId: runId, status, scope };
  }

  private async finalizeRun(
    runId: string,
    startedAt: Date,
    input: {
      status: AiValidationStatus;
      decision?: AiValidationDecision | undefined;
      confidenceAdjustmentSuggestion?: number | undefined;
      falsePositiveRisk?: number | undefined;
      evidenceCoverageScore?: number | undefined;
      hallucinationRisk?: number | undefined;
      outputArtifactPath?: string | undefined;
      outputArtifactChecksumSha256?: string | undefined;
      errorCategory?: string | undefined;
      error?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
    }
  ) {
    return prisma.aiValidationRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        decision: input.decision ?? null,
        confidenceAdjustmentSuggestion: input.confidenceAdjustmentSuggestion ?? null,
        falsePositiveRisk: input.falsePositiveRisk ?? null,
        evidenceCoverageScore: input.evidenceCoverageScore ?? null,
        hallucinationRisk: input.hallucinationRisk ?? null,
        outputArtifactPath: input.outputArtifactPath ?? null,
        outputArtifactChecksumSha256: input.outputArtifactChecksumSha256 ?? null,
        finishedAt: new Date(),
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        errorCategory: input.errorCategory ?? null,
        error: input.error ? redactSecrets(input.error).slice(0, 2_000) : null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      }
    });
  }

  private async writeInputArtifact(
    artifactPrefix: string,
    pack: FindingEvidencePack | ScanEvidencePack
  ): Promise<{ artifactKey: string; checksum: string | null }> {
    const artifactKey = await this.artifactStore.writeJsonArtifact(artifactPrefix, "input-evidence-pack.json", pack);
    const metadata = await this.artifactStore.getArtifactMetadata(artifactKey);
    return { artifactKey, checksum: metadata?.sha256 ?? null };
  }

  private async writeOutputArtifact(
    artifactPrefix: string,
    output: AiFindingValidationOutput | AiScanSummaryOutput
  ): Promise<{ artifactKey: string; checksum: string | null }> {
    const artifactKey = await this.artifactStore.writeJsonArtifact(artifactPrefix, "output-validation.json", output);
    const metadata = await this.artifactStore.getArtifactMetadata(artifactKey);
    return { artifactKey, checksum: metadata?.sha256 ?? null };
  }
}

function artifactPrefixFor(scanId: string, scope: string): string {
  return `ai-validations/${scanId}/${scope.toLowerCase()}/${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function statusForError(error: unknown): AiValidationStatus {
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
  if (error instanceof Error && error.name === "ZodError") {
    return "SCHEMA_VALIDATION";
  }
  if (error instanceof SyntaxError) {
    return "SCHEMA_VALIDATION";
  }
  return "PROVIDER_ERROR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
