import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const currency = process.env.BILLING_CURRENCY?.trim() || "INR";

const catalog = [
  {
    slug: "free_beta",
    tier: "FREE_BETA",
    name: "Free Beta",
    description: "Default free beta plan for evaluation and early developer use.",
    monthlyPriceMinor: 0,
    contactSales: false,
    features: ["Safe source scans", "Professional reports", "CLI/CI beta access"],
    entitlements: {
      "scans.monthly": 25,
      "ai_validations.monthly": 50,
      "remediation.monthly": 25,
      "reports.monthly": 25,
      "source_artifacts.monthly": 25,
      "repo_connections.max": 3,
      "monitored_projects.max": 3,
      "simulations.monthly": 5,
      "fuzz_runs.monthly": 5,
      "threat_matches.monthly": 50,
      "team_members.max": 5,
      "api_keys.max": 3,
      "public_report_sharing": 1,
      "webhooks": 1,
      "github_app": 1,
      "cli_ci": 1,
      "enterprise_rbac": 1,
      "sso_readiness": 0
    }
  },
  {
    slug: "developer",
    tier: "DEVELOPER",
    name: "Developer",
    description: "Individual developer workflow plan with higher scan and CI capacity.",
    monthlyPriceMinor: 290000,
    contactSales: false,
    features: ["CLI/CI scans", "GitHub repository scans", "SARIF exports"],
    entitlements: {
      "scans.monthly": 100,
      "ai_validations.monthly": 150,
      "remediation.monthly": 100,
      "reports.monthly": 100,
      "source_artifacts.monthly": 100,
      "repo_connections.max": 10,
      "monitored_projects.max": 5,
      "simulations.monthly": 20,
      "fuzz_runs.monthly": 20,
      "threat_matches.monthly": 250,
      "team_members.max": 3,
      "api_keys.max": 10,
      "public_report_sharing": 1,
      "webhooks": 3,
      "github_app": 1,
      "cli_ci": 1,
      "enterprise_rbac": 0,
      "sso_readiness": 0
    }
  },
  {
    slug: "team",
    tier: "TEAM",
    name: "Team",
    description: "Team plan for shared projects, repository monitoring, and governed usage.",
    monthlyPriceMinor: 990000,
    contactSales: false,
    features: ["Team access", "Monitoring", "Webhooks", "Threat matching"],
    entitlements: {
      "scans.monthly": 500,
      "ai_validations.monthly": 750,
      "remediation.monthly": 500,
      "reports.monthly": 500,
      "source_artifacts.monthly": 500,
      "repo_connections.max": 50,
      "monitored_projects.max": 25,
      "simulations.monthly": 100,
      "fuzz_runs.monthly": 100,
      "threat_matches.monthly": 1000,
      "team_members.max": 25,
      "api_keys.max": 50,
      "public_report_sharing": 1,
      "webhooks": 25,
      "github_app": 1,
      "cli_ci": 1,
      "enterprise_rbac": 1,
      "sso_readiness": 0
    }
  },
  {
    slug: "enterprise",
    tier: "ENTERPRISE",
    name: "Enterprise",
    description: "Manual enterprise plan for high volume, governance, and SSO readiness.",
    monthlyPriceMinor: 0,
    contactSales: true,
    features: ["Manual enterprise override", "Tenant governance", "SSO readiness"],
    entitlements: {
      "scans.monthly": -1,
      "ai_validations.monthly": -1,
      "remediation.monthly": -1,
      "reports.monthly": -1,
      "source_artifacts.monthly": -1,
      "repo_connections.max": -1,
      "monitored_projects.max": -1,
      "simulations.monthly": -1,
      "fuzz_runs.monthly": -1,
      "threat_matches.monthly": -1,
      "team_members.max": -1,
      "api_keys.max": -1,
      "public_report_sharing": 1,
      "webhooks": -1,
      "github_app": 1,
      "cli_ci": 1,
      "enterprise_rbac": 1,
      "sso_readiness": 1
    }
  }
] as const;

async function main() {
  const results = [];
  for (const item of catalog) {
    const existing = await prisma.billingPlan.findUnique({ where: { slug: item.slug } });
    const plan = existing ?? await prisma.billingPlan.create({
      data: {
        slug: item.slug,
        tier: item.tier,
        name: item.name,
        description: item.description,
        monthlyPriceMinor: item.monthlyPriceMinor,
        currency,
        contactSales: item.contactSales,
        features: item.features,
        entitlementLimits: item.entitlements,
        active: true,
        metadata: {
          seeded: true,
          seedVersion: "p13-billing/v1"
        }
      }
    });

    const price = await prisma.billingPrice.findFirst({
      where: { billingPlanId: plan.id, provider: "DISABLED", active: true }
    });
    if (!price) {
      await prisma.billingPrice.create({
        data: {
          billingPlanId: plan.id,
          provider: "DISABLED",
          currency,
          unitAmountMinor: item.monthlyPriceMinor,
          interval: "month",
          nickname: `${item.name} monthly placeholder`,
          metadata: {
            providerReady: false,
            noFakeCheckout: true
          }
        }
      });
    }

    for (const [key, limit] of Object.entries(item.entitlements)) {
      const existingEntitlement = await prisma.entitlement.findUnique({
        where: { billingPlanId_key: { billingPlanId: plan.id, key } }
      });
      if (!existingEntitlement) {
        await prisma.entitlement.create({
          data: {
            billingPlanId: plan.id,
            key,
            displayName: key.replace(/[._-]/gu, " "),
            limit: Number(limit),
            enabled: Number(limit) !== 0,
            resetPeriod: key.endsWith(".monthly") ? "monthly" : "plan",
            metadata: {
              seeded: true,
              seedVersion: "p13-billing/v1"
            }
          }
        });
      }
    }

    results.push({ slug: item.slug, created: !existing, planId: plan.id });
  }

  console.log(JSON.stringify({ seeded: true, currency, plans: results }, null, 2));
}

if (!process.env.DATABASE_URL) {
  console.log(JSON.stringify({ seeded: false, skipped: true, reason: "DATABASE_URL is not set" }, null, 2));
  process.exit();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Billing seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
