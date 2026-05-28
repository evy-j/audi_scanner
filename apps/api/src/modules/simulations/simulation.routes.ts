import { Router } from "express";
import { authenticateJwtOrApiKey } from "../../common/middleware/api-key-auth.middleware.js";
import { requireOrganizationParam, requirePermissions } from "../../common/middleware/authorize.middleware.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { SimulationController } from "./simulation.controller.js";
import { simulationOrganizationQuery, simulationParams } from "./simulation.schemas.js";

const controller = new SimulationController();

export const simulationRoutes = Router();

simulationRoutes.use(authenticateJwtOrApiKey);

simulationRoutes.get(
  "/:simulationId",
  validateRequest({ params: simulationParams, query: simulationOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.get)
);

simulationRoutes.get(
  "/:simulationId/artifacts",
  validateRequest({ params: simulationParams, query: simulationOrganizationQuery }),
  requireOrganizationParam(),
  requirePermissions("vulnerabilities:read"),
  asyncHandler(controller.artifacts)
);
