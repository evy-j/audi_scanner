# Phase P13 Full Source Integration Note

This source tree includes the P13 billing, subscription, entitlement, payment-webhook, usage-metering, billing UI, seed, and documentation layer integrated into the full uploaded project.

## Included

- Prisma billing models and migration: `20260525170000_p13_billing`
- Idempotent plan seed: `npm run billing:seed`
- Billing API module under `apps/api/src/modules/billing`
- Central entitlement service and usage-meter integration
- Entitlement checks before queued jobs where the existing workflow exposes quota hooks
- Billing routes mounted in `/api/v1`
- Billing UI under settings
- Docs: `docs/BILLING.md`, `docs/ENTITLEMENTS.md`, `docs/PAYMENT_WEBHOOKS.md`, `docs/PLAN_LIMITS.md`

## Real-only boundaries

- Billing is disabled by default.
- No fake checkout URL is generated.
- No invoice is marked paid without a verified provider webhook or audited override.
- No raw card data is stored.
- Provider secrets and webhook secrets must not be logged or returned.
- Manual overrides grant entitlements without claiming payment was received.

## Commands

```bash
npm install
npm run db:generate
npm run db:deploy
npm run billing:seed
npm run typecheck
npm test
npm run build
```

## Limitation

Razorpay hosted checkout is intentionally not faked in P13. Razorpay webhook verification exists; a real hosted checkout adapter belongs to P13B if needed.
