import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../apps/api/src/common/errors/api-error.js";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  findingId: "00000000-0000-4000-8000-000000000003",
  signatureId: "00000000-0000-4000-8000-000000000004"
};

const threatService = vi.hoisted(() => ({
  listThreatIntel: vi.fn(),
  createThreatIntel: vi.fn(),
  importThreatIntel: vi.fn(),
  listThreatSignatures: vi.fn(),
  createThreatSignature: vi.fn(),
  getThreatSignature: vi.fn(),
  matchSignatureToScan: vi.fn(),
  listScanMatches: vi.fn(),
  listFindingMatches: vi.fn(),
  listDetectorPrecision: vi.fn(),
  addFalsePositiveFeedback: vi.fn(),
  listFalsePositiveFeedback: vi.fn(),
  scanThreatSummary: vi.fn()
}));

vi.mock("../../apps/api/src/modules/threat-knowledge/threat.service.js", () => ({
  ThreatKnowledgeService: vi.fn(function ThreatKnowledgeService() {
    return threatService;
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

describe("Threat knowledge API", () => {
  it("returns persisted threat summary data only", async () => {
    threatService.scanThreatSummary.mockResolvedValue({
      scanId: ids.scanId,
      matchCount: 1,
      matches: [{
        id: "match-1",
        status: "MATCHED",
        confidence: "HIGH",
        evidenceIdsUsed: ["evidence-1"],
        missingEvidence: [],
        signature: { id: ids.signatureId, name: "Defensive reentrancy signature", kind: "REENTRANCY" }
      }],
      detectorPrecisionMetrics: [],
      falsePositiveFeedback: [],
      incidentReferences: [],
      limitations: ["Signature match is not proof."]
    });

    const response = await request(await createThreatApp())
      .get(`/api/v1/scans/${ids.scanId}/threat-summary`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(threatService.scanThreatSummary).toHaveBeenCalledWith(ids.scanId, ids.organizationId);
    expect(response.body.matches).toEqual([
      expect.objectContaining({
        evidenceIdsUsed: ["evidence-1"],
        signature: expect.objectContaining({ kind: "REENTRANCY" })
      })
    ]);
  });

  it("propagates provenance validation failures for threat intel creation", async () => {
    threatService.createThreatIntel.mockRejectedValue(ApiError.badRequest("Threat intel entries require provenance"));

    const response = await request(await createThreatApp())
      .post("/api/v1/threat-intel")
      .query({ organizationId: ids.organizationId })
      .send({
        sourceType: "PUBLIC_REPORT",
        confidence: "LOW",
        title: "Provenance-free item",
        summary: "This should be rejected by the service safety policy."
      })
      .expect(400);

    expect(response.body.error.message.toLowerCase()).toContain("require provenance");
  });

  it("routes false-positive feedback without changing finding state in the API layer", async () => {
    threatService.addFalsePositiveFeedback.mockResolvedValue({
      feedback: {
        id: "feedback-1",
        findingId: ids.findingId,
        reason: "Confirmed guarded by a reviewer-owned invariant.",
        confidence: "MEDIUM"
      },
      detectorPrecisionMetric: { id: "metric-1", precisionEstimate: "0.50" }
    });

    await request(await createThreatApp())
      .post(`/api/v1/findings/${ids.findingId}/false-positive-feedback`)
      .query({ organizationId: ids.organizationId })
      .send({ reason: "Confirmed guarded by a reviewer-owned invariant.", evidenceIds: ["evidence-1"] })
      .expect(201);

    expect(threatService.addFalsePositiveFeedback).toHaveBeenCalledWith(
      ids.findingId,
      expect.objectContaining({ organizationId: ids.organizationId }),
      expect.objectContaining({ reason: "Confirmed guarded by a reviewer-owned invariant." })
    );
  });
});

async function createThreatApp() {
  const { threatKnowledgeRoutes } = await import("../../apps/api/src/modules/threat-knowledge/threat.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1", threatKnowledgeRoutes);
  app.use(errorHandler);
  return app;
}
