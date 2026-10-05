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
const LOCK_RELEASE_BUDGET_MS = 500;

function writeAll(fd: number, buf: Buffer): void {
  let off = 0;
  while (off < buf.length) {
    off += writeSync(fd, buf, off, buf.length - off);
  }
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// mtime of the lock directory, or null when it cannot be read (it was just released, or stat fails).
function lockMtimeMs(lock: string): number | null {
  try {
    return statSync(lock).mtimeMs;
  } catch {
    return null;
  }
}

// Non-recursive rmdirSync only deletes an empty directory, so user content at the lock path is
// never removed. Windows reports a directory held by an antivirus scan, an indexer or a pending
// delete as EBUSY, EPERM or EACCES, so those are retried within a time budget (a count budget is
// too small when the CPU is starved). Never throws: the entry is already on disk, and a reported
// failure would make the user re-run and duplicate it.
function releaseLock(lock: string): void {
  const giveUpAt = Date.now() + LOCK_RELEASE_BUDGET_MS;
  for (;;) {
    try {
      rmdirSync(lock);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') return;
      if (Date.now() >= giveUpAt) return;
      sleepMs(LOCK_RETRY_MS);
    }
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
// (lock directory not creatable, lock cannot be cleared). Writers outside the lock write only
// after they see a size above 0, and append-only keeps that true (D-10, D-11).
//
// A stale lock (at least LOCK_STALE_MS old) or one that has blocked this writer for twice that is
// never used as permission to write. It is removed and the loop goes back to mkdirSync, which
// picks exactly one winner among all contenders. A lock is removed only if its mtime still equals
// the one this writer waited on, so a fresh lock that another taker just made is left alone. The
// residual window is the stat-to-rmdir gap of a taker that stalls there while a rival completes
// remove-and-create; the day file is non-empty after the first write, which closes it from then on.
export function appendEntry(dir: string, date: string, line: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, dayFileName(date));
  const lock = dayLockPath(dir, date);
  let waitedOn: number | null = null;
  let deadline = Date.now() + 2 * LOCK_STALE_MS;
  for (;;) {
    if (appendIfNonEmpty(file, line)) return file;
    try {
      mkdirSync(lock);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        appendFirst(file, date, line);
        return file;
      }
      const mtime = lockMtimeMs(lock);
      if (mtime !== null && mtime !== waitedOn) {
        // A different lock instance: its holder is making progress, so restart the wait guard.
        waitedOn = mtime;
        deadline = Date.now() + 2 * LOCK_STALE_MS;
      }
      const expired = Date.now() >= deadline;
      if (mtime === null) {
        if (expired) {
          // The lock can neither be read nor created: documented best effort. It is not ours, so
          // it is not released.
          appendFirst(file, date, line);
          return file;
        }
        sleepMs(LOCK_RETRY_MS);
        continue;
      }
      if (Date.now() - mtime < LOCK_STALE_MS && !expired) {
        sleepMs(LOCK_RETRY_MS);
        continue;
      }
      if (lockMtimeMs(lock) === mtime) {
        try {
          rmdirSync(lock);
        } catch (err) {
          // ENOENT with the path still present means it is not a directory we can remove.
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || lockMtimeMs(lock) !== null) {
            // Not an empty directory we may remove (user content, permissions): documented best
            // effort. The lock is not ours, so it is left alone.
            appendFirst(file, date, line);
            return file;
          }
        }
      }
      continue;
    }
    try {
      appendFirst(file, date, line);
    } finally {
      releaseLock(lock);
    }
    return file;
  }
}
