# Render free-tier runtime fix

This patch makes the API runnable on a single Render Web Service without a paid Redis/worker service.

## Why this exists

The API previously defaulted to Redis-backed rate limiting. On Render, when `REDIS_URL` is not configured, every request can fail before reaching `/api/v1/health`, returning `INTERNAL_ERROR`.

## New safe smoke-mode defaults

- `RATE_LIMIT_STORE` defaults to `memory`.
- `REDIS_REQUIRED` defaults to `false`.
- A small in-process Redis compatibility store is used for basic smoke testing.

This is suitable for one free Render instance and deployment validation.

## Recommended Render env for free smoke test

```env
RATE_LIMIT_STORE=memory
REDIS_REQUIRED=false
AI_ENABLED=false
AI_PROVIDER=DISABLED
MONITORING_ENABLED=false
SIMULATION_ENABLED=false
FUZZING_ENABLED=false
BILLING_ENABLED=false
BILLING_PROVIDER=DISABLED
```

## Production note

For real multi-instance production or queue-heavy scans, configure a real Redis URL and set:

```env
REDIS_URL=redis://...
REDIS_REQUIRED=true
RATE_LIMIT_STORE=redis
```
