# Environment

Web3Guard AI uses explicit environment variables for local, staging, and production. Start from `.env.example` and the app-specific examples in `apps/api`, `apps/web`, and `apps/worker`.

Never commit real secrets, private keys, JWTs, API keys, database credentials, Redis passwords, or object-storage credentials.

## Required Runtime Variables

- `DATABASE_URL`: Postgres connection string.
- `REDIS_URL`: Redis connection string for queues, realtime, and rate limits.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `API_KEY_HASH_SECRET`, `REPORT_SHARE_SECRET`: 32+ character random secrets.
- `API_BASE_URL`, `WEB_BASE_URL`, `CORS_ORIGIN` or `CORS_ORIGINS`: deployed API, web, and allowed browser origins.
- `STORAGE_DRIVER`, `LOCAL_ARTIFACT_DIR`: local artifact storage settings.
- `AI_ENABLED`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`: optional AI provider settings. Missing provider config must remain `PROVIDER_NOT_CONFIGURED`.
- `RATE_LIMIT_*`: request throttling settings.
- `FREE_BETA_*`: default monthly beta quota limits.

## Storage

Local staging can use:

```text
STORAGE_DRIVER=local
LOCAL_ARTIFACT_DIR=.artifacts
```

S3/R2 deployments should set object-storage variables only in the hosting platform secret manager. Do not put object-storage keys in committed files.

## AI Provider

Private staging should normally start with:

```text
AI_ENABLED=false
AI_PROVIDER=DISABLED
```

When a provider is enabled, set only the provider key required for that deployment. The API must continue to return provider-not-configured states instead of failing startup when optional AI credentials are absent and AI is disabled.

## CORS

Production rejects wildcard origins. Development may use localhost origins only.

```text
CORS_ORIGIN=https://staging.web3guard.example
CORS_ORIGINS=https://staging.web3guard.example
```

## Beta Disclaimer

Display this wording anywhere reports or scan results are exposed:

```text
Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.
```
