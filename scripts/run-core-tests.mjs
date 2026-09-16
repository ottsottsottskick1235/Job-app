import { rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const outDir = '.test-build';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const tscCommand = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
const compile = spawnSync(tscCommand, [
  'lib/types.ts',
  'lib/matching.ts',
  'lib/applicationState.ts',
  'lib/filters.ts',
  'lib/geocoding.ts',
  '--target', 'ES2022',
  '--module', 'commonjs',
  '--moduleResolution', 'node',
  '--lib', 'ES2022,DOM',
  '--outDir', outDir,
  '--skipLibCheck',
], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const tests = spawnSync(process.execPath, [
  '--test',
  'tests/matching.test.cjs',
  'tests/applicationState.test.cjs',
  'tests/filters.test.cjs',
  'tests/geocoding.test.cjs',
], { stdio: 'inherit' });
process.exit(tests.status ?? 1);
