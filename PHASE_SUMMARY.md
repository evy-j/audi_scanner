# Render Fix 15 — Health/Ready Probe Safety

This patch fixes the post-deploy state where Render public HTTP routing works but `/health` returns `500 INTERNAL_ERROR`.

## Root cause

The global rate limiter was mounted before `/health` and `/api/v1/health`. With `RATE_LIMIT_STORE=redis`, a temporary Redis/ioredis failure could throw before the health handler ran. This made a live API look dead.

## Changes

- Bypasses rate limiting for health/readiness/version probe routes.
- Moves root `/health` and `/ready` before global rate limiting.
- Makes Redis-backed rate limiting fail-open instead of returning 500 if Redis is temporarily unavailable.
- Makes root `/ready` return a controlled `503 not_ready` JSON payload instead of generic `500`.

## Files changed

- `apps/api/src/app.ts`
- `apps/api/src/common/middleware/rate-limit.middleware.ts`

## Render settings

Build command:

```bash
npm install --include=dev && npm run build:render:all
```

Start command:

```bash
npm run start:render:all
```

Recommended env for current low-cost single-service mode:

```env
SINGLE_SERVICE_WORKER_ENABLED=true
SINGLE_SERVICE_WORKER_STRICT=false
REDIS_REQUIRED=true
RATE_LIMIT_STORE=memory
REDIS_URL=rediss://default:YOUR_UPSTASH_PASSWORD@YOUR_UPSTASH_HOST:6379
```

`RATE_LIMIT_STORE=memory` is recommended for the single Render service MVP so public HTTP health and frontend requests do not depend on Upstash rate-limit calls. Redis can still be used for the worker queue through `REDIS_REQUIRED=true` and `REDIS_URL`.

## Verify

```powershell
curl.exe -i https://audit-scanner-api.onrender.com/health
curl.exe -i https://audit-scanner-api.onrender.com/ready
curl.exe -i https://audit-scanner-api.onrender.com/api/v1/ready
```

Expected:

- `/health` should be `200 OK`.
- `/ready` can be `200 ready` or controlled `503 not_ready`, but should not be generic `500`.

## Render Fix 16 — Redis/Worker Readiness Deep Stabilization

- Added safe Redis TCP URL validation and diagnostics.
- Added degraded readiness mode for free single-service Render deployment.
- Added worker Redis preflight so Redis failures do not kill the API in non-strict single-service mode.
- Reduced worker Redis connection pressure by disabling QueueEvents by default and reusing queue connections.
- Recommended `RATE_LIMIT_STORE=memory`, `QUEUE_BACKEND=redis`, `QUEUE_READY_STRICT=false`, `SINGLE_SERVICE_WORKER_STRICT=false`, `WORKER_QUEUE_EVENTS_ENABLED=false`, and `REDIS_CONNECT_FAMILY=4`.
