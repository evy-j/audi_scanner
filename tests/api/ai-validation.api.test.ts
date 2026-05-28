import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  findingId: "00000000-0000-4000-8000-000000000003"
};

const aiRepository = vi.hoisted(() => ({
  scanSummary: vi.fn(),
  findingValidation: vi.fn(),
  scanContext: vi.fn(),
  findingContext: vi.fn()
}));

vi.mock("../../apps/api/src/modules/ai-validation/ai-validation.repository.js", () => ({
  AiValidationRepository: vi.fn(function AiValidationRepository() {
    return aiRepository;
  })
}));

vi.mock("../../apps/api/src/infra/queues/scan-queue.producer.js", () => ({
  ScanQueueProducer: vi.fn(function ScanQueueProducer() {
    return {
      enqueueAiValidation: vi.fn(),
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
      scopes: ["scans:read", "vulnerabilities:read", "vulnerabilities:update"]
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

describe("AI validation API", () => {
  it("returns persisted scan-level AI validation data only", async () => {
    aiRepository.scanSummary.mockResolvedValue({
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      status: "SUCCEEDED",
      runs: [{ id: "ai-run-1", status: "SUCCEEDED", scope: "SCAN_SUMMARY" }]
    });

    const response = await request(await createAiValidationApp())
      .get(`/api/v1/scans/${ids.scanId}/ai-validation-summary`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(aiRepository.scanSummary).toHaveBeenCalledWith(ids.scanId, ids.organizationId);
    expect(response.body).toMatchObject({
      scanId: ids.scanId,
      status: "SUCCEEDED",
      runs: [expect.objectContaining({ id: "ai-run-1" })]
    });
  });

  it("returns provider-not-configured when AI validation is disabled", async () => {
    aiRepository.scanContext.mockResolvedValue({
      id: ids.scanId,
      organizationId: ids.organizationId,
      projectId: null,
      priority: "NORMAL"
    });

    const response = await request(await createAiValidationApp())
      .post(`/api/v1/scans/${ids.scanId}/ai-validate`)
      .query({ organizationId: ids.organizationId })
      .expect(202);

    expect(response.body).toMatchObject({
      enqueued: false,
      status: "PROVIDER_NOT_CONFIGURED"
    });
  });

  it("returns persisted finding-level AI validation data only", async () => {
    aiRepository.findingValidation.mockResolvedValue({
      findingId: ids.findingId,
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      status: "SUCCEEDED",
      validations: [{ id: "validation-1", decision: "EVIDENCE_WEAK" }],
      latestRun: null
    });

    const response = await request(await createAiValidationApp())
      .get(`/api/v1/findings/${ids.findingId}/ai-validation`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(aiRepository.findingValidation).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body.validations).toEqual([
      expect.objectContaining({ decision: "EVIDENCE_WEAK" })
    ]);
  });
});

async function createAiValidationApp() {
  const { scanRoutes } = await import("../../apps/api/src/modules/scans/scans.routes.js");
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/scans", scanRoutes);
  app.use("/api/v1/findings", findingRoutes);
  app.use(errorHandler);
  return app;
}
