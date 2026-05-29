import { readFileSync, existsSync } from 'node:fs';

const required = [
  'apps/api/src/modules/simple-scans/simple-scans.routes.ts',
  'apps/api/src/modules/simple-scans/simple-scans.service.ts',
  'apps/web/src/components/scan/scan-console.tsx',
  'apps/web/src/app/login/page.tsx',
  'apps/web/src/app/logout/page.tsx',
  'apps/web/src/app/auditor/page.tsx',
  'docs/SIMPLE_SCAN_FULL_IMPLEMENTATION.md'
];

let ok = true;
for (const file of required) {
  if (!existsSync(file)) {
    console.error(`[missing] ${file}`);
    ok = false;
  } else {
    console.log(`[ok] ${file}`);
  }
}

const scanConsole = readFileSync('apps/web/src/components/scan/scan-console.tsx', 'utf8');
for (const phrase of ['GitHub repo URL', 'Live website URL', 'Upload ZIP/folder', 'Smart contract address']) {
  if (!scanConsole.includes(phrase)) {
    console.error(`[scan-ui-missing] ${phrase}`);
    ok = false;
  }
}

const simpleService = readFileSync('apps/api/src/modules/simple-scans/simple-scans.service.ts', 'utf8');
for (const forbidden of ['brute force', 'credential attack', 'DoS']) {
  if (!simpleService.toLowerCase().includes(forbidden.toLowerCase())) {
    console.error(`[safety-note-missing] ${forbidden}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log('[simple-scan-qa] passed');
