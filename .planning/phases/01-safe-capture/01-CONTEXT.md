# Phase 1: Safe Capture - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Install `til` once (global npm command) and record a one-line learning from any Windows shell (PowerShell 5.1/7, Git Bash, cmd) into today's local-date `YYYY-MM-DD.md` under `~/til` (or `TIL_DIR`). Every entry is appended exactly as typed — Korean and emoji included — and survives repeated runs, concurrent runs, hand-edited files, and failed writes.

Covers: CAPT-01..06, STOR-01..07, CONF-01, CONF-02, DIST-01, DIST-02.
NOT in this phase: reading entries back (`til show`, VIEW-*) and the README (DIST-03) — Phase 2.

</domain>

<decisions>
## Implementation Decisions

Auto mode: every decision below was auto-selected as the recommended option (no user interview). Review before planning if any look wrong.

### Command Grammar
- **D-01:** Bare words are an add: `til <words...>` joins all positional args with single spaces into one entry. — **Reversibility:** one-way — users build muscle memory on the grammar; changing it later breaks habits and scripts.
- **D-02:** Reserved first tokens are `add`, `show`, `list`, `help`. They are subcommands only when they are the first token. `til add <text>` and `til -- <text>` are the escape hatches for text that starts with a reserved word or `-`. — **Reversibility:** one-way — same muscle-memory contract as D-01; reserving `show`/`list` now avoids a breaking change when Phase 2 (and v2 `list`) arrive.
- **D-03:** In Phase 1, `til show ...` and `til list ...` print a short "not available yet" message to stderr and exit 2 (usage error). Phase 2 replaces `show` with the real implementation.
- **D-04:** Bare `til` with no arguments prints the short usage/help text and exits 0 in Phase 1. Phase 2 may change bare `til` to show today's entries (see Deferred).
- **D-05:** `til --help` / `til help` print usage; `til --version` prints the package version. Unknown flags (anything starting with `-` before `--`) are a usage error (exit 2) whose message suggests `til -- <text>`.

### Entry Format & Normalization
- **D-06:** Entry line is `- HH:MM <text>` with 24-hour, zero-padded local time (e.g. `- 09:05 ...`), computed from the same single `now` used for the file date. No locale formatting.
- **D-07:** Text normalization: trim, then collapse any run of whitespace including CR/LF/tab into a single space. No Markdown escaping — the text is stored verbatim otherwise (`#`, `*`, backticks, `$` kept as received).
- **D-08:** Empty or whitespace-only text after normalization → error on stderr, exit 2, nothing written, no directory or file created.

### File Layout & Write Safety
- **D-09:** File name `YYYY-MM-DD.md` (local date). New file content starts with `# YYYY-MM-DD\n\n`. Each entry ends with `\n`. UTF-8 without BOM, LF only, on every OS. — **Reversibility:** one-way — this is the on-disk data contract for the user's archive.
- **D-10:** Write strategy: single append write (`O_APPEND`) containing the full entry; never read-modify-write, never temp-file + rename, never `w` flag. Heading creation uses exclusive create (`wx`); on `EEXIST` fall back to append. If the existing file is non-empty and its last byte is not `\n`, prepend `\n` within the same write.
- **D-11:** If the 20-process stress test shows lost/duplicated lines or duplicate headings on Windows, add a short retry on `EBUSY`/`EPERM` and/or a lock file — the planner should treat the stress test as the gate, not assume `O_APPEND` atomicity.
- **D-12:** On write failure: print an error to stderr that includes the reason and the full unsaved text, exit 1.

### Storage Location
- **D-13:** Default directory is `~/til` (via `os.homedir()`), created recursively on first write. `TIL_DIR` overrides it; a leading `~` in `TIL_DIR` is expanded; relative `TIL_DIR` is resolved against the current working directory. No `--dir` flag and no config file in v1 (CONF-03 is v2).

### Confirmation Output
- **D-14:** On success print two plain-ASCII-framed lines to stdout: `Saved: - HH:MM <text>` and `File: <absolute path>`. No emoji/check-mark glyphs (avoid cp949 console issues). The output writer is built so Phase 2 (`til show`, VIEW-04) reuses it for Korean console output.

### Exit Codes
- **D-15:** `0` success (including help/version), `1` runtime/IO failure, `2` usage error (empty text, unknown flag, unavailable subcommand).

### Packaging & Install
- **D-16:** Package name `til-cli`, `bin: { "til": "dist/cli.mjs" }`, ESM, Node `>=22.12`. Phase 1 install path is `npm install -g .` from the repo (plus `npm link` for development); no `npm publish`. Add `.gitattributes` forcing LF (shebang safety) and a `files` whitelist including `dist/`.
- **D-17:** Stack per PROJECT.md Key Decisions: TypeScript (typecheck only) + commander 15 + tsdown (pinned) + vitest. `node:util parseArgs` is an acceptable swap for commander if commander's variadic/`--` handling fights D-01/D-02 — planner's call.

### Amendments from Phase Research (2026-10-04)
These supersede the wording of earlier decisions where they conflict. Evidence in `01-RESEARCH.md`.
- **D-10a (amends D-10):** Heading creation uses flag `ax` (`O_APPEND|O_CREAT|O_EXCL`), NOT `wx` — a `wx` handle is non-append and overwrote entries appended in the gap (18/20 survived). On `EEXIST` fall back to plain append. Worst case is a cosmetic duplicate heading, never data loss. The 20-process gate passed with `a`/`ax`; no retry/lock needed (D-11 satisfied).
- **D-17a (amends D-17):** Use a hand-rolled pure `parseArgv` (zero runtime dependencies) instead of commander — commander 15 cannot express D-01..D-05 (`til -- show` routes to subcommand, `til help` becomes text, unknown option exits 1 not 2).
- **D-18:** PowerShell 5.1's npm `til.ps1` shim swallows an unquoted `--`. `til` cannot fix this. The unknown-option error message must suggest the PowerShell-safe form `til '--' <text>` (and `til add <text>`); CAPT-03 is verified through the real shims, with PowerShell using the quoted form. Carry the caveat into the Phase 2 README.
- **D-19:** Install flow is `npm install` then `npm install -g .` (symlink, dev) — or `npm pack` + `npm i -g ./til-cli-<version>.tgz` for a real copy. `package.json` has `"private": true` (no accidental publish).
- **D-20:** `.gitattributes` with `* text=auto eol=lf` is committed before any source file (CRLF shebang risk with `core.autocrlf=true`).
- **D-21:** Clock is injected; tests set `process.env.TZ` in-process (works on Windows) and build expected values from local components.
- **D-22:** STOR-04 non-Windows proof: OS-independent byte tests + a static ban on `os.EOL`/locale formatting; add a GitHub Actions windows+ubuntu matrix file, but running it needs a remote that does not exist yet — the non-Windows run is a human-verify / deferred item, not a blocker for Phase 1.
- **D-23:** D-05 applies literally: an argument starting with `-` before `--` is a usage error, even if it contains spaces. Revisit later if annoying.

### Claude's Discretion
- Internal module layout (functional core / imperative shell suggested in research ARCHITECTURE.md).
- Exact wording of help, error, and "not available yet" messages (keep them short; Korean or English both fine — default English).
- Test file organization and how the injected clock is threaded through.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Core Value, constraints (local date, append-only, UTF-8, cross-platform), Key Decisions (stack, entry format, LF/no BOM)
- `.planning/REQUIREMENTS.md` — CAPT-01..06, STOR-01..07, CONF-01..02, DIST-01..02 (this phase)
- `.planning/ROADMAP.md` §Phase 1 — goal, 5 success criteria, planning notes

### Research
- `.planning/research/SUMMARY.md` — consolidated findings
- `.planning/research/STACK.md` — versions (commander 15.0.0, tsdown 0.23.0, vitest 5.0.3, TS 7.0.2, `@types/node@^22`), what NOT to use
- `.planning/research/ARCHITECTURE.md` — component boundaries, `Deps` injection, `planAppend`, build order, on-disk format
- `.planning/research/PITFALLS.md` — Windows encoding/quoting/date/append pitfalls with Phase 1 acceptance tests (byte-exact, midnight clock, 20-process stress)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repo (only `.planning/`, `.claude/CLAUDE.md`, `.gitignore`).

### Established Patterns
- None yet. Phase 1 establishes them (functional core + `Deps` injection recommended).

### Integration Points
- Global npm bin shims (`til`, `til.cmd`, `til.ps1`) on the author's Windows machine; npm global prefix must be on PATH in PowerShell and Git Bash.

</code_context>

<specifics>
## Specific Ideas

- Example day file:
  ```markdown
  # 2026-10-04

  - 09:12 PowerShell 5.1 Get-Content needs -Encoding UTF8 for 한글
  - 14:30 toISOString() is UTC
  ```
- Acceptance tests called out by research: injected clock at 00:30 KST and 23:59:59.999; byte-level check (no BOM, no CR) with Korean + emoji; 20 parallel processes → 20 entries, 1 heading; e2e `til "한글"` from PowerShell 5.1, Git Bash, cmd; at least one non-Windows byte check (WSL or CI) for STOR-04.

</specifics>

<deferred>
## Deferred Ideas

- Bare `til` showing today's entries instead of help — revisit in Phase 2 when `show` exists.
- `--no-time` toggle (CAPT-09), stdin capture (CAPT-07), `-d` backfill (CAPT-08), `--dir` flag/config file (CONF-03), day-rollover cutoff (CONF-04) — v2.

</deferred>

---

*Phase: 01-safe-capture*
*Context gathered: 2026-10-04*
