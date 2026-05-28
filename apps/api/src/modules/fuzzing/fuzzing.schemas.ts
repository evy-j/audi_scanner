import { z } from "zod";

export const fuzzScanParams = z.object({
  scanId: z.string().uuid()
});

export const fuzzFindingParams = z.object({
  findingId: z.string().uuid()
});

export const fuzzRunParams = z.object({
  fuzzRunId: z.string().uuid()
});

export const fuzzOrganizationQuery = z.object({
  organizationId: z.string().uuid()
});
