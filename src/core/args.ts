export type Command = { kind: 'add'; text: string };

export function parseArgv(argv: readonly string[]): Command {
  return { kind: 'add', text: argv.join(' ') };
}
