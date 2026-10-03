# til-cli

## What This Is

"오늘 배운 한줄을 날짜별 마크다운에 누적하는 CLI" — a small command-line tool that takes one line of "Today I Learned" text and appends it to a Markdown file named after the current date (e.g. `2026-10-04.md`). It is for a single developer who wants to capture learnings from the terminal in under a few seconds, without opening an editor, and end up with a plain-Markdown archive that is readable and greppable anywhere.

## Core Value

Typing `til "<one line>"` must reliably append that line to today's dated Markdown file — never losing, overwriting, or corrupting existing entries (including Korean/UTF-8 text).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can record one learning with a single command (`til "..."`) and it is appended to today's `YYYY-MM-DD.md`
- [ ] Today's file is created automatically (with a date heading) the first time an entry is added that day
- [ ] Each entry is a Markdown list item, optionally prefixed with the time it was recorded
- [ ] Repeated entries on the same day accumulate in order; existing content is never overwritten
- [ ] Korean and other UTF-8 text round-trips correctly on Windows, macOS, and Linux terminals
- [ ] Entries are stored in a predictable, configurable directory (sensible default in the user's home)
- [ ] User can view today's entries (and a given date's entries) from the CLI
- [ ] Tool is installable as a single global command

### Out of Scope

- Cloud sync / remote backend — files are plain Markdown; users can sync the folder with git/Dropbox themselves
- Web or GUI interface — terminal-only tool by design
- Multi-user / accounts — personal tool
- Rich editing of past entries inside the CLI — users edit the Markdown files directly in their editor
- Databases or proprietary storage formats — plain `.md` files are the whole point

## Context

- Originated from a one-line idea (auto mode, no interview): "til-cli: 오늘 배운 한줄을 날짜별 마크다운에 누적하는 CLI".
- The author works on Windows 11 (PowerShell + Git Bash); Korean text input is a primary use case, so console encoding and file encoding (UTF-8, no mojibake) matter on Windows specifically.
- "TIL" (Today I Learned) repos are a common developer habit, usually organized as dated or topic-based Markdown files; the output should look natural in such a repo and render well on GitHub.
- Greenfield: no existing code. Stack is not yet chosen — to be decided by research (a single-binary or single-package-install CLI is preferred).

## Constraints

- **Storage format**: Plain UTF-8 Markdown files, one per day, named `YYYY-MM-DD.md` — keeps data portable, diffable, and editor-friendly
- **Append safety**: Writes must be append-only to the day file — Core Value is never losing prior entries
- **Date**: "Today" is determined by the user's local timezone, not UTC — a learning at 1am KST belongs to that local date
- **Cross-platform**: Must work on Windows (PowerShell, Git Bash) as well as macOS/Linux — the author's primary environment is Windows
- **Simplicity**: Small surface area; zero required configuration for first use — the tool must be faster than opening an editor

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One Markdown file per day (`YYYY-MM-DD.md`) | Stated in the idea ("날짜별 마크다운"); simple, greppable, git-friendly | — Pending |
| Append-only writes | Protects the Core Value (no data loss) | — Pending |
| Local timezone for "today" | Matches the user's sense of "today" | — Pending |
| Project lives in its own folder `til-cli/` with its own git repo | Parent folder contains unrelated files | ✓ Good |
| Implementation language/runtime | Deferred to research | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-04 after initialization*
