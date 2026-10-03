# Phase 1: Safe Capture - Research

**Researched:** 2026-10-04
**Domain:** Windows-first Node.js CLI that appends one line to a per-day Markdown file (argument grammar, append safety, packaging, test strategy)
**Confidence:** HIGH (every load-bearing claim below was reproduced by a scratch prototype on this machine: Windows 11, Node 24.12.0, npm 11.6.2, PowerShell 5.1, Git Bash, system TZ Asia/Seoul)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Auto mode: every decision below was auto-selected as the recommended option (no user interview). Review before planning if any look wrong.

#### Command Grammar
- **D-01:** Bare words are an add: `til <words...>` joins all positional args with single spaces into one entry. — **Reversibility:** one-way — users build muscle memory on the grammar; changing it later breaks habits and scripts.
- **D-02:** Reserved first tokens are `add`, `show`, `list`, `help`. They are subcommands only when they are the first token. `til add <text>` and `til -- <text>` are the escape hatches for text that starts with a reserved word or `-`. — **Reversibility:** one-way — same muscle-memory contract as D-01; reserving `show`/`list` now avoids a breaking change when Phase 2 (and v2 `list`) arrive.
- **D-03:** In Phase 1, `til show ...` and `til list ...` print a short "not available yet" message to stderr and exit 2 (usage error). Phase 2 replaces `show` with the real implementation.
- **D-04:** Bare `til` with no arguments prints the short usage/help text and exits 0 in Phase 1. Phase 2 may change bare `til` to show today's entries (see Deferred).
- **D-05:** `til --help` / `til help` print usage; `til --version` prints the package version. Unknown flags (anything starting with `-` before `--`) are a usage error (exit 2) whose message suggests `til -- <text>`.

#### Entry Format & Normalization
- **D-06:** Entry line is `- HH:MM <text>` with 24-hour, zero-padded local time (e.g. `- 09:05 ...`), computed from the same single `now` used for the file date. No locale formatting.
- **D-07:** Text normalization: trim, then collapse any run of whitespace including CR/LF/tab into a single space. No Markdown escaping — the text is stored verbatim otherwise (`#`, `*`, backticks, `$` kept as received).
- **D-08:** Empty or whitespace-only text after normalization → error on stderr, exit 2, nothing written, no directory or file created.

#### File Layout & Write Safety
- **D-09:** File name `YYYY-MM-DD.md` (local date). New file content starts with `# YYYY-MM-DD\n\n`. Each entry ends with `\n`. UTF-8 without BOM, LF only, on every OS. — **Reversibility:** one-way — this is the on-disk data contract for the user's archive.
- **D-10:** Write strategy: single append write (`O_APPEND`) containing the full entry; never read-modify-write, never temp-file + rename, never `w` flag. Heading creation uses exclusive create (`wx`); on `EEXIST` fall back to append. If the existing file is non-empty and its last byte is not `\n`, prepend `\n` within the same write.
- **D-11:** If the 20-process stress test shows lost/duplicated lines or duplicate headings on Windows, add a short retry on `EBUSY`/`EPERM` and/or a lock file — the planner should treat the stress test as the gate, not assume `O_APPEND` atomicity.
- **D-12:** On write failure: print an error to stderr that includes the reason and the full unsaved text, exit 1.

#### Storage Location
- **D-13:** Default directory is `~/til` (via `os.homedir()`), created recursively on first write. `TIL_DIR` overrides it; a leading `~` in `TIL_DIR` is expanded; relative `TIL_DIR` is resolved against the current working directory. No `--dir` flag and no config file in v1 (CONF-03 is v2).

#### Confirmation Output
- **D-14:** On success print two plain-ASCII-framed lines to stdout: `Saved: - HH:MM <text>` and `File: <absolute path>`. No emoji/check-mark glyphs (avoid cp949 console issues). The output writer is built so Phase 2 (`til show`, VIEW-04) reuses it for Korean console output.

#### Exit Codes
- **D-15:** `0` success (including help/version), `1` runtime/IO failure, `2` usage error (empty text, unknown flag, unavailable subcommand).

#### Packaging & Install
- **D-16:** Package name `til-cli`, `bin: { "til": "dist/cli.mjs" }`, ESM, Node `>=22.12`. Phase 1 install path is `npm install -g .` from the repo (plus `npm link` for development); no `npm publish`. Add `.gitattributes` forcing LF (shebang safety) and a `files` whitelist including `dist/`.
- **D-17:** Stack per PROJECT.md Key Decisions: TypeScript (typecheck only) + commander 15 + tsdown (pinned) + vitest. `node:util parseArgs` is an acceptable swap for commander if commander's variadic/`--` handling fights D-01/D-02 — planner's call.

### Claude's Discretion
- Internal module layout (functional core / imperative shell suggested in research ARCHITECTURE.md).
- Exact wording of help, error, and "not available yet" messages (keep them short; Korean or English both fine — default English).
- Test file organization and how the injected clock is threaded through.

### Deferred Ideas (OUT OF SCOPE)
- Bare `til` showing today's entries instead of help — revisit in Phase 2 when `show` exists.
- `--no-time` toggle (CAPT-09), stdin capture (CAPT-07), `-d` backfill (CAPT-08), `--dir` flag/config file (CONF-03), day-rollover cutoff (CONF-04) — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAPT-01 | `til "some text"` appends a new entry to today's `YYYY-MM-DD.md` | Pure `parseArgv` + `run()` + `appendEntry`; e2e test spawns built binary (Findings F1, F3) |
| CAPT-02 | `til some words` joins all words into one entry | `collectText` joins with single spaces; table test (13/13 grammar cases pass) |
| CAPT-03 | `til -- <text>` / `til add <text>` record text starting with `-` or a reserved word | Hand-rolled parser handles `--` as first token; commander does NOT (F1). PowerShell eats unquoted `--` (F2) |
| CAPT-04 | Entry is one list item `- HH:MM text`; multi-line collapsed | `normalizeText` + `entryLine`; local getters only |
| CAPT-05 | Empty/whitespace-only text: clear error, non-zero exit, nothing written | Validate before `mkdir`; exit 2; test asserts target dir never created |
| CAPT-06 | Confirmation shows stored text and file path | `Saved: ...` / `File: ...` lines via injected `out` |
| STOR-01 | First entry creates file with `# YYYY-MM-DD` heading + blank line | `openSync(file,'ax')` writing heading+entry in one write |
| STOR-02 | Later entries appended in order, never rewritten | `a+` open, single `writeSync`; test compares prior bytes as prefix |
| STOR-03 | Hand-edited file without trailing newline still gets entry on own line | 1-byte `readSync` probe at `size-1`, prefix `\n` in same write |
| STOR-04 | UTF-8, no BOM, LF, Korean/emoji byte-exact on every OS | Explicit `Buffer.from(...,'utf8')`, literal `\n`; byte asserts; non-Windows proof via CI (WSL/Docker unavailable here, F6) |
| STOR-05 | Local date for file name/heading | `getFullYear/getMonth/getDate`; clock built from local components; TZ matrix (F5) |
| STOR-06 | 20 parallel runs: 20 entries, 1 heading | Stress gate PASSED (25x20 real-CLI trials, 0 bad) with the `ax` creator; `wx` creator can lose entries (F3) |
| STOR-07 | Write failure: stderr has unsaved text, non-zero exit | try/catch around write; verified failure injections (ENOTDIR/EEXIST/EPERM/EISDIR) |
| CONF-01 | Default `~/til`, auto-created | `join(os.homedir(),'til')` + `mkdirSync({recursive:true})` |
| CONF-02 | `TIL_DIR` override | `resolveDir`; `~` expansion + cwd-relative verified (Git Bash/PowerShell pass `~` differently) |
| DIST-01 | `--help` and `--version` | Hand-written usage; version via JSON import inlined by tsdown |
| DIST-02 | Global `til` from fresh PowerShell/Git Bash/cmd | npm bin shims verified in PS 5.1, cmd, Git Bash; install flow caveats (F4) |
</phase_requirements>

## Summary

The project-level stack (Node >=22.12, TypeScript typecheck-only, tsdown, vitest, `appendFile`-style append) is sound and everything in it was reproduced on this machine. Research found **seven concrete deviations/hazards** that the plan must absorb; three of them contradict locked decisions as literally worded and need the planner's explicit handling:

- **F1 (touches D-17/D-02):** commander 15 cannot express the D-01..D-05 grammar without fighting it. Verified: `til -- show` and `til -- add foo` are routed to the subcommand (breaking the `--` escape hatch), `til help` is recorded as a text entry, bare `til` becomes an empty add, and unknown options exit 1 (not 2). Use a ~25-line pure hand-rolled `parseArgv` (zero runtime dependencies) instead. `node:util parseArgs` with `tokens: true` also works (verified) but adds nothing over the hand-rolled loop.
- **F2 (touches Success Criterion 4/D-02):** in PowerShell, an unquoted `--` is consumed by the npm-generated `til.ps1` shim, so `til -- -x` reaches the program as `til -x`. Verified in PS 5.1: `til '--' -x` and `til.cmd -- -x` work; `til -- -x`, `til add -- -x`, `til -- show` do not. This cannot be fixed inside `til`; the plan must (a) put the PowerShell form in the unknown-option error message, (b) test through the shims, and (c) hand the cheat-sheet item to Phase 2 README (DIST-03).
- **F3 (touches D-10):** the `wx` creator opens a non-append handle. If another process appends in the window between the creator's `open` and `write`, the creator's write lands at offset 0 and **overwrites that process's entry** (reproduced: 18/20 entries survive with an artificial 40 ms window). Use flag `ax` (`O_APPEND|O_CREAT|O_EXCL`) instead: same exclusivity, but the late write appends, so the worst case is a cosmetic duplicate heading, never data loss (reproduced: 20/20 entries survive the same window). D-11's gate was run and **passed**; no retry/lock is needed.

The remaining findings are operational: **F4** `npm install -g .` is a symlink to the repo and fails on a fresh clone unless `npm install` ran first (Pitfall 3); **F5** `TZ` works via in-process assignment and `spawn` env but not via a Git Bash env prefix, so tests use an injected local-component clock (Pitfall 5); **F6** neither WSL nor the Docker daemon is usable here, so the STOR-04 non-Windows byte check needs CI or a documented gap (Open Question 3); **F7** CRLF sources produce a CRLF shebang, so `.gitattributes` must exist before the first source commit (Pitfall 4).

**Primary recommendation:** Build a zero-dependency runtime (hand-rolled `parseArgv`, `node:fs` sync APIs, `ax` + `a+` single-write append), bundle with tsdown to `dist/cli.mjs`, inject a `Deps` clock built from local components in all date tests, gate the phase on the 20-process stress test and a shim-level install matrix, and treat the PowerShell `--` limitation as a documented platform fact, not a bug to chase.

## Architectural Responsibility Map

This is a single-process CLI with no browser/server tiers; "tiers" here are the layers from ARCHITECTURE.md.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| argv -> Command (grammar D-01..D-05) | Pure core (`core/args.ts`) | CLI shell | Must be table-testable with no I/O; returns data, never exits |
| Text normalization, local date/time, line/heading formatting | Pure core (`core/format.ts`) | — | Deterministic; clock passed in; the UTC-trap fix lives here |
| Storage dir resolution (`TIL_DIR`, `~`, default) | Pure core (`config.ts`) | CLI shell | Pure given `(env, homedir, cwd)` |
| Append with heading/newline repair, exclusivity | Storage adapter (`storage.ts`) | — | Only module touching the filesystem; owns encoding + atomicity |
| Orchestration, exit codes, messages | `run(argv, deps)` | Entry shell | Returns exit code; never calls `process.exit` |
| Process wiring (`process.argv`, `process.stdout`, `process.exitCode`) | Entry shell (`cli.ts`, 3 lines) | — | Only file with import-time side effects; shebang lives here |
| Global command shims (`til`, `til.cmd`, `til.ps1`) | npm (generated from `bin`) | OS shell | Not our code; their behavior (F2) constrains the grammar docs |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `>=22.12` (dev on 24.12.0) | Runtime, `node:fs`/`node:path`/`node:os` | Already installed; `engines` floor from STACK.md [VERIFIED: node --version -> v24.12.0] |
| TypeScript | 7.0.2 (typecheck only, `tsc --noEmit`) | Types | Verified passing with `module: NodeNext`, `allowImportingTsExtensions`, `resolveJsonModule`, JSON import attributes [VERIFIED: scratch `npx tsc --noEmit` exit 0] |
| tsdown | 0.23.0 (exact pin) | Bundle `src/cli.ts` -> `dist/cli.mjs` | Emits one `.mjs` with shebang preserved, `chmod +x`, JSON import inlined (only `version` string kept) [VERIFIED: npm view tsdown version -> 0.23.0; scratch build] |
| vitest | 5.0.3 (exact pin) | Unit + e2e tests | Runs TS directly, `globalSetup` rebuilds before e2e [VERIFIED: scratch run, 35 tests pass in ~2.3 s] |
| @types/node | `^22` (resolved 22.20.5) | Node typings | Match engines floor, not registry latest 26.x [VERIFIED: npm ls in scratch] |

**No runtime dependencies.** commander is dropped (F1). Tarball with zero deps installs in ~1 s.

### Supporting
None. No execa (use `node:child_process` `spawnSync`/`spawn`), no date library, no chalk.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `parseArgv` | commander 15.0.0 | Rejected: breaks D-02 `--` escape, `til help`, bare `til`, exit 2 (evidence in F1). Only viable with a pre-dispatch hack that re-implements the grammar anyway |
| Hand-rolled `parseArgv` | `node:util parseArgs` (`tokens: true`) | Works (the `option-terminator` token distinguishes `til -- show` from `til show`), but throws Node-worded errors and still needs the reserved-word logic; no savings |
| `ax` creator | `wx` creator (D-10 as written) | `wx` can overwrite concurrently appended entries (F3). `ax` is the same `O_EXCL` guarantee with append positioning |
| sync fs (`openSync`...) | `fs/promises` `appendFile` | Sync keeps the create->write gap to microseconds (no event-loop turn between them) and `run()` stays a plain function |

**Installation (dev):**
```bash
npm install --save-exact tsdown@0.23.0 vitest@5.0.3 typescript@7.0.2 @types/node@^22 --save-dev
```

**Version verification:** commander 15.0.0, tsdown 0.23.0 (2026-09-03), vitest 5.0.3 (2026-09-30), typescript 7.0.2, @types/node 26.6.4 latest (pinned to ^22 deliberately) [VERIFIED: npm registry, `npm view <pkg> version`, 2026-10-04].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| typescript | npm | 10+ yrs | ~355M/wk | github.com/microsoft/TypeScript | OK | Approved |
| tsdown | npm | ~3 yrs (created 2023-10-29) | ~5.0M/wk | github.com/rolldown/tsdown | SUS (`too-new`: latest release 0.23.0 published 2026-09-03) | Flagged — planner adds checkpoint |
| vitest | npm | ~5 yrs (created 2021-12-03) | ~135M/wk | github.com/vitest-dev/vitest | SUS (`too-new`: latest release 5.0.3 published 2026-09-30) | Flagged — planner adds checkpoint |
| @types/node | npm | 10 yrs (created 2016-05-17) | ~535M/wk | github.com/DefinitelyTyped/DefinitelyTyped | SUS (`too-new`: 26.x published 2026-10-01; we pin `^22`) | Flagged — planner adds checkpoint |
| commander | npm | 10+ yrs | ~625M/wk | github.com/tj/commander.js | OK | **Dropped from the stack** (F1) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `tsdown` [WARNING: flagged as suspicious — verify before using.], `vitest` [WARNING: flagged as suspicious — verify before using.], `@types/node` [WARNING: flagged as suspicious — verify before using.]. Seam output: `gsd_run query package-legitimacy check --ecosystem npm ...` (reason for all three is only `too-new`, i.e. a very recent latest *version*; each package is years old with large download counts and a real source repo; `npm view <pkg> scripts.postinstall` is empty for all four). The planner should still insert one `checkpoint:human-verify` before the first `npm install` of the dev dependencies, confirming exact versions from STACK.md (`tsdown@0.23.0`, `vitest@5.0.3`, `@types/node@^22`).

## Architecture Patterns

### System Architecture Diagram

```
argv (process.argv.slice(2))                      env / homedir / cwd / clock
        |                                                    |
        v                                                    v
 cli.ts (shell, 3 lines) ---- realDeps() ----> run(argv, deps)  -> exit code -> process.exitCode
                                                    |
                                          parseArgv(argv)  [pure]
                       +---------+---------+--------+----------------+
                       |         |         |        |                |
                    help      version   usage-   unavailable        add{text}
                       |         |       error   (show/list)           |
                  deps.out    deps.out  deps.err   deps.err     normalizeText -> empty?
                  exit 0      exit 0    exit 2     exit 2         |yes -> deps.err, exit 2, NO mkdir
                                                                    |no
                                                      now = deps.now()  (ONE read)
                                                      date = localDate(now); line = entryLine(localTime(now), text)
                                                                    |
                                          resolveDir(env, homedir, cwd) [pure]
                                                                    |
                                          appendEntry(dir, date, line)  [fs adapter]
                                            mkdirSync(recursive)
                                            openSync(file,'ax') --ok--> write heading+line (1 write) ---+
                                              | EEXIST                                                   |
                                            openSync(file,'a+') -> fstat size                            |
                                              size==0 : prefix heading                                   |
                                              last byte != \n : prefix '\n'                              |
                                            writeSync(prefix+line) (1 write)  --------------------------+
                                                                    |
                                       ok -> deps.out("Saved: ...\nFile: <abs path>\n"), exit 0
                                       throw -> deps.err(reason + "Unsaved: ..."), exit 1
```

### Recommended Project Structure
```
til-cli/
├── package.json            # type:module, bin, files:["dist"], engines, scripts, devDeps only
├── tsconfig.json           # noEmit typecheck (module NodeNext, strict, allowImportingTsExtensions, resolveJsonModule)
├── tsdown.config.ts        # entry src/cli.ts, esm, platform node, clean, dts false
├── vitest.config.ts        # include test/**, globalSetup builds, testTimeout 30s
├── .gitattributes          # * text=auto eol=lf   (+ *.cmd text eol=crlf)
├── .gitignore              # add node_modules/ dist/ *.tgz (currently only .omc/)
├── src/
│   ├── cli.ts              # #!/usr/bin/env node ; process.exitCode = run(argv, realDeps())
│   ├── run.ts              # Deps, realDeps(), run()  -- messages + exit codes
│   ├── config.ts           # resolveDir(env, home, cwd)
│   ├── storage.ts          # appendEntry(dir, date, line)  -- the ONLY fs module
│   └── core/
│       ├── args.ts         # parseArgv(argv) -> Command
│       └── format.ts       # localDate, localTime, normalizeText, entryLine, heading, dayFileName
└── test/
    ├── global-setup.ts     # execSync('npm run build')
    ├── helpers.ts          # at(), fakeDeps(), runCli(), tempDir()
    ├── args.test.ts        # table-driven grammar
    ├── format.test.ts      # date/time/normalize (+ UTC-trap)
    ├── config.test.ts      # resolveDir cases
    ├── storage.test.ts     # start-state table, prefix-preservation
    ├── run.test.ts         # in-process: clock, bytes, errors
    ├── e2e.test.ts         # spawn dist/cli.mjs; 20-process stress
    └── static.test.ts      # banned-API grep over src/
```
A tested prototype of exactly this layout (35 tests green, `tsc --noEmit` clean, build 4.4 kB) lives in the research scratch directory; the code examples below are lifted from it.

### Pattern 1: Pure grammar function (replaces commander)
**What:** `parseArgv(argv) -> Command` returns data only. First token decides `help|show|list|add`; a leading `--` or any non-reserved first token falls into `collectText`; inside `collectText`, `--` ends option scanning and everything after is literal text; any other arg starting with `-` (length > 1) is `-h/--help`, `-V/--version`, or a usage error. A lone `-` is text.
**When to use:** Always; this is the whole CLI surface for Phase 1.
```typescript
// Source: scratch prototype, 13/13 grammar cases + 23-row vitest table pass [VERIFIED: vitest run]
export type Command =
  | { kind: 'help' } | { kind: 'version' } | { kind: 'add'; text: string }
  | { kind: 'unavailable'; name: 'show' | 'list' } | { kind: 'usage-error'; message: string };

function collectText(args: readonly string[]): Command {
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') { words.push(...args.slice(i + 1)); break; }
    if (a.length > 1 && a.startsWith('-')) {
      if (a === '-h' || a === '--help') return { kind: 'help' };
      if (a === '-V' || a === '--version') return { kind: 'version' };
      return { kind: 'usage-error', message: `unknown option '${a}'. To record text that starts with '-', use: til -- <text>` };
    }
    words.push(a);
  }
  return { kind: 'add', text: words.join(' ') };
}

export function parseArgv(argv: readonly string[]): Command {
  if (argv.length === 0) return { kind: 'help' };
  const [first, ...rest] = argv as [string, ...string[]];
  switch (first) {
    case 'help': return { kind: 'help' };
    case 'show':
    case 'list': return { kind: 'unavailable', name: first };
    case 'add': return collectText(rest);
    default: return collectText(argv);          // includes a leading '--'
  }
}
```
Notes: `til add` with no text yields `add('')`, which `run()` rejects with exit 2 (D-08). A single quoted arg `"show me"` is NOT the reserved token (exact match only), so it is recorded. Reserved words are case-sensitive.
**Message improvement the plan should apply (F2):** extend the usage-error text to `... use: til -- <text>   (PowerShell: til '--' <text>)`.

### Pattern 2: Single-write append with `ax` creator and `a+` fallback
**What:** Create exclusively in append mode; on `EEXIST` open `a+`, probe size and last byte, then perform ONE write.
```typescript
// Source: scratch prototype; stressed 25x20 real-CLI trials + 90 barrier-synchronised trials, 0 lost / 0 duplicate [VERIFIED: node exp/stress*.mjs]
import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeSync } from 'node:fs';

function writeAll(fd: number, buf: Buffer): void {
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
}

export function appendEntry(dir: string, date: string, line: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${date}.md`);
  const head = `# ${date}\n\n`;
  try {
    const fd = openSync(file, 'ax');                       // O_APPEND|O_CREAT|O_EXCL — NOT 'wx'
    try { writeAll(fd, Buffer.from(head + line, 'utf8')); } finally { closeSync(fd); }
    return file;
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const fd = openSync(file, 'a+');                         // append + readable for the probe
  try {
    const { size } = fstatSync(fd);
    let prefix = '';
    if (size === 0) prefix = head;                         // touched / crash-left empty file
    else { const b = Buffer.alloc(1); readSync(fd, b, 0, 1, size - 1); if (b[0] !== 0x0a) prefix = '\n'; }
    writeAll(fd, Buffer.from(prefix + line, 'utf8'));
  } finally { closeSync(fd); }
  return file;
}
```
Rationale for `size === 0 -> heading`: a user-`touch`ed or crash-left empty file should still get its heading (STOR-01). The only cost is that a second process arriving in the microsecond window after another process created but has not yet written can add a second heading (cosmetic, entries preserved). Not observed in 175 stress trials.

### Pattern 3: One clock read, local getters, injectable `now`
```typescript
// Source: scratch prototype [VERIFIED: vitest run]
const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim();
// run(): const now = deps.now();  // exactly once; date, time, heading all derive from it
```
Tests build fake clocks from **local components** so they are correct under any process TZ:
`const at = (y,mo,d,h=0,mi=0,s=0,ms=0) => () => new Date(y, mo-1, d, h, mi, s, ms);`

### Pattern 4: `run(argv, deps)` returns the exit code; only the shell sets it
`cli.ts`: `process.exitCode = run(process.argv.slice(2), realDeps());` Never call `process.exit()` (pending stdout writes can be truncated, and it kills the vitest worker if imported). [CITED: ARCHITECTURE.md Pattern 4]

### Pattern 5: Dir resolution
```typescript
// Source: scratch prototype [VERIFIED: vitest run + Git Bash/PowerShell env probes]
export function resolveDir(env: Record<string, string | undefined>, home: string, cwd: string): string {
  const raw = env['TIL_DIR'];
  if (raw === undefined || raw.trim() === '') return join(home, 'til');
  if (raw === '~') return home;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2));
  return resolve(cwd, raw);
}
```
Probes: Git Bash converts an unquoted `TIL_DIR=~/notes` to `C:/Users/user/notes` and `/c/tmp/x` to `C:/tmp/x` before Node sees it; a quoted `'~/notes'` and PowerShell `$env:TIL_DIR="~/til"` arrive as a literal `~/...`, so the tool must expand `~` itself. `path.resolve` normalizes `C:/tmp/x` to `C:\tmp\x`, giving the absolute path D-14 prints.

### Anti-Patterns to Avoid
- **commander for this grammar:** see F1; fixing it costs more than the 25-line parser.
- **`wx` creator:** can overwrite concurrent appends (F3).
- **`toISOString().slice(0,10)`, `toLocale*String`, `getUTC*`, `os.EOL`, `writeFile`, `'w'` flag, `process.exit()`:** ban with `test/static.test.ts` (grep over `src/`; the prototype passes this grep with zero hits).
- **Calling `mkdirSync` before validating text:** violates D-08 (an empty-input run must not create the directory).
- **Testing `--` only via `spawn(argv[])`:** bypasses the PowerShell shim, which is precisely where `--` breaks (F2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Global command on 3 shells | Custom `.cmd`/`.ps1` launchers or PATH-editing installer | npm `bin` field (generates `til`, `til.cmd`, `til.ps1`) | Verified shims work in PS 5.1, cmd, Git Bash; no admin rights, no PATH edits |
| TS -> single executable JS with shebang | Custom build script / `tsc` emit | tsdown (shebang kept, +x, JSON import inlined) | One config file, 28 ms builds |
| Recursive mkdir race | Existence check + mkdir | `mkdirSync(dir,{recursive:true})` | Verified safe under 20 concurrent creators of a nested nonexistent dir |
| Exclusive create | Existence check then create | `openSync(file,'ax')` | Atomic `O_EXCL`; the check-then-create pattern is the duplicate-heading bug |
| Temp dirs in tests | Fixed paths | `fs.mkdtempSync(join(os.tmpdir(),'til-test-'))` | Isolation; never touches the real `~/til` |
| Locking | Lock files / retry loops | Nothing (D-11 gate passed) | Stress showed zero loss/duplication; add only if a future run fails |

**Key insight:** the write path is ~30 lines of `node:fs`. Every "robustness" addition (locks, retries, temp files) adds failure modes that the stress test shows are unnecessary.

## Runtime State Inventory

Not applicable: greenfield phase, no rename/refactor/migration. Nothing stored, registered, or built yet. (Note for execution: a real `npm install -g .` creates `%APPDATA%\npm\til*` shims and a symlink; see F4 for cleanup with `npm uninstall -g til-cli`.)

## Common Pitfalls

### Pitfall 1 (F2): PowerShell swallows unquoted `--` in the npm `.ps1` shim
**What goes wrong:** `til -- -x` in PowerShell becomes `til -x` -> "unknown option '-x'", violating Success Criterion 4 from PowerShell.
**Why it happens:** the shim is a PowerShell *script* that forwards `$args`; PowerShell's parameter binder consumes the first `--`. [VERIFIED: PS 5.1, `til -- -x`, `til add -- -x`, `til -- show` fail; `til '--' -x`, `til.cmd -- -x` succeed; also `til -Verbose foo` and `til '-x is faster'` reach the program intact]
**How to avoid:** put the PowerShell form in the error message; test CAPT-03 through the installed shims (`powershell -File`, `cmd`, `bash`), using `'--'` for PowerShell; document in the Phase 2 README cheat-sheet. Plain words and quoted text need no `--`. Alternatively delete `til.ps1` so PowerShell falls back to `til.cmd` (not recommended as a default).
**Warning signs:** CAPT-03 passes in vitest/`spawn` but fails when typed in PowerShell.

### Pitfall 2 (F3): `wx` creator overwrites concurrent appends
**What goes wrong:** entries lost (observed 18/20 survive with a 40 ms create->write gap).
**How to avoid:** `ax`. Keep the stress test as a permanent regression gate.

### Pitfall 3 (F4): `npm install -g .` is a symlink and needs devDependencies first
**What goes wrong:** (a) On a fresh clone `npm install -g .` FAILS: `prepare` runs `npm run build`, and `tsdown` is not installed (`'tsdown' is not recognized`). (b) The global install is a **symlink to the repo** (`node_modules/til-cli -> <repo>`), so `files` is irrelevant for it and deleting/moving the repo breaks `til`. (c) Source edits only take effect after rebuild (`prepare` re-runs on each `npm install -g .`).
**How to avoid:** documented flow is `npm install` (installs devDeps; `prepare` builds) then `npm install -g .`. For a real copy use `npm pack` then `npm install -g ./til-cli-<ver>.tgz` (verified: copy contains `dist/` + `package.json` only, 4.8 kB). [VERIFIED: scratch installs into `--prefix` directories]
**Warning signs:** `npm error command failed ... tsdown` on first install.

### Pitfall 4: CRLF shebang from git checkout
**What goes wrong:** `core.autocrlf=true` (set on this machine) plus a source file with CRLF yields `#!/usr/bin/env node\r\n` in `dist/cli.mjs` (verified: tsdown preserves the source line ending), which breaks on Linux/macOS.
**How to avoid:** `.gitattributes` with `* text=auto eol=lf` before the first source commit (verified: with it `git ls-files --eol` shows `w/lf`; without it git warns "LF will be replaced by CRLF"). Add a static test that `dist/cli.mjs` starts with `#!/usr/bin/env node\n` and contains no `\r`.

### Pitfall 5 (F5): `TZ` handling differs by how the process is started
**What goes wrong:** relying on a `TZ=...` prefix in tests silently does nothing.
**Evidence:** `process.env.TZ = 'America/Los_Angeles'` assigned inside the running process DOES change `getHours()` (also inside a vitest worker). `spawn(..., {env:{TZ}})`, `cmd /c "set TZ=..."` and PowerShell `$env:TZ=` all work at process start. A Git Bash `TZ=America/Los_Angeles node ...` prefix did NOT take effect (stayed Asia/Seoul; `PST8PDT` did) because MSYS rewrites the variable. [VERIFIED: scratch probes]
**How to avoid:** primary approach is the injected clock built from local components (TZ-independent); optional supplementary TZ tests use in-process assignment (restore in `finally`) or `spawn` env. Never use Git Bash env-prefix in tests.

### Pitfall 6: Directory-named day file opens "successfully" on Windows
**What:** `openSync(dir_named_YYYY-MM-DD.md, 'a+')` returns a handle (size 0, `isDirectory()` true); the failure only surfaces at `writeSync` (`EISDIR`). With the `size===0` heading path, the write still throws `EISDIR`, which reaches the D-12 handler (verified by a test). Do not add a pre-check; just keep the whole sequence inside the try/catch.

### Pitfall 7: Failure injection recipes (verified error codes on Windows)
`TIL_DIR` = path of an existing file -> `EEXIST` (mkdir) or `ENOTDIR` (path under a file); read-only day file (`attrib +R`) -> `EPERM` on `a+`; directory named like the day file -> `EISDIR` on write; invalid char in dir -> `ENOENT`. Use "TIL_DIR is a file" for cross-platform failure tests.

### Pitfall 8: `batch`/`cmd` quirks are not til bugs
`call til ...` is required inside `.bat` files (otherwise the batch ends after the first call); `%` handling and `chcp` affect only how the *test script* is read. Do not "fix" them in `til`.

### Pitfall 9: Non-ASCII characters in `\s`
`/\s+/` also matches U+00A0, U+3000 (ideographic space, common with Korean IMEs), U+2028/2029 and U+FEFF; all collapse to one space (acceptable, matches D-07's intent). Zero-width space U+200B is NOT whitespace in JS and an input of only U+200B would be stored. Accept; mention in the test table.

## Code Examples

### `run()` core and exit-code mapping
```typescript
// Source: scratch prototype [VERIFIED: vitest run + shim runs in PS 5.1 / cmd / Git Bash]
case 'add': {
  const text = normalizeText(cmd.text);
  if (text === '') { deps.err('til: nothing to save: text is empty\n'); return 2; }   // before any fs call
  const now = deps.now();                                                           // ONE clock read
  const date = localDate(now);
  const line = entryLine(localTime(now), text);                                     // `- HH:MM text\n`
  try {
    const file = appendEntry(resolveDir(deps.env, deps.homedir(), deps.cwd()), date, line);
    deps.out(`Saved: ${line.trimEnd()}\nFile: ${file}\n`);
    return 0;
  } catch (e) {
    deps.err(`til: could not save entry: ${(e as Error).message}\nUnsaved: ${line.trimEnd()}\n`);
    return 1;
  }
}
```
Observed output: `Saved: - 00:58 한글 😀 first` / `File: C:\...\2026-10-04.md`; bytes on disk `23 20 32 30 32 36 2d 31 30 2d 30 34 0a 0a 2d 20 ...` (no BOM, LF, `ed 95 9c ea b8 80` for 한글).

### tsdown config
```typescript
// Source: scratch tsdown.config.ts [VERIFIED: build output]
import { defineConfig } from 'tsdown';
export default defineConfig({ entry: ['src/cli.ts'], format: 'esm', platform: 'node', clean: true, dts: false });
```
Output: `dist/cli.mjs` (tsdown infers target `node22.12.0` from `engines`), first line `#!/usr/bin/env node` (LF), executable bit set, version string inlined from `import pkg from '../package.json' with { type: 'json' }`.

### package.json essentials
```json
{ "name": "til-cli", "version": "0.1.0", "type": "module",
  "bin": { "til": "dist/cli.mjs" }, "files": ["dist"], "engines": { "node": ">=22.12" },
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit", "test": "vitest run", "prepare": "npm run build" } }
```
(`typecheck`/`test` scripts are additions to the verified minimal set.) Optional: `"private": true` to prevent accidental publish (D-16 says no publish) — `npm install -g .` still works.

### vitest: global build, spawn the built CLI, assert bytes
```typescript
// test/global-setup.ts  [VERIFIED]
import { execSync } from 'node:child_process';
export default function setup(): void { execSync('npm run build', { stdio: 'inherit' }); }

// vitest.config.ts  [VERIFIED]
export default defineConfig({ test: { include: ['test/**/*.test.ts'], globalSetup: ['test/global-setup.ts'], testTimeout: 30_000 } });

// helpers  [VERIFIED]
export const CLI = resolve(import.meta.dirname, '..', 'dist', 'cli.mjs');
export function runCli(args: string[], env: Record<string,string> = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
// byte assertions on a Buffer from readFileSync(file) (no encoding argument):
//   b[0] === 0x23 (no EF BB BF); !b.includes(0x0d); b.toString('hex') contains Buffer.from('한글 😀').toString('hex')
```
Spawn with `process.execPath` + the script path (not `til.cmd`) for the default suite: no shell, no quoting.

### 20-process stress (STOR-06 gate)
Spawn 20 `node dist/cli.mjs entry <i> 한글` concurrently with the same `TIL_DIR` pointing at a **nonexistent nested dir**, wait for all `close` events (all exit 0), then assert: exactly one file, `lines[0] === '# <date>'`, `lines[1] === ''`, exactly one line starting `# `, 20 distinct `entry <i>` lines. Result: 0 bad in 25 trials (13.4 s total, ~0.5 s per trial). For a harder, optional local-only variant use a spin-barrier start (`while (Date.now() < startAt) {}`), which produced 0 bad in 60x20 and 30x40 trials. One trial per `npm test` run is enough for the gate; loop 10x in a separate `npm run test:stress`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsup | tsdown 0.23 (rolldown-based) | 2025-2026 | One-liner bundling, shebang + chmod handled |
| `ts-node` / CJS | Build to ESM `.mjs`; Node cannot run `.ts` from `node_modules` | Node 22.6+ type stripping excludes `node_modules` | A build step is mandatory for global install [CITED: STACK.md] |
| commander for tiny CLIs | Zero-dep hand parser or `parseArgs` | Node 18.3+ `util.parseArgs` | Fewer deps, faster install; here also required by grammar (F1) |

**Deprecated/outdated:** `wx` for the heading creator (F3); `os.EOL`-based line building; UTC date helpers.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PowerShell 7 also consumes an unquoted `--` in the `.ps1` shim (only 5.1 was tested; `pwsh` is not installed) | Pitfall 1 | If PS 7 passes `--` through, the README cheat-sheet is slightly too pessimistic; message hint still harmless |
| A2 | Node writes Korean/emoji to a Windows console TTY via the console API regardless of code page 949 (not testable from a non-TTY tool session; PITFALLS.md lists it as [KNOWN]) | D-14 output | Mojibake in the `Saved:` line on a cp949 console; the file on disk is unaffected. Needs the end-of-phase human check in real PS 5.1 / cmd windows |
| A3 | `ax`/`a+` single-write appends are atomic on Linux/macOS (`O_APPEND` POSIX semantics) | Pattern 2 | Only Windows was stress-tested; CI on ubuntu would confirm |
| A4 | A GitHub remote/Actions exists or will exist for the STOR-04 non-Windows byte check | Validation | Without CI, STOR-04 non-Windows evidence is limited to OS-independent byte tests + static ban of `os.EOL` |
| A5 | Windows Defender/OneDrive/sync clients holding the file (`EBUSY`/`EPERM` transient) will not occur for the default `~/til` | Don't Hand-Roll (no retry) | Rare failed writes surfaced to the user with their text (D-12 makes this safe, not silent); add a 3x retry only if observed |
| A6 | An `ExecutionPolicy` of `Restricted` would block `til.ps1` (this machine is `CurrentUser: RemoteSigned`) | Environment | Fresh Windows clients may need `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or `til.cmd`; README (Phase 2) |

## Open Questions

1. **Relax D-05 for quoted arguments that contain whitespace?**
   - What we know: D-05 as written errors on any arg starting with `-`. `til '-x is faster than -y'` (one quoted arg) therefore errors; in PowerShell the `--` escape is awkward (F2).
   - What's unclear: whether the user wants `til "-x is faster"` to just record. An arg like `-x is faster` cannot be a real flag.
   - Recommendation: **implement D-05 literally** (locked) with the improved error message; list the whitespace relaxation as a one-line, backward-compatible follow-up for the user to approve (it only turns some errors into saves).

2. **Success Criterion 4 wording vs PowerShell.** `til -- -text` works in Git Bash, cmd, and direct node; in PowerShell it requires `til '--' -text` (or `til.cmd -- -text`). Recommendation: planner marks SC4 verified per-shell with the PowerShell caveat and records it for the user at the end-of-phase human check.

3. **STOR-04 non-Windows check.** WSL has only a stopped `docker-desktop` distro and the Docker daemon is not running (both probed). Recommendation: add `.github/workflows/test.yml` with an `os: [windows-latest, ubuntu-latest]` matrix running `npm ci && npm test`, if a GitHub remote is intended; otherwise rely on OS-independent byte tests + `static.test.ts` and note the gap. Needs user confirmation (A4).

4. **`private: true`?** Optional safety against accidental `npm publish`; no effect on `npm install -g .`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | 24.12.0 | — |
| npm | install, pack | yes | 11.6.2 | — |
| Git Bash | shell matrix | yes | MINGW64 (git 2.55.0) | — |
| Windows PowerShell 5.1 | shell matrix | yes | 5.1 (ExecutionPolicy CurrentUser RemoteSigned) | — |
| cmd.exe | shell matrix | yes | Windows 11 10.0.26200 | — |
| PowerShell 7 (`pwsh`) | shell matrix | no | — | Mark PS 7 as unverified (A1); human check if installed later |
| WSL (usable distro) | STOR-04 non-Windows | no (only stopped `docker-desktop`) | — | GitHub Actions ubuntu job; OS-independent byte tests |
| Docker daemon | STOR-04 non-Windows | no (client only, engine pipe missing) | — | same as above |
| npm global prefix on PATH | DIST-02 | yes (`C:\Users\user\AppData\Roaming\npm` in User PATH and Git Bash PATH) | — | — |
| existing `til` command | name collision | none found (`where til` empty, `Get-Command til` empty) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** PowerShell 7, WSL/Docker (CI or explicit documented gap).

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json`, so this section is not required by the config; it is included because the orchestrator explicitly requested requirement-to-command proof.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.3 |
| Config file | `vitest.config.ts` (Wave 0) |
| Quick run command | `npx vitest run test/args.test.ts test/format.test.ts test/config.test.ts test/run.test.ts` |
| Full suite command | `npm test` (= `vitest run`; `globalSetup` rebuilds `dist/` first; measured ~2.3 s for 35 tests) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAPT-01 | text appended to today's file | e2e (spawn built CLI) | `npx vitest run test/e2e.test.ts -t "records Korean"` | Wave 0 |
| CAPT-02 | unquoted words joined | unit table | `npx vitest run test/args.test.ts` | Wave 0 |
| CAPT-03 | `--` / `add` escapes (+ reserved words) | unit table + shim matrix | `npx vitest run test/args.test.ts` and `npm run test:install` (PS uses `'--'`) | Wave 0 |
| CAPT-04 | `- HH:MM text`, multi-line collapsed | unit | `npx vitest run test/format.test.ts test/run.test.ts` | Wave 0 |
| CAPT-05 | empty -> exit 2, nothing created | in-process | `npx vitest run test/run.test.ts -t "empty text"` | Wave 0 |
| CAPT-06 | Saved + File lines | e2e | `npx vitest run test/e2e.test.ts -t "Saved"` | Wave 0 |
| STOR-01 | heading + blank line on first entry | in-process | `npx vitest run test/run.test.ts test/storage.test.ts` | Wave 0 |
| STOR-02 | append in order, prior bytes untouched | storage (prefix check) | `npx vitest run test/storage.test.ts` | Wave 0 |
| STOR-03 | no-trailing-newline repair | storage start-state table (missing, empty, ends `\n`, ends no `\n`, ends `\r\n`, has BOM) | `npx vitest run test/storage.test.ts` | Wave 0 |
| STOR-04 | UTF-8, no BOM, no CR, Korean/emoji bytes | byte asserts + static ban + CI ubuntu | `npx vitest run test/run.test.ts test/static.test.ts`; CI matrix | Wave 0 |
| STOR-05 | local date (01:30, 00:30, 23:59:59.999, cross-TZ) | in-process injected clock; spawn-env TZ | `npx vitest run test/run.test.ts test/format.test.ts` | Wave 0 |
| STOR-06 | 20 parallel -> 20 entries, 1 heading | e2e stress | `npx vitest run test/e2e.test.ts -t "20 parallel"`; `npm run test:stress` loops 10x | Wave 0 |
| STOR-07 | failed write -> unsaved text on stderr, non-zero | in-process + e2e (`TIL_DIR` = a file) | `npx vitest run test/run.test.ts -t "write failure"` | Wave 0 |
| CONF-01 | default `~/til` auto-created | unit (`resolveDir`) with fake home; e2e with `USERPROFILE`/`HOME` pointed at temp | `npx vitest run test/config.test.ts` | Wave 0 |
| CONF-02 | `TIL_DIR` override, `~`, relative | unit | `npx vitest run test/config.test.ts` | Wave 0 |
| DIST-01 | `--help`, `--version` | e2e | `npx vitest run test/e2e.test.ts -t "version"` | Wave 0 |
| DIST-02 | global install works in PS 5.1, cmd, Git Bash | script: `npm pack` -> `npm i -g --prefix <tmp> ./tgz` -> run shims via `powershell -File`, `cmd /c` (`call`), `bash -c`; assert bytes | `npm run test:install` (win32 only, not in default suite) + end-of-phase human check in fresh windows | Wave 0 |

### Sampling Rate
- **Per task commit:** quick run command (< 5 s).
- **Per wave merge:** `npm test` + `npm run typecheck`.
- **Phase gate:** `npm test`, `npm run test:stress`, `npm run test:install`, then the human-verify checkpoint (fresh PS 5.1 / Git Bash / cmd windows after a real `npm install -g .`; confirm console rendering of Korean, A2).

### Wave 0 Gaps
- [ ] `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `.gitattributes`, `.gitignore` additions (`node_modules/`, `dist/`, `*.tgz`)
- [ ] `test/global-setup.ts`, `test/helpers.ts`
- [ ] All `test/*.test.ts` files listed above; `scripts/test-install` (win32) for DIST-02
- [ ] Framework install: `npm install` (see Package Legitimacy Audit checkpoint)
- [ ] Static test content: assert absence in `src/` of `EOL|writeFile|toISOString|toLocale|'w'|"w"|process\.exit\(|getUTC|utcnow`; assert `dist/cli.mjs` starts `#!/usr/bin/env node\n` with no `\r`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local single-user CLI, no accounts |
| V3 Session Management | no | No sessions |
| V4 Access Control | no (OS file permissions only) | Writes only under the resolved storage dir with user rights; never elevate |
| V5 Input Validation | yes | Normalize text (D-07); file name is derived only from the local date, never from user input in Phase 1; (Phase 2 `show` date arg needs the strict regex) |
| V6 Cryptography | no | None |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via entry text | Tampering | Never shell out; write with `node:fs` (no `exec`) |
| Markdown/structure injection via newlines in text (`# heading`, code fence) | Tampering | Collapse all whitespace incl. CR/LF to one space (D-07); the `- HH:MM ` prefix keeps the rest inline |
| Path traversal | Tampering | File name is `<local date>.md`; `TIL_DIR` is operator-controlled env, resolved with `path.resolve` |
| Data loss on concurrent/failed writes | Denial of service / integrity | Append-only, single write, `ax`; failures print unsaved text (D-12) |
| Supply chain (new package versions) | Tampering | Zero runtime deps; exact-pinned dev deps; legitimacy checkpoint (audit above) |
| Leaking private notes via logging | Information disclosure | No logging/telemetry; text echoed only to the invoking terminal |

## Project Constraints (from CLAUDE.md)

Source: `C:\claude_book\좋은프롬프트\til-cli\.claude\CLAUDE.md` (project) — the global OMC CLAUDE.md contains only tooling guidance with no project-specific constraints.
- **Storage format:** plain UTF-8 Markdown, one file per day named `YYYY-MM-DD.md`.
- **Append safety:** writes must be append-only to the day file.
- **Date:** "today" is the user's local timezone, not UTC.
- **Cross-platform:** must work on Windows (PowerShell, Git Bash) as well as macOS/Linux; author's primary environment is Windows.
- **Simplicity:** small surface area, zero required configuration.
- **What NOT to use (STACK.md block inside CLAUDE.md):** `toISOString().slice(0,10)` for the filename; `fs.writeFile`/read-modify-write; `os.EOL`/CRLF/BOM; config-file or database libraries; interactive prompt libraries; chalk; `ts-node`.
- **@types/node:** `^22`, not the registry latest.
- **GSD workflow enforcement:** do not make direct repo edits outside a GSD workflow (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`). This research created no files in the repo other than this document; all experiments ran in the session scratchpad.

## Sources

### Primary (HIGH confidence)
- Scratch prototype and experiments, 2026-10-04, this machine (Windows 11 10.0.26200, Node 24.12.0, npm 11.6.2, PowerShell 5.1, Git Bash, git 2.55.0): commander 15 grammar matrix; `node:util parseArgs` matrix; 20/40-process barrier stress for `wx`, `ax`, size-0 variants and mutation (artificial 40 ms window); 25x20 real-CLI stress; failure-injection error codes; TZ behavior (env at start, in-process assignment, spawn env); tsdown build + shebang + CRLF probe; `npm install -g` from folder (symlink), fresh-clone failure, `npm pack` + tarball install; PS 5.1 `--` matrix; cmd and Git Bash shim runs with Korean/emoji and byte checks; vitest 5.0.3 suite (35 tests); `.gitattributes` vs `core.autocrlf=true`.
- npm registry (`npm view`, 2026-10-04): commander 15.0.0 (`engines >=22.12.0`), tsdown 0.23.0, vitest 5.0.3, typescript 7.0.2, @types/node 26.6.4.
- `gsd_run query package-legitimacy check --ecosystem npm ...` (verdicts in the audit table).
- Project docs read this session: `01-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `.planning/config.json`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.claude/CLAUDE.md` (embeds STACK.md).

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` and `PITFALLS.md` [KNOWN] items (PowerShell 5.1 argument quoting, ExecutionPolicy Restricted default, libuv `O_APPEND` mapping) — consistent with observations but not independently re-proven here.

### Tertiary (LOW confidence)
- PowerShell 7 behavior (A1) and console-TTY Korean rendering (A2): not testable in this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every tool ran on this machine at the pinned versions.
- Architecture: HIGH — prototype of the exact layout passes typecheck, build, 35 tests, shim runs in three shells.
- Pitfalls: HIGH for F1-F5 (reproduced); MEDIUM for non-Windows behavior and PS 7 (assumed).

**Research date:** 2026-10-04
**Valid until:** ~2026-11-03 (tsdown is pre-1.0; re-verify the exact pin and `npm view` before installing if later)
