import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmdirSync,
  statSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { dayFileName, dayHeading } from './core/format.ts';

const LOCK_STALE_MS = 10000;
const LOCK_RETRY_MS = 5;

function writeAll(fd: number, buf: Buffer): void {
  let off = 0;
  while (off < buf.length) {
    off += writeSync(fd, buf, off, buf.length - off);
  }
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockAgeMs(lock: string): number {
  try {
    return Date.now() - statSync(lock).mtimeMs;
  } catch {
    // ENOENT means the holder just released; treat as fresh and let the next pass re-check.
    return 0;
  }
}

export function dayLockPath(dir: string, date: string): string {
  return join(dir, '.' + dayFileName(date) + '.lock');
}

// One O_APPEND write for a non-empty file: LF repair (D-10) plus the entry.
function appendTail(fd: number, size: number, line: string): void {
  const last = Buffer.alloc(1);
  readSync(fd, last, 0, 1, size - 1);
  const prefix = last[0] !== 0x0a ? '\n' : '';
  writeAll(fd, Buffer.from(prefix + line, 'utf8'));
}

function appendExisting(file: string, date: string, line: string): void {
  const fd = openSync(file, 'a+');
  try {
    const { size } = fstatSync(fd);
    if (size === 0) {
      writeAll(fd, Buffer.from(dayHeading(date) + line, 'utf8'));
    } else {
      appendTail(fd, size, line);
    }
  } finally {
    closeSync(fd);
  }
}

// Lock-free path: appends only when the day file already has content. A missing file
// (ENOENT) or a 0-byte file means the heading decision is still open, so report false.
function appendIfNonEmpty(file: string, line: string): boolean {
  let fd: number;
  try {
    fd = openSync(file, constants.O_RDWR | constants.O_APPEND);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
  try {
    const { size } = fstatSync(fd);
    if (size === 0) return false;
    appendTail(fd, size, line);
    return true;
  } finally {
    closeSync(fd);
  }
}

// Create-or-extend with the heading decision: 'ax' create writes heading + entry in one write,
// EEXIST falls back to appendExisting, which writes the heading for a 0-byte file.
function appendFirst(file: string, date: string, line: string): void {
  try {
    const fd = openSync(file, 'ax');
    try {
      writeAll(fd, Buffer.from(dayHeading(date) + line, 'utf8'));
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    appendExisting(file, date, line);
  }
}

// Invariant: every heading write happens in appendFirst, and appendFirst runs only while holding
// the per-day lock (an empty directory made with mkdirSync) or in the two documented fallbacks
// (stale lock / expired guard, lock directory not creatable). Writers outside the lock write only
// after they see a size above 0, and append-only keeps that true (D-10, D-11).
export function appendEntry(dir: string, date: string, line: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, dayFileName(date));
  const lock = dayLockPath(dir, date);
  const deadline = Date.now() + 2 * LOCK_STALE_MS;
  for (;;) {
    if (appendIfNonEmpty(file, line)) return file;
    try {
      mkdirSync(lock);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        appendFirst(file, date, line);
        return file;
      }
      if (lockAgeMs(lock) < LOCK_STALE_MS && Date.now() < deadline) {
        sleepMs(LOCK_RETRY_MS);
        continue;
      }
      appendFirst(file, date, line);
      return file;
    }
    try {
      appendFirst(file, date, line);
    } finally {
      rmdirSync(lock);
    }
    return file;
  }
}
