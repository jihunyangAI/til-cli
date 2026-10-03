import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { dayFileName, dayHeading } from './core/format.ts';

function writeAll(fd: number, buf: Buffer): void {
  let off = 0;
  while (off < buf.length) {
    off += writeSync(fd, buf, off, buf.length - off);
  }
}

function appendExisting(file: string, date: string, line: string): void {
  const fd = openSync(file, 'a+');
  try {
    const { size } = fstatSync(fd);
    let prefix = '';
    if (size === 0) {
      prefix = dayHeading(date);
    } else {
      const last = Buffer.alloc(1);
      readSync(fd, last, 0, 1, size - 1);
      if (last[0] !== 0x0a) prefix = '\n';
    }
    writeAll(fd, Buffer.from(prefix + line, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

export function appendEntry(dir: string, date: string, line: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, dayFileName(date));
  try {
    const fd = openSync(file, 'ax');
    try {
      writeAll(fd, Buffer.from(dayHeading(date) + line, 'utf8'));
    } finally {
      closeSync(fd);
    }
    return file;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    appendExisting(file, date, line);
    return file;
  }
}
