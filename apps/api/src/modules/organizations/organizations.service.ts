import { ApiError } from "../../common/errors/api-error.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput
} from "./organizations.schemas.js";

export class OrganizationsService {
  constructor(
    private readonly repository = new OrganizationsRepository(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  list(userId: string) {
    return this.repository.listForUser(userId);
  }

  async get(id: string) {
    const organization = await this.repository.findById(id);
    if (!organization) {
      throw ApiError.notFound("Organization");
    }

    return organization;
  }

  create(userId: string, input: CreateOrganizationInput) {
    return this.repository.create(userId, input);
  }

  async update(id: string, input: UpdateOrganizationInput) {
    await this.get(id);
    return this.repository.update(id, input);
  }

  async remove(id: string) {
    await this.get(id);
    await this.repository.softDelete(id);
    return { ok: true };
  }

  members(organizationId: string) {
    return this.repository.listMembers(organizationId);
  }

  async usage(organizationId: string) {
    await this.get(organizationId);
    return this.usageLimits.summary(organizationId);
  }
}
