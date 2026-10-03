import { isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDir } from '../src/config.ts';
import { tempDir } from './helpers.ts';

const home = resolve(tempDir(), 'home');
const cwd = resolve(tempDir(), 'cwd');

describe('resolveDir (D-13)', () => {
  const rows: Array<[string, Record<string, string | undefined>, string]> = [
    ['unset TIL_DIR -> <home>/til', {}, join(home, 'til')],
    ['empty TIL_DIR -> default', { TIL_DIR: '' }, join(home, 'til')],
    ['blank TIL_DIR -> default', { TIL_DIR: '   ' }, join(home, 'til')],
    ['~ -> home', { TIL_DIR: '~' }, home],
    ['~/notes -> <home>/notes', { TIL_DIR: '~/notes' }, join(home, 'notes')],
    ['~\\notes -> <home>/notes', { TIL_DIR: '~\\notes' }, join(home, 'notes')],
    ['relative -> against cwd', { TIL_DIR: 'rel/dir' }, resolve(cwd, 'rel/dir')],
    ['absolute stays absolute', { TIL_DIR: join(cwd, 'abs') }, resolve(join(cwd, 'abs'))],
    ['~user is not expanded', { TIL_DIR: '~user' }, resolve(cwd, '~user')],
  ];

  for (const [name, env, expected] of rows) {
    it(name, () => {
      const got = resolveDir(env, home, cwd);
      expect(got).toBe(expected);
      expect(isAbsolute(got)).toBe(true);
    });
  }

  it.runIf(process.platform === 'win32')('forward-slash drive path is normalized on win32', () => {
    const got = resolveDir({ TIL_DIR: 'C:/tmp/x' }, home, cwd);
    expect(got).toBe('C:\\tmp\\x');
    expect(isAbsolute(got)).toBe(true);
  });
});
