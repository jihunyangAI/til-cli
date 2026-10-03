# Pitfalls Research

**Domain:** Personal "TIL" CLI that appends one line to a per-day Markdown file (Windows 11 primary, Korean text, PowerShell + Git Bash)
**Researched:** 2026-10-04
**Confidence:** HIGH for items marked [VERIFIED] (reproduced on the author's machine: Windows 11, PowerShell 5.1.26100, Node v24.12.0, Git Bash MINGW64, system code page 949, TZ Asia/Seoul); MEDIUM for items marked [KNOWN] (well-documented platform behavior, not reproduced here); LOW items are flagged explicitly.

Stack is not chosen yet. Examples use Node because it is installed here, but every pitfall maps to Python/Go/Rust/.NET too. Where a pitfall is runtime-specific it says so.

## Critical Pitfalls

### Pitfall 1: Relying on the runtime's default file encoding / newline translation

**What goes wrong:**
Entries are written in the wrong encoding (CP949, UTF-16, or UTF-8 with BOM) or with the wrong line endings, so a file ends up with mixed encodings. Mixed encodings are the worst case: Korean text in old lines becomes unreadable when one entry is written differently. This silently violates the Core Value ("never corrupt existing entries").

**Why it happens:**
- Python `open(path, "a")` uses `locale.getpreferredencoding()` = `cp949` on this machine and text mode translates `\n` to `\r\n`. Python 3 also raises `UnicodeEncodeError` for characters CP949 cannot encode (emoji).
- Node `fs.appendFileSync(path, str)` defaults to UTF-8 (safe), but developers then build lines with `os.EOL`, which is `"\r\n"` on Windows [VERIFIED], giving CRLF on Windows and LF elsewhere in the same repo.
- Windows PowerShell 5.1 `Add-Content` / `Set-Content` write ANSI/CP949: `Add-Content x.md "한글"` produced bytes `C7 D1 B1 DB 0D 0A` [VERIFIED]. `>` / `Out-File` default to UTF-16LE with BOM [KNOWN]; `Out-File -Encoding utf8` adds a BOM in 5.1 [KNOWN]. If the user ever appends by hand with PowerShell 5.1, the day file becomes mixed-encoding.
- PowerShell 5.1 `Get-Content t.md` (no `-Encoding`) reads UTF-8 Korean as CP949 and prints `?`/garbage [VERIFIED]. The user will think the file is corrupt when it is fine.

**How to avoid:**
- Always pass an explicit encoding and newline policy: bytes in = UTF-8, bytes out = UTF-8, **no BOM**, newline = LF. Build one string `"\n- 14:05 text\n"`, encode to a Buffer, write once. Never use `os.EOL`, Python text mode default newline, or `console.log` to construct file content.
- Python: `open(p, "ab")` and write encoded bytes, or `open(p, "a", encoding="utf-8", newline="\n")`.
- Decide line ending explicitly: write LF always (GitHub renders either; LF avoids mixed endings when the folder is a git repo with `autocrlf`). If appending to an existing file whose first line ends in CRLF, match it (one cheap read of the first 4 KB). Do not rewrite existing lines.
- When reading an existing file for `list`/`show`: decode UTF-8 and strip a leading BOM (`EF BB BF`). If the first bytes are `FF FE` or `FE FF` (UTF-16 from `>` redirection), refuse to append and print a clear message instead of appending UTF-8 to a UTF-16 file.
- Make `til show`/`til list` the supported way to view entries, and in docs say "use `Get-Content -Encoding UTF8` in Windows PowerShell 5.1".

**Warning signs:**
- `file`/hexdump of a day file shows `C7 D1 B1 DB` (CP949) or `FF FE` or `EF BB BF` at offset 0.
- `git diff` shows `^M` on some lines but not others.
- Tests only run with ASCII fixtures.

**Phase to address:**
Phase 1 (core append). Add an automated test that appends Korean + emoji + `\r\n`-containing input and asserts exact bytes (no BOM, only LF, valid UTF-8).

---

### Pitfall 2: Missing trailing newline / empty-file edge cases when appending

**What goes wrong:**
The existing file does not end with `\n` (the user edited it in an editor that does not add a final newline, or a previous write was cut short), so the new entry is glued onto the last line: `- 14:05 first- 14:09 second`. Related failures: a 0-byte file (created by `touch` or a crash after create) gets an entry but no date heading; heading is written twice; the heading is written after entries.

**Why it happens:**
"Append" is implemented as `write(line + "\n")`, assuming the file always ends with a newline. The "first entry of the day" check is `fs.existsSync(file)` rather than "file is empty/does not start with a heading".

**How to avoid:**
- Before appending to an existing non-empty file, read the last byte (open, `fstat` size, read 1 byte at `size-1`). If it is not `\n`, prepend a newline to the same buffer you are about to write. Do it inside the single write, not as a separate write.
- Treat "needs heading" as `size === 0` (or file missing), not as "file missing".
- Heading + blank line + first entry goes into one buffer: `"# 2026-10-04\n\n- 14:05 text\n"`. Markdown needs the blank line after a heading to render reliably in all renderers; list items directly after a heading work in GitHub but not in every renderer.
- Collapse any `\r`/`\n` inside the user's text to a single space before writing. An entry containing a newline (pasted text, here-string) otherwise breaks out of the list item and can inject a heading or code fence.
- Trim the text; reject empty / whitespace-only input with a non-zero exit code and a message, rather than writing `- 14:05 `.

**Warning signs:**
- Two entries on one line after hand-editing a file.
- Tests never start from "existing file without final newline" or "empty file".

**Phase to address:**
Phase 1 (core append). Table-driven test of start states: missing, empty, ends with `\n`, ends without `\n`, ends with `\r\n`, has BOM, has heading already.

---

### Pitfall 3: Date computed in UTC (or from two separate clock reads) near midnight

**What goes wrong:**
`new Date().toISOString().slice(0, 10)` (the single most common one-liner, also `datetime.utcnow()`) returns the UTC date. In Asia/Seoul (UTC+9) every entry between 00:00 and 09:00 local goes into *yesterday's* file. Verified: instant `2026-10-04T16:30:00Z` (= 01:30 KST on Oct 5) gives `toISOString()` -> `2026-10-04` but the local date is `2026-10-05` [VERIFIED]. This is exactly the late-night-learning case the PROJECT.md constraint calls out.

A second variant: reading the clock twice (once for the filename, once for the `HH:MM` prefix, or once for "does file exist" and again for the heading text) can straddle midnight and produce `2026-10-04.md` containing `# 2026-10-05` or a `00:00` entry in the previous day's file.

**Why it happens:**
UTC helpers are the first search result; developers test in the afternoon, when UTC date == local date for KST (UTC date only differs 00:00-09:00 KST), so the bug never shows up in manual testing. Developers on UTC CI never see it.

**How to avoid:**
- One `now = new Date()` per invocation; derive date string, time string, and heading from that single instant.
- Format from local getters: `getFullYear()`, `getMonth()+1`, `getDate()`, `getHours()`, `getMinutes()`, zero-padded manually. Do not use `toLocaleDateString()` / `toLocaleTimeString()`: on a Korean locale the time is `오후 3:05:00` [VERIFIED], the date is `2026. 10. 4.` [VERIFIED], and output differs by OS/ICU/locale. (`toLocaleDateString("sv-SE")` happens to give ISO local date, but it is a hack that depends on ICU data; avoid.)
- Make the clock injectable (`now` parameter / `TIL_NOW` env var for tests) and test with fixed instants: `00:30 KST`, `23:59:59.999`, `00:00:00.000`, a DST-transition day in a DST zone, and with process timezones `UTC`, `Asia/Seoul`, `America/Los_Angeles`. Verify that setting `TZ` actually takes effect in the test runtime on Windows; if not, rely on the injected clock and construct dates from explicit components.
- Python: `datetime.now()` (naive local) or `datetime.now().astimezone()`; never `utcnow()` (deprecated since 3.12). Go: `time.Now()` (local), not `.UTC()`.
- Decide and document now whether "day" rolls over at 00:00 or at a configurable cutoff (some users want 1-3am still counted as the previous day). PROJECT.md says local date; keep 00:00 for v1, note a possible `dayStartHour` option as a deferred idea, not a v1 feature.

**Warning signs:**
- Entries recorded after midnight showing up in the previous day's file; filename and heading disagree.
- Date code containing `toISOString`, `utcnow`, `gmtime`, `UTC`.
- Test suite passes only because the CI machine is on UTC.

**Phase to address:**
Phase 1 (core append) - clock abstraction and format function; Phase 1 tests for midnight and cross-TZ.

---

### Pitfall 4: Shell quoting eats or mangles the one-line argument before the tool ever sees it

**What goes wrong:**
The tool cannot see what the shell already changed. Real failure modes on the author's two shells [all VERIFIED unless noted]:
- **PowerShell double quotes:** `$5` is a variable, so `til "costs $5 and `tick"` delivers `costs  and <TAB>ick` - the `$5` text vanished, backtick-t became a tab. Same for `$HOME`, `$(...)`, `` `n ``.
- **Windows PowerShell 5.1 passing embedded double quotes to a native exe:** `node a.js "say \"hi\" 한글"` arrived as the two args `say " hi\` and `한글` - the string was split and the quote mangled. A trailing backslash before a closing quote (`"C:\dir\"`) also swallows the quote. This is the long-known 5.1 native-argument bug (fixed by `$PSNativeCommandArgumentPassing` in PowerShell 7.3+, still different between 5.1 and 7) [KNOWN].
- **Git Bash/bash double quotes:** backticks and `$VAR` expand; `!` in an *interactive* bash double-quoted string triggers history expansion ("event not found") and the command never runs [KNOWN]. Single quotes avoid this but cannot contain a `'`.
- **cmd.exe:** `%VAR%`, `^`, `&`, `|`, `<`, `>` are special even in some quoted contexts [KNOWN].
- **Unquoted use:** `til Today I learned about X` yields five argv entries; if the tool only reads `argv[1]` it records "Today".
- **Text that looks like a flag or a subcommand:** `til "-x is faster than -y"` is rejected by an argument parser ("unknown option"); `til list comprehension tricks` is interpreted as the `list` subcommand. Commander/argparse/clap all do this by default.

**Why it happens:**
Developers test with simple ASCII in one shell. The CLI contract `til "<one line>"` implies that the quoting is the user's problem, and the author uses two shells with different rules.

**How to avoid:**
- Join *all* remaining argv with a single space instead of reading only `argv[1]`, so unquoted `til Today I learned X` works (the common case for people who never use special characters).
- Keep the CLI grammar tiny and unambiguous: reserved words only act as subcommands when they are the *only* argument (or use flags: `til --list`, `til --show 2026-10-04`); support `--` to force "everything after is text". Choose and document the rule in the requirements phase, because changing it later breaks muscle memory.
- Offer quote-free input paths that are first-class, not afterthoughts: (a) `til` with no args prompts `> ` on a TTY and reads one line (no shell parsing at all, good for `$`, backticks, `!`, quotes); (b) read stdin when it is not a TTY (`echo ... | til`). Caveat for (b): Windows PowerShell 5.1 pipes to native commands using `$OutputEncoding`, which is **ASCII** here (code page 20127) [VERIFIED], so Korean piped from PS 5.1 becomes `?`. Document that stdin mode is reliable from Git Bash/PowerShell 7, and that PS 5.1 users should use the argument or prompt path.
- README "quoting cheat-sheet": PowerShell -> use single quotes `'...'` (a literal `'` is `''`); bash/Git Bash -> single quotes, or the prompt mode for `'`/`!`; cmd -> avoid `%`, `&`.
- Do not try to "fix" shell damage in the tool (e.g., guess that a missing `$5` was intended). Do echo what was written (`added: <exact text>`) so the user sees dropped text immediately.

**Warning signs:**
- Echo line shows text different from what the user typed.
- Integration tests invoke the binary via `child_process.spawn` with an argv array (bypasses the shell, so quoting bugs are never exercised). Add smoke tests through actual `powershell.exe -Command` and `bash -c`.
- Parser-library default "unknown option -> error" with no `--` escape.

**Phase to address:**
Phase 1 (CLI grammar decision: argv join, `--`, subcommand rule). Phase 2 (prompt/stdin input modes + README cheat-sheet + shell matrix tests).

---

### Pitfall 5: Console output encoding - entries display correctly in the console but not when piped, or crash on emoji

**What goes wrong:**
- Argv itself is fine: Node received `한글` as `U+D55C U+AE00` under PowerShell 5.1, cmd and Git Bash while the console code page was 949 [VERIFIED]. Do not add "fix argv encoding" code - there is nothing to fix on modern runtimes (Windows passes UTF-16 argv; Node, Python 3, Go, Rust, .NET read it as wide strings). Risk only exists for runtimes/wrappers that use the ANSI argv (`char**` main in C/C++, old Python 2, some bundlers/launchers) - choose a stack that reads wide argv.
- Output is the real problem. `[Console]::OutputEncoding` in PS 5.1 is code page 949 [VERIFIED]. A TTY write from Node works (console API), but `til show | Select-String 배움` or `til show > out.txt` emits UTF-8 bytes that PS 5.1 decodes as CP949 -> mojibake [KNOWN]. Under Python, stdout redirected defaults to cp949 and raises `UnicodeEncodeError` on emoji/characters outside CP949 (crashing `til show` for a file that was written fine) [KNOWN].
- Git Bash/mintty: no `LANG`/`LC_ALL` set here [VERIFIED]; mintty is UTF-8 and displays fine, but a Windows-native runtime talking to winpty-wrapped consoles can differ. Test, do not assume.
- Console fonts (conhost with Consolas) show boxes for some Hangul/emoji - cosmetic, not a bug in the tool.

**Why it happens:**
"It prints right in my terminal" is tested in only one shell, only on a TTY, never redirected.

**How to avoid:**
- Write to stdout/stderr as explicit UTF-8 bytes where the runtime allows it (Python: `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`; Node: default UTF-8 is fine). Never `chcp 65001` from inside the tool or tell users to change system code page (affects the whole console; breaks other tools).
- Keep command output small and mostly ASCII-framed (`added -> 2026-10-04.md`) so a mis-decoded stream is cosmetic; the file on disk is the source of truth.
- Document: PowerShell 5.1 -> `[Console]::OutputEncoding = [Text.Encoding]::UTF8` (profile) for piping, or use PowerShell 7 (UTF-8 default for native output decoding is still only partially true; treat PS 7 as "better, verify").
- Test matrix (manual smoke list for the verification phase): {PowerShell 5.1, PowerShell 7, Git Bash/mintty, cmd, Windows Terminal} x {TTY, `| more`/`| Select-String`, `> file`} with `한글 + emoji`.

**Warning signs:**
- A `UnicodeEncodeError`/`charmap` traceback anywhere in the tool.
- Output looks right in terminal but `til show > x.txt` hexdump contains `3F` (`?`) or CP949 bytes.

**Phase to address:**
Phase 2 (view commands: `show`/`list`) + final verification phase's shell matrix. PowerShell 7 was not installed on the research machine (`pwsh` not on PATH), so PS 7 behavior is [KNOWN]/unverified and must be tested in the verification phase.

---

### Pitfall 6: Append implemented as read-modify-write (or temp-file + rename), or opened with truncating mode

**What goes wrong:**
- `readFile` -> add line -> `writeFile` loses data: a concurrent `til` (two terminals, or a sync client) writes between read and write and one entry vanishes; any crash in the middle can truncate the whole day file (`writeFile` truncates first). A single `'w'` vs `'a'` typo destroys the day's data.
- Atomic-rename pattern (write temp, rename over target) is right for config files but wrong for append logs: it loses concurrent appends and on Windows `rename` over a file that Dropbox/OneDrive/antivirus/VS Code has open fails with `EPERM`/`EBUSY` [KNOWN].
- Two simultaneous first-entries of the day both observe "file missing", both write a heading -> duplicate `# 2026-10-04` headings.
- Partial writes: a line is written in several `write()` calls (heading, then bullet), so a crash or concurrent writer interleaves them.

**Why it happens:**
"Read file, check if heading exists, then write" feels natural and is correct in single-process tests. Concurrency is dismissed as irrelevant for a personal tool, but a shell loop/alias, an editor autosave, or cloud sync makes it real, and the Core Value is "never lose entries".

**How to avoid:**
- Open with append semantics (`fs.openSync(p, "a")` / `O_APPEND`; Python `"ab"`; Go `O_APPEND|O_CREATE|O_WRONLY`) and issue **one** `write` containing the complete bytes of the line (including any leading newline from Pitfall 2). Small single appends in O_APPEND mode are effectively atomic with respect to other appenders (libuv maps O_APPEND to `FILE_APPEND_DATA` on Windows [KNOWN]).
- Creation: try exclusive create (`flag: "wx"`, `O_EXCL`) writing heading + first entry; on `EEXIST`, fall back to the plain append path. This removes the duplicate-heading race without any lock file.
- Never use `'w'`/`"w"` on a day file anywhere in the codebase. Add a lint-ish test/grep in CI: no `writeFile`/`"w"` modes on day files.
- Retry transient `EBUSY`/`EPERM`/`EACCES` 3-5 times with short backoff (20-100 ms) because Windows Defender/sync clients hold files briefly; then fail loudly with non-zero exit and the unwritten text printed to stderr so the user can recover it.
- Don't add file locking for v1 (YAGNI); the `wx` + single `O_APPEND` write covers the realistic cases.
- Optional: `fsync` after write is not needed for this use case; don't pay for it.

**Warning signs:**
- Code reads the file before writing for any reason other than the last-byte check.
- A concurrency test (spawn 20 `til` processes at once, assert 20 entries and exactly 1 heading) does not exist or fails intermittently.

**Phase to address:**
Phase 1 (core append) with the 20-process stress test as an acceptance criterion.

---

### Pitfall 7: Global install on Windows - command not found, script blocked, or wrong shim

**What goes wrong:**
`til` works from the project folder via `node bin/til.js` but not as "a single global command":
- npm global bin dir (`%APPDATA%\npm`, here `C:\Users\user\AppData\Roaming\npm`, which is on PATH on this machine [VERIFIED]) is missing from PATH on other machines or is only picked up by *new* terminals.
- npm creates three shims per bin: `til` (sh), `til.cmd`, `til.ps1` [VERIFIED for another package on this machine]. PowerShell prefers `til.ps1` over `til.cmd`. With a restrictive execution policy ("running scripts is disabled on this system") `til` fails in PowerShell even though `til.cmd` works [KNOWN]. This machine is `CurrentUser: RemoteSigned`, so the author will not see it; a fresh Windows client default is `Restricted`, so a reviewer/another machine will.
- Missing or CRLF shebang: `bin/til.js` without `#!/usr/bin/env node` is not executable on macOS/Linux; with CRLF line endings (git `autocrlf=true` checkout on Windows, then published/packed) the shebang becomes `node\r` and fails with `env: 'node\r': No such file or directory` on Linux/macOS [KNOWN].
- `package.json` `files`/`.npmignore` omits the bin script, so `npm i -g` succeeds and `til` crashes with MODULE_NOT_FOUND.
- Name collision: no `til` command exists on PATH here (`where til` -> not found) [VERIFIED], but other users may have a `til` alias or package; check at publish time if ever published.
- "Single binary" alternatives (pkg, Node SEA, Go/Rust exe): unsigned `.exe` files trigger SmartScreen/Defender warnings or false positives and must be placed on PATH manually.

**Why it happens:**
Developers test with `node src/index.js` or `npm link` in the dev shell, which has the right PATH and policy.

**How to avoid:**
- Define "installed" as: `npm i -g .` (or `npm pack` + `npm i -g ./til-cli-x.y.z.tgz`) then, in a **fresh** PowerShell 5.1, PowerShell 7, Git Bash, and cmd window, run `til --version` and a Korean append. Make this the Definition of Done for the install phase.
- Add `#!/usr/bin/env node` and enforce LF via `.gitattributes` (`* text=auto eol=lf` or `bin/* text eol=lf`) before the first commit.
- `package.json`: `"bin": {"til": "bin/til.js"}`, explicit `"files"`, `"engines": {"node": ">=18"}` (check the minimum when the stack is chosen); run `npm pack --dry-run` and read the file list.
- Document the `ExecutionPolicy` workaround (`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or call `til.cmd`) and the PATH fix (`npm config get prefix`; add to PATH; open a new terminal) in README.
- Provide `til --version` and `til --where` (prints data directory) so install/config problems are diagnosable in one command.
- Do not require admin rights; do not write installer scripts that edit PATH.

**Warning signs:**
- Only ever run via `node ...` or `npm link`.
- `.gitattributes` absent; `git ls-files --eol` shows `i/crlf` on the bin file.
- `npm pack --dry-run` does not list the bin file.

**Phase to address:**
Install/packaging phase (late, but write `.gitattributes` and shebang in Phase 1 because retrofitting is harder); verification in a clean shell.

## Moderate Pitfalls

### Pitfall 8: Default directory resolution (`~`, `HOME`, OneDrive, non-ASCII paths)

**What goes wrong:** Using `process.env.HOME` (unset in plain PowerShell/cmd) or a literal `~` from a config file/env var (never expanded by a native program; the shell only expands an unquoted `~` argument). In Git Bash, env paths like `/c/Users/me/til` are MSYS paths that a native Windows runtime cannot always resolve. `Documents` is frequently redirected to OneDrive (Known Folder Move) which adds sync-lock contention (see Pitfall 6). A Korean Windows username makes the home path non-ASCII; this works with wide APIs but breaks old tooling.
**Prevention:** Use `os.homedir()` / `Path.home()` (USERPROFILE on Windows) and `path.join`, never string concatenation with `/`or `\`. Default to `~/til` (not under Documents). Expand a leading `~` yourself in config values and `TIL_DIR`. Accept both `/` and `\`; if given an MSYS-style `/c/...` path on win32, convert or error with a clear message. `mkdir -p` (recursive) on first run; print the dir on creation. Test with a path containing spaces and Hangul.
**Phase:** Phase 1 (default dir) and Phase 2 (configurable dir).

### Pitfall 9: Time-prefix and heading formatting depends on locale

**What goes wrong:** `toLocaleTimeString()` gives `오후 3:05:00` on this machine [VERIFIED]; `strftime("%x %X")`, `.NET ToString()` and similar vary. The result is unsortable, ungreppable, and differs between machines.
**Prevention:** Hand-format `HH:MM` 24-hour, zero-padded, and ISO `YYYY-MM-DD`. Single-source the format in one function with a unit test. Seconds are noise; keep `HH:MM`.
**Phase:** Phase 1.

### Pitfall 10: Entry text containing Markdown-significant content

**What goes wrong:** Entries beginning with `#`, `>`, `-`, `1.`, `[ ]`, `|`, or containing `<script>`, unmatched backticks, or two trailing spaces render oddly or change structure. Over-escaping (backslash-escaping everything) makes the raw file ugly and breaks the user's intentional inline `code`.
**Prevention:** Store the text verbatim after trimming and newline-collapse (Pitfall 2); the leading `- HH:MM ` prefix already keeps `#`/`>`/`1.` from becoming block structure (a list item's content can still start a nested block, so do not escape; accept it). Do not strip or alter backticks. Do not append two trailing spaces. Do not HTML-escape. Document "text is stored as-is".
**Phase:** Phase 1 (decision), no extra work after.

### Pitfall 11: View commands re-implement parsing loosely

**What goes wrong:** `til show`/`list` print raw file content including BOM, `\r`, or hit `ENOENT` and print a stack trace when today's file doesn't exist yet. Date arguments (`til show 2026-10-4`, `yesterday`) are accepted inconsistently, and `new Date("2026-10-04")` is parsed as **UTC** midnight (then `getDate()` in local TZ can give the previous day in negative-offset zones) [KNOWN].
**Prevention:** "No entries for 2026-10-04" is a normal exit-0 outcome. Validate `^\d{4}-\d{2}-\d{2}$` strictly and use the string as-is for the filename (do not round-trip through `Date`); for `yesterday`/relative dates compute from local components of one `now`. Normalize output newlines on print. Reject path-like input (`../`) in date arguments: since the date is used to build a path, the regex check doubles as path-traversal protection.
**Phase:** Phase 2.

### Pitfall 12: Error handling that loses the user's text

**What goes wrong:** The write fails (disk full, permission, locked file, bad configured dir) and the tool prints a stack trace and exits 0 or 1 without echoing the entry. The user typed the learning, closed the terminal, and it is gone.
**Prevention:** On any write failure print the full text to stderr with the target path and error code, exit non-zero. Success path prints one short confirmation line with the file path. Never swallow errors in a retry loop.
**Phase:** Phase 1.

## Minor Pitfalls

### Pitfall 13: Interactive-mode cosmetics
**What goes wrong:** Prompt mode shows a prompt but Ctrl+C / Ctrl+Z / empty Enter writes an empty entry; Windows Ctrl+Z+Enter EOF handling differs.
**Prevention:** Empty or EOF input aborts with no write and a non-zero exit; test Ctrl+C and Ctrl+Z.

### Pitfall 14: Hidden dependency/startup cost
**What goes wrong:** A heavy CLI framework (or Node cold start with many deps) makes `til` take 300+ ms on Windows (Defender scans each file in `node_modules`), defeating "faster than opening an editor".
**Prevention:** Zero or one small dependency; hand-parse the tiny grammar; measure `til "x"` wall time in the install verification (target well under 200 ms warm).

### Pitfall 15: Windows reserved/long path and trailing-dot surprises in configured dir
**What goes wrong:** User-configured dir ends in a space/dot, is a drive-less path, or exceeds MAX_PATH in deeply nested synced folders.
**Prevention:** Resolve to absolute via `path.resolve`, create recursively, surface the resolved path in `til --where`.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `toISOString().slice(0,10)` for the date | One line | Wrong day 00:00-09:00 KST; data in wrong file | Never |
| Reading only `argv[1]` | Simpler parsing | Unquoted input silently truncated | Never |
| Using the framework default text encoding (`open(..., "a")`) | Works in ASCII tests | Mixed CP949/UTF-8 files | Never |
| `os.EOL` / platform newline | Looks "native" | CRLF/LF mix across machines, noisy git diffs | Never |
| Skip stress test for concurrency | Faster Phase 1 | Duplicate headings/lost lines in real use | Only if append is a single `O_APPEND` write and `wx` create (still add the test later) |
| Heavy CLI framework (commander/yargs/click) | Free `--help` | Slower startup, subcommand-vs-text ambiguity | Acceptable only if `--` and sole-word subcommand rules are enforced |
| Hard-coding the data dir | No config code | Painful when user wants a git repo location | MVP only; the PROJECT.md requires configurable dir in v1 |
| No `.gitattributes` | Fewer files | CRLF shebang breaks Linux/macOS install | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Windows PowerShell 5.1 | Telling users to append/read with `Add-Content`/`Get-Content` (CP949 default) | Say `Get-Content -Encoding UTF8`; use `til show` |
| PowerShell 5.1 piping | `"한글" \| til` (pipe uses ASCII `$OutputEncoding`, text becomes `?`) | Use argument or prompt mode; or set `$OutputEncoding = [Text.UTF8Encoding]::new()` |
| Git Bash / mintty | Assuming `LANG`/locale is set; passing `/c/...` paths in env to native exe | Make no locale assumptions (UTF-8 explicit); normalize paths |
| npm global shims | Testing only through `node file.js` | Test fresh shells after `npm i -g`; check `.cmd`/`.ps1`/sh |
| Git (the TIL folder is a repo) | `core.autocrlf=true` rewrites LF to CRLF on checkout; mixed files | `.gitattributes` in the TIL data repo suggestion: `*.md text eol=lf`; the tool never touches git |
| Dropbox / OneDrive / antivirus | Rename-based or truncating writes; no retry on `EBUSY` | `O_APPEND` single write + short retry |
| Editors (VS Code, Notepad) | Notepad may save with BOM or CRLF; file left open and overwritten on save | Tolerate BOM and CRLF on read; match existing EOL on append |

## Performance Traps

Scale is tiny (one file per day, tens of lines). The only real performance concern is startup latency.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Heavy dependencies / slow runtime start | `til "x"` takes >0.5 s on Windows | Minimal deps; measure | From day one on Windows with Defender |
| Reading the whole file to append | None at this size | Only read last byte + first 4 KB | Not a practical issue (<1 MB) |
| `list` that reads every day file | Slow over years of notes | Read only requested date; list uses directory listing | Thousands of files (years) - unlikely to matter |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Building the file path from user date input without validation (`til show ../../x`) | Path traversal reads arbitrary `.md`/files | Strict `^\d{4}-\d{2}-\d{2}$` before path join |
| Passing user text to a shell (`exec("echo " + text + " >> file")`) | Command injection via `$()`/backticks/`&` | Never shell out; write with the language's file API |
| Following a symlinked data dir blindly / running with elevated rights | Writes to unexpected locations | Normal user rights only; print resolved path in `--where` |
| Logging entry text to a debug file elsewhere | Private notes leak | No telemetry or extra logging |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent success (no output) | User unsure the entry was saved, especially after quoting issues | One line: `added to 2026-10-04.md: <text>` |
| Output text differs from input and nobody notices | `$5` quietly dropped | Echo the exact text stored |
| Error says "ENOENT" or stack trace | Confusing | Short human message with the path and what to do |
| Requiring quotes for every entry | Friction; cognitive load on special chars | Join argv; prompt mode |
| Different command shapes for view (`til list` vs `til --list`) inconsistent | Learning cost | Decide the grammar once, in Phase 1 |
| Time prefix mandatory | Users who dislike it must edit files | Make the prefix optional via flag/config (PROJECT.md says "optionally") |

## "Looks Done But Isn't" Checklist

- [ ] **Korean append:** Often tested only in one shell - verify hexdump of the file is valid UTF-8 (`ED 95 9C EA B8 80` for 한글), no BOM, no `3F`, after running from PowerShell 5.1, Git Bash, and cmd.
- [ ] **Midnight:** Often tested only in the afternoon - verify a fixed-clock test at `00:30 KST` writes to the local-date file and heading/time come from the same instant.
- [ ] **Appending to an existing file:** Often missing the no-final-newline case - verify with a fixture ending without `\n`, with `\r\n`, empty, and BOM-prefixed.
- [ ] **Concurrency:** Often untested - verify 20 parallel `til` processes produce 20 entries and exactly one heading.
- [ ] **Special characters:** Often tested only through `spawn(argv[])` - verify through `powershell.exe -Command` and `bash -c` with `'`, `"`, `` ` ``, `$`, `!`, `%`, `&`, `#`, `-leading`, Hangul, emoji.
- [ ] **Unquoted input:** Often missing - verify `til Today I learned X` stores the full sentence.
- [ ] **Subcommand vs text:** Often broken - verify `til list comprehension is neat` is stored as text (or the documented rule applies).
- [ ] **Global install:** Often only `npm link` tested - verify `npm i -g` then a fresh PowerShell 5.1 (restricted policy sim), PowerShell 7, Git Bash, cmd; also macOS/Linux if claimed.
- [ ] **Shebang/LF:** Verify `bin` file has LF and a shebang after a Windows checkout.
- [ ] **Piped output:** Verify `til show | more` and `til show > out.txt` bytes are UTF-8.
- [ ] **Error path:** Verify a read-only dir/locked file prints the unsaved text and exits non-zero.
- [ ] **View on missing day:** Verify exit 0 with a friendly message, not a trace.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong-day entries (UTC bug) | LOW | Script to move entries by timestamp/heading; fix date function; since entries have `HH:MM` prefix, ones before 09:00 KST in the previous file are identifiable |
| Mixed-encoding file | MEDIUM | Identify non-UTF-8 lines (invalid byte sequences), re-decode those lines as CP949, rewrite file as UTF-8 once (the only time a tool may rewrite a day file; make a `.bak` copy first) |
| BOM / UTF-16 file from PowerShell redirect | LOW | Convert to UTF-8 no BOM with an editor; tool should detect and refuse to append (Pitfall 1) |
| Glued lines (no trailing newline) | LOW | Manual split in editor; add last-byte check |
| Duplicate headings | LOW | Delete extras; add `wx` create |
| Lost entry due to quoting | NONE (unrecoverable; text gone before the tool ran) | Prevention only: echo stored text; prompt mode |
| `til` not found after install | LOW | Add `npm config get prefix` dir to PATH, reopen terminal; use `til.cmd` if `.ps1` blocked |

## Pitfall-to-Phase Mapping

Phase names are suggestions for the roadmapper (adjust to the actual roadmap).

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Default encoding / EOL / BOM | Phase 1: Core append | Byte-exact tests: UTF-8, no BOM, LF only, Korean + emoji |
| 2. Trailing newline / empty file / newline in text | Phase 1: Core append | Table-driven start-state test |
| 3. UTC vs local date, double clock read | Phase 1: Core append (clock abstraction) | Fixed-clock tests at 00:30 KST, 23:59:59.999, TZ = UTC / Asia/Seoul / America/Los_Angeles |
| 4. Shell quoting / argv join / flag-like text | Phase 1: CLI grammar; Phase 2: stdin + prompt modes + README cheat-sheet | `powershell.exe -Command` and `bash -c` smoke tests with special characters |
| 5. Console/pipe output encoding | Phase 2: view commands; final verification | Shell x redirect matrix; hexdump of `> out.txt` |
| 6. Non-atomic / truncating / racy writes | Phase 1: Core append | 20-process concurrency test; code grep for write-mode `w`; read-only dir test |
| 7. Global install on Windows | Packaging/install phase (shebang + `.gitattributes` in Phase 1) | `npm i -g` and `til --version` + Korean append in 4 fresh shells |
| 8. Default dir / `~` / paths | Phase 1 (default), Phase 2 (config) | Run with a path containing spaces and Hangul; unset `HOME` in PowerShell |
| 9. Locale-dependent formatting | Phase 1 | Unit test of format function under `ko-KR` and `en-US` locales |
| 10. Markdown-special text | Phase 1 (policy) | Fixture entries starting with `#`, `>`, `1.`, `-` |
| 11. View-command date parsing | Phase 2 | Invalid and missing date cases, `../` rejected |
| 12. Error path loses text | Phase 1 | Simulated write failure prints text to stderr, exit != 0 |
| 13-15. Minor | Phase 2/verification | Manual checks |

## Sources

- Reproduced on the research machine (2026-10-04): Windows 11 Pro 10.0.26200, Windows PowerShell 5.1.26100.9444, Node v24.12.0, Git Bash MINGW64, console code page 949, TZ Asia/Seoul. Verified: Node argv receives Hangul correctly under PS 5.1/cmd/Git Bash on cp949; PS 5.1 `Add-Content`/`Set-Content` write CP949 bytes; PS 5.1 `Get-Content` default misreads UTF-8; PS 5.1 `$OutputEncoding` is ASCII (20127) and `[Console]::OutputEncoding` is 949; embedded `\"` is split by PS 5.1 when calling a native exe; `$5`/`` `t `` are consumed by PowerShell double quotes; `os.EOL` is `\r\n`; `toISOString()` yields the previous day for 01:30 KST; `toLocaleTimeString()` gives `오후 3:05:00`; npm shims include `.cmd`/`.ps1`/sh; `CurrentUser` ExecutionPolicy is RemoteSigned; `til` is not on PATH.
- [KNOWN] items (not reproduced here, standard documented behavior): PowerShell 5.1 native-command argument quoting bug and `$PSNativeCommandArgumentPassing` (PowerShell 7.3+); `Out-File`/`>` UTF-16LE default and BOM from `-Encoding utf8` in 5.1; bash history expansion of `!` in interactive shells; CRLF shebang failure on Linux/macOS; Python text-mode default encoding/newline translation; libuv `O_APPEND` -> `FILE_APPEND_DATA` on Windows; `new Date("YYYY-MM-DD")` parsed as UTC; ExecutionPolicy `Restricted` as the Windows client default. These should be re-confirmed against official docs (Node.js `fs`/`process.argv`, PowerShell `about_Execution_Policies`/`about_Character_Encoding`, npm `package.json` `bin`, Python `open()`) during the phase that touches them.
- LOW confidence / unverified: PowerShell 7 behavior (not installed on the research machine); macOS/Linux behavior (not tested; Windows-focused); `TZ` env override effectiveness in Node on Windows (verify before relying on it in tests).

---
*Pitfalls research for: personal TIL (append one line to a dated Markdown file) CLI, Windows-first with Korean text*
*Researched: 2026-10-04*
