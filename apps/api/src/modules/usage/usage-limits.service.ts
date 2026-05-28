import { startOfMonth, addMonths } from "./usage-period.js";
import { ApiError } from "../../common/errors/api-error.js";
import { prisma } from "../../infra/prisma/prisma.js";
import { env } from "../../config/environment.js";
import type { Prisma, UsageMetric } from "@prisma/client";
import { BillingEntitlementService } from "../billing/entitlements.service.js";

export const DEFAULT_FREE_BETA_LIMITS = {
  scansPerMonth: env.FREE_BETA_SCANS_PER_MONTH,
  aiValidationsPerMonth: env.FREE_BETA_AI_VALIDATIONS_PER_MONTH,
  remediationRunsPerMonth: env.FREE_BETA_REMEDIATION_RUNS_PER_MONTH,
  reportExportsPerMonth: env.FREE_BETA_REPORT_EXPORTS_PER_MONTH,
  monitoredProjects: env.FREE_BETA_MONITORED_PROJECTS
};

export class UsageLimitService {
  constructor(private readonly billingEntitlements = new BillingEntitlementService()) {}

  async assertAndConsume(
    organizationId: string,
    metric: UsageMetric,
    input: { quantity?: number | undefined; resourceType?: string | undefined; resourceId?: string | undefined } = {}
  ) {
    const quantity = input.quantity ?? 1;
    const { periodStart, periodEnd } = currentUsagePeriod();
    const plan = await this.ensurePlan(organizationId);
    const entitlementKey = this.billingEntitlements.metricToEntitlementKey(metric);
    const decision = await this.billingEntitlements.assertEntitlement(organizationId, entitlementKey, quantity, {
      metric,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      eventName: usageEventName(metric)
    });
    const limit = decision.limit;

    if (limit >= 0) {
      const existing = await prisma.usageCounter.findUnique({
        where: { organizationId_metric_periodStart: { organizationId, metric, periodStart } }
      });
      const used = existing?.used ?? 0;
      if (used + quantity > limit) {
        throw ApiError.limitExceeded("Usage limit exceeded", {
          metric,
          used,
          requested: quantity,
          limit,
          periodStart,
          periodEnd,
          plan: plan.tier
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.usageCounter.upsert({
        where: { organizationId_metric_periodStart: { organizationId, metric, periodStart } },
        create: {
          organizationId,
          planId: plan.id,
          metric,
          periodStart,
          periodEnd,
          used: quantity,
          limit
        },
        update: {
          used: { increment: quantity },
          limit,
          planId: plan.id,
          periodEnd
        }
      });
      await tx.usageEvent.create({
        data: {
          organizationId,
          planId: plan.id,
          metric,
          quantity,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null
        }
      });
    });
    await this.billingEntitlements.consume(decision, {
      metric,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      eventName: usageEventName(metric)
    });
  }

  async summary(organizationId: string) {
    const { periodStart, periodEnd } = currentUsagePeriod();
    const plan = await this.ensurePlan(organizationId);
    const counters = await prisma.usageCounter.findMany({
      where: { organizationId, periodStart }
    });
    const byMetric = new Map(counters.map((counter) => [counter.metric, counter]));

    return {
      organizationId,
      plan: {
        id: plan.id,
        tier: plan.tier,
        name: plan.name
      },
      periodStart,
      periodEnd,
      counters: ([
        "SCANS_PER_MONTH",
        "AI_VALIDATIONS_PER_MONTH",
        "REMEDIATION_RUNS_PER_MONTH",
        "REPORT_EXPORTS_PER_MONTH",
        "MONITORED_PROJECTS",
        "SOURCE_ARTIFACTS_PER_MONTH",
        "GITHUB_SCANS_PER_MONTH",
        "CLI_SCANS_PER_MONTH",
        "SIMULATIONS_PER_MONTH",
        "FUZZ_RUNS_PER_MONTH",
        "THREAT_MATCHES_PER_MONTH",
        "API_KEYS_MAX",
        "TEAM_MEMBERS_MAX",
        "REPO_CONNECTIONS_MAX",
        "WEBHOOKS_MAX"
      ] as UsageMetric[]).map((metric) => {
        const counter = byMetric.get(metric);
        const limit = limitFor(plan, metric);
        return {
          metric,
          used: counter?.used ?? 0,
          limit,
          remaining: Math.max(0, limit - (counter?.used ?? 0))
        };
      })
    };
  }

  async ensurePlan(organizationId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { organizationId, deletedAt: null, status: { in: ["TRIALING", "ACTIVE", "FREE_BETA", "MANUAL_OVERRIDE"] } },
      orderBy: { createdAt: "desc" },
      include: { plan: true }
    });
    if (subscription?.plan) {
      return subscription.plan;
    }

    const organizationPlan = await prisma.plan.findFirst({
      where: { organizationId, tier: "FREE_BETA", active: true },
      orderBy: { createdAt: "desc" }
    });
    const existingPlan = organizationPlan ?? await prisma.plan.findFirst({
      where: { organizationId: null, tier: "FREE_BETA", active: true },
      orderBy: { createdAt: "desc" }
    });
    if (existingPlan) {
      if (subscription && !subscription.planId) {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { planId: existingPlan.id } });
      }
      return existingPlan;
    }

    return prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          organizationId,
          tier: "FREE_BETA",
          name: "Free Beta",
          ...DEFAULT_FREE_BETA_LIMITS
        }
      });
      if (subscription) {
        await tx.subscription.update({ where: { id: subscription.id }, data: { planId: plan.id } });
      } else {
        await tx.subscription.create({
          data: {
            organizationId,
            planId: plan.id,
            tier: "FREE",
            status: "TRIALING",
            provider: "internal-beta",
            scanQuotaMonthly: DEFAULT_FREE_BETA_LIMITS.scansPerMonth,
            currentPeriodStart: currentUsagePeriod().periodStart,
            currentPeriodEnd: currentUsagePeriod().periodEnd
          }
        });
      }
      return plan;
    });
  }
}

function currentUsagePeriod() {
  const periodStart = startOfMonth(new Date());
  return {
    periodStart,
    periodEnd: addMonths(periodStart, 1)
  };
}

function limitFor(
  plan: {
    scansPerMonth: number;
    aiValidationsPerMonth: number;
    remediationRunsPerMonth: number;
    reportExportsPerMonth: number;
    monitoredProjects: number;
    tier?: string;
  },
  metric: UsageMetric
): number {
  const tier = String(plan.tier ?? "FREE_BETA");
  switch (metric) {
    case "SCANS_PER_MONTH":
    case "GITHUB_SCANS_PER_MONTH":
    case "CLI_SCANS_PER_MONTH":
      return plan.scansPerMonth;
    case "AI_VALIDATIONS_PER_MONTH":
      return plan.aiValidationsPerMonth;
    case "REMEDIATION_RUNS_PER_MONTH":
      return plan.remediationRunsPerMonth;
    case "REPORT_EXPORTS_PER_MONTH":
      return plan.reportExportsPerMonth;
    case "MONITORED_PROJECTS":
      return plan.monitoredProjects;
    case "SOURCE_ARTIFACTS_PER_MONTH":
      return tierLimit(tier, 25, 100, 500, -1);
    case "SIMULATIONS_PER_MONTH":
      return tierLimit(tier, 5, 20, 100, -1);
    case "FUZZ_RUNS_PER_MONTH":
      return tierLimit(tier, 5, 20, 100, -1);
    case "THREAT_MATCHES_PER_MONTH":
      return tierLimit(tier, 50, 250, 1000, -1);
    case "API_KEYS_MAX":
      return tierLimit(tier, 3, 10, 50, -1);
    case "TEAM_MEMBERS_MAX":
      return tierLimit(tier, 5, 3, 25, -1);
    case "REPO_CONNECTIONS_MAX":
      return tierLimit(tier, 3, 10, 50, -1);
    case "WEBHOOKS_MAX":
      return tierLimit(tier, 1, 3, 25, -1);
  }
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function tierLimit(tier: string, freeBeta: number, developer: number, team: number, enterprise: number): number {
  switch (tier) {
    case "DEVELOPER":
      return developer;
    case "TEAM":
      return team;
    case "ENTERPRISE":
      return enterprise;
    case "FREE_BETA":
    default:
      return freeBeta;
  }
}

function usageEventName(metric: UsageMetric): string {
  switch (metric) {
    case "SCANS_PER_MONTH":
      return "scan.created";
    case "GITHUB_SCANS_PER_MONTH":
      return "github.scan.created";
    case "CLI_SCANS_PER_MONTH":
      return "cli.scan.created";
    case "AI_VALIDATIONS_PER_MONTH":
      return "ai_validation.created";
    case "REMEDIATION_RUNS_PER_MONTH":
      return "remediation.created";
    case "REPORT_EXPORTS_PER_MONTH":
      return "report.exported";
    case "SOURCE_ARTIFACTS_PER_MONTH":
      return "source_artifact.uploaded";
    case "MONITORED_PROJECTS":
      return "monitor.target.created";
    case "SIMULATIONS_PER_MONTH":
      return "simulation.created";
    case "FUZZ_RUNS_PER_MONTH":
      return "fuzz.created";
    case "THREAT_MATCHES_PER_MONTH":
      return "threat_match.created";
    case "API_KEYS_MAX":
      return "api_key.created";
    case "TEAM_MEMBERS_MAX":
      return "member.invited";
    case "REPO_CONNECTIONS_MAX":
      return "repository.connected";
    case "WEBHOOKS_MAX":
      return "webhook.created";
  }
}
