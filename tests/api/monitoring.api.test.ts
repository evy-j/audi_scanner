import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  alertId: "00000000-0000-4000-8000-000000000003",
  targetId: "00000000-0000-4000-8000-000000000004"
};

const monitoringService = vi.hoisted(() => ({
  listTargets: vi.fn(),
  createTarget: vi.fn(),
  updateTarget: vi.fn(),
  deleteTarget: vi.fn(),
  listAlerts: vi.fn(),
  getAlert: vi.fn(),
  transitionAlert: vi.fn(),
  addComment: vi.fn(),
  scanSummary: vi.fn(),
  runOnce: vi.fn(),
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  deleteWebhook: vi.fn()
}));

vi.mock("../../apps/api/src/modules/monitoring/monitoring.service.js", () => ({
  MonitoringService: vi.fn(function MonitoringService() {
    return monitoringService;
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

describe("Monitoring API", () => {
  it("returns persisted monitoring data only", async () => {
    monitoringService.listAlerts.mockResolvedValue({
      monitoring: { enabled: false, status: "DISABLED" },
      alerts: [{
        id: ids.alertId,
        kind: "PROXY_UPGRADE",
        severity: "HIGH",
        evidence: [{ id: "evidence-1", transactionHash: "0xabc", blockNumber: "10" }]
      }]
    });

    const response = await request(await createMonitoringApp())
      .get(`/api/v1/projects/${ids.projectId}/alerts`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(monitoringService.listAlerts).toHaveBeenCalledWith(ids.projectId, ids.organizationId, {
      status: undefined,
      limit: 50
    });
    expect(response.body.alerts).toEqual([
      expect.objectContaining({
        id: ids.alertId,
        evidence: [expect.objectContaining({ transactionHash: "0xabc" })]
      })
    ]);
  });

  it("creates monitor targets through the repository-backed route", async () => {
    monitoringService.createTarget.mockResolvedValue({
      monitoring: { enabled: false, status: "DISABLED" },
      targets: [{ id: ids.targetId, normalizedAddress: "0x0000000000000000000000000000000000000001" }]
    });

    await request(await createMonitoringApp())
      .post(`/api/v1/projects/${ids.projectId}/monitor-targets`)
      .query({ organizationId: ids.organizationId })
      .send({ address: "0x0000000000000000000000000000000000000001", chainId: 1 })
      .expect(201);

    expect(monitoringService.createTarget).toHaveBeenCalledWith(ids.projectId, expect.objectContaining({
      organizationId: ids.organizationId
    }), expect.objectContaining({ chainId: 1 }));
  });
});

async function createMonitoringApp() {
  const { monitoringRoutes } = await import("../../apps/api/src/modules/monitoring/monitoring.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1", monitoringRoutes);
  app.use(errorHandler);
  return app;
}
