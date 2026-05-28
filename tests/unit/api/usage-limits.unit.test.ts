import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  prisma: {
    subscription: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    plan: {
      findFirst: vi.fn(),
      create: vi.fn()
    },
    securitySetting: {
      findUnique: vi.fn()
    },
    billingAdminOverride: {
      findFirst: vi.fn()
    },
    billingPlan: {
      findUnique: vi.fn()
    },
    usageMeter: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    usageMeterEvent: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    billingAuditEvent: {
      create: vi.fn()
    },
    usageCounter: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn()
    },
    usageEvent: {
      create: vi.fn()
    },
    $transaction: vi.fn(async (input: any) => {
      if (typeof input === "function") {
        return input(db.prisma);
      }
      return input;
    })
  }
}));

vi.mock("../../../apps/api/src/infra/prisma/prisma.js", () => ({
  prisma: db.prisma
}));

describe("UsageLimitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.subscription.findFirst.mockResolvedValue({ id: "subscription-1", planId: "plan-1", plan: plan() });
    db.prisma.usageCounter.findUnique.mockResolvedValue(null);
    db.prisma.usageCounter.findMany.mockResolvedValue([]);
    db.prisma.usageCounter.upsert.mockResolvedValue({});
    db.prisma.usageEvent.create.mockResolvedValue({});
    db.prisma.securitySetting.findUnique.mockResolvedValue(null);
    db.prisma.billingAdminOverride.findFirst.mockResolvedValue(null);
    db.prisma.billingPlan.findUnique.mockResolvedValue(null);
    db.prisma.usageMeter.findUnique.mockResolvedValue(null);
    db.prisma.usageMeter.upsert.mockResolvedValue({});
    db.prisma.usageMeterEvent.findUnique.mockResolvedValue(null);
    db.prisma.usageMeterEvent.create.mockResolvedValue({});
    db.prisma.billingAuditEvent.create.mockResolvedValue({});
  });

  it("blocks scan usage when the monthly quota is exceeded", async () => {
    db.prisma.usageCounter.findUnique.mockResolvedValue({ used: 25 });
    db.prisma.usageMeter.findUnique.mockResolvedValue({ used: 25 });
    const { UsageLimitService } = await import("../../../apps/api/src/modules/usage/usage-limits.service.js");

    await expect(new UsageLimitService().assertAndConsume("org-1", "SCANS_PER_MONTH")).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED"
    });
    expect(db.prisma.usageEvent.create).not.toHaveBeenCalled();
  });

  it("returns real persisted usage counters for dashboard APIs", async () => {
    db.prisma.usageCounter.findMany.mockResolvedValue([
      { metric: "SCANS_PER_MONTH", used: 4, limit: 25 }
    ]);
    const { UsageLimitService } = await import("../../../apps/api/src/modules/usage/usage-limits.service.js");

    const summary = await new UsageLimitService().summary("org-1");

    expect(summary.counters.find((counter) => counter.metric === "SCANS_PER_MONTH")).toMatchObject({
      used: 4,
      limit: 25,
      remaining: 21
    });
  });
});

function plan() {
  return {
    id: "plan-1",
    tier: "FREE_BETA",
    name: "Free Beta",
    scansPerMonth: 25,
    aiValidationsPerMonth: 50,
    remediationRunsPerMonth: 25,
    reportExportsPerMonth: 25,
    monitoredProjects: 3
  };
}
