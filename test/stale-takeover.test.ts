import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayFileName, localDate } from '../src/core/format.ts';
import { dayLockPath } from '../src/storage.ts';
import { CLI, tempDir } from './helpers.ts';

const PROCS = 12;
const ROUNDS = 8;

function runOne(dir: string, text: string): Promise<number | null> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, text], {
      env: { ...process.env, TIL_DIR: dir },
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('close', resolvePromise);
  });
}

// State left by a killed `til`: the day file at 0 bytes (killed between create and write) plus a
// lock directory old enough to count as stale.
async function round(): Promise<{ dir: string; date: string; codes: Array<number | null> }> {
  for (let attempt = 0; ; attempt++) {
    const dir = tempDir();
    const date = localDate(new Date());
    writeFileSync(join(dir, dayFileName(date)), Buffer.alloc(0));
    const lock = dayLockPath(dir, date);
    mkdirSync(lock);
    const past = new Date(Date.now() - 60000);
    utimesSync(lock, past, past);
    const codes = await Promise.all(Array.from({ length: PROCS }, (_, i) => runOne(dir, `entry${i}`)));
    // A round that straddles local midnight legitimately splits across two files; redo it once.
    if (date === localDate(new Date()) || attempt >= 1) return { dir, date, codes };
  }
}

describe('stale-lock takeover with concurrent takers (WR-01)', () => {
  // Known limitation (accepted by the user 2026-10-05, review WR-01): after a crash leaves a 0-byte
  // day file plus a stale lock, concurrent takers can still race in the stat-to-rmdir window or on
  // Windows delete-pending EPERM, so a duplicate heading is possible (reproduced ~1 in 3 full-suite
  // runs under load). The guarantee kept here is the one that matters: no entry lost or duplicated.
  it('every entry exactly once after stale takeover (duplicate heading is a known limitation)', async () => {
    for (let n = 0; n < ROUNDS; n++) {
      const { dir, date, codes } = await round();
      expect(codes).toEqual(Array(PROCS).fill(0));
      expect(readdirSync(dir)).toEqual([dayFileName(date)]);
      const lines = readFileSync(join(dir, dayFileName(date)), 'utf8').split('\n');
      expect(lines[0]).toBe('# ' + date);
      expect(lines[1]).toBe('');
      const entries = lines.slice(2).filter((l) => l !== '' && l !== '# ' + date);
      const seen = entries.map((l) => /^- \d\d:\d\d entry(\d+)$/.exec(l)?.[1]);
      expect(seen.every((s) => s !== undefined)).toBe(true);
      expect(seen.map(Number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: PROCS }, (_, i) => i),
      );
    }
  }, 120000);
});
