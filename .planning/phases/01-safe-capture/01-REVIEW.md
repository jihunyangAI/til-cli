---
phase: 01-safe-capture
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - .gitattributes
  - .github/workflows/test.yml
  - .gitignore
  - package.json
  - scripts/stress.mjs
  - scripts/test-install.mjs
  - src/cli.ts
  - src/config.ts
  - src/core/args.ts
  - src/core/format.ts
  - src/run.ts
  - src/storage.ts
  - test/args.test.ts
  - test/cli.test.ts
  - test/config.test.ts
  - test/e2e.test.ts
  - test/format.test.ts
  - test/global-setup.ts
  - test/helpers.ts
  - test/run.test.ts
  - test/static.test.ts
  - test/storage.test.ts
  - test/stress.test.ts
  - tsconfig.json
  - tsdown.config.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

The append path (`src/storage.ts`) is sound for the stated threat model: `ax` create then `a+` fallback, a single write per entry, no read-modify-write, local-date components, LF-only UTF-8. I found no data-loss or overwrite path in the normal flow, and no security issues (no shell/eval/network, `TIL_DIR` is user-controlled by design). The first-of-day duplicate-heading race is the documented, accepted residual risk (D-10a/D-11) and is noted only as Info.

The real defects are at the edges of the core value ("never corrupting what the user typed"). A mid-sentence `--` is silently deleted from the recorded text. Success output sits inside the try block that reports "Unsaved". `normalizeText` does not enforce the single-line invariant for all line-break characters. The stress test asserts an invariant the design explicitly does not guarantee.

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A `--` that is not the first argument is silently dropped from the recorded text

**File:** `src/core/args.ts:24-28`
**Issue:** `collectText` treats the first `--` anywhere in argv as the end-of-options marker, discards it, and appends the remaining arguments. `til learned that -- ends options` records `learned that ends options`, with the `--` removed. Exit code 0 and the `Saved:` line show the already-altered text, and nothing signals the change. This is the fidelity guarantee in the Core Value ("never ... corrupting"), and the case is real for a developer note-taking tool (CLI flags, shell idioms). `test/args.test.ts:40` (`['words','--','--help']` -> `'words --help'`) encodes this behaviour as intended, so it is a design decision. I flag it because the loss is silent and unrecoverable (the user must notice the missing token themselves).
**Fix:** Only honour `--` as the escape when it is the first argument (after an optional `add`). Anywhere else, keep it as ordinary text, or reject it as a usage error. For example:
```ts
function collectText(args: readonly string[]): Command {
  let rest = args;
  if (rest[0] === '--') rest = rest.slice(1);        // escape only in leading position
  const words: string[] = [];
  for (const arg of rest) { /* option check only before first text word, or keep -x strictness */ }
}
```
If mid-argv `--` must stay an escape, at minimum print a notice on stderr that the token was consumed.

### WR-02: Success output is inside the `try` that reports "could not save entry / Unsaved"

**File:** `src/run.ts:55-69`
**Issue:** `deps.out('Saved: ...')` is executed inside the same `try` as `appendEntry`. If the output write throws after the entry is already on disk (closed/broken stdout, a pipe closed by the consumer, a throwing injected `out`), the catch prints `could not save entry` plus `Unsaved: <line>` and returns 1 for an entry that was saved. The user retries and the entry is duplicated, which violates "never corrupt entries" and misleads the user. `process.stdout` write errors on pipes can also surface as an unhandled async `error` event (EPIPE), which `cli.ts` does not handle, so a successful save can end with a stack trace and a non-zero exit code.
**Fix:** Narrow the try to the write only:
```ts
let file: string;
try {
  file = appendEntry(resolveDir(deps.env, deps.homedir(), deps.cwd()), date, line);
} catch (e) {
  deps.err(/* unsaved report */);
  return 1;
}
deps.out('Saved: ' + line.trimEnd() + '\nFile: ' + file + '\n');
return 0;
```
In `realDeps`, also attach `process.stdout.on('error', () => {})` so an EPIPE after a successful save cannot change the outcome.

### WR-03: `normalizeText` does not guarantee a single line for all Unicode line separators

**File:** `src/core/format.ts:14`
**Issue:** `/\s+/` covers CR, LF, U+2028 and U+2029, but not U+0085 (NEL) or the C0 separators U+001C-U+001F. Python `str.splitlines()`, some editors and pagers, and `grep`/viewers built on them treat those as line breaks, so the one-line `- HH:MM text` item can be split in the user's archive. Other control characters (ESC U+001B, BEL, DEL) are also stored verbatim and echoed in `Saved:`, so pasted terminal escape sequences are written to the file and replayed to the terminal. `test/run.test.ts:97` and `test/format.test.ts:72` deliberately pin only U+3000/U+00A0 collapsing and U+200B preservation; the control-character cases are untested.
**Fix:**
```ts
export function normalizeText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f\u0085]/g, ' ') // keep \t\n\v\f\r for \s below
    .replace(/\s+/g, ' ')
    .trim();
}
```
Add test rows for U+0085, U+001C and U+001B.

### WR-04: The stress test asserts an invariant the design documents as not guaranteed (latent flake)

**File:** `test/stress.test.ts:57` (also `:39-45`, `:62`)
**Issue:** `checkCommon` requires exactly one `# ` heading from 20 simultaneous first-of-day writers. D-10a/D-11 state the worst case is a cosmetic duplicate heading: process A creates the file with `ax` (size 0), process B then sees `size === 0` in `appendExisting` and writes its own heading before A's write lands. The window is tiny, but the test is the Phase 1 "gate" and runs 10x in `test:stress` and in CI on two OSes. A rare red run will look like data corruption when it is the accepted race. Separately, `trial` returns `{ dir, date: before }` after the second midnight straddle (`attempt >= 1`), which then fails an unrelated assertion.
**Fix:** Either assert the real guarantee (every entry appears exactly once, `# <date>` appears at least once and the first line is the heading, no other heading text) and report duplicates as a soft warning, or fix the race for real (see IN-01). Make the second-straddle case skip, not fail.

## Info

### IN-01: First-of-day duplicate heading race (accepted, D-10a/D-11)

**File:** `src/storage.ts:12-28, 30-46`
**Issue:** The `size === 0` check in `appendExisting` is separated from `ax` creation by a window in which a concurrent creator has produced a 0-byte file. Result is a second `# date` heading, never data loss. Documented and accepted; listed for completeness only.
**Fix:** None required. If it ever needs closing, have the creator write the heading before any other process can observe an empty file (for example create the file with the heading plus first line in one atomic step, which `ax` + single write already approximates), or drop the `size === 0` heading branch for files that already exist and rely on `ax` for the heading.

### IN-02: Partial write / no durability handling in `writeAll`

**File:** `src/storage.ts:5-10`
**Issue:** `writeAll` loops until `off` reaches `buf.length` but has no guard if `writeSync` returns 0 (would spin forever). If it throws mid-entry (ENOSPC), a partial line stays on disk while the CLI prints "Unsaved:", so a retry duplicates a fragment. The next append does prefix `\n`, so structure survives. There is no `fsync` before `closeSync`, so an OS crash or power loss right after `Saved:` can lose the entry.
**Fix:** Throw if `writeSync` returns 0; consider `fsyncSync(fd)` before close (cost is small for a one-line append).

### IN-03: `TIL_DIR` is trimmed for the blank test but used untrimmed otherwise

**File:** `src/config.ts:9-12`
**Issue:** `'   '` falls back to the default, but `' ~/notes '` or `' /data '` is used verbatim, creating a directory with leading/trailing spaces. Inconsistent and surprising (Windows strips trailing spaces silently).
**Fix:** Use `const raw = env.TIL_DIR?.trim()` and test `!raw`.

### IN-04: Invisible literal characters in test sources

**File:** `test/run.test.ts:100`, `test/format.test.ts:73-75`
**Issue:** The tests embed literal U+3000, U+00A0 and U+200B characters in string literals. They are invisible in review and editors, and normalizing tools can silently change them, turning the tests into no-ops (the injection scanner also flags them). `test/args.test.ts` and `test/run.test.ts:85` already use `　`-style escapes elsewhere.
**Fix:** Replace with escapes such as `'a　b'`, `'a b'` and `'​'`.

### IN-05: `scripts/test-install.mjs` robustness

**File:** `scripts/test-install.mjs:64, 194`
**Issue:** `packOut.slice(packOut.search(/^\[\s*$/m))` yields the last character when no match is found (`search` returns -1), so a changed npm output format fails with an opaque `JSON.parse` error. `rmSync` in `finally` can throw (EBUSY on Windows, locked temp dirs) and mask or flip the real result.
**Fix:** Check `idx >= 0` and throw a clear message. Wrap cleanup in try/catch and warn.

### IN-06: CI does not exercise the Windows shim matrix

**File:** `.github/workflows/test.yml:24-28`
**Issue:** The only test of the real user path (`til.ps1`/`til.cmd`/Git Bash) is `npm run test:install`, which exits 0 as "skipped" on non-Windows and is not run anywhere in the workflow, including `windows-latest`. Also `on: push` plus `on: pull_request` runs every PR branch push twice.
**Fix:** Add `- run: npm run test:install` gated on `runner.os == 'Windows'`; restrict `push` to the default branch.

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
