param(
  [string]$ProjectRoot = "C:\auit_scanner",
  [switch]$RunBuild
)

$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($Message) {
  Write-Host "[fix22] $Message" -ForegroundColor Cyan
}

function Copy-PatchedFile($RelativePath) {
  $src = Join-Path $PatchRoot (Join-Path "files" $RelativePath)
  $dst = Join-Path $ProjectRoot $RelativePath
  if (!(Test-Path $src)) { throw "Missing patch file: $src" }
  $dstDir = Split-Path -Parent $dst
  if (!(Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
  if (Test-Path $dst) {
    $backup = "$dst.fix22.bak"
    Copy-Item $dst $backup -Force
    Step "backup: $backup"
  }
  Copy-Item $src $dst -Force
  Step "overwritten: $RelativePath"
}

if (!(Test-Path $ProjectRoot)) {
  throw "ProjectRoot not found: $ProjectRoot"
}

Set-Location $ProjectRoot

Copy-PatchedFile "scripts\render-build-all.mjs"
Copy-PatchedFile "apps\web\src\app\login\page.tsx"

# Keep package script pointed to the fixed build supervisor.
$packageJson = Join-Path $ProjectRoot "package.json"
if (Test-Path $packageJson) {
  $pkg = Get-Content $packageJson -Raw | ConvertFrom-Json
  if ($null -eq $pkg.scripts) {
    $pkg | Add-Member -MemberType NoteProperty -Name scripts -Value ([pscustomobject]@{})
  }
  $pkg.scripts."build:render:all" = "node scripts/render-build-all.mjs"
  $pkg | ConvertTo-Json -Depth 80 | Set-Content -Path $packageJson -Encoding UTF8
  Step "package.json build:render:all confirmed"
}

# Hard verification: fail immediately if the old broken patterns remain.
$renderScript = Join-Path $ProjectRoot "scripts\render-build-all.mjs"
$loginPage = Join-Path $ProjectRoot "apps\web\src\app\login\page.tsx"

$oldSpawn = Select-String -Path $renderScript -Pattern 'spawn\(["'']npm["'']\s*,' -Quiet
if ($oldSpawn) { throw "Old broken spawn('npm') pattern still exists in scripts/render-build-all.mjs" }

$badPreferred = Select-String -Path $loginPage -Pattern 'preferredOrgName:\s*displayName\s*\|\|\s*undefined' -Quiet
if ($badPreferred) { throw "Old broken preferredOrgName undefined pattern still exists in login/page.tsx" }

$badDisplay = Select-String -Path $loginPage -Pattern 'displayName:\s*displayName\s*\|\|\s*undefined' -Quiet
if ($badDisplay) { throw "Old broken displayName undefined pattern still exists in login/page.tsx" }

$hasNpmExec = Select-String -Path $renderScript -Pattern 'npm_execpath' -Quiet
if (!$hasNpmExec) { throw "render-build-all.mjs was not replaced with npm_execpath-safe script" }

$hasPatchHelper = Select-String -Path $loginPage -Pattern 'preferredOrgNamePatch' -Quiet
if (!$hasPatchHelper) { throw "login/page.tsx was not replaced with exactOptionalPropertyTypes-safe page" }

Step "self-check passed: Windows build script + login optional props fixed"

if ($RunBuild) {
  Step "running npm run build:render:all"
  npm run build:render:all
  Step "running npm run build:web:vercel"
  npm run build:web:vercel
}

Step "Fix 22 applied. Next commands:"
Write-Host "npm run build:render:all"
Write-Host "npm run build:web:vercel"
Write-Host "git add . && git commit -m 'Force fix Windows build and login strict optional types' && git push origin main"
