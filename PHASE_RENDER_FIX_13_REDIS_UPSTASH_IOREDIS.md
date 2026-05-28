# Render Fix 13 — Upstash Redis/ioredis Connection Stability

## Problem

Render single-service mode was starting both API and Worker successfully, but Redis connections were repeatedly closing with errors such as:

- `write ECONNRESET`
- `read ECONNRESET`
- `write EPIPE`
- ioredis stack traces around `_readyCheck()` / `INFO`

This means the app could open TCP/TLS connections to Redis, but the Redis server/proxy was resetting the connection during ioredis readiness checks or repeated command setup.

## Fix

Updated API and Worker Redis client creation to use Upstash/BullMQ-safe ioredis options:

- `enableReadyCheck: false` to stop the ioredis `INFO` ready-check call.
- `maxRetriesPerRequest: null` so BullMQ Worker/Event connections can stay alive through Redis reconnects.
- TLS auto-detection from `rediss://` URLs.
- Explicit TLS `servername` for hosted Redis endpoints.
- Bounded reconnect delay and command/connect timeout.
- Keepalive enabled.

## Files changed

- `apps/api/src/infra/queues/redis.ts`
- `apps/worker/src/redis/redis-connection.ts`

## Required Render env

Use the real Upstash Redis TCP URL, not REST URL:

```env
REDIS_URL=rediss://default:YOUR_UPSTASH_PASSWORD@YOUR_UPSTASH_HOST:6379
REDIS_REQUIRED=true
RATE_LIMIT_STORE=redis
SINGLE_SERVICE_WORKER_ENABLED=true
```

Do not use:

```env
https://...
redis://...
REDIS_URL=rediss://...  # as the value field; key and value must be separate in Render UI
```

## Render commands

Build:

```bash
npm install --include=dev && npm run build:render:all
```

Start:

```bash
npm run start:render:all
```

## Verification

```powershell
curl https://audit-scanner-api.onrender.com/api/v1/ready
```

Expected:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "workerQueue": "ok"
  }
}
```

## Notes

This is still MVP single-service mode. Heavy production scanning should later move API and Worker into separate services and use a fixed/production Redis plan.
