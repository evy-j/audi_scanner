# Staging Deployment

This guide prepares a private staging deployment. It does not add payment processing and does not make audit-certification claims.

## Local Setup

```text
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev:api
npm run dev:worker
npm run dev:web
```

## Staging Setup

1. Create Postgres and Redis instances.
2. Configure API env from `apps/api/.env.example`.
3. Configure worker env from `apps/worker/.env.example`.
4. Configure web env from `apps/web/.env.example`.
5. Run Prisma generation and migrations:

```text
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
```

6. Start API and worker.
7. Verify health checks:

```text
curl https://api.example.com/api/v1/health
curl https://api.example.com/api/v1/health/deep
curl https://api.example.com/api/v1/ready
curl https://api.example.com/api/v1/version
```

## Vercel Frontend

Set:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_REALTIME_WS_URL`
- `NEXT_PUBLIC_WEB_BASE_URL`

Do not set server secrets in Vercel frontend public variables.

## Render API

Set API secrets in Render environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `API_KEY_HASH_SECRET`
- `REPORT_SHARE_SECRET`
- `CORS_ORIGIN`
- `WEB_BASE_URL`
- `API_BASE_URL`

Start command:

```text
npm run start:api
```

## Render Worker

Set worker env to the same database, Redis, storage, and optional AI provider configuration as the API.

Start command:

```text
npm run start:worker
```

## Supabase/Postgres

Use pooled URLs only when compatible with Prisma migrations. For deployment migrations, prefer a direct migration-capable Postgres URL:

```text
npm run db:deploy
```

## Rollback

1. Disable public share links if exposure is suspected.
2. Scale worker to zero to stop new jobs.
3. Roll back API and web to the previous build.
4. Re-run `/api/v1/ready` and `/api/v1/version`.
5. Review audit logs for export/share/revoke activity.

## Do Not Expose

- `.env` files
- artifact directories
- Prisma migration credentials
- API keys
- JWT or report share secrets
- private report links that have not been explicitly shared
