import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localDate } from '../src/core/format.ts';
import { CLI, tempDir } from './helpers.ts';

const TRIALS = Number(process.env.TIL_STRESS_TRIALS ?? '1');
// A zero, negative, fractional or non-numeric count would run no trials and pass vacuously, so a
// green gate would no longer mean the race was exercised (T-01-22). Fail loudly instead.
if (!Number.isInteger(TRIALS) || TRIALS < 1) {
  throw new Error(
    `TIL_STRESS_TRIALS must be an integer >= 1, got "${process.env.TIL_STRESS_TRIALS}"`,
  );
}
const PROCS = 20;
// Contended runs (2 CPUs, many trials) are slow; scale the per-test budget with the trial count.
const TEST_TIMEOUT_MS = Math.max(120000, TRIALS * 15000);

interface Child {
  code: number | null;
  stdout: string;
}

function runOne(dir: string, args: string[]): Promise<Child> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, TIL_DIR: dir },
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code, stdout }));
  });
}

interface Trial {
  dir: string;
  date: string;
  results: Child[];
}

async function trial(argsFor: (i: number) => string[]): Promise<Trial> {
  for (let attempt = 0; ; attempt++) {
    const dir = join(tempDir(), 'a', 'b', 'c');
    const before = localDate(new Date());
    const results = await Promise.all(Array.from({ length: PROCS }, (_, i) => runOne(dir, argsFor(i))));
    const after = localDate(new Date());
    // A run that straddles local midnight legitimately splits across two files; redo it once.
    if (before === after || attempt >= 1) return { dir, date: before, results };
  }
}

function checkCommon(t: Trial): string[] {
  expect(t.results.map((r) => r.code)).toEqual(Array(PROCS).fill(0));
  expect(readdirSync(t.dir)).toEqual([t.date + '.md']);
  const buf = readFileSync(join(t.dir, t.date + '.md'));
  expect(buf[0]).toBe(0x23);
  expect(buf.includes(0x0d)).toBe(false);
  const lines = buf.toString('utf8').split('\n');
  expect(lines[0]).toBe('# ' + t.date);
  expect(lines[1]).toBe('');
  expect(lines.filter((l) => l.startsWith('# '))).toHaveLength(1);
  expect(lines[lines.length - 1]).toBe('');
  return lines.slice(2).filter((l) => l !== '');
}

describe(`STOR-06: ${PROCS} parallel processes (${TRIALS} trial(s))`, () => {
  it(
    '20 parallel distinct entries: every entry exactly once under one heading',
    async () => {
      for (let n = 0; n < TRIALS; n++) {
        const t = await trial((i) => ['entry', String(i), '한글']);
        const entries = checkCommon(t);
        const indices: number[] = [];
        for (const l of entries) {
          const m = /^- \d\d:\d\d entry (\d+) 한글$/.exec(l);
          expect(m, `unexpected line: ${JSON.stringify(l)}`).not.toBeNull();
          indices.push(Number(m![1]));
        }
        expect(indices.sort((a, b) => a - b)).toEqual(Array.from({ length: PROCS }, (_, i) => i));
        t.results.forEach((r, i) => {
          expect(r.stdout).toContain('Saved: - ');
          expect(r.stdout).toContain(`entry ${i} 한글`);
        });
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '20 parallel identical entries: no de-duplication, one heading',
    async () => {
      for (let n = 0; n < TRIALS; n++) {
        const t = await trial(() => ['same', '한글']);
        const entries = checkCommon(t);
        expect(entries).toHaveLength(PROCS);
        for (const l of entries) expect(l).toMatch(/^- \d\d:\d\d same 한글$/);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
