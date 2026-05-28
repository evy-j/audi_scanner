# Render build troubleshooting

This patch replaces the quiet `build:render:all` chain with `scripts/render-build-all.mjs`.

Why: Render logs were stopping at `@audit-scanner/api run build` without a visible TypeScript error. The new script prints a start/completed line for every build step and emits heartbeat logs while a step is still running. If a step hangs, it fails fast instead of leaving the deploy unclear.

Default step timeout: 240 seconds.

Optional Render env overrides:

```env
RENDER_BUILD_STEP_TIMEOUT_MS=300000
RENDER_BUILD_HEARTBEAT_MS=15000
```

If the API build times out, temporarily deploy API-only to keep the service live:

Build command:
```bash
npm install --include=dev && npm run build:api:render
```

Start command:
```bash
npm run start:render:api-only
```

Env fallback:
```env
SINGLE_SERVICE_WORKER_ENABLED=false
REDIS_REQUIRED=false
RATE_LIMIT_STORE=memory
```

This fallback keeps `/health` and database-backed API live, but queue/worker remains disabled honestly.
