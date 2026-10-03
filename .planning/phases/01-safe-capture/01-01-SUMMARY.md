---
phase: 01-safe-capture
plan: 01
subsystem: cli-capture
tags: [node, typescript, tsdown, vitest, append-only, utf-8, npm-bin]

requires: []
provides:
  - "`til <words...>` walking skeleton: argv -> local-date entry -> append-only 'ax' write -> Saved:/File: output"
  - "Contracts for plans 01-02..01-04: Command/parseArgv, format helpers, resolveDir, appendEntry/appendExisting, Deps/realDeps/run, test helpers"
  - "tsdown build to dist/cli.mjs with npm bin shim (til, til.cmd, til.ps1) verified through a tarball install into an isolated prefix"
affects: [01-02, 01-03, 01-04, phase-02-show]

plan_head_before: c6f6d80a3ebbfa9e4304f72063060f18a86e5480
plan_head_after: 307cb7845fa9aacffeaf2fe3133ea409f0c83f57

actuals:
  tokens: 2980
  tasks: 2
  commits: 2

tech-stack:
  added: [tsdown@0.23.0, vitest@5.0.3, typescript@7.0.2, "@types/node@22.20.5"]
  patterns:
    - "Functional core (src/core/*) / imperative shell (src/run.ts, src/cli.ts)"
    - "Deps-injected clock, env, homedir, cwd and output writers"
    - "src/storage.ts is the only node:fs importer; one write per entry; never truncate or read-modify-write"
    - "Zero runtime dependencies; hand-rolled parseArgv"

key-files:
  created:
    - .gitattributes
    - package.json
    - package-lock.json
    - tsconfig.json
    - tsdown.config.ts
    - vitest.config.ts
    - src/cli.ts
    - src/run.ts
    - src/config.ts
    - src/storage.ts
    - src/core/args.ts
    - src/core/format.ts
    - test/global-setup.ts
    - test/helpers.ts
    - test/e2e.test.ts
  modified:
    - .gitignore

key-decisions:
  - "Task 1 package legitimacy gate approved by a human; exact pins tsdown 0.23.0, vitest 5.0.3, typescript 7.0.2, @types/node ^22 (resolved 22.20.5)"
  - "TypeScript 7.0.2 accepted the planned config unchanged, so no typescript@^6 fallback was needed"
  - "Commits made on master after the human chose 'allow commits on master' (git.allow_default_branch_commits: true)"

requirements-completed: [CAPT-01, CAPT-06, STOR-01, STOR-02, STOR-04, CONF-01, CONF-02, DIST-02]

coverage:
  - id: D1
    description: "`til 한글 😀 first` writes `# YYYY-MM-DD`, blank line, `- HH:MM 한글 😀 first` as UTF-8 without BOM or CR to a local-date file and prints Saved:/File:"
    requirement: "CAPT-01"
    verification:
      - kind: e2e
        ref: "test/e2e.test.ts#records Korean and confirms with path"
        status: pass
    human_judgment: false
  - id: D2
    description: "A second same-day run appends below with prior bytes preserved as an exact prefix"
    requirement: "STOR-02"
    verification:
      - kind: e2e
        ref: "test/e2e.test.ts#second entry appends below"
        status: pass
    human_judgment: false
  - id: D3
    description: "Default storage directory is <home>/til when TIL_DIR is unset"
    requirement: "CONF-01"
    verification:
      - kind: e2e
        ref: "test/e2e.test.ts#default directory is ~/til"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty text exits 2 without creating the directory; failed write exits 1 with Unsaved: text on stderr"
    requirement: "CAPT-06"
    verification:
      - kind: e2e
        ref: "test/e2e.test.ts#empty text exits 2 and creates nothing"
        status: pass
      - kind: e2e
        ref: "test/e2e.test.ts#failed write keeps the text"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm pack + npm install -g --prefix yields a til shim that appends a line from Git Bash"
    requirement: "DIST-02"
    verification:
      - kind: other
        ref: "tarball -> temp prefix -> TIL_DIR=<tmp> <prefix>/til tracer 한글, then grep '- HH:MM tracer 한글'"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-04
status: complete
---

# Phase 1 Plan 01: Safe Capture Tracer Summary

**Zero-dependency `til <words...>` tracer: Korean/emoji-exact append-only day files under local-date headings, tsdown bundle, and a verified npm-generated global shim.**

## Performance

- **Duration:** about 8 min for this continuation (Task 1 gate was resolved earlier)
- **Completed:** 2026-10-03T17:08Z (2026-10-04 local, KST)
- **Tasks:** 2 (1 checkpoint, 1 tracer)
- **Files modified:** 16 (15 created, `.gitignore` modified)

## Accomplishments

- Task 1 (package legitimacy gate, `gate="blocking-human"`): the human's reply, recorded verbatim, was **"approved"**. It approved exactly tsdown@0.23.0, vitest@5.0.3, typescript@7.0.2 (`--save-dev --save-exact`) and @types/node@^22 (`--save-dev`). Evidence shown to the human: node v24.12.0, npm 11.6.2; tsdown 0.23.0 (repo rolldown/tsdown), vitest 5.0.3 (repo vitest-dev/vitest), typescript 7.0.2 (repo microsoft/TypeScript), @types/node 22.x newest 22.20.5 (DefinitelyTyped); no postinstall scripts. Nothing was installed before approval.
- Tracer slice end to end: pure format/args/config core, `'ax'` exclusive-append creator with `appendExisting` fallback (single `writeAll` per entry), single clock read, `Saved:`/`File:` stdout, `Unsaved:` stderr on failure, exit codes 0/1/2.
- LF safety (D-20): `.gitattributes` was committed alone, before any `src/` or `test/` file existed; `dist/cli.mjs` starts with `#!/usr/bin/env node` + LF and contains no CR.
- Distribution: tarball installed into an isolated prefix produces `til`, `til.cmd`, `til.ps1`; running the Git Bash shim appended `- 02:07 tracer 한글` under `# 2026-10-04`.
- Tracer feedback gate (auto mode): `npm run typecheck`, `vitest run test/e2e.test.ts` (5 passed) and the tarball shim check were re-run end to end after the commit and all passed, logged as "Tracer verified end-to-end".

## Task Commits

1. **Task 1: Package legitimacy gate** - no commit (checkpoint; approval recorded above)
2. **Task 2: Tracer** - `029c4f8` (chore: `.gitattributes` + `.gitignore` first, D-20) and `307cb78` (feat: manifest, configs, six source modules, test files, lockfile)

**Plan metadata:** committed separately as `docs(01-01)` (SUMMARY, STATE, ROADMAP, REQUIREMENTS, config.json)

## Files Created/Modified

- `.gitattributes` - `* text=auto eol=lf`, `*.cmd text eol=crlf`
- `.gitignore` - adds `node_modules/`, `dist/`, `*.tgz`
- `package.json`, `package-lock.json` - `til-cli`, private, ESM, bin `til` -> `dist/cli.mjs`, no `dependencies`, four exact/pinned devDependencies
- `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts` - toolchain config
- `src/core/format.ts`, `src/core/args.ts` - pure local-date/time/entry formatting and add-only argv parsing
- `src/config.ts` - `resolveDir` (TIL_DIR with `~` expansion, cwd-relative resolution, default `~/til`)
- `src/storage.ts` - only `node:fs` module; `appendEntry`, `appendExisting`, `writeAll`
- `src/run.ts`, `src/cli.ts` - Deps, `realDeps`, `run`; shebang entry
- `test/global-setup.ts`, `test/helpers.ts`, `test/e2e.test.ts` - build-before-test, helpers, five spawned-binary tests

## Decisions Made

- Resolved @types/node version: **22.20.5** (the `^22` line, matching the engines floor).
- TypeScript: 7.0.2 accepted the config as planned; **no `typescript@^6` fallback** was required.
- Committed on `master` because the human explicitly allowed it (`git.allow_default_branch_commits: true`, `branching_strategy: none`).

## Deviations from Plan

None - plan executed exactly as written.

Process notes (not deviations): `npm install <pkg>` did not trigger the `prepare` script, so `npm run build` was run explicitly before typecheck and tests (the vitest globalSetup also builds). A first attempt to write all files through one shell heredoc failed to parse because of the non-ASCII test strings; nothing had been written, and the files were created with the Write tool instead. In `test/e2e.test.ts` the "failed write" test omits a redundant `mkdirSync` on the temp dir (`mkdtempSync` already creates it).

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None. `npm install` printed two deprecation warnings for `@yuku-codegen/binding-win32-x64` and `@yuku-parser/binding-win32-x64` (transitive dev dependencies of tsdown); out of scope, 0 vulnerabilities reported.

## Known Stubs

None.

## Threat Flags

None - no network, auth, or trust-boundary surface beyond the plan's threat model.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-02 can extend the `Command` union and `parseArgv` grammar; plan 01-03 can replace only `appendExisting` with the STOR-03 last-byte probe; plan 01-04 performs the real global install. `.gsd/`, `.planning/milestone.lock` and `.planning/state.json` remain untracked tool files and were intentionally not committed.

## Self-Check: PASSED

- All 15 created files exist and are tracked (`git ls-files`); `git ls-files --eol` shows `i/lf` for `src/cli.ts` and `src/storage.ts`.
- Commits `029c4f8` and `307cb78` exist on master; `.gitattributes` add commit is an ancestor of the `src/cli.ts` add commit.
- Acceptance greps: `'ax'` count 1, `appendExisting` count 2, `node:fs` only in `src/storage.ts`, `deps.now()` count 1, package.json and dist/cli.mjs checks exit 0, `npm ls` shows tsdown@0.23.0, vitest@5.0.3, typescript@7.0.2, @types/node@22.20.5.
