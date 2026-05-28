import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  findingId: "00000000-0000-4000-8000-000000000002",
  scanId: "00000000-0000-4000-8000-000000000003",
  simulationId: "00000000-0000-4000-8000-000000000004"
};

const simulationService = vi.hoisted(() => ({
  findingSimulations: vi.fn(),
  simulateFinding: vi.fn(),
  get: vi.fn(),
  artifacts: vi.fn(),
  scanSummary: vi.fn()
}));

vi.mock("../../apps/api/src/modules/simulations/simulation.service.js", () => ({
  SimulationService: vi.fn(function SimulationService() {
    return simulationService;
  })
}));

vi.mock("../../apps/api/src/infra/queues/redis.js", () => ({
  redis: {
    incr: vi.fn(async () => 1),
    pexpire: vi.fn(async () => 1),
    pttl: vi.fn(async () => 60_000),
    decr: vi.fn(async () => 0),
    del: vi.fn(async () => 1),
    ping: vi.fn(async () => "PONG")
  },
  redisKey: (...parts: string[]) => parts.join(":")
}));

vi.mock("../../apps/api/src/common/middleware/api-key-auth.middleware.js", () => ({
  authenticateJwtOrApiKey: (req: any, _res: any, next: any) => {
    req.auth = {
      type: "apiKey",
      apiKeyId: "test-key",
      organizationId: ids.organizationId,
      permissions: [],
      scopes: ["vulnerabilities:read", "vulnerabilities:update"]
    };
    next();
  }
}));

vi.mock("../../apps/api/src/common/middleware/authorize.middleware.js", () => ({
  requireOrganizationParam:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requirePermissions:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireOrgSecuritySetting:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireProjectAccess:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireScanProjectAccess:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireFindingProjectAccess:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireReportProjectAccess:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireMonitorTargetProjectAccess:
    () => (_req: any, _res: any, next: any) =>
      next(),
  requireAlertProjectAccess:
    () => (_req: any, _res: any, next: any) =>
      next()
}));

describe("Simulation API", () => {
  it("returns persisted simulation data only", async () => {
    simulationService.findingSimulations.mockResolvedValue({
      simulation: { enabled: false, safetyLevel: "DISABLED" },
      findingId: ids.findingId,
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      status: "NOT_ASSESSED",
      decision: "NOT_ASSESSED",
      runs: [{ id: ids.simulationId, status: "INCONCLUSIVE", decision: "INCONCLUSIVE" }]
    });

    const response = await request(await createSimulationApp())
      .get(`/api/v1/findings/${ids.findingId}/simulations`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(simulationService.findingSimulations).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body.runs).toEqual([
      expect.objectContaining({ id: ids.simulationId, decision: "INCONCLUSIVE" })
    ]);
  });
});

async function createSimulationApp() {
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const { simulationRoutes } = await import("../../apps/api/src/modules/simulations/simulation.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/findings", findingRoutes);
  app.use("/api/v1/simulations", simulationRoutes);
  app.use(errorHandler);
  return app;
}
