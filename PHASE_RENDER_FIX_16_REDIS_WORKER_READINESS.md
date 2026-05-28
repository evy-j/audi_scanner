# Render Fix 16 — Redis/Worker Readiness Deep Stabilization

This patch fixes the deployment state where:

- `/health` is `200 OK`
- database is `ok`
- storage is `ok`
- `/ready` and `/api/v1/ready` are `503` only because Redis/workerQueue fail

## What changed

1. `/ready` now separates API/database readiness from queue readiness.
2. When `QUEUE_READY_STRICT=false`, the API can return `ready_degraded` with HTTP 200 while still honestly showing `redis: failed` and `workerQueue: failed`.
3. Redis diagnostics are returned safely when Redis fails, without leaking passwords.
4. `REDIS_URL` is validated as a Redis TCP URL. `https://` Upstash REST URLs are detected and clearly reported as wrong for BullMQ/ioredis.
5. Worker has Redis preflight. In single-service non-strict mode, Redis failure stops only the worker process, not the API.
6. Worker QueueEvents are disabled by default to reduce Redis connection count on free/cheap Redis plans.
7. Worker queue registry now reuses one shared queue connection instead of creating many duplicate queue connections.
8. ioredis uses Upstash/Render safer settings: no ready check, bounded retry, optional IPv4 family, TLS servername, and explicit health timeout.

## Recommended Render env

```env
RATE_LIMIT_STORE=memory
REDIS_REQUIRED=true
QUEUE_BACKEND=redis
QUEUE_READY_STRICT=false
SINGLE_SERVICE_WORKER_ENABLED=true
SINGLE_SERVICE_WORKER_STRICT=false
WORKER_REDIS_PREFLIGHT=true
WORKER_QUEUE_EVENTS_ENABLED=false
REDIS_HEALTH_TIMEOUT_MS=2500
REDIS_COMMAND_TIMEOUT_MS=10000
REDIS_CONNECT_FAMILY=4
```

`REDIS_URL` must be the Redis/TLS URL, not REST URL:

```env
rediss://default:YOUR_UPSTASH_PASSWORD@YOUR_UPSTASH_HOST:6379
```

Do not paste secrets into chat.

## Expected outputs

If Redis is correct:

```json
{
  "status": "ready",
  "checks": { "database": "ok", "redis": "ok", "workerQueue": "ok" }
}
```

If Redis is still wrong/unreachable but API is healthy:

```json
{
  "status": "ready_degraded",
  "checks": { "database": "ok", "redis": "failed", "workerQueue": "failed" },
  "diagnostics": { "redis": { "message": "...", "hint": "..." } }
}
```

That is intentional real-only behavior: API is live, but queue is not falsely marked ok.
