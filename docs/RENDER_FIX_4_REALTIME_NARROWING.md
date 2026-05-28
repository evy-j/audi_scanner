# Render Fix 4 — Realtime Gateway TypeScript Narrowing

## Problem

Render API build failed at:

```text
src/realtime/scan-realtime.gateway.ts(175,25): error TS2339: Property 'error' does not exist on type '{ ok: true; message: RealtimeClientMessage; } | { ok: false; error: unknown; }'.
```

## Fix

The realtime message parse result is now handled with explicit success/failure aliases and local casts inside the branch. This avoids TypeScript boolean-union narrowing differences during Render's production build while preserving the same runtime behavior.

Updated file:

```text
apps/api/src/realtime/scan-realtime.gateway.ts
```

## Deployment settings remain unchanged

Render API service:

```text
Root Directory: blank
Build Command: npm install --include=dev && npm run build:api:render
Start Command: npm run start:api:render
```

Worker service remains optional and should stay skipped for free/low-cost deployment tests.
