import { z } from "zod";

export const orgBillingParams = z.object({
  organizationId: z.string().uuid()
});

export const adminOverrideParams = orgBillingParams.extend({
  overrideId: z.string().uuid()
});

export const billingProviderParams = z.object({
  provider: z.enum(["stripe", "razorpay", "manual", "disabled"])
});

export const checkoutBody = z.object({
  planId: z.string().uuid().optional(),
  priceId: z.string().uuid().optional()
});

export const adminOverrideBody = z.object({
  entitlementKey: z.string().min(1).max(120).optional(),
  limit: z.number().int().min(-1).optional(),
  reason: z.string().min(8).max(2_000),
  expiresAt: z.string().datetime().optional(),
  permanentConfirmed: z.boolean().optional()
});
