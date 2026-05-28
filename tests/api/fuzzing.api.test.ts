import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  findingId: "00000000-0000-4000-8000-000000000002",
  scanId: "00000000-0000-4000-8000-000000000003",
  fuzzRunId: "00000000-0000-4000-8000-000000000004"
};

const fuzzingService = vi.hoisted(() => ({
  scanSummary: vi.fn(),
  findingFuzz: vi.fn(),
  scanInvariants: vi.fn(),
  fuzzScan: vi.fn(),
  fuzzFinding: vi.fn(),
  runScanInvariants: vi.fn(),
  get: vi.fn(),
  artifacts: vi.fn()
}));

vi.mock("../../apps/api/src/modules/fuzzing/fuzzing.service.js", () => ({
  FuzzingService: vi.fn(function FuzzingService() {
    return fuzzingService;
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

describe("Fuzzing API", () => {
  it("returns persisted fuzz data only", async () => {
    fuzzingService.findingFuzz.mockResolvedValue({
      fuzzing: { enabled: false, safetyLevel: "DISABLED", defaultRuns: 256 },
      findingId: ids.findingId,
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      status: "NOT_ASSESSED",
      invariantStatus: "NOT_ASSESSED",
      runs: [{ id: ids.fuzzRunId, status: "INCONCLUSIVE", invariantStatus: "INCONCLUSIVE" }]
    });

    const response = await request(await createFuzzingApp())
      .get(`/api/v1/findings/${ids.findingId}/fuzz`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(fuzzingService.findingFuzz).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body.runs).toEqual([
      expect.objectContaining({ id: ids.fuzzRunId, invariantStatus: "INCONCLUSIVE" })
    ]);
  });
});

async function createFuzzingApp() {
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const { fuzzingRoutes } = await import("../../apps/api/src/modules/fuzzing/fuzzing.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/findings", findingRoutes);
  app.use("/api/v1/fuzz-runs", fuzzingRoutes);
  app.use(errorHandler);
  return app;
}
