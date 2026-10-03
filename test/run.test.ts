import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/run.ts';
import { at, fakeDeps, tempDir } from './helpers.ts';

function dayFile(dir: string, name = '2026-10-04.md'): string {
  return join(dir, name);
}

describe('run() add path, injected clock', () => {
  let originalTz: string | undefined;
  beforeEach(() => {
    originalTz = process.env.TZ;
  });
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('reads the clock exactly once per add', () => {
    const now = vi.fn(at(2026, 10, 4, 9, 5));
    const { deps } = fakeDeps({ now });
    expect(run(['hello'], deps)).toBe(0);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('a midnight straddle cannot split an entry', () => {
    const dir = join(tempDir(), 'store');
    const first = at(2026, 10, 4, 23, 59, 59, 999);
    const later = at(2026, 10, 5, 0, 0, 0, 0);
    const now = vi.fn<() => Date>().mockImplementationOnce(first).mockImplementation(later);
    const { deps } = fakeDeps({ now, env: { TIL_DIR: dir } });
    expect(run(['late'], deps)).toBe(0);
    expect(readFileSync(dayFile(dir), 'utf8').endsWith('- 23:59 late\n')).toBe(true);
    expect(existsSync(dayFile(dir, '2026-10-05.md'))).toBe(false);
  });

  it('00:00 belongs to the new day', () => {
    const dir = join(tempDir(), 'store');
    const { deps } = fakeDeps({ now: at(2026, 10, 5, 0, 0), env: { TIL_DIR: dir } });
    expect(run(['zero'], deps)).toBe(0);
    expect(readFileSync(dayFile(dir, '2026-10-05.md'), 'utf8')).toBe(
      '# 2026-10-05\n\n- 00:00 zero\n',
    );
  });

  it('00:30 and 01:30 land in that local date', () => {
    for (const [h, mi] of [
      [0, 30],
      [1, 30],
    ] as const) {
      const dir = join(tempDir(), 'store');
      const { deps } = fakeDeps({ now: at(2026, 10, 4, h, mi), env: { TIL_DIR: dir } });
      expect(run(['night'], deps)).toBe(0);
      const text = readFileSync(dayFile(dir), 'utf8');
      expect(text).toContain(`- 0${h}:30 night\n`);
    }
  });

  it('TZ cross-check: 2026-10-03T16:30Z is recorded in 2026-10-04.md as 01:30 under Asia/Seoul', () => {
    process.env.TZ = 'Asia/Seoul';
    const dir = join(tempDir(), 'store');
    const { deps } = fakeDeps({
      now: () => new Date(Date.UTC(2026, 9, 3, 16, 30)),
      env: { TIL_DIR: dir },
    });
    expect(run(['kst'], deps)).toBe(0);
    expect(readdirSync(dir)).toEqual(['2026-10-04.md']);
    expect(readFileSync(dayFile(dir), 'utf8')).toBe('# 2026-10-04\n\n- 01:30 kst\n');
  });

  it('with TZ deleted, the host local date components name the file', () => {
    delete process.env.TZ;
    const dir = join(tempDir(), 'store');
    const { deps } = fakeDeps({ now: at(2026, 10, 4, 1, 30), env: { TIL_DIR: dir } });
    expect(run(['host'], deps)).toBe(0);
    expect(readdirSync(dir)).toEqual(['2026-10-04.md']);
  });

  it('writes exact UTF-8 bytes: LF only, no BOM', () => {
    const dir = join(tempDir(), 'store');
    const { deps } = fakeDeps({ now: at(2026, 10, 4, 1, 30), env: { TIL_DIR: dir } });
    expect(run(['한글', '😀', 'first'], deps)).toBe(0);
    expect(readFileSync(dayFile(dir))).toEqual(
      Buffer.from('# 2026-10-04\n\n- 01:30 한글 😀 first\n', 'utf8'),
    );
  });

  it('collapses multi-line input into one list item', () => {
    const dir = join(tempDir(), 'store');
    const { deps } = fakeDeps({ env: { TIL_DIR: dir } });
    expect(run(['a\r\n\r\nb\t c'], deps)).toBe(0);
    expect(readFileSync(dayFile(dir), 'utf8')).toBe('# 2026-10-04\n\n- 09:05 a b c\n');
  });

  it('U+3000 / U+00A0 collapse, U+200B and Markdown characters stay verbatim', () => {
    const dir = join(tempDir(), 'store');
    const { deps } = fakeDeps({ env: { TIL_DIR: dir } });
    expect(run(['a　b c', '​', '# *x* `y` $5'], deps)).toBe(0);
    expect(readFileSync(dayFile(dir), 'utf8')).toBe(
      '# 2026-10-04\n\n- 09:05 a b c ​ # *x* `y` $5\n',
    );
  });

  it('Saved: equals the stored entry line and File: is the day file path', () => {
    const dir = join(tempDir(), 'store');
    const { deps, out, err } = fakeDeps({ env: { TIL_DIR: dir } });
    expect(run(['한글'], deps)).toBe(0);
    expect(err).toEqual([]);
    expect(out.join('')).toBe(`Saved: - 09:05 한글\nFile: ${join(dir, '2026-10-04.md')}\n`);
  });
});

describe('run() write failures (D-12)', () => {
  it('TIL_DIR is an existing regular file: exit 1, empty stdout, Unsaved on stderr, nothing created', () => {
    const base = tempDir();
    const f = join(base, 'f');
    writeFileSync(f, 'not a directory');
    const { deps, out, err } = fakeDeps({ env: { TIL_DIR: f } });
    expect(run(['한글', '😀'], deps)).toBe(1);
    expect(out).toEqual([]);
    const e = err.join('');
    expect(e).toContain('could not save entry');
    expect(e).toContain('Unsaved: - 09:05 한글 😀');
    expect(readdirSync(base)).toEqual(['f']);
  });

  it('a directory where the day file should be: exit 1 with Unsaved and empty stdout', () => {
    const dir = join(tempDir(), 'store');
    mkdirSync(join(dir, '2026-10-04.md'), { recursive: true });
    const { deps, out, err } = fakeDeps({ env: { TIL_DIR: dir } });
    expect(run(['한글'], deps)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('')).toContain('Unsaved: - 09:05 한글');
  });

  it('a later run with a valid TIL_DIR writes a normal heading + entry', () => {
    const base = tempDir();
    const f = join(base, 'f');
    writeFileSync(f, 'x');
    const bad = fakeDeps({ env: { TIL_DIR: f } });
    expect(run(['one'], bad.deps)).toBe(1);
    const dir = join(base, 'ok');
    const good = fakeDeps({ env: { TIL_DIR: dir } });
    expect(run(['one'], good.deps)).toBe(0);
    expect(readFileSync(dayFile(dir), 'utf8')).toBe('# 2026-10-04\n\n- 09:05 one\n');
  });

  it('empty text exits 2 with empty stdout and creates nothing', () => {
    const dir = join(tempDir(), 'store');
    const { deps, out } = fakeDeps({ env: { TIL_DIR: dir } });
    expect(run([''], deps)).toBe(2);
    expect(out).toEqual([]);
    expect(existsSync(dir)).toBe(false);
  });
});

describe('run() TIL_DIR resolution (CONF-01/02)', () => {
  it('unset TIL_DIR writes under <home>/til', () => {
    const home = tempDir();
    const { deps } = fakeDeps({ env: {}, homedir: () => home });
    expect(run(['x'], deps)).toBe(0);
    expect(existsSync(join(home, 'til', '2026-10-04.md'))).toBe(true);
  });

  it('relative TIL_DIR resolves against cwd', () => {
    const cwd = tempDir();
    const { deps } = fakeDeps({ env: { TIL_DIR: 'rel/x' }, cwd: () => cwd });
    expect(run(['x'], deps)).toBe(0);
    expect(existsSync(join(cwd, 'rel', 'x', '2026-10-04.md'))).toBe(true);
  });

  it('~/notes expands against the home directory', () => {
    const home = tempDir();
    const { deps } = fakeDeps({ env: { TIL_DIR: '~/notes' }, homedir: () => home });
    expect(run(['x'], deps)).toBe(0);
    expect(existsSync(join(home, 'notes', '2026-10-04.md'))).toBe(true);
  });
});
