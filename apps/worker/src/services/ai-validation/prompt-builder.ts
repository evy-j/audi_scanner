import { z } from "zod";
import type { FindingEvidencePack, ScanEvidencePack } from "./evidence-pack-builder.js";

export const AI_VALIDATION_PROMPT_VERSION = "p4-ai-validation/v1";

const decisionSchema = z.enum([
  "EVIDENCE_STRONG",
  "EVIDENCE_MEDIUM",
  "EVIDENCE_WEAK",
  "LIKELY_FALSE_POSITIVE",
  "NEEDS_HUMAN_REVIEW",
  "CONTRADICTED",
  "NOT_ENOUGH_EVIDENCE"
]);

const reviewStatusSchema = z.enum([
  "UNREVIEWED",
  "NEEDS_REVIEW",
  "ACCEPTED",
  "FALSE_POSITIVE",
  "RISK_ACCEPTED",
  "FIXED",
  "WONT_FIX",
  "DUPLICATE",
  "SUPPRESSED"
]);

const evidenceCritiqueSchema = z
  .object({
    evidenceId: z.string().min(1),
    supportLevel: z.enum(["STRONG", "MEDIUM", "WEAK", "CONTRADICTORY", "IRRELEVANT"]),
    critique: z.string().min(1).max(1200),
    missingContext: z.string().min(1).max(1200).optional()
  })
  .strict();

export const aiFindingValidationOutputSchema = z
  .object({
    decision: decisionSchema,
    reasoningSummary: z.string().min(1).max(2500),
    evidenceIdsUsed: z.array(z.string().min(1)).max(50),
    missingEvidence: z.array(z.string().min(1).max(300)).max(20),
    contradictionNotes: z.string().min(1).max(2000).optional(),
    suggestedReviewStatus: reviewStatusSchema.optional(),
    confidenceAdjustmentSuggestion: z.number().min(-100).max(100).optional(),
    falsePositiveRisk: z.number().int().min(0).max(100),
    evidenceCoverageScore: z.number().int().min(0).max(100),
    hallucinationRisk: z.number().int().min(0).max(100),
    humanReviewerChecklist: z.array(z.string().min(1).max(300)).max(20),
    remediationExplanation: z.string().min(1).max(2500).optional(),
    evidenceCritiques: z.array(evidenceCritiqueSchema).max(50)
  })
  .strict();

export const aiScanSummaryOutputSchema = z
  .object({
    topEvidenceBackedRisks: z
      .array(
        z
          .object({
            findingId: z.string().min(1),
            title: z.string().min(1).max(240),
            reason: z.string().min(1).max(1200),
            evidenceIdsUsed: z.array(z.string().min(1)).max(20)
          })
          .strict()
      )
      .max(15),
    weakEvidenceFindings: z.array(z.string().min(1)).max(50),
    likelyFalsePositives: z.array(z.string().min(1)).max(50),
    missingAnalyzerCoverage: z.array(z.string().min(1).max(300)).max(20),
    buildTestLimitations: z.array(z.string().min(1).max(300)).max(20),
    notAssessedAreas: z.array(z.string().min(1).max(300)).max(20),
    recommendedHumanReviewOrder: z
      .array(
        z
          .object({
            findingId: z.string().min(1),
            reason: z.string().min(1).max(800)
          })
          .strict()
      )
      .max(50)
  })
  .strict();

export type AiFindingValidationOutput = z.infer<typeof aiFindingValidationOutputSchema>;
export type AiScanSummaryOutput = z.infer<typeof aiScanSummaryOutputSchema>;

export function parseAiFindingValidationOutput(value: unknown): AiFindingValidationOutput {
  return aiFindingValidationOutputSchema.parse(value);
}

export function parseAiScanSummaryOutput(value: unknown): AiScanSummaryOutput {
  return aiScanSummaryOutputSchema.parse(value);
}

export function buildFindingValidationPrompt(pack: FindingEvidencePack) {
  return {
    systemPrompt: baseSystemPrompt(),
    userPrompt: [
      "Validate exactly one existing persisted finding. Do not create a new vulnerability.",
      "Return structured JSON only with the AiFindingValidation schema.",
      "Every evidence-based claim must cite evidenceIdsUsed from p1Evidence.id and source ranges from the pack.",
      "Use NOT_ENOUGH_EVIDENCE when the persisted evidence does not prove the claim.",
      "Never claim CONFIRMED unless the pack contains simulation or formal proof, and this system currently does not provide that as AI proof.",
      "Do not output exploit instructions, live attack steps, payload recipes, or autonomous actions.",
      "Evidence pack:",
      JSON.stringify(pack, null, 2)
    ].join("\n\n")
  };
}

export function buildScanSummaryPrompt(pack: ScanEvidencePack) {
  return {
    systemPrompt: baseSystemPrompt(),
    userPrompt: [
      "Summarize scan-level validation context from persisted data only.",
      "Return structured JSON only with the AiScanSummary schema.",
      "Do not add findings. Do not invent analyzer coverage, compiler artifacts, source maps, traces, tests, or proof.",
      "Identify weak evidence, likely false positives, missing analyzer coverage, build/test limitations, Not Assessed areas, and human review order.",
      "Do not output exploit instructions, live attack steps, payload recipes, or autonomous actions.",
      "Evidence pack:",
      JSON.stringify(pack, null, 2)
    ].join("\n\n")
  };
}

function baseSystemPrompt(): string {
  return [
    "You are an AI evidence validator for a defensive smart-contract audit scanner.",
    "You must only validate, critique, summarize, and explain already-persisted evidence.",
    "You must not create new findings from AI alone.",
    "You must cite persisted evidence IDs and source ranges whenever making a finding-specific claim.",
    "You must say NOT_ENOUGH_EVIDENCE when proof is missing.",
    "You must not output exploit instructions or live attack steps.",
    "You must not claim CONFIRMED unless simulation or formal proof exists in the evidence pack.",
    "You must output structured JSON only and no markdown."
  ].join(" ");
}
