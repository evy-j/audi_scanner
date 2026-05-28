# Production Security Review

This review covers the smart contract audit scanner platform across the public API, authentication, RBAC, BullMQ orchestration, Redis, Prisma/PostgreSQL, worker execution, Docker scanner sandboxes, realtime WebSockets, frontend token handling, report generation, and local deployment artifacts.

## Executive Summary

The platform has a solid first-pass security posture for a scanner product: scanner execution uses argument-vector process spawning instead of shell interpolation, prepared source paths are resolved under configured artifact roots, runtime scanner containers run as a non-root user, network mode defaults to `none`, root filesystems are read-only, capabilities are dropped, output sizes are capped, and Redis-backed queue orchestration includes dead-lettering and per-organization concurrency.

The highest production risks are concentrated in five areas:

1. Sandbox escape blast radius if worker containers can reach a privileged Docker daemon or host Docker socket.
2. Queue/resource abuse because scan creation is rate-limited but not quota-enforced or admission-controlled against queue depth, subscription state, analyzer cost, or organization concurrency.
3. API authorization drift because API key scopes are caller-supplied strings and subscription updates can be mutated through application APIs rather than only billing backends/webhooks.
4. SSRF and supply-chain exposure from future repository fetching or network-enabled scanner paths unless they are split into a tightly egress-controlled source acquisition service.
5. Prompt injection/data exfiltration risk from untrusted scanner findings flowing into AI report generation.

Production readiness should require hard isolation boundaries for workers, a default-deny network model, strict artifact and upload validation, stronger RBAC/scope issuance, Redis and database network isolation, and security acceptance tests that exercise escape, abuse, and authorization failure paths.

## Reviewed Surfaces

- API entrypoint and middleware: `apps/api/src/app.ts`, auth, rate limiting, validation, audit logging, and error handling.
- Auth and access control: JWT sessions, API keys, wallet login, organization membership checks, realtime authorization.
- Scan APIs and queue production: scan creation, cancellation, BullMQ producer and shared job contracts.
- Worker queue system: worker registry, retry policies, org concurrency leases, cancellation, progress events, dead-letter routing.
- Sandbox execution: Docker run argument builder, scanner policy factory, scanner Dockerfiles, seccomp profile, artifact store, source preparation.
- Persistence: Prisma schema, repositories, JSON metadata fields, indexes, query shapes.
- Realtime: WebSocket upgrade auth, Redis pub/sub, replay timelines.
- AI reports and PDF generation: prompt builder, JSON schema validation, provider call, markdown/PDF rendering.
- Local/deployment architecture docs and Compose files.

## Critical Findings

### CRITICAL: Worker-to-Docker Daemon Boundary Is the Main Escape Boundary

The worker launches scanner containers through Docker (`ContainerSandboxExecutor`) and local development uses a privileged Docker-in-Docker service on `tcp://docker:2375`. If a production worker is compromised, any access to an unauthenticated Docker daemon, host Docker socket, or broad Docker API is equivalent to host/container-cluster compromise.

Risk paths:

- Worker compromise via scanner parser bug, dependency RCE, malicious artifact, or leaked worker credentials.
- Docker daemon exposed over TCP or mounted socket.
- Worker able to create containers beyond the intended scanner policy.

Current controls:

- Docker CLI arguments are constructed as an array, not through shell interpolation.
- Scanner containers drop all capabilities, run as `10001:10001`, use read-only root filesystems, no-new-privileges, PID/memory/CPU limits, and `--network none`.

Gaps:

- The Docker daemon remains a privileged control plane.
- Sandbox policy is enforced by worker code, not by an external policy engine.
- Local Dind settings are explicitly development-only, but production architecture must prevent this pattern from leaking into production.

Mitigations:

- In production, do not mount `/var/run/docker.sock` into app or worker containers.
- Run scanner workloads in a separate worker pool backed by a dedicated sandbox runtime such as Kubernetes Jobs with gVisor/Kata/Firecracker, AWS Batch/Fargate, or an isolated VM-per-worker model.
- Enforce sandbox policy outside the worker process with admission control: allowed images by digest, denied privileges, required seccomp/AppArmor, no host mounts, no host networking, no added capabilities.
- Give workers permission to create only scanner jobs in a restricted namespace, never arbitrary containers.
- Use image digests and signed images rather than mutable `latest` tags.
- Run worker nodes on tainted/dedicated hosts with no production database or API workloads.

### HIGH: Seccomp Profile Is Denylist-Based, Not Default-Deny

`docker/security/seccomp-scanner.json` uses `SCMP_ACT_ALLOW` as the default and denies a set of dangerous syscalls. This is better than no profile, but scanner workloads process adversarial code and should use a default-deny or Docker-default-derived allowlist with narrowly approved syscall families.

Risk paths:

- Kernel attack surface stays broad.
- Future scanner dependencies may exercise unexpected syscalls that remain allowed.
- An attacker only needs one reachable kernel bug or container runtime flaw.

Mitigations:

- Replace the current denylist with an allowlist profile generated from observed scanner syscalls under test.
- Maintain one profile per scanner family if needed.
- Include regression tests that fail if seccomp is omitted or `defaultAction` changes to allow.
- Add AppArmor/SELinux profiles in production, not only optional env hooks.
- Enable rootless Docker or rootless containerd where feasible.

### HIGH: Repository Scan Target Is Accepted Before a Safe Acquisition Path Exists

The API schema accepts `REPOSITORY` with `repositoryUrl`, but local source preparation only supports `SOURCE` and `BYTECODE` artifact keys. Repository fetching is not implemented in the reviewed worker path, which is safer than implicit cloning, but accepting repository URLs creates a latent SSRF/supply-chain surface for the next implementation step.

Risk paths:

- Future `git clone`/download logic reaches internal networks or cloud metadata.
- Git URLs with alternate protocols, redirects, credentials, submodules, LFS, or hooks expand attack surface.
- Repository archives contain symlink, hardlink, nested archive, path traversal, or decompression-bomb payloads.

Mitigations:

- Add an API feature gate: reject `REPOSITORY` in production until a hardened source acquisition service exists.
- Build source acquisition as a separate service with no database credentials, no Redis write permissions except a narrow handoff, and egress allowlists for approved hosts.
- Allow only `https://` repository URLs from approved domains by default.
- Deny private IPs, loopback, link-local, multicast, `.local`, cloud metadata ranges, DNS rebinding, redirects to private ranges, and non-HTTP protocols.
- Disable Git hooks, submodule recursion by default, credential helpers, SSH URLs, and LFS unless explicitly allowed through a controlled fetcher.
- Store fetched archives by digest, scan with AV/YARA where appropriate, and unpack with a hardened archive extractor that rejects symlinks/hardlinks/device nodes and enforces file, depth, and byte limits.

### HIGH: Queue Admission Is Rate-Limited but Not Cost- or Quota-Enforced

Scan submission has a global and scan-specific rate limit, and workers enforce per-organization runtime concurrency. However, the API currently enqueues accepted scans without checking subscription status, monthly quota, queue depth, analyzer cost, organization abuse state, or global capacity.

Risk paths:

- A valid user/API key submits many expensive Mythril scans.
- Attackers choose `CRITICAL` priority to push work ahead of other tenants.
- Retries and concurrency-limit failures consume worker capacity.
- Queue backlogs grow in Redis until memory pressure affects all queues.

Mitigations:

- Add admission control before creating the scan row:
  - active subscription required unless explicitly free-tier eligible;
  - quota reservation in the same database transaction as scan creation;
  - analyzer cost budget per tier;
  - max queued/running scans per organization;
  - max global queue depth and per-analyzer depth.
- Restrict user-selected `CRITICAL` priority to enterprise/admin policy or map public inputs to capped priorities.
- Use tenant-level token buckets for scan starts, analyzer CPU-minutes, AI tokens, PDF generation, and API calls.
- Convert org concurrency misses into delayed requeue/backpressure instead of consuming retry attempts as failures.
- Add circuit breakers for analyzer queues and automatic suspension on anomalous failure/resource patterns.

### HIGH: API Key Scopes Are Caller-Supplied Strings

API key creation accepts arbitrary `scopes: string[]` and persists them directly. Any principal with `api-keys:create` can mint keys with any scope string, including future permissions that might be introduced later.

Mitigations:

- Validate requested API key scopes against the `Permission` table and an allowlist of API-key-eligible scopes.
- Enforce subset issuance: the creator can issue only scopes they currently hold and only scopes allowed for API keys.
- Add scope templates per plan/role rather than free-form scope arrays.
- Store scope grants with IDs and audit metadata rather than only strings.
- Revalidate API key scopes on use against active permission definitions so deleted/disabled permissions cannot remain effective forever.

### HIGH: Billing State Can Be Updated Through Organization APIs

The subscription routes allow `subscriptions:update` to change tier and status. That is acceptable for internal admin tooling only, but unsafe as a tenant-facing path because billing state should be driven by Stripe webhooks/admin backoffice controls with strong separation.

Mitigations:

- Make subscription mutation an internal/admin-only route with separate service credentials.
- For tenants, expose billing portal/session creation but not direct tier/status mutation.
- Enforce Stripe webhook signature verification, idempotency keys, event replay protection, and immutable event logs.
- Treat subscription status and quota counters as security controls used by scan admission.

## High-Risk Areas by Category

### Sandbox Escape Risks

Current strengths:

- No shell invocation for Docker run.
- Container name and executable are validated.
- Workspace bind mount is read-only.
- Output mount is separate and writeable.
- Root filesystem can be read-only.
- `--cap-drop ALL`, `--privileged=false`, `--pids-limit`, CPU/memory limits, tmpfs `/tmp`, no-new-privileges, and no network are supported.
- Prepared artifact keys are resolved under the artifact root.

Key risks:

- Docker daemon control plane access is a host-compromise equivalent.
- Seccomp is currently permissive by default.
- AppArmor is optional.
- Scanner images are mutable by default (`latest` in multiple paths).
- Scanner containers run complex Python/native tools over attacker-controlled Solidity projects.
- Source files can influence compiler/scanner behavior, memory, CPU, and parser code paths.
- Output directory is chmod `0777` so non-root scanners can write, but production should avoid broad permissions where possible.
- Artifact import walks regular files but should explicitly ignore symlinks and hardlinks in output trees.

Hardening recommendations:

- Enforce immutable scanner image digests.
- Run scanner jobs under a sandbox runtime stronger than plain Docker.
- Add `--security-opt apparmor=<profile>` or SELinux equivalent in production.
- Add `--oom-kill-disable=false`, explicit `--workdir`, explicit `--entrypoint`, and deny device access.
- Add `--network none` as a production invariant in policy tests and deployment validation.
- Use separate output volume with UID/GID ownership rather than mode `0777`.
- Periodically garbage-collect orphan containers by label with an external reconciler.
- Add syscall, eBPF, Falco/Tetragon, or runtime security monitoring for sandbox nodes.

### RCE Risks

Risk paths:

- Scanner tools, Solidity compilers, Semgrep, Mythril, and Slither parse untrusted input.
- Future repository fetch/build steps may run package scripts, Foundry/Hardhat tasks, or npm install hooks.
- AI provider base URL is configurable; compromised env could route secrets to an attacker.
- PDF generation is simple text-only now, which is good; future browser-based PDF rendering would be a major RCE surface.

Mitigations:

- Never run project build scripts, `npm install`, Foundry scripts, Hardhat tasks, or Solidity compiler downloads in networked production scanner containers.
- Preinstall compiler versions in signed scanner images.
- Deny dynamic plugin/ruleset loading from user-controlled paths.
- Keep PDF rendering text-only or isolate browser/PDF engines in their own sandbox.
- Use dependency scanning, SBOM generation, image scanning, and signed provenance for scanner images.
- Add crash-only isolation: any analyzer crash should fail that scan stage, not the worker process or host.

### Queue Abuse Risks

Risk paths:

- Authenticated users can enqueue expensive analyzer combinations.
- Public priority is directly mapped to BullMQ priority.
- Missing quota reservation means billing checks can race or be bypassed.
- Dead-letter queues can retain large failed job payloads.
- Redis memory can be consumed by timelines, rate-limit keys, BullMQ metadata, and failed jobs.

Mitigations:

- Admission controller at API boundary.
- Per-organization queue depth, active job, CPU-minute, and analyzer-count caps.
- Plan-aware analyzer availability.
- Queue payload size limits and schema validation on worker receipt.
- Redis `maxmemory`, eviction policy appropriate for volatile keys, persistence strategy, and alerts.
- DLQ redaction and payload truncation for untrusted fields.
- Backpressure responses with `429` or `503` before database/queue mutation.

### API Vulnerabilities

Current strengths:

- Helmet is enabled.
- Express body limits are set.
- Zod validation is used on routes.
- Request IDs and structured error responses are present.
- CORS allowlist is supported.
- Organization membership checks are centralized for most routes.

Key risks:

- `CORS_ORIGINS` empty means allow all origins; production must fail closed.
- `trust proxy` is hardcoded to `1`; deployment must ensure the edge proxy chain is correct or rate-limit/IP logging can be spoofed.
- Signup exists but email verification is not implemented in the reviewed code path; users remain pending unless seeded/admin-activated.
- No CSRF issue for bearer-only APIs if tokens are not cookies, but token storage in browser configuration/local UI remains sensitive.
- Realtime accepts access tokens in query strings, which can leak through logs, browser history, proxies, crash reports, and referrers.
- WebSocket upgrades are origin-checked but not separately rate-limited by IP/principal.
- Error messages sometimes expose internal state such as missing permissions or scanner failure messages.

Mitigations:

- Require non-empty CORS allowlist in production startup validation.
- Add production env guard that rejects development JWT/API key secrets.
- Add per-route rate limits for login, signup, wallet nonce, scan creation, report export, API key creation, and WebSocket upgrades.
- Move realtime auth to `Authorization` header where clients support it, or issue short-lived WebSocket ticket tokens through an authenticated POST.
- Add account lockout/risk scoring after repeated login failures.
- Implement email verification, password reset, MFA for admins, and session/device management.
- Add security headers at Vercel/Render edge: HSTS, CSP, frame-ancestors, referrer policy, permissions policy.

### SSRF Risks

Risk paths:

- `repositoryUrl` is accepted at the API boundary.
- Future address verification or chain metadata fetchers may call arbitrary RPC/explorer URLs.
- AI provider base URL is configurable.
- Webhook endpoints, if added, may fetch invoice or event URLs.

Mitigations:

- Centralize outbound HTTP through a safe HTTP client that validates DNS/IP after resolution and after redirects.
- Deny internal address ranges: loopback, RFC1918, link-local, multicast, carrier-grade NAT, IPv6 local ranges, and cloud metadata IPs.
- Pin allowed schemes and ports.
- Disable redirects by default or revalidate every redirect hop.
- Use egress firewall policies, not only application checks.
- For AI provider, allowlist known provider hostnames in production.

### Prisma/PostgreSQL Attack Surfaces

Current strengths:

- The reviewed API uses Prisma query builders, not raw SQL.
- Most list endpoints cap `limit` to 100.
- Multi-tenant reads usually filter by `organizationId`.

Key risks:

- Some reads load nested relations without pagination, such as scan details including all vulnerabilities and reports.
- JSON metadata fields can accumulate untrusted scanner content without size or shape budgets.
- Cursor pagination on scans uses `id < cursor` while ordering by `createdAt desc, id desc`, which can produce inconsistent paging and performance issues.
- Authorization relies on application-layer filters; no database row-level security is present.
- Audit logs are mutable through normal database credentials.

Mitigations:

- Add per-model select DTOs; never return full Prisma models by default.
- Paginate nested vulnerabilities/reports on scan detail endpoints.
- Add database-level constraints for metadata size where possible and application schema validators for JSON content.
- Use composite cursor pagination with `(createdAt, id)`.
- Add row-level security or database views for tenant-scoped reads if Supabase/Postgres access expands.
- Split DB roles: API read/write, worker write-limited, migration admin, analytics read-only.
- Make audit logs append-only with restricted DB role permissions and/or WORM export.

### Redis Vulnerabilities

Current strengths:

- TLS can be enabled.
- Keys are prefixed.
- Command timeout is configured.
- Redis is used for rate limits, queues, pub/sub, realtime state, cancellation, wallet nonces, and concurrency leases.

Key risks:

- Redis is a high-value control plane; compromise enables queue injection, cancellation spoofing, replay state tampering, wallet nonce manipulation, and rate-limit bypass.
- No ACL separation is shown between API, worker, pub/sub, and queue roles.
- Some keys such as scan state/timelines/sequences do not have explicit TTLs in all write paths.
- BullMQ payloads may contain untrusted target data and failed job payloads.

Mitigations:

- Use managed Redis with TLS, AUTH, private networking, no public IP, and ACL users per role.
- Separate Redis databases or clusters for queues, rate limits, sessions/nonces, and realtime if scale/security requires.
- Add TTLs for scan realtime state, event sequences, timelines, cancellation keys, concurrency keys, and wallet nonces.
- Use Redis memory limits and alerts for used memory, evictions, blocked clients, command latency, connected clients, and key growth.
- Monitor for unexpected commands and deny dangerous admin commands to app roles.

### Authentication Weaknesses

Current strengths:

- Argon2id is used for passwords.
- Refresh tokens are hashed with HMAC before storage.
- Wallet nonces are single-use via Redis `GETDEL`.
- JWT issuer and audience are checked.

Key risks:

- Production defaults allow development secrets unless explicitly overridden.
- Access tokens are trusted until expiry without checking session status on every request.
- JWT permissions embedded at login can become stale after role changes until access token expiry.
- API key prefix lookup is efficient, but key scopes are free-form.
- Wallet nonce JWT uses the access secret rather than a separate wallet-nonce secret.

Mitigations:

- Fail startup in production if any secret contains `development`, `change-me`, or is below 256 bits of entropy.
- Add session status/version checks for high-risk routes or include a token version in JWTs that can be invalidated.
- Use short access TTLs and rotate refresh tokens, which already exists; add reuse detection for refresh token replay.
- Use separate secrets for access, refresh, wallet nonce, webhooks, API key hashing, and encryption.
- Add MFA for organization owners, billing admins, platform admins, and API key creation.
- Add API key last-used IP/user-agent metadata and anomaly alerts.

### Docker Isolation Risks

Risk paths:

- Plain Docker shares the host kernel.
- Dind requires privileged mode in local development.
- Scanner base images include `git`, `bash`, Python, and native dependencies.
- Foundry image copies multiple powerful binaries, including `anvil` and `cast`.

Mitigations:

- Use stronger isolation for adversarial workloads.
- Build minimal per-scanner images and remove unused binaries.
- Remove `git` from runtime images unless a scanner strictly requires it.
- Use distroless/slim images only when scanners support it.
- Pin base image digests and scanner package versions.
- Scan images before promotion and block critical/high unfixed CVEs unless risk-accepted.

### File Upload and Artifact Risks

Current strengths:

- `artifactKey` is resolved under the artifact root.
- Source preparation skips symlinks during copy.
- Prepared file count and byte limits exist.
- Common heavy directories are ignored.

Key risks:

- There is no reviewed upload API yet; future upload handling is a major attack surface.
- Artifact keys are user-supplied and can point at any artifact under the tenant-shared artifact root unless ownership is checked by metadata.
- Single-file source artifacts are copied as files but scanner execution expects prepared artifacts to be directories, which can fail safely but should be explicit.
- Archive extraction policy is not yet visible.
- Retained artifacts/logs may include proprietary contract source and secrets accidentally embedded by users.

Mitigations:

- Store uploads by organization/scan-scoped server-generated keys, never raw user-provided paths.
- Require artifact ownership lookup before accepting `artifactKey`.
- Add malware scanning and content-type verification.
- Enforce max upload bytes, max extracted bytes, max files, max path length, max nesting depth, and accepted extensions.
- Reject symlinks, hardlinks, device files, FIFOs, setuid bits, absolute paths, and path traversal during extraction.
- Encrypt artifacts at rest and set retention/deletion policies per plan/compliance need.
- Never log raw source, full scanner output, API keys, tokens, or upload content.

### Prompt Injection Risks

Current strengths:

- AI prompt is JSON-structured.
- System prompt says to use only provided findings.
- AI output is schema-validated.
- Unknown finding IDs are ignored.
- AI failures fall back to deterministic reports.

Key risks:

- Findings originate from attacker-controlled source and scanner output, so titles/evidence/remediation can contain prompt-injection text.
- AI provider receives potentially proprietary source-derived findings.
- AI recommendations are merged into reports and can influence user decisions.
- Provider errors include a slice of response body in exceptions; logs must avoid leaking sensitive provider payloads.

Mitigations:

- Wrap untrusted finding fields in explicit data containers and add instruction hierarchy that labels them as untrusted evidence.
- Strip or neutralize prompt-like phrases in scanner-provided strings before AI use where feasible.
- Do not send raw source code to AI by default; send bounded normalized findings only.
- Add tenant-level AI opt-in, data processing disclosures, and provider allowlists.
- Add output policy checks for unsupported claims, external links, and code blocks before report merge.
- Log only provider status/request IDs, not prompts or completions.

## Enterprise Hardening Architecture

### Production Isolation Model

- Public frontend: Vercel, static/client app only, no secrets in browser except public API URLs.
- API: Render private service, no scanner execution permissions, private network access only to Supabase and Redis.
- Queue/Redis: private managed Redis with TLS and ACLs.
- Workers: isolated private worker pool with no inbound public traffic.
- Sandbox runtime: separate nodes/namespace/account from API, with default-deny egress and no database credentials inside scanner containers.
- Artifacts: private object storage with server-side encryption, signed URL delivery only after authorization, and per-object tenant metadata.

### Runtime Controls

- Enforce production startup guards for all secrets and security-critical env vars.
- Use immutable, signed scanner images by digest.
- Require `SCANNER_NETWORK_MODE=none` for analyzer containers.
- Keep source acquisition, analyzer execution, AI generation, and PDF rendering as separately permissioned services.
- Make every external egress path explicit and observable.
- Add a policy-as-code gate in CI and deploy for Compose/Kubernetes/Render configs.

### Detection and Response

- Alerts:
  - scanner container tries network access;
  - worker attempts to start a privileged/host-network container;
  - Redis queue depth or memory crosses thresholds;
  - repeated auth failures, API key failures, or wallet nonce failures;
  - anomalous scan failure rates per tenant;
  - scan artifacts exceed normal size distribution;
  - AI provider error spike or token usage anomaly.
- Logs:
  - structured logs with request ID, trace ID, organization ID, scan ID, queue name, worker ID;
  - redact tokens, API keys, prompts, raw source, scanner logs, password hashes, refresh hashes.
- Audit:
  - API key create/revoke;
  - role/permission changes;
  - subscription/billing changes;
  - scan start/cancel/export;
  - admin access to artifacts/reports;
  - security policy changes.

## Production Security Checklist

### Pre-Launch Blockers

- [ ] Production startup fails on development JWT/API key secrets.
- [ ] `CORS_ORIGINS` is non-empty and exact-match.
- [ ] API rate limits are backed by private Redis and include auth, scan, report export, API key, and WebSocket upgrade limits.
- [ ] Scan admission enforces subscription status, quotas, per-org queue depth, global queue depth, analyzer cost, and abuse state.
- [ ] API key scope creation is allowlisted and subset-enforced.
- [ ] Tenant-facing subscription mutation is removed or made internal/admin-only.
- [ ] `REPOSITORY` scans are disabled until safe source acquisition is implemented.
- [ ] Realtime auth no longer relies on long-lived access tokens in query strings; use short-lived WebSocket tickets.
- [ ] Workers cannot access a host Docker socket or unauthenticated Docker TCP daemon.
- [ ] Scanner workloads run on isolated worker hosts/namespace/account.
- [ ] Scanner images are digest-pinned, signed, scanned, and SBOM-generated.
- [ ] Seccomp is default-deny or Docker-default-derived allowlist.
- [ ] AppArmor/SELinux profile is enabled for scanner containers.
- [ ] Redis is TLS/private-network-only with ACL separation.
- [ ] Database uses separate least-privileged roles for API, worker, migrations, and analytics.
- [ ] Artifact ownership is checked before source preparation.
- [ ] Upload/archive extraction rejects traversal, links, device files, and oversized payloads.
- [ ] AI report generation is tenant opt-in and sends only bounded normalized findings.

### Operational Hardening

- [ ] Rotate secrets through a managed secret store.
- [ ] Enable MFA for owners, billing admins, and platform admins.
- [ ] Add refresh-token reuse detection and session revocation propagation.
- [ ] Add anomaly detection for scan bursts, high-cost analyzer use, failed login bursts, and API key abuse.
- [ ] Add DLQ review workflow with redaction.
- [ ] Add periodic cleanup for stale Redis scan state and artifact retention.
- [ ] Add container orphan cleanup by scanner labels.
- [ ] Add dependency, container image, and IaC scanning to CI.
- [ ] Add runtime security monitoring on worker nodes.
- [ ] Back up Postgres and test restore procedures.
- [ ] Encrypt artifacts and sensitive database fields where required.
- [ ] Export immutable audit logs to separate storage.

### Security Test Coverage

- [ ] Unit tests for API key scope subset enforcement.
- [ ] API tests for organization isolation on every route.
- [ ] API tests for subscription/quota denial before queue insertion.
- [ ] API tests for CORS fail-closed behavior in production mode.
- [ ] WebSocket tests for origin denial, ticket expiry, subscription auth, and slow-client termination.
- [ ] Worker tests for queue payload schema validation and retry/backpressure behavior.
- [ ] Sandbox tests asserting exact Docker run arguments for no network, no privileges, read-only root, caps dropped, seccomp, AppArmor, pids, CPU, memory, tmpfs, and digest-pinned image.
- [ ] Archive extraction tests for traversal, symlink, hardlink, device file, nested depth, and decompression bomb payloads.
- [ ] SSRF tests for private IPs, redirects, DNS rebinding, IPv6, link-local, and metadata endpoints.
- [ ] Prompt injection tests proving malicious scanner text cannot add fake findings, links, or unsupported claims.
- [ ] Load tests with abusive tenants to verify admission control and Redis memory stability.

## Recommended Remediation Order

1. Add production fail-closed env validation for secrets, CORS, scanner network mode, Docker pull policy, and Redis TLS/private URL.
2. Add scan admission control with quota reservation and per-org/global queue depth checks.
3. Replace API key free-form scopes with allowlisted subset grants.
4. Disable repository scans until hardened source acquisition exists.
5. Remove query-string realtime auth in favor of short-lived WebSocket tickets.
6. Move production scanner execution to an isolated runtime with policy enforcement outside worker code.
7. Replace seccomp denylist with allowlist and enable AppArmor/SELinux.
8. Add artifact ownership checks and hardened upload/archive pipeline.
9. Add Redis ACL separation, key TTL coverage, and memory alerts.
10. Add prompt-injection tests and AI output policy checks.

