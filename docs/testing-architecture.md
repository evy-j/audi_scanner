# Enterprise Testing Architecture

This architecture standardizes testing for the full audit-scanner platform: frontend, API, workers, Prisma, scanner sandbox, security controls, and load behavior.

## Tooling

Primary tools:

- Vitest for unit, integration, worker, scanner, Prisma, frontend component, and security tests
- Supertest for in-process API contract tests
- Playwright for browser E2E, accessibility, and visual regression tests

Optional enterprise runners:

- k6 or Artillery for load tests
- OWASP ZAP, Semgrep, Trivy, and npm audit for security gates
- Testcontainers for disposable PostgreSQL and Redis in local integration tests

The test tooling was scaffolded, but the dependency install could not complete in this sandbox. Add and lock these dev dependencies before enforcing CI gates:

```powershell
npm install --save-dev vitest @vitest/coverage-v8 @playwright/test supertest @types/supertest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event axe-core @axe-core/playwright
npx playwright install --with-deps
```

## Folder Structure

```text
tests/
  api/
    health.api.test.ts
    auth.api.test.ts
    scans.api.test.ts
    realtime.api.test.ts
  e2e/
    scan-lifecycle.e2e.spec.ts
    report-delivery.e2e.spec.ts
  fixtures/
    contracts/
      ReentrancyBank.sol
    api/
    scanner-output/
  frontend/
    metric-card.frontend.test.tsx
    scan-console.frontend.test.tsx
    report-viewer.frontend.test.tsx
  integration/
    queue-lifecycle.contract.test.ts
    redis-realtime.integration.test.ts
    scan-outbox.integration.test.ts
  load/
    api-scan-submit.k6.js
    run-load-suite.mjs
  mocks/
    ai-provider.mock.ts
    docker.mock.ts
    queue.mock.ts
    redis.mock.ts
  prisma/
    schema.prisma.test.ts
    migrations.prisma.test.ts
    repositories.prisma.test.ts
  scanner/
    scanner-artifact.contract.test.ts
    sandbox-execution.scanner.test.ts
    adapters/
      slither.adapter.test.ts
      mythril.adapter.test.ts
      semgrep.adapter.test.ts
  security/
    sandbox-policy.security.test.ts
    api-authz.security.test.ts
    rate-limit.security.test.ts
  setup/
    api-test-app.ts
    prisma-test-db.ts
    vitest.setup.ts
  unit/
    api/
    worker/
      scanner-policy.unit.test.ts
    scanner-core/
    shared/
```

## Test Strategy

### Unit Testing

Scope:

- validation schemas
- auth token helpers
- permission decisions
- queue priority mapping
- scanner policy generation
- normalization parsers
- risk scoring
- report builders
- React presentational components

Rules:

- No network, Docker, Redis, or PostgreSQL.
- Use Vitest mocks for external collaborators.
- Keep tests deterministic with fixed dates, IDs, and fixture data.
- Target 85% lines/statements and 80% branches at the package level.

Command:

```powershell
npm run test:unit
```

### Integration Testing

Scope:

- Redis lifecycle state and timeline behavior
- BullMQ queue chaining
- Prisma repository operations
- API plus real rate-limit/queue adapters
- worker processor chains with mocked scanner execution

Rules:

- Use isolated PostgreSQL and Redis instances.
- Use one schema or database per worker shard.
- Run migrations before tests; truncate data after each test file.
- Do not use production secrets or shared Redis prefixes.

Command:

```powershell
npm run test:integration
```

### API Testing

Scope:

- health endpoints
- auth signup/login/refresh/logout
- organization access control
- scan submit/list/get/cancel
- report and vulnerability APIs
- API-key auth
- realtime WebSocket authorization

Rules:

- Use Supertest against the Express app in-process for fast contract tests.
- Mock Redis only for pure API route tests.
- Use real PostgreSQL/Redis for API integration tests.
- Assert response status, body schema, security headers, and audit side effects.

Command:

```powershell
npm run test:api
```

### Worker Testing

Scope:

- orchestrator to source prepare handoff
- source preparation artifact safety
- analyzer job creation
- analyzer completion fan-in
- normalization to risk score to report handoff
- cancellation handling
- retry/dead-letter behavior
- heartbeat and org concurrency leases

Rules:

- Mock QueueRegistry for unit tests.
- Use real Redis/BullMQ for integration tests.
- Mock Docker scanner execution unless the test is explicitly marked scanner.
- Verify idempotent job IDs and retry semantics.

Command:

```powershell
npm run test:worker
```

### Scanner Testing

Scope:

- scanner command builders
- sandbox policy hardening
- artifact import limits
- stdout/stderr truncation
- scanner result envelope
- Slither/Mythril/Semgrep parser compatibility
- Docker smoke tests for scanner images

Rules:

- Unit tests use fixture outputs.
- Contract tests assert `scanner-result/v1`.
- Docker smoke tests run with `--network none`, read-only root filesystem, non-root user, pids limits, and seccomp.

Command:

```powershell
npm run test:scanner
npm run docker:local:scanners:smoke
```

### Prisma Testing

Scope:

- schema contract checks
- migration deployability
- repository behavior
- unique constraints and indexes
- transaction rollback behavior
- seed idempotency

Rules:

- Run `prisma migrate deploy` against a clean test DB.
- Run seed twice and assert idempotency.
- Test query plans for high-volume scan lists and vulnerability filters once data volumes are realistic.

Command:

```powershell
npm run test:prisma
```

### Frontend Testing

Scope:

- presentational components
- form validation and error states
- API client behavior
- realtime subscription reducer/state
- report rendering
- accessibility checks

Rules:

- Use Vitest plus jsdom for components.
- Use Testing Library queries by role, label, text, and accessible name.
- Use Playwright for workflows that need routing, browser APIs, websocket behavior, or visual checks.

Command:

```powershell
npm run test:frontend
npm run test:e2e
```

### Load Testing

Scope:

- API health and auth latency
- scan submit throughput
- queue depth under burst submissions
- worker throughput per analyzer
- Redis Pub/Sub fanout under active subscribers
- report generation latency

Rules:

- Run small smoke load in PRs.
- Run heavier load only on nightly or manually triggered workflows.
- Record p50/p95/p99 latency, error rate, queue depth, worker concurrency, Redis memory, and DB CPU.

Command:

```powershell
npm run test:load
k6 run tests/load/api-scan-submit.k6.js
```

### Security Testing

Scope:

- API authn/authz bypass attempts
- CORS and security headers
- rate limiting
- API-key prefix and hash verification
- websocket subscription isolation
- sandbox escape regression controls
- dependency and container scanning

Rules:

- Unit security tests assert invariants in code.
- Integration tests attempt cross-organization access.
- Scanner sandbox tests must fail closed if hardening flags are missing.
- CI should run npm audit, Semgrep, Trivy, and OWASP ZAP baseline scans.

Command:

```powershell
npm run test:security
```

## Mock Architecture

Mocks are layered by risk:

| Boundary | Unit mock | Integration replacement | Enterprise check |
| --- | --- | --- | --- |
| Prisma | repository fake or transaction stub | real PostgreSQL schema | migration + query plan tests |
| Redis | `InMemoryRedisMock` | real Redis with test prefix | Redis memory and latency metrics |
| BullMQ | `QueueRegistryMock` | real BullMQ queues | retry/dead-letter replay tests |
| Docker | `DockerCliMock` | local DinD daemon | hardened scanner smoke tests |
| AI provider | deterministic JSON provider | disabled or test provider | contract replay and redaction tests |
| Email/webhook | no-op dispatcher | local capture service | delivery idempotency tests |
| Browser APIs | jsdom | Playwright browsers | a11y, visual, websocket workflow tests |

Mocking rules:

- Mock at infrastructure boundaries, not domain logic.
- Use fixture scanner outputs for parser and normalization tests.
- Do not snapshot secrets, tokens, private keys, raw source uploads, or full scanner logs.
- Prefer deterministic builders over random factories.
- Every mock should have a corresponding integration test against the real dependency.

## CI Test Pipeline

Recommended gates:

1. Install and generate Prisma client.
2. Static checks: formatting, lint, typecheck.
3. Unit tests with coverage.
4. Integration tests with PostgreSQL and Redis services.
5. API tests with Supertest.
6. Worker tests with BullMQ and Redis.
7. Scanner tests and Docker smoke tests.
8. Frontend component tests.
9. Playwright E2E against the local stack.
10. Security tests and dependency/container scans.
11. Load smoke tests on main/nightly/manual triggers.

Failure policy:

- PRs block on static, unit, API, Prisma, worker, frontend, and security smoke tests.
- E2E blocks on main once stable; until then, mark as required for release branches.
- Load tests run on schedule and deployment candidate branches.
- Scanner Docker smoke tests block changes to `docker/scanners/**`, sandbox execution, and command builders.

Artifacts:

- `coverage/vitest`
- `test-results/playwright`
- `playwright-report`
- scanner smoke logs
- load test summary JSON
- security scan SARIF

## Local Test Infrastructure

Use the isolated test stack for integration, Prisma, API, and worker tests:

```powershell
Copy-Item .env.test.example .env.test
npm run test:infra:up
$env:DATABASE_URL="postgresql://audit_scanner:audit_scanner@localhost:55432/audit_scanner_test?schema=public"
$env:REDIS_URL="redis://localhost:56379/15"
npm run db:deploy
npm run test:ci
npm run test:infra:down
```

Reset all test service state:

```powershell
npm run test:infra:reset
```

The test stack intentionally binds PostgreSQL and Redis to non-default host ports so it can run beside the local development stack. Scanner Docker-in-Docker is available under the `scanner` profile:

```powershell
docker compose -f docker-compose.test.yml --profile scanner up -d
```

Load smoke tests can run against any reachable deployment:

```powershell
$env:LOAD_TEST_TARGET="http://localhost:4000"
$env:LOAD_TEST_PATH="/health"
$env:LOAD_TEST_VUS="25"
$env:LOAD_TEST_DURATION_SECONDS="60"
npm run test:load
```

## Current Adoption Notes

The scaffold includes root test scripts, `vitest.config.ts`, `playwright.config.ts`, test setup files, mocks, and representative tests. Before enabling CI as a required check, refresh the lockfile with the requested testing dependencies and fix the existing worker typecheck issues documented earlier: monorepo `rootDir`, `ioredis` typings, queue processor variance, and exact optional dead-letter data.
