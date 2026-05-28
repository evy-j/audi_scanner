# Final Release Candidate Guide

This repository is a full-source release-candidate package for the Web3Guard/Audit Scanner platform.

## First-time Setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:deploy
npm run billing:seed
npm run chain:seed
```

Update `.env` with local/staging values. Do not commit real secrets.

## Verify Build

```bash
npm run qa:final
npm run typecheck
npm test
npm run build
```

## Run Locally

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:worker
```

Terminal 3:

```bash
npm run dev:web
```

Open:

```text
http://localhost:3000
```

## Key Pages

```text
/dashboard
/scan
/settings/billing
/settings/chains
/settings/integrations
/settings/security
/security-os
/security-os/deep
/security-os/real-ops
```

## Required Before Production

- Run full test/build commands successfully.
- Configure secrets in host secret manager only.
- Verify database migrations in staging.
- Verify source ingestion with a small test repo.
- Verify scan pipeline with local source artifact.
- Verify GitHub webhook signature in staging.
- Verify billing in provider test mode.
- Verify public report redaction.
- Verify tenant isolation manually.
- Verify no raw secrets are logged.

## Claims Allowed

Allowed:

```text
Evidence-backed Web3 pre-audit readiness scanner.
```

Not allowed unless proven and legally reviewed:

```text
Certified audit replacement.
SOC2/ISO certified.
CertiK-equivalent company.
Guaranteed exploit detection.
Guaranteed formal verification proof.
```
