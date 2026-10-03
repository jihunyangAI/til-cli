---
phase: 01-safe-capture
plan: 03
subsystem: storage-hardening
tags: [node, append-only, utf-8, vitest, concurrency, local-date, static-analysis]

requires:
  - phase: 01-safe-capture
    provides: "01-01 tracer: appendEntry 'ax' creator, format helpers, resolveDir, Deps/run, test helpers"
provides:
  - "appendExisting hardened: 'a+' open, fstat size, 1-byte last-byte probe, heading for 0-byte files, one write per entry"
  - "Start-state table tests (missing, 0-byte, ends LF, no final LF, CR LF, lone CR, BOM) with prefix preservation"
  - "format/config/run unit tests: local date, UTC trap under Asia/Seoul, midnight truncation and straddle, byte-exact UTF-8, D-12 failure messages, TIL_DIR resolution"
  - "static.test.ts: banned-API scan over src/, node:fs boundary, dist shebang/CR check, zero-dependency check"
  - "20-process STOR-06 gate (test/stress.test.ts) and `npm run test:stress` (10 trials)"
affects: [01-04, phase-02-show]

plan_head_before: 05c2745f04143c69b7ecbcccf80d6c12c0364c3c
plan_head_after: 0aef7e48546606da1345f4025807710aea2f8562

actuals:
  tokens: 6350
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Probe-then-append: read exactly one byte at size-1 through the same 'a+' descriptor, never read-modify-write"
    - "Static architecture tests: regex ban list over src/ lines with file:line reporting"
    - "Concurrency gate spawns process.execPath + dist/cli.mjs; trial count from TIL_STRESS_TRIALS"

key-files:
  created:
    - test/storage.test.ts
    - test/format.test.ts
    - test/config.test.ts
    - test/run.test.ts
    - test/static.test.ts
    - test/stress.test.ts
    - scripts/stress.mjs
  modified:
    - src/storage.ts
    - package.json

key-decisions:
  - "appendExisting probes the last byte via one readSync on the same 'a+' fd; no directory pre-check so a directory collision surfaces as a thrown error for run()'s D-12 handler"
  - "src/core/format.ts, src/config.ts and src/run.ts needed no change: every new format/config/run/static test passed against the 01-01/01-02 code as written"
  - "Stress gate passed unchanged (no retry or lock added); the 'ax'-winner 0-byte window is recorded as a residual risk rather than mitigated"

requirements-completed: [CAPT-04, CAPT-06, STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, STOR-06, STOR-07, CONF-01, CONF-02]

duration: 10 min
completed: 2026-10-04

coverage:
  - id: D1
    description: "Hand-edited day file without a final LF gets its new entry on its own line; existing bytes stay an exact prefix"
    requirement: "STOR-03"
    verification:
      - kind: unit
        ref: "test/storage.test.ts#file without a final LF gets a LF prefix (STOR-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 0-byte existing day file receives the heading and blank line before the entry"
    requirement: "STOR-01"
    verification:
      - kind: unit
        ref: "test/storage.test.ts#0-byte file gets heading + entry (STOR-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Entries are dated by local components: 01:30 KST lands in that local date, 23:59:59.999 records 23:59, midnight does not split an entry"
    requirement: "STOR-05"
    verification:
      - kind: unit
        ref: "test/run.test.ts#TZ cross-check: 2026-10-03T16:30Z is recorded in 2026-10-04.md as 01:30 under Asia/Seoul"
        status: pass
      - kind: unit
        ref: "test/run.test.ts#a midnight straddle cannot split an entry"
        status: pass
    human_judgment: false
  - id: D4
    description: "Output is UTF-8 without BOM, LF only; multi-line input collapses to one list item; Markdown characters stay verbatim"
    requirement: "STOR-04"
    verification:
      - kind: unit
        ref: "test/run.test.ts#writes exact UTF-8 bytes: LF only, no BOM"
        status: pass
      - kind: unit
        ref: "test/format.test.ts#normalizeText"
        status: pass
    human_judgment: false
  - id: D5
    description: "A failed write exits 1 with the unsaved text (Korean/emoji intact) on stderr and nothing on stdout"
    requirement: "STOR-07"
    verification:
      - kind: unit
        ref: "test/run.test.ts#TIL_DIR is an existing regular file: exit 1, empty stdout, Unsaved on stderr, nothing created"
        status: pass
    human_judgment: false
  - id: D6
    description: "20 parallel til processes into a nonexistent directory leave one file, one heading and all 20 entries exactly once; identical texts are not de-duplicated"
    requirement: "STOR-06"
    verification:
      - kind: command
        ref: "npm run test:stress (10 trials x 2 scenarios)"
        status: pass
      - kind: unit
        ref: "test/stress.test.ts#20 parallel distinct entries"
        status: pass
    human_judgment: false
  - id: D7
    description: "TIL_DIR resolves to an absolute path: default <home>/til, ~ and ~/x expansion, relative against cwd"
    requirement: "CONF-02"
    verification:
      - kind: unit
        ref: "test/config.test.ts#resolveDir (D-13)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Privacy and safety prohibitions are enforced statically: no network/spawn modules, temp/lock/rename writes, console output, or environment-modifying commands in src/"
    requirement: "CAPT-06"
    verification:
      - kind: unit
        ref: "test/static.test.ts#banned APIs in src/"
        status: pass
    human_judgment: false
---

# Phase 1 Plan 3: Storage Hardening and Concurrency Gate Summary

**`appendExisting` now probes one trailing byte through an `'a+'` descriptor so hand-edited and touched day files are repaired in a single append, and a 20-process gate plus format/config/run/static suites prove local-date, UTF-8, failure and concurrency guarantees against real files.**

## Performance

- **Duration:** 10 min (2026-10-03T17:17:25Z to 17:27Z)
- **Tasks:** 3 completed (Task 1 TDD, Tasks 2 and 3 auto)
- **Files:** 9 changed (1 source, 7 created test/script files, package.json)
- **Tests:** 154 passing (79 before this plan); `npm run typecheck` clean

## Accomplishments

- Hand-edited day files without a trailing LF and lone-CR endings get a LF prefix inside the same single write; CR LF and BOM files are left byte-for-byte untouched (STOR-02/03).
- A 0-byte (touched or crash-left) day file receives `# YYYY-MM-DD` + blank line before the entry (STOR-01).
- Local-date correctness proven under in-process `TZ=Asia/Seoul`: instant `2026-10-03T16:30Z` is stored as `- 01:30` in `2026-10-04.md`; 23:59:59.999 truncates to `23:59`; a clock that crosses midnight between reads cannot split an entry because `run()` reads it once (STOR-05).
- D-12 failure contract proven for file-as-TIL_DIR and directory-at-day-file-path: exit 1, empty stdout, `Unsaved: - 09:05 한글 😀` on stderr; a later valid run writes a normal file (STOR-07).
- `test/static.test.ts` bans `EOL`, `writeFile`, `toISOString`, `toLocale`, `getUTC`, `process.exit(`, truncating/exclusive open flags, rename/tmpdir/lock, `console.`, network/child_process modules, `fetch`, environment-modifying commands and `commander` across `src/`, and asserts `node:fs` is imported only by `src/storage.ts`.
- 20-process gate (D-11) passed: one default trial per `npm test`, 10 trials via `npm run test:stress`, plus an extra 60-trial probe run (120 scenario executions in total beyond the default), all exit 0 with exactly one file, one heading, every entry once.

## TDD Gate Compliance

Task 1 followed RED then GREEN: `ab7e0bc` `test(01-03)` failed on exactly the three target tests (0-byte, no final LF, lone CR — assertions on the planned bytes, not load or syntax errors); `6948594` `feat(01-03)` made all 15 pass. No REFACTOR commit was needed. Tasks 2 and 3 are `type="auto"` without `tdd="true"`; they characterize existing behavior and passed on first run, so they have no RED commit by design.

## Task Commits

1. **Task 1 RED:** `ab7e0bc` test(01-03): add failing storage start-state table
2. **Task 1 GREEN:** `6948594` feat(01-03): repair missing trailing newline and empty day files
3. **Task 2:** `19deb4c` test(01-03): prove local date, encoding, failure and config guarantees
4. **Task 3:** `0aef7e4` test(01-03): add 20-process concurrency gate

## Deviations from Plan

None - plan executed exactly as written. `src/core/format.ts`, `src/config.ts` and `src/run.ts` were not modified; no test exposed a defect in them.

**Total deviations:** 0. **Impact:** none.

## Issues Encountered

- A tooling slip during execution (a stray `cat >` waiting on stdin hung one Bash call for 120 s) before the first commit; no repository state was affected and the commit was redone cleanly.

## Residual Risk (recorded, not mitigated)

The `'ax'` creator makes the file and writes the heading in two syscalls. A concurrent loser that opens `'a+'` in the gap sees size 0 and also prefixes a heading, which could produce two headings in a first-of-day race. The gate did not trigger it in 10 default-script trials plus a 60-trial probe (each trial 20 processes x 2 scenarios), because Node process start-up staggers the writers by tens of milliseconds, so the window is real but narrow. The plan's D-11 wording says any change here (retry or lock) needs a re-plan after a failing gate; the gate did not fail, so none was made. Plan 01-04 or a later hardening pass could close it by writing heading+entry atomically at create time through a single `'ax'` write that already happens, plus treating a 0-byte `'a+'` file as "creator still writing" (e.g. re-stat once) if the gate ever flakes.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths or trust-boundary file access beyond the plan's threat model (T-01-08 through T-01-13 are covered by storage, run, static and stress tests).

## Authentication Gates

None.

## Next Phase Readiness

- Ready for plan 01-04. `npm test` (154 tests incl. one stress trial), `npm run test:stress` and `npm run typecheck` all exit 0.
- `dist/` is gitignored and rebuilt by vitest globalSetup; do not run two `npm test` invocations concurrently in one checkout.

## Self-Check: PASSED

- FOUND: test/storage.test.ts, test/format.test.ts, test/config.test.ts, test/run.test.ts, test/static.test.ts, test/stress.test.ts, scripts/stress.mjs
- FOUND commits: ab7e0bc, 6948594, 19deb4c, 0aef7e4
- Re-ran all task acceptance criteria (grep counts for `'a+'`, `'ax'`, `readSync`, `fstatSync`, `dayHeading(date)` x2, only `src/storage.ts` imports `node:fs`, Asia/Seoul, `Unsaved: - 09:05 한글 😀`, `23, 59, 59, 999`, `TIL_STRESS_TRIALS`, package script) and plan verification: `npm test` 154 passed, `npm run test:stress` exit 0, `npm run typecheck` exit 0.
