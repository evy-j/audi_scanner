# Plan Limits

Seeded plans:

- `FREE_BETA`: default plan, no payment required.
- `DEVELOPER`: developer workflow limits.
- `TEAM`: shared team limits.
- `ENTERPRISE`: manual/contact-sales plan.

Run:

```text
npm run billing:seed
```

The seed is idempotent and does not overwrite existing custom plan edits. Existing plans keep their local values; missing plans, prices, and entitlement rows are created.

Enterprise limits can be unlimited with `-1`, but paid or manual entitlements still require an active subscription/trial/free beta plan or audited admin override.
