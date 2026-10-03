import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, tempDir } from './helpers.ts';

describe('til add (spawned binary)', () => {
  it('records Korean and confirms with path', () => {
    const dir = tempDir();
    const r = runCli(['한글', '😀', 'first'], { TIL_DIR: dir });
    expect(r.code).toBe(0);
    const names = readdirSync(dir);
    expect(names).toHaveLength(1);
    const name = names[0]!;
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
    const buf = readFileSync(join(dir, name));
    const text = buf.toString('utf8');
    const m = text.match(/^# (\d{4}-\d{2}-\d{2})\n\n- (([01]\d|2[0-3]):[0-5]\d) 한글 😀 first\n$/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(name.slice(0, -3));
    expect(buf[0]).toBe(0x23);
    expect(buf.includes(0x0d)).toBe(false);
    expect(buf.includes(Buffer.from('한글 😀 first', 'utf8'))).toBe(true);
    const entry = text.split('\n')[2]!;
    expect(r.stdout).toBe('Saved: ' + entry + '\nFile: ' + join(dir, name) + '\n');
  });

  it('second entry appends below', () => {
    const dir = tempDir();
    expect(runCli(['first'], { TIL_DIR: dir }).code).toBe(0);
    const name = readdirSync(dir)[0]!;
    const before = readFileSync(join(dir, name));
    expect(runCli(['second'], { TIL_DIR: dir }).code).toBe(0);
    const after = readFileSync(join(dir, name));
    expect(after.subarray(0, before.length).equals(before)).toBe(true);
    expect(after.toString('utf8').slice(before.toString('utf8').length)).toMatch(
      /^- \d\d:\d\d second\n$/,
    );
  });

  it('default directory is ~/til', () => {
    const home = tempDir();
    const r = runCli(['home', 'entry'], { TIL_DIR: undefined, HOME: home, USERPROFILE: home });
    expect(r.code).toBe(0);
    const files = readdirSync(join(home, 'til')).filter((f) => f.endsWith('.md'));
    expect(files).toHaveLength(1);
  });

  it('empty text exits 2 and creates nothing', () => {
    const base = tempDir();
    const store = join(base, 'store');
    const r = runCli([''], { TIL_DIR: store });
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(existsSync(store)).toBe(false);
  });

  it('failed write keeps the text', () => {
    const base = tempDir();
    const f = join(base, 'f');
    writeFileSync(f, 'not a directory');
    const r = runCli(['한글', '😀'], { TIL_DIR: f });
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('Unsaved: - ');
    expect(r.stderr).toContain('한글 😀');
  });
});
