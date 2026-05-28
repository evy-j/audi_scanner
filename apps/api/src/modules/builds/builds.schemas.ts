import { z } from "zod";
import { organizationQuery } from "../../common/validation/common-schemas.js";

export const buildScanParams = z.object({
  scanId: z.string().uuid()
});

export const buildOrganizationQuery = organizationQuery;

export const retryAnalyzersBody = z.object({
  analyzers: z
    .array(z.enum(["slither", "mythril", "semgrep", "aderyn", "foundry"]))
    .min(1)
    .optional()
});

export type RetryAnalyzersBody = z.infer<typeof retryAnalyzersBody>;
