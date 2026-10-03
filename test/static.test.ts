import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI } from './helpers.ts';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listTs(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = listTs(SRC).map((p) => ({
  rel: relative(ROOT, p).replace(/\\/g, '/'),
  lines: readFileSync(p, 'utf8').split('\n'),
}));

const BANNED: Array<[string, RegExp]> = [
  ['platform line-ending constant (D-22)', /\bEOL\b/],
  ['whole-file write API (append-only, D-10)', /writeFile/],
  ['ISO-string date slicing (UTC trap, D-21)', /toISOString/],
  ['locale formatter (D-22)', /toLocale/],
  ['UTC getter (D-21)', /getUTC/],
  ['process.exit (D-14)', /process\.exit\(/],
  ['truncating or non-append open flag (D-10)', /['"]w\+?['"]/],
  ['exclusive write open flag (D-10)', /['"]wx\+?['"]/],
  ['temp/lock/rename file writes (D-10, privacy)', /rename|tmpdir|mkdtemp|\.lock\b/],
  ['console output outside Deps (D-14)', /console\./],
  [
    'network or process-spawn module (privacy, T-01-02)',
    /(from|import\()\s*['"](node:)?(http|https|net|dgram|tls|child_process)['"]/,
  ],
  ['network call (privacy)', /fetch\(|WebSocket/],
  ['environment-modifying command (safety)', /chcp|setx|ExecutionPolicy|reg add|git config/i],
  ['third-party CLI parser (zero dependencies)', /commander/],
];

describe('banned APIs in src/', () => {
  it('scans at least the known source files', () => {
    const names = files.map((f) => f.rel);
    expect(names).toEqual(
      expect.arrayContaining([
        'src/cli.ts',
        'src/run.ts',
        'src/config.ts',
        'src/storage.ts',
        'src/core/format.ts',
        'src/core/args.ts',
      ]),
    );
  });

  for (const [why, re] of BANNED) {
    it(`no match: ${why}`, () => {
      const hits: string[] = [];
      for (const f of files) {
        f.lines.forEach((line, i) => {
          if (re.test(line)) hits.push(`${f.rel}:${i + 1}: ${line.trim()}`);
        });
      }
      expect(hits).toEqual([]);
    });
  }
});

describe('module boundaries', () => {
  it('only src/storage.ts imports node:fs', () => {
    const importers = files
      .filter((f) => f.lines.some((l) => /['"](node:)?fs(\/[a-z]+)?['"]/.test(l)))
      .map((f) => f.rel);
    expect(importers).toEqual(['src/storage.ts']);
  });

  it('files under src/core/ import nothing from node:', () => {
    const hits: string[] = [];
    for (const f of files.filter((x) => x.rel.startsWith('src/core/'))) {
      f.lines.forEach((l, i) => {
        if (/['"]node:/.test(l)) hits.push(`${f.rel}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('built bundle and package', () => {
  it('dist/cli.mjs starts with the shebang + LF and has no CR byte (D-20)', () => {
    const buf = readFileSync(CLI);
    expect(buf.subarray(0, 20).toString('latin1')).toBe('#!/usr/bin/env node\n');
    expect(buf.includes(0x0d)).toBe(false);
  });

  it('package.json has no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect('dependencies' in pkg).toBe(false);
  });
});
