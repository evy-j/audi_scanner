import { z } from "zod";
import { env } from "../../../config/environment.js";
import { logger } from "../../../common/logger.js";
import type {
  AiFindingEnrichment,
  AiReportEnrichment,
  AuditReportDocument
} from "../report-types.js";
import {
  AUDIT_REPORT_PROMPT_VERSION,
  buildAuditReportSystemPrompt,
  buildAuditReportUserPrompt
} from "../prompts/audit-report.prompt.js";
import type { AiJsonProvider } from "./ai-provider.js";

const aiFindingEnrichmentSchema = z.object({
  findingId: z.string().min(1),
  attackExplanation: z.string().min(1).max(3000).optional(),
  remediation: z.string().min(1).max(3000).optional(),
  secureCodeExample: z.string().min(1).max(3000).optional(),
  secureCodeNotes: z.string().min(1).max(1000).optional()
});

const aiReportEnrichmentSchema = z.object({
  executiveSummary: z.string().min(1).max(3000).optional(),
  severityNarrative: z.string().min(1).max(2000).optional(),
  recommendations: z.array(z.string().min(1).max(300)).max(12).optional(),
  findings: z.array(aiFindingEnrichmentSchema).max(env.AI_REPORT_MAX_INPUT_FINDINGS).optional()
});

export class AiReportPromptOrchestrator {
  constructor(private readonly provider: AiJsonProvider) {}

  async enrich(report: AuditReportDocument, signal?: AbortSignal): Promise<AuditReportDocument> {
    if (this.provider.providerName === "disabled") {
      return report;
    }

    try {
      const enrichment = await this.requestEnrichment(report, signal);
      return mergeEnrichment(report, enrichment, {
        provider: this.provider.providerName,
        model: this.provider.model
      });
    } catch (error) {
      logger.warn(
        {
          err: error,
          scanId: report.scanId,
          reportNumber: report.reportNumber,
          provider: this.provider.providerName
        },
        "AI report enrichment failed; continuing with deterministic report"
      );
      return report;
    }
  }

  private async requestEnrichment(
    report: AuditReportDocument,
    signal?: AbortSignal
  ): Promise<AiReportEnrichment> {
    const raw = await this.provider.generateJson({
      systemPrompt: buildAuditReportSystemPrompt(),
      userPrompt: buildAuditReportUserPrompt(report, env.AI_REPORT_MAX_INPUT_FINDINGS),
      schemaName: "AuditReportEnrichment",
      ...(signal ? { signal } : {})
    });
    const parsed = aiReportEnrichmentSchema.safeParse(raw);

    if (!parsed.success) {
      throw new Error(`AI report enrichment schema validation failed: ${parsed.error.message}`);
    }

    // Zod validates `findingId` at runtime, but this workspace's strict
    // optional-property settings can infer parsed output too loosely during
    // Render's worker build. Return the validated value as the report
    // enrichment contract after successful schema validation.
    return parsed.data as AiReportEnrichment;
  }
}

function mergeEnrichment(
  report: AuditReportDocument,
  enrichment: AiReportEnrichment,
  metadata: { provider: string; model?: string | undefined }
): AuditReportDocument {
  const knownFindingIds = new Set(report.findings.map((finding) => finding.id));
  const enrichmentByFindingId = new Map<string, AiFindingEnrichment>();

  for (const finding of enrichment.findings ?? []) {
    if (knownFindingIds.has(finding.findingId)) {
      enrichmentByFindingId.set(finding.findingId, finding);
    }
  }

  return {
    ...report,
    executiveSummary: enrichment.executiveSummary ?? report.executiveSummary,
    severityAnalysis: {
      ...report.severityAnalysis,
      narrative: enrichment.severityNarrative ?? report.severityAnalysis.narrative
    },
    recommendations:
      enrichment.recommendations && enrichment.recommendations.length > 0
        ? Array.from(new Set([...enrichment.recommendations, ...report.recommendations]))
        : report.recommendations,
    findings: report.findings.map((finding) => {
      const enriched = enrichmentByFindingId.get(finding.id);
      if (!enriched) {
        return finding;
      }

      return {
        ...finding,
        attackExplanation: enriched.attackExplanation ?? finding.attackExplanation,
        remediation: enriched.remediation ?? finding.remediation,
        secureCodeExample: {
          ...finding.secureCodeExample,
          code: enriched.secureCodeExample ?? finding.secureCodeExample.code,
          notes: enriched.secureCodeNotes ?? finding.secureCodeExample.notes
        }
      };
    }),
    ai: {
      provider: metadata.provider,
      ...(metadata.model ? { model: metadata.model } : {}),
      used: true,
      generatedAt: new Date().toISOString(),
      promptVersion: AUDIT_REPORT_PROMPT_VERSION
    }
  };
}
