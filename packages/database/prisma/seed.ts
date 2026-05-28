import {
  PrismaClient,
  type PermissionAction,
  type PermissionScope
} from "@prisma/client";

const prisma = new PrismaClient();

const rawDevPassword = process.env.DEV_SEED_PASSWORD?.trim();
const rawDevPasswordHash = process.env.DEV_SEED_PASSWORD_HASH?.trim();
const defaultDevPasswordHash =
  "$argon2id$v=19$m=65536,t=3,p=4$397yGBjZ4MKIVD0o2Ha6kw$jL6h9i3hlQKXI0ZT/dXTlUzID5vxcMKHvlvv0FOiCww";

const DEV_EMAIL = process.env.DEV_SEED_EMAIL?.trim() || "dev@audit-scanner.local";
const DEV_PASSWORD = rawDevPassword || "Development123!";
const DEV_PASSWORD_HASH =
  rawDevPasswordHash || defaultDevPasswordHash;
const DEV_ORG_SLUG = process.env.DEV_SEED_ORG_SLUG?.trim() || "development-labs";

const permissionSeeds: Array<{
  key: string;
  resource: string;
  action: PermissionAction;
  scope: PermissionScope;
  description: string;
}> = [
  {
    key: "scans:create",
    resource: "scans",
    action: "CREATE",
    scope: "SCAN",
    description: "Create and enqueue scans"
  },
  {
    key: "scans:read",
    resource: "scans",
    action: "READ",
    scope: "SCAN",
    description: "Read scans"
  },
  {
    key: "scans:cancel",
    resource: "scans",
    action: "EXECUTE",
    scope: "SCAN",
    description: "Cancel active scans"
  },
  {
    key: "reports:read",
    resource: "reports",
    action: "READ",
    scope: "REPORT",
    description: "Read audit reports"
  },
  {
    key: "reports:export",
    resource: "reports",
    action: "EXPORT",
    scope: "REPORT",
    description: "Export audit reports"
  },
  {
    key: "vulnerabilities:read",
    resource: "vulnerabilities",
    action: "READ",
    scope: "SCAN",
    description: "Read vulnerabilities"
  },
  {
    key: "vulnerabilities:update",
    resource: "vulnerabilities",
    action: "UPDATE",
    scope: "SCAN",
    description: "Update vulnerability status"
  },
  {
    key: "api-keys:read",
    resource: "api-keys",
    action: "READ",
    scope: "ORGANIZATION",
    description: "Read API keys"
  },
  {
    key: "api-keys:create",
    resource: "api-keys",
    action: "CREATE",
    scope: "ORGANIZATION",
    description: "Create API keys"
  },
  {
    key: "api-keys:revoke",
    resource: "api-keys",
    action: "DELETE",
    scope: "ORGANIZATION",
    description: "Revoke API keys"
  },
  {
    key: "organizations:read",
    resource: "organizations",
    action: "READ",
    scope: "ORGANIZATION",
    description: "Read organizations"
  },
  {
    key: "organizations:update",
    resource: "organizations",
    action: "UPDATE",
    scope: "ORGANIZATION",
    description: "Update organizations"
  },
  {
    key: "organizations:delete",
    resource: "organizations",
    action: "DELETE",
    scope: "ORGANIZATION",
    description: "Delete organizations"
  },
  {
    key: "subscriptions:read",
    resource: "subscriptions",
    action: "READ",
    scope: "BILLING",
    description: "Read subscriptions"
  },
  {
    key: "subscriptions:update",
    resource: "subscriptions",
    action: "UPDATE",
    scope: "BILLING",
    description: "Update subscriptions"
  }
];

async function main() {
  if (rawDevPassword && !rawDevPasswordHash) {
    throw new Error("DEV_SEED_PASSWORD_HASH must be set when DEV_SEED_PASSWORD is overridden");
  }

  const now = new Date();

  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {
      passwordHash: DEV_PASSWORD_HASH,
      displayName: "Development Admin",
      status: "ACTIVE",
      emailVerifiedAt: now,
      deletedAt: null,
      metadata: {
        seeded: true,
        environment: "development"
      }
    },
    create: {
      email: DEV_EMAIL,
      passwordHash: DEV_PASSWORD_HASH,
      displayName: "Development Admin",
      status: "ACTIVE",
      emailVerifiedAt: now,
      metadata: {
        seeded: true,
        environment: "development"
      }
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: DEV_ORG_SLUG },
    update: {
      ownerId: user.id,
      name: "Development Labs",
      status: "ACTIVE",
      billingEmail: DEV_EMAIL,
      deletedAt: null,
      metadata: {
        seeded: true,
        environment: "development"
      }
    },
    create: {
      ownerId: user.id,
      name: "Development Labs",
      slug: DEV_ORG_SLUG,
      status: "ACTIVE",
      billingEmail: DEV_EMAIL,
      metadata: {
        seeded: true,
        environment: "development"
      }
    }
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id
      }
    },
    update: {
      status: "ACTIVE",
      joinedAt: now,
      title: "Development Admin",
      deletedAt: null
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      status: "ACTIVE",
      joinedAt: now,
      title: "Development Admin"
    }
  });

  const permissions = await Promise.all(
    permissionSeeds.map((permission) =>
      prisma.permission.upsert({
        where: { key: permission.key },
        update: {
          resource: permission.resource,
          action: permission.action,
          scope: permission.scope,
          description: permission.description,
          status: "ACTIVE",
          deletedAt: null
        },
        create: {
          ...permission,
          status: "ACTIVE"
        }
      })
    )
  );

  const ownerRole = await prisma.role.upsert({
    where: {
      organizationId_key: {
        organizationId: organization.id,
        key: "owner"
      }
    },
    update: {
      name: "owner",
      displayName: "Owner",
      description: "Full organization access for local development",
      scope: "ORGANIZATION",
      status: "ACTIVE",
      isSystem: true,
      deletedAt: null
    },
    create: {
      organizationId: organization.id,
      key: "owner",
      name: "owner",
      displayName: "Owner",
      description: "Full organization access for local development",
      scope: "ORGANIZATION",
      status: "ACTIVE",
      isSystem: true
    }
  });

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: ownerRole.id,
            permissionId: permission.id
          }
        },
        update: { deletedAt: null },
        create: {
          roleId: ownerRole.id,
          permissionId: permission.id
        }
      })
    )
  );

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: ownerRole.id
      }
    },
    update: {
      organizationId: organization.id,
      assignedById: user.id,
      expiresAt: null,
      deletedAt: null
    },
    create: {
      userId: user.id,
      roleId: ownerRole.id,
      organizationId: organization.id,
      assignedById: user.id
    }
  });

  const ethereumMainnet = await prisma.chain.upsert({
    where: { slug: "ethereum-mainnet" },
    update: {
      name: "Ethereum Mainnet",
      chainType: "EVM",
      environment: "MAINNET",
      status: "ACTIVE",
      networkId: 1,
      caip2Id: "eip155:1",
      nativeSymbol: "ETH",
      deletedAt: null
    },
    create: {
      name: "Ethereum Mainnet",
      slug: "ethereum-mainnet",
      chainType: "EVM",
      environment: "MAINNET",
      status: "ACTIVE",
      networkId: 1,
      caip2Id: "eip155:1",
      nativeSymbol: "ETH"
    }
  });

  const localChain = await prisma.chain.upsert({
    where: { slug: "local-hardhat" },
    update: {
      name: "Local Hardhat",
      chainType: "EVM",
      environment: "LOCAL",
      status: "ACTIVE",
      networkId: 31337,
      caip2Id: "eip155:31337",
      nativeSymbol: "ETH",
      deletedAt: null
    },
    create: {
      name: "Local Hardhat",
      slug: "local-hardhat",
      chainType: "EVM",
      environment: "LOCAL",
      status: "ACTIVE",
      networkId: 31337,
      caip2Id: "eip155:31337",
      nativeSymbol: "ETH"
    }
  });

  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      organizationId: organization.id,
      provider: "local-dev",
      deletedAt: null
    }
  });

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscriptionData = {
    tier: "TEAM" as const,
    status: "ACTIVE" as const,
    provider: "local-dev",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    scanQuotaMonthly: 1_000,
    scansUsedCurrentPeriod: 0,
    metadata: {
      seeded: true,
      environment: "development"
    },
    deletedAt: null
  };

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: subscriptionData
    });
  } else {
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        ...subscriptionData
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        seeded: true,
        user: {
          id: user.id,
          email: DEV_EMAIL,
          password: DEV_PASSWORD
        },
        organization: {
          id: organization.id,
          slug: organization.slug
        },
        chains: {
          ethereumMainnet: ethereumMainnet.id,
          localHardhat: localChain.id
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
