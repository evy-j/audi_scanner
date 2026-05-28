import { Router } from "express";
import { authenticateJwt } from "../../common/middleware/authenticate.middleware.js";
import {
  requireOrganizationParam,
  requirePermissions
} from "../../common/middleware/authorize.middleware.js";
import { apiKeyRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { auditLog } from "../../common/middleware/audit-log.middleware.js";
import { apiKeyIdParams, apiKeyParams, createApiKeySchema } from "./api-keys.schemas.js";
import { ApiKeysController } from "./api-keys.controller.js";

const controller = new ApiKeysController();

export const apiKeyRoutes = Router({ mergeParams: true });

apiKeyRoutes.use(authenticateJwt);

apiKeyRoutes.get(
  "/",
  validateRequest({ params: apiKeyParams }),
  requireOrganizationParam(),
  requirePermissions("api-keys:read"),
  asyncHandler(controller.list)
);

apiKeyRoutes.post(
  "/",
  apiKeyRateLimit,
  validateRequest({ params: apiKeyParams }),
  requireOrganizationParam(),
  requirePermissions("api-keys:create"),
  validateRequest({ body: createApiKeySchema }),
  auditLog("API_KEY_CREATE", "API_KEY"),
  asyncHandler(controller.create)
);

apiKeyRoutes.delete(
  "/:apiKeyId",
  apiKeyRateLimit,
  validateRequest({ params: apiKeyIdParams }),
  requireOrganizationParam(),
  requirePermissions("api-keys:revoke"),
  auditLog("API_KEY_REVOKE", "API_KEY"),
  asyncHandler(controller.revoke)
);
