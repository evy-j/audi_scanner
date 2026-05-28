# Production Deployment Architecture

## Target Topology

```text
Users
  -> Vercel Edge/CDN
  -> Next.js frontend (apps/web)
  -> Render API web service (apps/api)
      -> Supabase Postgres through pooled application connection
      -> Render Key Value / Valkey through private internal URL
      -> OpenTelemetry exporter / collector
  -> Render worker services (apps/worker)
      -> Render Key Value / Valkey queues
      -> Supabase Postgres through pooled application connection
      -> Docker scanner runtime on isolated worker tier
      -> durable artifact storage
```

The frontend should be stateless and deployed on Vercel. The API and workers should run as separate Render services. Supabase is the system of record. Redis-compatible queueing should use Render Key Value in the same Render region as the API and workers, with internal authentication enabled. Scanner artifacts must not rely on Render's ephemeral filesystem; production needs object storage for prepared sources, raw analyzer outputs, normalized findings, and reports.

## Services

| Component | Platform | Runtime | Scaling model |
| --- | --- | --- | --- |
| `audit-scanner-web` | Vercel | Next.js from `apps/web` | Vercel-managed CDN and serverless scaling |
| `audit-scanner-api` | Render web service | Node.js or Docker from `apps/api` | min 2 instances, autoscale by CPU/memory and p95 latency |
| `audit-scanner-worker-light` | Render background worker | Node.js or Docker from `apps/worker` | queue workers for orchestration, normalization, reports, notifications |
| `audit-scanner-worker-scanner` | Render background worker, isolated plan | Docker-enabled scanner worker | separate pool for analyzer queues; scale from queue depth and CPU |
| `audit-scanner-redis` | Render Key Value | Valkey/Redis-compatible | paid instance with persistence; private network URL |
| `audit-scanner-postgres` | Supabase | Postgres | pooled app connections plus direct migration connection |
| `audit-scanner-otel` | managed vendor or collector | OTLP/HTTP and OTLP/gRPC | one collector per environment or direct vendor ingest |

## Network Boundaries

- Vercel only calls the public Render API URL.
- Render API exposes HTTPS and WebSocket endpoints publicly.
- Render workers have no public ingress.
- API and workers connect to Render Key Value via the internal URL in the same region.
- API and workers connect to Supabase using SSL-required pooled URLs.
- Scanner containers default to `SCANNER_NETWORK_MODE=none`. Any network-enabled source preparation must run in a separate, egress-restricted service.

## Environment Variables

Use three environments: `preview`, `staging`, and `production`. Never share secrets across them.

### Vercel

Set these in Vercel Project Settings by environment:

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.audit-scanner.example.com/api/v1` |
| `NEXT_PUBLIC_REALTIME_WS_URL` | `wss://api.audit-scanner.example.com/api/v1/realtime` |
| `NEXT_PUBLIC_ENVIRONMENT` | `production` |
| `NEXT_PUBLIC_OTEL_ENABLED` | `true` |

Enable Vercel system environment variables for deployment metadata. Use Vercel Preview deployments for pull requests and Deployment Checks before production promotion.

### Render Environment Groups

Create one scoped Render environment group per environment:

`audit-scanner-production-shared`

```text
NODE_ENV=production
LOG_LEVEL=info
API_BASE_PATH=/api/v1
CORS_ORIGINS=https://app.audit-scanner.example.com
REALTIME_WS_PATH=/api/v1/realtime
REDIS_URL=<Render internal rediss:// URL with auth>
REDIS_ENABLE_TLS=true
REDIS_KEY_PREFIX=audit-scanner:prod
DATABASE_URL=<Supabase pooled app connection string>
DIRECT_DATABASE_URL=<Supabase direct connection string for migrations only>
JWT_ACCESS_SECRET=<generated 256-bit secret>
JWT_REFRESH_SECRET=<generated 256-bit secret>
API_KEY_HASH_SECRET=<generated 256-bit secret>
OTEL_SERVICE_NAMESPACE=audit-scanner
OTEL_EXPORTER_OTLP_ENDPOINT=<collector or vendor endpoint>
OTEL_EXPORTER_OTLP_HEADERS=<vendor auth header>
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.10
```

API service-only variables:

```text
PORT=10000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=300
AUTH_RATE_LIMIT_MAX_REQUESTS=20
SCAN_RATE_LIMIT_MAX_REQUESTS=30
```

Worker service-only variables:

```text
SCANNER_EXECUTION_MODE=container
SCANNER_DOCKER_BINARY=docker
SCANNER_ARTIFACT_ROOT=<durable object-store prefix or mounted artifact adapter>
SCANNER_TEMP_ROOT=/tmp/audit-scanner
SCANNER_NETWORK_MODE=none
SCANNER_IPC_MODE=none
SCANNER_DOCKER_PULL_POLICY=never
SCANNER_READ_ONLY_ROOT_FILESYSTEM=true
SCANNER_NO_NEW_PRIVILEGES=true
SCANNER_SECCOMP_PROFILE=/etc/scanner/seccomp-scanner.json
SCANNER_DISABLE_SWAP=true
SCANNER_TMPFS_NOEXEC=true
SCANNER_MAX_OUTPUT_ARTIFACTS=64
SCANNER_MAX_OUTPUT_ARTIFACT_BYTES=104857600
```

Do not put secret values in `render.yaml`, GitHub Actions logs, Vercel build logs, or `.env.example`. Use placeholders in IaC and populate secrets in platform secret stores.

## CI/CD

### Pull Request

1. Install with `npm ci`.
2. Run workspace typecheck, lint, unit tests, and scanner sandbox typecheck.
3. Run Prisma schema validation and generate client.
4. Build API, worker, shared packages, scanner-core, and web.
5. Run security checks: dependency audit, secret scan, Dockerfile lint, container image scan.
6. Deploy Vercel Preview.
7. Optionally deploy Render Preview services for API and workers with isolated Redis/Supabase branches.

### Main Branch

1. CI must pass before deploy.
2. Vercel creates production deployment and waits for Deployment Checks.
3. Render services use "After CI Checks Pass" or deploy hooks from GitHub Actions.
4. Run database migrations as a single pre-deploy or one-off migration job using `DIRECT_DATABASE_URL`.
5. Deploy API before workers for backward-compatible queue payload changes.
6. Deploy workers by queue tier: light workers first, scanner workers last.
7. Run smoke checks:
   - `GET /health`
   - `GET /api/v1/health`
   - WebSocket connect/auth/subscribe test
   - Redis enqueue/dequeue canary
   - Supabase read/write canary
8. Promote Vercel production only after API and smoke checks pass.

### Rollback

- Vercel: instant rollback to prior production deployment.
- Render: rollback to previous successful deploy or deploy a specific commit.
- Database: prefer forward-fix migrations. Destructive migrations require an explicit rollback plan and backup verification.
- Workers: keep queue payloads backward-compatible for at least one deploy window.

## Health Checks

API:

| Endpoint | Purpose |
| --- | --- |
| `/health` | process liveness; no dependencies |
| `/api/v1/health` | route liveness |
| `/ready` | dependency readiness: Supabase, Redis, queue connection, build metadata |

Workers:

- Expose a lightweight private HTTP readiness server, or write heartbeat state to Redis and monitor it externally.
- Readiness should fail when Redis is unavailable, queue registration fails, Docker is unavailable on scanner workers, or migrations are incompatible.

Render:

- Configure HTTP health check path `/health` for API.
- Use private service TCP health checks only for services that expose private ports.
- Alert on repeated restarts, failed deploys, and health check flapping.

## Autoscaling

API:

- Minimum 2 instances across deploys.
- Autoscale on CPU, memory, request rate, p95/p99 latency, and WebSocket connection count.
- Cap max instances to protect Supabase and Redis connection budgets.

Workers:

- Split worker pools by queue class:
  - orchestration/source prep
  - scanner/analyzer
  - normalization/risk
  - AI/PDF/reporting
  - notifications
- Scale scanner workers from queue depth, oldest job age, CPU, and memory.
- Keep Mythril on its own pool because it has the highest CPU/memory/time variance.
- Configure BullMQ global concurrency below actual infrastructure capacity.
- Use per-tenant concurrency and per-tier quotas so one organization cannot saturate all workers.

Postgres:

- Use Supabase pooled connections for API and workers.
- Use direct connections only for migrations, admin tasks, and logical backups.
- Size pool to leave headroom for Supabase internal services and operational access.

Redis:

- Use a paid Render Key Value instance with persistence.
- Monitor memory, evictions, CPU, connection count, and command latency.
- Set explicit TTLs on realtime state, timelines, cancellation records, stage coordination keys, and idempotency keys.

## Observability

### Structured Logging

All services log JSON to stdout with these fields:

```json
{
  "level": "info",
  "time": "2026-05-22T00:00:00.000Z",
  "service": "audit-scanner-api",
  "environment": "production",
  "version": "git-sha",
  "requestId": "req-id",
  "traceId": "otel-trace-id",
  "spanId": "otel-span-id",
  "organizationId": "uuid",
  "scanId": "uuid",
  "queueName": "analyzer.slither",
  "message": "scan queued"
}
```

Do not log API keys, JWTs, refresh tokens, raw source code, analyzer full stdout, AI prompts containing proprietary code, or database URLs. Redact `authorization`, `x-api-key`, cookies, and query tokens.

### OpenTelemetry

Instrument:

- Express HTTP requests
- WebSocket connect, auth, subscribe, send failures
- Prisma queries with slow-query attributes
- Redis commands and BullMQ jobs
- Worker stage spans with `scanId`, `organizationId`, `queueName`, `jobId`
- Docker scanner execution spans with image digest, analyzer, duration, exit code, timeout status
- AI provider calls with model, timeout, retry count, token counts where available

Resource attributes:

```text
service.namespace=audit-scanner
service.name=audit-scanner-api | audit-scanner-worker | audit-scanner-web
service.version=<git sha>
deployment.environment=production
cloud.provider=render | vercel | supabase
```

Export options:

- Vercel Trace Drains to an OTLP/HTTP endpoint.
- Render Metrics Stream to an OpenTelemetry-compatible backend.
- Application traces directly to the same collector/vendor using OTLP.
- Render Log Streams to the logging backend over TLS syslog, or platform-native integration.

### Metrics and Alerts

Golden signals:

- API request rate, error rate, p95/p99 latency
- WebSocket active connections, subscribe failures, slow-client disconnects
- Queue depth, oldest job age, retry count, DLQ count by queue
- Worker active jobs, stalled jobs, lock renewal failures, cancellation latency
- Scanner duration, timeout rate, output-limit failures, image version
- Supabase CPU, connection count, pool saturation, slow queries, deadlocks
- Redis memory, evictions, command latency, connected clients
- Vercel Web Vitals and frontend error rate

Page on:

- API 5xx burn rate
- queue oldest job age over SLO
- DLQ growth
- Redis evictions
- Supabase pool exhaustion
- scanner timeout spike
- worker heartbeat missing
- production deploy failure

## Security Hardening

### Frontend on Vercel

- Enforce HTTPS and HSTS.
- Use strict CSP with nonce/hash support.
- Enable deployment protection for previews.
- Restrict production deploys with branch protection and required checks.
- Do not expose secrets through `NEXT_PUBLIC_*`.
- Use secure, same-site cookies if browser auth moves to cookies.

### Render API

- Set `NODE_ENV=production`; fail boot if production secrets are defaults.
- Strict CORS allowlist; never allow empty production CORS.
- No access tokens in URLs for WebSocket auth.
- Validate API key scopes against an allowlist and creator permissions.
- Rate-limit by IP, user, API key, organization, and route class.
- Add request size limits per endpoint, not only globally.
- Use helmet with production CSP and cross-origin policies.
- Verify session state for high-risk routes or use short access-token TTL plus revocation cache.

### Workers and Sandbox

- Separate scanner workers from API workers.
- Run scanner workers on isolated instances with no inbound public traffic.
- Use rootless Docker or a stronger isolation layer such as gVisor, Kata, or Firecracker for untrusted code.
- Use signed, pinned scanner image digests.
- Use default-deny seccomp, no capabilities, no privileged containers, read-only root FS, tmpfs `/tmp`, no network.
- Keep durable artifacts outside the container host filesystem.
- Apply source archive size, file count, symlink, path traversal, and decompression ratio limits before scanning.

### Supabase

- Enforce SSL.
- Use least-privilege database roles:
  - `app_api`
  - `app_worker`
  - `migration_admin`
  - `readonly_observability`
- Enable point-in-time recovery where plan allows.
- Schedule restore drills.
- Add query timeouts and statement timeouts.
- Avoid service-role keys in frontend and API unless absolutely necessary.

### Redis / Render Key Value

- Use same-region internal URL.
- Enable internal authentication.
- Disable external access unless needed for controlled operations.
- Use TLS where supported.
- Prefix keys by environment.
- Separate production and staging Redis instances.

## Deployment Weaknesses To Fix Before Production

- Current local artifact store must be replaced with durable object storage.
- Full worker `typecheck` currently fails; CI should not deploy until fixed.
- Source preparation is not implemented.
- Prisma scan completion should be persisted in Postgres.
- API key scopes are not constrained.
- Realtime accepts tokens in query strings.
- Seccomp profile is denylist/default-allow.
- Scanner images are not pinned by digest.

## References

- Vercel environment variables: https://vercel.com/docs/projects/environment-variables
- Vercel environments: https://vercel.com/docs/deployments/production-env
- Vercel Deployment Checks: https://vercel.com/docs/deployment-checks
- Vercel Trace Drains: https://vercel.com/docs/drains/reference/traces
- Vercel Log Drains: https://vercel.com/docs/drains/reference/logs
- Render deploys: https://render.com/docs/deploys
- Render environment variables and secrets: https://render.com/docs/configure-environment-variables
- Render health checks: https://render.com/docs/health-checks
- Render scaling: https://render.com/docs/scaling
- Render metrics streams: https://render.com/docs/metrics-streams
- Render log streams: https://render.com/docs/log-streams
- Render Key Value: https://render.com/docs/key-value
- Supabase connection management: https://supabase.com/docs/guides/database/connection-management
- Supabase backups: https://supabase.com/docs/guides/platform/backups
