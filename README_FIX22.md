# Fix 22 — Force build/login fix

This patch force-overwrites the two files causing your current errors:

1. `scripts/render-build-all.mjs`
   - Fixes Windows `spawn npm ENOENT` by launching npm through Node's `npm_execpath` when available.
   - Keeps Render/Linux support.

2. `apps/web/src/app/login/page.tsx`
   - Fixes `exactOptionalPropertyTypes` by not passing optional props as explicit `undefined`.
   - Fixes both `preferredOrgName` and signup `displayName` payload.

## Apply

```powershell
cd C:\auit_scanner
Expand-Archive .\audit-scanner-fix-22-force-build-login.zip -DestinationPath .\fix22 -Force
powershell -ExecutionPolicy Bypass -File .\fix22\APPLY_FIX22_FORCE_BUILD_LOGIN.ps1 -ProjectRoot C:\auit_scanner
npm run build:render:all
npm run build:web:vercel
```

If you want the script to run both builds automatically:

```powershell
powershell -ExecutionPolicy Bypass -File .\fix22\APPLY_FIX22_FORCE_BUILD_LOGIN.ps1 -ProjectRoot C:\auit_scanner -RunBuild
```
