---
status: diagnosed
phase: 01-safe-capture
source: [01-VERIFICATION.md]
started: 2026-10-04T14:20:00Z
updated: 2026-10-04T15:33:06Z
---

## Current Test

[testing complete]

## Tests

### 1. Fresh-window Hangul rendering in PowerShell 5.1, cmd and Git Bash
Open a fresh PowerShell 5.1 window, a fresh cmd window and a fresh Git Bash window (real console, not a spawned child). Run `til "오늘 배운 것"` in each, with TIL_DIR pointed at a scratch directory.
expected: `Saved:` shows readable Hangul (no `?` or mojibake), `File:` shows a path, and the day file holds the exact Hangul bytes.
result: pass

### 2. CI matrix on a GitHub remote
Push the repo to a GitHub remote and let .github/workflows/test.yml run the ubuntu-latest and windows-latest x Node 22/24 matrix.
expected: All 4 jobs are green, including `npm run test:stress` on ubuntu (POSIX O_APPEND evidence for STOR-04/STOR-06).
result: issue
reported: "CI run 37210646435 (https://github.com/jihunyangAI/til-cli/actions/runs/37210646435): 3/4 jobs green; test (windows-latest, 24) failed at npm run test:stress - STOR-06 '20 parallel identical entries: no de-duplication, one heading' got two '# 2026-10-04' headings (test/stress.test.ts:57 via :90)"
severity: major

### 3. Decision on review warning WR-01 (mid-argv `--` removal)
`til learned that -- ends options` stores `learned that ends options` (pinned by test/args.test.ts:40, design D-02). Accept as designed or change it.
expected: A recorded decision: accept, or fix so mid-argv `--` is kept or reported.
result: pass
decision: accept as designed (D-02) — user, 2026-10-04

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-2
  truth: "All 4 CI matrix jobs are green, including npm run test:stress (STOR-06: concurrent first writes of a day produce exactly one heading)"
  status: failed
  reason: "User reported: CI run 37210646435 - test (windows-latest, 24) failed npm run test:stress; 20 parallel processes produced two '# 2026-10-04' headings in one day file (test/stress.test.ts:57). windows-22 and both ubuntu jobs passed."
  severity: major
  test: 2
  root_cause: "Check-then-act race in src/storage.ts: appendEntry creates the day file with openSync(file,'ax') and only later writes dayHeading+entry in a separate writeSync, leaving a visible 0-byte window; losers (EEXIST) go to appendExisting, whose fstat size===0 branch (added in 01-03 for touched/crash-left empty files) writes a second heading when it lands in that window. Fires under CPU contention (preempted creator); entries are never lost. Previously accepted as residual risk (01-RESEARCH.md:285, 01-03-SUMMARY Residual Risk); D-11 gate failure requires re-plan."
  artifacts:
    - path: "src/storage.ts"
      issue: "appendEntry: file create ('ax') and heading+entry write are not atomic (visible 0-byte window)"
    - path: "src/storage.ts"
      issue: "appendExisting: size===0 => write heading cannot distinguish truly empty file from creator's transient 0-byte state"
    - path: "test/stress.test.ts"
      issue: "No defect, but only exercises the race under CPU contention; idle local runs give false confidence"
  missing:
    - "Heading decision must not depend on a possibly-transient 0-byte state (e.g. atomic create-with-content via temp file + linkSync(tmp, file) EEXIST-safe without violating D-10, or bounded re-check in appendExisting, or exclusive lock)"
    - "Stress gate must add CPU contention on Windows (e.g. CPU affinity pinning or more trials) so the race is actually exercised"
  debug_session: ".planning/debug/duplicate-day-heading-concurrent.md"
