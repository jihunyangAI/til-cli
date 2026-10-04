// Runs the 20-process STOR-06 gate under CPU contention (G-01-2): pinned to 2 CPUs, 40 trials per
// scenario by default. The first-of-day race (a heading decided from a transient 0-byte file) only
// shows up when processes are preempted, so an unpinned run on a many-core machine proves nothing.
// Plain Node so it works from cmd.exe, PowerShell and POSIX shells alike.
//   TIL_STRESS_TRIALS  trials per scenario (integer >= 1, default 40)
//   TIL_STRESS_CPUS    CPUs to pin to (integer >= 0, default 2; 0 = unpinned escape hatch)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const vitestDir = join(root, 'node_modules', 'vitest');
const pkg = JSON.parse(readFileSync(join(vitestDir, 'package.json'), 'utf8'));
const vitestBin = join(vitestDir, typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest);
const testFile = 'test/stress.test.ts';

function die(message, code) {
  console.error(`stress: ${message}`);
  process.exit(code);
}

const trialsRaw = process.env.TIL_STRESS_TRIALS ?? '40';
const cpusRaw = process.env.TIL_STRESS_CPUS ?? '2';
if (!/^\d+$/.test(trialsRaw) || Number(trialsRaw) < 1) {
  die(`TIL_STRESS_TRIALS must be an integer >= 1, got "${trialsRaw}"`, 2);
}
if (!/^\d+$/.test(cpusRaw)) {
  die(`TIL_STRESS_CPUS must be an integer >= 0, got "${cpusRaw}"`, 2);
}
const trials = Number(trialsRaw);
const pinnable = process.platform === 'win32' || process.platform === 'linux';
const n = pinnable ? Math.min(Number(cpusRaw), availableParallelism()) : 0;
const env = { ...process.env, TIL_STRESS_TRIALS: String(trials) };
const spawnOpts = { cwd: root, stdio: 'inherit', env };

let how;
let r;
if (n === 0) {
  how = 'unpinned';
  console.log(
    `stress: ${trials} trial(s) x 2 scenarios x 20 processes, pinned to ${n} CPU(s) via ${how}`,
  );
  r = spawnSync(process.execPath, [vitestBin, 'run', testFile], spawnOpts);
} else if (process.platform === 'win32') {
  const mask = ((1 << n) - 1).toString(16);
  how = `start /affinity ${mask}`;
  const unsafe = /[!"%^&<>|]/;
  for (const p of [root, process.execPath, vitestBin]) {
    if (unsafe.test(p)) {
      die(`path contains a cmd.exe metacharacter, set TIL_STRESS_CPUS=0: ${p}`, 2);
    }
  }
  console.log(
    `stress: ${trials} trial(s) x 2 scenarios x 20 processes, pinned to ${n} CPU(s) via ${how}`,
  );
  // /v:on plus `& exit !errorlevel!` carries the pinned child's exit code through `start /wait`;
  // without it cmd reports 0. With /s, cmd strips exactly the one outer pair of quotes.
  const line = `start "" /affinity ${mask} /wait /b "${process.execPath}" "${vitestBin}" run ${testFile} & exit !errorlevel!`;
  r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/v:on', '/s', '/c', `"${line}"`], {
    ...spawnOpts,
    windowsVerbatimArguments: true,
  });
} else {
  how = `taskset -c 0-${n - 1}`;
  console.log(
    `stress: ${trials} trial(s) x 2 scenarios x 20 processes, pinned to ${n} CPU(s) via ${how}`,
  );
  r = spawnSync(
    'taskset',
    ['-c', `0-${n - 1}`, process.execPath, vitestBin, 'run', testFile],
    spawnOpts,
  );
  if (r.error && r.error.code === 'ENOENT') {
    die('taskset not found; install util-linux or set TIL_STRESS_CPUS=0 to run unpinned', 1);
  }
}

if (r.error) console.error(r.error);
process.exitCode = r.status ?? 1;
