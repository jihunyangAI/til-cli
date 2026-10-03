# Project Research Summary: til-cli

**Researched:** 2026-10-04
**Domain:** Personal TIL (Today I Learned) CLI — append one line to a dated Markdown file
**Primary Environment:** Windows 11, PowerShell + Git Bash, Korean text

---

## Executive Summary

til-cli is a deliberately minimal file-append journal for quick terminal capture — a developer's TIL repo tool that must remain faster and simpler than opening an editor. The research validates this is achievable with a single focused product: `til "text"` appends to `YYYY-MM-DD.md` in a local directory, creating the file with a date heading on the first entry of the day, using append-only writes to guarantee Core Value (never losing or corrupting existing entries).

**Recommended approach:** Use Node.js (>=22.12) + TypeScript + commander for argument parsing, tsdown for bundling to a single ESM file, and vitest for testing. This stack is already installed on the author's machine, eliminates the need to add Go/Rust toolchains, handles Korean UTF-8 argv and output correctly on Windows (the primary risk area), and yields a global command via `npm install -g` with zero runtime ceremony.

**Key risk concentration:** Windows encoding/quoting. The author's primary environment (Windows 11, PowerShell 5.1, Git Bash, console code page 949) is both the most complex and the best-researched surface. Seven critical pitfalls center on encoding, newline handling, date computation in UTC vs local time, and shell quoting traps. All are preventable with explicit UTF-8 writes, local-date logic, and careful arg parsing. The architecture recommendation (functional core / imperative shell, dependency injection, temp-dir testing) makes these concerns *testable* rather than speculative.

---

## Key Findings

### From STACK.md

| Component | Choice | Confidence | Rationale |
|-----------|--------|------------|-----------|
| Runtime | Node.js >=22.12 (develop on Node 24 LTS) | HIGH | Installed; handles UTF-8 argv on Windows; single global command via npm; no additional toolchain |
| Language | TypeScript 7.0.2 | MEDIUM-HIGH | Type safety; `tsc --noEmit` only (no runtime compilation); fallback `typescript@^6` |
| CLI Parser | commander 15.0.0 | HIGH | Widest adoption; stable; ships own types; zero dependencies |
| Bundler | tsdown 0.23.0 (pin exactly) | MEDIUM-HIGH | Successor to tsup; preserves shebang; targets node22.12 |
| Installer | npm global (`npm install -g .`) | HIGH | Creates `til`, `til.cmd`, `til.ps1` on Windows; verified in prototype |
| Storage | `node:fs` + local-date formatting | HIGH | `appendFile(path, text, { encoding: "utf8", flag: "a" })` |
| Testing | vitest 5.0.3 | HIGH | Excellent TS support; compatible with Node floor |

**Critical stack notes:**
- Do NOT use `toISOString().slice(0,10)` — returns UTC, breaks on KST 00:00–09:00 (reproduced)
- Do NOT use `os.EOL` — produces CRLF on Windows; always write explicit UTF-8, no BOM, LF
- Do NOT use `new Date("YYYY-MM-DD")` — parses as UTC midnight
- Do NOT use locale formatting (`toLocaleTimeString()` yields `오후 3:05:00` here)
- Python is a close second but hit `UnicodeEncodeError: 'cp949'` live; Go/Rust toolchains not installed

### From FEATURES.md

**Table stakes (v1):**
- `til "text"` (and unquoted `til some words`) appends to today's `YYYY-MM-DD.md`
- Auto-create file with `# YYYY-MM-DD` heading on first entry
- Append-only, newline-safe writes
- Correct UTF-8 (no BOM, LF) on Windows with Korean text
- Local-timezone "today" (not UTC)
- Storage dir default `~/til` with `TIL_DIR` env override
- `til show [date]` to view entries
- Clear errors, non-zero exit on failure, written path printed on success
- `--help` / `--version`
- Single global install via `npm install -g`

**Differentiators (later):** stdin capture, `-d YYYY-MM-DD` backfill, `til list` of recent days, `til edit [date]` (launch `$EDITOR`), relative dates (`yesterday`), inline `#tags` as plain text.

**Anti-features:** cloud sync, auto git commit/push, encryption, database/index, in-CLI edit/delete, interactive TUI, topics/books, natural-language dates, configurable filename format, multiple journals, export, streaks/reminders, telemetry/auto-update.

### From ARCHITECTURE.md

**Functional core + imperative shell:**
1. **Dependency injection:** `Deps = { now, env, homedir, out, err }`; only `bin` touches `process`
2. **Real filesystem in temp dir:** tests use real `fs` against `mkdtemp`, not mocks
3. **Plan + execute:** pure `planAppend` computes heading + entry as one string; storage performs a single write
4. **Single write, O_APPEND:** no read-modify-write; create with `wx`, fall back to append on EEXIST
5. **Strict date validation:** `^\d{4}-\d{2}-\d{2}$` plus real-calendar check (also blocks path traversal)
6. **Grammar:** bare words = add; reserved subcommands (`show`, `list`, `add`, `help`) only when unambiguous; `til add <text>` and `--` as escapes

**Build order:** (1) core pure functions (date, format, config); (2) storage adapter; (3) CLI shell + `add` end-to-end; (4) read commands; (5) packaging / cross-platform verification.

**On-disk format:**
```markdown
# 2026-10-04

- 09:12 PowerShell 5.1 Get-Content needs -Encoding UTF8 for 한글
- 14:30 toISOString() is UTC
```

### From PITFALLS.md

| # | Pitfall | Risk | Prevention | Phase |
|---|---------|------|-----------|-------|
| 1 | Default file encoding / newline | Mixed encoding silently corrupts entries | Explicit UTF-8 no BOM, LF; strip BOM on read; refuse UTF-16 files; byte-exact tests | 1 |
| 2 | Trailing newline / empty file | New entry glued to last line | Probe last byte; prepend `\n` inside the same write; `size==0` → heading | 1 |
| 3 | UTC date / double clock | 00:00–09:00 KST entries land in yesterday's file | One `now` per invocation; local getters; injected clock tests | 1 |
| 4 | Shell quoting (PS `$5`, `` `t ``, embedded `\"`, bash `!`, leading `-`) | Text mangled before tool sees it | Join argv; support `--`; echo stored text; README cheat-sheet | 1 |
| 5 | Console/pipe output encoding | Korean shows as `?` / mojibake in PS 5.1 | Write UTF-8 bytes explicitly; test shell × TTY/pipe/redirect matrix | 2 |
| 6 | Read-modify-write / races | Concurrent `til` or open editor loses entries | Single `O_APPEND` write; `wx` create; 20-process stress → 20 entries, 1 heading; retry EBUSY/EPERM | 1 |
| 7 | Global install on Windows | `til` not found; `.ps1` blocked; CRLF shebang | LF shebang via `.gitattributes`; `files` includes bin; test `npm i -g` in fresh shells | 1 / final |

Argv decoding of Korean was verified correct in PS 5.1, cmd, and Git Bash on cp949 — the real encoding risks are on the write and output side.

---

## Implications for Roadmap

### Phase 1: Core Append — Foundation and Core Value

**Delivers:** `til "text"` appends to local-date `YYYY-MM-DD.md` (append-only, heading on first entry), UTF-8/LF correctness, `~/til` default + `TIL_DIR` override, errors/exit codes, path confirmation, `--help`/`--version`, local install via `npm link`/`npm i -g .`.

**Key acceptance tests:**
- Unit: local date with injected `now` at 00:30 KST, 23:59:59.999; multiple TZs
- Integration: append Korean + emoji to temp dir; bytes confirm UTF-8 no BOM, LF only
- Stress: 20 parallel `til` processes → 20 entries, exactly 1 heading
- E2E: `til "한글"` from PowerShell 5.1, Git Bash, cmd → correct bytes

### Phase 2: Read Commands + Output Encoding

**Delivers:** `til show [YYYY-MM-DD]`, strict date validation, console/pipe output encoding verified across shells. Optional differentiators (`list`, `-d`, stdin, `yesterday`, `edit`) only if cheap.

### Phase 3: Distribution + Hardening

**Delivers:** global install verified in fresh PS 5.1 / PS 7 / Git Bash / cmd, README with quoting cheat-sheet and shell compatibility matrix, startup latency check, at least one Linux/macOS check.

---

## Confidence Assessment

| Research Area | Confidence | Evidence | Gaps |
|---------------|------------|----------|------|
| Stack | HIGH | Registry-verified versions; working prototype on Windows 11 | TS 7 programmatic API deferred to 7.1; PowerShell 7 unverified |
| Features | MEDIUM | jrnl, nb, dnote, Obsidian Daily Notes landscape | Differentiators not user-validated |
| Architecture | HIGH | Established patterns | Windows `O_APPEND` via libuv not micro-verified |
| Pitfalls | HIGH (Windows), MEDIUM (cross-platform) | Reproduced on Win11 + PS 5.1 + Node 24 | macOS/Linux, PS 7 untested |

---

## Gaps to Address

1. Entry format default: `- text` vs `- HH:MM text`, and whether a toggle exists — decide in Phase 1
2. Bare `til` with no args: show today vs help — decide in Phase 1 grammar
3. Whether `TZ` overrides work for Node on Windows — determines reliance on injected clock in tests
4. Stdin encoding from PowerShell 5.1 — test if stdin is built
5. PowerShell 7 and macOS/Linux verification — final phase
6. Day rollover is 00:00 for v1; configurable cutoff deferred

---

## Sources

- STACK.md (HIGH): npm/PyPI/crates/Go registries checked 2026-10-04; prototype on Windows 11
- FEATURES.md (MEDIUM): jrnl, nb, dnote, Obsidian Daily Notes docs; TIL repo conventions
- ARCHITECTURE.md (HIGH): established CLI design patterns; POSIX O_APPEND semantics
- PITFALLS.md (HIGH for Windows): reproduced on Windows 11 + PowerShell 5.1 + Node 24 + Git Bash, cp949, Asia/Seoul
- PROJECT.md (authoritative): local timezone, append-only, UTF-8, cross-platform, zero-config constraints
