import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "../../common/errors/api-error.js";
import { redactSecretLikeValues } from "../../common/logging/redaction.js";
import { env } from "../../config/environment.js";
import { providerSecretFor, webhookSecretFor, type BillingProviderName } from "./billing.config.js";

export type VerifiedBillingEvent = {
  provider: BillingProviderName;
  providerEventId: string;
  eventType: string;
  checksum: string;
  payload: any;
  metadata: Record<string, unknown>;
};

export async function createStripeCheckoutSession(input: {
  priceId: string;
  checkoutSessionId: string;
  organizationId: string;
  billingPlanId?: string | null;
  billingPriceId?: string | null;
}) {
  const secret = providerSecretFor("STRIPE");
  if (!secret || !env.BILLING_SUCCESS_URL || !env.BILLING_CANCEL_URL) {
    throw ApiError.providerNotConfigured("Billing provider not configured", { provider: "STRIPE" });
  }
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: env.BILLING_SUCCESS_URL,
    cancel_url: env.BILLING_CANCEL_URL,
    client_reference_id: input.checkoutSessionId,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    "metadata[organization_id]": input.organizationId,
    "metadata[checkout_session_id]": input.checkoutSessionId
  });
  if (input.billingPlanId) body.set("metadata[billing_plan_id]", input.billingPlanId);
  if (input.billingPriceId) body.set("metadata[billing_price_id]", input.billingPriceId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw ApiError.checkoutFailed("Checkout failed", {
      provider: "STRIPE",
      status: response.status,
      error: safeProviderError(json)
    });
  }
  return {
    providerSessionId: String(json.id),
    checkoutUrl: typeof json.url === "string" ? json.url : null,
    expiresAt: typeof json.expires_at === "number" ? new Date(json.expires_at * 1000) : null,
    metadata: safeProviderMetadata(json)
  };
}

export function verifyBillingWebhook(provider: BillingProviderName, rawBody: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedBillingEvent {
  const checksum = sha256(rawBody);
  const secret = webhookSecretFor(provider);
  if (!secret) {
    throw ApiError.providerNotConfigured("Billing provider not configured", { provider });
  }
  if (provider === "STRIPE") {
    verifyStripeSignature(rawBody, String(headers["stripe-signature"] ?? ""), secret);
  } else if (provider === "RAZORPAY") {
    verifyRazorpaySignature(rawBody, String(headers["x-razorpay-signature"] ?? ""), secret);
  } else {
    verifyGenericSignature(rawBody, String(headers["x-web3guard-billing-signature"] ?? ""), secret);
  }
  const payload = JSON.parse(rawBody.toString("utf8"));
  const providerEventId = providerEventIdFrom(provider, payload, checksum);
  const eventType = providerEventTypeFrom(provider, payload);
  return {
    provider,
    providerEventId,
    eventType,
    checksum,
    payload,
    metadata: safeProviderMetadata(payload)
  };
}

function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string) {
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw ApiError.accessDenied("Access denied");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  if (!constantTimeEqual(signature, expected)) throw ApiError.accessDenied("Access denied");
}

function verifyRazorpaySignature(rawBody: Buffer, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!signature || !constantTimeEqual(signature, expected)) throw ApiError.accessDenied("Access denied");
}

function verifyGenericSignature(rawBody: Buffer, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!signature || !constantTimeEqual(signature, expected)) throw ApiError.accessDenied("Access denied");
}

function providerEventIdFrom(provider: BillingProviderName, payload: any, checksum: string): string {
  if (provider === "STRIPE" && typeof payload.id === "string") return payload.id;
  if (provider === "RAZORPAY") {
    const entity = payload.payload?.payment?.entity ?? payload.payload?.subscription?.entity ?? payload.payload?.invoice?.entity;
    if (typeof payload.event === "string" && typeof entity?.id === "string") return `${payload.event}:${entity.id}`;
  }
  return `${provider.toLowerCase()}:${checksum}`;
}

function providerEventTypeFrom(provider: BillingProviderName, payload: any): string {
  if (provider === "STRIPE" && typeof payload.type === "string") return payload.type;
  if (provider === "RAZORPAY" && typeof payload.event === "string") return payload.event;
  return typeof payload.type === "string" ? payload.type : "unknown";
}

function constantTimeEqual(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeProviderMetadata(value: unknown) {
  return redactSecretLikeValues(JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "string" && item.length > 400) return `${item.slice(0, 120)}...[TRUNCATED]`;
    return item;
  })));
}

function safeProviderError(value: unknown) {
  return redactSecretLikeValues(value);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
