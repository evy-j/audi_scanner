# Render Fix 12 — Worker Build TypeScript Fix

This patch fixes the remaining TypeScript errors that appeared after enabling single-service worker mode on Render.

## Fixed files

- `apps/worker/src/services/artifacts/durable-artifact-store.ts`
- `apps/worker/src/services/report-generation/ai/prompt-orchestrator.ts`

## Fixes

1. **S3/R2 durable artifact upload body typing**
   - Render worker build used DOM `BodyInit` typings and rejected Node `Buffer` even though Node fetch accepts it at runtime.
   - Added a narrow `Buffer -> BodyInit` cast only at the fetch boundary.

2. **AI report enrichment output typing**
   - Zod runtime validation already requires `findingId`, but strict workspace typing inferred parsed findings too loosely.
   - Added a safe cast after successful schema validation.

## Deployment commands

Render Web Service:

```bash
npm install --include=dev && npm run build:render:all
```

Start:

```bash
npm run start:render:all
```

## Expected result

The worker build should pass and the single-service Render process should start API + worker together.
