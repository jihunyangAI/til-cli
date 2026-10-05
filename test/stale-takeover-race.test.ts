import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDir } from './helpers.ts';

// Deterministic interleaving for WR-01. A statSync hook, fired right after a stat of the lock path
// returns, lets the test run another process's steps at an exact point inside appendEntry. Only
// src/storage.ts sees the wrapper; with no hook installed it is a pass-through.
const hook = vi.hoisted(() => ({
  onLockStat: null as null | ((n: number) => void),
  lockStats: 0,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      const result = actual.statSync(...args);
      if (hook.onLockStat && String(args[0]).endsWith('.lock')) {
        hook.lockStats++;
        hook.onLockStat(hook.lockStats);
      }
      return result;
    },
  };
});

const { appendEntry, dayLockPath } = await import('../src/storage.ts');
const { utimesSync, writeFileSync } = await import('node:fs');

const D = '2026-10-04';
const HEADING = '# 2026-10-04\n\n';
const WAITER = '- 09:05 waiter\n';
const HOLDER = '- 09:00 holder\n';

beforeEach(() => {
  hook.onLockStat = null;
  hook.lockStats = 0;
});

describe('stale-lock takeover is mutually exclusive (WR-01)', () => {
  it('a waiter that saw a stale lock does not remove or write past a live takeover holder', () => {
    const dir = tempDir();
    const file = join(dir, `${D}.md`);
    const lock = dayLockPath(dir, D);
    // Killed `til`: 0-byte day file plus a stale lock.
    writeFileSync(file, Buffer.alloc(0));
    mkdirSync(lock);
    const past = new Date(Date.now() - 60000);
    utimesSync(lock, past, past);

    let holderDone = false;
    let lockAliveAtHolderFinish = false;
    const finishHolder = (): void => {
      // The holder already decided the heading from a 0-byte file; now it writes and releases.
      lockAliveAtHolderFinish = existsSync(lock);
      appendFileSync(file, HEADING + HOLDER);
      if (lockAliveAtHolderFinish) rmdirSync(lock);
      holderDone = true;
    };

    hook.onLockStat = (n) => {
      if (n === 1) {
        // Right after the waiter's first look at the (still stale) lock, another process takes it
        // over: it clears the stale lock and creates its own fresh one.
        rmdirSync(lock);
        mkdirSync(lock);
      } else if (n >= 4 && !holderDone) {
        // The holder finishes while the waiter is waiting on the fresh lock.
        finishHolder();
      }
    };

    appendEntry(dir, D, WAITER);
    hook.onLockStat = null;
    // If the waiter wrote without waiting (old behavior), the holder is still mid-write here.
    if (!holderDone) finishHolder();

    expect(lockAliveAtHolderFinish).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text.split('\n').filter((l) => l.startsWith('# '))).toHaveLength(1);
    expect(text).toBe(HEADING + HOLDER + WAITER);
    expect(existsSync(lock)).toBe(false);
  });
});
