# Roadmap: til-cli

## Overview

til-cli ships in two vertical slices. Phase 1 is the whole MVP: a globally installed `til` command that turns one line of text into a `- HH:MM text` item in today's local-date `YYYY-MM-DD.md`, and never loses, overwrites, or garbles an entry. That covers Korean text on Windows, hand-edited files, concurrent runs, and failed writes. Phase 2 adds `til show` to print a day's entries with Korean displayed correctly in every Windows shell, plus a README that takes a new user from install to first entry.

## Phases

**Phase Numbering:**
- Integer phases (1, 2): Planned milestone work
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Safe Capture** - Globally installed `til "..."` appends to today's local-date Markdown file, and no entry is ever lost or garbled
- [ ] **Phase 2: Read Back & README** - `til show [date]` prints a day's entries with correct Korean output, and the README covers everything from install to daily use

## Phase Details

### Phase 1: Safe Capture
**Goal**: The user can install `til` once and record a one-line learning from any Windows shell into today's local-date Markdown file. Every entry is kept exactly as typed (Korean and emoji included), even across repeated runs, concurrent runs, and failed writes.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06, STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, STOR-06, STOR-07, CONF-01, CONF-02, DIST-01, DIST-02
**Success Criteria** (what must be TRUE):
  1. After `npm install -g`, running `til "오늘 배운 것"` in a fresh PowerShell, Git Bash, or cmd window succeeds and prints the stored text and the full path of the file it wrote to. With no configuration that file is under `~/til` (created automatically). Setting `TIL_DIR` sends entries to that directory instead.
  2. The first entry of the day creates `YYYY-MM-DD.md`, named for the local date (an entry at 01:30 KST lands in that day's file, not the previous UTC day's). The file starts with a `# YYYY-MM-DD` heading and a blank line. Each entry is one `- HH:MM text` list item: unquoted words (`til some words`) are joined, and multi-line input is collapsed onto one line.
  3. Entries only ever accumulate:
     - A second entry appears below the first.
     - An entry added to a hand-edited file that lacks a trailing newline starts on its own line.
     - 20 parallel `til` runs leave all 20 entries, each exactly once, under exactly one heading.
     - The file stays UTF-8 without BOM, uses only LF line endings, and keeps Korean and emoji byte-exact.
  4. `til -- -text` and `til add show me` record their text literally instead of treating it as a flag or subcommand. `til --help` and `til --version` respond.
  5. Empty or whitespace-only input gives a clear error and a non-zero exit code, and writes nothing. A failed write (e.g. an unwritable storage directory) prints an error on stderr that includes the unsaved text, and exits non-zero.
**Plans**: TBD

**Notes for planning:**
- Open grammar decision for discuss-phase: what bare `til` with no arguments does (print today's entries or print help). CAPT-05 only covers empty or whitespace text.
- Windows `O_APPEND` atomicity through libuv has not been tested directly. The 20-process stress test (STOR-06) settles it. If it fails, fall back to `wx` create plus EBUSY/EPERM retry.
- Inject a clock into date tests. It is unverified whether `TZ` overrides work for Node on Windows.
- STOR-04 says "every OS". Include at least one non-Windows run (WSL or a CI runner) when checking bytes.
- The confirmation output (CAPT-06) prints Korean text through the same console path that VIEW-04 checks in Phase 2. Build that output writer here.

### Phase 2: Read Back & README
**Goal**: The user can print any day's learnings in the terminal, with Korean displayed correctly in every Windows shell. A new user can get from the README alone to a working `til`.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, DIST-03
**Success Criteria** (what must be TRUE):
  1. `til show` prints today's entries, and `til show 2026-10-03` prints that date's entries.
  2. Malformed or non-calendar dates (e.g. `til show 2026-02-30`, `til show ../secret`) are rejected with a clear error and a non-zero exit code, and nothing outside the storage directory is ever read. A valid date that has no file gets a friendly "no entries" message, not a stack trace.
  3. Korean entries printed by `til show` display correctly (no `?` or mojibake) in PowerShell 5.1, PowerShell 7, Git Bash, and cmd.
  4. The README covers install, recording and showing entries, where files are stored (`~/til`, `TIL_DIR`), and a quoting cheat-sheet (PowerShell `$` and backtick, bash `!`). Following it in a fresh shell yields a working `til`.
**Plans**: TBD
**UI hint**: no

**Notes for planning:**
- Research flag: PowerShell 7 output behavior has not been checked. Also check output when piped or redirected (`til show | more`, `til show > out.md`), per Pitfall 5.
- `UI hint: no` is deliberate. The `VIEW-*` IDs refer to terminal output, not a graphical UI.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safe Capture | 0/TBD | Not started | - |
| 2. Read Back & README | 0/TBD | Not started | - |
