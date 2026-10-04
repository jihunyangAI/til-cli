# Requirements: til-cli

**Defined:** 2026-10-04
**Core Value:** Typing `til "<one line>"` must reliably append that line to today's dated Markdown file — never losing, overwriting, or corrupting existing entries (including Korean/UTF-8 text).

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Capture

- [x] **CAPT-01**: User can run `til "some text"` and the text is appended as a new entry to today's `YYYY-MM-DD.md`
- [x] **CAPT-02**: User can run `til some words` without quotes and all words are joined into one entry
- [x] **CAPT-03**: User can record text that starts with `-` or with a reserved word (e.g. `show`) by using `til -- <text>` or `til add <text>`
- [x] **CAPT-04**: Each entry is written as a single Markdown list item prefixed with the local time, e.g. `- 14:30 text`; multi-line input is normalized to one line
- [x] **CAPT-05**: User gets a clear error and a non-zero exit code when the entry text is empty or whitespace-only, and nothing is written
- [x] **CAPT-06**: After a successful write, user sees confirmation including the stored text and the file path it was written to

### Storage

- [x] **STOR-01**: The first entry of a day creates the file with a `# YYYY-MM-DD` heading followed by a blank line
- [x] **STOR-02**: Subsequent entries on the same day are appended in order; existing content is never rewritten or truncated
- [x] **STOR-03**: If the day file was hand-edited and lacks a trailing newline, the new entry still starts on its own line
- [x] **STOR-04**: Files are written as UTF-8 without BOM using LF line endings on every OS; Korean text and emoji round-trip byte-exactly
- [x] **STOR-05**: "Today" (file name and heading) is the user's local date, so an entry at 01:30 KST lands in that day's file, not the previous UTC day
- [x] **STOR-06**: Concurrent invocations (e.g. 20 parallel `til` runs) produce every entry exactly once and exactly one heading
- [x] **STOR-07**: If a write fails, user sees an error on stderr that includes the unsaved text, and the exit code is non-zero

### Configuration

- [x] **CONF-01**: With no configuration, entries are stored in `~/til`, created automatically if missing
- [x] **CONF-02**: User can override the storage directory with the `TIL_DIR` environment variable

### Viewing

- [ ] **VIEW-01**: User can run `til show` to print today's entries
- [ ] **VIEW-02**: User can run `til show YYYY-MM-DD` to print that date's entries; invalid or non-calendar dates are rejected with a clear error (no path traversal)
- [ ] **VIEW-03**: User sees a friendly message (not a stack trace) when there are no entries for the requested date
- [ ] **VIEW-04**: Korean text printed by `til show` displays correctly in PowerShell 5.1, PowerShell 7, Git Bash, and cmd

### CLI & Distribution

- [x] **DIST-01**: User can run `til --help` and `til --version`
- [x] **DIST-02**: User can install the tool as a global `til` command (`npm install -g`) and run it from a fresh PowerShell, Git Bash, or cmd window
- [ ] **DIST-03**: User can read a README covering install, usage, storage location, and a shell quoting cheat-sheet (PowerShell `$`/backtick, bash `!`)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Capture

- **CAPT-07**: User can pipe text via stdin (`echo "..." | til`)
- **CAPT-08**: User can backfill an entry for another date with `til -d YYYY-MM-DD "text"`
- **CAPT-09**: User can disable the time prefix (`--no-time` flag or env var)

### Viewing

- **VIEW-05**: User can run `til list` to see recent days with entry counts
- **VIEW-06**: User can use relative dates (`til show yesterday`, `-1`)
- **VIEW-07**: User can run `til edit [date]` to open the day file in `$EDITOR`
- **VIEW-08**: User can search entries across days by keyword or `#tag`

### Configuration

- **CONF-03**: User can set the storage directory via a `--dir` flag or config file
- **CONF-04**: User can configure a day-rollover cutoff for late-night entries

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cloud sync / remote backend | Plain files; users sync the folder with git/Dropbox themselves |
| Auto git commit/push | Puts network on the hot path; users can script it |
| Web / GUI / TUI / interactive prompts | Terminal one-liner tool by design |
| Multi-user / accounts / multiple journals | Personal tool; one directory |
| In-CLI editing or deleting of past entries | Users edit the Markdown files in their editor |
| Database, index, or proprietary format | Plain `.md` files are the point |
| Configurable filename format | Breaks the `YYYY-MM-DD.md` contract |
| Encryption | Adds key management; out of character for a plain-text archive |
| Natural-language date parsing | Complexity without matching value |
| Export formats, streaks, reminders, stats | Feature creep beyond quick capture |
| Telemetry / auto-update | Not appropriate for a local personal tool |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAPT-01 | Phase 1 | Complete |
| CAPT-02 | Phase 1 | Complete |
| CAPT-03 | Phase 1 | Complete |
| CAPT-04 | Phase 1 | Complete |
| CAPT-05 | Phase 1 | Complete |
| CAPT-06 | Phase 1 | Complete |
| STOR-01 | Phase 1 | Complete |
| STOR-02 | Phase 1 | Complete |
| STOR-03 | Phase 1 | Complete |
| STOR-04 | Phase 1 | Complete |
| STOR-05 | Phase 1 | Complete |
| STOR-06 | Phase 1 | Complete |
| STOR-07 | Phase 1 | Complete |
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| DIST-01 | Phase 1 | Complete |
| DIST-02 | Phase 1 | Complete |
| VIEW-01 | Phase 2 | Pending |
| VIEW-02 | Phase 2 | Pending |
| VIEW-03 | Phase 2 | Pending |
| VIEW-04 | Phase 2 | Pending |
| DIST-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-10-04*
*Last updated: 2026-10-04 after roadmap creation (traceability mapped)*
