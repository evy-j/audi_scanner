import { z } from "zod";
import { paginationQuery } from "../../common/validation/common-schemas.js";

export const findingParams = z.object({
  findingId: z.string().uuid()
});

export const scanFindingParams = z.object({
  scanId: z.string().uuid()
});

export const listScanFindingsQuery = paginationQuery.extend({
  organizationId: z.string().uuid(),
  severity: z.enum(["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  state: z
    .enum(["CANDIDATE", "SUPPORTED", "TRIAGED", "SIMULATED", "CONFIRMED", "REJECTED", "NOT_ASSESSED"])
    .optional()
});

export const organizationEvidenceQuery = z.object({
  organizationId: z.string().uuid()
});

export type ListScanFindingsQuery = z.infer<typeof listScanFindingsQuery>;
export type OrganizationEvidenceQuery = z.infer<typeof organizationEvidenceQuery>;
