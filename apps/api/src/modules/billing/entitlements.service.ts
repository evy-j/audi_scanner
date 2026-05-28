import type { UsageMetric } from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { redactSecretLikeValues } from "../../common/logging/redaction.js";
import { env } from "../../config/environment.js";
import { prisma } from "../../infra/prisma/prisma.js";
import { addMonths, startOfMonth } from "../usage/usage-period.js";

const db = prisma as any;

export const ENTITLEMENT_KEYS = {
  scansMonthly: "scans.monthly",
  aiValidationsMonthly: "ai_validations.monthly",
  remediationMonthly: "remediation.monthly",
  reportsMonthly: "reports.monthly",
  sourceArtifactsMonthly: "source_artifacts.monthly",
  repoConnectionsMax: "repo_connections.max",
  monitoredProjectsMax: "monitored_projects.max",
  simulationsMonthly: "simulations.monthly",
  fuzzRunsMonthly: "fuzz_runs.monthly",
  threatMatchesMonthly: "threat_matches.monthly",
  teamMembersMax: "team_members.max",
  apiKeysMax: "api_keys.max",
  publicReportSharing: "public_report_sharing",
  webhooks: "webhooks",
  githubApp: "github_app",
  cliCi: "cli_ci",
  enterpriseRbac: "enterprise_rbac",
  ssoReadiness: "sso_readiness"
} as const;

export type EntitlementDecision = {
  allowed: boolean;
  code: "ALLOWED" | "ENTITLEMENT_DENIED" | "LIMIT_EXCEEDED" | "SUBSCRIPTION_EXPIRED";
  organizationId: string;
  entitlementKey: string;
  requested: number;
  used: number;
  limit: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
  plan: string;
  reason?: string;
};

type EntitlementOptions = {
  metric?: UsageMetric | undefined;
  projectId?: string | null | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  eventName?: string | undefined;
  actorUserId?: string | undefined;
  apiKeyId?: string | undefined;
  metadata?: unknown;
};

const DEFAULT_LIMITS_BY_TIER: Record<string, Record<string, number>> = {
  FREE_BETA: {
    [ENTITLEMENT_KEYS.scansMonthly]: env.FREE_BETA_SCANS_PER_MONTH,
    [ENTITLEMENT_KEYS.aiValidationsMonthly]: env.FREE_BETA_AI_VALIDATIONS_PER_MONTH,
    [ENTITLEMENT_KEYS.remediationMonthly]: env.FREE_BETA_REMEDIATION_RUNS_PER_MONTH,
    [ENTITLEMENT_KEYS.reportsMonthly]: env.FREE_BETA_REPORT_EXPORTS_PER_MONTH,
    [ENTITLEMENT_KEYS.sourceArtifactsMonthly]: env.FREE_BETA_SCANS_PER_MONTH,
    [ENTITLEMENT_KEYS.repoConnectionsMax]: 3,
    [ENTITLEMENT_KEYS.monitoredProjectsMax]: env.FREE_BETA_MONITORED_PROJECTS,
    [ENTITLEMENT_KEYS.simulationsMonthly]: 5,
    [ENTITLEMENT_KEYS.fuzzRunsMonthly]: 5,
    [ENTITLEMENT_KEYS.threatMatchesMonthly]: 50,
    [ENTITLEMENT_KEYS.teamMembersMax]: 5,
    [ENTITLEMENT_KEYS.apiKeysMax]: 3,
    [ENTITLEMENT_KEYS.publicReportSharing]: 1,
    [ENTITLEMENT_KEYS.webhooks]: 1,
    [ENTITLEMENT_KEYS.githubApp]: 1,
    [ENTITLEMENT_KEYS.cliCi]: 1,
    [ENTITLEMENT_KEYS.enterpriseRbac]: 1,
    [ENTITLEMENT_KEYS.ssoReadiness]: 0
  },
  DEVELOPER: {
    [ENTITLEMENT_KEYS.scansMonthly]: 100,
    [ENTITLEMENT_KEYS.aiValidationsMonthly]: 150,
    [ENTITLEMENT_KEYS.remediationMonthly]: 100,
    [ENTITLEMENT_KEYS.reportsMonthly]: 100,
    [ENTITLEMENT_KEYS.sourceArtifactsMonthly]: 100,
    [ENTITLEMENT_KEYS.repoConnectionsMax]: 10,
    [ENTITLEMENT_KEYS.monitoredProjectsMax]: 5,
    [ENTITLEMENT_KEYS.simulationsMonthly]: 20,
    [ENTITLEMENT_KEYS.fuzzRunsMonthly]: 20,
    [ENTITLEMENT_KEYS.threatMatchesMonthly]: 250,
    [ENTITLEMENT_KEYS.teamMembersMax]: 3,
    [ENTITLEMENT_KEYS.apiKeysMax]: 10,
    [ENTITLEMENT_KEYS.publicReportSharing]: 1,
    [ENTITLEMENT_KEYS.webhooks]: 3,
    [ENTITLEMENT_KEYS.githubApp]: 1,
    [ENTITLEMENT_KEYS.cliCi]: 1,
    [ENTITLEMENT_KEYS.enterpriseRbac]: 0,
    [ENTITLEMENT_KEYS.ssoReadiness]: 0
  },
  TEAM: {
    [ENTITLEMENT_KEYS.scansMonthly]: 500,
    [ENTITLEMENT_KEYS.aiValidationsMonthly]: 750,
    [ENTITLEMENT_KEYS.remediationMonthly]: 500,
    [ENTITLEMENT_KEYS.reportsMonthly]: 500,
    [ENTITLEMENT_KEYS.sourceArtifactsMonthly]: 500,
    [ENTITLEMENT_KEYS.repoConnectionsMax]: 50,
    [ENTITLEMENT_KEYS.monitoredProjectsMax]: 25,
    [ENTITLEMENT_KEYS.simulationsMonthly]: 100,
    [ENTITLEMENT_KEYS.fuzzRunsMonthly]: 100,
    [ENTITLEMENT_KEYS.threatMatchesMonthly]: 1000,
    [ENTITLEMENT_KEYS.teamMembersMax]: 25,
    [ENTITLEMENT_KEYS.apiKeysMax]: 50,
    [ENTITLEMENT_KEYS.publicReportSharing]: 1,
    [ENTITLEMENT_KEYS.webhooks]: 25,
    [ENTITLEMENT_KEYS.githubApp]: 1,
    [ENTITLEMENT_KEYS.cliCi]: 1,
    [ENTITLEMENT_KEYS.enterpriseRbac]: 1,
    [ENTITLEMENT_KEYS.ssoReadiness]: 0
  },
  ENTERPRISE: Object.fromEntries(Object.values(ENTITLEMENT_KEYS).map((key) => [key, -1]))
};

export class BillingEntitlementService {
  async checkEntitlement(
    organizationId: string,
    entitlementKey: string,
    requestedAmount = 1,
    options: EntitlementOptions = {}
  ): Promise<EntitlementDecision> {
    const { periodStart, periodEnd } = currentUsagePeriod();
    const securityDenied = await this.securityDenial(organizationId, entitlementKey);
    const active = await this.activePlan(organizationId, entitlementKey);
    const limit = securityDenied ? 0 : active.limit;
    const meter = await db.usageMeter.findUnique({
      where: { organizationId_entitlementKey_periodStart: { organizationId, entitlementKey, periodStart } }
    });
    const used = meter?.used ?? 0;
    const unlimited = limit < 0;
    const remaining = unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used);

    if (securityDenied) {
      return {
        allowed: false,
        code: "ENTITLEMENT_DENIED",
        organizationId,
        entitlementKey,
        requested: requestedAmount,
        used,
        limit,
        remaining,
        periodStart,
        periodEnd,
        plan: active.plan,
        reason: securityDenied
      };
    }

    if (!active.active) {
      return {
        allowed: false,
        code: "SUBSCRIPTION_EXPIRED",
        organizationId,
        entitlementKey,
        requested: requestedAmount,
        used,
        limit,
        remaining,
        periodStart,
        periodEnd,
        plan: active.plan,
        reason: "No active subscription, trial, free beta plan, or manual override grants this entitlement."
      };
    }

    if (!unlimited && used + requestedAmount > limit) {
      return {
        allowed: false,
        code: "LIMIT_EXCEEDED",
        organizationId,
        entitlementKey,
        requested: requestedAmount,
        used,
        limit,
        remaining,
        periodStart,
        periodEnd,
        plan: active.plan,
        reason: "Plan limit exceeded"
      };
    }

    return {
      allowed: true,
      code: "ALLOWED",
      organizationId,
      entitlementKey,
      requested: requestedAmount,
      used,
      limit,
      remaining,
      periodStart,
      periodEnd,
      plan: active.plan
    };
  }

  async assertEntitlement(
    organizationId: string,
    entitlementKey: string,
    requestedAmount = 1,
    options: EntitlementOptions = {}
  ): Promise<EntitlementDecision> {
    const decision = await this.checkEntitlement(organizationId, entitlementKey, requestedAmount, options);
    if (!decision.allowed) {
      await this.audit(organizationId, "entitlement_denied", "ENTITLEMENT", entitlementKey, {
        ...decision,
        periodStart: decision.periodStart.toISOString(),
        periodEnd: decision.periodEnd.toISOString()
      }, options);
      if (decision.code === "LIMIT_EXCEEDED") {
        throw ApiError.limitExceeded("Usage limit exceeded", publicDecision(decision));
      }
      if (decision.code === "SUBSCRIPTION_EXPIRED") {
        throw ApiError.subscriptionExpired("Subscription is expired or inactive", publicDecision(decision));
      }
      throw ApiError.entitlementDenied("Entitlement denied", publicDecision(decision));
    }
    return decision;
  }

  async consume(decision: EntitlementDecision, options: EntitlementOptions = {}) {
    if (!decision.allowed) return;
    const idempotencyKey = options.resourceId
      ? `${decision.entitlementKey}:${options.resourceType ?? "RESOURCE"}:${options.resourceId}`
      : undefined;
    await db.$transaction(async (tx: any) => {
      await tx.usageMeter.upsert({
        where: {
          organizationId_entitlementKey_periodStart: {
            organizationId: decision.organizationId,
            entitlementKey: decision.entitlementKey,
            periodStart: decision.periodStart
          }
        },
        create: {
          organizationId: decision.organizationId,
          projectId: options.projectId ?? null,
          entitlementKey: decision.entitlementKey,
          metric: options.metric ?? null,
          periodStart: decision.periodStart,
          periodEnd: decision.periodEnd,
          used: decision.requested,
          limit: decision.limit,
          metadata: toJson({ plan: decision.plan })
        },
        update: {
          used: { increment: decision.requested },
          limit: decision.limit,
          periodEnd: decision.periodEnd,
          ...(options.projectId ? { projectId: options.projectId } : {})
        }
      });
      if (idempotencyKey) {
        const existing = await tx.usageMeterEvent.findUnique({
          where: { organizationId_idempotencyKey: { organizationId: decision.organizationId, idempotencyKey } }
        });
        if (existing) return;
      }
      await tx.usageMeterEvent.create({
        data: {
          organizationId: decision.organizationId,
          projectId: options.projectId ?? null,
          entitlementKey: decision.entitlementKey,
          eventName: options.eventName ?? usageEventName(decision.entitlementKey),
          quantity: decision.requested,
          resourceType: options.resourceType ?? null,
          resourceId: options.resourceId ?? null,
          idempotencyKey: idempotencyKey ?? null,
          metadata: toJson(redactSecretLikeValues(options.metadata ?? {}))
        }
      });
      await tx.billingAuditEvent.create({
        data: {
          organizationId: decision.organizationId,
          projectId: options.projectId ?? null,
          actorUserId: options.actorUserId ?? null,
          apiKeyId: options.apiKeyId ?? null,
          action: "usage_event_recorded",
          resourceType: options.resourceType ?? "ENTITLEMENT",
          resourceId: options.resourceId ?? decision.entitlementKey,
          metadata: toJson({
            entitlementKey: decision.entitlementKey,
            quantity: decision.requested,
            limit: decision.limit,
            periodStart: decision.periodStart.toISOString(),
            periodEnd: decision.periodEnd.toISOString()
          })
        }
      });
    });
  }

  async assertMaxAllowed(
    organizationId: string,
    entitlementKey: string,
    currentCount: number,
    requestedAmount = 1,
    options: EntitlementOptions = {}
  ) {
    const active = await this.activePlan(organizationId, entitlementKey);
    const securityDenied = await this.securityDenial(organizationId, entitlementKey);
    const limit = securityDenied ? 0 : active.limit;
    if (securityDenied || (!active.active && active.limit !== -1)) {
      const decision = await this.checkEntitlement(organizationId, entitlementKey, requestedAmount, options);
      await this.assertEntitlement(organizationId, entitlementKey, requestedAmount, options).catch((error) => {
        throw error;
      });
      return decision;
    }
    if (limit >= 0 && currentCount + requestedAmount > limit) {
      const period = currentUsagePeriod();
      const decision: EntitlementDecision = {
        allowed: false,
        code: "LIMIT_EXCEEDED",
        organizationId,
        entitlementKey,
        requested: requestedAmount,
        used: currentCount,
        limit,
        remaining: Math.max(0, limit - currentCount),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        plan: active.plan,
        reason: "Plan maximum exceeded"
      };
      await this.audit(organizationId, "entitlement_denied", "ENTITLEMENT", entitlementKey, publicDecision(decision), options);
      throw ApiError.limitExceeded("Usage limit exceeded", publicDecision(decision));
    }
    return {
      allowed: true,
      organizationId,
      entitlementKey,
      used: currentCount,
      limit,
      remaining: limit < 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - currentCount - requestedAmount),
      plan: active.plan
    };
  }

  metricToEntitlementKey(metric: UsageMetric): string {
    switch (metric) {
      case "SCANS_PER_MONTH":
      case "GITHUB_SCANS_PER_MONTH":
      case "CLI_SCANS_PER_MONTH":
        return ENTITLEMENT_KEYS.scansMonthly;
      case "AI_VALIDATIONS_PER_MONTH":
        return ENTITLEMENT_KEYS.aiValidationsMonthly;
      case "REMEDIATION_RUNS_PER_MONTH":
        return ENTITLEMENT_KEYS.remediationMonthly;
      case "REPORT_EXPORTS_PER_MONTH":
        return ENTITLEMENT_KEYS.reportsMonthly;
      case "MONITORED_PROJECTS":
        return ENTITLEMENT_KEYS.monitoredProjectsMax;
      case "SOURCE_ARTIFACTS_PER_MONTH":
        return ENTITLEMENT_KEYS.sourceArtifactsMonthly;
      case "SIMULATIONS_PER_MONTH":
        return ENTITLEMENT_KEYS.simulationsMonthly;
      case "FUZZ_RUNS_PER_MONTH":
        return ENTITLEMENT_KEYS.fuzzRunsMonthly;
      case "THREAT_MATCHES_PER_MONTH":
        return ENTITLEMENT_KEYS.threatMatchesMonthly;
      case "API_KEYS_MAX":
        return ENTITLEMENT_KEYS.apiKeysMax;
      case "TEAM_MEMBERS_MAX":
        return ENTITLEMENT_KEYS.teamMembersMax;
      case "REPO_CONNECTIONS_MAX":
        return ENTITLEMENT_KEYS.repoConnectionsMax;
      case "WEBHOOKS_MAX":
        return ENTITLEMENT_KEYS.webhooks;
      default:
        return String(metric).toLowerCase();
    }
  }

  private async activePlan(organizationId: string, entitlementKey: string): Promise<{ active: boolean; limit: number; plan: string }> {
    const override = await db.billingAdminOverride.findFirst({
      where: {
        organizationId,
        revokedAt: null,
        AND: [
          { OR: [{ entitlementKey }, { entitlementKey: null }] },
          {
            OR: [
              { expiresAt: null, permanentConfirmed: true },
              { expiresAt: { gt: new Date() } }
            ]
          }
        ]
      },
      orderBy: { createdAt: "desc" }
    });
    if (override) {
      return { active: true, limit: override.limit ?? -1, plan: "MANUAL_OVERRIDE" };
    }

    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["TRIALING", "ACTIVE", "FREE_BETA", "MANUAL_OVERRIDE"] }
      },
      orderBy: { createdAt: "desc" },
      include: { plan: true }
    });
    const legacyPlan = subscription?.plan ?? await this.ensureFreeBetaPlan(organizationId);
    const tier = subscription?.status === "MANUAL_OVERRIDE" ? "ENTERPRISE" : legacyPlan.tier;
    const seededBillingPlan = await db.billingPlan.findUnique({
      where: { slug: String(tier).toLowerCase() },
      include: { entitlements: true }
    }).catch(() => null);
    const seededLimit = seededBillingPlan?.entitlements?.find((item: any) => item.key === entitlementKey && !item.deletedAt);
    const limit = typeof seededLimit?.limit === "number" ? seededLimit.limit : legacyLimitFor(legacyPlan, entitlementKey);
    return {
      active: true,
      limit,
      plan: seededBillingPlan?.slug ?? String(tier)
    };
  }

  private async ensureFreeBetaPlan(organizationId: string) {
    const existing = await db.plan.findFirst({
      where: { organizationId, tier: "FREE_BETA", active: true },
      orderBy: { createdAt: "desc" }
    }) ?? await db.plan.findFirst({
      where: { organizationId: null, tier: "FREE_BETA", active: true },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return existing;
    return db.plan.create({
      data: {
        organizationId,
        tier: "FREE_BETA",
        name: "Free Beta",
        scansPerMonth: env.FREE_BETA_SCANS_PER_MONTH,
        aiValidationsPerMonth: env.FREE_BETA_AI_VALIDATIONS_PER_MONTH,
        remediationRunsPerMonth: env.FREE_BETA_REMEDIATION_RUNS_PER_MONTH,
        reportExportsPerMonth: env.FREE_BETA_REPORT_EXPORTS_PER_MONTH,
        monitoredProjects: env.FREE_BETA_MONITORED_PROJECTS,
        active: true,
        metadata: { seeded: true, seedVersion: "p13-free-beta-fallback/v1" }
      }
    });
  }

  private async securityDenial(organizationId: string, entitlementKey: string): Promise<string | null> {
    const security = await db.securitySetting.findUnique({ where: { organizationId } });
    if (!security) return null;
    if (entitlementKey === ENTITLEMENT_KEYS.publicReportSharing && security.publicReportSharingAllowed === false) {
      return "Public report sharing is disabled by organization security settings.";
    }
    if (entitlementKey === ENTITLEMENT_KEYS.webhooks && security.webhookAllowed === false) {
      return "Webhooks are disabled by organization security settings.";
    }
    if (entitlementKey === ENTITLEMENT_KEYS.simulationsMonthly && security.simulationAllowed === false) {
      return "Simulation runs are disabled by organization security settings.";
    }
    if (entitlementKey === ENTITLEMENT_KEYS.fuzzRunsMonthly && security.fuzzingAllowed === false) {
      return "Fuzzing runs are disabled by organization security settings.";
    }
    if (entitlementKey === ENTITLEMENT_KEYS.monitoredProjectsMax && security.monitoringAllowed === false) {
      return "Monitoring is disabled by organization security settings.";
    }
    return null;
  }

  private async audit(
    organizationId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: unknown,
    options: EntitlementOptions
  ) {
    await db.billingAuditEvent.create({
      data: {
        organizationId,
        projectId: options.projectId ?? null,
        actorUserId: options.actorUserId ?? null,
        apiKeyId: options.apiKeyId ?? null,
        action,
        resourceType,
        resourceId,
        metadata: toJson(redactSecretLikeValues(metadata))
      }
    }).catch(() => undefined);
  }
}

function currentUsagePeriod() {
  const periodStart = startOfMonth(new Date());
  return { periodStart, periodEnd: addMonths(periodStart, 1) };
}

function legacyLimitFor(plan: any, entitlementKey: string): number {
  const tierLimits = DEFAULT_LIMITS_BY_TIER[String(plan?.tier ?? "FREE_BETA")] ?? DEFAULT_LIMITS_BY_TIER.FREE_BETA!;
  if (entitlementKey in tierLimits) return tierLimits[entitlementKey]!;
  switch (entitlementKey) {
    case ENTITLEMENT_KEYS.scansMonthly:
      return Number(plan?.scansPerMonth ?? env.FREE_BETA_SCANS_PER_MONTH);
    case ENTITLEMENT_KEYS.aiValidationsMonthly:
      return Number(plan?.aiValidationsPerMonth ?? env.FREE_BETA_AI_VALIDATIONS_PER_MONTH);
    case ENTITLEMENT_KEYS.remediationMonthly:
      return Number(plan?.remediationRunsPerMonth ?? env.FREE_BETA_REMEDIATION_RUNS_PER_MONTH);
    case ENTITLEMENT_KEYS.reportsMonthly:
      return Number(plan?.reportExportsPerMonth ?? env.FREE_BETA_REPORT_EXPORTS_PER_MONTH);
    case ENTITLEMENT_KEYS.monitoredProjectsMax:
      return Number(plan?.monitoredProjects ?? env.FREE_BETA_MONITORED_PROJECTS);
    default:
      return 0;
  }
}

function usageEventName(entitlementKey: string): string {
  const names: Record<string, string> = {
    [ENTITLEMENT_KEYS.scansMonthly]: "scan.created",
    [ENTITLEMENT_KEYS.aiValidationsMonthly]: "ai_validation.created",
    [ENTITLEMENT_KEYS.remediationMonthly]: "remediation.created",
    [ENTITLEMENT_KEYS.reportsMonthly]: "report.exported",
    [ENTITLEMENT_KEYS.sourceArtifactsMonthly]: "source_artifact.uploaded",
    [ENTITLEMENT_KEYS.monitoredProjectsMax]: "monitor.target.created",
    [ENTITLEMENT_KEYS.webhooks]: "webhook.created",
    [ENTITLEMENT_KEYS.threatMatchesMonthly]: "threat_match.created",
    [ENTITLEMENT_KEYS.apiKeysMax]: "api_key.created",
    [ENTITLEMENT_KEYS.teamMembersMax]: "member.invited"
  };
  return names[entitlementKey] ?? `${entitlementKey}.used`;
}

function publicDecision(decision: EntitlementDecision) {
  return {
    code: decision.code,
    entitlementKey: decision.entitlementKey,
    requested: decision.requested,
    used: decision.used,
    limit: decision.limit,
    remaining: decision.remaining,
    plan: decision.plan,
    resetDate: decision.periodEnd.toISOString(),
    reason: decision.reason
  };
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
