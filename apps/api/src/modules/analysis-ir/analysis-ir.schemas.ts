import { z } from "zod";
import { organizationQuery } from "../../common/validation/common-schemas.js";

export const irScanParams = z.object({
  scanId: z.string().uuid()
});

export const irContractParams = z.object({
  scanId: z.string().uuid(),
  contractId: z.string().uuid()
});

export const irFindingParams = z.object({
  findingId: z.string().uuid()
});

export const irOrganizationQuery = organizationQuery;

export type IrOrganizationQuery = z.infer<typeof irOrganizationQuery>;
