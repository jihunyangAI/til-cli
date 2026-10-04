---
status: testing
phase: 01-safe-capture
source: [01-VERIFICATION.md]
started: 2026-10-04T14:20:00Z
updated: 2026-10-04T14:20:00Z
---

## Current Test

number: 1
name: Fresh-window Hangul rendering in PowerShell 5.1, cmd and Git Bash
expected: |
  `Saved:` shows readable Hangul (no `?` or mojibake), `File:` shows a path, and the day file holds the exact Hangul bytes.
awaiting: user response

## Tests

### 1. Fresh-window Hangul rendering in PowerShell 5.1, cmd and Git Bash
Open a fresh PowerShell 5.1 window, a fresh cmd window and a fresh Git Bash window (real console, not a spawned child). Run `til "오늘 배운 것"` in each, with TIL_DIR pointed at a scratch directory.
expected: `Saved:` shows readable Hangul (no `?` or mojibake), `File:` shows a path, and the day file holds the exact Hangul bytes.
result: [pending]

### 2. CI matrix on a GitHub remote
Push the repo to a GitHub remote and let .github/workflows/test.yml run the ubuntu-latest and windows-latest x Node 22/24 matrix.
expected: All 4 jobs are green, including `npm run test:stress` on ubuntu (POSIX O_APPEND evidence for STOR-04/STOR-06).
result: [pending]

### 3. Decision on review warning WR-01 (mid-argv `--` removal)
`til learned that -- ends options` stores `learned that ends options` (pinned by test/args.test.ts:40, design D-02). Accept as designed or change it.
expected: A recorded decision: accept, or fix so mid-argv `--` is kept or reported.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
