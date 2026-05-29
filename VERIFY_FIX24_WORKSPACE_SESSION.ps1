$ErrorActionPreference = "Stop"
$target = Join-Path (Get-Location) "apps\web\src\lib\workspace-session.ts"
if (!(Test-Path $target)) { throw "workspace-session.ts not found at $target" }
$content = Get-Content $target -Raw
if ($content -match "status:\s*typeof user\.status.*undefined") { throw "Old broken status undefined assignment still exists." }
if ($content -notmatch "const normalized: StoredUserProfile") { throw "Fix24 normalized StoredUserProfile block missing." }
Write-Host "OK: fix24 workspace-session exactOptionalPropertyTypes fix is applied."
