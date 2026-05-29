$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$profile = Join-Path $root "apps\web\src\app\profile\page.tsx"
$scan = Join-Path $root "apps\web\src\components\scan\scan-console.tsx"
$api = Join-Path $root "apps\web\src\lib\api-client.ts"
if (-not (Test-Path $profile)) { throw "Missing profile page file" }
if (-not (Test-Path $scan)) { throw "Missing scan console file" }
if (-not (Test-Path $api)) { throw "Missing api-client file" }
$p = Get-Content $profile -Raw
$s = Get-Content $scan -Raw
$a = Get-Content $api -Raw
if ($p -match 'type Organization } from "@/lib/api-client"') { throw "Profile still imports Organization from api-client" }
if ($s -match 'type Scan,') { throw "Scan console still imports Scan from api-client" }
if ($p -notmatch 'from "@/types/api"') { throw "Profile type import from types/api missing" }
if ($s -notmatch 'from "@/types/api"') { throw "Scan type import from types/api missing" }
if ($a -notmatch 'export type \{ Organization, Scan \} from "@/types/api";') { throw "api-client type re-export missing" }
Write-Host "OK: fix23 profile/scan type imports are applied." -ForegroundColor Green
