import { Router } from "express";
import { authenticateJwt } from "../../common/middleware/authenticate.middleware.js";
import {
  requireOrganizationParam,
  requirePermissions
} from "../../common/middleware/authorize.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { auditLog } from "../../common/middleware/audit-log.middleware.js";
import {
  subscriptionParams,
  updateSubscriptionSchema
} from "./subscriptions.schemas.js";
import { SubscriptionsController } from "./subscriptions.controller.js";

const controller = new SubscriptionsController();

export const subscriptionRoutes = Router({ mergeParams: true });

subscriptionRoutes.use(authenticateJwt);
subscriptionRoutes.use(validateRequest({ params: subscriptionParams }));
subscriptionRoutes.use(requireOrganizationParam());

subscriptionRoutes.get(
  "/",
  requirePermissions("subscriptions:read"),
  asyncHandler(controller.list)
);

subscriptionRoutes.get(
  "/current",
  requirePermissions("subscriptions:read"),
  asyncHandler(controller.current)
);

subscriptionRoutes.patch(
  "/current",
  requirePermissions("subscriptions:update"),
  validateRequest({ body: updateSubscriptionSchema }),
  auditLog("UPDATE", "SUBSCRIPTION"),
  asyncHandler(controller.updateCurrent)
);
