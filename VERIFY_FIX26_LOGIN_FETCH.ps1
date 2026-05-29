$ErrorActionPreference = "Stop"
$apiClient = Join-Path (Get-Location) "apps\web\src\lib\api-client.ts"
$proxyRoute = Join-Path (Get-Location) "apps\web\src\app\api\backend\[...path]\route.ts"
if (-not (Test-Path $apiClient)) { throw "api-client.ts not found" }
if (-not (Test-Path -LiteralPath $proxyRoute)) { throw "backend proxy route not found" }
$api = Get-Content $apiClient -Raw
$route = Get-Content -LiteralPath $proxyRoute -Raw
if ($api -notmatch 'normalizeApiBaseUrl') { throw "api-client normalizeApiBaseUrl missing" }
if ($api -notmatch '"/api/backend"') { throw "api-client same-origin backend proxy default missing" }
if ($route -notmatch 'DEFAULT_BACKEND_API_BASE_URL') { throw "backend proxy default URL missing" }
Write-Host "OK: fix26 login fetch proxy is applied."
