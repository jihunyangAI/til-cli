# Feature Research

**Domain:** Minimal TIL / quick-capture journaling CLI (one line -> today's `YYYY-MM-DD.md`)
**Researched:** 2026-10-04
**Confidence:** MEDIUM (landscape from jrnl, nb, dnote, Obsidian Daily Notes docs and general knowledge of "TIL repo" conventions; web searches were shallow and mostly confirmed known facts. Feature judgments are opinionated synthesis, not measured user data.)

## Landscape Summary

| Tool | Core shape | What it teaches us |
|------|-----------|--------------------|
| jrnl | Single journal file; `jrnl "text"` quick entry, natural-language dates (`yesterday:`), `@tags`, search/filter, `--edit`, optional AES encryption, multiple journals, export (md/json/txt) | The one-line positional-arg capture UX is the gold standard. Everything else (encryption, multi-journal, export, config file) is where it grows heavy. |
| nb | Git-backed notebook of many notes, tags, wiki links, search, bookmarks, encryption, browser UI, sync | Shows scope creep endpoint. Its useful lesson: plain files + git-friendly storage is what power users value. |
| dnote | Per-"book" microlessons, `dnote add <book> -c "..."`, `view`, `find`, optional server sync | Closest in spirit (TIL). Books + server sync + SQLite are exactly what PROJECT.md rules out (cloud, DB). |
| Obsidian Daily Notes | One note per day named `YYYY-MM-DD` by default, configurable folder, template file, date format | Validates the file-per-day, ISO-name convention and a configurable folder. Template/format flexibility is optional polish. |
| "TIL" GitHub repos | Markdown files, dated or topic-based, rendered on GitHub | Output should be a clean `# date` heading plus bullet list that renders on GitHub. |

Takeaway: the shared core is `<cmd> "text"` -> persisted plain text with a timestamp, plus a way to read it back. Everything else is accretion.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-command capture: `til "text"` | jrnl/dnote set this expectation; defeats the "faster than opening an editor" purpose otherwise | LOW | Join all positional args so unquoted `til hello world` also works (avoids shell-quoting friction, esp. PowerShell). |
| Append to today's `YYYY-MM-DD.md` | The product definition | LOW | Open with append mode only; never read-modify-write the whole file. |
| Auto-create file with date heading on first entry of the day | Obsidian/TIL-repo convention; file must be self-describing | LOW | Create heading `# YYYY-MM-DD` only when file absent/empty; use exclusive-create or check size under append. |
| Entry as Markdown list item (`- text`), optional `HH:MM` prefix | Renders on GitHub, matches PROJECT.md | LOW | Format e.g. `- 14:32 text` or `- text`. Pick one default; time toggle is cheap. |
| Entries accumulate in order, never overwrite | Core Value | LOW | Append-only; ensure trailing newline handling so a hand-edited file lacking a final newline does not glue entries onto one line. |
| Correct UTF-8 (Korean) on Windows/macOS/Linux | Primary use case per PROJECT.md; mojibake is the most likely real-world failure | MEDIUM | Write bytes as UTF-8 explicitly (no BOM, LF or consistent newline), do not rely on console code page. Windows argv decoding depends on runtime choice; this is a stack-selection criterion. |
| Local-timezone "today" | PROJECT.md constraint; 1am KST must be local date | LOW | Use local-time date, not UTC. Test around midnight. |
| Predictable storage dir with sensible default (e.g. `~/til`) and override | jrnl/Obsidian both have configurable location | LOW | Env var (`TIL_DIR`) first; optional config file later. Create directory if missing. |
| View today's entries | PROJECT.md active requirement; read-back confirms capture worked | LOW | `til show` / `til` with no args. Print file contents. |
| View a given date's entries | PROJECT.md active requirement | LOW | `til show 2026-10-03`; accept `YYYY-MM-DD`; clear error if the file does not exist. |
| `--help` and `--version` | Baseline for any installable CLI | LOW | Comes free with most CLI frameworks. |
| Non-zero exit code and clear error on failure (unwritable dir, bad date) | Scripts and the user must know capture failed; silent loss violates Core Value | LOW | Print the written path on success (or on `-v`) as confirmation. |
| Installable as one global command | PROJECT.md active requirement | LOW-MEDIUM | Depends on stack (npm -g / pipx / single binary). Windows PATH story must work. |

### Differentiators (Competitive Advantage)

Aligned with Core Value (reliable, instant, never corrupts) rather than feature breadth.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero-config first run | "Faster than an editor": no init, no prompts, no config file needed | LOW | Defaults + auto-create dir. Most competitors (jrnl, nb) have a setup step. |
| Stdin capture (`echo "x" \| til`, also `-`) | Composes with shell pipelines/clipboard; cheap | LOW | Read stdin when not a TTY and no args. Watch Windows PowerShell stdin encoding (UTF-16 by default for some pipes). |
| Print the written path / confirmation line | Trust: user sees exactly where the line went | LOW | Tiny, high value for a tool whose promise is "never lose". |
| Multi-line / single-writer safety (atomic-ish append, no partial lines) | Differentiates on the Core Value; concurrent shells or editor open on the file should not corrupt | LOW-MEDIUM | Single `write` of a complete line in append mode; document that an editor with the file open may overwrite on save. |
| `til list` / `til ls` of recent days (dates + entry counts) | Lightweight way to browse the archive without leaving the CLI | LOW | Directory listing filtered by `YYYY-MM-DD.md`. |
| `til search <term>` (substring across files) | Cheap value from plain files; jrnl/nb/dnote all have find | LOW-MEDIUM | Simple scan; but `grep`/`rg` already work on plain files, so keep this optional/P2. |
| Relative date shortcuts for viewing (`yesterday`, `-1`) | Nice ergonomics from jrnl's natural-language dates | LOW | Only for `show`; do not add NLP parsing. |
| Backfill with explicit date (`til -d 2026-10-03 "text"`) | Forgetting yesterday's TIL is common; jrnl supports this | LOW | Must still respect append-only and local-date semantics. |
| Hashtag convention in text (`#python`) with zero special handling | Greppable tagging without any tag subsystem | LOW | It is just text; document the convention. Optional later: `til show --tag`. |
| Open in `$EDITOR` (`til edit [date]`) | Bridges to "edit past entries in your editor" (PROJECT.md says edit files directly) | LOW | Just launch the editor on the path; explicitly does not add in-CLI editing. |
| Git-repo-friendly output (stable formatting, LF, trailing newline) | Fits TIL repos; diffs are clean | LOW | Mostly a result of discipline in the table-stakes writer. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Cloud sync / remote backend | "Access everywhere" | Explicitly Out of Scope; conflict handling, auth, and secrets dwarf the tool | Point the storage dir at a git/Dropbox/OneDrive folder |
| Auto git commit/push after each entry | TIL-repo workflow looks natural | Network/auth failures on the hot path slow capture and can fail a "save"; surprises users with commits | Document `cd ~/til && git add . && git commit`; maybe a separate opt-in command much later |
| Encryption (jrnl-style) | Privacy | Breaks greppable plain-Markdown promise; key management; data-loss risk | OS-level disk encryption or private repo |
| Database / index / SQLite (dnote-style) | Fast search, metadata | Explicitly Out of Scope; second source of truth that can drift from the files | Scan files; they are small |
| In-CLI editing/deleting of past entries | "Fix a typo" | Explicitly Out of Scope; risks the append-only guarantee | `til edit` opens the file in the user's editor |
| Interactive prompts / TUI / wizard | Friendly onboarding | Slows capture; breaks scripting; contradicts zero-config | Flags and sensible defaults |
| Topics/"books"/categories and subfolders | Organization (dnote, nb) | Changes the one-file-per-day model and adds a taxonomy to maintain | Inline `#tags` in text |
| Natural-language date parsing for capture | jrnl does it ("yesterday: ...") | Heavy dependency, ambiguity, locale issues (Korean) | Explicit `-d YYYY-MM-DD` |
| Rich templates / configurable filename formats (Obsidian-style Moment tokens) | Obsidian parity | Breaks the predictable `YYYY-MM-DD.md` contract and any tool reading it; large config surface | Fixed format; configurable directory only |
| Multiple journals / profiles | jrnl feature | Multiplies config and code paths for one user | Use `TIL_DIR` per invocation if needed |
| Export formats (JSON/HTML/PDF) | Reporting | Already Markdown; GitHub/any viewer renders it | None needed |
| Web/GUI, multi-user, accounts | Convenience | Explicitly Out of Scope | n/a |
| Reminders / streaks / stats / gamification | Habit building | Notification infra, state; peripheral to capture reliability | Out of scope; at most `til list` shows counts |
| Timestamps via UTC or configurable timezone | "Correctness" | Violates local-date constraint; extra config | Always system local time |
| Auto-update / telemetry | Maintenance | Trust and complexity for a personal tool | Standard package manager upgrades |

## Feature Dependencies

```
Storage dir resolution (default + TIL_DIR override)
    └──required by──> Append entry (create dir/file, date heading, list item)
                          ├──requires──> Local-date resolution
                          ├──requires──> UTF-8 writer (no BOM, explicit encoding)
                          └──requires──> Newline-safe append (ensure prior final newline)

Show today / Show date ──requires──> Storage dir resolution + UTF-8 reader (stdout encoding on Windows)

Global install ──enables──> everything for real-world use (independent code, stack-dependent)

Backfill (-d DATE) ──requires──> Date validation shared with Show date
Relative dates (yesterday, -1) ──enhances──> Show date
Stdin capture ──enhances──> Append entry
List days ──enhances──> Show date
Search ──requires──> Storage dir resolution (and enhances List/Show)
Edit in $EDITOR ──requires──> Date resolution + path resolution

Cloud sync / DB / encryption / in-CLI edit ──conflicts──> Plain-file, append-only Core Value
Configurable filename format ──conflicts──> Predictable YYYY-MM-DD.md contract
```

### Dependency Notes

- **Append entry requires storage dir, local date, UTF-8 writer:** these three are the shared foundation; Core Value is decided here, so build and test them first, including Korean text and midnight boundaries.
- **Show date requires the same date parsing/validation as backfill:** implement one date parser, reuse for both.
- **Output encoding is a separate Windows risk from file encoding:** viewing Korean content in PowerShell/Git Bash can mojibake even when the file is correct; show must handle stdout encoding.
- **Stdin capture enhances but is not required by append:** safe to defer, but shares the Windows encoding risk.
- **Configurable filename format conflicts with the file contract:** keep filename fixed so `show`, `list`, and `search` stay trivial.

## MVP Definition

### Launch With (v1)

Matches PROJECT.md Active requirements exactly; nothing more.

- [ ] `til "text"` (all args joined) appends `- [HH:MM ]text` to today's file — the product
- [ ] Auto-create dir + file with `# YYYY-MM-DD` heading on first entry — zero-config
- [ ] Local-timezone date; append-only, newline-safe writes — Core Value
- [ ] UTF-8 (no BOM) for files, argv, and output, verified on Windows with Korean text — primary-risk requirement
- [ ] Storage dir default `~/til` with `TIL_DIR` env override — "predictable, configurable"
- [ ] `til show [date]` (today by default) — read-back requirement
- [ ] Clear errors + non-zero exit codes; print written path on success; `--help`/`--version`
- [ ] Single global install command — requirement

### Add After Validation (v1.x)

- [ ] Backfill via `-d/--date YYYY-MM-DD` — trigger: first time the user forgets to log a day
- [ ] Stdin capture — trigger: wanting to pipe clipboard or command output
- [ ] `til list` (recent days with counts) — trigger: wanting to browse without `ls`
- [ ] `til edit [date]` opening `$EDITOR` — trigger: fixing a typo in a past entry
- [ ] Time-prefix toggle flag/env (if v1 picks only one default) — trigger: preference feedback
- [ ] `yesterday` / `-1` for `show` — trigger: frequent yesterday lookups

### Future Consideration (v2+)

- [ ] `til search <term>` — defer: `grep`/`rg` already solve it on plain files
- [ ] `show --tag` using inline `#tags` — defer: needs real usage to justify
- [ ] Config file (`~/.config/til/config`) — defer: env var suffices until more settings exist
- [ ] Optional opt-in git helper — defer: risks hot-path failures; weigh after use

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Single-command append (`til "..."`) | HIGH | LOW | P1 |
| Auto-create file + date heading | HIGH | LOW | P1 |
| Append-only, newline-safe | HIGH | LOW | P1 |
| UTF-8/Korean correctness on Windows | HIGH | MEDIUM | P1 |
| Local-date handling | HIGH | LOW | P1 |
| Storage dir default + env override | HIGH | LOW | P1 |
| Show today / show date | HIGH | LOW | P1 |
| Global install | HIGH | LOW-MEDIUM | P1 |
| Errors/exit codes/path confirmation/help | MEDIUM | LOW | P1 |
| Backfill `--date` | MEDIUM | LOW | P2 |
| Stdin capture | MEDIUM | LOW | P2 |
| `til list` | MEDIUM | LOW | P2 |
| `til edit` | MEDIUM | LOW | P2 |
| Relative dates for show | LOW | LOW | P3 |
| Search | LOW | MEDIUM | P3 |
| Tag filtering | LOW | MEDIUM | P3 |
| Config file | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | jrnl | nb | dnote | Our Approach |
|---------|------|----|-------|--------------|
| Quick one-line capture | `jrnl "text"` | `nb add "text"` | `dnote add <book> -c "text"` | `til "text"` (no book, no setup) |
| Storage | Single text/encrypted file per journal | Git-backed note files | SQLite + optional server | One plain `.md` per day |
| Date handling | NL dates (`yesterday:`) | File timestamps | Created-at metadata | Local date; explicit `-d` later |
| Tags/organization | `@tags`, multiple journals | Tags, notebooks, links | Books | Inline `#tags` text only |
| Search | Filters by tag/date/text | Full-text search | `dnote find` | Defer to `grep`; optional later |
| Edit past entries | `--edit` in editor | `nb edit` | `dnote edit` | Open file in `$EDITOR`; no in-CLI editing |
| Sync | External (Dropbox) | Git | Server | None; user syncs folder |
| Encryption | AES optional | Optional | None | None (anti-feature) |
| Config | Config file, setup on first run | Config/env | Config file | Zero-config; `TIL_DIR` env |

## Sources

- [jrnl Command-Line Journal and Note Capture Tool](https://sharedcontext.ai/skills/external/agentskillexchange/jrnl-command-line-journal-and-note-capture-tool) — MEDIUM (secondary summary)
- [Top 5 open source terminal note-taking applications (DEV)](https://dev.to/jianzcar/top-5-open-source-terminal-note-taking-applications-mhh) — MEDIUM
- [4 command line note-taking applications for Linux (opensource.com)](https://opensource.com/article/18/3/command-line-note-taking-applications) — MEDIUM
- [Obsidian Daily notes help](https://obsidian.md/help/plugins/daily-notes) — HIGH (official; default `YYYY-MM-DD` name, configurable folder/format/template)
- Author's prior knowledge of jrnl, nb, dnote CLIs and "TIL repo" conventions — MEDIUM (not re-verified against current docs this session)
- `.planning/PROJECT.md` — authoritative for scope and Out of Scope list

---
*Feature research for: minimal TIL / quick-capture journaling CLI*
*Researched: 2026-10-04*
