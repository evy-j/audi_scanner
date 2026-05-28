import { ApiError } from "../../common/errors/api-error.js";
import { SubscriptionsRepository } from "./subscriptions.repository.js";
import type { UpdateSubscriptionInput } from "./subscriptions.schemas.js";

export class SubscriptionsService {
  constructor(private readonly repository = new SubscriptionsRepository()) {}

  list(organizationId: string) {
    return this.repository.list(organizationId);
  }

  async current(organizationId: string) {
    const subscription = await this.repository.current(organizationId);
    if (!subscription) {
      throw ApiError.notFound("Subscription");
    }

    return subscription;
  }

  async updateCurrent(organizationId: string, input: UpdateSubscriptionInput) {
    const result = await this.repository.updateCurrent(organizationId, input);
    if (result.count === 0) {
      throw ApiError.notFound("Subscription");
    }

    return this.current(organizationId);
  }
}
