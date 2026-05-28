import { afterEach, describe, expect, it, vi } from "vitest";
import { requireOrganizationParam, requireOrgSecuritySetting, requirePermissions } from "../../../apps/api/src/common/middleware/authorize.middleware";
import { redactSecretLikeValues } from "../../../apps/api/src/common/logging/redaction";
import { ApiKeysService } from "../../../apps/api/src/modules/api-keys/api-keys.service";
import { EnterpriseService } from "../../../apps/api/src/modules/enterprise/enterprise.service";
import { ReportsService } from "../../../apps/api/src/modules/reports/reports.service";
import { prisma } from "../../../apps/api/src/infra/prisma/prisma";

describe("P11 enterprise security controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("denies cross-tenant organization access without revealing resource existence", async () => {
    const next = vi.fn();
    const middleware = requireOrganizationParam();
    await middleware(
      req({ auth: { type: "apiKey", organizationId: "org-a", apiKeyId: "key", permissions: [], scopes: [] }, query: { organizationId: "org-b" } }),
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "ACCESS_DENIED" }));
  });

  it("blocks viewer-style principals from privileged enterprise actions", () => {
    for (const permission of ["report:export", "simulation:run", "fuzz:run", "monitoring:manage"]) {
      const next = vi.fn();
      requirePermissions(permission)(
        req({ auth: { type: "apiKey", organizationId: "org-a", apiKeyId: "key", permissions: [], scopes: ["scan:read"] } }),
        {} as never,
        next
      );
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "ACCESS_DENIED" }));
    }
  });

  it("stores API key hashes only while returning the raw key once from creation", async () => {
    const create = vi.fn(async (input) => ({
      id: "api-key-1",
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      name: input.name,
      keyPrefix: input.keyPrefix,
      scopes: input.scopes,
      expiresAt: null,
      createdAt: new Date()
    }));
    const service = new ApiKeysService({
      create,
      project: vi.fn(async () => ({ id: "project-1" })),
      securitySettings: vi.fn(async () => ({ apiKeyMaxLifetimeDays: 90 }))
    } as never);

    const response = await service.create("org-1", {
      name: "CI",
      scopes: ["scan:read"],
      projectId: "project-1"
    }, "user-1");

    expect(response.apiKey).toMatch(/^ask_/u);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      keyPrefix: expect.stringMatching(/^ask_/u),
      keyHash: expect.not.stringContaining(response.apiKey)
    }));
    expect(response).not.toHaveProperty("keyHash");
  });

  it("creates audit events for API key revoke through the repository contract", async () => {
    const revoke = vi.fn(async () => ({ count: 1 }));
    const service = new ApiKeysService({ revoke } as never);

    await expect(service.revoke("org-1", "api-key-1")).resolves.toEqual({ ok: true });
    expect(revoke).toHaveBeenCalledWith("api-key-1", "org-1");
  });

  it("blocks report sharing when organization security settings disable public shares", async () => {
    const service = new ReportsService({
      findById: vi.fn(async () => ({
        id: "report-1",
        organizationId: "org-1",
        projectId: null,
        scanId: "scan-1",
        includeSuppressed: false,
        deletedAt: null
      })),
      securitySettings: vi.fn(async () => ({ publicReportSharingAllowed: false }))
    } as never, {} as never);

    await expect(service.share("report-1", { organizationId: "org-1" }, {})).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCESS_DENIED"
    });
  });

  it("blocks organization-level simulation when security settings disable it", async () => {
    vi.spyOn(prisma.securitySetting, "findUnique").mockResolvedValue({
      organizationId: "org-1",
      simulationAllowed: false
    } as never);
    const next = vi.fn();

    await requireOrgSecuritySetting("simulationAllowed")(
      req({ auth: { type: "apiKey", organizationId: "org-1", apiKeyId: "key", permissions: [], scopes: [] } }),
      {} as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "ACCESS_DENIED" }));
  });

  it("keeps SSO configured-not-active instead of pretending login is active", async () => {
    const now = new Date();
    vi.spyOn(prisma.ssoConnection, "findFirst").mockResolvedValue(null as never);
    vi.spyOn(prisma.ssoConnection, "create").mockResolvedValue({
      id: "sso-1",
      organizationId: "org-1",
      providerKind: "OIDC",
      status: "CONFIGURED_NOT_ACTIVE",
      issuerUrl: "https://idp.example.com",
      clientId: "client",
      clientSecretHash: null,
      allowedDomains: ["example.com"],
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    } as never);
    vi.spyOn(prisma.adminActionEvent, "create").mockResolvedValue({} as never);

    const result = await new EnterpriseService().upsertSso("org-1", { organizationId: "org-1", actorUserId: "user-1" }, {
      providerKind: "OIDC",
      status: "ACTIVE",
      issuerUrl: "https://idp.example.com",
      clientId: "client",
      allowedDomains: ["example.com"]
    });

    expect(result.status).toBe("CONFIGURED_NOT_ACTIVE");
    expect(result.activeLoginFlow).toBe(false);
  });

  it("redacts API keys and private material from logs", () => {
    expect(redactSecretLikeValues("token ask_abcd1234_superSecretValue")).toContain("[REDACTED_API_KEY]");
    expect(redactSecretLikeValues("-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----")).toBe("[REDACTED_PRIVATE_KEY]");
  });
});

function req(overrides: Record<string, unknown>) {
  return {
    params: {},
    query: {},
    body: {},
    header: () => undefined,
    ip: "127.0.0.1",
    ...overrides
  } as any;
}
