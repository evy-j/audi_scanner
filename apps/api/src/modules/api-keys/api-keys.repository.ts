import { prisma } from "../../infra/prisma/prisma.js";
import type { CreateApiKeyInput } from "./api-keys.schemas.js";

const db = prisma as any;

export class ApiKeysRepository {
  list(organizationId: string) {
    return db.apiKey.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        githubRepositoryId: true,
        name: true,
        keyPrefix: true,
        status: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  create(input: CreateApiKeyInput & {
    organizationId: string;
    createdById?: string | undefined;
    keyPrefix: string;
    keyHash: string;
  }) {
    return db.$transaction(async (tx: any) => {
      const key = await tx.apiKey.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          githubRepositoryId: input.githubRepositoryId ?? null,
          createdById: input.createdById ?? null,
          name: input.name,
          keyPrefix: input.keyPrefix,
          keyHash: input.keyHash,
          scopes: input.scopes,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          status: "ACTIVE"
        },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          githubRepositoryId: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          createdAt: true
        }
      });
      await tx.apiKeyAuditEvent.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          ...(input.githubRepositoryId ? { metadata: { githubRepositoryId: input.githubRepositoryId } } : {}),
          apiKeyId: key.id,
          actorUserId: input.createdById ?? null,
          action: "CREATED",
          keyPrefix: input.keyPrefix
        }
      });
      return key;
    });
  }

  revoke(apiKeyId: string, organizationId: string) {
    return db.$transaction(async (tx: any) => {
      const key = await tx.apiKey.findFirst({
        where: { id: apiKeyId, organizationId, deletedAt: null },
        select: { id: true, projectId: true, githubRepositoryId: true, keyPrefix: true }
      });
      if (!key) return { count: 0 };
      await tx.apiKey.update({
        where: { id: apiKeyId },
        data: {
          status: "REVOKED",
          revokedAt: new Date()
        }
      });
      await tx.apiKeyAuditEvent.create({
        data: {
          organizationId,
          projectId: key.projectId ?? null,
          ...(key.githubRepositoryId ? { metadata: { githubRepositoryId: key.githubRepositoryId } } : {}),
          apiKeyId: key.id,
          action: "REVOKED",
          keyPrefix: key.keyPrefix
        }
      });
      return { count: 1 };
    });
  }

  project(projectId: string, organizationId: string) {
    return db.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        deletedAt: null
      },
      select: { id: true }
    });
  }

  securitySettings(organizationId: string) {
    return db.securitySetting.findUnique({ where: { organizationId } });
  }

  activeCount(organizationId: string) {
    return db.apiKey.count({
      where: {
        organizationId,
        status: "ACTIVE",
        deletedAt: null
      }
    });
  }

  githubRepository(githubRepositoryId: string, organizationId: string) {
    return db.gitHubRepository.findFirst({
      where: {
        id: githubRepositoryId,
        organizationId,
        deletedAt: null,
        status: "CONNECTED"
      },
      select: { id: true, projectId: true }
    });
  }
}
