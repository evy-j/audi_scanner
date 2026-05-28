# Payment Webhooks

P13 updates invoices, payments, and subscriptions only from verified provider webhooks or audited admin overrides.

Webhook endpoint:

```text
POST /api/v1/billing/webhook/:provider
```

Provider values:

- `stripe`
- `razorpay`
- `manual`

Rules:

- provider webhook signatures are verified before event processing
- invalid signatures are rejected
- raw provider payloads are not persisted; only checksum and redacted metadata are stored
- provider event IDs are idempotent
- unknown events are stored as `NOT_ASSESSED`
- invoices are never marked `PAID` without a verified provider event

Stripe uses the `Stripe-Signature` header. Razorpay uses `x-razorpay-signature`.
