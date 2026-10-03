// Runs the 20-process STOR-06 gate 10 times. Plain Node so it works from cmd.exe,
// PowerShell and POSIX shells alike (no `VAR=value cmd` env-prefix syntax).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const vitestDir = join(root, 'node_modules', 'vitest');
const pkg = JSON.parse(readFileSync(join(vitestDir, 'package.json'), 'utf8'));
const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest;

const r = spawnSync(process.execPath, [join(vitestDir, bin), 'run', 'test/stress.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TIL_STRESS_TRIALS: '10' },
});
process.exitCode = r.status ?? 1;
