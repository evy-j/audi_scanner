import { z } from "zod";
import { redactSecrets } from "./redaction.js";
import type { RemediationPack } from "./remediation-pack-builder.js";

export const REMEDIATION_PROMPT_VERSION = "p5-remediation/v1";

const patchSafetyStatusSchema = z.enum([
  "SAFE_TO_REVIEW",
  "NEEDS_HUMAN_REVIEW",
  "BEHAVIOR_CHANGING",
  "UNSAFE",
  "NOT_ASSESSED"
]);

const originalRangeSchema = z
  .object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startColumn: z.number().int().positive().optional(),
    endColumn: z.number().int().positive().optional()
  })
  .strict();

const diffSchema = z
  .object({
    filePath: z.string().min(1).max(1_000),
    originalRange: originalRangeSchema,
    proposedPatch: z.string().min(1).max(12_000),
    explanation: z.string().min(1).max(2_000),
    risk: z.string().min(1).max(1_200),
    behaviorChangeNotes: z.array(z.string().min(1).max(600)).max(12),
    requiresHumanReview: z.literal(true)
  })
  .strict();

const testSuggestionSchema = z
  .object({
    title: z.string().min(1).max(240),
    testFramework: z.enum(["FOUNDRY", "HARDHAT", "INVARIANT", "MANUAL", "UNKNOWN"]),
    description: z.string().min(1).max(2_000),
    skeleton: z.string().min(1).max(12_000).optional(),
    expectedFailingBefore: z.string().min(1).max(1_200),
    expectedFixedAfter: z.string().min(1).max(1_200),
    requiresHumanReview: z.literal(true)
  })
  .strict();

export const remediationOutputSchema = z
  .object({
    guidance: z
      .object({
        title: z.string().min(1).max(240),
        summary: z.string().min(1).max(3_000),
        steps: z.array(z.string().min(1).max(1_000)).min(1).max(12),
        limitations: z.array(z.string().min(1).max(800)).min(1).max(12)
      })
      .strict(),
    safetyStatus: patchSafetyStatusSchema,
    behaviorChangeNotes: z.array(z.string().min(1).max(800)).max(12),
    diffs: z.array(diffSchema).max(3),
    tests: z.array(testSuggestionSchema).min(1).max(8),
    checklist: z.array(z.string().min(1).max(500)).min(1).max(12)
  })
  .strict()
  .superRefine((output, context) => {
    const serialized = JSON.stringify(output);
    if (containsLiveAttackInstruction(serialized)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remediation output contains disallowed live attack or exploit instructions"
      });
    }
    if (!serialized.toLowerCase().includes("requires human review")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remediation output must explicitly say requires human review"
      });
    }
  });

export type RemediationOutput = z.infer<typeof remediationOutputSchema>;

export function parseRemediationOutput(value: unknown): RemediationOutput {
  return remediationOutputSchema.parse(value);
}

export function buildRemediationPrompt(pack: RemediationPack) {
  return {
    systemPrompt: baseSystemPrompt(),
    userPrompt: [
      "Generate defensive remediation guidance for exactly one persisted finding.",
      "Use only the persisted evidence pack below. Do not add findings, severities, confidence changes, exploit simulations, or proof claims.",
      "Return structured JSON only with the P5Remediation schema.",
      "Every item must be defensive. Do not include exploit instructions, live attack steps, payload recipes, or autonomous actions.",
      "Do not claim a fix is verified unless a persisted P3 build or test run actually executed it. Suggested tests are not proof.",
      "Diffs must be minimal and require human review. Do not create a PR and do not say the patch was applied.",
      pack.diffSuggestionsAllowed
        ? "Secure diff suggestions are allowed only for the exact source ranges in eligibleSourceLocations."
        : "Do not output diffs because no exact source range is available. Output guidance, tests, and checklist only.",
      "Explain behavior changes and risks. Include regression test ideas, Foundry/Hardhat skeletons only when context supports them, invariant suggestions when applicable, and a human review checklist.",
      "Each guidance summary, diff explanation, test description, and checklist item must include the phrase 'requires human review' where natural.",
      "Limitations must identify missing context and must not fabricate compiler artifacts, tests, evidence, or remediation proof.",
      "Evidence pack:",
      JSON.stringify(pack, null, 2)
    ].join("\n\n")
  };
}

export function sanitizeRemediationOutput(output: RemediationOutput): RemediationOutput {
  return {
    guidance: {
      title: redactSecrets(output.guidance.title),
      summary: redactSecrets(output.guidance.summary),
      steps: output.guidance.steps.map(redactSecrets),
      limitations: output.guidance.limitations.map(redactSecrets)
    },
    safetyStatus: output.safetyStatus,
    behaviorChangeNotes: output.behaviorChangeNotes.map(redactSecrets),
    diffs: output.diffs.map((diff) => ({
      filePath: diff.filePath,
      originalRange: diff.originalRange,
      proposedPatch: redactSecrets(diff.proposedPatch),
      explanation: redactSecrets(diff.explanation),
      risk: redactSecrets(diff.risk),
      behaviorChangeNotes: diff.behaviorChangeNotes.map(redactSecrets),
      requiresHumanReview: true
    })),
    tests: output.tests.map((test) => ({
      title: redactSecrets(test.title),
      testFramework: test.testFramework,
      description: redactSecrets(test.description),
      ...(test.skeleton ? { skeleton: redactSecrets(test.skeleton) } : {}),
      expectedFailingBefore: redactSecrets(test.expectedFailingBefore),
      expectedFixedAfter: redactSecrets(test.expectedFixedAfter),
      requiresHumanReview: true
    })),
    checklist: output.checklist.map(redactSecrets)
  };
}

function baseSystemPrompt(): string {
  return [
    "You are a defensive remediation assistant for a smart-contract audit scanner.",
    "You must only produce remediation guidance for existing persisted evidence-backed findings.",
    "You must not create new findings, exploit instructions, live attack steps, autonomous agents, PRs, or applied patches.",
    "You must not alter severity, confidence, review status, or validation status.",
    "You must not claim tests, builds, compilation, or remediation proof unless those artifacts already exist in the evidence pack.",
    "You must output structured JSON only and no markdown."
  ].join(" ");
}

function containsLiveAttackInstruction(value: string): boolean {
  return [
    /\bstep[- ]by[- ]step exploit\b/iu,
    /\blive attack\b/iu,
    /\battack steps\b/iu,
    /\bpayload recipe\b/iu,
    /\bdrain (?:the )?(?:funds|vault|pool)\b/iu,
    /\bsteal (?:funds|tokens|private keys?)\b/iu,
    /\bfront[- ]run this\b/iu,
    /\buse this private key\b/iu
  ].some((pattern) => pattern.test(value));
}
