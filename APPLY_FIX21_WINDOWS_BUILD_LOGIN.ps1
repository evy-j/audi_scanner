param(
  [string]$ProjectRoot = "C:\auit_scanner"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[fix21] $msg" -ForegroundColor Cyan
}

function Backup-File($path) {
  if (Test-Path $path) {
    $backup = "$path.fix21.bak"
    Copy-Item $path $backup -Force
    Write-Step "backup created: $backup"
  }
}

if (!(Test-Path $ProjectRoot)) {
  throw "ProjectRoot not found: $ProjectRoot"
}

Set-Location $ProjectRoot

# -----------------------------------------------------------------------------
# Fix 1: Windows local build error: Error: spawn npm ENOENT
# Root cause: child_process.spawn('npm') may fail on Windows because npm is npm.cmd.
# Fix: make scripts/render-build-all.mjs use npm.cmd on Windows + shell fallback.
# -----------------------------------------------------------------------------
$buildScript = Join-Path $ProjectRoot "scripts\render-build-all.mjs"
if (!(Test-Path $buildScript)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $buildScript) | Out-Null
  @'
import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  ["db:generate", ["run", "db:generate"]],
  ["build:packages", ["run", "build:packages"]],
  ["build:api", ["--workspace", "@audit-scanner/api", "run", "build"]],
  ["build:worker", ["--workspace", "@audit-scanner/worker", "run", "build"]],
];

function stamp() {
  return new Date().toISOString();
}

function runStep(name, args) {
  return new Promise((resolve, reject) => {
    console.log(`[render:build] ${stamp()} starting ${name}: ${npmCommand} ${args.join(" ")}`);
    const child = spawn(npmCommand, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

    const heartbeat = setInterval(() => {
      console.log(`[render:build] ${stamp()} ${name} still running...`);
    }, 30000);

    child.on("error", (error) => {
      clearInterval(heartbeat);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearInterval(heartbeat);
      if (code === 0) {
        console.log(`[render:build] ${stamp()} completed ${name}`);
        resolve();
        return;
      }
      reject(new Error(`${name} failed with code=${code} signal=${signal ?? "none"}`));
    });
  });
}

for (const [name, args] of steps) {
  await runStep(name, args);
}

console.log(`[render:build] ${stamp()} all build steps completed`);
'@ | Set-Content -Path $buildScript -Encoding UTF8
  Write-Step "created scripts/render-build-all.mjs"
} else {
  Backup-File $buildScript
  $content = Get-Content $buildScript -Raw

  # Replace common broken forms first.
  $content = $content -replace 'spawn\("npm"\s*,', 'spawn(npmCommand,'
  $content = $content -replace "spawn\('npm'\s*,", "spawn(npmCommand,"
  $content = $content -replace 'spawn\(`npm`\s*,', 'spawn(npmCommand,'

  # Ensure npmCommand declaration exists after imports.
  if ($content -notmatch 'npmCommand\s*=\s*process\.platform') {
    $content = $content -replace '(import[^\r\n]+[\r\n]+(?:import[^\r\n]+[\r\n]+)*)', "`$1`nconst npmCommand = process.platform === \"win32\" ? \"npm.cmd\" : \"npm\";`n"
  }

  # Add shell option inside spawn options when an options object is visible.
  if ($content -notmatch 'shell:\s*process\.platform\s*===\s*["'']win32["'']') {
    $content = $content -replace '(env:\s*process\.env\s*,?)', "`$1`n      shell: process.platform === \"win32\"," 
    if ($content -notmatch 'shell:\s*process\.platform\s*===\s*["'']win32["'']') {
      # Fallback: overwrite with a known-good script if automated patch did not find the object.
      @'
import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  ["db:generate", ["run", "db:generate"]],
  ["build:packages", ["run", "build:packages"]],
  ["build:api", ["--workspace", "@audit-scanner/api", "run", "build"]],
  ["build:worker", ["--workspace", "@audit-scanner/worker", "run", "build"]],
];

function stamp() {
  return new Date().toISOString();
}

function runStep(name, args) {
  return new Promise((resolve, reject) => {
    console.log(`[render:build] ${stamp()} starting ${name}: ${npmCommand} ${args.join(" ")}`);
    const child = spawn(npmCommand, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

    const heartbeat = setInterval(() => {
      console.log(`[render:build] ${stamp()} ${name} still running...`);
    }, 30000);

    child.on("error", (error) => {
      clearInterval(heartbeat);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearInterval(heartbeat);
      if (code === 0) {
        console.log(`[render:build] ${stamp()} completed ${name}`);
        resolve();
        return;
      }
      reject(new Error(`${name} failed with code=${code} signal=${signal ?? "none"}`));
    });
  });
}

for (const [name, args] of steps) {
  await runStep(name, args);
}

console.log(`[render:build] ${stamp()} all build steps completed`);
'@ | Set-Content -Path $buildScript -Encoding UTF8
      Write-Step "rewrote scripts/render-build-all.mjs with known-good Windows/Render script"
    } else {
      Set-Content -Path $buildScript -Value $content -Encoding UTF8
      Write-Step "patched scripts/render-build-all.mjs"
    }
  } else {
    Set-Content -Path $buildScript -Value $content -Encoding UTF8
    Write-Step "patched scripts/render-build-all.mjs"
  }
}

# -----------------------------------------------------------------------------
# Fix 2: exactOptionalPropertyTypes error in login page.
# Root cause: preferredOrgName?: string cannot be explicitly passed as undefined.
# Fix: omit preferredOrgName key unless it has a non-empty string value.
# -----------------------------------------------------------------------------
$loginPage = Join-Path $ProjectRoot "apps\web\src\app\login\page.tsx"
if (!(Test-Path $loginPage)) {
  throw "Login page not found: $loginPage"
}
Backup-File $loginPage
$login = Get-Content $loginPage -Raw

# Fix exact known broken call.
$login = $login -replace 'const boot = await bootstrapWorkspaceAfterSession\(\{ apiBaseUrl, realtimeWsUrl, session, preferredOrgName: displayName \|\| undefined \}\);', @'
      const preferredOrgName = displayName.trim();
      const boot = await bootstrapWorkspaceAfterSession({
        apiBaseUrl,
        realtimeWsUrl,
        session,
        ...(preferredOrgName ? { preferredOrgName } : {}),
      });
'@

# Defensive fix for any remaining object property that explicitly sends undefined.
$login = $login -replace 'preferredOrgName:\s*displayName\s*\|\|\s*undefined', '...(displayName.trim() ? { preferredOrgName: displayName.trim() } : {})'
$login = $login -replace 'preferredOrgName:\s*([^,}\r\n]+)\s*\?\?\s*undefined', '...($1 ? { preferredOrgName: $1 } : {})'

Set-Content -Path $loginPage -Value $login -Encoding UTF8
Write-Step "patched apps/web/src/app/login/page.tsx"

# -----------------------------------------------------------------------------
# Ensure package.json build:render:all points to heartbeat script.
# -----------------------------------------------------------------------------
$packageJson = Join-Path $ProjectRoot "package.json"
if (Test-Path $packageJson) {
  Backup-File $packageJson
  $pkg = Get-Content $packageJson -Raw | ConvertFrom-Json
  if ($null -eq $pkg.scripts) {
    $pkg | Add-Member -MemberType NoteProperty -Name scripts -Value ([pscustomobject]@{})
  }
  $pkg.scripts."build:render:all" = "node scripts/render-build-all.mjs"
  $pkg | ConvertTo-Json -Depth 50 | Set-Content -Path $packageJson -Encoding UTF8
  Write-Step "ensured package.json build:render:all uses render-build-all.mjs"
}

Write-Step "Fix 21 applied. Now run: npm run build:render:all; npm run build:web:vercel"
