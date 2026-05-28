# Billing

P13 adds provider-ready SaaS billing without fake payment state.

Billing is disabled by default:

```text
BILLING_ENABLED=false
BILLING_PROVIDER=DISABLED
BILLING_CURRENCY=INR
BILLING_TEST_MODE=true
```

Supported provider modes:

- `DISABLED`: no checkout is created and no paid entitlement is granted.
- `STRIPE`: checkout can be created only when `STRIPE_SECRET_KEY`, webhook secret, success URL, cancel URL, and a real provider price ID are configured.
- `RAZORPAY`: webhook verification is supported, but hosted checkout remains unavailable unless a real adapter is configured.
- `MANUAL`: admin overrides can grant entitlements without claiming payment was received.

No raw card data is stored. Provider secrets and webhook secrets must never be logged or returned by APIs.

Use:

```text
npm run billing:seed
```

to seed the idempotent `FREE_BETA`, `DEVELOPER`, `TEAM`, and `ENTERPRISE` catalog.
