import { ApiError } from "../../common/errors/api-error.js";
import { githubAppConfigStatus } from "../github/github.config.js";
import { GitHubIntegrationService } from "../github/github.service.js";
import { ScansService } from "../scans/scans.service.js";
import { createSourceArtifactStore, type SourceArtifactStore } from "./source-artifact-store.js";
import { SourceIngestionRepository, type SourceActor } from "./source-ingestion.repository.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import type { PullRequestScanInput, RepositoryIngestInput, RepositoryScanInput, SourceArtifactUploadInput } from "./source-ingestion.schemas.js";
import {
  buildSourceIgnoreRules,
  evaluateSourceFiles,
  normalizeSourcePath,
  sourceIgnoreReasonForPath,
  type SourceFileCandidate
} from "./source-policy.js";

type RepositoryRecord = Awaited<ReturnType<SourceIngestionRepository["repository"]>>;

export class SourceIngestionService {
  constructor(
    private readonly repository = new SourceIngestionRepository(),
    private readonly store: SourceArtifactStore = createSourceArtifactStore(),
    private readonly github = new GitHubIntegrationService(),
    private readonly scans = new ScansService(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async uploadSourceArtifact(actor: SourceActor, input: SourceArtifactUploadInput) {
    await this.assertOrganizationAccess(input.organizationId, actor, "repository:scan");
    if (input.projectId) await this.assertProjectAccess(input.projectId, input.organizationId, actor);

    const files = decodeUploadFiles(input.files);
    const evaluation = evaluateSourceFiles(files, {
      maxFileBytes: input.maxFileBytes,
      maxTotalBytes: input.maxTotalBytes,
      include: input.include,
      exclude: input.exclude
    });

    if (input.dryRun) {
      return {
        ok: evaluation.files.length > 0,
        dryRun: true,
        policyStatus: evaluation.status,
        manifest: evaluation.manifest
      };
    }

    await this.usageLimits.assertAndConsume(input.organizationId, "SOURCE_ARTIFACTS_PER_MONTH", {
      resourceType: "SOURCE_ARTIFACT"
    });

    const repository = input.repositoryId ? await this.repository.repository(input.repositoryId, input.organizationId) : null;
    if (input.repositoryId) await this.assertRepositoryAccess(repository, actor, "repository:scan");

    const run = await this.repository.createRun({
      organizationId: input.organizationId,
      projectId: input.projectId ?? repository?.projectId ?? null,
      githubRepositoryId: repository?.id ?? input.repositoryId ?? null,
      originKind: input.originKind,
      createdByUserId: actor.actorUserId,
      apiKeyId: actor.apiKeyId,
      metadata: { source: input.originKind, pathHash: input.pathHash }
    });
    const artifact = await this.repository.createArtifact({
      organizationId: input.organizationId,
      projectId: input.projectId ?? repository?.projectId ?? null,
      githubRepositoryId: repository?.id ?? input.repositoryId ?? null,
      provider: input.provider ?? (repository ? "GITHUB" : null),
      repoOwner: input.repoOwner ?? repository?.repoOwner ?? null,
      repoName: input.repoName ?? repository?.repoName ?? null,
      repoFullName: input.repoFullName ?? repository?.repoFullName ?? null,
      branch: input.branch,
      commitSha: input.commitSha,
      pullRequestNumber: input.pullRequestNumber,
      originKind: input.originKind,
      createdByUserId: actor.actorUserId,
      metadata: { upload: "cli_or_ci", pathHash: input.pathHash }
    });

    return this.persistEvaluation({
      actor,
      organizationId: input.organizationId,
      projectId: input.projectId ?? repository?.projectId ?? null,
      artifact,
      run,
      evaluation,
      originKind: input.originKind,
      pathHash: input.pathHash,
      repository
    });
  }

  async ingestRepository(repositoryId: string, actor: SourceActor, input: RepositoryIngestInput) {
    const repository = await this.repository.repository(repositoryId, input.organizationId ?? actor.organizationId);
    await this.assertRepositoryAccess(repository, actor, "repository:scan");
    const orgId = repository.organizationId;
    const config = githubAppConfigStatus();
    const run = await this.repository.createRun({
      organizationId: orgId,
      projectId: repository.projectId,
      githubRepositoryId: repository.id,
      originKind: "GITHUB_APP_ARCHIVE",
      createdByUserId: actor.actorUserId,
      apiKeyId: actor.apiKeyId,
      metadata: {
        repoFullName: repository.repoFullName,
        branch: input.branch,
        commitSha: input.commitSha,
        pullRequestNumber: input.pullRequestNumber
      }
    });

    if (!config.configured) {
      await this.repository.failArtifact({
        runId: run.id,
        organizationId: orgId,
        projectId: repository.projectId,
        status: "FAILED",
        errorCategory: "PROVIDER_NOT_CONFIGURED",
        safeMessage: "GitHub App not configured"
      });
      await this.audit("repository_ingestion_requested", repository, actor, run.id, { status: "PROVIDER_NOT_CONFIGURED" });
      return { status: "PROVIDER_NOT_CONFIGURED", runId: run.id, message: "GitHub App not configured" };
    }

    let token: string;
    try {
      token = await this.github.createInstallationAccessToken(repository.installationId);
    } catch {
      await this.repository.failArtifact({
        runId: run.id,
        organizationId: orgId,
        projectId: repository.projectId,
        status: "FAILED",
        errorCategory: "TOKEN_ERROR",
        safeMessage: "GitHub installation token could not be created"
      });
      await this.audit("repository_ingestion_requested", repository, actor, run.id, { status: "TOKEN_ERROR" });
      return { status: "TOKEN_ERROR", runId: run.id, message: "GitHub installation token could not be created" };
    }

    await this.usageLimits.assertAndConsume(orgId, "SOURCE_ARTIFACTS_PER_MONTH", {
      resourceType: "SOURCE_ARTIFACT"
    });

    const artifact = await this.repository.createArtifact({
      organizationId: orgId,
      projectId: repository.projectId,
      githubRepositoryId: repository.id,
      provider: "GITHUB",
      repoOwner: repository.repoOwner,
      repoName: repository.repoName,
      repoFullName: repository.repoFullName,
      branch: input.branch ?? repository.defaultBranch ?? null,
      commitSha: input.commitSha,
      pullRequestNumber: input.pullRequestNumber,
      originKind: "GITHUB_APP_ARCHIVE",
      createdByUserId: actor.actorUserId,
      metadata: { source: "github_git_tree" }
    });

    try {
      const fetched = await this.fetchGitHubSourceFiles(repository, token, input);
      const evaluation = evaluateSourceFiles(fetched.files, {
        maxFileBytes: input.maxFileBytes,
        maxTotalBytes: input.maxTotalBytes,
        include: input.include,
        exclude: input.exclude
      });
      const persisted = await this.persistEvaluation({
        actor,
        organizationId: orgId,
        projectId: repository.projectId,
        artifact,
        run,
        evaluation,
        originKind: "GITHUB_APP_ARCHIVE",
        repository,
        branch: fetched.branch,
        commitSha: fetched.commitSha
      });
      await this.repository.createRepositorySnapshot({
        organizationId: orgId,
        projectId: repository.projectId,
        githubRepositoryId: repository.id,
        sourceArtifactId: persisted.artifact.id,
        branch: fetched.branch,
        commitSha: fetched.commitSha,
        pullRequestNumber: input.pullRequestNumber,
        metadata: { source: "github_git_tree" }
      });
      await this.audit("source_artifact_stored", repository, actor, persisted.artifact.id, { fileCount: persisted.artifact.fileCount });
      return persisted;
    } catch (error) {
      await this.repository.failArtifact({
        artifactId: artifact.id,
        runId: run.id,
        organizationId: orgId,
        projectId: repository.projectId,
        status: "FAILED",
        errorCategory: error instanceof SourceIngestionError ? error.category : "GITHUB_SOURCE_FETCH_FAILED",
        safeMessage: error instanceof Error ? safeErrorMessage(error.message) : "GitHub source ingestion failed"
      });
      await this.audit("source_archive_rejected", repository, actor, artifact.id, { category: "GITHUB_SOURCE_FETCH_FAILED" });
      return { status: "FAILED", artifactId: artifact.id, runId: run.id, message: "GitHub source ingestion failed" };
    }
  }

  async scanRepository(repositoryId: string, actor: SourceActor, input: RepositoryScanInput) {
    const repository = await this.repository.repository(repositoryId, input.organizationId ?? actor.organizationId);
    await this.assertRepositoryAccess(repository, actor, "repository:scan");
    const source = input.source ?? "GITHUB_APP";

    const repositoryScan = await this.repository.createRepositoryScan({
      organizationId: repository.organizationId,
      projectId: repository.projectId,
      githubRepositoryId: repository.id,
      source,
      status: "QUEUED",
      branch: input.branch ?? repository.defaultBranch,
      commitSha: input.commitSha,
      pullRequestNumber: input.pullRequestNumber,
      requestedByUserId: actor.actorUserId,
      apiKeyId: actor.apiKeyId,
      logs: { message: "Repository ingestion queued before scan creation" }
    });

    const ingestion = await this.ingestRepository(repository.id, actor, input);
    if (!("artifact" in ingestion) || ingestion.artifact.status !== "STORED" || !ingestion.artifact.storageKey) {
      const failedIngestion = ingestion as { status?: unknown; message?: string; runId?: string };
      await this.repository.updateRepositoryScan(repositoryScan.id, {
        status: statusFromIngestion(failedIngestion.status),
        errorCategory: statusFromIngestion(failedIngestion.status),
        logs: { message: failedIngestion.message ?? "Source ingestion did not produce a stored artifact" }
      });
      return serialize(failedIngestion.runId ? await this.repository.sourceIngestionRun(failedIngestion.runId) : failedIngestion);
    }

    const requestedBy = actor.actorUserId ?? repository.connectedByUserId;
    if (!requestedBy) {
      await this.repository.updateRepositoryScan(repositoryScan.id, {
        status: "FAILED",
        errorCategory: "REQUESTING_USER_REQUIRED",
        sourceArtifactId: ingestion.artifact.id,
        logs: { message: "A user-backed API key or authenticated user is required to create a scan" }
      });
      throw ApiError.accessDenied("Access denied");
    }

    try {
      const scan = await this.scans.create({
        organizationId: repository.organizationId,
        projectId: repository.projectId ?? undefined,
        title: input.title ?? `Repository scan ${repository.repoFullName}`,
        priority: input.priority ?? "NORMAL",
        sourceArtifactId: ingestion.artifact.id,
        target: {
          type: "SOURCE",
          artifactKey: ingestion.artifact.storageKey
        },
        analyzers: input.analyzers ?? ["slither", "mythril", "semgrep"]
      }, requestedBy, {
        correlationId: repositoryScan.id
      });
      await this.repository.updateRepositoryScan(repositoryScan.id, {
        scanId: scan.id,
        sourceArtifactId: ingestion.artifact.id,
        status: "QUEUED",
        logs: { message: "Scan queued from stored source artifact", sourceArtifactId: ingestion.artifact.id }
      });
      await this.repository.markArtifactScan(ingestion.artifact.id, scan.id);
      await this.audit("scan_created_from_source_artifact", repository, actor, scan.id, { sourceArtifactId: ingestion.artifact.id });
      return serialize({ repositoryScanId: repositoryScan.id, scan, sourceArtifact: ingestion.artifact, status: "QUEUED" });
    } catch (error) {
      await this.repository.updateRepositoryScan(repositoryScan.id, {
        sourceArtifactId: ingestion.artifact.id,
        status: "FAILED",
        errorCategory: "SCAN_CREATE_FAILED",
        logs: { message: safeErrorMessage(error instanceof Error ? error.message : "Scan creation failed") }
      });
      throw error;
    }
  }

  async scanPullRequest(pullRequestId: string, actor: SourceActor, input: PullRequestScanInput) {
    await this.assertOrganizationAccess(input.organizationId, actor, "repository:scan");
    const repository = input.repositoryId
      ? await this.repository.repository(input.repositoryId, input.organizationId)
      : input.repoFullName
        ? await this.repository.repositoryByFullName(input.organizationId, input.repoFullName)
        : null;

    if (!repository) {
      const run = await this.repository.createRun({
        organizationId: input.organizationId,
        originKind: "GITHUB_APP_ARCHIVE",
        status: "FAILED",
        createdByUserId: actor.actorUserId,
        apiKeyId: actor.apiKeyId,
        metadata: { pullRequestId, reason: "repository_not_mapped" }
      });
      await this.repository.failArtifact({
        runId: run.id,
        organizationId: input.organizationId,
        status: "FAILED",
        errorCategory: "MANUAL_SETUP_REQUIRED",
        safeMessage: "Repository is not mapped to this organization"
      });
      return { status: "MANUAL_SETUP_REQUIRED", runId: run.id, message: "Repository is not mapped to this organization" };
    }

    return this.scanRepository(repository.id, actor, {
      organizationId: input.organizationId,
      pullRequestNumber: input.pullRequestNumber ?? Number(pullRequestId),
      branch: input.branch,
      commitSha: input.commitSha,
      source: input.source,
      priority: "NORMAL",
      analyzers: ["slither", "mythril", "semgrep"]
    });
  }

  async getArtifact(artifactId: string, actor: SourceActor) {
    const artifact = await this.repository.sourceArtifact(artifactId);
    await this.assertArtifactAccess(artifact, actor, "repository:read");
    return serialize(artifact);
  }

  async getManifest(artifactId: string, actor: SourceActor) {
    const artifact = await this.repository.sourceArtifact(artifactId);
    await this.assertArtifactAccess(artifact, actor, "repository:read");
    return serialize(await this.repository.sourceManifest(artifactId));
  }

  async getRun(runId: string, actor: SourceActor) {
    const run = await this.repository.sourceIngestionRun(runId);
    if (!run) throw ApiError.accessDenied("Access denied");
    await this.assertOrganizationAccess(run.organizationId, actor, "repository:read");
    if (run.projectId) await this.assertProjectAccess(run.projectId, run.organizationId, actor);
    return serialize(run);
  }

  private async persistEvaluation(input: {
    actor: SourceActor;
    organizationId: string;
    projectId?: string | null | undefined;
    artifact: any;
    run: any;
    evaluation: ReturnType<typeof evaluateSourceFiles>;
    originKind: string;
    pathHash?: string | undefined;
    repository?: NonNullable<RepositoryRecord> | null | undefined;
    branch?: string | undefined;
    commitSha?: string | undefined;
  }) {
    if (input.evaluation.files.length === 0) {
      await this.repository.failArtifact({
        artifactId: input.artifact.id,
        runId: input.run.id,
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: "REJECTED",
        errorCategory: "SOURCE_REJECTED",
        safeMessage: "No source files remained after ignore and secret policy filtering",
        decisions: input.evaluation.decisions
      });
      await this.repository.audit({
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        actorUserId: input.actor.actorUserId,
        action: "source_archive_rejected",
        resourceType: "SOURCE_ARTIFACT",
        resourceId: input.artifact.id,
        metadata: { rejectedFileCount: input.evaluation.rejected.length, ignoredFileCount: input.evaluation.ignored.length }
      });
      return serialize({ status: "REJECTED", artifact: { ...input.artifact, status: "REJECTED" }, runId: input.run.id, manifest: input.evaluation.manifest });
    }

    const storageKey = sourceStorageKey(input.organizationId, input.artifact.id);
    await this.store.writeSourceDirectory(storageKey, input.evaluation.files, input.evaluation.manifest);
    const completed = await this.repository.completeArtifact({
      artifactId: input.artifact.id,
      runId: input.run.id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      storageKey,
      archiveChecksum: input.evaluation.archiveChecksum,
      archiveSizeBytes: input.evaluation.totalSizeBytes,
      fileCount: input.evaluation.files.length,
      totalSizeBytes: input.evaluation.totalSizeBytes,
      ignoredFileCount: input.evaluation.ignored.length,
      rejectedFileCount: input.evaluation.rejected.length,
      manifestChecksum: input.evaluation.manifestChecksum,
      manifest: input.evaluation.manifest,
      files: input.evaluation.files.map((file) => ({
        path: file.path,
        storageKey: `${storageKey}/${file.path}`,
        checksum: file.checksum,
        sizeBytes: file.sizeBytes,
        contentType: file.contentType
      })),
      decisions: input.evaluation.decisions
    });

    if (["CLI_UPLOAD", "CI_UPLOAD"].includes(input.originKind)) {
      await this.repository.createCliUpload({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourceArtifactId: input.artifact.id,
        originKind: input.originKind as "CLI_UPLOAD" | "CI_UPLOAD",
        pathHash: input.pathHash,
        requestedByUserId: input.actor.actorUserId,
        apiKeyId: input.actor.apiKeyId,
        metadata: { policyStatus: input.evaluation.status }
      });
      await this.repository.audit({
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        actorUserId: input.actor.actorUserId,
        action: input.originKind === "CI_UPLOAD" ? "ci_upload" : "cli_upload",
        resourceType: "SOURCE_ARTIFACT",
        resourceId: input.artifact.id,
        metadata: { fileCount: input.evaluation.files.length }
      });
    }

    await this.repository.audit({
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      actorUserId: input.actor.actorUserId,
      action: input.evaluation.rejected.length > 0 ? "secret_policy_rejection" : "source_artifact_stored",
      resourceType: "SOURCE_ARTIFACT",
      resourceId: input.artifact.id,
      metadata: {
        fileCount: input.evaluation.files.length,
        ignoredFileCount: input.evaluation.ignored.length,
        rejectedFileCount: input.evaluation.rejected.length
      }
    });

    return serialize({ status: "STORED", artifact: completed, runId: input.run.id, manifest: input.evaluation.manifest });
  }

  private async fetchGitHubSourceFiles(repository: NonNullable<RepositoryRecord>, token: string, input: RepositoryIngestInput): Promise<{ files: SourceFileCandidate[]; branch?: string; commitSha?: string }> {
    const ref = await this.resolveGitHubRef(repository, token, input);
    const tree = await githubJson(`https://api.github.com/repos/${repository.repoOwner}/${repository.repoName}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token);
    if (tree.truncated) throw new SourceIngestionError("GITHUB_TREE_TRUNCATED", "GitHub tree is truncated; manual setup is required");
    const entries = Array.isArray(tree.tree) ? tree.tree : [];
    const blobEntries = entries
      .filter((entry: any) => entry?.type === "blob" && typeof entry.path === "string" && typeof entry.sha === "string")
      .slice(0, 5_000);
    const ignoreEntries = blobEntries.filter((entry: any) => [".gitignore", ".web3guardignore"].includes(pathBasename(entry.path)));
    const ignoreFiles = await Promise.all(ignoreEntries.map((entry: any) => this.fetchGitHubBlob(repository, token, entry)));
    const ignoreRules = buildSourceIgnoreRules(ignoreFiles.map((file) => ({ ...file, path: normalizeSourcePath(file.path) ?? file.path })), input.exclude ?? []);
    const includeRules = input.include ?? [];
    const files: SourceFileCandidate[] = [...ignoreFiles];
    for (const entry of blobEntries) {
      const normalized = normalizeSourcePath(entry.path);
      if (!normalized || [".gitignore", ".web3guardignore"].includes(pathBasename(normalized))) continue;
      if (sourceIgnoreReasonForPath(normalized, ignoreRules, includeRules)) continue;
      if (Number(entry.size ?? 0) > (input.maxFileBytes ?? 2 * 1024 * 1024)) continue;
      files.push(await this.fetchGitHubBlob(repository, token, entry));
    }
    return {
      files,
      branch: input.branch ?? repository.defaultBranch ?? undefined,
      commitSha: input.commitSha ?? (typeof tree.sha === "string" ? tree.sha : ref)
    };
  }

  private async resolveGitHubRef(repository: NonNullable<RepositoryRecord>, token: string, input: RepositoryIngestInput): Promise<string> {
    if (input.commitSha) return input.commitSha;
    if (input.pullRequestNumber) {
      const pull = await githubJson(`https://api.github.com/repos/${repository.repoOwner}/${repository.repoName}/pulls/${input.pullRequestNumber}`, token);
      if (typeof pull?.head?.sha === "string") return pull.head.sha;
      throw new SourceIngestionError("PR_HEAD_NOT_AVAILABLE", "Pull request head SHA was not available");
    }
    return input.branch ?? repository.defaultBranch ?? "HEAD";
  }

  private async fetchGitHubBlob(repository: NonNullable<RepositoryRecord>, token: string, entry: any): Promise<SourceFileCandidate> {
    const blob = await githubJson(`https://api.github.com/repos/${repository.repoOwner}/${repository.repoName}/git/blobs/${entry.sha}`, token);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new SourceIngestionError("GITHUB_BLOB_ENCODING", "GitHub blob encoding is not supported");
    }
    return {
      path: entry.path,
      content: Buffer.from(blob.content.replace(/\s+/gu, ""), "base64")
    };
  }

  private async assertArtifactAccess(artifact: any, actor: SourceActor, permission: string) {
    if (!artifact) throw ApiError.accessDenied("Access denied");
    await this.assertOrganizationAccess(artifact.organizationId, actor, permission);
    if (artifact.projectId) await this.assertProjectAccess(artifact.projectId, artifact.organizationId, actor);
    if (actor.githubRepositoryId && artifact.githubRepositoryId && actor.githubRepositoryId !== artifact.githubRepositoryId) {
      throw ApiError.accessDenied("Access denied");
    }
  }

  private async assertRepositoryAccess(repository: RepositoryRecord, actor: SourceActor, permission: string): Promise<NonNullable<RepositoryRecord>> {
    if (!repository || repository.deletedAt || repository.status !== "CONNECTED") throw ApiError.accessDenied("Access denied");
    await this.assertOrganizationAccess(repository.organizationId, actor, permission);
    if (actor.githubRepositoryId && actor.githubRepositoryId !== repository.id) {
      await this.repository.audit({
        organizationId: repository.organizationId,
        projectId: repository.projectId,
        actorUserId: actor.actorUserId,
        action: "api_key_scope_denied",
        resourceType: "GITHUB_REPOSITORY",
        resourceId: repository.id,
        metadata: { reason: "repository_scope_mismatch" }
      }).catch(() => undefined);
      throw ApiError.accessDenied("Access denied");
    }
    if (actor.projectId && repository.projectId && actor.projectId !== repository.projectId) throw ApiError.accessDenied("Access denied");
    if (repository.projectId) await this.assertProjectAccess(repository.projectId, repository.organizationId, actor);
    return repository;
  }

  private async assertOrganizationAccess(organizationId: string, actor: SourceActor, permission: string) {
    if (actor.organizationId && actor.organizationId !== organizationId) throw ApiError.accessDenied("Access denied");
    if (actor.apiKeyId) {
      if (!hasPermission(actor, permission)) throw ApiError.accessDenied("Access denied");
      return;
    }
    if (!actor.actorUserId) throw ApiError.unauthorized();
    const membership = await this.repository.organizationMember(organizationId, actor.actorUserId);
    if (!membership || membership.status !== "ACTIVE" || membership.deletedAt) throw ApiError.accessDenied("Access denied");
    if (!roleAllows(String(membership.roleType), permission) && !hasPermission(actor, permission)) {
      throw ApiError.accessDenied("Access denied");
    }
  }

  private async assertProjectAccess(projectId: string, organizationId: string, actor: SourceActor) {
    const project = await this.repository.project(projectId, organizationId);
    if (!project) throw ApiError.accessDenied("Access denied");
    if (actor.apiKeyId && actor.projectId && actor.projectId !== projectId) throw ApiError.accessDenied("Access denied");
    if (actor.apiKeyId || !actor.actorUserId || hasPermission(actor, "org:manage") || hasPermission(actor, "*")) return;
    const member = await this.repository.projectMember(projectId, actor.actorUserId);
    if (!member && !hasPermission(actor, "repository:manage")) throw ApiError.accessDenied("Access denied");
  }

  private audit(action: string, repository: { organizationId: string; projectId: string | null; id: string; repoFullName: string }, actor: SourceActor, resourceId: string, metadata: unknown) {
    return this.repository.audit({
      organizationId: repository.organizationId,
      projectId: repository.projectId,
      actorUserId: actor.actorUserId,
      action,
      resourceType: "SOURCE_ARTIFACT",
      resourceId,
      metadata: { repoFullName: repository.repoFullName, ...(typeof metadata === "object" && metadata ? metadata as Record<string, unknown> : {}) }
    });
  }
}

export class SourceIngestionError extends Error {
  constructor(readonly category: string, message: string) {
    super(message);
    this.name = "SourceIngestionError";
  }
}

function decodeUploadFiles(files: SourceArtifactUploadInput["files"]): SourceFileCandidate[] {
  return files.map((file) => ({
    path: file.path,
    content: Buffer.from(file.contentBase64, "base64"),
    declaredChecksum: file.checksum
  }));
}

async function githubJson(url: string, token: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "Web3Guard"
    }
  });
  if (!response.ok) {
    throw new SourceIngestionError("GITHUB_API_ERROR", `GitHub API returned ${response.status}`);
  }
  return response.json();
}

function sourceStorageKey(organizationId: string, artifactId: string): string {
  return `source-artifacts/${organizationId}/${artifactId}/source`;
}

function pathBasename(value: string): string {
  return value.split(/[\\/]/u).at(-1) ?? value;
}

function statusFromIngestion(status: unknown): "FAILED" | "PROVIDER_NOT_CONFIGURED" | "TOKEN_ERROR" | "MANUAL_SETUP_REQUIRED" {
  if (status === "PROVIDER_NOT_CONFIGURED") return "PROVIDER_NOT_CONFIGURED";
  if (status === "TOKEN_ERROR") return "TOKEN_ERROR";
  if (status === "MANUAL_SETUP_REQUIRED") return "MANUAL_SETUP_REQUIRED";
  return "FAILED";
}

function hasPermission(actor: SourceActor, permission: string): boolean {
  const permissions = new Set([...(actor.permissions ?? [])]);
  if (permissions.has("*") || permissions.has(permission)) return true;
  const aliases: Record<string, string[]> = {
    "repository:read": ["vulnerabilities:read", "scans:read"],
    "repository:scan": ["scans:create"],
    "repository:manage": ["vulnerabilities:update", "org:manage"]
  };
  return (aliases[permission] ?? []).some((alias) => permissions.has(alias));
}

function roleAllows(roleType: string, permission: string): boolean {
  if (roleType === "OWNER" || roleType === "ADMIN" || roleType === "SECURITY_LEAD") return true;
  if (roleType === "DEVELOPER") return ["repository:read", "repository:scan"].includes(permission);
  if (roleType === "AUDITOR" || roleType === "VIEWER" || roleType === "READONLY") return permission === "repository:read";
  return false;
}

function safeErrorMessage(message: string): string {
  return message
    .replace(/\bgh[opsru]_[A-Za-z0-9_]{20,}\b/gu, "[REDACTED_GITHUB_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]");
}

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}
