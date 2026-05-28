import { z } from "zod";

export const uuidParam = z.object({
  id: z.string().uuid()
});

export const organizationParam = z.object({
  organizationId: z.string().uuid()
});

export const organizationQuery = z.object({
  organizationId: z.string().uuid()
});

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional()
});

export const idWithOrganizationParams = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid()
});
