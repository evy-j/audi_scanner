import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  findingId: "00000000-0000-4000-8000-000000000003",
  remediationId: "00000000-0000-4000-8000-000000000004"
};

const remediationService = vi.hoisted(() => ({
  findingRemediation: vi.fn(),
  remediateFinding: vi.fn(),
  scanSummary: vi.fn(),
  review: vi.fn(),
  markReviewed: vi.fn(),
  reject: vi.fn()
}));

vi.mock("../../apps/api/src/modules/remediation/remediation.service.js", () => ({
  RemediationService: vi.fn(function RemediationService() {
    return remediationService;
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

vi.mock("../../apps/api/src/modules/scans/scans.controller.js", () => ({
  ScansController: vi.fn(function ScansController() {
    return {
      create: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      cancel: vi.fn()
    };
  })
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

describe("remediation API", () => {
  it("returns persisted finding remediation data only", async () => {
    remediationService.findingRemediation.mockResolvedValue({
      findingId: ids.findingId,
      scanId: ids.scanId,
      status: "SUCCEEDED",
      eligibility: { eligible: true, status: "ELIGIBLE", reason: null, guidanceOnly: false },
      runs: [
        {
          id: ids.remediationId,
          status: "SUCCEEDED",
          suggestions: [{ id: "suggestion-1", kind: "GUIDANCE" }],
          diffs: [{ id: "diff-1", requiresHumanReview: true }],
          testSuggestions: [],
          checklistItems: []
        }
      ]
    });

    const response = await request(await createRemediationApp())
      .get(`/api/v1/findings/${ids.findingId}/remediation`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(remediationService.findingRemediation).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body.runs).toEqual([
      expect.objectContaining({
        id: ids.remediationId,
        suggestions: [expect.objectContaining({ kind: "GUIDANCE" })]
      })
    ]);
  });

  it("routes remediation review actions to persisted remediation records", async () => {
    remediationService.markReviewed.mockResolvedValue({
      id: ids.remediationId,
      reviewedAt: "2026-05-24T00:00:00.000Z"
    });

    const response = await request(await createRemediationApp())
      .post(`/api/v1/remediations/${ids.remediationId}/mark-reviewed`)
      .query({ organizationId: ids.organizationId })
      .send({ comment: "Reviewed manually" })
      .expect(200);

    expect(remediationService.markReviewed).toHaveBeenCalledWith(
      ids.remediationId,
      expect.objectContaining({ organizationId: ids.organizationId }),
      { comment: "Reviewed manually" }
    );
    expect(response.body).toMatchObject({ id: ids.remediationId });
  });
});

async function createRemediationApp() {
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const { scanRoutes } = await import("../../apps/api/src/modules/scans/scans.routes.js");
  const { remediationRoutes } = await import("../../apps/api/src/modules/remediation/remediation.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/scans", scanRoutes);
  app.use("/api/v1/findings", findingRoutes);
  app.use("/api/v1/remediations", remediationRoutes);
  app.use(errorHandler);
  return app;
}
