import { z } from "zod";

export const remediationFindingParams = z.object({
  findingId: z.string().uuid()
});

export const remediationScanParams = z.object({
  scanId: z.string().uuid()
});

export const remediationParams = z.object({
  remediationId: z.string().uuid()
});

export const remediationOrganizationQuery = z.object({
  organizationId: z.string().uuid()
});

export const remediationReviewBody = z.object({
  comment: z.string().min(1).max(4_000).optional()
});

export const remediationRejectBody = z.object({
  reason: z.string().min(1).max(4_000).optional()
});

export type RemediationReviewBody = z.infer<typeof remediationReviewBody>;
export type RemediationRejectBody = z.infer<typeof remediationRejectBody>;
