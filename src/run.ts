import { homedir } from 'node:os';
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
  }
}
