import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dayFileName,
  dayHeading,
  entryLine,
  localDate,
  localTime,
  normalizeText,
} from '../src/core/format.ts';
import { at } from './helpers.ts';

describe('localDate / localTime', () => {
  it('uses local components, zero-padded', () => {
    expect(localDate(at(2026, 10, 4, 1, 30)())).toBe('2026-10-04');
    expect(localDate(at(2026, 1, 5)())).toBe('2026-01-05');
    expect(localTime(at(2026, 10, 4, 9, 5)())).toBe('09:05');
  });

  it('truncates, never rounds: 23:59:59.999 is 23:59', () => {
    expect(localTime(at(2026, 10, 4, 23, 59, 59, 999)())).toBe('23:59');
    expect(localDate(at(2026, 10, 4, 23, 59, 59, 999)())).toBe('2026-10-04');
  });

  it('00:00:00.000 is 00:00 on the next day', () => {
    expect(localTime(at(2026, 10, 5, 0, 0)())).toBe('00:00');
    expect(localDate(at(2026, 10, 5, 0, 0)())).toBe('2026-10-05');
  });

  it('outputs are always ASCII digit patterns', () => {
    for (const d of [at(2026, 1, 1, 0, 0)(), at(2026, 12, 31, 23, 59)(), at(2026, 10, 4, 13, 7)()]) {
      expect(localDate(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(localTime(d)).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  describe('UTC trap (D-21)', () => {
    let originalTz: string | undefined;
    beforeEach(() => {
      originalTz = process.env.TZ;
    });
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('2026-10-03T16:30Z is 2026-10-04 01:30 in Asia/Seoul', () => {
      process.env.TZ = 'Asia/Seoul';
      const instant = new Date(Date.UTC(2026, 9, 3, 16, 30));
      expect(localDate(instant)).toBe('2026-10-04');
      expect(localTime(instant)).toBe('01:30');
      expect(instant.getUTCDate()).toBe(3);
    });

    it('the same instant is 2026-10-03 09:30 in America/Los_Angeles', () => {
      process.env.TZ = 'America/Los_Angeles';
      const instant = new Date(Date.UTC(2026, 9, 3, 16, 30));
      expect(localDate(instant)).toBe('2026-10-03');
      expect(localTime(instant)).toBe('09:30');
    });
  });
});

describe('normalizeText', () => {
  it('trims and collapses runs of whitespace', () => {
    expect(normalizeText('  a  b  ')).toBe('a b');
  });

  it('collapses CR LF, LF, tabs and spaces to one space', () => {
    expect(normalizeText('a\r\n\r\nb\t c')).toBe('a b c');
  });

  it('collapses U+3000 and U+00A0 but keeps U+200B', () => {
    expect(normalizeText('a　b')).toBe('a b');
    expect(normalizeText('a b')).toBe('a b');
    expect(normalizeText('​')).toBe('​');
  });

  it('does not escape Markdown characters', () => {
    const s = '# not a heading *x* `code` $5';
    expect(normalizeText(s)).toBe(s);
  });

  it('keeps Korean and emoji', () => {
    expect(normalizeText('한글 😀')).toBe('한글 😀');
  });
});

describe('line builders', () => {
  it('entryLine, dayHeading, dayFileName', () => {
    expect(entryLine('09:05', 'x')).toBe('- 09:05 x\n');
    expect(dayHeading('2026-10-04')).toBe('# 2026-10-04\n\n');
    expect(dayFileName('2026-10-04')).toBe('2026-10-04.md');
  });
});
