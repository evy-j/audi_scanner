import type { BillingProvider } from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { redactSecretLikeValues } from "../../common/logging/redaction.js";
import { env } from "../../config/environment.js";
import { prisma } from "../../infra/prisma/prisma.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import { billingConfigStatus, type BillingProviderName } from "./billing.config.js";
import { createStripeCheckoutSession, verifyBillingWebhook } from "./billing.provider.js";
import { BillingEntitlementService } from "./entitlements.service.js";

const db = prisma as any;

export type BillingActor = {
  actorUserId?: string | undefined;
  apiKeyId?: string | undefined;
};

export class BillingService {
  constructor(
    private readonly usage = new UsageLimitService(),
    private readonly entitlements = new BillingEntitlementService()
  ) {}

  status() {
    return billingConfigStatus();
  }

  listPlans() {
    return db.billingPlan.findMany({
      where: { active: true, deletedAt: null },
      include: {
        prices: { where: { active: true, deletedAt: null }, orderBy: { unitAmountMinor: "asc" } },
        entitlements: { where: { deletedAt: null }, orderBy: { key: "asc" } }
      },
      orderBy: { monthlyPriceMinor: "asc" }
    });
  }

  async subscription(organizationId: string) {
    const [subscription, overrides, customer] = await Promise.all([
      db.subscription.findFirst({
        where: { organizationId, deletedAt: null },
        include: { plan: true, items: true },
        orderBy: { createdAt: "desc" }
      }),
      db.billingAdminOverride.findMany({
        where: { organizationId, revokedAt: null },
        orderBy: { createdAt: "desc" }
      }),
      db.billingCustomer.findUnique({ where: { organizationId } })
    ]);
    const usage = await this.usage.summary(organizationId);
    return {
      billing: this.status(),
      subscription: subscription ?? {
        organizationId,
        status: "FREE_BETA",
        provider: "internal-free-beta",
        plan: usage.plan
      },
      customer,
      manualOverrides: overrides,
      usage
    };
  }

  async usageSummary(organizationId: string) {
    const [legacy, meters, events] = await Promise.all([
      this.usage.summary(organizationId),
      db.usageMeter.findMany({ where: { organizationId }, orderBy: { periodStart: "desc" }, take: 50 }),
      db.usageMeterEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 50 })
    ]);
    return { ...legacy, usageMeters: meters, recentEvents: events };
  }

  async invoices(organizationId: string) {
    return db.invoice.findMany({
      where: { organizationId, deletedAt: null },
      include: { lineItems: true, payments: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async payments(organizationId: string) {
    return db.payment.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
  }

  async checkout(organizationId: string, actor: BillingActor, input: { planId?: string; priceId?: string }) {
    const config = this.status();
    const plan = input.planId
      ? await db.billingPlan.findFirst({ where: { id: input.planId, deletedAt: null, active: true } })
      : await db.billingPlan.findFirst({ where: { slug: "developer", active: true, deletedAt: null } });
    if (!plan) throw ApiError.notFound("Billing plan");
    const price = input.priceId
      ? await db.billingPrice.findFirst({ where: { id: input.priceId, billingPlanId: plan.id, active: true, deletedAt: null } })
      : await db.billingPrice.findFirst({ where: { billingPlanId: plan.id, active: true, deletedAt: null }, orderBy: { unitAmountMinor: "asc" } });

    const session = await db.checkoutSession.create({
      data: {
        organizationId,
        billingPlanId: plan.id,
        billingPriceId: price?.id ?? null,
        provider: config.provider,
        status: config.configured && config.checkoutConfigured ? "CREATED" : "PROVIDER_NOT_CONFIGURED",
        currency: price?.currency ?? plan.currency ?? env.BILLING_CURRENCY,
        amountMinor: price?.unitAmountMinor ?? plan.monthlyPriceMinor,
        successUrl: redactUrl(env.BILLING_SUCCESS_URL),
        cancelUrl: redactUrl(env.BILLING_CANCEL_URL),
        createdByUserId: actor.actorUserId ?? null,
        metadata: {
          noFakeCheckout: true,
          providerConfigured: config.configured,
          checkoutConfigured: config.checkoutConfigured
        }
      }
    });

    if (!config.configured || !config.checkoutConfigured || config.provider === "DISABLED" || config.provider === "MANUAL") {
      await this.audit(organizationId, actor, "checkout_created", "CHECKOUT_SESSION", session.id, {
        status: "PROVIDER_NOT_CONFIGURED",
        provider: config.provider
      });
      return {
        status: "PROVIDER_NOT_CONFIGURED",
        checkoutSession: session,
        message: "Billing provider not configured"
      };
    }

    if (config.provider === "RAZORPAY") {
      await db.checkoutSession.update({
        where: { id: session.id },
        data: { status: "PROVIDER_NOT_CONFIGURED", metadata: { provider: "RAZORPAY", hostedCheckoutUrlAvailable: false } }
      });
      await this.audit(organizationId, actor, "checkout_created", "CHECKOUT_SESSION", session.id, {
        status: "PROVIDER_NOT_CONFIGURED",
        provider: "RAZORPAY",
        reason: "Hosted checkout URL adapter is not active"
      });
      return {
        status: "PROVIDER_NOT_CONFIGURED",
        checkoutSession: { ...session, status: "PROVIDER_NOT_CONFIGURED" },
        message: "Razorpay hosted checkout is not configured; no fake payment URL was generated"
      };
    }

    if (config.provider === "STRIPE") {
      if (!price?.providerPriceId) {
        await db.checkoutSession.update({ where: { id: session.id }, data: { status: "PROVIDER_NOT_CONFIGURED" } });
        return {
          status: "PROVIDER_NOT_CONFIGURED",
          checkoutSession: { ...session, status: "PROVIDER_NOT_CONFIGURED" },
          message: "Stripe price ID is not configured for this plan"
        };
      }
      const stripe = await createStripeCheckoutSession({
        priceId: price.providerPriceId,
        checkoutSessionId: session.id,
        organizationId,
        billingPlanId: plan.id,
        billingPriceId: price.id
      });
      const updated = await db.checkoutSession.update({
        where: { id: session.id },
        data: {
          providerSessionId: stripe.providerSessionId,
          checkoutUrl: stripe.checkoutUrl,
          expiresAt: stripe.expiresAt,
          metadata: stripe.metadata
        }
      });
      await this.audit(organizationId, actor, "checkout_created", "CHECKOUT_SESSION", session.id, {
        status: updated.status,
        provider: "STRIPE"
      });
      return { status: updated.status, checkoutSession: updated, checkoutUrl: updated.checkoutUrl };
    }

    return { status: "PROVIDER_NOT_CONFIGURED", checkoutSession: session };
  }

  async cancel(organizationId: string, actor: BillingActor) {
    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "INCOMPLETE"] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!subscription) {
      return { status: "NOT_ASSESSED", message: "No active paid subscription was found" };
    }
    if (!["manual", "manual-enterprise", "internal-free-beta"].includes(subscription.provider)) {
      await this.audit(organizationId, actor, "cancellation_requested", "SUBSCRIPTION", subscription.id, {
        status: "PROVIDER_NOT_CONFIGURED",
        provider: subscription.provider
      });
      return { status: "PROVIDER_NOT_CONFIGURED", message: "Provider cancellation adapter is not configured" };
    }
    const updated = await db.subscription.update({ where: { id: subscription.id }, data: { status: "CANCELED" } });
    await this.audit(organizationId, actor, "subscription_changed", "SUBSCRIPTION", subscription.id, {
      before: subscription.status,
      after: "CANCELED"
    });
    return { status: updated.status, subscription: updated };
  }

  async createAdminOverride(
    organizationId: string,
    actor: BillingActor,
    input: { entitlementKey?: string; limit?: number; reason: string; expiresAt?: string; permanentConfirmed?: boolean }
  ) {
    if (!input.reason.trim()) throw ApiError.badRequest("Reason is required for manual billing override");
    if (!input.expiresAt && !input.permanentConfirmed) {
      throw ApiError.badRequest("expiresAt is required unless permanentConfirmed is true");
    }
    const override = await db.billingAdminOverride.create({
      data: {
        organizationId,
        entitlementKey: input.entitlementKey ?? null,
        limit: input.limit ?? null,
        reason: input.reason,
        permanentConfirmed: input.permanentConfirmed === true,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdByUserId: actor.actorUserId ?? null,
        metadata: { noPaymentClaim: true }
      }
    });
    await this.audit(organizationId, actor, "admin_override_created", "BILLING_ADMIN_OVERRIDE", override.id, {
      entitlementKey: override.entitlementKey,
      expiresAt: override.expiresAt?.toISOString() ?? null,
      noPaymentClaim: true
    });
    return override;
  }

  async revokeAdminOverride(organizationId: string, overrideId: string, actor: BillingActor) {
    const override = await db.billingAdminOverride.findFirst({ where: { id: overrideId, organizationId, revokedAt: null } });
    if (!override) throw ApiError.accessDenied("Access denied");
    const updated = await db.billingAdminOverride.update({
      where: { id: override.id },
      data: { revokedAt: new Date(), revokedByUserId: actor.actorUserId ?? null }
    });
    await this.audit(organizationId, actor, "admin_override_revoked", "BILLING_ADMIN_OVERRIDE", override.id, {});
    return updated;
  }

  async handleWebhook(provider: BillingProviderName, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    const verified = verifyBillingWebhook(provider, rawBody, headers);
    const existing = await db.paymentProviderEvent.findUnique({
      where: { provider_providerEventId: { provider: verified.provider, providerEventId: verified.providerEventId } }
    });
    if (existing) {
      return { status: "DUPLICATE", event: existing };
    }

    const organizationId = organizationIdFromPayload(verified.payload);
    const event = await db.paymentProviderEvent.create({
      data: {
        organizationId,
        provider: verified.provider,
        providerEventId: verified.providerEventId,
        eventType: verified.eventType,
        status: "RECEIVED",
        verified: true,
        rawPayloadChecksum: verified.checksum,
        payloadMetadata: verified.metadata
      }
    });
    await this.auditIfOrg(organizationId, undefined, "webhook_received", "PAYMENT_PROVIDER_EVENT", event.id, {
      provider: verified.provider,
      eventType: verified.eventType
    });

    const processed = await this.processVerifiedEvent(event, verified);
    return { status: processed.status, event: processed };
  }

  private async processVerifiedEvent(event: any, verified: ReturnType<typeof verifyBillingWebhook>) {
    if (!event.organizationId) {
      return db.paymentProviderEvent.update({
        where: { id: event.id },
        data: { status: "NOT_ASSESSED", processedAt: new Date() }
      });
    }
    const type = verified.eventType;
    if (verified.provider === "STRIPE") {
      await this.processStripeEvent(event.organizationId, event, verified.payload);
    } else if (verified.provider === "RAZORPAY") {
      await this.processRazorpayEvent(event.organizationId, event, verified.payload);
    }
    return db.paymentProviderEvent.update({
      where: { id: event.id },
      data: { status: mappedEventStatus(type), processedAt: new Date() }
    });
  }

  private async processStripeEvent(organizationId: string, event: any, payload: any) {
    const object = payload.data?.object ?? {};
    if (payload.type === "checkout.session.completed") {
      const checkoutId = object.metadata?.checkout_session_id;
      const checkout = checkoutId ? await db.checkoutSession.findFirst({ where: { id: checkoutId, organizationId } }) : null;
      const legacyPlan = checkout?.billingPlanId ? await this.legacyPlanForBillingPlan(organizationId, checkout.billingPlanId) : null;
      const customer = await this.upsertCustomer(organizationId, "STRIPE", object.customer);
      const providerSubscriptionId = String(object.subscription ?? checkout?.id);
      const existingSubscription = await db.subscription.findFirst({
        where: { organizationId, provider: "STRIPE", providerSubscriptionId }
      });
      const subscriptionData = {
          status: "ACTIVE",
          planId: legacyPlan?.id ?? null,
          providerCustomerId: customer?.providerCustomerId ?? null
        };
      const subscription = existingSubscription
        ? await db.subscription.update({ where: { id: existingSubscription.id }, data: subscriptionData })
        : await db.subscription.create({
          data: {
          organizationId,
          planId: legacyPlan?.id ?? null,
          tier: tierForPlan(legacyPlan?.tier),
          status: "ACTIVE",
          provider: "STRIPE",
          providerCustomerId: customer?.providerCustomerId ?? null,
          providerSubscriptionId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          scanQuotaMonthly: legacyPlan?.scansPerMonth ?? env.FREE_BETA_SCANS_PER_MONTH,
          metadata: { checkoutSessionId: checkout?.id ?? null }
          }
        });
      if (checkout) {
        await db.checkoutSession.update({
          where: { id: checkout.id },
          data: { status: "COMPLETED", completedAt: new Date(), subscriptionId: subscription.id, billingCustomerId: customer?.id ?? null }
        });
      }
      await this.auditIfOrg(organizationId, undefined, "checkout_completed", "CHECKOUT_SESSION", checkout?.id ?? event.id, { provider: "STRIPE" });
      await this.auditIfOrg(organizationId, undefined, "subscription_changed", "SUBSCRIPTION", subscription.id, { status: "ACTIVE" });
      return;
    }
    if (payload.type === "invoice.paid") {
      await this.upsertInvoiceAndPayment(organizationId, "STRIPE", event.id, object, "PAID", "CAPTURED");
      return;
    }
    if (payload.type === "invoice.payment_failed") {
      await this.upsertInvoiceAndPayment(organizationId, "STRIPE", event.id, object, "FAILED", "FAILED");
      return;
    }
    if (payload.type === "customer.subscription.deleted") {
      await db.subscription.updateMany({
        where: { organizationId, provider: "STRIPE", providerSubscriptionId: String(object.id) },
        data: { status: "CANCELED" }
      });
      await this.auditIfOrg(organizationId, undefined, "subscription_changed", "SUBSCRIPTION", String(object.id), { status: "CANCELED" });
    }
  }

  private async processRazorpayEvent(organizationId: string, event: any, payload: any) {
    const entity = payload.payload?.payment?.entity ?? payload.payload?.invoice?.entity ?? payload.payload?.subscription?.entity ?? {};
    if (payload.event === "payment.captured") {
      await this.upsertPayment(organizationId, "RAZORPAY", event.id, entity, "CAPTURED");
      return;
    }
    if (payload.event === "payment.failed") {
      await this.upsertPayment(organizationId, "RAZORPAY", event.id, entity, "FAILED");
      return;
    }
    if (payload.event === "subscription.activated") {
      const providerSubscriptionId = String(entity.id);
      const existingSubscription = await db.subscription.findFirst({
        where: { organizationId, provider: "RAZORPAY", providerSubscriptionId }
      });
      if (existingSubscription) {
        await db.subscription.update({ where: { id: existingSubscription.id }, data: { status: "ACTIVE" } });
      } else {
        await db.subscription.create({
          data: {
          organizationId,
          provider: "RAZORPAY",
          providerSubscriptionId,
          status: "ACTIVE",
          tier: "CUSTOM",
          scanQuotaMonthly: env.FREE_BETA_SCANS_PER_MONTH,
          metadata: { providerEventId: event.id }
          }
        });
      }
      return;
    }
    if (payload.event === "subscription.cancelled" || payload.event === "subscription.completed") {
      await db.subscription.updateMany({
        where: { organizationId, provider: "RAZORPAY", providerSubscriptionId: String(entity.id) },
        data: { status: payload.event === "subscription.completed" ? "EXPIRED" : "CANCELED" }
      });
    }
  }

  private async legacyPlanForBillingPlan(organizationId: string, billingPlanId: string) {
    const billingPlan = await db.billingPlan.findUnique({ where: { id: billingPlanId }, include: { entitlements: true } });
    if (!billingPlan) return null;
    const limits = Object.fromEntries((billingPlan.entitlements ?? []).map((item: any) => [item.key, item.limit]));
    const existing = await db.plan.findFirst({ where: { organizationId, tier: billingPlan.tier, active: true } });
    const data = {
        name: billingPlan.name,
        scansPerMonth: positiveLimit(limits["scans.monthly"], env.FREE_BETA_SCANS_PER_MONTH),
        aiValidationsPerMonth: positiveLimit(limits["ai_validations.monthly"], env.FREE_BETA_AI_VALIDATIONS_PER_MONTH),
        remediationRunsPerMonth: positiveLimit(limits["remediation.monthly"], env.FREE_BETA_REMEDIATION_RUNS_PER_MONTH),
        reportExportsPerMonth: positiveLimit(limits["reports.monthly"], env.FREE_BETA_REPORT_EXPORTS_PER_MONTH),
        monitoredProjects: positiveLimit(limits["monitored_projects.max"], env.FREE_BETA_MONITORED_PROJECTS),
        metadata: { billingPlanId: billingPlan.id }
      };
    if (existing) {
      return db.plan.update({ where: { id: existing.id }, data });
    }
    return db.plan.create({
      data: {
        organizationId,
        tier: billingPlan.tier,
        ...data,
        active: true,
      }
    });
  }

  private async upsertCustomer(organizationId: string, provider: BillingProvider, providerCustomerId: unknown) {
    if (!providerCustomerId) return null;
    return db.billingCustomer.upsert({
      where: { organizationId },
      update: { provider, providerCustomerId: String(providerCustomerId) },
      create: { organizationId, provider, providerCustomerId: String(providerCustomerId) }
    });
  }

  private async upsertInvoiceAndPayment(organizationId: string, provider: BillingProvider, eventId: string, object: any, invoiceStatus: string, paymentStatus: string) {
    const invoice = await db.invoice.upsert({
      where: { provider_providerInvoiceId: { provider, providerInvoiceId: String(object.id) } },
      update: {
        status: invoiceStatus,
        amountPaidMinor: Number(object.amount_paid ?? 0),
        paidAt: invoiceStatus === "PAID" ? new Date() : null,
        hostedInvoiceUrl: object.hosted_invoice_url ?? null,
        receiptUrl: object.invoice_pdf ?? null
      },
      create: {
        organizationId,
        provider,
        providerInvoiceId: String(object.id),
        status: invoiceStatus,
        currency: String(object.currency ?? env.BILLING_CURRENCY).toUpperCase(),
        subtotalMinor: Number(object.subtotal ?? 0),
        totalMinor: Number(object.total ?? 0),
        amountPaidMinor: Number(object.amount_paid ?? 0),
        paidAt: invoiceStatus === "PAID" ? new Date() : null,
        hostedInvoiceUrl: object.hosted_invoice_url ?? null,
        receiptUrl: object.invoice_pdf ?? null,
        metadata: safeJson(object.metadata ?? {})
      }
    });
    await this.upsertPayment(organizationId, provider, eventId, {
      id: object.payment_intent ?? `${object.id}:payment`,
      amount: object.amount_paid ?? object.total ?? 0,
      currency: object.currency,
      invoiceId: invoice.id
    }, paymentStatus, invoice.id);
  }

  private async upsertPayment(organizationId: string, provider: BillingProvider, eventId: string, object: any, status: string, invoiceId?: string) {
    const providerPaymentId = String(object.id ?? object.payment_id ?? `${eventId}:payment`);
    const payment = await db.payment.upsert({
      where: { provider_providerPaymentId: { provider, providerPaymentId } },
      update: {
        status,
        paidAt: status === "CAPTURED" ? new Date() : null,
        failedAt: status === "FAILED" ? new Date() : null,
        paymentProviderEventId: eventId
      },
      create: {
        organizationId,
        invoiceId: invoiceId ?? object.invoiceId ?? null,
        paymentProviderEventId: eventId,
        provider,
        providerPaymentId,
        status,
        amountMinor: Number(object.amount ?? object.amount_paid ?? 0),
        currency: String(object.currency ?? env.BILLING_CURRENCY).toUpperCase(),
        paidAt: status === "CAPTURED" ? new Date() : null,
        failedAt: status === "FAILED" ? new Date() : null,
        metadata: safeJson(object)
      }
    });
    await this.auditIfOrg(organizationId, undefined, status === "CAPTURED" ? "payment_captured" : "payment_failed", "PAYMENT", payment.id, { provider });
  }

  private audit(organizationId: string, actor: BillingActor, action: string, resourceType: string, resourceId: string, metadata: unknown) {
    return db.billingAuditEvent.create({
      data: {
        organizationId,
        actorUserId: actor.actorUserId ?? null,
        apiKeyId: actor.apiKeyId ?? null,
        action,
        resourceType,
        resourceId,
        metadata: safeJson(metadata)
      }
    });
  }

  private auditIfOrg(organizationId: string | null | undefined, actor: BillingActor | undefined, action: string, resourceType: string, resourceId: string, metadata: unknown) {
    if (!organizationId) return Promise.resolve();
    return this.audit(organizationId, actor ?? {}, action, resourceType, resourceId, metadata).catch(() => undefined);
  }
}

function organizationIdFromPayload(payload: any): string | null {
  const object = payload.data?.object ?? payload.payload?.payment?.entity ?? payload.payload?.invoice?.entity ?? payload.payload?.subscription?.entity ?? payload;
  return object.metadata?.organization_id ?? object.notes?.organization_id ?? null;
}

function mappedEventStatus(eventType: string): string {
  if (/checkout\.session\.completed|payment\.captured|invoice\.paid|subscription\.activated/u.test(eventType)) return "PROCESSED";
  if (/payment_failed|payment\.failed|cancelled|deleted|expired/u.test(eventType)) return "PROCESSED";
  return "NOT_ASSESSED";
}

function tierForPlan(tier?: string | null): "FREE" | "PRO" | "TEAM" | "ENTERPRISE" | "CUSTOM" {
  if (tier === "TEAM") return "TEAM";
  if (tier === "ENTERPRISE") return "ENTERPRISE";
  if (tier === "DEVELOPER") return "PRO";
  if (tier === "FREE_BETA") return "FREE";
  return "CUSTOM";
}

function positiveLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 1_000_000_000;
  return Math.max(0, parsed);
}

function redactUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[REDACTED_URL]";
  }
}

function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(redactSecretLikeValues(value)));
}
