import { randomBytes } from "node:crypto";
import { prisma } from "../../infra/prisma/prisma.js";

export class AuthRepository {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
  }

  findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId }
    });
  }

  createPendingUser(input: {
    email: string;
    passwordHash: string;
    displayName?: string | undefined;
  }) {
    return prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? null,
        status: "PENDING"
      }
    });
  }

  async createSession(input: {
    userId: string;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    expiresAt: Date;
  }) {
    return prisma.session.create({
      data: {
        userId: input.userId,
        refreshTokenHash: `pending:${randomBytes(32).toString("hex")}`,
        status: "ACTIVE",
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: input.expiresAt,
        lastUsedAt: new Date()
      }
    });
  }

  updateSessionRefreshHash(sessionId: string, refreshTokenHash: string) {
    return prisma.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash }
    });
  }

  findSessionByRefreshHash(refreshTokenHash: string) {
    return prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true }
    });
  }

  revokeSession(sessionId: string) {
    return prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "REVOKED",
        revokedAt: new Date()
      }
    });
  }

  touchSession(sessionId: string) {
    return prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() }
    });
  }

  findWalletByAddress(input: { normalizedAddress: string; chainId?: string | undefined }) {
    return prisma.wallet.findFirst({
      where: {
        normalizedAddress: input.normalizedAddress,
        deletedAt: null
      },
      include: {
        user: true
      }
    });
  }

  async createWalletUser(input: { normalizedAddress: string; chainId?: string | undefined }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: null,
          displayName: `Wallet ${input.normalizedAddress.slice(0, 6)}...${input.normalizedAddress.slice(-4)}`,
          status: "ACTIVE"
        }
      });

      const wallet = await tx.wallet.create({
        data: {
          userId: user.id,
          chainId: input.chainId ?? null,
          address: input.normalizedAddress,
          normalizedAddress: input.normalizedAddress,
          verifiedAt: new Date()
        }
      });

      return { user, wallet };
    });
  }

  touchWallet(walletId: string) {
    return prisma.wallet.update({
      where: { id: walletId },
      data: { verifiedAt: new Date() }
    });
  }

  async getUserPermissions(userId: string, organizationId?: string | undefined): Promise<string[]> {
    const roles = await prisma.userRole.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [{ organizationId: organizationId ?? null }, { organizationId: null }]
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true }
            }
          }
        }
      }
    });

    return Array.from(
      new Set(
        roles.flatMap((assignment) =>
          assignment.role.permissions
            .filter((rolePermission) => !rolePermission.deletedAt)
            .map((rolePermission) => rolePermission.permission.key)
        )
      )
    ).sort();
  }
}
