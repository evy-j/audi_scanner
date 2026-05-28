import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../apps/api/src/common/errors/error-handler.js";

const githubService = vi.hoisted(() => ({
  status: vi.fn(),
  listInstallations: vi.fn(),
  connectInstallation: vi.fn(),
  listRepositories: vi.fn(),
  connectRepository: vi.fn(),
  scanRepository: vi.fn(),
  listRepositoryScans: vi.fn(),
  handleWebhook: vi.fn()
}));

const sourceIngestionService = vi.hoisted(() => ({
  scanRepository: vi.fn()
}));

vi.mock("../../apps/api/src/modules/github/github.service.js", () => ({
  GitHubIntegrationService: vi.fn(function GitHubIntegrationService() {
    return githubService;
  })
}));

vi.mock("../../apps/api/src/modules/source-ingestion/source-ingestion.service.js", () => ({
  SourceIngestionService: vi.fn(function SourceIngestionService() {
    return sourceIngestionService;
  })
}));

vi.mock("../../apps/api/src/common/middleware/api-key-auth.middleware.js", () => ({
  authenticateJwtOrApiKey: (req: any, _res: any, next: any) => {
    req.auth = {
      type: "apiKey",
      apiKeyId: "test-key",
      organizationId: "00000000-0000-4000-8000-000000000001",
      permissions: [],
      scopes: ["repository:read", "repository:scan", "repository:manage"]
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
      next()
}));

vi.mock("../../apps/api/src/common/middleware/rate-limit.middleware.js", () => ({
  scanRateLimit: (_req: any, _res: any, next: any) => next()
}));

describe("GitHub integration API", () => {
  it("returns persisted/configured GitHub status only", async () => {
    githubService.status.mockResolvedValue({
      configured: false,
      status: "NOT_CONFIGURED",
      message: "GitHub App not configured",
      missing: ["GITHUB_APP_ID"]
    });

    const response = await request(await createApp())
      .get("/api/v1/integrations/github/status")
      .expect(200);

    expect(response.body.message).toBe("GitHub App not configured");
  });

  it("routes repository scan requests through the repository-backed service", async () => {
    sourceIngestionService.scanRepository.mockResolvedValue({
      id: "scan-request-1",
      status: "MANUAL_SETUP_REQUIRED",
      source: "GITHUB_APP"
    });

    const response = await request(await createApp())
      .post("/api/v1/orgs/00000000-0000-4000-8000-000000000001/repositories/00000000-0000-4000-8000-000000000002/scan")
      .send({ branch: "main" })
      .expect(202);

    expect(response.body.status).toBe("MANUAL_SETUP_REQUIRED");
    expect(sourceIngestionService.scanRepository).toHaveBeenCalled();
  });

  it("accepts webhook route without API auth and delegates signature verification to service", async () => {
    githubService.handleWebhook.mockResolvedValue({ ok: true, status: "PROCESSED" });

    await request(await createApp())
      .post("/api/v1/github/webhook")
      .set("x-github-delivery", "delivery-1")
      .set("x-github-event", "installation")
      .set("x-hub-signature-256", "sha256=valid")
      .send({ action: "created", installation: { id: 1 } })
      .expect(200);

    expect(githubService.handleWebhook).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "delivery-1",
      eventName: "installation"
    }));
  });
});

async function createApp() {
  const { githubIntegrationRoutes, githubWebhookRoutes } = await import("../../apps/api/src/modules/github/github.routes.js");
  const app = express();
  app.use(express.json({ verify: (req: any, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
  app.use("/api/v1", githubWebhookRoutes);
  app.use("/api/v1", githubIntegrationRoutes);
  app.use(errorHandler);
  return app;
}
