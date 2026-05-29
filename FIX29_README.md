# Fix 29 - Login/signup failed to fetch proxy default

This overwrite fixes the browser app still using the direct Render URL during login/signup.

Files overwritten:
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/workspace-session.ts

What changed:
- Browser runtime auto-converts direct Render API URL to same-origin `/api/backend`.
- Old localStorage workspace config is auto-normalized and rewritten.
- Manual saved config now stores normalized API URL.
- Server-side proxy route can still call Render using BACKEND_API_BASE_URL or fallback.

Required Vercel env:
- NEXT_PUBLIC_API_BASE_URL=/api/backend
- BACKEND_API_BASE_URL=https://audit-scanner-api.onrender.com/api/v1
- NEXT_PUBLIC_REALTIME_WS_URL=wss://audit-scanner-api.onrender.com/api/v1/realtime

After deploy, hard-refresh browser. If old bundle persists, clear localStorage once.
