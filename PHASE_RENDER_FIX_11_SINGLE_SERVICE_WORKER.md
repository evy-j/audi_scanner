# Phase Render Fix 11 — Single-Service Worker Mode

Added a low-cost Render mode for running API + worker in one Web Service when Background Worker is paid/unavailable.

## Added

- `scripts/render-start-all.mjs`
- `npm run build:render:all`
- `npm run start:render:all`
- Worker boolean env parsing fix for string values like `false`, `0`, `off`
- `docs/RENDER_SINGLE_SERVICE_WORKER_MODE.md`

## Render commands

Build:

```bash
npm install --include=dev && npm run build:render:all
```

Start:

```bash
npm run start:render:all
```

## Required env

```env
SINGLE_SERVICE_WORKER_ENABLED=true
REDIS_URL=rediss://default:***@***.upstash.io:6379
REDIS_REQUIRED=true
RATE_LIMIT_STORE=redis
```

This is an MVP mode, not the ideal production topology. Production should run API and worker as separate services.
