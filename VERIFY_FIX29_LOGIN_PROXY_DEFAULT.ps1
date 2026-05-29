$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$api = Join-Path $root "apps\web\src\lib\api-client.ts"
$ws = Join-Path $root "apps\web\src\lib\workspace-session.ts"

if (!(Test-Path $api)) { throw "Missing $api" }
if (!(Test-Path $ws)) { throw "Missing $ws" }

$apiText = Get-Content $api -Raw
$wsText = Get-Content $ws -Raw

if ($apiText -notmatch 'builtinBackendProxyBaseUrl = "/api/backend"') { throw "api-client is missing built-in backend proxy default." }
if ($apiText -notmatch 'shouldUseBuiltinProxyForBrowser') { throw "api-client is missing browser proxy normalization." }
if ($apiText -notmatch 'backendHost === "audit-scanner-api.onrender.com"') { throw "api-client is not forcing Render browser calls through proxy." }
if ($apiText -notmatch 'export function normalizeWorkspaceConfig') { throw "api-client is missing normalizeWorkspaceConfig export." }
if ($wsText -notmatch 'normalizeWorkspaceConfig') { throw "workspace-session does not normalize saved workspace config." }
if ($wsText -notmatch 'window.localStorage.setItem\(workspaceStorageKey, JSON.stringify\(normalized\)\)') { throw "workspace-session is not rewriting stale localStorage workspace config." }

Write-Host "OK: fix29 login proxy default and stale workspace URL migration is applied."
