import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  scanId: "00000000-0000-4000-8000-000000000002",
  findingId: "00000000-0000-4000-8000-000000000003",
  evidenceId: "00000000-0000-4000-8000-000000000004"
};

const repository = vi.hoisted(() => ({
  listByScan: vi.fn(),
  findById: vi.fn(),
  listEvidence: vi.fn(),
  evidenceSummary: vi.fn()
}));

vi.mock("../../apps/api/src/modules/findings/findings.repository.js", () => ({
  FindingsRepository: vi.fn(function FindingsRepository() {
    return repository;
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

describe("findings API", () => {
  it("returns persisted findings for a scan through the repository-backed endpoint", async () => {
    repository.listByScan.mockResolvedValue([
      {
        id: ids.findingId,
        scanId: ids.scanId,
        title: "External call before state update",
        severity: "HIGH",
        confidenceState: "SUPPORTED",
        priorityScore: 77.32,
        evidenceItems: [
          {
            id: ids.evidenceId,
            findingId: ids.findingId,
            evidenceType: "ANALYZER",
            filePath: "contracts/Vault.sol",
            startLine: 3,
            endLine: 5,
            ruleId: "solidity.reentrancy.external-call",
            analyzerRun: {
              id: "00000000-0000-4000-8000-000000000005",
              toolName: "semgrep",
              status: "COMPLETED"
            }
          }
        ]
      }
    ]);

    const app = await createFindingsOnlyApp();
    const response = await request(app)
      .get(`/api/v1/scans/${ids.scanId}/findings`)
      .query({ organizationId: ids.organizationId, limit: 10 })
      .expect(200);

    expect(repository.listByScan).toHaveBeenCalledWith(
      ids.scanId,
      expect.objectContaining({ organizationId: ids.organizationId, limit: 10 })
    );
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: ids.findingId,
      confidenceState: "SUPPORTED",
      evidenceItems: [
        expect.objectContaining({
          evidenceType: "ANALYZER",
          filePath: "contracts/Vault.sol",
          startLine: 3
        })
      ]
    });
  });

  it("returns persisted evidence rows for a finding", async () => {
    repository.listEvidence.mockResolvedValue([
      {
        id: ids.evidenceId,
        findingId: ids.findingId,
        evidenceType: "ANALYZER",
        filePath: "contracts/Vault.sol",
        startLine: 3,
        endLine: 5,
        ruleId: "solidity.reentrancy.external-call",
        rawArtifactPath: "scanner-runs/scan-1/semgrep/run/semgrep.json",
        analyzerRun: {
          id: "00000000-0000-4000-8000-000000000005",
          toolName: "semgrep",
          status: "COMPLETED"
        }
      }
    ]);

    const app = await createFindingsOnlyApp();
    const response = await request(app)
      .get(`/api/v1/findings/${ids.findingId}/evidence`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(repository.listEvidence).toHaveBeenCalledWith(ids.findingId, ids.organizationId);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: ids.evidenceId,
        evidenceType: "ANALYZER",
        rawArtifactPath: "scanner-runs/scan-1/semgrep/run/semgrep.json"
      })
    ]);
  });

  it("returns persisted evidence summary without static fallback data", async () => {
    repository.evidenceSummary.mockResolvedValue({
      scanId: ids.scanId,
      organizationId: ids.organizationId,
      analyzerRuns: [
        {
          id: "00000000-0000-4000-8000-000000000005",
          toolName: "semgrep",
          status: "COMPLETED"
        },
        {
          id: "00000000-0000-4000-8000-000000000006",
          toolName: "mythril",
          status: "TOOL_NOT_INSTALLED",
          error: "mythril command not found"
        }
      ],
      findingCount: 1,
      evidenceCount: 1,
      severityCounts: { HIGH: 1 },
      stateCounts: { SUPPORTED: 1 },
      maxPriorityScore: 77.32,
      maxExploitabilityScore: 67,
      averageEvidenceQuality: 96
    });

    const app = await createFindingsOnlyApp();
    const response = await request(app)
      .get(`/api/v1/scans/${ids.scanId}/evidence-summary`)
      .query({ organizationId: ids.organizationId })
      .expect(200);

    expect(repository.evidenceSummary).toHaveBeenCalledWith(ids.scanId, ids.organizationId);
    expect(response.body).toMatchObject({
      scanId: ids.scanId,
      findingCount: 1,
      analyzerRuns: [
        expect.objectContaining({ toolName: "semgrep", status: "COMPLETED" }),
        expect.objectContaining({ toolName: "mythril", status: "TOOL_NOT_INSTALLED" })
      ]
    });
  });
});

async function createFindingsOnlyApp() {
  const { findingRoutes } = await import("../../apps/api/src/modules/findings/findings.routes.js");
  const { scanRoutes } = await import("../../apps/api/src/modules/scans/scans.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/scans", scanRoutes);
  app.use("/api/v1/findings", findingRoutes);
  app.use(errorHandler);
  return app;
}
