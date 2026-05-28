# Deployment Error Fix — Vercel + Render

This patch fixes the current Vercel and Render build errors reported on 2026-05-28.

## Vercel fix

Error:

```text
Type '"outline"' is not assignable to Badge variant
```

Fix:

- Replaced unsupported `Badge variant="outline"` with supported `variant="neutral"` in `apps/web/src/components/settings/chain-registry-settings.tsx`.

Use Vercel settings:

```text
Root Directory: apps/web
Install Command: cd ../.. && npm install --include=dev
Build Command: cd ../.. && npm run build:web:vercel
Output Directory: .next
```

## Render fix

Error:

```text
Cannot find declaration file for express/cors/jsonwebtoken and cannot find node types
```

Fixes in this patch:

- API tsconfig now includes Node/DOM libs and deployment-safe TS settings.
- Node/Express/CORS/JSONWebToken type packages are listed in API dependencies as well, so Render production installs still have compile-time types.
- Database/worker/package TypeScript tool dependencies are also available during production builds.

Use Render API settings:

```text
Root Directory: leave blank
Build Command: npm install --include=dev && npm run build:api:render
Start Command: npm run start:api:render
```

Do not use `npm install && npm run db:generate && npm --workspace @audit-scanner/api run build` because that skips `build:packages`.

Worker can remain undeployed for free smoke testing.
