---
phase: 01-safe-capture
verified: 2026-10-04T14:20:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".github/workflows/test.yml"
  - ".planning/phases/01-safe-capture/01-01-PLAN.md"
  - ".planning/phases/01-safe-capture/01-01-SUMMARY.md"
  - ".planning/phases/01-safe-capture/01-02-PLAN.md"
  - ".planning/phases/01-safe-capture/01-02-SUMMARY.md"
  - ".planning/phases/01-safe-capture/01-03-PLAN.md"
  - ".planning/phases/01-safe-capture/01-03-SUMMARY.md"
  - ".planning/phases/01-safe-capture/01-04-PLAN.md"
  - ".planning/phases/01-safe-capture/01-04-SUMMARY.md"
  - "package.json"
  - "scripts/stress.mjs"
  - "scripts/test-install.mjs"
  - "src/cli.ts"
  - "src/config.ts"
  - "src/core/args.ts"
  - "src/core/format.ts"
  - "src/run.ts"
  - "src/storage.ts"
covered_digest: "v2:sha256:7632068d6d9f89dd275caf4cd378b7d50a9766122efe0634a37feb14d82f6249"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open a fresh PowerShell 5.1 window, a fresh cmd window and a fresh Git Bash window (real console, not a spawned child). Run `til \"오늘 배운 것\"` in each, with TIL_DIR pointed at a scratch directory."
    expected: "`Saved:` shows readable Hangul (no `?` or mojibake), `File:` shows a path, and the day file holds the exact Hangul bytes."
    why_human: "Console code-page rendering (cp949 vs UTF-8), fresh-window PATH pickup and ExecutionPolicy cannot be observed from a non-interactive session. The shim matrix proves the bytes on disk, not the glyphs on screen."
  - test: "Push the repo to a GitHub remote and let .github/workflows/test.yml run the ubuntu-latest and windows-latest x Node 22/24 matrix."
    expected: "All 4 jobs are green, including `npm run test:stress` on ubuntu (POSIX O_APPEND evidence for STOR-04/STOR-06 on a non-Windows OS)."
    why_human: "No GitHub remote exists, so the workflow has never run (deferred per D-22)."
  - test: "Decide on review warning WR-01: a `--` that is not the first argument is silently removed from the recorded text (`til learned that -- ends options` stores `learned that ends options`). Accept as designed (D-02) or change it."
    expected: "A recorded decision: accept, or fix so mid-argv `--` is kept or reported."
    why_human: "This is a design decision pinned by test/args.test.ts:40. Phase goal says entries are kept exactly as typed, so the call belongs to the developer."
---

# Phase 1: Safe Capture Verification Report

**Phase Goal:** The user can install `til` once and record a one-line learning from any Windows shell into today's local-date Markdown file. Every entry is kept exactly as typed (Korean and emoji included), even across repeated runs, concurrent runs, and failed writes.
**Verified:** 2026-10-04
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

Verified against the code and by running it, not from the SUMMARY files. All five ROADMAP success criteria hold. The only open items are real-console rendering, the CI run, and one design decision.

### Observable Truths

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|-----------------------------------|--------|----------|
| 1 | After `npm install -g`, `til "오늘 배운 것"` works from PowerShell/Git Bash/cmd, prints stored text and full file path; default dir `~/til` auto-created; `TIL_DIR` overrides | VERIFIED (rendering needs human) | `npm run test:install` exit 0: PowerShell, cmd and Git Bash shims each record Korean+emoji; day file byte-checked. `npm ls -g` shows til-cli@0.1.0 linked to the repo; `til --version` prints `0.1.0`. Manual run: `Saved: - 23:14 오늘 배운 것 😀` + `File: <abs path>`. With TIL_DIR unset and HOME/USERPROFILE redirected, `<home>/til/2026-10-04.md` was created. `src/config.ts` `resolveDir` handles default, `~`, relative paths. |
| 2 | First entry creates local-date `YYYY-MM-DD.md` with `# YYYY-MM-DD` + blank line; each entry is one `- HH:MM text` item; unquoted words joined; multi-line collapsed | VERIFIED | Manual: file began `# 2026-10-04\n\n- 23:14 ...` (xxd: `23 20 ...0a 0a 2d 20`), multi-line arg `a\nb` stored as `- 23:14 a b`. `src/core/format.ts` builds dates from `getFullYear/getMonth/getDate` (local components, no UTC/ISO slicing). vitest includes injected-clock tests at 00:30/01:30, TZ Asia/Seoul and 23:59:59.999/00:00 truncation; all pass. |
| 3 | Entries only accumulate: appended in order; hand-edited file without trailing LF handled; 20 parallel runs = 20 entries once under one heading; UTF-8, no BOM, LF only, Korean/emoji byte-exact | VERIFIED | `src/storage.ts`: `ax` exclusive create, else `a+` open + single write, 1-byte last-byte probe adds `\n`; no truncate/read-modify-write. `npm run test:stress` passed (20 processes x 10 trials). `npx vitest run`: 9 files, 154 tests pass, including the start-state table (missing/0-byte/LF/no-LF/CRLF/lone CR/BOM). Manual hexdump: no BOM, no 0x0D, Hangul bytes `ec 98 a4 eb 8a 98`. `dist/cli.mjs` has 0 CR bytes. |
| 4 | `til -- -text` and `til add show me` record literally; `--help`/`--version` respond | VERIFIED | Manual: `-text` and `show me` stored verbatim. All three shims pass `--`, `add`, `--version`, `--help` in test:install (PowerShell uses `til '--' -dash`; unquoted `til -- -dash` in PowerShell is a documented npm .ps1 shim limitation, exits 2 with a hint). |
| 5 | Empty/whitespace input: clear error, non-zero, nothing written; failed write: stderr includes unsaved text, non-zero | VERIFIED | Manual: `til ""` gives `til: nothing to save: text is empty`, exit 2, no file. TIL_DIR pointing at a regular file gives `could not save entry: EEXIST...` + `Unsaved: - 23:14 lost text 한글`, exit 1. Covered by cli/run/e2e/storage tests. |

**Score:** 5/5 roadmap truths verified (0 behavior-unverified). PLAN-frontmatter truths (D-xx edge rows) are covered by the 154 passing tests and the manual runs above; none failed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/cli.ts` | shebang entry, `process.exitCode = run(...)` | VERIFIED | Present, wired; `dist/cli.mjs` starts `#!/usr/bin/env node\n`. |
| `src/run.ts` | dispatch, USAGE, version, Saved/File output, Unsaved path | VERIFIED | Exhaustive switch with `never` check; one `deps.now()` read per add. |
| `src/core/args.ts` | full D-01..D-05 grammar | VERIFIED | Pure `parseArgv`; reserved words only as exact first arg. |
| `src/core/format.ts` | local date/time/format helpers | VERIFIED | Local getters only. |
| `src/config.ts` | `resolveDir` | VERIFIED | Wired from `run.ts`. |
| `src/storage.ts` | `appendEntry` with `ax` + `a+` | VERIFIED | Single write per entry; the only `node:fs` module. |
| `scripts/stress.mjs`, `test/stress.test.ts` | 20-process gate | VERIFIED | Runs and passes. |
| `scripts/test-install.mjs` | shim matrix | VERIFIED | Runs and passes; tarball has only `dist` + `package.json`. |
| `.github/workflows/test.yml` | windows+ubuntu x Node 22/24 | EXISTS, NEVER RUN | Content correct; no remote (human item 2). |
| `package.json` | `bin.til`, no `dependencies`, scripts | VERIFIED | No `dependencies` key; `private: true`; `engines >=22.12`. |
| `.gitattributes` | `* text=auto eol=lf` | VERIFIED | Present; also `*.cmd eol=crlf`. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `src/cli.ts` | `src/run.ts` | `run(process.argv.slice(2), realDeps())` | WIRED |
| `src/run.ts` | `src/core/args.ts` | `switch (cmd.kind)` on `parseArgv` | WIRED |
| `src/run.ts` | `src/storage.ts` / `src/config.ts` | `appendEntry(resolveDir(...))` | WIRED |
| `src/run.ts` | `package.json` | JSON import, inlined into `dist/cli.mjs` | WIRED (`--version` from built binary prints 0.1.0) |
| `test-install.mjs` | npm shims | `npm pack` -> temp-prefix install -> powershell.exe / cmd.exe / bash | WIRED (ran) |
| `package.json` `bin` | `dist/cli.mjs` | global link | WIRED (`til --version` works from PATH) |

### Data-Flow Trace (Level 4)

Argv -> `parseArgv` -> `normalizeText` -> `entryLine` -> `appendEntry` -> file bytes. Manual hexdump confirms real text reaches disk and the `Saved:` line echoes the same string. No static or hollow data sources.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npm run typecheck` | exit 0, no errors | PASS |
| Unit/integration | `npx vitest run` | 9 files, 154 tests passed | PASS |
| 20-process concurrency x10 | `npm run test:stress` | 2 tests passed | PASS |
| Shim matrix | `npm run test:install` | "all shells passed" | PASS |
| Global install | `til --version` | `0.1.0` | PASS |
| Korean/emoji, escapes, empty, write failure, default dir | manual runs with temp TIL_DIR / temp HOME | as expected (see truths 1-5) | PASS |

### Probe Execution

No `probe-*.sh` declared or present. Step skipped.

### Requirements Coverage

All 17 IDs appear in the union of the four PLAN `requirements` fields, and all are marked Complete in REQUIREMENTS.md.

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| CAPT-01 | 01-01, 01-02 | SATISFIED | Manual append to dated file |
| CAPT-02 | 01-02 | SATISFIED | Unquoted words joined (`오늘 배운 것 😀`) |
| CAPT-03 | 01-02, 01-04 | SATISFIED | `--` and `add` verified in 3 shells (but see WR-01 for mid-argv `--`) |
| CAPT-04 | 01-03 | SATISFIED | `- HH:MM text`, multi-line collapsed |
| CAPT-05 | 01-02 | SATISFIED | Exit 2, nothing written |
| CAPT-06 | 01-01, 01-03 | SATISFIED | `Saved:` + `File:` printed (WR-02 caveat) |
| STOR-01 | 01-01, 01-03 | SATISFIED | Heading + blank line, incl. 0-byte file |
| STOR-02 | 01-01, 01-03 | SATISFIED | Append-only, prefix preserved |
| STOR-03 | 01-03 | SATISFIED | Missing-LF test row |
| STOR-04 | 01-01, 01-03, 01-04 | SATISFIED on Windows; non-Windows run pending CI | Hexdump/shim byte checks |
| STOR-05 | 01-03 | SATISFIED | Local components, injected-clock tests |
| STOR-06 | 01-03 | SATISFIED | Stress gate passes |
| STOR-07 | 01-01, 01-03 | SATISFIED | Unsaved text on stderr, exit 1 |
| CONF-01 | 01-01, 01-03 | SATISFIED | `<home>/til` auto-created |
| CONF-02 | 01-01, 01-03 | SATISFIED | TIL_DIR override |
| DIST-01 | 01-02, 01-04 | SATISFIED | help/version through each shim |
| DIST-02 | 01-01, 01-04 | SATISFIED | Global `til` linked; shims work. Fresh-window check is human item 1. |

Orphaned requirements: none. VIEW-01..04 and DIST-03 are mapped to Phase 2, not Phase 1.

### Anti-Patterns Found

TBD/FIXME/XXX/TODO scan over `src`, `test`, `scripts`, `.github`: no matches. No stubs, no empty handlers.

Review findings (01-REVIEW.md: 0 critical, 4 warnings, 6 info; all disposition `open`), checked against the code:

| ID | Confirmed? | Effect on goal | Severity |
|----|-----------|----------------|----------|
| WR-01 mid-argv `--` dropped silently | Yes, reproduced: `til learned that -- ends options` saved `learned that ends options`, exit 0 | Contradicts "exactly as typed" only for text containing a literal `--` token; consistent with D-02 and pinned by a test; no success criterion requires otherwise | WARNING, needs developer decision (human item 3) |
| WR-02 `Saved:` write inside the try that reports `Unsaved:` | Yes, in `src/run.ts` | Only triggers if stdout write throws after a successful save (closed pipe). Would then report "could not save" for a saved entry and invite a duplicate. Not hit in any normal path | WARNING |
| WR-03 U+0085/C0 separators not collapsed | Yes, `/\s+/` only; manual run stored U+0085 as `escx` with the char removed by the shell, so not exercised. Narrow edge | Could split a line in non-JS viewers | WARNING |
| WR-04 stress test asserts "exactly one heading" which D-10a documents as not guaranteed | Plausible; passed 10x trials here | Possible rare false red | WARNING |
| IN-01..IN-06 | Not individually re-tested | IN-06 is relevant: CI never runs `test:install` | INFO |

None of these block a success criterion, so none are listed as gaps. WR-01 and WR-02 are the two most worth fixing before the data-fidelity claim is called airtight.

### Human Verification Required

1. **Fresh-window Hangul rendering.** Test: in fresh PowerShell 5.1, cmd and Git Bash windows, run `til "오늘 배운 것"` with a scratch TIL_DIR. Expected: readable Hangul in `Saved:`, correct path in `File:`. Why human: real console code page and PATH/ExecutionPolicy behavior are not observable from a spawned child.
2. **Ubuntu/Windows CI run.** Test: push to a GitHub remote. Expected: all four matrix jobs green. Why human: no remote exists yet (D-22).
3. **WR-01 decision.** Accept mid-argv `--` removal as designed, or change it. Why human: design call that touches the "kept exactly as typed" promise.

### Gaps Summary

No gaps. All five roadmap success criteria and all 17 requirement IDs are backed by code that exists, is wired, and was exercised by the checks I ran myself (typecheck, 154 tests, stress gate, shim matrix, global `til --version`, manual byte-level runs in a temp directory; no entries were written to the real `~/til`). Status is `human_needed` solely because of the three items above.

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
