# Render Fix 7 — Redis/Queue Free Mode

This patch fixes runtime logs like:

```text
Error: connect ECONNREFUSED 127.0.0.1:6379
```

## Cause

The API was deployed on Render without Redis, but BullMQ scan queues were still instantiated during API startup/module loading. BullMQ then attempted to connect to the default local Redis address `127.0.0.1:6379`.

## Fix

- Exports `shouldUseExternalRedis()` from `apps/api/src/infra/queues/redis.ts`.
- Makes `ScanQueueProducer` lazy/optional:
  - if Redis is not required and `RATE_LIMIT_STORE=memory`, BullMQ queues are not created.
  - queue methods return a safe disabled-mode result instead of attempting Redis.
- Prevents `ScanOutboxRelay` from starting when external Redis is disabled.

## Render free-mode env

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

## Real production mode later

To enable worker-backed scans later, add a real Redis provider and set:

```env
REDIS_REQUIRED=true
RATE_LIMIT_STORE=redis
REDIS_URL=redis://...
```

Then deploy the worker service.
