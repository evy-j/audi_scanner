import type { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { redactGitHubPayload } from "../github/github.security.js";

const db = prisma as any;

type SourceArtifactStatus = "QUEUED" | "INGESTING" | "STORED" | "FAILED" | "REJECTED" | "EXPIRED" | "DELETED";
type SourceOriginKind = "GITHUB_APP_ARCHIVE" | "GITHUB_APP_CHECKOUT" | "CLI_UPLOAD" | "CI_UPLOAD" | "LOCAL_PATH_REFERENCE" | "MANUAL_UPLOAD";
type SourcePolicyStatus = "ALLOWED" | "REJECTED" | "PARTIAL" | "NOT_ASSESSED";
type IntegrationScanSource = "GITHUB_APP" | "CLI" | "CI";
type IntegrationScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "PROVIDER_NOT_CONFIGURED" | "TOKEN_ERROR" | "MANUAL_SETUP_REQUIRED" | "NOT_ASSESSED";

export interface SourceActor {
  organizationId?: string | undefined;
  actorUserId?: string | undefined;
  apiKeyId?: string | undefined;
  projectId?: string | undefined;
  githubRepositoryId?: string | undefined;
  permissions?: string[] | undefined;
}

export class SourceIngestionRepository {
  organizationMember(organizationId: string, userId: string) {
    return db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, roleType: true, status: true, deletedAt: true }
    });
  }

  projectMember(projectId: string, userId: string) {
    return db.projectMember.findFirst({
      where: { projectId, userId, status: "ACTIVE", deletedAt: null },
      select: { id: true }
    });
  }

  project(projectId: string, organizationId: string) {
    return db.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true }
    });
  }

  repository(repositoryId: string, organizationId?: string | undefined) {
    return db.gitHubRepository.findFirst({
      where: {
        id: repositoryId,
        deletedAt: null,
        ...(organizationId ? { organizationId } : {})
      },
      include: {
        sourceArtifacts: { orderBy: { createdAt: "desc" }, take: 1 },
        repositoryScans: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });
  }

  repositoryByFullName(organizationId: string, repoFullName: string) {
    return db.gitHubRepository.findFirst({
      where: {
        organizationId,
        repoFullName,
        deletedAt: null,
        status: "CONNECTED"
      }
    });
  }

  sourceArtifact(artifactId: string) {
    return db.sourceArtifact.findFirst({
      where: { id: artifactId, deletedAt: null },
      include: {
        manifest: true,
        fileEntries: { orderBy: { path: "asc" }, take: 500 },
        ingestionRuns: { orderBy: { createdAt: "desc" }, take: 5 },
        errors: { orderBy: { createdAt: "desc" }, take: 25 },
        policyDecisions: { orderBy: { createdAt: "desc" }, take: 50 }
      }
    });
  }

  sourceManifest(artifactId: string) {
    return db.sourceManifest.findUnique({
      where: { sourceArtifactId: artifactId }
    });
  }

  sourceIngestionRun(runId: string) {
    return db.sourceIngestionRun.findFirst({
      where: { id: runId },
      include: {
        sourceArtifact: true,
        errors: { orderBy: { createdAt: "desc" }, take: 25 },
        policyDecisions: { orderBy: { createdAt: "desc" }, take: 50 }
      }
    });
  }

  createRun(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    githubRepositoryId?: string | null | undefined;
    originKind: SourceOriginKind;
    status?: SourceArtifactStatus | undefined;
    createdByUserId?: string | undefined;
    apiKeyId?: string | undefined;
    metadata?: unknown;
  }) {
    return db.sourceIngestionRun.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        githubRepositoryId: input.githubRepositoryId ?? null,
        originKind: input.originKind,
        status: input.status ?? "INGESTING",
        createdByUserId: input.createdByUserId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      }
    });
  }

  createArtifact(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    githubRepositoryId?: string | null | undefined;
    provider?: "GITHUB" | null | undefined;
    repoOwner?: string | null | undefined;
    repoName?: string | null | undefined;
    repoFullName?: string | null | undefined;
    branch?: string | null | undefined;
    commitSha?: string | null | undefined;
    pullRequestNumber?: number | null | undefined;
    originKind: SourceOriginKind;
    status?: SourceArtifactStatus | undefined;
    createdByUserId?: string | undefined;
    metadata?: unknown;
  }) {
    return db.sourceArtifact.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        githubRepositoryId: input.githubRepositoryId ?? null,
        provider: input.provider ?? null,
        repoOwner: input.repoOwner ?? null,
        repoName: input.repoName ?? null,
        repoFullName: input.repoFullName ?? null,
        branch: input.branch ?? null,
        commitSha: input.commitSha ?? null,
        pullRequestNumber: input.pullRequestNumber ?? null,
        originKind: input.originKind,
        status: input.status ?? "INGESTING",
        createdByUserId: input.createdByUserId ?? null,
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      }
    });
  }

  async completeArtifact(input: {
    artifactId: string;
    runId?: string | undefined;
    organizationId: string;
    projectId?: string | null | undefined;
    storageKey: string;
    archiveChecksum: string;
    archiveSizeBytes: number;
    fileCount: number;
    totalSizeBytes: number;
    ignoredFileCount: number;
    rejectedFileCount: number;
    manifestChecksum: string;
    manifest: unknown;
    files: Array<{
      path: string;
      storageKey: string;
      checksum: string;
      sizeBytes: number;
      contentType: string;
    }>;
    decisions: Array<{
      status: SourcePolicyStatus;
      path?: string | null | undefined;
      reason: string;
      category?: string | null | undefined;
    }>;
  }) {
    return db.$transaction(async (tx: any) => {
      const artifact = await tx.sourceArtifact.update({
        where: { id: input.artifactId },
        data: {
          status: "STORED",
          storageKey: input.storageKey,
          archiveChecksum: input.archiveChecksum,
          archiveSizeBytes: BigInt(input.archiveSizeBytes),
          fileCount: input.fileCount,
          totalSizeBytes: BigInt(input.totalSizeBytes),
          ignoredFileCount: input.ignoredFileCount,
          rejectedFileCount: input.rejectedFileCount,
          storedAt: new Date()
        }
      });
      await tx.sourceManifest.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          sourceArtifactId: input.artifactId,
          manifestChecksum: input.manifestChecksum,
          fileCount: input.fileCount,
          totalSizeBytes: BigInt(input.totalSizeBytes),
          ignoredFileCount: input.ignoredFileCount,
          rejectedFileCount: input.rejectedFileCount,
          manifest: toJson(input.manifest)
        }
      });
      for (const file of input.files) {
        await tx.sourceFileEntry.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId ?? null,
            sourceArtifactId: input.artifactId,
            path: file.path,
            storageKey: file.storageKey,
            checksum: file.checksum,
            sizeBytes: BigInt(file.sizeBytes),
            contentType: file.contentType,
            policyStatus: "ALLOWED"
          }
        });
      }
      for (const decision of input.decisions) {
        await tx.sourcePolicyDecision.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId ?? null,
            sourceArtifactId: input.artifactId,
            sourceIngestionRunId: input.runId ?? null,
            status: decision.status,
            path: decision.path ?? null,
            reason: decision.reason,
            category: decision.category ?? null
          }
        });
      }
      if (input.runId) {
        await tx.sourceIngestionRun.update({
          where: { id: input.runId },
          data: {
            sourceArtifactId: input.artifactId,
            status: "STORED",
            completedAt: new Date()
          }
        });
      }
      return artifact;
    });
  }

  async failArtifact(input: {
    artifactId?: string | undefined;
    runId?: string | undefined;
    organizationId: string;
    projectId?: string | null | undefined;
    status: Extract<SourceArtifactStatus, "FAILED" | "REJECTED">;
    errorCategory: string;
    safeMessage: string;
    filePath?: string | undefined;
    decisions?: Array<{ status: SourcePolicyStatus; path?: string | null | undefined; reason: string; category?: string | null | undefined }> | undefined;
  }) {
    return db.$transaction(async (tx: any) => {
      if (input.artifactId) {
        await tx.sourceArtifact.update({
          where: { id: input.artifactId },
          data: {
            status: input.status,
            rejectedFileCount: input.status === "REJECTED" ? 1 : undefined
          }
        });
      }
      if (input.runId) {
        await tx.sourceIngestionRun.update({
          where: { id: input.runId },
          data: {
            sourceArtifactId: input.artifactId ?? null,
            status: input.status,
            errorCategory: input.errorCategory,
            completedAt: new Date()
          }
        });
      }
      await tx.sourceIngestionError.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          sourceArtifactId: input.artifactId ?? null,
          sourceIngestionRunId: input.runId ?? null,
          category: input.errorCategory,
          filePath: input.filePath ?? null,
          safeMessage: input.safeMessage
        }
      });
      for (const decision of input.decisions ?? []) {
        await tx.sourcePolicyDecision.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId ?? null,
            sourceArtifactId: input.artifactId ?? null,
            sourceIngestionRunId: input.runId ?? null,
            status: decision.status,
            path: decision.path ?? null,
            reason: decision.reason,
            category: decision.category ?? null
          }
        });
      }
    });
  }

  async createRepositorySnapshot(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    githubRepositoryId: string;
    sourceArtifactId: string;
    branch?: string | null | undefined;
    commitSha?: string | null | undefined;
    pullRequestNumber?: number | null | undefined;
    metadata?: unknown;
  }) {
    return db.repositorySourceSnapshot.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        githubRepositoryId: input.githubRepositoryId,
        sourceArtifactId: input.sourceArtifactId,
        branch: input.branch ?? null,
        commitSha: input.commitSha ?? null,
        pullRequestNumber: input.pullRequestNumber ?? null,
        status: "STORED",
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      }
    });
  }

  createCliUpload(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    sourceArtifactId: string;
    scanId?: string | null | undefined;
    originKind: SourceOriginKind;
    pathHash?: string | null | undefined;
    requestedByUserId?: string | undefined;
    apiKeyId?: string | undefined;
    metadata?: unknown;
  }) {
    return db.cliSourceUpload.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        sourceArtifactId: input.sourceArtifactId,
        scanId: input.scanId ?? null,
        originKind: input.originKind,
        pathHash: input.pathHash ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      }
    });
  }

  createRepositoryScan(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    githubRepositoryId?: string | null | undefined;
    sourceArtifactId?: string | null | undefined;
    scanId?: string | null | undefined;
    source: IntegrationScanSource;
    status: IntegrationScanStatus;
    branch?: string | null | undefined;
    commitSha?: string | null | undefined;
    pullRequestNumber?: number | null | undefined;
    requestedByUserId?: string | undefined;
    apiKeyId?: string | undefined;
    logs?: unknown;
    errorCategory?: string | undefined;
  }) {
    return db.repositoryScan.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        githubRepositoryId: input.githubRepositoryId ?? null,
        sourceArtifactId: input.sourceArtifactId ?? null,
        scanId: input.scanId ?? null,
        source: input.source,
        status: input.status,
        branch: input.branch ?? null,
        commitSha: input.commitSha ?? null,
        pullRequestNumber: input.pullRequestNumber ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        logs: toJson(redactGitHubPayload(input.logs ?? {})),
        errorCategory: input.errorCategory ?? null,
        completedAt: ["COMPLETED", "FAILED", "PROVIDER_NOT_CONFIGURED", "TOKEN_ERROR", "MANUAL_SETUP_REQUIRED", "NOT_ASSESSED"].includes(input.status)
          ? new Date()
          : null
      }
    });
  }

  updateRepositoryScan(repositoryScanId: string, input: {
    scanId?: string | null | undefined;
    sourceArtifactId?: string | null | undefined;
    status?: IntegrationScanStatus | undefined;
    logs?: unknown;
    errorCategory?: string | null | undefined;
  }) {
    return db.repositoryScan.update({
      where: { id: repositoryScanId },
      data: {
        ...(input.scanId !== undefined ? { scanId: input.scanId } : {}),
        ...(input.sourceArtifactId !== undefined ? { sourceArtifactId: input.sourceArtifactId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.logs !== undefined ? { logs: toJson(redactGitHubPayload(input.logs)) } : {}),
        ...(input.errorCategory !== undefined ? { errorCategory: input.errorCategory } : {}),
        ...(input.status && ["COMPLETED", "FAILED", "PROVIDER_NOT_CONFIGURED", "TOKEN_ERROR", "MANUAL_SETUP_REQUIRED", "NOT_ASSESSED"].includes(input.status)
          ? { completedAt: new Date() }
          : {})
      }
    });
  }

  markArtifactScan(sourceArtifactId: string, scanId: string) {
    return db.sourceArtifact.update({
      where: { id: sourceArtifactId },
      data: { scanId }
    });
  }

  audit(input: {
    organizationId?: string | null | undefined;
    projectId?: string | null | undefined;
    actorUserId?: string | null | undefined;
    action: string;
    resourceType: string;
    resourceId?: string | null | undefined;
    metadata?: unknown;
  }) {
    return db.adminActionEvent.create({
      data: {
        organizationId: input.organizationId ?? null,
        projectId: input.projectId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      }
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}
