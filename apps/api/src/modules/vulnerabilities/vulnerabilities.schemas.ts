import { z } from "zod";
import { paginationQuery } from "../../common/validation/common-schemas.js";

export const listVulnerabilitiesQuery = paginationQuery.extend({
  organizationId: z.string().uuid(),
  scanId: z.string().uuid().optional(),
  severity: z.enum(["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z
    .enum(["OPEN", "ACKNOWLEDGED", "FALSE_POSITIVE", "ACCEPTED_RISK", "FIXED", "SUPPRESSED"])
    .optional()
});

export const vulnerabilityParams = z.object({
  vulnerabilityId: z.string().uuid()
});

export const updateVulnerabilitySchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "FALSE_POSITIVE", "ACCEPTED_RISK", "FIXED", "SUPPRESSED"])
});

export type ListVulnerabilitiesQuery = z.infer<typeof listVulnerabilitiesQuery>;
export type UpdateVulnerabilityInput = z.infer<typeof updateVulnerabilitySchema>;
