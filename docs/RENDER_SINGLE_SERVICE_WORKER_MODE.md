# Render Single-Service Worker Mode

Use this when Render Background Worker requires a paid instance.

## What it does

Runs API and worker inside the same Render Web Service:

- API keeps the HTTP port open.
- Worker consumes BullMQ jobs using Redis.
- No separate Render Background Worker service is required.

This is an MVP/low-cost mode. Production should use separate API and worker services.

## Required Render API environment

```env
DATABASE_URL=YOUR_WORKING_SUPABASE_POOLER_URL
REDIS_URL=rediss://default:YOUR_UPSTASH_PASSWORD@YOUR_UPSTASH_HOST:6379
REDIS_REQUIRED=true
RATE_LIMIT_STORE=redis
SINGLE_SERVICE_WORKER_ENABLED=true

AI_ENABLED=false
AI_PROVIDER=DISABLED
MONITORING_ENABLED=false
SIMULATION_ENABLED=false
FUZZING_ENABLED=false
BILLING_ENABLED=false
BILLING_PROVIDER=DISABLED
STORAGE_DRIVER=local
LOCAL_ARTIFACT_DIR=.artifacts
```

If using Upstash `rediss://...`, `REDIS_ENABLE_TLS` is usually not required. If Redis connection fails due TLS, set:

```env
REDIS_ENABLE_TLS=true
```

## Render commands

Build command:

```bash
npm install --include=dev && npm run build:render:all
```

Start command:

```bash
npm run start:render:all
```

## Health checks

```powershell
curl https://YOUR_RENDER_API.onrender.com/api/v1/health
curl https://YOUR_RENDER_API.onrender.com/api/v1/ready
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

## Limits

- API and worker share the same CPU/RAM.
- Heavy scans can slow API responses.
- Render free instances can sleep.
- Local artifact storage is not durable across redeploys.
- Real analyzer Docker execution may not work on Render Web Service; if Docker is unavailable, scanner jobs must report tool/provider not installed rather than fake results.
