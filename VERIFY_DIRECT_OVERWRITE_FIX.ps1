$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$login = Join-Path $root "apps\web\src\app\login\page.tsx"
$build = Join-Path $root "scripts\render-build-all.mjs"
if (!(Test-Path $login)) { throw "Missing login page: $login" }
if (!(Test-Path $build)) { throw "Missing render build script: $build" }
$loginText = Get-Content $login -Raw
$buildText = Get-Content $build -Raw
if ($loginText -match "preferredOrgName:\s*displayName\s*\|\|\s*undefined") {
  throw "Old broken login optional prop pattern still exists. ZIP was not extracted over the project root."
}
if ($buildText -match "spawn\(\s*[`"']npm[`"']") {
  throw "Old broken spawn npm pattern still exists. ZIP was not extracted over the project root."
}
if ($buildText -notmatch "npmExecPath" -or $buildText -notmatch "npm\.cmd") {
  throw "Windows-safe render build script not found."
}
Write-Host "OK: direct overwrite fix is applied." -ForegroundColor Green
Write-Host "Next: npm install --include=dev; npm run build:render:all; npm run build:web:vercel" -ForegroundColor Cyan
