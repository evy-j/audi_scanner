import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = process.argv[2] || '../audit-scanner-final-release-candidate.zip';
const absoluteOut = path.resolve(root, out);

const excludes = [
  'node_modules/*', '.git/*', '.next/*', 'dist/*', 'build/*', 'coverage/*', '.pytest_cache/*',
  '.env', '.env.local', '.env.production', '*.log'
];

if (fs.existsSync(absoluteOut)) fs.rmSync(absoluteOut);
const args = ['-r', absoluteOut, '.', ...excludes.flatMap((e) => ['-x', e])];
const result = spawnSync('zip', args, { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Created ${absoluteOut}`);
