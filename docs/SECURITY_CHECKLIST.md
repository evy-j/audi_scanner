# Security Checklist

Use this checklist before private staging and again before public beta.

## Configuration

- `NODE_ENV` is `staging` or `production`.
- `DATABASE_URL` and `REDIS_URL` are set in the host secret manager.
- JWT, API key, and report-share secrets are 32+ random characters.
- AI remains disabled unless provider keys are intentionally configured.
- `STORAGE_DRIVER` matches the deployment storage backend.
- No wildcard CORS origin is configured.

## API

- `/api/v1/health`, `/api/v1/health/deep`, `/api/v1/ready`, and `/api/v1/version` return safe fields only.
- Security headers are present.
- Sensitive API responses use `Cache-Control: no-store`.
- Rate limits are enabled for auth, API keys, scan creation, AI validation, remediation, and report export/share paths.
- Logs redact API keys, JWTs, database URLs, Redis URLs, and private keys.

## Reports

- Suppressed findings are hidden by default.
- Public report links are token-based, expiring, and revocable.
- Exports include checksums.
- PDF export does not fabricate files when no renderer is configured.

## Beta Disclaimer

Use the exact wording:

```text
Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.
```

## Not Allowed

- Do not expose artifact storage publicly.
- Do not publish private API keys or bearer tokens.
- Do not claim a certified audit.
- Do not auto-apply remediation patches.
- Do not enable exploit simulation in this phase.
