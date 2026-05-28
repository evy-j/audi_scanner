# Enterprise Admin Dashboard Architecture

This dashboard is the platform control plane for internal operators, security staff, support, billing administrators, and enterprise customer administrators. It should be separate from the customer-facing audit workspace and guarded by explicit admin RBAC.

Current foundation:

- Organization, user, membership, role, permission, subscription, scan, vulnerability, report, API key, and audit log models already exist.
- API middleware writes audit logs for security-sensitive actions.
- BullMQ queue names, dead-letter queues, retry policies, worker heartbeat state, scan realtime events, and Redis lifecycle state already exist.
- Billing snapshot state exists through `Subscription`.

## Admin Personas

| Persona | Scope | Capabilities |
| --- | --- | --- |
| Platform super admin | global | emergency access, tenant controls, worker/queue controls, abuse response |
| Security operations | global/read-mostly | abuse detection, threat monitoring, scan forensics, sandbox findings |
| Support engineer | tenant-scoped | user/org support, scan status, invoice visibility, safe replays |
| Billing admin | global billing | subscriptions, invoices, quota overrides, delinquency oversight |
| Enterprise customer admin | own org | org users, billing, audit logs, scan monitoring, quota usage |

Recommended permission keys:

```text
admin:dashboard:read
admin:users:read
admin:users:update
admin:organizations:read
admin:organizations:update
admin:scans:read
admin:scans:control
admin:workers:read
admin:queues:read
admin:queues:control
admin:abuse:read
admin:abuse:update
admin:analytics:read
admin:audit-logs:read
admin:billing:read
admin:billing:update
admin:threats:read
admin:threats:update
```

Implementation note: global platform roles can use existing `Role.organizationId = null` plus `PermissionScope.ADMIN` or `GLOBAL`. Enterprise customer admins remain organization-scoped.

## Information Architecture

```text
/admin
  /overview
  /users
  /organizations
  /scans
  /workers
  /queues
  /abuse
  /analytics
  /audit-logs
  /billing
  /threats
  /settings
```

Top-level global filters:

- organization
- user
- chain
- analyzer
- severity
- scan status
- worker hostname
- queue name
- subscription tier/status
- date range
- request ID / trace ID / scan ID

All admin tables need cursor pagination, saved filters, CSV export with RBAC checks, and deep links to entity detail drawers.

## Overview

Primary cards:

- scans queued/running/completed/failed
- p95 queue wait time
- p95 scan runtime
- active workers and stale workers
- dead-letter jobs by queue
- critical vulnerabilities found in last 24h
- abuse alerts open
- billing MRR/ARR snapshot
- past-due organizations
- API request error rate

Primary charts:

- scan throughput by hour
- queue depth by queue
- worker capacity and active jobs
- vulnerabilities by severity
- API request volume and rate-limit denials
- subscription tier distribution
- sandbox failures by analyzer

## User Management

Features:

- search users by email, wallet address, user ID, organization, status
- view user profile, memberships, sessions, API keys created, roles, audit events
- disable/suspend/reactivate user
- revoke sessions
- reset MFA/passkey state when implemented
- view impersonation-safe support context without exposing secrets
- transfer organization ownership
- invite/remove organization members
- explain effective permissions

Required APIs:

```text
GET    /api/v1/admin/users
GET    /api/v1/admin/users/:userId
PATCH  /api/v1/admin/users/:userId/status
POST   /api/v1/admin/users/:userId/revoke-sessions
GET    /api/v1/admin/users/:userId/audit-logs
GET    /api/v1/admin/users/:userId/effective-permissions
```

Security:

- never display password hashes, nonce hashes, API key hashes, refresh token hashes
- all status changes require reason and audit log
- destructive actions require step-up auth for platform admins
- customer admins cannot view users outside their organization

## Scan Monitoring

Features:

- global scan list with status, priority, organization, creator, target type, analyzers, risk score, queued/start/completion times
- scan detail timeline from Redis and persisted scan/report state
- analyzer run artifacts and scanner-result metadata
- cancellation controls
- safe replay/requeue controls for failed stages
- report and PDF availability
- vulnerability summary and false-positive/accepted-risk state

Current signals:

- PostgreSQL `Scan`, `ScanTarget`, `Vulnerability`, `AuditReport`
- Redis `scan:<scanId>:state`
- Redis `scan:<scanId>:timeline`
- Redis analyzer completion keys
- BullMQ job progress and job state

Required APIs:

```text
GET  /api/v1/admin/scans
GET  /api/v1/admin/scans/:scanId
GET  /api/v1/admin/scans/:scanId/timeline
GET  /api/v1/admin/scans/:scanId/artifacts
POST /api/v1/admin/scans/:scanId/cancel
POST /api/v1/admin/scans/:scanId/requeue
POST /api/v1/admin/scans/:scanId/stages/:stage/requeue
```

Operational controls:

- cancel active scan
- retry failed stage
- move dead-letter job back to source queue
- mark scan terminal failed when unrecoverable
- quarantine suspicious scan artifacts

## Worker Monitoring

Features:

- worker inventory from heartbeat keys
- active job IDs per worker
- queues served by each worker
- hostname, pid, startedAt, beatAt
- stale heartbeat detection
- worker version/build SHA when added
- capacity and concurrency settings
- sandbox temp cleanup stats

Current source:

```text
Redis key: worker:<workerId>:heartbeat
TTL: WORKER_HEARTBEAT_TTL_MS
Payload: workerId, queues, activeJobIds, pid, hostname, startedAt, beatAt
```

Required APIs:

```text
GET /api/v1/admin/workers
GET /api/v1/admin/workers/:workerId
GET /api/v1/admin/workers/:workerId/jobs
```

Recommended additions:

- worker build/version in heartbeat
- memory/cpu self-reported gauges
- last sandbox cleanup result
- analyzer image digest versions
- per-worker completed/failed job counters

## Queue Monitoring

Features:

- per-queue waiting, active, delayed, completed, failed, stalled, prioritized counts
- queue latency and age of oldest waiting job
- dead-letter queue drilldown
- retry policy visibility
- global concurrency settings
- queue pause/resume controls for platform admins
- job search by scanId, organizationId, jobId, traceId

Queues:

```text
scan.orchestrator
source.prepare
analyzer.slither
analyzer.mythril
analyzer.semgrep
analyzer.foundry
findings.normalize
risk.score
ai.report
pdf.generate
notifications.dispatch
dead.<queue>
```

Required APIs:

```text
GET  /api/v1/admin/queues
GET  /api/v1/admin/queues/:queueName
GET  /api/v1/admin/queues/:queueName/jobs
GET  /api/v1/admin/queues/:queueName/dead-letter
POST /api/v1/admin/queues/:queueName/pause
POST /api/v1/admin/queues/:queueName/resume
POST /api/v1/admin/queues/:queueName/jobs/:jobId/retry
POST /api/v1/admin/queues/:queueName/jobs/:jobId/discard
```

Controls must be audited and restricted to `admin:queues:control`.

## Abuse Detection

Abuse signals:

- high scan failure rate by organization/API key
- repeated invalid targets
- suspicious repository URLs or oversized artifacts
- scans targeting known malicious honeypots
- high rate of auth failures
- API keys with unusual route mix or traffic spikes
- free-tier organizations rotating accounts to bypass quotas
- excessive websocket subscriptions
- repeated sandbox timeouts/output-limit failures
- scanner stdout/stderr containing exploit attempts against sandbox

Recommended models:

```prisma
enum AbuseSignalType {
  AUTH_FAILURE_SPIKE
  RATE_LIMIT_SPIKE
  QUOTA_EVASION
  SUSPICIOUS_SCAN_TARGET
  SANDBOX_TIMEOUT_SPIKE
  API_KEY_ANOMALY
  ARTIFACT_POLICY_VIOLATION
  PAYMENT_ABUSE
}

enum AbuseCaseStatus {
  OPEN
  INVESTIGATING
  MITIGATED
  DISMISSED
}

model AbuseSignal {
  id             String          @id @default(uuid()) @db.Uuid
  organizationId String?         @map("organization_id") @db.Uuid
  userId         String?         @map("user_id") @db.Uuid
  apiKeyId       String?         @map("api_key_id") @db.Uuid
  scanId         String?         @map("scan_id") @db.Uuid
  type           AbuseSignalType
  severity       VulnerabilitySeverity
  score          Decimal         @db.Decimal(5, 2)
  status         AbuseCaseStatus @default(OPEN)
  evidence       Json
  firstSeenAt    DateTime        @map("first_seen_at")
  lastSeenAt     DateTime        @map("last_seen_at")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  @@index([status, severity, lastSeenAt])
  @@index([organizationId, lastSeenAt])
  @@map("abuse_signals")
}
```

Actions:

- suspend API key
- suspend organization
- force billing review
- reduce rate limits
- quarantine scan artifacts
- require manual approval for future scans
- dismiss with reason

## Analytics

Analytics read models:

- scan throughput by organization/tier/analyzer/chain
- vulnerability severity distribution
- mean and p95 scan duration
- queue wait duration and processing duration
- AI report generation latency and failures
- API request volume and error rate
- conversion funnel from free to paid
- quota utilization by tier
- retention and churn indicators

Recommended rollup jobs:

```text
analytics.scan.hourly
analytics.queue.hourly
analytics.billing.daily
analytics.abuse.hourly
analytics.threats.daily
```

Storage strategy:

- PostgreSQL rollup tables for operational dashboards.
- Warehouse export for long-range analytics.
- Redis only for current state and short-lived operational counters.

## Audit Logs

Current `AuditLog` captures:

- organizationId
- actorUserId
- action
- resource
- resourceId
- IP address
- user agent
- requestId
- metadata
- createdAt

Dashboard features:

- immutable log table with filters
- diff view for before/after metadata when added
- export with signed URL and audit trail
- suspicious admin activity detection
- request correlation by `requestId`
- actor timeline

Recommended additions:

- `outcome`: success/failure
- `riskLevel`
- `adminReason`
- `impersonationContext`
- `before`/`after` redacted JSON
- tamper-evident hash chain for regulated deployments

Required APIs:

```text
GET /api/v1/admin/audit-logs
GET /api/v1/admin/audit-logs/:auditLogId
POST /api/v1/admin/audit-logs/export
```

## Billing Oversight

Features:

- organizations by tier/status/MRR/quota utilization
- current subscription snapshot
- Stripe customer/subscription IDs
- invoice list and payment status
- quota overrides and enterprise contract metadata
- past-due and grace-period queue
- usage ledger and reservations
- API billing by key
- billing webhook health

Required APIs:

```text
GET  /api/v1/admin/billing/organizations
GET  /api/v1/admin/billing/organizations/:organizationId
GET  /api/v1/admin/billing/organizations/:organizationId/usage
GET  /api/v1/admin/billing/organizations/:organizationId/invoices
PATCH /api/v1/admin/billing/organizations/:organizationId/entitlements
POST /api/v1/admin/billing/organizations/:organizationId/reconcile
GET  /api/v1/admin/billing/webhooks
POST /api/v1/admin/billing/webhooks/:eventId/replay
```

Controls:

- quota override requires `admin:billing:update`, reason, expiry date
- enterprise overrides must be separate from Stripe-derived snapshot
- webhook replay must be idempotent and audited

## Threat Monitoring

Threat sources:

- scanner findings across customer scans
- known malicious contract indicators
- common vulnerability patterns by chain
- analyzer failures indicating evasive code
- repository/source upload policy violations
- API abuse and credential stuffing signals
- sandbox-denied syscalls when surfaced by runtime logs

Threat dashboard views:

- critical vulnerability trends
- top exploited patterns
- high-risk organizations by aggregate severity
- suspicious scan targets
- analyzer coverage gaps
- threat intelligence watchlist matches
- emergent vulnerability campaigns

Recommended models:

```prisma
model ThreatIndicator {
  id          String   @id @default(uuid()) @db.Uuid
  type        String   @db.VarChar(80)
  value       String   @db.Text
  severity    VulnerabilitySeverity
  source      String   @db.VarChar(120)
  description String?  @db.Text
  metadata    Json?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([type, active])
  @@map("threat_indicators")
}
```

Automations:

- flag scans matching active threat indicators
- generate platform-wide advisory drafts
- notify affected organizations
- trigger rescans when new high-confidence rules are added
- correlate vulnerabilities by fingerprint and source chain

## Admin API Architecture

Implement a separate admin router:

```text
apps/api/src/modules/admin/
  admin.routes.ts
  admin-auth.middleware.ts
  users/
  organizations/
  scans/
  workers/
  queues/
  abuse/
  analytics/
  audit-logs/
  billing/
  threats/
```

Route mount:

```text
/api/v1/admin/*
```

API principles:

- every endpoint requires admin auth and admin permission
- customer org admins use `/organizations/:organizationId/admin/*` or filtered admin routes with enforced org scope
- list endpoints use cursor pagination and bounded filters
- operational mutation endpoints require reason string
- all admin mutations write audit logs
- dangerous actions use idempotency keys

## Frontend Architecture

Recommended layout:

```text
apps/web/src/app/admin/
  layout.tsx
  page.tsx
  users/page.tsx
  organizations/page.tsx
  scans/page.tsx
  workers/page.tsx
  queues/page.tsx
  abuse/page.tsx
  analytics/page.tsx
  audit-logs/page.tsx
  billing/page.tsx
  threats/page.tsx

apps/web/src/components/admin/
  admin-shell.tsx
  admin-filter-bar.tsx
  admin-data-table.tsx
  entity-drawer.tsx
  metric-strip.tsx
  queue-depth-chart.tsx
  worker-health-table.tsx
  abuse-case-board.tsx
  audit-log-viewer.tsx
```

UI principles:

- dense operational layout
- no marketing-style hero pages
- fast search and filter controls
- table-first views with side drawers
- clear severity/status badges
- streaming updates for scan, queue, and worker views
- destructive actions in confirmation dialogs with reason capture

## Realtime Architecture

Use existing scan realtime system for scan-level events. Add admin-only realtime channels:

```text
admin.queue.metrics
admin.worker.heartbeat
admin.abuse.alerts
admin.billing.alerts
admin.threat.alerts
```

Push model:

- Redis Pub/Sub for near-real-time operational events.
- Periodic polling fallback for dashboards.
- Snapshot on connect, then event stream.
- Admin subscriptions require `admin:*:read` permissions.

## Data Freshness

| View | Freshness | Source |
| --- | --- | --- |
| scan detail timeline | realtime | Redis timeline + DB |
| worker health | 5-15 seconds | Redis heartbeat keys |
| queue depth | 5 seconds | BullMQ queue counts |
| audit logs | immediate | PostgreSQL |
| abuse signals | 1-5 minutes | detector jobs + DB |
| analytics | hourly/daily | rollup tables |
| billing | webhook/reconcile | Stripe snapshot + DB |
| threats | hourly/daily | indicators + scan findings |

## Security Controls

- Admin routes disabled unless admin feature flag is enabled in production.
- Admin roles separate from customer org roles.
- Step-up auth for destructive actions.
- IP allowlist or identity-provider group mapping for platform admins.
- All admin reads and writes are audit logged.
- Sensitive fields are redacted at repository/serializer layer.
- Export jobs require expiring signed URLs.
- Admin impersonation, if added, must be read-only by default and visibly bannered.
- Queue controls and worker controls must require reason and idempotency key.
- Rate limit admin APIs separately from public APIs.

## Observability

Metrics:

```text
admin_api_requests_total
admin_api_errors_total
admin_action_mutations_total
admin_exports_total
queue_depth_by_queue
queue_oldest_job_age_seconds
dead_letter_jobs_total
worker_heartbeat_stale_total
abuse_signals_open_total
threat_indicators_matched_total
billing_past_due_orgs_total
audit_log_write_failures_total
```

Alerts:

- stale worker heartbeat
- queue oldest waiting job above threshold
- dead-letter spike
- scan failure spike
- abuse critical signal opened
- Stripe webhook drift
- audit log write failures
- admin action from unusual IP or geography

## Implementation Order

1. Add platform admin permissions and seed global admin role.
2. Add admin route module and admin auth middleware.
3. Add read-only admin overview, scans, workers, queues, audit logs.
4. Add safe queue and scan controls with audit reasons.
5. Add billing oversight read models after SaaS billing tables land.
6. Add abuse signal detector jobs and abuse dashboard.
7. Add analytics rollup tables and dashboards.
8. Add threat indicator model and threat monitoring views.
9. Add admin realtime channels.
10. Add export jobs with signed URLs and audit trail.

## Test Plan

Unit tests:

- admin permission checks
- query filter validation
- serializers redact sensitive fields
- status/severity mapping

Integration tests:

- admin endpoints enforce global/admin scope
- customer org admin cannot read other organizations
- queue controls mutate BullMQ state and audit logs
- worker heartbeat reader handles stale/malformed keys
- billing override requires reason and expiry

E2E tests:

- platform admin views overview
- support filters scans and opens timeline drawer
- security operator triages abuse signal
- billing admin reviews past-due organization
- queue operator retries a dead-letter job with reason

Security tests:

- no admin routes accessible to normal org member
- sensitive fields never appear in JSON responses
- exports require admin permission and signed URL
- destructive admin actions require reason
- audit log is written for every mutation
