---
phase: 01-safe-capture
reviewed: 2026-10-05T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/storage.ts
  - scripts/stress.mjs
  - test/storage.test.ts
  - test/static.test.ts
  - test/stress.test.ts
  - .github/workflows/test.yml
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 01: Code Review Report (incremental, plan 01-05)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Scope: gap-closure plan 01-05 (per-day mkdir lock, contended stress gate). The directory is not a git repository in this environment, so `git diff f2b8d65..HEAD` could not be run; the six files were reviewed in full against the 01-05 plan.

The locked happy path is sound. Traced interleavings:
- creator vs. waiter on a 0-byte file;
- waiter that saw ENOENT while the creator ran start to finish;
- release followed by a late `mkdirSync`;
- lock-free append past a held lock.

None of them can produce a second heading or lose an entry. `ax` create plus one `writeAll`, and lock-free append only after `size > 0`, hold the invariant, and `rmdirSync` cannot remove user content.

The weak spots are the paths that leave the lock:
- The stale/expired takeover is not mutually exclusive, so it can still produce a duplicate heading. The code comment claims it is safe.
- Lock release gives up silently after about 50 ms.
- The stress test can pass vacuously with zero trials.

No critical issues.

The prior phase review items outside these files (WR-01..WR-03, IN-02..IN-05) are not re-evaluated here. Prior WR-04 (stress test asserting an unguaranteed invariant) and IN-01 (accepted duplicate-heading race) are resolved for the locked path by this plan. Their residual is WR-01 below.

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Stale-lock / expired-guard takeover is not mutually exclusive, so two takers can still write two headings

**File:** `src/storage.ts:134-146` (race inside `appendExisting` at `:66-78`)
**Issue:** When the lock is at least 10 s old, or the 20 s guard has expired, every waiter that observes this runs `appendFirst` without holding anything. The comment at `:138-139` says this is safe "because the day file is now non-empty". That holds only after the first taker's write lands. The realistic trigger is a killed `til` that left a 0-byte day file (killed between `ax` and the write) plus a lock. Two later runs started close together:
- W1 and W2 both see `lockAgeMs >= LOCK_STALE_MS`.
- Both call `appendFirst`. W1's `ax` creates the file or hits EEXIST, and W2 hits EEXIST.
- Both reach `appendExisting`, and both `fstat` size 0 before either `writeAll` runs.
- Both write `dayHeading + line`, giving two `# date` headings.

The `fstat` to `write` gap in `appendExisting` is not atomic. The same thing happens when the 20 s deadline expires for several waiters at once behind a very slow live holder. A waiter whose guard expired also runs `releaseLock` on a lock it does not own, removing a live holder's lock. That is harmless only while the file is non-empty. No test covers concurrent stale takers, so the "closed except two documented fallbacks" claim is unproven for N greater than 1.

**Fix:** Make the takeover re-contend through the same atomic step instead of writing unlocked. For example, on a stale lock:
```ts
if (stale || Date.now() >= deadline) {
  try { rmdirSync(lock); } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') { appendFirst(file, date, line); return file; } // cannot clear: documented best effort
  }
  if (Date.now() < hardDeadline) continue; // loop back to mkdirSync(lock): only one process wins
}
```
This cuts the multi-taker window from the whole `appendFirst` duration down to the rmdir-to-mkdir gap. A re-stat of the lock's mtime immediately before `rmdirSync` narrows it further. If a literal best-effort fallback is kept, say plainly in the comment that it can duplicate the heading when several processes take over together. Add a test with several concurrent stale takers (worker threads) over a 0-byte file.

### WR-02: Stress test passes vacuously when `TIL_STRESS_TRIALS` is not a positive integer

**File:** `test/stress.test.ts:8, 11, 68, 90`
**Issue:** `Number(process.env.TIL_STRESS_TRIALS ?? '1')` is `NaN` for `abc`, `0` for `''` or `'0'`, and fractional or negative values are accepted. `for (let n = 0; n < TRIALS; n++)` then runs zero iterations and both tests pass with no processes spawned. `scripts/stress.mjs` validates the value, but `npx vitest run test/stress.test.ts` directly (or a CI env typo) bypasses it. `Math.max(120000, NaN)` is also `NaN`, which is an undefined timeout. The plan's own T-01-22 says a green gate must mean the race was exercised. Zero trials is the opposite.
**Fix:**
```ts
const TRIALS = Number(process.env.TIL_STRESS_TRIALS ?? '1');
if (!Number.isInteger(TRIALS) || TRIALS < 1) {
  throw new Error(`TIL_STRESS_TRIALS must be an integer >= 1, got "${process.env.TIL_STRESS_TRIALS}"`);
}
```

### WR-03: `releaseLock` gives up silently after about 50 ms and ignores EACCES, leaving litter and flaking the readdir gate on Windows

**File:** `src/storage.ts:41-52` (consumed by `test/stress.test.ts:52`)
**Issue:** The retry budget is 10 x 5 ms and covers only EBUSY and EPERM. On Windows, an AV scanner or indexer holding the directory, or a read-only/delete-pending state, commonly surfaces as EACCES as well, and CPU starvation under the 2-CPU pin makes a 50 ms wall-clock budget small. When release fails:
- The empty `.YYYY-MM-DD.md.lock` directory stays in the user's archive directory, permanently and silently.
- `checkCommon`'s `readdirSync(dir) === [day.md]` assertion fails. That looks like a duplicate-heading regression but is a lock-hygiene flake, and it is the main source of false red on the contended Windows jobs.

The leftover is not a correctness problem for that day, because the file is non-empty and never needs the lock again. It is still litter, with no signal to the user.
**Fix:** Retry EACCES too, and bound by elapsed time rather than attempt count (for example about 500 ms). Optionally make `stress.test.ts` tolerate leftover empty lock directories and assert them separately, so the heading assertion stays the signal:
```ts
if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') return;
```

## Info

### IN-01: Fallback for any non-EEXIST `mkdirSync` error bypasses the lock, including transient Windows delete-pending EPERM

**File:** `src/storage.ts:130-133`
**Issue:** Any mkdir error other than EEXIST goes straight to an unlocked `appendFirst`. On Windows a lock directory whose delete is pending returns EPERM/EACCES to `mkdirSync`. That is only safe if the releasing holder had already written. It holds except when that holder's write failed (for example ENOSPC after `ax` left a 0-byte file), which leaves two unlocked writers with the same duplicate-heading window as WR-01. The case is very narrow, but cheap to close.
**Fix:** Treat EPERM/EACCES/EBUSY as "lock busy" for a bounded number of short retries before falling back (same loop as EEXIST, capped), so the lock stays authoritative on Windows.

### IN-02: Untested and unguarded lock paths

**File:** `test/storage.test.ts:135-215`, `test/static.test.ts:24-42`
**Issue:** There are no tests for:
- the 20 s deadline fallback;
- the non-EEXIST mkdir fallback;
- `releaseLock` retry or failure;
- concurrent stale takers;
- a user file at the lock path (T-01-21).

The plan's prohibition "never delete recursively or unlink" is `verification: review` only. Nothing in the static ban list would catch a later `rmSync(..., { recursive: true })` or `unlinkSync` in `src/storage.ts`.
**Fix:** Add a static ban such as `/\brmSync\b|\bunlinkSync\b|rmdirSync\([^)]*recursive/` (the existing `mkdirSync(dir, { recursive: true })` must stay allowed), and a storage test that places a regular file at the lock path, backdates it, and asserts the entry is saved and the file is left intact.

### IN-03: A crashed holder makes the next first-of-day `til` hang silently for up to 10 s

**File:** `src/storage.ts:15, 134-137`
**Issue:** The age is measured from the lock's creation. A run within 10 s of the crash (a user re-running right after Ctrl-C, or a CI retry) blocks with no output, up to 20 s in the worst case. This conflicts with the project's "faster than opening an editor" constraint. The wait has no stderr hint, and the user will likely Ctrl-C again and produce another stale lock.
**Fix:** Print a one-line stderr notice after about 1 s of waiting, for example "til: waiting for a previous write to finish". This needs a passed-in notice callback, because `storage.ts` must not use `console`.

### IN-04: `scripts/stress.mjs` pinning edge cases and misleading header

**File:** `scripts/stress.mjs:32-33, 46, 41-43`
**Issue:**
- `((1 << n) - 1)` overflows for n >= 31 (wrong or zero mask at 32). `TIL_STRESS_CPUS` of 31 or more on a machine with that many cores gives an invalid or wrong affinity.
- On platforms other than win32 and linux (macOS), the default silently runs unpinned and prints "pinned to 0 CPU(s) via unpinned". That is a contradictory header, and a green run there is not contended evidence.
- On Linux, if the allowed CPU set excludes CPUs 0-1 (cpuset-restricted container), `taskset -c 0-1` fails with a generic error instead of a clear message.

**Fix:** Use `((1n << BigInt(n)) - 1n).toString(16)` and clamp n to 64. Print `unpinned (no pinning support on <platform>)`, and optionally exit non-zero on non-pinnable platforms unless `TIL_STRESS_CPUS=0` is explicit.

### IN-05: Workflow budget and duplicate triggers

**File:** `.github/workflows/test.yml:3-5, 12`
**Issue:** The stress step is 2 scenarios x 40 trials x 20 processes pinned to 2 CPUs. Planning-time measurements on a loaded machine ranged 148-548 s per run, and the per-test timeout allows 600 s each. Worst case (about 20 min for the stress step plus `npm ci` and `npm test`) is tight against `timeout-minutes: 30`, and a timeout will read as a failure of the gate. `on: push` together with `on: pull_request` also runs all four jobs twice per PR push (prior review IN-06, still open).
**Fix:** Raise the job timeout to 45 minutes, or lower the CI trial count while keeping the 2-CPU pinning. Restrict `push` to the default branch.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
