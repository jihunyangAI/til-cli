---
phase: 01-safe-capture
plan: 05
subsystem: storage
tags: [concurrency, mkdir-lock, o_append, stress-gate, windows, ci, gap-closure]

requires:
  - phase: 01-safe-capture
    provides: "01-03 ax/append storage and 20-process stress gate; 01-04 CI matrix"
provides:
  - "src/storage.ts: appendEntry decides the day heading only under a per-day mkdir lock (.YYYY-MM-DD.md.lock); non-empty day files are appended lock-free"
  - "dayLockPath export, age-based stale-lock recovery (10 s, 20 s guard), safe non-recursive releaseLock"
  - "scripts/stress.mjs: contended 20-process gate pinned to 2 CPUs (start /affinity 3 on win32, taskset -c 0-1 on linux), 40 trials by default, header line, real exit code"
  - "Deterministic worker-thread in-flight race test and stale/held-lock tests"
affects: [phase-02-show, phase-02-readme, verify-work]

plan_head_before: f2b8d65f48f549b09219d3baf132588119227890
plan_head_after: 79270364366e83e6dffc6befc1e398bce2437f87

actuals:
  tokens: 4200
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Heading decision (appendFirst) runs only under an atomic mkdirSync lock or in two documented fallbacks; writers outside the lock append only after seeing size > 0"
    - "Age-based lock staleness (directory mtime, 10 s) with a 20 s hard termination guard, instead of a short fixed wait"
    - "Stress gate must be contended to count as evidence, and is proven sensitive by a mutation run against the pre-fix source"

key-files:
  created: []
  modified:
    - src/storage.ts
    - test/storage.test.ts
    - test/static.test.ts
    - scripts/stress.mjs
    - test/stress.test.ts
    - .github/workflows/test.yml

key-decisions:
  - "Per-day lock is an empty directory made with mkdirSync and removed with non-recursive rmdirSync (D-11); it carries only the date and never any entry text"
  - "Staleness is age-based (10 s mtime) with a 20 s guard, because a preempted holder under a 2-CPU pin can wait about a second for CPU; a short fixed wait would bring the duplicate heading back"
  - "Lock-release errors are swallowed (EBUSY/EPERM retried 10x): the entry is already on disk and a false failure would make the user re-run and duplicate it"
  - "Stress gate pinned to 2 CPUs and 40 trials per scenario; fails loudly when pinning is unavailable instead of silently running uncontended"

patterns-established:
  - "Tracer-first TDD: failing worker-thread race test, then the lock, then hygiene rows"
  - "Mutation check on the gate: restore the pre-fix file temporarily, require a failure, restore, git diff --exit-code"

requirements-completed: [STOR-06, STOR-01]

coverage:
  - id: D1
    description: "20 parallel first-of-day writes leave exactly one heading and all 20 entries once, under 2-CPU contention"
    requirement: "STOR-06"
    verification:
      - kind: integration
        ref: "npm run test:stress (3 of 3 runs exit 0, 40 trials x 2 scenarios, 2-CPU pin)"
        status: pass
    human_judgment: false
  - id: D2
    description: "In-flight race: a writer finding a 0-byte file under a held lock appends below the holder's heading"
    requirement: "STOR-06"
    verification:
      - kind: unit
        ref: "test/storage.test.ts#a writer that finds a 0-byte file under a held lock waits and appends below the holder heading"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stale-lock recovery, lock-free append past a held lock, no litter left in the storage directory"
    requirement: "STOR-01"
    verification:
      - kind: unit
        ref: "test/storage.test.ts per-day lock (G-01-2) and start-state table readdir assertions"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 4 CI jobs (windows/ubuntu x Node 22/24) green on the pushed fix with the contended gate"
    verification: []
    human_judgment: true
    rationale: "Needs a push to origin and a GitHub Actions run; the executor does not push (orchestrator handles push and CI check)"

duration: 22min
completed: 2026-10-05
status: complete
---

# Phase 01 Plan 05: Per-day lock closes the duplicate-heading race (G-01-2) Summary

**First-of-day heading is decided only under a per-day `mkdirSync` lock directory, and the 20-process stress gate now runs pinned to 2 CPUs with 40 trials, proven to fail on the pre-fix code.**

## Performance

- **Duration:** 22 min (2026-10-04T16:27:49Z to 16:49:47Z)
- **Tasks:** 3 (1 tracer, 2 auto), all TDD where specified
- **Files modified:** 6

## Accomplishments

- Root cause removed (G-01-2): `appendExisting` used to infer "write a heading" from `fstat size === 0`, which cannot tell an empty file from a creator that has opened with `ax` but not written yet. The heading logic (`appendFirst`, unchanged `ax` create plus `appendExisting`) now runs only while holding `.YYYY-MM-DD.md.lock`, so a 0-byte state seen under the lock can never be another writer's half-finished state. Appends to a non-empty file never take or wait for the lock (D-11); each entry is still one O_APPEND write that carries any heading or LF-repair prefix (D-10/D-10a).
- Lock hygiene: a lock whose mtime is 10 s old is stale; the next first-of-day write saves the entry at once and removes it. A fresh lock is waited on with a 20 s hard guard. `releaseLock` uses only non-recursive `rmdirSync`, retries EBUSY/EPERM, and never throws.
- Gate is real evidence: `scripts/stress.mjs` pins to 2 CPUs and runs 40 trials per scenario; the per-test vitest timeout scales with the trial count; the CI job has `timeout-minutes: 30`.

## Task Commits

1. **Task 1 RED:** `dda8814` test(01-05): add failing in-flight first-write race test
2. **Task 1 GREEN (tracer):** `7065c7f` fix(01-05): decide the day heading only under a per-day lock
3. **Task 2 RED:** `2f620bc` test(01-05): add stale-lock and held-lock storage tests
4. **Task 2 GREEN:** `d14d6b7` fix(01-05): recover stale day locks and release safely
5. **Task 3:** `7927036` test(01-05): run the stress gate under 2-CPU contention

## Evidence (Task 3 D and E)

Header line printed by every gated run (CI log evidence):
`stress: 40 trial(s) x 2 scenarios x 20 processes, pinned to 2 CPU(s) via start /affinity 3`

**Mutation run (pre-fix `git show 58cf5f7:src/storage.ts` restored temporarily, vitest rebuilt dist from it):**

| Run | Exit | Duration | Outcome |
|-----|------|----------|---------|
| 1 | 0 | 148 s | passed (race not hit) |
| 2 | 0 | 139 s | passed (race not hit) |
| 3 | 1 | 128 s | FAILED at the one-heading assertion: `expected [ '# 2026-10-05', '# 2026-10-05' ] to have a length of 1 but got 2` (identical-entries scenario) |

The failing exit code also confirms that the `cmd /v:on ... & exit !errorlevel!` wrapper propagates vitest's real exit status. The fixed `src/storage.ts` was restored with `git checkout -- src/storage.ts`; `git diff --exit-code src/storage.ts` exited 0 and the file is byte-identical to commit `d14d6b7`. The pre-fix file was never committed. This matches the plan's estimate (about 87% per run), and no 80-trial fallback run was needed.

**Green with the fix (40 trials x 2 scenarios, 2-CPU pin):**

| Run | Exit | Duration |
|-----|------|----------|
| 1 | 0 | 153 s |
| 2 | 0 | 147 s |
| 3 | 0 | 151 s |

`npm test` (9 files, 160 tests) and `npm run typecheck` both exit 0.

## Rejected Mechanisms

- **Temp file + `linkSync`:** conflicts with D-10 (no temp files; every entry is one O_APPEND write) and hard links fail on FAT/exFAT.
- **Bounded re-check of `size === 0`:** still decides from a 0-byte state that may be temporary (the window only gets longer), and two writers to a touched 0-byte file would still both write headings.
- **Windows exclusive share mode:** needs an undocumented libuv flag, Windows-only, so Linux would keep the race.
- **Lock file opened with `ax`:** replaced by a lock directory, which has no content, no handle held open, is left alone by antivirus scanners, and `mkdir` is atomic on NTFS, FAT/exFAT, SMB and POSIX.

## Residual Risk Status

The 01-03 "Residual Risk" and the D-10a "worst case duplicate heading" are now closed for the locked path. Only the two documented fallbacks behave as before: (1) a lock at least 10 s old, or the 20 s guard expired, and (2) a lock directory that cannot be created (non-EEXIST mkdir error), where `appendFirst` runs without the lock as a best effort.

## Deviations from Plan

None - plan executed exactly as written. Small implementation choices inside the plan's discretion: the RED failure of the in-flight test surfaces as a byte-level `toEqual` diff showing the duplicated heading bytes (rather than a literal "two `# 2026-10-04` lines" message), and `stress.mjs` reports `pinned to 0 CPU(s) via unpinned` on the TIL_STRESS_CPUS=0 escape hatch and on non-win32/linux platforms.

**Total deviations:** 0.

## Issues Encountered

- A stray `python -` heredoc probe hung (Windows store stub) and was moved to background; no effect on the repo.
- A scripted edit of `test/storage.test.ts` produced an unterminated string literal (a `\n` expanded to a real newline); fixed before the RED commit, caught by the transform error.

## Human Check Pending

The plan's CI human-check (push, then all 4 jobs green on windows-latest and ubuntu-latest x Node 22/24, with the pinning header in each `npm run test:stress` log and both STOR-06 tests passing) is NOT done: per the dispatch instructions the orchestrator pushes and checks CI. This re-runs UAT test 2 for G-01-2.

## Known Stubs

None.

## Threat Flags

None. The new lock directory, the cmd.exe command line and the taskset call are all covered by T-01-18 to T-01-23 in the plan.

## Self-Check: PASSED

- Files exist: `src/storage.ts`, `test/storage.test.ts`, `test/static.test.ts`, `scripts/stress.mjs`, `test/stress.test.ts`, `.github/workflows/test.yml` (all modified, all present)
- Commits exist: dda8814, 7065c7f, 2f620bc, d14d6b7, 7927036
- `git rev-list --count f2b8d65..HEAD` = 5 matches `commits: 5`
