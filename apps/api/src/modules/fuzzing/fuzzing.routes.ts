import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireOrganizationParam, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { FuzzingController } from "./fuzzing.controller.js";
import { fuzzOrganizationQuery, fuzzRunParams } from "./fuzzing.schemas.js";

const controller = new FuzzingController();

export const fuzzingRoutes = Router();

fuzzingRoutes.use(authenticateJwtOrApiKey);

fuzzingRoutes.get(
  "/:fuzzRunId",
  validateRequest({ params: fuzzRunParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.get)
);

fuzzingRoutes.get(
  "/:fuzzRunId/artifacts",
  validateRequest({ params: fuzzRunParams, query: fuzzOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.artifacts)
);
