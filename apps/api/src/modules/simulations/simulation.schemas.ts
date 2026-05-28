import { z } from "zod";

export const simulationFindingParams = z.object({
  findingId: z.string().uuid()
});

export const simulationScanParams = z.object({
  scanId: z.string().uuid()
});

export const simulationParams = z.object({
  simulationId: z.string().uuid()
});

export const simulationOrganizationQuery = z.object({
  organizationId: z.string().uuid()
});
