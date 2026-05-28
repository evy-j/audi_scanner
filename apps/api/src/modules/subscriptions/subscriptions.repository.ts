import { prisma } from "../../infra/prisma/prisma.js";
import type { UpdateSubscriptionInput } from "./subscriptions.schemas.js";

export class SubscriptionsRepository {
  list(organizationId: string) {
    return prisma.subscription.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
  }

  current(organizationId: string) {
    return prisma.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  updateCurrent(organizationId: string, input: UpdateSubscriptionInput) {
    return prisma.subscription.updateMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"] }
      },
      data: {
        ...(input.tier ? { tier: input.tier } : {}),
        ...(input.status ? { status: input.status } : {})
      }
    });
  }
}
