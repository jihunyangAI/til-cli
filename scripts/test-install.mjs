// Windows shim matrix: pack the package, install the tarball into a temp prefix, then drive the
// generated shims (til.ps1 / til.cmd / til) through real PowerShell 5.1, cmd and Git Bash.
// vitest's argv-array spawns bypass shell quoting and shims (research F2), so this is the only
// place the real user path is exercised. Run with: npm run test:install
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.platform !== 'win32') {
  console.log('test-install: skipped (win32 only)');
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error('run this via: npm run test:install');
  process.exit(1);
}

// Every child gets a timeout and a closed stdin so nothing can hang waiting for input.
const RUN = { encoding: 'utf8', input: '', timeout: 60_000, killSignal: 'SIGKILL' };

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function npm(args) {
  // Spawning npm.cmd without a shell is refused by current Node on Windows, so run npm's JS entry.
  const r = spawnSync(process.execPath, [npmExecPath, ...args], { ...RUN, timeout: 240_000 });
  if (r.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed (status ${r.status})\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

class CaseFailure extends Error {}

function check(label, r, { code = 0, stdoutIncludes, stdoutTrimmedEquals } = {}) {
  const problems = [];
  if (r.error) problems.push(`spawn error: ${r.error.message}`);
  if (r.status !== code) problems.push(`exit code ${r.status}, expected ${code}`);
  if (stdoutIncludes !== undefined && !String(r.stdout).includes(stdoutIncludes)) {
    problems.push(`stdout does not include ${JSON.stringify(stdoutIncludes)}`);
  }
  if (stdoutTrimmedEquals !== undefined && String(r.stdout).trim() !== stdoutTrimmedEquals) {
    problems.push(`stdout trimmed is not ${JSON.stringify(stdoutTrimmedEquals)}`);
  }
  if (problems.length > 0) {
    const policy = /running scripts is disabled|ExecutionPolicy|UnauthorizedAccess/i.test(String(r.stderr))
      ? '\nPowerShell ExecutionPolicy appears to block til.ps1 (research A6): use RemoteSigned or til.cmd.'
      : '';
    throw new CaseFailure(
      `FAIL ${label}\n  ${problems.join('\n  ')}\n  exit: ${r.status}\n  stdout: ${r.stdout}\n  stderr: ${r.stderr}${policy}`,
    );
  }
  console.log(`ok   ${label}`);
}

function main(dirs) {
  const { packDir, prefix, store, storeInfo } = dirs;

  // 1. Pack and inspect the tarball (D-16 files whitelist).
  // The prepare lifecycle (tsdown build) prints to stdout before the JSON array, so parse from the array start.
  const packOut = npm(['pack', '--json', '--pack-destination', packDir]);
  const packed = JSON.parse(packOut.slice(packOut.search(/^\[\s*$/m)))[0];
  const paths = packed.files.map((f) => f.path.replace(/\\/g, '/'));
  if (!paths.includes('dist/cli.mjs') || !paths.includes('package.json')) {
    throw new CaseFailure(`FAIL tarball: missing dist/cli.mjs or package.json (${paths.join(', ')})`);
  }
  const stray = paths.filter((p) => p.startsWith('src/') || p.startsWith('test/'));
  if (stray.length > 0) throw new CaseFailure(`FAIL tarball: contains ${stray.join(', ')}`);
  console.log(`ok   tarball ${packed.filename} (${paths.length} files, no src/ or test/)`);

  // 2. Install into the temp prefix and confirm the three shims exist.
  npm(['install', '-g', '--prefix', prefix, join(packDir, packed.filename)]);
  for (const shim of ['til', 'til.cmd', 'til.ps1']) {
    if (!existsSync(join(prefix, shim))) throw new CaseFailure(`FAIL install: ${shim} missing in ${prefix}`);
  }
  console.log('ok   install: til, til.cmd, til.ps1 present in temp prefix');

  // Base env: the temp prefix wins over any global install; TIL_DIR keeps the real ~/til untouched.
  // Windows env keys are case-insensitive but a spread copy is a plain object, so reuse the real key.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const baseEnv = (extra = {}) => ({
    ...process.env,
    [pathKey]: `${prefix};${process.env[pathKey]}`,
    TIL_DIR: store,
    ...extra,
  });

  // PowerShell 5.1. No -ExecutionPolicy flag: mirror real usage. Korean only via TIL_TEXT.
  const ps = (label, command, env = baseEnv(), expect = {}) =>
    check(
      `powershell ${label}`,
      spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
        env,
        ...RUN,
      }),
      expect,
    );
  const psEnv = baseEnv({ TIL_TEXT: 'pwsh 한글 😀' });
  ps('korean+emoji', 'til $env:TIL_TEXT; exit $LASTEXITCODE', psEnv, { stdoutIncludes: 'Saved:' });
  ps("til '--' -dash", "til '--' -dash; exit $LASTEXITCODE", psEnv);
  ps('til add show me', 'til add show me; exit $LASTEXITCODE', psEnv);
  ps('til --version', 'til --version; exit $LASTEXITCODE', psEnv, { stdoutTrimmedEquals: pkg.version });
  ps('til --help', 'til --help; exit $LASTEXITCODE', psEnv, { stdoutIncludes: 'Usage:' });

  // Informational only (D-18): the npm .ps1 shim swallows an unquoted `--`.
  const info = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', 'til -- -dash; exit $LASTEXITCODE'],
    { env: baseEnv({ TIL_DIR: storeInfo }), ...RUN },
  );
  const hint = String(info.stderr).includes("til '--' <text>");
  console.log(
    `info powershell unquoted "til -- -dash": exit ${info.status}, stderr has "til '--' <text>" hint: ${hint} ` +
      '(expected exit 2: the .ps1 shim swallows --, D-18; not asserted)',
  );

  // cmd: `call` is required for .cmd shims in batch context (Pitfall 8).
  const cmd = (label, line, env = baseEnv(), expect = {}) =>
    check(
      `cmd ${label}`,
      spawnSync('cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
        env,
        ...RUN,
        windowsVerbatimArguments: true,
      }),
      expect,
    );
  const cmdEnv = baseEnv({ TIL_TEXT: 'cmd 한글 😀' });
  cmd('korean+emoji', 'call til %TIL_TEXT%', cmdEnv, { stdoutIncludes: 'Saved:' });
  cmd('til -- -dash', 'call til -- -dash', cmdEnv);
  cmd('til add show me', 'call til add show me', cmdEnv);
  cmd('til --version', 'call til --version', cmdEnv, { stdoutTrimmedEquals: pkg.version });
  cmd('til --help', 'call til --help', cmdEnv, { stdoutIncludes: 'Usage:' });

  // Git Bash. Never fall back to System32\bash.exe (the WSL launcher).
  const gitBash = process.env.GIT_BASH ?? 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (!existsSync(gitBash)) {
    throw new CaseFailure(`FAIL git bash not found at ${gitBash}; set GIT_BASH to its path (not System32\\bash.exe)`);
  }
  const bash = (label, line, env = baseEnv(), expect = {}) =>
    check(`git-bash ${label}`, spawnSync(gitBash, ['-c', line], { env, ...RUN }), expect);
  const bashEnv = baseEnv({ TIL_TEXT: 'bash 한글 😀' });
  bash('korean+emoji', 'til "$TIL_TEXT"', bashEnv, { stdoutIncludes: 'Saved:' });
  bash('til -- -dash', 'til -- -dash', bashEnv);
  bash('til add show me', 'til add show me', bashEnv);
  bash('til --version', 'til --version', bashEnv, { stdoutTrimmedEquals: pkg.version });
  bash('til --help', 'til --help', bashEnv, { stdoutIncludes: 'Usage:' });

  // 3. Assert exact bytes in the day file (never from shell-captured stdout, Pitfall 8).
  const files = readdirSync(store);
  if (files.length !== 1 || !/^\d{4}-\d\d-\d\d\.md$/.test(files[0])) {
    throw new CaseFailure(`FAIL store: expected one YYYY-MM-DD.md, found ${JSON.stringify(files)}`);
  }
  const buf = readFileSync(join(store, files[0]));
  if (buf[0] !== 0x23) throw new CaseFailure('FAIL bytes: first byte is not "#"');
  if (buf.includes(0x0d)) throw new CaseFailure('FAIL bytes: file contains CR (0x0D)');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new CaseFailure('FAIL bytes: file starts with a BOM');
  }
  const lines = buf.toString('utf8').split('\n');
  const count = (re) => lines.filter((l) => re.test(l)).length;
  const expectations = [
    [/^# /, 1, 'heading'],
    [/^- \d\d:\d\d pwsh 한글 😀$/u, 1, 'powershell korean+emoji'],
    [/^- \d\d:\d\d cmd 한글 😀$/u, 1, 'cmd korean+emoji'],
    [/^- \d\d:\d\d bash 한글 😀$/u, 1, 'git-bash korean+emoji'],
    [/^- \d\d:\d\d -dash$/, 3, '-dash entries'],
    [/^- \d\d:\d\d show me$/, 3, 'show me entries'],
  ];
  for (const [re, want, what] of expectations) {
    const got = count(re);
    if (got !== want) {
      throw new CaseFailure(`FAIL bytes: expected ${want} ${what}, found ${got}\n${buf.toString('utf8')}`);
    }
  }
  console.log(`ok   day file ${files[0]}: UTF-8, LF only, no BOM, 1 heading, 3 Korean+emoji, 3 -dash, 3 show me`);
}

const dirs = {
  packDir: mkdtempSync(join(tmpdir(), 'til-pack-')),
  prefix: mkdtempSync(join(tmpdir(), 'til-prefix-')),
  store: mkdtempSync(join(tmpdir(), 'til-store-')),
  storeInfo: mkdtempSync(join(tmpdir(), 'til-info-')),
};
let failed = false;
try {
  main(dirs);
} catch (err) {
  failed = true;
  console.error(err instanceof CaseFailure ? err.message : err);
} finally {
  for (const d of Object.values(dirs)) rmSync(d, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log('test-install: all shells passed');
