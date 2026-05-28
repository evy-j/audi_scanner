import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  findingId: "00000000-0000-4000-8000-000000000003"
};

const analysisIrRepository = vi.hoisted(() => ({
  summary: vi.fn(),
  contracts: vi.fn(),
  functions: vi.fn(),
  callGraph: vi.fn(),
  externalCalls: vi.fn(),
  storageLayout: vi.fn(),
  findingCodeLinks: vi.fn()
}));

vi.mock("../../apps/api/src/modules/analysis-ir/analysis-ir.repository.js", () => ({
  AnalysisIrRepository: vi.fn(function AnalysisIrRepository() {
    return analysisIrRepository;
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
      scopes: ["scans:read", "vulnerabilities:read"]
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

describe("analysis IR API", () => {
  it("returns repository-backed persisted IR summary data", async () => {
    analysisIrRepository.summary.mockResolvedValue({
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      extractionStatus: "EXTRACTED",
      contractCount: 1,
      functionCount: 2,
      externalCallCount: 1,
      storageLayoutCount: 1,
      runs: []
    });

    const response = await request(await createAnalysisIrApp())
      .get(`/api/v1/scans/${ids.scanId}/ir-summary`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(analysisIrRepository.summary).toHaveBeenCalledWith(ids.scanId, ids.organizationId);
    expect(response.body).toMatchObject({
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      extractionStatus: "EXTRACTED",
      contractCount: 1
    });
  });

  it("returns repository-backed finding-to-code links", async () => {
    analysisIrRepository.findingCodeLinks.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000004",
        findingId: ids.findingId,
        linkType: "FUNCTION",
        confidence: "0.90",
        functionSymbol: {
          canonicalName: "Vault.withdraw"
        }
      }
    ]);

    const response = await request(await createAnalysisIrApp())
      .get(`/api/v1/findings/${ids.findingId}/code-links`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(analysisIrRepository.findingCodeLinks).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body).toEqual([
      expect.objectContaining({
        findingId: ids.findingId,
        linkType: "FUNCTION",
        functionSymbol: expect.objectContaining({ canonicalName: "Vault.withdraw" })
      })
    ]);
  });
});

async function createAnalysisIrApp() {
  const { scanRoutes } = await import("../../apps/api/src/modules/scans/scans.routes.js");
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/scans", scanRoutes);
  app.use("/api/v1/findings", findingRoutes);
  app.use(errorHandler);
  return app;
}
