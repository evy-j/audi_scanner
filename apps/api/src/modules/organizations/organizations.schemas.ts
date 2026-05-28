import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  billingEmail: z.string().email().max(320).optional()
});

export const updateOrganizationSchema = z
  .object({
    name: z.string().min(2).max(160).optional(),
    billingEmail: z.string().email().max(320).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one organization field is required"
  });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
