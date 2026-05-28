import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  findingId: "00000000-0000-4000-8000-000000000003",
  projectId: "00000000-0000-4000-8000-000000000004"
};

const reviewRepository = vi.hoisted(() => ({
  getReview: vi.fn(),
  getReviewSummary: vi.fn(),
  changeStatus: vi.fn(),
  addComment: vi.fn(),
  assignFinding: vi.fn(),
  suppressFinding: vi.fn(),
  unsuppressFinding: vi.fn(),
  listSuppressionRules: vi.fn(),
  createSuppressionRule: vi.fn(),
  deleteSuppressionRule: vi.fn(),
  compareBaseline: vi.fn(),
  listCodeOwnerRules: vi.fn(),
  createCodeOwnerRule: vi.fn(),
  deleteCodeOwnerRule: vi.fn(),
  exportSarif: vi.fn()
}));

vi.mock("../../apps/api/src/modules/review/review.repository.js", () => ({
  ReviewRepository: vi.fn(function ReviewRepository() {
    return reviewRepository;
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

vi.mock("../../apps/api/src/modules/findings/findings.controller.js", () => ({
  FindingsController: vi.fn(function FindingsController() {
    return {
      listByScan: vi.fn(),
      get: vi.fn(),
      evidence: vi.fn(),
      evidenceSummary: vi.fn()
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

describe("review API", () => {
  it("returns repository-backed persisted review data", async () => {
    reviewRepository.getReview.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000005",
      findingId: ids.findingId,
      status: "NEEDS_REVIEW",
      events: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          action: "STATUS_CHANGED",
          previousValue: { status: "UNREVIEWED" },
          newValue: { status: "NEEDS_REVIEW" },
          reason: "Manual audit queue",
          createdAt: new Date("2026-05-23T00:00:00.000Z")
        }
      ]
    });

    const response = await request(await createReviewOnlyApp())
      .get(`/api/v1/findings/${ids.findingId}/review`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(reviewRepository.getReview).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body).toMatchObject({
      findingId: ids.findingId,
      effectiveStatus: "NEEDS_REVIEW",
      review: {
        status: "NEEDS_REVIEW",
        events: [
          expect.objectContaining({
            action: "STATUS_CHANGED",
            reason: "Manual audit queue"
          })
        ]
      }
    });
  });

  it("routes status changes through the repository-backed workflow", async () => {
    reviewRepository.changeStatus.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000005",
      findingId: ids.findingId,
      status: "ACCEPTED"
    });

    const response = await request(await createReviewOnlyApp())
      .post(`/api/v1/findings/${ids.findingId}/review/status`)
      .query({ organizationId: ids.organizationId })
      .send({ status: "ACCEPTED", reason: "Valid issue" })
      .expect(200);

    expect(reviewRepository.changeStatus).toHaveBeenCalledWith(
      ids.findingId,
      expect.objectContaining({ organizationId: ids.organizationId }),
      { status: "ACCEPTED", reason: "Valid issue" }
    );
    expect(response.body).toMatchObject({ status: "ACCEPTED" });
  });
});

async function createReviewOnlyApp() {
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const { scanRoutes } = await import("../../apps/api/src/modules/scans/scans.routes.js");
  const { projectRoutes } = await import("../../apps/api/src/modules/projects/projects.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/scans", scanRoutes);
  app.use("/api/v1/findings", findingRoutes);
  app.use("/api/v1/projects", projectRoutes);
  app.use(errorHandler);
  return app;
}
