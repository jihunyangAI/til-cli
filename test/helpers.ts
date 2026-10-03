import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Deps } from '../src/run.ts';

export const CLI = resolve(import.meta.dirname, '..', 'dist', 'cli.mjs');

export function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
): { code: number | null; stdout: string; stderr: string } {
  const merged: Record<string, string | undefined> = { ...process.env, ...env };
  for (const k of Object.keys(env)) {
    if (env[k] === undefined) delete merged[k];
  }
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: merged as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'til-test-'));
}

export function at(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
  ms = 0,
): () => Date {
  return () => new Date(y, mo - 1, d, h, mi, s, ms);
}

export function fakeDeps(overrides: Partial<Deps> = {}): {
  deps: Deps;
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const deps: Deps = {
    now: at(2026, 10, 4, 9, 5),
    env: { TIL_DIR: join(tempDir(), 'store') },
    homedir: () => tempDir(),
    cwd: () => tempDir(),
    out: (s) => {
      out.push(s);
    },
    err: (s) => {
      err.push(s);
    },
    ...overrides,
  };
  return { deps, out, err };
}
