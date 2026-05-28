import { z } from "zod";
import { paginationQuery } from "../../common/validation/common-schemas.js";

export const listReportsQuery = paginationQuery.extend({
  organizationId: z.string().uuid(),
  scanId: z.string().uuid().optional(),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "REVOKED"]).optional()
});

export const reportParams = z.object({
  reportId: z.string().uuid()
});

export const scanReportParams = z.object({
  scanId: z.string().uuid()
});

export const reportExportBody = z.object({
  format: z.enum(["HTML", "PDF", "JSON", "SARIF", "MARKDOWN"]),
  includeSuppressed: z.coerce.boolean().default(false)
});

export const reportShareBody = z.object({
  expiresAt: z.string().datetime().optional(),
  includeSuppressed: z.coerce.boolean().default(false)
});

export const publicReportParams = z.object({
  shareToken: z.string().min(24).max(256)
});

export type ListReportsQuery = z.infer<typeof listReportsQuery>;
export type ReportExportBody = z.infer<typeof reportExportBody>;
export type ReportShareBody = z.infer<typeof reportShareBody>;
