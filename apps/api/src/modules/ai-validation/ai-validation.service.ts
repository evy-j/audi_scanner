import { randomBytes } from "node:crypto";
import { env } from "../../config/environment.js";
import { ApiError } from "../../common/errors/api-error.js";
import { ScanQueueProducer } from "../../infra/queues/scan-queue.producer.js";
import { AiValidationRepository } from "./ai-validation.repository.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";

export class AiValidationService {
  constructor(
    private readonly repository = new AiValidationRepository(),
    private readonly queueProducer = new ScanQueueProducer(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async scanSummary(scanId: string, organizationId: string) {
    const result = await this.repository.scanSummary(scanId, organizationId);
    if (result === null) throw ApiError.notFound("Scan");
    return {
      provider: aiProviderResponse(),
      ...result
    };
  }

  async findingValidation(findingId: string, organizationId: string) {
    const result = await this.repository.findingValidation(findingId, organizationId);
    if (result === null) throw ApiError.notFound("Finding");
    return {
      provider: aiProviderResponse(),
      ...result
    };
  }

  async enqueueScanValidation(
    scanId: string,
    organizationId: string,
    requestedByUserId?: string | undefined
  ) {
    const scan = await this.repository.scanContext(scanId, organizationId);
    if (!scan) throw ApiError.notFound("Scan");
    if (!isAiConfigured()) {
      return providerNotConfiguredResponse(scanId);
    }
    await this.usageLimits.assertAndConsume(organizationId, "AI_VALIDATIONS_PER_MONTH", {
      resourceType: "SCAN",
      resourceId: scanId
    });

    await this.queueProducer.enqueueAiValidation({
      scanId: scan.id,
      organizationId: scan.organizationId,
      requestedByUserId,
      traceId: randomBytes(16).toString("hex"),
      priority: scan.priority,
      scope: "SCAN_SUMMARY"
    });
    return { enqueued: true, queue: "ai.validate", scanId, scope: "SCAN_SUMMARY", status: "QUEUED" };
  }

  async enqueueFindingValidation(
    findingId: string,
    organizationId: string,
    requestedByUserId?: string | undefined
  ) {
    const finding = await this.repository.findingContext(findingId, organizationId);
    if (!finding) throw ApiError.notFound("Finding");
    if (!isAiConfigured()) {
      return providerNotConfiguredResponse(finding.scanId, findingId);
    }
    await this.usageLimits.assertAndConsume(organizationId, "AI_VALIDATIONS_PER_MONTH", {
      resourceType: "FINDING",
      resourceId: findingId
    });

    await this.queueProducer.enqueueAiValidation({
      scanId: finding.scan.id,
      organizationId: finding.scan.organizationId,
      requestedByUserId,
      traceId: randomBytes(16).toString("hex"),
      priority: finding.scan.priority,
      scope: "FINDING",
      findingId
    });
    return { enqueued: true, queue: "ai.validate", scanId: finding.scanId, findingId, scope: "FINDING", status: "QUEUED" };
  }
}

function isAiConfigured(): boolean {
  if (!env.AI_ENABLED || env.AI_PROVIDER === "DISABLED") return false;
  if (!env.AI_MODEL) return false;
  if (env.AI_PROVIDER === "LOCAL") return Boolean(env.AI_BASE_URL);
  return Boolean(env.AI_API_KEY);
}

function aiProviderResponse() {
  return {
    configured: isAiConfigured(),
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL ?? null,
    status: isAiConfigured() ? "CONFIGURED" : "PROVIDER_NOT_CONFIGURED"
  };
}

function providerNotConfiguredResponse(scanId: string, findingId?: string | undefined) {
  return {
    enqueued: false,
    queue: "ai.validate",
    scanId,
    ...(findingId ? { findingId } : {}),
    status: "PROVIDER_NOT_CONFIGURED",
    reason: "AI validation provider is disabled or missing required configuration"
  };
}
