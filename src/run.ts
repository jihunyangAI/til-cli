import { homedir } from 'node:os';
import pkg from '../package.json' with { type: 'json' };
import { parseArgv } from './core/args.ts';
import { entryLine, localDate, localTime, normalizeText } from './core/format.ts';
import { resolveDir } from './config.ts';
import { appendEntry } from './storage.ts';

export interface Deps {
  now: () => Date;
  env: Record<string, string | undefined>;
  homedir: () => string;
  cwd: () => string;
  out: (s: string) => void;
  err: (s: string) => void;
}

export const USAGE = `Usage: til <text...>         record one line in today's file
       til add <text...>     record text that starts with a command word
       til -- <text...>      record text that starts with '-'
                             (PowerShell: til '--' <text...>)
       til --help | -h       show this help
       til --version | -V    show the version

Reserved first words: add, show, list, help
Entries go to ~/til/YYYY-MM-DD.md (set TIL_DIR to use another directory).
`;

export function realDeps(): Deps {
  return {
    now: () => new Date(),
    env: process.env,
    homedir,
    cwd: () => process.cwd(),
    out: (s) => {
      process.stdout.write(s);
    },
    err: (s) => {
      process.stderr.write(s);
    },
  };
}

export function run(argv: readonly string[], deps: Deps): number {
  const cmd = parseArgv(argv);
  switch (cmd.kind) {
    case 'add': {
      const text = normalizeText(cmd.text);
      if (text === '') {
        deps.err('til: nothing to save: text is empty\n');
        return 2;
      }
      const now = deps.now();
      const date = localDate(now);
      const line = entryLine(localTime(now), text);
      try {
        const file = appendEntry(resolveDir(deps.env, deps.homedir(), deps.cwd()), date, line);
        deps.out('Saved: ' + line.trimEnd() + '\n' + 'File: ' + file + '\n');
        return 0;
      } catch (e) {
        deps.err(
          'til: could not save entry: ' +
            (e as Error).message +
            '\n' +
            'Unsaved: ' +
            line.trimEnd() +
            '\n',
        );
        return 1;
      }
    }
    case 'help':
      deps.out(USAGE);
      return 0;
    case 'version':
      deps.out(pkg.version + '\n');
      return 0;
    case 'unavailable':
      deps.err("til: '" + cmd.name + "' is not available yet\n");
      return 2;
    case 'usage-error':
      deps.err('til: ' + cmd.message + '\n');
      return 2;
    default: {
      const unreachable: never = cmd;
      return unreachable;
    }
  }
}
