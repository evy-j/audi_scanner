import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'packages/database/prisma/schema.prisma',
  'apps/api/src/modules/billing/billing.routes.ts',
  'apps/api/src/modules/chains/chains.routes.ts',
  'apps/api/src/modules/chains/explorer.controller.ts',
  'apps/api/src/modules/security-os/security-os.routes.ts',
  'apps/web/src/app/settings/billing/page.tsx',
  'apps/web/src/app/settings/chains/page.tsx',
  'apps/web/src/app/security-os/page.tsx',
  'apps/web/src/app/security-os/deep/page.tsx',
  'apps/web/src/app/security-os/real-ops/page.tsx',
  'PHASE_P26_FINAL_RELEASE_CANDIDATE_SUMMARY.md',
  'docs/FINAL_RELEASE_CANDIDATE.md'
];

const phaseSummaries = [
  'PHASE_P12_SUMMARY.md',
  'PHASE_P12B_SUMMARY.md',
  'PHASE_P13_FULL_SOURCE_ADDED.md',
  'PHASE_P14_SUMMARY.md',
  'PHASE_P14B_SUMMARY.md',
  'PHASE_P15_P25_DEEP_SUMMARY.md',
  'PHASE_P25_PLUS_REAL_TRUST_ACTIVATION_SUMMARY.md',
  'PHASE_P26_FINAL_RELEASE_CANDIDATE_SUMMARY.md'
];

const missing = [];
for (const rel of [...required, ...phaseSummaries]) {
  if (!fs.existsSync(path.join(root, rel))) missing.push(rel);
}

const secretPatterns = [
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/i,
  /xox[baprs]-[A-Za-z0-9-]+/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk_live_[A-Za-z0-9]{16,}/,
  /rk_live_[A-Za-z0-9]{16,}/,
  /mongodb(\+srv)?:\/\/[^\s]+:[^\s]+@/i,
  /postgres(ql)?:\/\/[^\s]+:[^\s]+@/i
];

const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.pytest_cache']);
const scanExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.env', '.example', '.yml', '.yaml', '.prisma']);
const suspicious = [];
const allowedFixtureMatches = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else {
      const ext = path.extname(entry.name);
      if (!scanExt.has(ext) && !entry.name.includes('.env')) continue;
      const stat = fs.statSync(full);
      if (stat.size > 1024 * 1024) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const pattern of secretPatterns) {
        if (pattern.test(text)) {
          const rel = path.relative(root, full);
          const isAllowedFixture =
            rel.endsWith('.example') ||
            rel.includes('/docs/') ||
            rel.startsWith('docs/') ||
            rel.startsWith('tests/') ||
            rel.startsWith('.github/workflows/') ||
            rel.startsWith('docker-compose') ||
            text.includes('audit_scanner:audit_scanner@localhost') ||
            text.includes('postgres:postgres@localhost') ||
            text.includes('[REDACTED_') ||
            text.includes('ghp_123456789012345678901234567890123456');
          if (isAllowedFixture) {
            allowedFixtureMatches.push(rel);
          } else {
            suspicious.push(rel);
          }
          break;
        }
      }
    }
  }
}

walk(root);

const report = {
  checkedAt: new Date().toISOString(),
  missingRequiredFiles: missing,
  suspiciousSecretFiles: [...new Set(suspicious)],
  allowedFixtureSecretMatches: [...new Set(allowedFixtureMatches)],
  status: missing.length === 0 && suspicious.length === 0 ? 'PASS' : 'REVIEW_REQUIRED'
};

fs.writeFileSync(path.join(root, 'FINAL_QA_STATIC_REPORT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (missing.length > 0 || suspicious.length > 0) {
  process.exitCode = 1;
}
