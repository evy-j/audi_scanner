import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002"
};

const buildsRepository = vi.hoisted(() => ({
  buildProfile: vi.fn(),
  buildRuns: vi.fn(),
  compilerArtifacts: vi.fn(),
  testRuns: vi.fn(),
  toolAvailability: vi.fn(),
  retryContext: vi.fn()
}));

vi.mock("../../apps/api/src/modules/builds/builds.repository.js", () => ({
  BuildsRepository: vi.fn(function BuildsRepository() {
    return buildsRepository;
  })
}));

vi.mock("../../apps/api/src/infra/queues/scan-queue.producer.js", () => ({
  ScanQueueProducer: vi.fn(function ScanQueueProducer() {
    return {
      enqueueBuild: vi.fn(),
      enqueueAnalyzer: vi.fn(),
      getAdmissionDepth: vi.fn(async () => 0)
    };
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
      scopes: ["scans:read", "scans:create", "vulnerabilities:read"]
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

vi.mock("../../apps/api/src/common/middleware/audit-log.middleware.js", () => ({
  auditLog:
    () => (_req: any, _res: any, next: any) =>
      next()
}));

describe("build API", () => {
  it("returns repository-backed build profile data", async () => {
    buildsRepository.buildProfile.mockResolvedValue({
      scanId: ids.scanId,
      toolKind: "FOUNDRY",
      toolName: "foundry",
      projectRoot: ".",
      detectionReason: "foundry.toml was found"
    });

    const response = await request(await createBuildApp())
      .get(`/api/v1/scans/${ids.scanId}/build-profile`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(buildsRepository.buildProfile).toHaveBeenCalledWith(ids.scanId, ids.organizationId);
    expect(response.body).toMatchObject({
      scanId: ids.scanId,
      toolKind: "FOUNDRY"
    });
  });

  it("returns persisted tool availability rows only", async () => {
    buildsRepository.toolAvailability.mockResolvedValue([
      {
        scanId: ids.scanId,
        toolName: "forge",
        available: false,
        status: "TOOL_NOT_INSTALLED"
      }
    ]);

    const response = await request(await createBuildApp())
      .get(`/api/v1/scans/${ids.scanId}/tool-availability`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        toolName: "forge",
        status: "TOOL_NOT_INSTALLED"
      })
    ]);
  });
});

async function createBuildApp() {
  const { scanRoutes } = await import("../../apps/api/src/modules/scans/scans.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/scans", scanRoutes);
  app.use(errorHandler);
  return app;
}
