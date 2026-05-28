import { z } from "zod";

export const scanReviewParams = z.object({
  scanId: z.string().uuid()
});

export const findingReviewParams = z.object({
  findingId: z.string().uuid()
});

export const projectParams = z.object({
  projectId: z.string().uuid()
});

export const projectRuleParams = z.object({
  projectId: z.string().uuid(),
  ruleId: z.string().uuid()
});

export const reviewOrganizationQuery = z.object({
  organizationId: z.string().uuid()
});

export const baselineComparisonQuery = reviewOrganizationQuery.extend({
  baseScanId: z.string().uuid().optional()
});

export const sarifExportQuery = reviewOrganizationQuery.extend({
  includeSuppressed: z.coerce.boolean().default(false)
});

export const reviewStatus = z.enum([
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

export const severity = z.enum(["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const confidence = z.enum(["LOW", "MEDIUM", "HIGH", "CONFIRMED"]);

export const reviewStatusBody = z.object({
  status: reviewStatus,
  reason: z.string().min(1).max(2_000).optional(),
  severityOverride: severity.optional(),
  confidenceOverride: confidence.optional()
});

export const findingCommentBody = z.object({
  body: z.string().min(1).max(8_000)
});

export const findingAssignmentBody = z
  .object({
    assigneeUserId: z.string().uuid().optional(),
    assigneeName: z.string().min(1).max(160).optional(),
    assigneeEmail: z.string().email().max(320).optional(),
    assigneeTeam: z.string().min(1).max(160).optional(),
    reason: z.string().min(1).max(2_000).optional()
  })
  .superRefine((input, context) => {
    if (!input.assigneeUserId && !input.assigneeName && !input.assigneeEmail && !input.assigneeTeam) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one assignee field is required"
      });
    }
  });

export const suppressFindingBody = z.object({
  reason: z.string().min(1).max(2_000),
  ruleId: z.string().uuid().optional()
});

export const unsuppressFindingBody = z.object({
  reason: z.string().min(1).max(2_000).optional()
});

export const suppressionRuleBody = z
  .object({
    analyzerName: z.string().min(1).max(80).optional(),
    ruleId: z.string().min(1).max(160).optional(),
    filePath: z.string().min(1).max(1_000).optional(),
    functionName: z.string().min(1).max(160).optional(),
    fingerprint: z.string().min(1).max(160).optional(),
    severity: severity.optional(),
    messageContains: z.string().min(1).max(1_000).optional(),
    reason: z.string().min(1).max(2_000)
  })
  .superRefine((input, context) => {
    const hasMatcher = Boolean(
      input.analyzerName ||
        input.ruleId ||
        input.filePath ||
        input.functionName ||
        input.fingerprint ||
        input.severity ||
        input.messageContains
    );
    if (!hasMatcher) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one deterministic suppression matcher is required"
      });
    }
  });

export const codeOwnerRuleBody = z
  .object({
    pathPattern: z.string().min(1).max(1_000),
    ownerName: z.string().min(1).max(160).optional(),
    ownerEmail: z.string().email().max(320).optional(),
    ownerTeam: z.string().min(1).max(160).optional(),
    severityThreshold: severity.optional()
  })
  .superRefine((input, context) => {
    if (!input.ownerName && !input.ownerEmail && !input.ownerTeam) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one owner field is required"
      });
    }
  });

export type BaselineComparisonQuery = z.infer<typeof baselineComparisonQuery>;
export type SarifExportQuery = z.infer<typeof sarifExportQuery>;
export type ReviewStatusBody = z.infer<typeof reviewStatusBody>;
export type FindingCommentBody = z.infer<typeof findingCommentBody>;
export type FindingAssignmentBody = z.infer<typeof findingAssignmentBody>;
export type SuppressFindingBody = z.infer<typeof suppressFindingBody>;
export type UnsuppressFindingBody = z.infer<typeof unsuppressFindingBody>;
export type SuppressionRuleBody = z.infer<typeof suppressionRuleBody>;
export type CodeOwnerRuleBody = z.infer<typeof codeOwnerRuleBody>;
