import type { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { redactGitHubPayload } from "./github.security.js";

type GitHubInstallationStatus = "ACTIVE" | "SUSPENDED" | "DELETED" | "NOT_CONFIGURED";
type GitHubRepositoryStatus = "CONNECTED" | "REMOVED" | "SUSPENDED";
type IntegrationScanSource = "GITHUB_APP" | "CLI" | "CI";
type IntegrationScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "PROVIDER_NOT_CONFIGURED" | "TOKEN_ERROR" | "MANUAL_SETUP_REQUIRED" | "NOT_ASSESSED";
const db = prisma as any;

export interface GitHubActor {
  organizationId: string;
  actorUserId?: string | undefined;
  apiKeyId?: string | undefined;
  githubRepositoryId?: string | undefined;
  permissions?: string[] | undefined;
}

export class GitHubIntegrationRepository {
  listInstallations(organizationId: string) {
    return db.gitHubInstallation.findMany({
      where: { organizationId, deletedAt: null },
      include: { repositories: { where: { deletedAt: null }, orderBy: { repoFullName: "asc" } } },
      orderBy: { createdAt: "desc" }
    });
  }

  listRepositories(organizationId: string) {
    return db.gitHubRepository.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ status: "asc" }, { repoFullName: "asc" }],
      include: {
        repositoryScans: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
  }

  repository(repoId: string, organizationId: string) {
    return db.gitHubRepository.findFirst({
      where: { id: repoId, organizationId, deletedAt: null },
      include: { repositoryScans: { orderBy: { createdAt: "desc" }, take: 10 } }
    });
  }

  project(projectId: string, organizationId: string) {
    return db.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true }
    });
  }

  projectMember(projectId: string, userId: string) {
    return db.projectMember.findFirst({
      where: { projectId, userId, status: "ACTIVE", deletedAt: null },
      select: { id: true }
    });
  }

  installationByExternalId(installationId: bigint) {
    return db.gitHubInstallation.findFirst({
      where: { installationId, deletedAt: null }
    });
  }

  upsertInstallation(input: {
    organizationId: string;
    installationId: bigint;
    accountLogin: string;
    accountType?: string | null | undefined;
    status?: GitHubInstallationStatus | undefined;
    connectedByUserId?: string | undefined;
    metadata?: unknown;
  }) {
    return db.gitHubInstallation.upsert({
      where: {
        organizationId_installationId: {
          organizationId: input.organizationId,
          installationId: input.installationId
        }
      },
      update: {
        accountLogin: input.accountLogin,
        accountType: input.accountType ?? null,
        status: input.status ?? "ACTIVE",
        connectedByUserId: input.connectedByUserId ?? null,
        suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
        deletedAt: input.status === "DELETED" ? new Date() : null,
        metadata: toJson(input.metadata ?? {})
      },
      create: {
        organizationId: input.organizationId,
        installationId: input.installationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType ?? null,
        status: input.status ?? "ACTIVE",
        connectedByUserId: input.connectedByUserId ?? null,
        suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
        deletedAt: input.status === "DELETED" ? new Date() : null,
        metadata: toJson(input.metadata ?? {})
      }
    });
  }

  updateInstallationStatus(installationId: bigint, status: GitHubInstallationStatus) {
    return db.gitHubInstallation.updateMany({
      where: { installationId, deletedAt: null },
      data: {
        status,
        suspendedAt: status === "SUSPENDED" ? new Date() : null,
        deletedAt: status === "DELETED" ? new Date() : null
      }
    });
  }

  async upsertRepository(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    githubInstallationId?: string | null | undefined;
    githubRepositoryId?: bigint | null | undefined;
    installationId: bigint;
    repoOwner: string;
    repoName: string;
    repoFullName: string;
    defaultBranch?: string | null | undefined;
    visibility?: string | null | undefined;
    status?: GitHubRepositoryStatus | undefined;
    connectedByUserId?: string | undefined;
    metadata?: unknown;
  }) {
    return db.gitHubRepository.upsert({
      where: {
        organizationId_repoFullName: {
          organizationId: input.organizationId,
          repoFullName: input.repoFullName
        }
      },
      update: {
        projectId: input.projectId ?? null,
        githubInstallationId: input.githubInstallationId ?? null,
        githubRepositoryId: input.githubRepositoryId ?? null,
        installationId: input.installationId,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        defaultBranch: input.defaultBranch ?? null,
        visibility: input.visibility ?? null,
        status: input.status ?? "CONNECTED",
        connectedByUserId: input.connectedByUserId ?? null,
        removedAt: input.status === "REMOVED" ? new Date() : null,
        deletedAt: null,
        metadata: toJson(input.metadata ?? {})
      },
      create: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        githubInstallationId: input.githubInstallationId ?? null,
        githubRepositoryId: input.githubRepositoryId ?? null,
        installationId: input.installationId,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        repoFullName: input.repoFullName,
        defaultBranch: input.defaultBranch ?? null,
        visibility: input.visibility ?? null,
        status: input.status ?? "CONNECTED",
        connectedByUserId: input.connectedByUserId ?? null,
        removedAt: input.status === "REMOVED" ? new Date() : null,
        metadata: toJson(input.metadata ?? {})
      }
    });
  }

  removeRepository(organizationId: string, repoFullName: string) {
    return db.gitHubRepository.updateMany({
      where: { organizationId, repoFullName, deletedAt: null },
      data: { status: "REMOVED", removedAt: new Date() }
    });
  }

  createRepositoryScan(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    githubRepositoryId?: string | null | undefined;
    source: IntegrationScanSource;
    status: IntegrationScanStatus;
    branch?: string | undefined;
    commitSha?: string | undefined;
    pullRequestNumber?: number | undefined;
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
        source: input.source,
        status: input.status,
        branch: input.branch ?? null,
        commitSha: input.commitSha ?? null,
        pullRequestNumber: input.pullRequestNumber ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        logs: toJson(input.logs ?? {}),
        errorCategory: input.errorCategory ?? null,
        completedAt: ["COMPLETED", "FAILED", "PROVIDER_NOT_CONFIGURED", "TOKEN_ERROR", "MANUAL_SETUP_REQUIRED", "NOT_ASSESSED"].includes(input.status)
          ? new Date()
          : null
      }
    });
  }

  listRepositoryScans(organizationId: string, repoId: string) {
    return db.repositoryScan.findMany({
      where: { organizationId, githubRepositoryId: repoId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  recordWebhookEvent(input: {
    organizationId?: string | null | undefined;
    githubInstallationId?: string | null | undefined;
    deliveryId: string;
    eventName: string;
    action?: string | null | undefined;
    signatureValid: boolean;
    status: "RECEIVED" | "VERIFIED" | "DENIED" | "PROCESSED" | "FAILED";
    payloadSha256: string;
    metadata?: unknown;
  }) {
    return db.gitHubWebhookEvent.upsert({
      where: { deliveryId: input.deliveryId },
      update: {
        organizationId: input.organizationId ?? null,
        githubInstallationId: input.githubInstallationId ?? null,
        eventName: input.eventName,
        action: input.action ?? null,
        signatureValid: input.signatureValid,
        status: input.status,
        payloadSha256: input.payloadSha256,
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      },
      create: {
        organizationId: input.organizationId ?? null,
        githubInstallationId: input.githubInstallationId ?? null,
        deliveryId: input.deliveryId,
        eventName: input.eventName,
        action: input.action ?? null,
        signatureValid: input.signatureValid,
        status: input.status,
        payloadSha256: input.payloadSha256,
        metadata: toJson(redactGitHubPayload(input.metadata ?? {}))
      }
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
