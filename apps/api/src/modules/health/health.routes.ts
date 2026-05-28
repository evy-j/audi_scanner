import { Router } from "express";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { HealthService, isReadyForHttp } from "./health.service.js";

const health = new HealthService();

export const healthRoutes = Router();

healthRoutes.get("/health", (_req, res) => {
  res.json(health.shallow());
});

healthRoutes.get(
  "/health/deep",
  asyncHandler(async (_req, res) => {
    const result = await health.deep();
    res.status(result.status === "ok" ? 200 : 503).json(result);
  })
);

healthRoutes.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const result = await health.ready();
    res.status(isReadyForHttp(result) ? 200 : 503).json(result);
  })
);

healthRoutes.get("/version", (_req, res) => {
  res.json(health.version());
});
