# Fix 21 — Windows build + login strict optional type

Fixes:

1. `Error: spawn npm ENOENT` from `scripts/render-build-all.mjs` on Windows.
2. Next.js build error in `apps/web/src/app/login/page.tsx` caused by `exactOptionalPropertyTypes` and `preferredOrgName: undefined`.

Apply:

```powershell
cd C:\auit_scanner
Expand-Archive .\audit-scanner-fix-21-windows-build-login.zip -DestinationPath .\fix21 -Force
powershell -ExecutionPolicy Bypass -File .\fix21\APPLY_FIX21_WINDOWS_BUILD_LOGIN.ps1 -ProjectRoot C:\auit_scanner
npm run build:render:all
npm run build:web:vercel
git add .
git commit -m "Fix Windows render build and login optional workspace name"
git push origin main
```

After deploy:

```powershell
curl.exe -i https://audit-scanner-api.onrender.com/health
curl.exe -i https://audit-scanner-api.onrender.com/ready
```
