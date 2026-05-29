param(
  [string]$ProjectRoot = "C:\auit_scanner"
)

$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$files = @(
  "apps/web/src/lib/api-client.ts",
  "apps/web/src/lib/workspace-session.ts",
  "apps/web/src/hooks/use-workspace-config.ts",
  "apps/web/src/app/login/page.tsx",
  "apps/web/src/app/profile/page.tsx",
  "apps/web/src/components/layout/app-shell.tsx",
  "apps/web/src/components/layout/workspace-config-panel.tsx",
  "apps/web/src/components/scan/scan-console.tsx",
  "apps/api/src/modules/auth/auth.repository.ts",
  "apps/api/src/modules/auth/auth.service.ts"
)

foreach ($file in $files) {
  $src = Join-Path $PatchRoot $file
  $dst = Join-Path $ProjectRoot $file
  $dstDir = Split-Path -Parent $dst
  if (!(Test-Path $src)) { throw "Missing patch file: $src" }
  if (!(Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
  Copy-Item $src $dst -Force
  Write-Host "patched $file"
}

Write-Host "\nPatch applied. Next run:"
Write-Host "npm install --include=dev"
Write-Host "npm run build:render:all"
Write-Host "npm run build:web:vercel"
Write-Host "git add . && git commit -m 'Fix profile login workspace and scan workflow' && git push origin main"
