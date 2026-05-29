$ErrorActionPreference = "Stop"
$route = Join-Path (Get-Location) "apps\web\src\app\api\backend\[...path]\route.ts"
if (!(Test-Path $route)) { throw "Missing route file: $route" }
$text = Get-Content $route -Raw
if ($text -notmatch "params:\s*Promise<\{\s*path:\s*string\[\]\s*\}>") { throw "Next.js 15 async params type not found" }
if ($text -match "const body = method ===") { throw "Old undefined body pattern still exists" }
if ($text -match "body,\s*\r?\n\s*cache") { throw "Old fetch init body shorthand still exists" }
if ($text -notmatch "const requestInit: RequestInit") { throw "RequestInit exact optional fix missing" }
if ($text -notmatch "requestInit\.body = await request\.arrayBuffer\(\)") { throw "Conditional body assignment missing" }
Write-Host "OK: fix28 Next proxy exactOptionalPropertyTypes body fix is applied."
