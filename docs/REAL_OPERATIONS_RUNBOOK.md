# Real Operations Runbook

This runbook layer records operational readiness without fake uptime, fake support team, or fake SOC claims.

Required records:

- production owner
- escalation path
- support hours
- incident severity matrix
- rollback instructions
- backup/restore drill evidence
- queue/worker health checks
- budget guardrails
- on-call placeholder or real rota

Public claims require evidence:

- uptime claim requires measured uptime source
- 24/7 support requires real staffing
- incident response claim requires runbook and owner

API:

```text
GET  /api/v1/security-os/trust-operations/runbooks
POST /api/v1/security-os/trust-operations/runbooks
```
