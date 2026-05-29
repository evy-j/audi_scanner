Fix24: Next.js exactOptionalPropertyTypes fix for workspace-session.ts

Apply:
  cd C:\auit_scanner
  Expand-Archive .\audit-scanner-fix-24-workspace-session-exact-optional.zip -DestinationPath C:\auit_scanner -Force
  powershell -ExecutionPolicy Bypass -File .\VERIFY_FIX24_WORKSPACE_SESSION.ps1

Then build:
  npm run build:render:all
  npm run build:web:vercel
