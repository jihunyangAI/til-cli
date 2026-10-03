import { describe, expect, it } from 'vitest';
import { parseArgv, type Command } from '../src/core/args.ts';

const add = (text: string): Command => ({ kind: 'add', text });
const help: Command = { kind: 'help' };
const version: Command = { kind: 'version' };
const unavailable = (name: 'show' | 'list'): Command => ({ kind: 'unavailable', name });
const usageError = (arg: string): { usageError: string } => ({ usageError: arg });

type Expected = Command | { usageError: string };

const rows: Array<[string[], Expected]> = [
  // help / version (D-04, D-05)
  [[], help],
  [['help'], help],
  [['help', 'me'], help],
  [['--help'], help],
  [['-h'], help],
  [['words', '--help'], help],
  [['--version'], version],
  [['-V'], version],
  [['a', '-V'], version],
  // unavailable show/list (D-03)
  [['show'], unavailable('show')],
  [['show', '2026-10-03'], unavailable('show')],
  [['list'], unavailable('list')],
  [['list', 'x'], unavailable('list')],
  // add escape
  [['add'], add('')],
  [['add', 'show', 'me'], add('show me')],
  [['add', '--', '-x'], add('-x')],
  [['add', '--'], add('')],
  [['add', '-x'], usageError('-x')],
  // -- escape
  [['--'], add('')],
  [['--', '-x'], add('-x')],
  [['--', 'show'], add('show')],
  [['--', 'add', 'foo'], add('add foo')],
  [['--', '--'], add('--')],
  [['words', '--', '--help'], add('words --help')],
  // plain words
  [['some', 'words'], add('some words')],
  [['오늘', '배운', '것'], add('오늘 배운 것')],
  [['c', 'b', 'a'], add('c b a')],
  [['a', '', 'b'], add('a  b')],
  [['I', 'will', 'show', 'you'], add('I will show you')],
  // reserved words are exact, case-sensitive, first-token-only
  [['Show', 'me'], add('Show me')],
  [['SHOW'], add('SHOW')],
  [['show me'], add('show me')],
  // lone dash is text
  [['-'], add('-')],
  // unknown options
  [['-x'], usageError('-x')],
  [['--foo'], usageError('--foo')],
  [['-x is faster'], usageError('-x is faster')],
  [['words', '-x'], usageError('-x')],
];

describe('parseArgv grammar (D-01..D-05, D-23)', () => {
  it.each(rows)('%j', (argv, expected) => {
    const got = parseArgv(argv);
    if ('usageError' in expected) {
      expect(got.kind).toBe('usage-error');
      if (got.kind !== 'usage-error') return;
      expect(got.message).toContain(`unknown option '${expected.usageError}'`);
      expect(got.message).toContain('til -- <text>');
      expect(got.message).toContain("til '--' <text>");
      expect(got.message).toContain('til add <text>');
    } else {
      expect(got).toEqual(expected);
    }
  });
});
