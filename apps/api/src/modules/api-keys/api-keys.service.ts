import { ApiError } from "../../common/errors/api-error.js";
import { generateApiKey } from "../../common/security/api-key-hash.js";
import { ApiKeysRepository } from "./api-keys.repository.js";
import type { CreateApiKeyInput } from "./api-keys.schemas.js";
import { BillingEntitlementService, ENTITLEMENT_KEYS } from "../billing/entitlements.service.js";

export class ApiKeysService {
  constructor(
    private readonly repository = new ApiKeysRepository(),
    private readonly entitlements = new BillingEntitlementService()
  ) {}

  list(organizationId: string) {
    return this.repository.list(organizationId);
  }

  async create(
    organizationId: string,
    input: CreateApiKeyInput,
    createdById?: string | undefined
  ) {
    if (input.projectId) {
      const project = await this.repository.project(input.projectId, organizationId);
      if (!project) throw ApiError.accessDenied("Access denied");
    }
    if (input.githubRepositoryId) {
      const repository = await this.repository.githubRepository(input.githubRepositoryId, organizationId);
      if (!repository) throw ApiError.accessDenied("Access denied");
      if (input.projectId && repository.projectId && repository.projectId !== input.projectId) {
        throw ApiError.accessDenied("Access denied");
      }
    }
    const security = await this.repository.securitySettings(organizationId);
    if (input.expiresAt && security?.apiKeyMaxLifetimeDays) {
      const expiresAt = new Date(input.expiresAt);
      const maxExpiresAt = new Date(Date.now() + security.apiKeyMaxLifetimeDays * 24 * 60 * 60 * 1000);
      if (expiresAt > maxExpiresAt) {
        throw ApiError.badRequest("API key expiry exceeds organization security setting");
      }
    }
    if (typeof (this.repository as any).activeCount === "function") {
      const activeCount = await this.repository.activeCount(organizationId);
      await this.entitlements.assertMaxAllowed(organizationId, ENTITLEMENT_KEYS.apiKeysMax, activeCount, 1, {
        resourceType: "API_KEY",
        actorUserId: createdById
      });
    }
    const generated = generateApiKey();
    const record = await this.repository.create({
      ...input,
      organizationId,
      ...(createdById ? { createdById } : {}),
      keyPrefix: generated.prefix,
      keyHash: generated.hash
    });

    return {
      ...record,
      apiKey: generated.key
    };
  }

  async revoke(organizationId: string, apiKeyId: string) {
    const result = await this.repository.revoke(apiKeyId, organizationId);
    if (result.count === 0) {
      throw ApiError.notFound("API key");
    }

    return { ok: true };
  }
}
