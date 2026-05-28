# Fix 19 — Force health TS fix + GitHub deploy/heartbeat automation

## What this fixes

- Fixes the Render build failure in `apps/api/src/modules/health/health.service.ts` by removing TypeScript union-narrowing access to `code`/`reason`.
- Adds `.github/workflows/render-api-deploy.yml` to trigger Render deploy on every push to `main` using a Render deploy hook.
- Adds `.github/workflows/supabase-heartbeat.yml` to run a tiny daily SQL statement against Supabase using GitHub Actions.

## Required GitHub secrets

Add these in GitHub repo → Settings → Secrets and variables → Actions:

- `RENDER_API_DEPLOY_HOOK_URL` — Render Web Service Deploy Hook URL.
- `SUPABASE_HEARTBEAT_DATABASE_URL` — Supabase pooler/database URL. You may reuse your production pooler URL. If omitted, workflow falls back to `PRODUCTION_DATABASE_URL`.

## Verify before pushing

```powershell
cd C:\auit_scanner
Select-String -Path apps\api\src\modules\health\health.service.ts -Pattern "normalizeRedisProbe"
Select-String -Path package.json -Pattern "render-build-all"
git status
git add .
git commit -m "Fix health build and add deploy heartbeat automation"
git push origin main
git log -1 --oneline
```

Render must deploy the new commit shown by `git log -1`, not the old commit.
