# Simple Scan + Real Analyzer Implementation

This patch turns the developer/internal scan console into a user-facing Simple Scan page.

## Added user workflows

- GitHub repo URL scan: public GitHub repo is fetched through GitHub's API, filtered by safe source policy, stored as a real source artifact, then queued as a SOURCE scan.
- Live website URL scan: safe passive HTTP/TLS/header scanner. It never performs brute force, exploit chains, credential attacks, DoS, RCE, file writes, wallet signing, or private-key collection.
- Upload source folder / ZIP: browser folder upload or in-browser ZIP extraction via JSZip, then artifact upload, then queued scan.
- Smart contract address scan: uses existing chain/explorer verified-source flow, then queues a SOURCE scan.
- Advanced artifact mode: keeps the old artifact-key flow but hides it from the default user path.
- Login / Logout pages: browser workspace/token management with API login support and manual API-key/token fallback.

## Real-only analyzer behavior

- Slither, Semgrep, Aderyn, Mythril, Foundry are exposed in the UI.
- Worker will run the real tool/container only if configured.
- Missing Docker images/tools are recorded as Tool Not Installed / Not Assessed.
- Foundry analyzer now has a real container command path: `forge test --json --root /workspace`.
- Source preparation no longer rejects web repos just because they do not contain `.sol`; Semgrep web/project scans can proceed with supported source files.

## Persistent artifacts

The existing source artifact store supports local and S3/R2-compatible storage. For Render production, set:

```env
STORAGE_DRIVER=r2
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=audit-scanner-artifacts
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PREFIX=prod
```

Do not use local storage for long-term production reports/artifacts.

## Required Render/Vercel commands

Render API build:

```bash
npm install --include=dev && npm run build:render:all
```

Render API start:

```bash
npm run start:render:all
```

Vercel web build:

```bash
cd ../.. && npm install --include=dev && npm run build:web:vercel
```

## Smoke test

```powershell
curl.exe -i https://audit-scanner-api.onrender.com/health
curl.exe -i https://audit-scanner-api.onrender.com/ready
```

Then open:

- `/login`
- `/scan`
- `/settings/integrations`
- `/settings/chains`
- `/reports/latest`

## Important limits

This patch intentionally does not implement unsafe live pentesting. Live URL scan is passive only. APK/mobile scan remains out of scope unless a safe static APK parser is added later.
