# Local Development Integration

This setup runs the full platform locally with hot reload:

- Next.js frontend on `http://localhost:3000`
- Express API on `http://localhost:4000`
- scan workers
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- a local Docker-in-Docker daemon used only by workers for sandboxed scanner containers

## First Run

```powershell
npm install
npm run dev:local
```

The compose stack builds the shared Node dev image, waits for PostgreSQL and Redis, runs Prisma migrations, seeds development data, then starts API, worker, and web services.

Default seeded login:

```text
Email: dev@audit-scanner.local
Password: Development123!
Organization slug: development-labs
```

Useful commands:

```powershell
npm run dev:local:detached
npm run dev:local:logs
npm run dev:local:ps
npm run dev:local:down
npm run dev:local:reset
```

`dev:local:reset` removes compose volumes, including PostgreSQL, Redis, Docker image cache, and installed container `node_modules`.

## Environment Flow

`docker-compose.local.yml` has safe defaults, so no env file is required for first boot.

For host-side commands and local overrides:

```powershell
Copy-Item .env.local.example .env.local
```

Docker Compose reads `.env`, not `.env.local`, by default. If you want Compose interpolation overrides such as custom ports:

```powershell
Copy-Item .env.local.example .env
npm run dev:local
```

Container services use internal DNS names:

```text
DATABASE_URL=postgresql://audit_scanner:audit_scanner@postgres:5432/audit_scanner?schema=public
REDIS_URL=redis://redis:6379
DOCKER_HOST=tcp://docker:2375
```

Host tools use localhost:

```text
DATABASE_URL=postgresql://audit_scanner:audit_scanner@localhost:5432/audit_scanner?schema=public
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

If you override `DEV_SEED_PASSWORD`, also set `DEV_SEED_PASSWORD_HASH` to an Argon2id hash for that password.

## Service Dependencies

Startup order:

```text
postgres healthy
redis healthy
docker daemon healthy
migrate completes: prisma generate -> prisma migrate deploy -> seed
api starts after migrate + redis
worker starts after migrate + redis + docker
web starts after api health passes
```

The worker joins two networks:

- `app`: PostgreSQL and Redis
- `scanner-daemon`: private Docker daemon access for the worker

The Docker daemon is intentionally not published to the host. It is privileged because Docker-in-Docker requires it, and it must stay local-only. The daemon network allows egress so scanner images can be built and pulled during development. Scanner containers launched by the worker still run with no network, dropped privileges, read-only root filesystems, seccomp, pids limits, CPU and memory limits, tmpfs limits, and no-new-privileges.

## Prisma

The repo now includes an initial migration:

```text
packages/database/prisma/migrations/20260522000000_init/migration.sql
```

Create a new migration while the stack is running:

```powershell
$env:DATABASE_URL="postgresql://audit_scanner:audit_scanner@localhost:5432/audit_scanner?schema=public"
npm run db:migrate:dev -- --name your_migration_name
npm run db:generate
npm run db:seed:dev
```

Apply checked-in migrations in containers:

```powershell
npm run db:deploy
```

Open Prisma Studio from the host:

```powershell
$env:DATABASE_URL="postgresql://audit_scanner:audit_scanner@localhost:5432/audit_scanner?schema=public"
npm run db:studio
```

## Local Scan Execution

Build scanner images inside the local Docker daemon after the stack is up:

```powershell
npm run docker:local:scanners:build
npm run docker:local:scanners:smoke
```

Queue the included Solidity fixture scan:

```powershell
npm run scan:local:source
```

The helper script copies `examples/local-scan` into `.artifacts/source-fixtures/local-scan`, logs in as the seeded user, finds the seeded organization, and posts a `SOURCE` scan using the `semgrep` analyzer by default.

Override the fixture or analyzers:

```powershell
$env:LOCAL_SCAN_SOURCE_DIR="path\to\your\project"
$env:LOCAL_SCAN_ARTIFACT_KEY="source-fixtures/my-project"
$env:LOCAL_SCAN_ANALYZERS="semgrep,slither"
npm run scan:local:source
```

Track execution:

```powershell
npm run dev:local:logs -- worker
Invoke-RestMethod http://localhost:4000/api/v1/scans?organizationId=<org-id> -Headers @{ Authorization = "Bearer <access-token>" }
```

## Hot Reload

All Node services bind mount the repo into `/workspace` and keep `node_modules` in a named Docker volume. Changes to these paths hot reload automatically:

```text
apps/web
apps/api
apps/worker
packages/*
```

If dependencies change, rebuild the dev image:

```powershell
npm run dev:local:down
npm run dev:local
```

## Debugging

Tail one service:

```powershell
npm run dev:local:logs -- api
npm run dev:local:logs -- worker
npm run dev:local:logs -- web
```

Shell into services:

```powershell
docker compose -f docker-compose.local.yml exec api sh
docker compose -f docker-compose.local.yml exec worker sh
docker compose -f docker-compose.local.yml exec postgres psql -U audit_scanner -d audit_scanner
docker compose -f docker-compose.local.yml exec redis redis-cli
docker compose -f docker-compose.local.yml exec worker docker ps
```

Run with Node inspector ports:

```powershell
npm run dev:local:debug
```

Inspector endpoints:

```text
API: chrome://inspect -> localhost:9229
Worker: chrome://inspect -> localhost:9230
Web/Next.js: chrome://inspect -> localhost:9231
```

Health checks:

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/api/v1/health
docker compose -f docker-compose.local.yml ps
```

Common fixes:

- Scanner image missing: run `npm run docker:local:scanners:build`.
- Prisma client out of date: run `docker compose -f docker-compose.local.yml run --rm migrate`.
- Port conflict: set `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, or `REDIS_PORT` in `.env`.
- Stale database or Redis state: run `npm run dev:local:reset`.
