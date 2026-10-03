# Walking Skeleton — til-cli

**Phase:** 1
**Generated:** 2026-10-04

> Adapted honestly for a local single-process CLI: there is no database, no browser UI, no auth, and no hosted deployment. The "stack" this skeleton proves is argv -> pure core -> one append-only file write -> console output -> built bundle -> npm-installed global shim.

## Capability Proven End-to-End

Running `til 한글 😀 first` through an npm-installed `til` shim appends `- HH:MM 한글 😀 first` under a `# YYYY-MM-DD` heading in `<TIL_DIR or ~/til>/YYYY-MM-DD.md` (local date, UTF-8 without BOM, LF only) and prints `Saved: - HH:MM 한글 😀 first` and `File: <absolute path>`.

Proven by plan 01-01 Task 2 (the tracer): `npm pack` -> `npm install -g --prefix <tmp>` -> `TIL_DIR=<tmp2> <tmp>/til tracer 한글` -> day file contains the entry line. The user-facing global install (`npm install -g .`) and the fresh-shell matrix (PowerShell 5.1, Git Bash, cmd) close the phase in plan 01-04.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js `>=22.12`, ESM (`"type": "module"`), developed on Node 24.12.0 | Installed on the author's machine; reads wide (UTF-16) argv so Korean arrives intact; engines floor matches the dev toolchain (D-16, D-17) |
| Language | TypeScript 7.0.2, typecheck only (`tsc --noEmit`, `module: NodeNext`, `allowImportingTsExtensions`, `resolveJsonModule`) | Types without an emit step; tsdown produces the runtime JS (D-17) |
| CLI parsing | Hand-rolled pure `parseArgv(argv) -> Command` in `src/core/args.ts`; zero runtime dependencies | commander 15 cannot express the D-01..D-05 grammar (`til -- show`, `til help`, exit 2); research F1 (D-17a) |
| Build | tsdown 0.23.0 (exact pin): `src/cli.ts` -> `dist/cli.mjs`, shebang kept, version string inlined from `package.json` | One config file; a build step is mandatory because Node cannot strip types inside `node_modules` (global install) |
| Data layer | Plain files: one `YYYY-MM-DD.md` per local date under the storage dir. Append-only: `openSync(file, 'ax')` writes heading + entry in one write; on `EEXIST`, `openSync(file, 'a+')` + last-byte probe + one write. Never read-modify-write, never truncate, never temp+rename | Core Value (never lose or corrupt an entry); `ax` keeps `O_EXCL` without the overwrite hazard of a non-append creator (D-09, D-10, D-10a, D-11) |
| On-disk format (one-way) | `# YYYY-MM-DD` + blank line on creation; each entry `- HH:MM <text>` + LF; UTF-8 without BOM; LF only on every OS | The user's archive contract and what Phase 2 `til show` reads (D-06, D-09) |
| Configuration | `TIL_DIR` env (with `~` expansion and cwd-relative resolution) else `~/til` via `os.homedir()`; no config file, no `--dir` flag | Zero-config first run (D-13; CONF-03 is v2) |
| Auth | None | Single-user local tool; writes with the invoking user's OS permissions only |
| Time | One injected `deps.now()` read per add; local getters only (`getFullYear`/`getMonth`/`getDate`/`getHours`/`getMinutes`) | Local date, never UTC; no midnight split between file name, heading, and time prefix (D-06, D-21) |
| Output writer | `Deps.out` / `Deps.err` -> `process.stdout.write` / `process.stderr.write`; ASCII-framed `Saved:` / `File:` lines; no `console.*` | Single output path Phase 2 (`til show`, VIEW-04) reuses for Korean console output (D-14) |
| Exit codes | `0` success (incl. help/version), `1` runtime/IO failure, `2` usage error | Scriptable, distinguishes "you typed it wrong" from "disk failed" (D-15) |
| Deployment target | npm global bin shims (`til`, `til.cmd`, `til.ps1`) from `npm install` then `npm install -g .` (symlink) or `npm pack` + `npm install -g ./til-cli-0.1.0.tgz` (copy); `"private": true`, no publish | No admin rights, no PATH edits; works in PowerShell, Git Bash, cmd (D-16, D-19) |
| Line-ending safety | `.gitattributes` `* text=auto eol=lf` committed before any source file | `core.autocrlf=true` on this machine would otherwise produce a CRLF shebang (D-20) |
| Directory layout | Functional core / imperative shell: `src/core/args.ts`, `src/core/format.ts` (pure, no `node:` imports); `src/config.ts` (pure path resolution); `src/storage.ts` (the ONLY `node:fs` module); `src/run.ts` (`Deps`, `realDeps()`, `run()` returns an exit code); `src/cli.ts` (shebang + one line setting `process.exitCode`) | Every rule is table-testable in-process; only the shell touches `process` |
| Tests | vitest 5.0.3; `globalSetup` rebuilds `dist/`; e2e spawns `process.execPath dist/cli.mjs`; fake clocks built from local components; temp dirs via `mkdtempSync`; 20-process stress gate; static banned-API test; win32 shim matrix script | Real filesystem, real bytes, never the user's real `~/til` |

## Stack Touched in Phase 1

- [x] Project scaffold — `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `.gitattributes`, `.gitignore` (plan 01-01)
- [x] Routing — command dispatch: `parseArgv` -> `run()` switch (add in 01-01; help/version/show/list/usage-error in 01-02)
- [x] Data layer — one real append write per run (01-01), hardened for hand-edited files and concurrency (01-03). The tool's own *read* path (`til show`) is Phase 2; Phase 1 tests read the bytes back directly.
- [x] Interface — terminal: argv in, `Saved:`/`File:` out, errors on stderr with exit codes (01-01, 01-02). No GUI by design.
- [x] Deployment — tarball install into a temp prefix in the tracer (01-01); real `npm install -g .` plus PowerShell 5.1 / cmd / Git Bash shim matrix and CI workflow file in 01-04. Local run command: `node dist/cli.mjs <text>`.

## Out of Scope (Deferred to Later Slices)

- `til show [date]`, `til list`, README with quoting cheat-sheet (Phase 2: VIEW-01..04, DIST-03). In Phase 1, `show`/`list` are reserved and answer "not available yet" with exit 2 (D-03).
- Bare `til` showing today's entries (Phase 2 may change bare `til`; Phase 1 prints usage, D-04).
- stdin capture (CAPT-07), `-d` backfill (CAPT-08), `--no-time` (CAPT-09), `--dir`/config file (CONF-03), day-rollover cutoff (CONF-04) — v2.
- Lock files / retry loops (D-11 stress gate passed with `ax`/`a+`; add only if a future stress run fails).
- `npm publish`, single-binary packaging, PowerShell 7 verification (pwsh not installed; human-check if present), and a non-Windows run (CI workflow file is added but needs a GitHub remote — D-22).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: `til show [YYYY-MM-DD]` — strict date validation (no path traversal), friendly "no entries", Korean output through the same `Deps.out` writer in PowerShell 5.1/7, Git Bash, cmd; README covering install (`npm install` then `npm install -g .`), usage, storage location, and the quoting cheat-sheet (PowerShell `'--'`, `$`, backtick; bash `!`).
- v2 (unscheduled): stdin capture, backfill, `--no-time`, `list`, configurable directory flag/config file.
