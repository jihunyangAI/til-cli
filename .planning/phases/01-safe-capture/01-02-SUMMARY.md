---
phase: 01-safe-capture
plan: 02
subsystem: cli-grammar
tags: [argv-grammar, usage, version, exit-codes, powershell, tdd]

requires:
  - phase: 01-safe-capture
    provides: "Command/parseArgv add-only tracer, Deps/run, test helpers (plan 01-01)"
provides:
  - "Full D-01..D-05 grammar in pure parseArgv: help, version, add, unavailable, usage-error"
  - "run() exhaustive dispatch with USAGE text, package.json version, exit codes 0/2"
  - "Table-driven grammar tests and in-process plus spawned-binary CLI surface tests"
affects: [01-03, 01-04, phase-02-show]

plan_head_before: 1f37d31eef5076bc84b9e9d7f32dc8b2210246de
plan_head_after: 046e1f595fbf43eaa2195b0b56f3dee1f6d1ac63

actuals:
  tokens: 2886
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Pure hand-rolled grammar (no node: imports, no CLI framework) returning a discriminated Command union"
    - "Exhaustive switch with a never-typed default in run()"
    - "Version inlined from package.json via JSON import attribute (tsdown bundles the string)"

key-files:
  created:
    - test/args.test.ts
    - test/cli.test.ts
  modified:
    - src/core/args.ts
    - src/run.ts

key-decisions:
  - "Reserved words (add, show, list, help) match only as the exact, case-sensitive first argument; `til 'show me'` and `til Show me` are text"
  - "Any dash-prefixed argument longer than one character before `--` is an option even with spaces (D-23); a lone `-` is text"
  - "Usage-error message always carries the PowerShell-safe `til '--' <text>` hint because the npm til.ps1 shim swallows an unquoted `--` (D-18)"

patterns-established:
  - "Every exit-2 path returns before any filesystem call, so the storage directory is never created"

requirements-completed: [CAPT-01, CAPT-02, CAPT-03, CAPT-05, DIST-01]

coverage:
  - id: D1
    description: "Bare words join with single spaces into one entry; reserved words act only as the first argument; `til -- -text`, `til -- show` and `til add show me` record literally"
    requirement: "CAPT-02, CAPT-03"
    verification:
      - kind: unit
        ref: "test/args.test.ts#parseArgv grammar (D-01..D-05, D-23)"
        status: pass
      - kind: unit
        ref: "test/cli.test.ts#run(): recorded text"
        status: pass
    human_judgment: false
  - id: D2
    description: "--help, -h, help and bare `til` print usage on stdout, exit 0, write nothing; --version and -V print 0.1.0 plus LF, also from the built dist/cli.mjs"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "test/cli.test.ts#run(): help and run(): version"
        status: pass
      - kind: e2e
        ref: "test/cli.test.ts#built binary (spawned)"
        status: pass
    human_judgment: false
  - id: D3
    description: "show/list exit 2 with `not available yet`; unknown dash options exit 2 naming the argument and suggesting `til -- <text>`, `til '--' <text>`, `til add <text>`; nothing is written"
    requirement: "CAPT-03"
    verification:
      - kind: unit
        ref: "test/cli.test.ts#run(): unavailable show/list and run(): usage errors"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty, whitespace-only, CR/LF/TAB-only, U+3000/U+00A0-only input and bare `til add` / `til --` exit 2 with `nothing to save` and do not create the storage directory; a lone U+200B is recorded"
    requirement: "CAPT-01, CAPT-05"
    verification:
      - kind: unit
        ref: "test/cli.test.ts#run(): empty text and run(): recorded text"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-10-04
status: complete
---

# Phase 1 Plan 02: Command Grammar Summary

**Hand-rolled zero-dependency `parseArgv` grammar (reserved first words, `--` and `add` escapes, flags, PowerShell-safe usage errors) wired through an exhaustive `run()` dispatch with USAGE text, bundled version and exit codes 0/2.**

## Performance

- **Duration:** about 3 min
- **Started:** 2026-10-03T17:11:43Z
- **Completed:** 2026-10-03T17:14:52Z (2026-10-04 local, KST)
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `parseArgv` implements D-01..D-05 and D-23 as a pure function: zero args is help, `help` is help, `show`/`list` are `unavailable`, `add` strips itself then collects text, anything else (including a leading `--`) collects text; `--` copies the remainder verbatim; other dash-prefixed arguments longer than one character are help/version flags or a usage error.
- `run()` dispatches every `Command` kind exhaustively (`never`-typed default), keeping the 01-01 `add` case byte-for-byte (single `deps.now()` read, empty check before any fs call, D-12 failure message).
- Built `dist/cli.mjs` proves `--version` prints `0.1.0`, `--help` and bare `til` print identical usage, `show` exits 2, and `-x` exits 2 without creating the storage directory; `til -- -text` records `- HH:MM -text` under the local-date heading.

## TDD Gate Compliance

| Task | RED commit | GREEN commit |
|------|------------|--------------|
| 1 grammar | `130a794` test(01-02): add failing grammar table (28 of 37 rows failed on planned assertions) | `6949cb7` feat(01-02): implement D-01..D-05 command grammar (37 passed) |
| 2 dispatch | `746936f` test(01-02): add failing CLI surface tests (21 of 37 failed on planned assertions: undefined return, empty stdout, wrong exit code) | `046e1f5` feat(01-02): dispatch help/version/show/list/usage errors (79 passed across three files) |

Both RED runs failed on assertions for the planned behavior, not on syntax, discovery or fixture errors. No REFACTOR commit was needed.

## Task Commits

1. **Task 1: Full command grammar** - `130a794` (test, RED), `6949cb7` (feat, GREEN)
2. **Task 2: Dispatch every command kind** - `746936f` (test, RED), `046e1f5` (feat, GREEN)

**Plan metadata:** committed separately as `docs(01-02)`.

## Files Created/Modified

- `src/core/args.ts` - Command union and pure parseArgv with internal `collectText`
- `src/run.ts` - `USAGE` export, version JSON import, dispatch for help/version/unavailable/usage-error
- `test/args.test.ts` - one `it.each` table of 37 grammar rows
- `test/cli.test.ts` - in-process `run()` rows per command kind plus five spawned-binary tests

## Decisions Made

- Followed the plan's grammar and USAGE wording as specified; no new decisions beyond those recorded in key-decisions.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None. Between the Task 1 GREEN and Task 2 GREEN commits `run.ts` was non-exhaustive for the new `Command` kinds, so `npm run typecheck` was not run until Task 2 completed (Task 1 verification is vitest only); it passes at the plan's end.

## Known Stubs

None.

## Threat Flags

None. T-01-06 is mitigated as planned (exact, first-token-only reserved words; exit 2 and nothing written for show/list and unknown options; `--` and `add` escapes table-tested). No packages were installed; package.json has no `dependencies` key.

## Next Phase Readiness

Plan 01-03 can replace only `appendExisting` (STOR-03 last-byte probe) without touching the grammar. Plan 01-04 performs the real global install; the PowerShell hint text depends on the npm `til.ps1` shim behavior verified there. DIST-01 assumption stands: the version shown is `package.json` inlined at build time, so a stale `dist/` shows a stale version until `npm run build` (or `prepare`) reruns.

## Self-Check: PASSED

- `test/args.test.ts`, `test/cli.test.ts`, `src/core/args.ts`, `src/run.ts` exist; `git status` shows no uncommitted source files.
- Commits `130a794`, `6949cb7`, `746936f`, `046e1f5` exist on master (`git rev-list --count` from the plan base: 4).
- Acceptance checks re-run: vitest (79 passed), `npm run typecheck` exit 0, `node dist/cli.mjs --version` prints `0.1.0`, `--help` and no-arg output identical, `show` exits 2, `-x` exits 2 and creates no directory, `grep -c "with { type: 'json' }" src/run.ts` is 1, `deps.now()` count 1, args.ts has 0 `node:` imports, package.json has no `dependencies`.
