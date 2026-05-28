import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { redactSecretLikeValues } from "../../../apps/api/src/common/logging/redaction";
import { GitHubIntegrationService } from "../../../apps/api/src/modules/github/github.service";
import { verifyGitHubWebhookSignature } from "../../../apps/api/src/modules/github/github.security";

const configured = () => ({
  configured: true,
  status: "CONFIGURED" as const,
  message: "GitHub App configured",
  appName: "Web3Guard",
  missing: [],
  clientConfigured: true,
  webhookConfigured: true
});

describe("P12 GitHub integration", () => {
  it("reports missing GitHub config as not configured", async () => {
    const service = new GitHubIntegrationService(fakeRepository() as never, () => ({
      configured: false,
      status: "NOT_CONFIGURED",
      message: "GitHub App not configured",
      appName: null,
      missing: ["GITHUB_APP_ID"],
      clientConfigured: false,
      webhookConfigured: false
    }));

    await expect(service.status({ organizationId: "org-1" })).resolves.toMatchObject({
      configured: false,
      message: "GitHub App not configured"
    });
  });

  it("rejects invalid webhook signatures and accepts valid HMAC signatures", () => {
    const raw = Buffer.from(JSON.stringify({ action: "created" }));
    const valid = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;

    expect(verifyGitHubWebhookSignature(raw, "sha256=bad", "secret")).toBe(false);
    expect(verifyGitHubWebhookSignature(raw, valid, "secret")).toBe(true);
  });

  it("handles installation events for mapped installations without fabricating scan results", async () => {
    const repository = fakeRepository({
      installationByExternalId: vi.fn(async () => ({
        id: "installation-row",
        organizationId: "org-1",
        installationId: 123n
      })),
      updateInstallationStatus: vi.fn(async () => ({ count: 1 }))
    });
    const service = new GitHubIntegrationService(repository as never, configured, () => true);

    const response = await service.handleWebhook({
      rawBody: Buffer.from("{}"),
      signature: "sha256=valid",
      deliveryId: "delivery-1",
      eventName: "installation",
      payload: { action: "suspend", installation: { id: 123 } }
    });

    expect(response.status).toBe("PROCESSED");
    expect(repository.updateInstallationStatus).toHaveBeenCalledWith(123n, "SUSPENDED");
    expect(repository.createRepositoryScan).not.toHaveBeenCalled();
  });

  it("handles repository add and remove events for mapped installations", async () => {
    const repository = fakeRepository({
      installationByExternalId: vi.fn(async () => ({
        id: "installation-row",
        organizationId: "org-1",
        installationId: 123n
      }))
    });
    const service = new GitHubIntegrationService(repository as never, configured, () => true);

    await service.handleWebhook({
      rawBody: Buffer.from("{}"),
      signature: "sha256=valid",
      deliveryId: "delivery-2",
      eventName: "installation_repositories",
      payload: {
        action: "added",
        installation: { id: 123 },
        repositories_added: [{ id: 99, full_name: "owner/repo", default_branch: "main", private: true }],
        repositories_removed: [{ full_name: "owner/old" }]
      }
    });

    expect(repository.upsertRepository).toHaveBeenCalledWith(expect.objectContaining({ repoFullName: "owner/repo" }));
    expect(repository.removeRepository).toHaveBeenCalledWith("org-1", "owner/old");
  });

  it("denies cross-tenant and wrong-scope repository scans", async () => {
    const service = new GitHubIntegrationService(fakeRepository({
      repository: vi.fn(async () => null)
    }) as never, configured);

    await expect(service.scanRepository("org-1", "repo-foreign", {
      organizationId: "org-1",
      apiKeyId: "key-1",
      githubRepositoryId: "repo-other"
    }, {})).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("denies CI API keys scoped to a different repository", async () => {
    const repository = fakeRepository({
      repository: vi.fn(async () => ({
        id: "repo-1",
        organizationId: "org-1",
        projectId: null,
        repoFullName: "owner/repo",
        installationId: 123n
      }))
    });
    const service = new GitHubIntegrationService(repository as never, configured);

    await expect(service.scanRepository("org-1", "repo-1", {
      organizationId: "org-1",
      apiKeyId: "key-1",
      githubRepositoryId: "repo-2"
    }, { source: "CI" })).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(repository.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "api_key_scope_denied" }));
  });

  it("redacts GitHub tokens and private keys from log values", () => {
    expect(redactSecretLikeValues("token ghs_secretTokenValue")).toContain("[REDACTED_GITHUB_TOKEN]");
    expect(redactSecretLikeValues("-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----")).toBe("[REDACTED_PRIVATE_KEY]");
  });
});

function fakeRepository(overrides: Record<string, unknown> = {}) {
  return {
    audit: vi.fn(async () => ({})),
    listInstallations: vi.fn(async () => []),
    listRepositories: vi.fn(async () => []),
    repository: vi.fn(async () => null),
    project: vi.fn(async () => ({ id: "project-1" })),
    projectMember: vi.fn(async () => ({ id: "member-1" })),
    installationByExternalId: vi.fn(async () => null),
    upsertInstallation: vi.fn(async () => ({ id: "installation-row", installationId: 123n })),
    updateInstallationStatus: vi.fn(async () => ({ count: 1 })),
    upsertRepository: vi.fn(async (input) => ({ id: "repo-row", ...input })),
    removeRepository: vi.fn(async () => ({ count: 1 })),
    createRepositoryScan: vi.fn(async (input) => ({ id: "scan-row", ...input })),
    listRepositoryScans: vi.fn(async () => []),
    recordWebhookEvent: vi.fn(async (input) => ({ id: "event-row", ...input })),
    ...overrides
  };
}
