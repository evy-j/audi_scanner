$ErrorActionPreference = "Stop"
$route = Join-Path $PSScriptRoot "apps\web\src\app\api\backend\[...path]\route.ts"
if (-not (Test-Path -LiteralPath $route)) { throw "route.ts not found at $route" }
$content = Get-Content -LiteralPath $route -Raw
if ($content -notmatch "params: Promise<\{ path: string\[\] \}>") { throw "Next 15 Promise params type is missing" }
if ($content -match "Promise<\{ path\?: string\[\]; \}> \| \{ path\?: string\[\]; \}") { throw "old union RouteContext is still present" }
if ($content -notmatch "export async function GET") { throw "route handlers must be async for this proxy" }
Write-Host "OK: fix27 Next.js proxy route type is applied."
