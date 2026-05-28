import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { bootstrapAdmin, seedFreeBetaPlan } from "../../../packages/database/prisma/launch-hardening.js";

describe("launch hardening database scripts", () => {
  it("seeds FREE_BETA idempotently", async () => {
    const existingPlan = { id: "plan-1", tier: "FREE_BETA", name: "Free Beta" };
    const prisma = {
      plan: {
        findFirst: vi.fn(async () => existingPlan),
        create: vi.fn()
      }
    } as unknown as PrismaClient;

    const result = await seedFreeBetaPlan(prisma);

    expect(result).toEqual({ created: false, plan: existingPlan });
    expect((prisma as any).plan.create).not.toHaveBeenCalled();
  });

  it("admin bootstrap does not create a default password", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn(async () => null),
        create: vi.fn()
      },
      permission: { upsert: vi.fn() },
      role: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      rolePermission: { upsert: vi.fn() },
      userRole: { upsert: vi.fn() }
    } as unknown as PrismaClient;

    const result = await bootstrapAdmin(prisma, "admin@example.com");

    expect(result.status).toBe("USER_NOT_FOUND");
    expect((prisma as any).user.create).not.toHaveBeenCalled();
    expect(result.message).toContain("no password was created");
  });
});
