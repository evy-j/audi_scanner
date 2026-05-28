import { createSign } from "node:crypto";
import { ApiError } from "../../common/errors/api-error.js";
import { env } from "../../config/environment.js";
import { githubAppConfigStatus, githubPrivateKey } from "./github.config.js";
import { GitHubIntegrationRepository, type GitHubActor } from "./github.repository.js";
import { redactGitHubPayload, safeRepoFullName, sha256Hex, verifyGitHubWebhookSignature } from "./github.security.js";

type WebhookPayload = Record<string, any>;

export class GitHubIntegrationService {
  constructor(
    private readonly repository = new GitHubIntegrationRepository(),
    private readonly configStatus = githubAppConfigStatus,
    private readonly verifySignature = verifyGitHubWebhookSignature
  ) {}

  async status(actor?: Partial<GitHubActor>) {
    const status = this.configStatus();
    if (actor?.organizationId) {
      await this.repository.audit({
        organizationId: actor.organizationId,
        actorUserId: actor.actorUserId,
        action: "github_app_config_checked",
        resourceType: "GITHUB_APP",
        metadata: { status: status.status, missing: status.missing }
      }).catch(() => undefined);
    }
    return status;
  }

  async listInstallations(orgId: string) {
    const status = this.configStatus();
    if (!status.configured) return { github: status, installations: [] };
    return { github: status, installations: serialize(await this.repository.listInstallations(orgId)) };
  }

  async connectInstallation(orgId: string, actor: GitHubActor, input: {
    installationId: string | number;
    accountLogin: string;
    accountType?: string;
  }) {
    const status = this.configStatus();
    if (!status.configured) {
      throw ApiError.serviceUnavailable("GitHub App not configured", { status: "NOT_CONFIGURED" });
    }
    const installation = await this.repository.upsertInstallation({
      organizationId: orgId,
      installationId: BigInt(input.installationId),
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      connectedByUserId: actor.actorUserId,
      status: "ACTIVE",
      metadata: { source: "manual_connection" }
    });
    await this.repository.audit({
      organizationId: orgId,
      actorUserId: actor.actorUserId,
      action: "github_installation_connected",
      resourceType: "GITHUB_INSTALLATION",
      resourceId: installation.id,
      metadata: { installationId: installation.installationId.toString(), accountLogin: input.accountLogin }
    });
    return serialize(installation);
  }

  async listRepositories(orgId: string) {
    return { repositories: serialize(await this.repository.listRepositories(orgId)) };
  }

  async connectRepository(orgId: string, actor: GitHubActor, input: {
    projectId?: string;
    installationId: string | number;
    repoFullName: string;
    githubRepositoryId?: string | number;
    defaultBranch?: string;
    visibility?: string;
  }) {
    if (input.projectId) {
      const project = await this.repository.project(input.projectId, orgId);
      if (!project) throw ApiError.accessDenied("Access denied");
    }
    const parsed = safeRepoFullName(input.repoFullName);
    const installation = await this.repository.installationByExternalId(BigInt(input.installationId));
    if (!installation || installation.organizationId !== orgId) {
      throw ApiError.accessDenied("Access denied");
    }
    const repository = await this.repository.upsertRepository({
      organizationId: orgId,
      projectId: input.projectId,
      githubInstallationId: installation.id,
      githubRepositoryId: input.githubRepositoryId ? BigInt(input.githubRepositoryId) : null,
      installationId: BigInt(input.installationId),
      repoOwner: parsed.owner,
      repoName: parsed.name,
      repoFullName: parsed.fullName,
      defaultBranch: input.defaultBranch,
      visibility: input.visibility,
      connectedByUserId: actor.actorUserId,
      metadata: { source: "manual_connection" }
    });
    await this.repository.audit({
      organizationId: orgId,
      projectId: input.projectId,
      actorUserId: actor.actorUserId,
      action: "github_repository_connected",
      resourceType: "GITHUB_REPOSITORY",
      resourceId: repository.id,
      metadata: { repoFullName: repository.repoFullName }
    });
    return serialize(repository);
  }

  async scanRepository(orgId: string, repoId: string, actor: GitHubActor, input: {
    branch?: string;
    commitSha?: string;
    pullRequestNumber?: number;
    source?: "GITHUB_APP" | "CLI" | "CI";
  }) {
    const repository = await this.repository.repository(repoId, orgId);
    await this.assertRepositoryAccess(repository, actor);
    const source = input.source ?? "GITHUB_APP";
    const config = this.configStatus();
    if (!config.configured && source === "GITHUB_APP") {
      const scan = await this.repository.createRepositoryScan({
        organizationId: orgId,
        projectId: repository.projectId,
        githubRepositoryId: repository.id,
        source,
        status: "PROVIDER_NOT_CONFIGURED",
        branch: input.branch,
        commitSha: input.commitSha,
        pullRequestNumber: input.pullRequestNumber,
        requestedByUserId: actor.actorUserId,
        apiKeyId: actor.apiKeyId,
        errorCategory: "GITHUB_APP_NOT_CONFIGURED",
        logs: { message: "GitHub App not configured" }
      });
      await this.auditScan("github_repository_scan_failed", repository, actor, scan.id, { status: "PROVIDER_NOT_CONFIGURED" });
      return serialize(scan);
    }

    if (source === "GITHUB_APP") {
      const tokenStatus = await this.installationTokenReadiness(repository.installationId);
      if (tokenStatus.status !== "READY") {
        const scan = await this.repository.createRepositoryScan({
          organizationId: orgId,
          projectId: repository.projectId,
          githubRepositoryId: repository.id,
          source,
          status: tokenStatus.status === "TOKEN_ERROR" ? "TOKEN_ERROR" : "PROVIDER_NOT_CONFIGURED",
          branch: input.branch,
          commitSha: input.commitSha,
          pullRequestNumber: input.pullRequestNumber,
          requestedByUserId: actor.actorUserId,
          apiKeyId: actor.apiKeyId,
          errorCategory: tokenStatus.status,
          logs: { message: tokenStatus.message }
        });
        await this.auditScan("github_repository_scan_failed", repository, actor, scan.id, tokenStatus);
        return serialize(scan);
      }
    }

    const scan = await this.repository.createRepositoryScan({
      organizationId: orgId,
      projectId: repository.projectId,
      githubRepositoryId: repository.id,
      source,
      status: "MANUAL_SETUP_REQUIRED",
      branch: input.branch,
      commitSha: input.commitSha,
      pullRequestNumber: input.pullRequestNumber,
      requestedByUserId: actor.actorUserId,
      apiKeyId: actor.apiKeyId,
      errorCategory: "SOURCE_ARCHIVE_NOT_CONFIGURED",
      logs: {
        message: "Repository scan request persisted. Safe source archive ingestion is required before enqueueing the P0 scan pipeline.",
        safety: "No untrusted code was executed."
      }
    });
    await this.auditScan(source === "CI" ? "ci_scan_requested" : source === "CLI" ? "cli_scan_requested" : "github_repository_scan_requested", repository, actor, scan.id, { status: scan.status });
    return serialize(scan);
  }

  async listRepositoryScans(orgId: string, repoId: string, actor: GitHubActor) {
    const repository = await this.repository.repository(repoId, orgId);
    await this.assertRepositoryAccess(repository, actor);
    return { scans: serialize(await this.repository.listRepositoryScans(orgId, repoId)) };
  }

  async handleWebhook(input: {
    rawBody: Buffer;
    signature: string | undefined;
    deliveryId: string;
    eventName: string;
    payload: WebhookPayload;
  }) {
    const valid = this.verifySignature(input.rawBody, input.signature);
    const payloadHash = sha256Hex(input.rawBody);
    if (!valid) {
      await this.repository.recordWebhookEvent({
        deliveryId: input.deliveryId,
        eventName: input.eventName,
        action: actionOf(input.payload),
        signatureValid: false,
        status: "DENIED",
        payloadSha256: payloadHash,
        metadata: { reason: "invalid_signature" }
      });
      await this.repository.audit({
        action: "github_webhook_denied",
        resourceType: "GITHUB_WEBHOOK",
        resourceId: input.deliveryId,
        metadata: { eventName: input.eventName, reason: "invalid_signature" }
      }).catch(() => undefined);
      throw ApiError.unauthorized("Invalid GitHub webhook signature");
    }

    const installationId = installationIdOf(input.payload);
    const installation = installationId ? await this.repository.installationByExternalId(installationId) : null;
    const eventRecord = await this.repository.recordWebhookEvent({
      organizationId: installation?.organizationId,
      githubInstallationId: installation?.id,
      deliveryId: input.deliveryId,
      eventName: input.eventName,
      action: actionOf(input.payload),
      signatureValid: true,
      status: "VERIFIED",
      payloadSha256: payloadHash,
      metadata: minimalWebhookMetadata(input.payload)
    });
    await this.repository.audit({
      organizationId: installation?.organizationId,
      action: "github_webhook_received",
      resourceType: "GITHUB_WEBHOOK",
      resourceId: eventRecord.id,
      metadata: { eventName: input.eventName, action: actionOf(input.payload) }
    }).catch(() => undefined);

    const result = await this.processVerifiedWebhook(input.eventName, input.payload, installation);
    await this.repository.recordWebhookEvent({
      organizationId: installation?.organizationId,
      githubInstallationId: installation?.id,
      deliveryId: input.deliveryId,
      eventName: input.eventName,
      action: actionOf(input.payload),
      signatureValid: true,
      status: "PROCESSED",
      payloadSha256: payloadHash,
      metadata: result
    });
    return { ok: true, status: "PROCESSED", result };
  }

  createInstallationJwt(now = Math.floor(Date.now() / 1000)): string {
    const key = githubPrivateKey();
    if (!env.GITHUB_APP_ID || !key) {
      throw ApiError.serviceUnavailable("GitHub App not configured", { status: "NOT_CONFIGURED" });
    }
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: env.GITHUB_APP_ID }));
    const signingInput = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256").update(signingInput).sign(key);
    return `${signingInput}.${base64Url(signature)}`;
  }

  async installationTokenReadiness(installationId: bigint): Promise<{ status: "READY" | "PROVIDER_NOT_CONFIGURED" | "TOKEN_ERROR"; message: string }> {
    const config = this.configStatus();
    if (!config.configured) return { status: "PROVIDER_NOT_CONFIGURED", message: "GitHub App not configured" };
    try {
      this.createInstallationJwt();
      return { status: "READY", message: `Installation token can be requested for installation ${installationId.toString()}` };
    } catch {
      return { status: "TOKEN_ERROR", message: "GitHub installation token could not be prepared" };
    }
  }

  async createInstallationAccessToken(installationId: bigint): Promise<string> {
    const jwt = this.createInstallationJwt();
    const response = await fetch(`https://api.github.com/app/installations/${installationId.toString()}/access_tokens`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": env.GITHUB_APP_NAME ?? "Web3Guard"
      }
    });
    if (!response.ok) {
      throw ApiError.serviceUnavailable("GitHub installation token could not be created", { status: "TOKEN_ERROR" });
    }
    const body = await response.json() as { token?: string };
    if (!body.token) {
      throw ApiError.serviceUnavailable("GitHub installation token could not be created", { status: "TOKEN_ERROR" });
    }
    return body.token;
  }

  private async processVerifiedWebhook(eventName: string, payload: WebhookPayload, installation: Awaited<ReturnType<GitHubIntegrationRepository["installationByExternalId"]>>) {
    if (!installation) {
      return { status: "NOT_ASSESSED", reason: "No organization mapping exists for this installation" };
    }
    const action = actionOf(payload);
    if (eventName === "installation") {
      if (["deleted", "suspend"].includes(action ?? "")) {
        await this.repository.updateInstallationStatus(installation.installationId, action === "deleted" ? "DELETED" : "SUSPENDED");
        await this.repository.audit({ organizationId: installation.organizationId, action: action === "deleted" ? "github_installation_removed" : "github_installation_suspended", resourceType: "GITHUB_INSTALLATION", resourceId: installation.id });
        return { status: "UPDATED", installationStatus: action === "deleted" ? "DELETED" : "SUSPENDED" };
      }
      if (action === "unsuspend") {
        await this.repository.updateInstallationStatus(installation.installationId, "ACTIVE");
        return { status: "UPDATED", installationStatus: "ACTIVE" };
      }
    }
    if (eventName === "installation_repositories") {
      const repositories = Array.isArray(payload.repositories_added) ? payload.repositories_added : [];
      for (const repository of repositories) {
        const fullName = String(repository.full_name ?? "");
        if (!fullName.includes("/")) continue;
        const parsed = safeRepoFullName(fullName);
        const persisted = await this.repository.upsertRepository({
          organizationId: installation.organizationId,
          githubInstallationId: installation.id,
          githubRepositoryId: repository.id ? BigInt(repository.id) : null,
          installationId: installation.installationId,
          repoOwner: parsed.owner,
          repoName: parsed.name,
          repoFullName: parsed.fullName,
          defaultBranch: repository.default_branch,
          visibility: repository.private ? "private" : "public",
          metadata: { source: "installation_repositories" }
        });
        await this.repository.audit({ organizationId: installation.organizationId, action: "github_repository_connected", resourceType: "GITHUB_REPOSITORY", resourceId: persisted.id, metadata: { repoFullName: parsed.fullName } });
      }
      const removed = Array.isArray(payload.repositories_removed) ? payload.repositories_removed : [];
      for (const repository of removed) {
        const fullName = String(repository.full_name ?? "");
        if (!fullName) continue;
        await this.repository.removeRepository(installation.organizationId, fullName);
        await this.repository.audit({ organizationId: installation.organizationId, action: "github_repository_removed", resourceType: "GITHUB_REPOSITORY", resourceId: fullName });
      }
      return { status: "PROCESSED", repositoriesAdded: repositories.length, repositoriesRemoved: removed.length };
    }
    if (["push", "pull_request", "check_suite", "check_run"].includes(eventName)) {
      return { status: "OBSERVED", eventName, repository: payload.repository?.full_name ?? null, safety: "No scan was fabricated or auto-confirmed." };
    }
    return { status: "RECEIVED", eventName };
  }

  private async assertRepositoryAccess(repository: Awaited<ReturnType<GitHubIntegrationRepository["repository"]>>, actor: GitHubActor): Promise<NonNullable<typeof repository>> {
    if (!repository || repository.organizationId !== actor.organizationId) {
      throw ApiError.accessDenied("Access denied");
    }
    if (actor.githubRepositoryId && actor.githubRepositoryId !== repository.id) {
      await this.repository.audit({
        organizationId: actor.organizationId,
        projectId: repository.projectId,
        actorUserId: actor.actorUserId,
        action: "api_key_scope_denied",
        resourceType: "GITHUB_REPOSITORY",
        resourceId: repository.id,
        metadata: { reason: "repository_scope_mismatch" }
      }).catch(() => undefined);
      throw ApiError.accessDenied("Access denied");
    }
    if (actor.apiKeyId) return repository;
    if (repository.projectId && actor.actorUserId) {
      const hasOrgWidePermission = (actor.permissions ?? []).some((permission) => ["*", "org:manage", "organizations:update", "repository:manage"].includes(permission));
      if (!hasOrgWidePermission) {
        const membership = await this.repository.projectMember(repository.projectId, actor.actorUserId);
        if (!membership) throw ApiError.accessDenied("Access denied");
      }
    }
    return repository;
  }

  private auditScan(action: string, repository: { organizationId: string; projectId: string | null; id: string; repoFullName: string }, actor: GitHubActor, scanId: string, metadata: unknown) {
    return this.repository.audit({
      organizationId: repository.organizationId,
      projectId: repository.projectId,
      actorUserId: actor.actorUserId,
      action,
      resourceType: "REPOSITORY_SCAN",
      resourceId: scanId,
      metadata: { repoFullName: repository.repoFullName, ...(redactGitHubPayload(metadata) as Record<string, unknown>) }
    });
  }
}

function installationIdOf(payload: WebhookPayload): bigint | null {
  const value = payload.installation?.id;
  if (value === undefined || value === null) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function actionOf(payload: WebhookPayload): string | null {
  return typeof payload.action === "string" ? payload.action : null;
}

function minimalWebhookMetadata(payload: WebhookPayload) {
  return redactGitHubPayload({
    action: actionOf(payload),
    installationId: payload.installation?.id ? String(payload.installation.id) : null,
    repository: payload.repository?.full_name ?? null,
    sender: payload.sender?.login ?? null
  });
}

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}
