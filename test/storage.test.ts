import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { appendEntry, dayLockPath } from '../src/storage.ts';
import { tempDir } from './helpers.ts';

const D = '2026-10-04';
const L = '- 09:05 x\n';
const HEADING = '# 2026-10-04\n\n';
const LF = Buffer.from('\n');

function seed(content: Buffer): { dir: string; file: string } {
  const dir = tempDir();
  const file = join(dir, `${D}.md`);
  writeFileSync(file, content);
  return { dir, file };
}

describe('appendEntry start-state table', () => {
  it('missing file gets heading + entry', () => {
    const dir = tempDir();
    const file = appendEntry(dir, D, L);
    expect(readFileSync(file)).toEqual(Buffer.from(HEADING + L, 'utf8'));
    expect(readdirSync(dir)).toEqual([`${D}.md`]);
  });

  it('0-byte file gets heading + entry (STOR-01)', () => {
    const { dir, file } = seed(Buffer.alloc(0));
    appendEntry(dir, D, L);
    expect(readFileSync(file)).toEqual(Buffer.from(HEADING + L, 'utf8'));
    expect(readdirSync(dir)).toEqual([`${D}.md`]);
  });

  it('file ending in LF gets the entry only', () => {
    const old = Buffer.from(HEADING + '- 08:00 a\n', 'utf8');
    const { dir, file } = seed(old);
    appendEntry(dir, D, L);
    expect(readFileSync(file)).toEqual(Buffer.concat([old, Buffer.from(L)]));
  });

  it('file without a final LF gets a LF prefix (STOR-03)', () => {
    const old = Buffer.from(HEADING + '- 08:00 a', 'utf8');
    const { dir, file } = seed(old);
    appendEntry(dir, D, L);
    expect(readFileSync(file)).toEqual(Buffer.concat([old, LF, Buffer.from(L)]));
  });

  it('file ending in CR LF gets the entry only and CR bytes stay untouched', () => {
    const old = Buffer.from(HEADING.replace(/\n/g, '\r\n') + '- 08:00 a\r\n', 'utf8');
    const { dir, file } = seed(old);
    appendEntry(dir, D, L);
    const after = readFileSync(file);
    expect(after).toEqual(Buffer.concat([old, Buffer.from(L)]));
    expect(after.subarray(0, old.length).equals(old)).toBe(true);
  });

  it('file ending in a lone CR gets a LF prefix', () => {
    const old = Buffer.from(HEADING + '- 08:00 a\r', 'utf8');
    const { dir, file } = seed(old);
    appendEntry(dir, D, L);
    expect(readFileSync(file)).toEqual(Buffer.concat([old, LF, Buffer.from(L)]));
  });

  it('file starting with a BOM from another editor is left untouched', () => {
    const old = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(HEADING + '- a\n', 'utf8'),
    ]);
    const { dir, file } = seed(old);
    appendEntry(dir, D, L);
    const after = readFileSync(file);
    expect(after).toEqual(Buffer.concat([old, Buffer.from(L)]));
    expect(after.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  const rows: Array<[string, Buffer]> = [
    ['no final LF', Buffer.from(HEADING + '- 08:00 a', 'utf8')],
    ['lone CR', Buffer.from(HEADING + '- 08:00 a\r', 'utf8')],
    ['CR LF', Buffer.from('# x\r\n\r\n- a\r\n', 'utf8')],
    ['ends LF', Buffer.from(HEADING + '- a\n', 'utf8')],
    ['0-byte', Buffer.alloc(0)],
  ];
  for (const [name, old] of rows) {
    it(`old bytes are an exact prefix and the new tail has no BOM or CR (${name})`, () => {
      const { dir, file } = seed(old);
      appendEntry(dir, D, L);
      const after = readFileSync(file);
      expect(after.subarray(0, old.length).equals(old)).toBe(true);
      const tail = after.subarray(old.length);
      expect(tail.includes(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      expect(tail.includes(0x0d)).toBe(false);
    });
  }
});

describe('appendEntry ordering and paths', () => {
  it('three sequential appends keep call order', () => {
    const dir = tempDir();
    appendEntry(dir, D, '- 01:00 one\n');
    appendEntry(dir, D, '- 02:00 two\n');
    const file = appendEntry(dir, D, '- 03:00 three\n');
    expect(readFileSync(file, 'utf8')).toBe(
      HEADING + '- 01:00 one\n- 02:00 two\n- 03:00 three\n',
    );
  });

  it('creates a nonexistent nested dir and returns an absolute path', () => {
    const dir = join(tempDir(), 'a', 'b');
    const file = appendEntry(dir, D, L);
    expect(file).toBe(join(dir, '2026-10-04.md'));
    expect(isAbsolute(file)).toBe(true);
    expect(existsSync(file)).toBe(true);
  });

  it('throws when a directory sits where the day file should be, and leaves it', () => {
    const dir = tempDir();
    const collision = join(dir, `${D}.md`);
    mkdirSync(collision);
    expect(() => appendEntry(dir, D, L)).toThrow();
    expect(statSync(collision).isDirectory()).toBe(true);
    expect(readdirSync(dir)).toEqual([`${D}.md`]);
  });
});

describe('per-day lock (G-01-2)', () => {
  it('dayLockPath is a dot-prefixed sibling of the day file', () => {
    expect(dayLockPath('x', D)).toBe(join('x', `.${D}.md.lock`));
  });

  it('a writer that finds a 0-byte file under a held lock waits and appends below the holder heading', async () => {
    const dir = tempDir();
    const file = join(dir, `${D}.md`);
    const lock = dayLockPath(dir, D);
    // State of a creator between its create and its write: lock held, day file at 0 bytes.
    mkdirSync(lock);
    writeFileSync(file, Buffer.alloc(0));
    const source = [
      "const { appendFileSync, rmdirSync } = require('node:fs');",
      "const { workerData } = require('node:worker_threads');",
      'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);',
      'appendFileSync(workerData.file, workerData.content);',
      'rmdirSync(workerData.lock);',
    ].join('\n');
    const holder = HEADING + '- 09:00 creator\n';
    const worker = new Worker(source, {
      eval: true,
      workerData: { file, lock, content: holder },
    });
    appendEntry(dir, D, L);
    const [code] = (await once(worker, 'exit')) as [number];
    expect(code).toBe(0);
    expect(readFileSync(file)).toEqual(Buffer.from(holder + L, 'utf8'));
    expect(readdirSync(dir)).toEqual([`${D}.md`]);
  });

  function staleLock(dir: string): string {
    const lock = dayLockPath(dir, D);
    mkdirSync(lock);
    const past = new Date(Date.now() - 60000);
    utimesSync(lock, past, past);
    return lock;
  }

  it('a stale lock with a missing file is recovered: entry saved at once, lock removed', () => {
    const dir = tempDir();
    staleLock(dir);
    const t0 = Date.now();
    const file = appendEntry(dir, D, L);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(readFileSync(file)).toEqual(Buffer.from(HEADING + L, 'utf8'));
    expect(readdirSync(dir)).toEqual([`${D}.md`]);
  });

  it('a stale lock with a 0-byte file is recovered: heading + entry, lock removed', () => {
    const { dir, file } = seed(Buffer.alloc(0));
    staleLock(dir);
    const t0 = Date.now();
    appendEntry(dir, D, L);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(readFileSync(file)).toEqual(Buffer.from(HEADING + L, 'utf8'));
    expect(readdirSync(dir)).toEqual([`${D}.md`]);
  });

  it('a fresh foreign lock does not delay or get touched when the day file has content', () => {
    const old = Buffer.from(HEADING + '- 08:00 a\n', 'utf8');
    const { dir, file } = seed(old);
    const lock = dayLockPath(dir, D);
    mkdirSync(lock);
    const t0 = Date.now();
    appendEntry(dir, D, L);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(readFileSync(file)).toEqual(Buffer.concat([old, Buffer.from(L)]));
    expect(statSync(lock).isDirectory()).toBe(true);
  });

  it('a fresh foreign lock and no final LF: LF repair in the same write, lock untouched', () => {
    const old = Buffer.from(HEADING + '- 08:00 a', 'utf8');
    const { dir, file } = seed(old);
    const lock = dayLockPath(dir, D);
    mkdirSync(lock);
    appendEntry(dir, D, L);
    expect(readFileSync(file)).toEqual(Buffer.concat([old, LF, Buffer.from(L)]));
    expect(statSync(lock).isDirectory()).toBe(true);
  });
});
