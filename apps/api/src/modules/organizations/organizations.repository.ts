import { prisma } from "../../infra/prisma/prisma.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput
} from "./organizations.schemas.js";

export class OrganizationsRepository {
  listForUser(userId: string) {
    return prisma.organization.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId,
                status: "ACTIVE",
                deletedAt: null
              }
            }
          }
        ]
      },
      orderBy: { createdAt: "desc" }
    });
  }

  findById(id: string) {
    return prisma.organization.findFirst({
      where: { id, deletedAt: null }
    });
  }

  async create(ownerId: string, input: CreateOrganizationInput) {
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          ownerId,
          name: input.name,
          slug: input.slug,
          billingEmail: input.billingEmail ?? null,
          status: "ACTIVE"
        }
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: ownerId,
          roleType: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date()
        }
      });

      await tx.securitySetting.create({ data: { organizationId: organization.id } });
      await tx.dataRetentionPolicy.create({ data: { organizationId: organization.id } });

      return organization;
    });
  }

  update(id: string, input: UpdateOrganizationInput) {
    return prisma.organization.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.billingEmail ? { billingEmail: input.billingEmail } : {}),
        ...(input.status ? { status: input.status } : {})
      }
    });
  }

  softDelete(id: string) {
    return prisma.organization.update({
      where: { id },
      data: {
        status: "DELETED",
        deletedAt: new Date()
      }
    });
  }

  listMembers(organizationId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }
}
