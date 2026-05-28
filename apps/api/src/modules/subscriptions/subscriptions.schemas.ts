import { z } from "zod";

export const subscriptionParams = z.object({
  organizationId: z.string().uuid()
});

export const updateSubscriptionSchema = z
  .object({
    tier: z.enum(["FREE", "PRO", "TEAM", "ENTERPRISE", "CUSTOM"]).optional(),
    status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "SUSPENDED"]).optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one subscription field is required"
  });

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
