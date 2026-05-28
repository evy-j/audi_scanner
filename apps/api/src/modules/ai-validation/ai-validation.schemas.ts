import { z } from "zod";

export const aiValidationScanParams = z.object({
  scanId: z.string().uuid()
});

export const aiValidationFindingParams = z.object({
  findingId: z.string().uuid()
});

export const aiValidationOrganizationQuery = z.object({
  organizationId: z.string().uuid()
});

export type AiValidationOrganizationQuery = z.infer<typeof aiValidationOrganizationQuery>;
