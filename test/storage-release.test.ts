import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDir } from './helpers.ts';

// Fault injection for releaseLock (WR-03): rmdirSync fails with a chosen errno a chosen number of
// times, then behaves normally. Only src/storage.ts sees the wrapper.
const fault = vi.hoisted(() => ({ code: 'EACCES', failures: 0, calls: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    rmdirSync: (...args: Parameters<typeof actual.rmdirSync>) => {
      fault.calls++;
      if (fault.failures > 0) {
        fault.failures--;
        throw Object.assign(new Error(`${fault.code}: injected`), { code: fault.code });
      }
      return actual.rmdirSync(...args);
    },
  };
});

const { appendEntry, dayLockPath } = await import('../src/storage.ts');

const D = '2026-10-04';
const L = '- 09:05 x\n';

beforeEach(() => {
  fault.code = 'EACCES';
  fault.failures = 0;
  fault.calls = 0;
});

describe('releaseLock retry (WR-03)', () => {
  for (const code of ['EBUSY', 'EPERM', 'EACCES']) {
    it(`retries ${code} past the old 10-attempt budget and removes the lock`, () => {
      const dir = tempDir();
      fault.code = code;
      // 11 failures: past the old 10-attempt budget, but well inside the 500 ms time budget even
      // with ~15.6 ms Windows timer granularity under load (25 failures could exceed it).
      fault.failures = 11;
      const file = appendEntry(dir, D, L);
      expect(fault.calls).toBe(12);
      expect(readFileSync(file, 'utf8')).toBe('# 2026-10-04\n\n' + L);
      expect(existsSync(dayLockPath(dir, D))).toBe(false);
      expect(readdirSync(dir)).toEqual([`${D}.md`]);
    });
  }

  it('never throws when the retry budget runs out, and the entry stays saved', () => {
    const dir = tempDir();
    fault.failures = Number.MAX_SAFE_INTEGER;
    const t0 = Date.now();
    const file = appendEntry(dir, D, L);
    const elapsed = Date.now() - t0;
    expect(readFileSync(file, 'utf8')).toBe('# 2026-10-04\n\n' + L);
    // Bounded by time (about 500 ms), not by attempt count.
    expect(elapsed).toBeGreaterThanOrEqual(400);
    expect(elapsed).toBeLessThan(5000);
    // The lock directory is left behind as litter, never reported as a save failure.
    expect(existsSync(join(dir, `.${D}.md.lock`))).toBe(true);
  });

  it('does not retry a non-transient errno', () => {
    const dir = tempDir();
    fault.code = 'ENOENT';
    fault.failures = 1;
    appendEntry(dir, D, L);
    expect(fault.calls).toBe(1);
  });
});
