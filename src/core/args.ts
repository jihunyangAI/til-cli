export type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'add'; text: string }
  | { kind: 'unavailable'; name: 'show' | 'list' }
  | { kind: 'usage-error'; message: string };

function usageError(arg: string): Command {
  return {
    kind: 'usage-error',
    message:
      `unknown option '${arg}'\n` +
      `To record text that starts with '-': til -- <text>   (PowerShell: til '--' <text>)\n` +
      `To record text that starts with a command word: til add <text>`,
  };
}

// Walks arguments in order. `--` ends option scanning and the rest is text verbatim (D-02).
// Any other argument longer than one character that starts with `-` is an option (D-05, D-23),
// even when it contains spaces. A lone `-` is text.
function collectText(args: readonly string[]): Command {
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') {
      words.push(...args.slice(i + 1));
      break;
    }
    if (arg.length > 1 && arg.startsWith('-')) {
      if (arg === '-h' || arg === '--help') return { kind: 'help' };
      if (arg === '-V' || arg === '--version') return { kind: 'version' };
      return usageError(arg);
    }
    words.push(arg);
  }
  return { kind: 'add', text: words.join(' ') };
}

// Pure grammar (D-01..D-05): reserved words act only as the exact, case-sensitive first argument.
export function parseArgv(argv: readonly string[]): Command {
  if (argv.length === 0) return { kind: 'help' };
  switch (argv[0]) {
    case 'help':
      return { kind: 'help' };
    case 'show':
      return { kind: 'unavailable', name: 'show' };
    case 'list':
      return { kind: 'unavailable', name: 'list' };
    case 'add':
      return collectText(argv.slice(1));
    default:
      return collectText(argv);
  }
}
