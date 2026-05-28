import type { PrismaClient } from "@prisma/client";

export const FREE_BETA_PLAN_DEFAULTS = {
  scansPerMonth: numberFromEnv("FREE_BETA_SCANS_PER_MONTH", 25),
  aiValidationsPerMonth: numberFromEnv("FREE_BETA_AI_VALIDATIONS_PER_MONTH", 50),
  remediationRunsPerMonth: numberFromEnv("FREE_BETA_REMEDIATION_RUNS_PER_MONTH", 25),
  reportExportsPerMonth: numberFromEnv("FREE_BETA_REPORT_EXPORTS_PER_MONTH", 25),
  monitoredProjects: numberFromEnv("FREE_BETA_MONITORED_PROJECTS", 3)
};

export async function seedFreeBetaPlan(prisma: PrismaClient) {
  const existing = await prisma.plan.findFirst({
    where: { organizationId: null, tier: "FREE_BETA", active: true },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return { created: false, plan: existing };
  }

  const plan = await prisma.plan.create({
    data: {
      organizationId: null,
      tier: "FREE_BETA",
      name: "Free Beta",
      ...FREE_BETA_PLAN_DEFAULTS,
      active: true,
      metadata: {
        seeded: true,
        seedVersion: "p6.5-free-beta/v1"
      }
    }
  });

  return { created: true, plan };
}

export async function bootstrapAdmin(prisma: PrismaClient, adminEmail = process.env.ADMIN_EMAIL?.trim()) {
  if (!adminEmail) {
    return {
      status: "SKIPPED" as const,
      message: "ADMIN_EMAIL is not set. Create a user first, then rerun npm run admin:bootstrap."
    };
  }

  const user = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
  if (!user || user.deletedAt) {
    return {
      status: "USER_NOT_FOUND" as const,
      message: "Admin user does not exist yet. Sign up the user first; no password was created."
    };
  }

  const permission = await prisma.permission.upsert({
    where: { key: "admin:manage" },
    update: {
      resource: "admin",
      action: "MANAGE",
      scope: "ADMIN",
      status: "ACTIVE",
      description: "Manage private beta administration"
    },
    create: {
      key: "admin:manage",
      resource: "admin",
      action: "MANAGE",
      scope: "ADMIN",
      status: "ACTIVE",
      description: "Manage private beta administration"
    }
  });

  const existingRole = await prisma.role.findFirst({
    where: { organizationId: null, key: "admin" }
  });
  const role = existingRole
    ? await prisma.role.update({
        where: { id: existingRole.id },
        data: {
          name: "admin",
          displayName: "Admin",
          description: "Private beta platform administrator",
          scope: "ADMIN",
          status: "ACTIVE",
          isSystem: true,
          deletedAt: null
        }
      })
    : await prisma.role.create({
        data: {
          organizationId: null,
          key: "admin",
          name: "admin",
          displayName: "Admin",
          description: "Private beta platform administrator",
          scope: "ADMIN",
          status: "ACTIVE",
          isSystem: true
        }
      });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id
      }
    },
    update: { deletedAt: null },
    create: {
      roleId: role.id,
      permissionId: permission.id
    }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id
      }
    },
    update: {
      organizationId: null,
      assignedById: user.id,
      deletedAt: null,
      expiresAt: null
    },
    create: {
      userId: user.id,
      roleId: role.id,
      organizationId: null,
      assignedById: user.id
    }
  });

  return {
    status: "BOOTSTRAPPED" as const,
    userId: user.id,
    roleId: role.id,
    message: "Admin role assigned to existing user. No password was created."
  };
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
