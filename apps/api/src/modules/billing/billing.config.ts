import { env } from "../../config/environment.js";

export type BillingProviderName = "DISABLED" | "RAZORPAY" | "STRIPE" | "MANUAL";

export function billingConfigStatus() {
  const provider = env.BILLING_PROVIDER as BillingProviderName;
  const enabled = env.BILLING_ENABLED === true;
  const providerConfigured = enabled && providerConfiguredFor(provider);
  return {
    enabled,
    provider,
    configured: providerConfigured,
    status: providerConfigured ? "CONFIGURED" : "PROVIDER_NOT_CONFIGURED",
    testMode: env.BILLING_TEST_MODE,
    currency: env.BILLING_CURRENCY,
    checkoutConfigured: checkoutConfiguredFor(provider),
    webhookConfigured: webhookSecretFor(provider) !== undefined,
    publishableKey: provider === "STRIPE" ? env.STRIPE_PUBLISHABLE_KEY ?? null : null,
    message: providerConfigured ? "Billing provider configured" : "Billing provider not configured"
  };
}

export function webhookSecretFor(provider: BillingProviderName): string | undefined {
  if (provider === "STRIPE") return env.STRIPE_WEBHOOK_SECRET ?? env.BILLING_WEBHOOK_SECRET;
  if (provider === "RAZORPAY") return env.RAZORPAY_WEBHOOK_SECRET ?? env.BILLING_WEBHOOK_SECRET;
  return env.BILLING_WEBHOOK_SECRET;
}

export function providerSecretFor(provider: BillingProviderName): string | undefined {
  if (provider === "STRIPE") return env.STRIPE_SECRET_KEY;
  if (provider === "RAZORPAY") return env.RAZORPAY_KEY_SECRET;
  return undefined;
}

export function checkoutConfiguredFor(provider: BillingProviderName): boolean {
  if (!env.BILLING_ENABLED) return false;
  if (provider === "STRIPE") {
    return Boolean(env.STRIPE_SECRET_KEY && env.BILLING_SUCCESS_URL && env.BILLING_CANCEL_URL);
  }
  if (provider === "RAZORPAY") {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }
  return false;
}

function providerConfiguredFor(provider: BillingProviderName): boolean {
  if (!env.BILLING_ENABLED || provider === "DISABLED") return false;
  if (provider === "MANUAL") return true;
  if (provider === "STRIPE") return Boolean(env.STRIPE_SECRET_KEY && webhookSecretFor(provider));
  if (provider === "RAZORPAY") return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && webhookSecretFor(provider));
  return false;
}
