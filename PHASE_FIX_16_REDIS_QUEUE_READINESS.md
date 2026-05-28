# Fix 16 — Redis + Worker Queue Readiness Diagnostics

## Goal

Keep `/health` lightweight and always API-first, while fixing `/ready` so it never hangs on Redis. Add real-only diagnostics for Redis/BullMQ and a safe API-only fallback mode when Redis cannot be used immediately.

## What changed

### 1. `/health` stays shallow

`GET /health` still does not depend on Redis, BullMQ, AI, or worker startup. Render uptime probes can keep using it.

### 2. Readiness no longer hangs

`GET /ready` and `GET /api/v1/ready` now wrap Redis ping with `REDIS_READINESS_TIMEOUT_MS`.

Default:

```env
REDIS_READINESS_TIMEOUT_MS=2500
```

If Redis is broken, readiness returns a controlled `503` JSON response instead of timing out or crashing.

### 3. Safe Redis diagnostics endpoint

New endpoints:

```txt
GET /health/redis
GET /api/v1/health/redis
```

They show safe, redacted Redis status, including whether the configured URL is a Redis TCP/TLS URL or an Upstash REST/HTTP URL.

Important: BullMQ/ioredis cannot use Upstash REST URLs. For queues, use the Upstash Redis TLS URL:

```txt
rediss://default:<password>@<host>:6379
```

Do not paste `https://...upstash.io` REST URL into `REDIS_URL` for BullMQ.

### 4. Real-only queue behavior

If queues are disabled or Redis is misconfigured, queue operations now return `503 SERVICE_UNAVAILABLE` instead of returning fake queue IDs or fake `enqueued: true` results.

This prevents false claims like “scan queued” when BullMQ cannot actually accept jobs.

### 5. Safe fallback mode

Use this when Redis is not fixed yet but you want the API + DB live:

```env
RATE_LIMIT_STORE=memory
REDIS_REQUIRED=false
SINGLE_SERVICE_WORKER_ENABLED=false
SINGLE_SERVICE_WORKER_STRICT=false
```

Expected readiness:

```json
{
  "status": "ready",
  "mode": "api_only_queue_disabled",
  "checks": {
    "database": "ok",
    "redis": "not_configured",
    "workerQueue": "disabled",
    "storage": "ok",
    "ai": "not_configured"
  }
}
```

This is not fake success: the API is ready, but scan processing is clearly disabled.

### 6. Full queue-backed mode

Use this after Upstash Redis URL is fixed:

```env
RATE_LIMIT_STORE=memory
REDIS_REQUIRED=true
REDIS_URL=rediss://default:<password>@<host>:6379
REDIS_ENABLE_TLS=true
SINGLE_SERVICE_WORKER_ENABLED=true
SINGLE_SERVICE_WORKER_STRICT=false
REDIS_READINESS_TIMEOUT_MS=2500
```

Expected readiness:

```json
{
  "status": "ready",
  "mode": "full_queue_backed",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "workerQueue": "ok",
    "storage": "ok",
    "ai": "not_configured"
  }
}
```

## Commands

```powershell
git add .
git commit -m "fix: add redis queue readiness diagnostics"
git push

curl.exe -i https://audit-scanner-api.onrender.com/health
curl.exe -i https://audit-scanner-api.onrender.com/health/redis
curl.exe -i https://audit-scanner-api.onrender.com/ready
curl.exe -i https://audit-scanner-api.onrender.com/api/v1/health/redis
curl.exe -i https://audit-scanner-api.onrender.com/api/v1/ready
```

## Files changed

- `apps/api/src/config/environment.ts`
- `apps/api/src/infra/queues/redis.ts`
- `apps/api/src/infra/queues/scan-queue.producer.ts`
- `apps/api/src/modules/health/health.service.ts`
- `apps/api/src/modules/health/health.routes.ts`
- `apps/api/src/app.ts`
- `apps/api/src/common/middleware/rate-limit.middleware.ts`
- `.env.example`
- `apps/api/.env.example`
