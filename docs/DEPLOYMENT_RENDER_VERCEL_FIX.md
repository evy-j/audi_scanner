# Render + Vercel Deployment Fix

## Vercel web build

Use these settings when the Vercel project root directory is `apps/web`:

```text
Install Command: cd ../.. && npm install --include=dev
Build Command: cd ../.. && npm run build:web:vercel
Output Directory: .next
```

Do not run `npm install` again inside the build command. Running a second install can prune build-time type dependencies in some environments.

Required frontend environment variables:

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR_RENDER_API.onrender.com
NEXT_PUBLIC_WEB_BASE_URL=https://YOUR_VERCEL_APP.vercel.app
NEXT_PUBLIC_REALTIME_WS_URL=wss://YOUR_RENDER_API.onrender.com
```

## Render API build

Create only one Web Service for the API during smoke testing. Leave Root Directory blank. Do not type `repo root`.

```text
Root Directory: blank / empty
Build Command: npm install --include=dev && npm run build:api:render
Start Command: npm run start:api:render
```

Set `DATABASE_URL` to a real hosted Postgres URL such as Supabase or Neon.

Worker can remain undeployed while smoke testing if background jobs are disabled.
