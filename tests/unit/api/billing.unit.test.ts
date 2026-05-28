import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("P13 billing provider safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reports provider not configured when billing is disabled", async () => {
    vi.doMock("../../../apps/api/src/config/environment.js", () => ({
      env: {
        BILLING_ENABLED: false,
        BILLING_PROVIDER: "DISABLED",
        BILLING_TEST_MODE: true,
        BILLING_CURRENCY: "INR"
      }
    }));

    const { billingConfigStatus } = await import("../../../apps/api/src/modules/billing/billing.config.js");
    expect(billingConfigStatus()).toMatchObject({
      configured: false,
      status: "PROVIDER_NOT_CONFIGURED",
      provider: "DISABLED"
    });
  });

  it("rejects invalid billing webhook signatures and accepts a valid Stripe signature", async () => {
    vi.doMock("../../../apps/api/src/config/environment.js", () => ({
      env: {
        BILLING_ENABLED: true,
        BILLING_PROVIDER: "STRIPE",
        BILLING_TEST_MODE: true,
        BILLING_CURRENCY: "INR",
        STRIPE_SECRET_KEY: "sk_test_redacted",
        STRIPE_WEBHOOK_SECRET: "whsec_test_secret"
      }
    }));

    const { verifyBillingWebhook } = await import("../../../apps/api/src/modules/billing/billing.provider.js");
    const raw = Buffer.from(JSON.stringify({
      id: "evt_1",
      type: "invoice.paid",
      data: { object: { id: "in_1", metadata: { organization_id: "00000000-0000-0000-0000-000000000001" } } }
    }));
    const timestamp = "1700000000";
    const valid = createHmac("sha256", "whsec_test_secret").update(`${timestamp}.${raw.toString("utf8")}`).digest("hex");

    expect(() => verifyBillingWebhook("STRIPE", raw, { "stripe-signature": `t=${timestamp},v1=bad` })).toThrow();
    expect(verifyBillingWebhook("STRIPE", raw, { "stripe-signature": `t=${timestamp},v1=${valid}` })).toMatchObject({
      provider: "STRIPE",
      providerEventId: "evt_1",
      eventType: "invoice.paid"
    });
  });
});
