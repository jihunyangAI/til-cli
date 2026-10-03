import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { run } from '../src/run.ts';
import { fakeDeps, runCli, tempDir } from './helpers.ts';

function setup(): { store: string; res: ReturnType<typeof fakeDeps> } {
  const store = join(tempDir(), 'store');
  return { store, res: fakeDeps({ env: { TIL_DIR: store } }) };
}

const DAY_FILE = '2026-10-04.md';

describe('run(): help', () => {
  it.each([[[]], [['help']], [['--help']], [['-h']], [['help', 'me']], [['words', '--help']]] as [
    string[],
  ][])('%j prints usage, exits 0, writes nothing', (argv) => {
    const { store, res } = setup();
    expect(run(argv, res.deps)).toBe(0);
    expect(res.out.join('')).toContain('Usage:');
    expect(res.out.join('')).toContain('TIL_DIR');
    expect(res.err).toEqual([]);
    expect(existsSync(store)).toBe(false);
  });
});

describe('run(): version', () => {
  it.each([[['--version']], [['-V']]] as [string[]][])(
    '%j prints package version and LF',
    (argv) => {
      const { store, res } = setup();
      expect(run(argv, res.deps)).toBe(0);
      expect(res.out.join('')).toBe(pkg.version + '\n');
      expect(res.err).toEqual([]);
      expect(existsSync(store)).toBe(false);
    },
  );
});

describe('run(): unavailable show/list', () => {
  it.each([
    [['show'], 'show'],
    [['show', '2026-10-03'], 'show'],
    [['list'], 'list'],
  ] as [string[], string][])('%j exits 2 with not available yet', (argv, name) => {
    const { store, res } = setup();
    expect(run(argv, res.deps)).toBe(2);
    const err = res.err.join('');
    expect(err).toContain('not available yet');
    expect(err).toContain(name);
    expect(res.out).toEqual([]);
    expect(existsSync(store)).toBe(false);
  });
});

describe('run(): usage errors', () => {
  it.each([
    [['-x']],
    [['--foo']],
    [['-x is faster']],
    [['add', '-x']],
    [['words', '-x']],
  ] as [string[]][])('%j exits 2 with the escape hints', (argv) => {
    const { store, res } = setup();
    expect(run(argv, res.deps)).toBe(2);
    const err = res.err.join('');
    expect(err.startsWith("til: unknown option '")).toBe(true);
    expect(err).toContain('til -- <text>');
    expect(err).toContain("til '--' <text>");
    expect(err).toContain('til add <text>');
    expect(res.out).toEqual([]);
    expect(existsSync(store)).toBe(false);
  });
});

describe('run(): empty text', () => {
  it.each([
    [['']],
    [['   ']],
    [['add']],
    [['--']],
    [['add', '--']],
    [['\r\n\t']],
    [['\u3000\u00a0']],
  ] as [string[]][])('%j exits 2 with nothing to save', (argv) => {
    const { store, res } = setup();
    expect(run(argv, res.deps)).toBe(2);
    expect(res.err.join('')).toContain('nothing to save');
    expect(res.out).toEqual([]);
    expect(existsSync(store)).toBe(false);
  });
});

describe('run(): recorded text', () => {
  it.each([
    [['--', '-text'], '-text'],
    [['add', 'show', 'me'], 'show me'],
    [['--', 'show'], 'show'],
    [['I', 'will', 'show', 'you'], 'I will show you'],
    [['a', '', 'b'], 'a b'],
    [['c', 'b', 'a'], 'c b a'],
    [['x'], 'x'],
    [['\u200b'], '\u200b'],
  ] as [string[], string][])('%j records %j', (argv, text) => {
    const { store, res } = setup();
    expect(run(argv, res.deps)).toBe(0);
    expect(readdirSync(store)).toEqual([DAY_FILE]);
    const body = readFileSync(join(store, DAY_FILE), 'utf8');
    expect(body.endsWith('- 09:05 ' + text + '\n')).toBe(true);
  });
});

describe('built binary (spawned)', () => {
  it('--version prints 0.1.0', () => {
    const r = runCli(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('0.1.0\n');
  });

  it.each([[['--help']], [[]]] as [string[]][])('%j prints usage', (argv) => {
    const r = runCli(argv);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });

  it('-- -text records the text', () => {
    const dir = tempDir();
    const r = runCli(['--', '-text'], { TIL_DIR: dir });
    expect(r.code).toBe(0);
    const name = readdirSync(dir)[0]!;
    expect(readFileSync(join(dir, name), 'utf8')).toMatch(/^- \d\d:\d\d -text$/m);
  });

  it('show exits 2', () => {
    expect(runCli(['show']).code).toBe(2);
  });

  it('-x exits 2 with the PowerShell-safe hint and writes nothing', () => {
    const store = join(tempDir(), 'store');
    const r = runCli(['-x'], { TIL_DIR: store });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("til '--' <text>");
    expect(existsSync(store)).toBe(false);
  });
});
