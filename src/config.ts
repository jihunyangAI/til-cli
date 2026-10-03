import { join, resolve } from 'node:path';

export function resolveDir(
  env: Record<string, string | undefined>,
  home: string,
  cwd: string,
): string {
  const raw = env.TIL_DIR;
  if (raw === undefined || raw.trim() === '') return join(home, 'til');
  if (raw === '~') return home;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2));
  return resolve(cwd, raw);
}
