# Enterprise CI/CD Pipelines

This platform uses GitHub Actions as the orchestration layer, Vercel for the frontend, Render for API and worker services, Supabase PostgreSQL for persistence, Redis for queues/realtime, and GHCR for container images.

## Pipeline Inventory

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| Enterprise CI | `.github/workflows/enterprise-ci.yml` | PRs, `main`, manual | linting, typecheck, Prisma validation, migrations against CI Postgres, tests, audit, Docker smoke builds |
| Existing Test Suite | `.github/workflows/test.yml` | PRs, `main`, manual | focused test matrix and optional load smoke |
| Docker Images | `.github/workflows/docker-images.yml` | `main`, tags, manual | builds and pushes API, worker, and scanner images to GHCR |
| Preview Deployments | `.github/workflows/preview-deployments.yml` | PR lifecycle | Vercel preview, optional Render preview hook, optional preview DB migration |
| Deploy Production | `.github/workflows/deploy-production.yml` | successful Docker image workflow on `main`, manual | Prisma production migrations, Render deploy hooks, Vercel production deploy, smoke test |
| Rollback | `.github/workflows/rollback.yml` | manual | restores frontend alias and triggers Render rollback hooks |

## Required GitHub Environments

Create these GitHub Environments and require reviewer approvals for `production`:

- `preview`
- `production`

Recommended production protection:

- required reviewers from platform/security;
- wait timer for production deploys if desired;
- deployment branch restricted to `main` and signed release tags;
- environment secrets scoped only to the workflows that need them.

## Required Secrets

Repository or organization secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RENDER_API_DEPLOY_HOOK_URL`
- `RENDER_WORKER_DEPLOY_HOOK_URL`
- `RENDER_API_ROLLBACK_HOOK_URL`
- `RENDER_WORKER_ROLLBACK_HOOK_URL`
- `PRODUCTION_DATABASE_URL`
- `PRODUCTION_DIRECT_DATABASE_URL`
- `PRODUCTION_API_BASE_URL`

Optional preview secrets:

- `RENDER_PREVIEW_DEPLOY_HOOK_URL`
- `PREVIEW_DATABASE_URL`
- `PREVIEW_DIRECT_DATABASE_URL`

Do not store runtime application secrets in workflow files. Runtime secrets such as `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `API_KEY_HASH_SECRET`, `REDIS_URL`, `AI_REPORT_API_KEY`, Stripe keys, and scanner image digests should live in Vercel, Render, Supabase, and Redis provider secret stores, with GitHub only holding deployment credentials.

## Branch Flow

1. Developer opens a PR.
2. `Enterprise CI` runs linting, typecheck, Prisma migration validation, test suites, security tests, audit, and Docker build smoke.
3. `Preview Deployments` creates a Vercel preview for same-repo PRs and can trigger a Render preview environment.
4. Required checks must pass before merge.
5. Merge to `main` runs Docker image publishing.
6. Successful image publishing triggers production deployment.
7. Production deployment runs migrations, deploys backend and workers, deploys frontend, then performs `/health` smoke checks.

## Prisma Migration Strategy

CI validates migrations against a clean PostgreSQL service using:

```bash
npm run db:generate
npx prisma validate --schema packages/database/prisma/schema.prisma
npm run db:deploy
npx prisma migrate status --schema packages/database/prisma/schema.prisma
```

Production uses forward-only migrations:

- deploy additive schema changes first;
- deploy application code that reads/writes both old and new fields;
- backfill asynchronously if needed;
- remove old columns in a later release;
- rollbacks are code/config rollbacks, not destructive database down migrations.

## Docker Build Strategy

Application images:

- `docker/api/Dockerfile`
- `docker/worker/Dockerfile`

Scanner images:

- `docker/scanners/base/Dockerfile`
- `docker/scanners/slither/Dockerfile`
- `docker/scanners/mythril/Dockerfile`
- `docker/scanners/semgrep/Dockerfile`
- `docker/scanners/foundry/Dockerfile`

Images are pushed to:

```text
ghcr.io/<owner>/<repo>/api:<sha>
ghcr.io/<owner>/<repo>/worker:<sha>
ghcr.io/<owner>/<repo>/scanner-base:<sha>
ghcr.io/<owner>/<repo>/scanner-slither:<sha>
ghcr.io/<owner>/<repo>/scanner-mythril:<sha>
ghcr.io/<owner>/<repo>/scanner-semgrep:<sha>
ghcr.io/<owner>/<repo>/scanner-foundry:<sha>
```

For enterprise hardening, promote scanner images by digest and configure production workers with digest-pinned scanner image references.

## Deployment Automation

Frontend:

- GitHub Actions runs Vercel CLI with `VERCEL_TOKEN`.
- Preview deployments are created for PRs.
- Production deploys use `vercel build --prod` and `vercel deploy --prebuilt --prod`.

Backend and workers:

- GitHub Actions triggers Render deploy hooks.
- Render services should be configured to pull the approved image tag/digest or deploy from the approved `main` commit.
- Workers should be deployed separately from the API so worker rollout can pause independently if queue failures rise.

Database:

- Prisma migrations run before backend deployment.
- Migration credentials should be distinct from application runtime credentials.

## Rollback Strategy

Frontend rollback:

- Use the `Rollback` workflow with a previous Vercel deployment URL.
- The workflow reassigns the production alias to the previous deployment.

Backend rollback:

- Configure Render rollback deploy hooks to redeploy the last known-good API and worker image/commit.
- Roll back API and worker independently when possible.

Database rollback:

- Do not run destructive down migrations in an incident.
- Use forward-fix migrations or code compatibility rollbacks.
- Every schema change should support at least one previous app version during the rollout window.

Operational rollback checklist:

- pause worker autoscaling if bad jobs are amplifying failures;
- stop new scan admission if queue health is degraded;
- roll back frontend first for UI-only regressions;
- roll back workers first for queue/sandbox regressions;
- roll back API first for request/auth regressions;
- run `/health`, queue depth, worker heartbeat, Redis, and Postgres checks after rollback.

## Secrets Management

Rules:

- GitHub Actions stores only deploy credentials and environment URLs.
- Runtime secrets stay in Vercel/Render/Supabase/Redis secret stores.
- Production secrets must be environment-scoped and reviewer-protected.
- Never expose secrets to fork PR workflows.
- Prefer OIDC to cloud providers where supported.
- Rotate deploy tokens quarterly and immediately after maintainer offboarding.
- Use separate secrets for preview and production.

## Required Status Checks

Recommended branch protection checks:

- `Lint, Typecheck, Build`
- `Prisma Migration Gate`
- `Test Suite`
- `Docker Build Smoke`
- existing test workflow jobs that remain enabled

For production deploys:

- require `Docker Images` success;
- require production environment approval;
- require migration success;
- require production smoke success.

