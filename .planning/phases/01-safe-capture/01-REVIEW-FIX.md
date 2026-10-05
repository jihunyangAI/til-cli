---
phase: 01-safe-capture
fixed_at: 2026-10-05T21:30:00Z
review_path: .planning/phases/01-safe-capture/01-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/01-safe-capture/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (fix_scope critical_warning; IN-01..IN-05 untouched)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Stale-lock / expired-guard takeover is not mutually exclusive (fixed: requires human verification)

**Files modified:** `src/storage.ts`, `test/stale-takeover-race.test.ts` (new), `test/stale-takeover.test.ts` (new)
**Commit:** 9cd424b
**Applied fix:** A stale lock (at least 10 s old) or a lock instance that has blocked the writer for 20 s is no longer permission to write unlocked. The writer re-reads the lock mtime immediately before `rmdirSync` and removes the lock only if the mtime still equals the one it waited on (so a fresh lock made by another taker is not removed), then loops back to `mkdirSync`, which picks exactly one winner. The 20 s guard now resets whenever a different lock instance appears. A lock that cannot be read or cleared (for example a user file or non-empty directory at the lock path) falls back to the documented best-effort unlocked write and is never released by the non-owner. Removed the old behavior where an expired waiter called `releaseLock` on a lock it did not own.

Tests:
- `stale-takeover-race.test.ts` is a deterministic interleaving (fs `statSync` hook): a waiter sees a stale lock, another process takes it over and holds it, and the holder completes while the waiter waits. It was observed failing on the old code (waiter removed the live holder's lock) and passes now.
- `stale-takeover.test.ts` spawns 12 real `til` processes x 8 rounds over a 0-byte day file plus a stale lock and asserts one heading and every entry exactly once. It is a probabilistic regression guard: it also passed on the old code (including under 2-CPU affinity), because the unlocked window is very small.

Residual (documented in the code comment): a taker that stalls between its mtime re-check and `rmdirSync` while a rival completes remove-and-create can still remove the rival's fresh lock. Pure rmdir/mkdir cannot close this (rename/link are banned by D-10). The 20 s deadline path has no automated test (it would need a 20 s wait or a clock mock).

### WR-02: Stress test passes vacuously when `TIL_STRESS_TRIALS` is not a positive integer

**Files modified:** `test/stress.test.ts`
**Commit:** 82b6208
**Applied fix:** The module throws unless `TIL_STRESS_TRIALS` parses to an integer >= 1. Verified manually: `0`, `abc`, empty, `1.5` and `-2` all fail the file at import (before the fix, `0` passed with 2 green tests and no processes spawned); `1` still passes.

### WR-03: `releaseLock` gives up after about 50 ms and ignores EACCES

**Files modified:** `src/storage.ts`, `test/storage-release.test.ts` (new)
**Commit:** 642bbb1
**Applied fix:** `releaseLock` retries EBUSY, EPERM and EACCES until a 500 ms time budget runs out (5 ms sleeps), and still never throws. Other errnos return at once. The new test injects `rmdirSync` failures through a `node:fs` mock: 25 consecutive failures per errno are retried past the old 10-attempt budget; an endless failure is bounded at roughly 500 ms, leaves the lock directory behind and does not throw; ENOENT is not retried. The EBUSY/EPERM/EACCES rows failed before the fix.

## Verification

Edits, commits and gates all ran in the main checkout (no isolated worktree), because the build, `node_modules` and the stress gate need the real tree and a worktree has no `node_modules`. The results are reproducible from this checkout. No push was made.

- `npm run typecheck`: exit 0
- `npm run build`: ok
- `npm test`: 12 files, 167 tests passed
- `npm run test:stress` (40 trials x 2 scenarios x 20 processes, `start /affinity 3`, Windows 11, Node 24.12): 2 passed, exit 0, 98 s

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
