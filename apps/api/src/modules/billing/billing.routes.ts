import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import {
  requireOrganizationParam,
  requirePermissions
} from "../../common/middleware/authorize.middleware.js";
import { reportRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { BillingController } from "./billing.controller.js";
import {
  adminOverrideBody,
  adminOverrideParams,
  billingProviderParams,
  checkoutBody,
  orgBillingParams
} from "./billing.schemas.js";

const controller = new BillingController();

export const billingWebhookRoutes = Router();
billingWebhookRoutes.post(
  "/billing/webhook/:provider",
  validateRequest({ params: billingProviderParams }),
  asyncHandler(controller.webhook)
);

export const billingRoutes = Router();

billingRoutes.use(authenticateJwtOrApiKey);

billingRoutes.get("/billing/status", asyncHandler(controller.status));
billingRoutes.get("/billing/plans", asyncHandler(controller.plans));

billingRoutes.get(
  "/orgs/:organizationId/billing/subscription",
  validateRequest({ params: orgBillingParams }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.subscription)
);

billingRoutes.get(
  "/orgs/:organizationId/billing/usage",
  validateRequest({ params: orgBillingParams }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.usage)
);

billingRoutes.post(
  "/orgs/:organizationId/billing/checkout",
  reportRateLimit,
  validateRequest({ params: orgBillingParams, body: checkoutBody }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.checkout)
);

billingRoutes.post(
  "/orgs/:organizationId/billing/cancel",
  reportRateLimit,
  validateRequest({ params: orgBillingParams }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.cancel)
);

billingRoutes.get(
  "/orgs/:organizationId/billing/invoices",
  validateRequest({ params: orgBillingParams }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.invoices)
);

billingRoutes.get(
  "/orgs/:organizationId/billing/payments",
  validateRequest({ params: orgBillingParams }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.payments)
);

billingRoutes.post(
  "/orgs/:organizationId/billing/admin-override",
  reportRateLimit,
  validateRequest({ params: orgBillingParams, body: adminOverrideBody }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.createAdminOverride)
);

billingRoutes.delete(
  "/orgs/:organizationId/billing/admin-override/:overrideId",
  reportRateLimit,
  validateRequest({ params: adminOverrideParams }),
  requireOrganizationParam(),
  requirePermissions("billing:manage"),
  asyncHandler(controller.revokeAdminOverride)
);
