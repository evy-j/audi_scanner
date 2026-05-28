import type { AuthPrincipal } from "../common/security/auth-principal.js";
import { ApiError } from "../common/errors/api-error.js";
import { prisma } from "../infra/prisma/prisma.js";

export interface AuthorizedScanSubscription {
  scanId: string;
  organizationId: string;
}

export class RealtimeAuthorizationService {
  async authorizeScanSubscription(
    principal: AuthPrincipal,
    scanId: string
  ): Promise<AuthorizedScanSubscription> {
    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        deletedAt: null
      },
      select: {
        id: true,
        organizationId: true
      }
    });

    if (!scan) {
      throw ApiError.notFound("Scan");
    }

    if (principal.organizationId && principal.organizationId !== scan.organizationId) {
      throw ApiError.forbidden("Organization context mismatch");
    }

    if (principal.type === "apiKey") {
      if (!principal.scopes.includes("scans:read")) {
        throw ApiError.forbidden("Missing permissions: scans:read");
      }

      return {
        scanId: scan.id,
        organizationId: scan.organizationId
      };
    }

    const [membership, permissions] = await Promise.all([
      prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: scan.organizationId,
            userId: principal.userId
          }
        }
      }),
      loadOrganizationPermissions(principal.userId, scan.organizationId)
    ]);

    if (!membership || membership.status !== "ACTIVE" || membership.deletedAt) {
      throw ApiError.forbidden("Organization access is required");
    }

    if (!new Set([...principal.permissions, ...permissions]).has("scans:read")) {
      throw ApiError.forbidden("Missing permissions: scans:read");
    }

    return {
      scanId: scan.id,
      organizationId: scan.organizationId
    };
  }
}

async function loadOrganizationPermissions(userId: string, organizationId: string): Promise<string[]> {
  const assignments = await prisma.userRole.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ organizationId }, { organizationId: null }],
      role: {
        status: "ACTIVE",
        deletedAt: null
      }
    },
    include: {
      role: {
        include: {
          permissions: {
            where: { deletedAt: null },
            include: {
              permission: true
            }
          }
        }
      }
    }
  });

  return Array.from(
    new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions
          .filter((rolePermission) => rolePermission.permission.status === "ACTIVE")
          .map((rolePermission) => rolePermission.permission.key)
      )
    )
  ).sort();
}
