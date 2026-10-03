# Architecture Research

**Domain:** Small file-based note/journal CLI (append one line to a per-day Markdown file)
**Researched:** 2026-10-04
**Confidence:** HIGH for structure, boundaries, and testability (stable, language-agnostic patterns). MEDIUM for Windows console/encoding specifics (depends on the stack chosen; verify in the stack phase). No web sources were consulted; this rests on established CLI design practice.

The stack is not chosen yet (PROJECT.md defers it). Everything below is language-agnostic. Code snippets are illustrative TypeScript-style pseudocode and port directly to Go, Rust, or Python.

## Standard Architecture

### System Overview

Functional core, imperative shell. Pure logic in the middle, with all I/O (clock, filesystem, env, terminal) pushed to the edges and passed in.

```
┌─────────────────────────────────────────────────────────────────┐
│ SHELL (impure, thin, only place touching the real world)         │
│  bin entry: reads process argv/env, builds real Deps,           │
│  calls run(argv, deps), prints result, sets exit code            │
└───────────────────────────────┬─────────────────────────────────┘
                                │ run(argv, deps) -> exit code
┌───────────────────────────────▼─────────────────────────────────┐
│ CLI LAYER                                                        │
│  ┌──────────────┐   ┌───────────────────────────────────────┐   │
│  │ Arg parser   │──▶│ Command dispatch: add | show | list   │   │
│  └──────────────┘   └───────┬───────────────┬───────────────┘   │
└─────────────────────────────┼───────────────┼───────────────────┘
                              │               │
┌─────────────────────────────▼───────────────▼───────────────────┐
│ CORE (pure functions, no I/O, no globals)                        │
│  ┌────────────┐ ┌────────────────┐ ┌─────────────────────────┐  │
│  │ date.ts    │ │ format.ts      │ │ parse.ts (for show/list)│  │
│  │ local date,│ │ heading, entry │ │ day file -> entries[]   │  │
│  │ HH:MM, path│ │ line, new-file │ │                         │  │
│  │ name       │ │ vs append text │ │                         │  │
│  └────────────┘ └────────────────┘ └─────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ pure data in/out
┌─────────────────────────────▼───────────────────────────────────┐
│ PORTS / ADAPTERS (injected via Deps)                             │
│  ┌───────────┐  ┌──────────────────────┐  ┌─────────────────┐   │
│  │ Clock     │  │ Storage (fs adapter) │  │ Config resolver │   │
│  │ now()     │  │ appendEntry/readDay/ │  │ flag>env>default│   │
│  │           │  │ listDays             │  │ -> storage dir  │   │
│  └───────────┘  └──────────┬───────────┘  └─────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
                  <TIL_DIR>/2026-10-04.md  (plain UTF-8 files)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Entry shell (`bin`) | Build real `Deps` (system clock, real fs, `process.env`, stdout/stderr), call `run`, translate result to exit code. The only file with side effects at import/startup. | ~15 lines. No logic. |
| Arg parser | argv -> typed `Command` object (`{kind:'add', text}` / `{kind:'show', date?}` / `{kind:'list'}` / `{kind:'help'}`) plus global options (`--dir`). Reports usage errors as data, not by exiting. | Stdlib parser or one small library (the STACK decision). Keep the parsed-command type independent of the library. |
| Command handlers | Orchestrate one use case: call config -> clock -> core -> storage. Return `{ exitCode, stdout, stderr }` or throw typed errors. Never call `process.exit` or `console.log`. | One function per command: `add(cmd, deps)`, `show`, `list`. |
| Config resolver | Decide the storage directory. Precedence: `--dir` flag > `TIL_DIR` env var > default (`~/til`, or similar). Pure given `(flags, env, homedir)`. | Pure function; `homedir` is injected, not read globally. |
| Date/path module | `Clock.now()` -> local `YYYY-MM-DD`, local `HH:MM`, filename `YYYY-MM-DD.md`. Validates user-supplied dates strictly before they ever reach a path. | Pure functions over a `Date`. Uses LOCAL getters, never UTC. |
| Formatter | Build the text to write: day heading (only for a new file), entry line (`- HH:MM text`). Normalizes input (trim, collapse newlines, reject empty). | Pure string functions. |
| Storage adapter | The only module that touches the filesystem: `ensureDir`, `appendToDay`, `readDay`, `listDays`. Owns append safety, newline repair, encoding. | Thin wrapper over the platform fs API, parameterized by a base directory. |
| Day-file parser (read side) | Turn raw day text back into entries for `show`/`list` (count, time, text). Tolerant of hand-edited files. | Pure line-based function. Optional: `show` can just print the raw file at first. |

## Recommended Project Structure

```
til-cli/
├── src/
│   ├── bin.ts            # shell: build real Deps, call run(), set exit code
│   ├── cli.ts            # run(argv, deps) -> exit code; parse + dispatch
│   ├── args.ts           # argv -> Command (pure)
│   ├── commands/
│   │   ├── add.ts        # handler: text -> append
│   │   ├── show.ts       # handler: date? -> print day
│   │   └── list.ts       # handler: list days (+ counts)
│   ├── core/
│   │   ├── date.ts       # localDate(), localTime(), dayFileName(), parseDateArg()
│   │   ├── format.ts     # formatHeading(), formatEntry(), normalizeText()
│   │   └── parse.ts      # parseDayFile() (read side)
│   ├── config.ts         # resolveStorageDir(flags, env, homedir) (pure)
│   ├── storage.ts        # fs adapter: appendToDay, readDay, listDays
│   └── deps.ts           # Deps type + makeRealDeps()
└── test/
    ├── core/             # pure unit tests, no fs, no clock
    ├── storage.test.ts   # temp-dir integration tests
    ├── cli.test.ts       # run(argv, fakeDeps) end-to-end, temp dir + fixed clock
    └── e2e.test.ts       # 1-3 tests spawning the real binary (encoding, exit codes)
```

### Structure Rationale

- **`core/` has zero imports from fs/os/process.** This is what makes it unit-testable with no setup, and enforces the boundary by convention (a lint rule or a code-review check).
- **`bin` vs `cli`:** `run(argv, deps)` is importable and returns an exit code; `bin` is the sole caller that touches `process`. Tests call `run` directly.
- **`storage.ts` is one file, not a repository/ORM layer.** With three operations on flat files, more abstraction is overkill.
- **Single package, no monorepo, no plugin system.** The whole tool is likely under ~300 lines of source.

## Architectural Patterns

### Pattern 1: Dependency injection of the world (`Deps`)

**What:** Everything non-deterministic comes in through one small object: clock, environment, home dir, output streams, and the storage dir. Handlers never reach for `new Date()`, `process.env`, `os.homedir()`, or `console`.
**When to use:** Always, even for a tool this small. It costs ~10 lines and is the main thing that makes the tool testable.
**Trade-offs:** Slight indirection. Far better than monkey-patching globals or fake-timer libraries.

**Example:**
```typescript
interface Deps {
  now: () => Date;                       // injectable clock
  env: Record<string, string | undefined>;
  homedir: string;
  out: (s: string) => void;              // stdout
  err: (s: string) => void;              // stderr
  // fs is not injected: storage takes a baseDir and tests point it at a temp dir
}

export async function run(argv: string[], deps: Deps): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.kind === 'error') { deps.err(parsed.message + '\n'); return 2; }
  const dir = resolveStorageDir(parsed.flags, deps.env, deps.homedir);
  try {
    switch (parsed.kind) {
      case 'add':  return await add(parsed, dir, deps);
      case 'show': return await show(parsed, dir, deps);
      case 'list': return await list(dir, deps);
    }
  } catch (e) { deps.err(`til: ${(e as Error).message}\n`); return 1; }
}
```

### Pattern 2: Real filesystem in a temp dir, not a mocked fs

**What:** The storage adapter takes `baseDir`. Tests create a fresh directory per test (`mkdtemp` equivalent), run the real code against it, read back the real bytes, then delete the directory.
**When to use:** For all storage and CLI-level tests. A file-append CLI's bugs live in real fs behavior (missing trailing newline, directory creation, encoding), which a mock fs hides.
**Trade-offs:** Slightly slower than in-memory (milliseconds in practice). Worth it.

### Pattern 3: Pure "plan the text" + thin "do the write"

**What:** Decide *what text to append* in pure code, given only `(existingFileState, date, time, text)`. Storage just performs the append.
**When to use:** The add path. This keeps the tricky logic (new-file heading, missing-trailing-newline repair) testable without a filesystem.
**Trade-offs:** Storage must report cheap facts about the existing file (exists? empty? ends with `\n`?). That is acceptable: read the last byte, not the whole file.

**Example:**
```typescript
// core/format.ts
export function planAppend(state: { exists: boolean; endsWithNewline: boolean },
                           date: string, time: string, text: string): string {
  const entry = `- ${time} ${normalizeText(text)}\n`;
  if (!state.exists) return `# ${date}\n\n${entry}`;             // new day file
  return (state.endsWithNewline ? '' : '\n') + entry;            // repair hand-edited file
}
```

### Pattern 4: Handlers return/emit, only the shell exits

**What:** Handlers return an exit code (and write via `deps.out/err`). Only `bin` calls `process.exit` / sets the exit code.
**When to use:** Always. `process.exit` inside a handler kills the test runner and can truncate buffered output on Windows pipes.
**Trade-offs:** None worth mentioning.

## Data Flow

### Request Flow: `til "uv is faster than pip"`

```
argv ["uv is faster than pip"]
   ↓
args.ts        -> { kind: 'add', text: 'uv is faster than pip', flags: {} }
   ↓
config.ts      -> storageDir = flag ?? env.TIL_DIR ?? join(homedir, 'til')
   ↓
deps.now()     -> Date (local)  ──▶ core/date: '2026-10-04', '14:32'
   ↓
storage.stat   -> { exists, endsWithNewline }   (last-byte probe, not full read)
   ↓
core/format    -> planAppend(...) -> "# 2026-10-04\n\n- 14:32 uv is faster...\n"
   ↓
storage.append -> mkdir -p dir; append (O_APPEND) UTF-8, no BOM, LF
   ↓
deps.out       -> "Added to 2026-10-04.md" (short confirmation); exit 0
```

### Read Flow: `til show [date]` / `til list`

```
argv -> Command{show, date?}  (date defaults to local "today" via the injected clock)
   ↓ parseDateArg() validates /^\d{4}-\d{2}-\d{2}$/ and real calendar date (reject "../x")
   ↓ storage.readDay(dir, date) -> text | null
   ↓ (v1) print raw text    |   (later) parseDayFile -> formatted output
   ↓ missing file -> friendly "No entries for <date>", exit 0 (not an error)

list: storage.listDays(dir) -> readdir, filter /^\d{4}-\d{2}-\d{2}\.md$/, sort desc
      -> optional entry count per day via parseDayFile
```

### State Management

None. The filesystem is the only state; there is no cache, index, or database. "Today" is recomputed on every invocation.

### Key Data Flows

1. **Add:** argv text -> normalized one-line entry -> appended to `<dir>/<localdate>.md`. The only write path in the system. Everything about Core Value lives here.
2. **Show:** date string -> validated -> path -> file text -> stdout. Read-only.
3. **List:** directory listing -> filtered/sorted date names (-> counts). Read-only.
4. **Config:** `(flags, env, homedir)` -> storage dir, resolved once per invocation, at the top of `run`.

## On-Disk File Format

Directory (default `~/til/`, overridable):

```
~/til/
├── 2026-10-03.md
├── 2026-10-04.md
└── 2026-10-05.md
```

`2026-10-04.md` after three entries (UTF-8, no BOM, LF line endings, trailing newline):

```markdown
# 2026-10-04

- 09:12 `git restore --staged <file>` unstages without touching the working tree
- 14:32 uv는 pip보다 의존성 해석이 훨씬 빠르다
- 23:58 PowerShell 5.1 기본 출력 인코딩은 UTF-8이 아니다
```

Format rules (all enforced in `core/format.ts`, so they are easy to change in one place):

- File name is `YYYY-MM-DD.md` in the user's LOCAL timezone.
- First line is `# YYYY-MM-DD`, then a blank line, written only when the file is created. Entries are never reordered or rewritten.
- One entry = one list item: `- HH:MM text` (24h local time). The time prefix is the only optional piece (a `--no-time` flag or config switch later); `- text` otherwise.
- Entry text is a single line: leading/trailing whitespace trimmed, internal newlines/tabs collapsed to a single space. Empty text is rejected (exit 2, usage error), never appended.
- Multiple unquoted argv words (`til uv is fast`) are joined with single spaces, so quoting is optional.
- Markdown in the text (backticks, links) is passed through verbatim; no escaping.
- Files are plain Markdown, so a hand-edited file (CRLF line endings, extra notes, no trailing newline) must remain valid. The tool only ever appends and never parses to write.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, ~1-20 entries/day, ~365 files/year | Nothing. Flat directory is fine for decades. |
| Thousands of day files | `list` reads only the directory listing; counting entries reads each file, so make counts opt-in (`list --count`) if it ever feels slow. |
| Many years / want month folders | Do NOT pre-optimize. If wanted, `YYYY/YYYY-MM-DD.md` is a storage-adapter-only change because path building is isolated in `core/date`. |

### Scaling Priorities

1. **First (and only plausible) bottleneck:** `list` with per-file parsing across years of files. Fix: skip counts by default.
2. **Second:** none realistic. Not an indexing or search problem; users have `grep`/`rg`.

## Anti-Patterns

### Anti-Pattern 1: Computing "today" with a UTC conversion

**What people do:** `new Date().toISOString().slice(0, 10)` (or the equivalent in other languages).
**Why it's wrong:** Returns the UTC date. A note taken at 01:00 KST (UTC+9) lands in YESTERDAY's file. This directly violates a stated constraint in PROJECT.md.
**Do this instead:** Build the date from local getters (`getFullYear`, `getMonth`+1, `getDate`) in one function, `localDate(now)`, and cover it with a test using a time that straddles midnight local vs UTC.

### Anti-Pattern 2: Read-modify-write of the day file

**What people do:** Read the whole file, add a line in memory, write the whole file back (or write to temp and rename).
**Why it's wrong:** Two near-simultaneous invocations lose one entry; a crash mid-write can truncate the file; it can clobber edits the user has open in an editor. All of that breaks Core Value.
**Do this instead:** Open in append mode and write the complete entry (heading + entry for a new file, or just the entry) in a single write call. Probe the existing file with a last-byte read only to decide whether a leading newline is needed.

### Anti-Pattern 3: Creating the heading in a separate write

**What people do:** `if (!exists) write(heading); append(entry);`
**Why it's wrong:** Two racing first-entries of the day can both see "not exists" and write two headings; a crash between the writes leaves a heading-only file.
**Do this instead:** Compute heading+entry as one string in `planAppend` and append once. The rare double-heading race is cosmetic and acceptable for a single-user tool; do not add locking.

### Anti-Pattern 4: Business logic reading globals

**What people do:** `new Date()`, `process.env.HOME`, `os.homedir()`, and `console.log` called deep inside formatting or command code.
**Why it's wrong:** Tests need fake timers, env mutation, and stdout capture, so they become flaky and hide real bugs.
**Do this instead:** Pass `Deps` in; keep `core/` free of such imports.

### Anti-Pattern 5: Trusting the date argument as a path

**What people do:** `join(dir, arg + '.md')` with whatever the user typed.
**Why it's wrong:** `til show ../../secret` reads outside the storage dir. Low risk for a personal tool, but trivially avoided.
**Do this instead:** Validate with a strict regex plus a real-calendar check, and only then build the path.

### Anti-Pattern 6: Over-building

**What people do:** Add a plugin system, a config-file parser, a database index, templates, or a command framework on day one.
**Why it's wrong:** The product value is "faster than opening an editor". Every layer adds startup latency and surface area. PROJECT.md explicitly lists databases and rich editing as out of scope.
**Do this instead:** Flag + env + default for config. Add a config file only if a real second setting appears (e.g. time-prefix on/off).

### Anti-Pattern 7: Making the subcommand grammar ambiguous

**What people do:** Support both `til "text"` and `til show` with no rule for `til "show"`.
**Why it's wrong:** A learning that begins with a reserved word (`til list comprehensions are lazy`) is mistaken for a command.
**Do this instead:** Bare words that are not an exact reserved first token (`show`, `list`, `add`, `help`, `--help`, `--version`) are an add. Provide `til add <text...>` and `--` (`til -- list comprehensions...`) as unambiguous escapes. Document the reserved words in `--help`.

## Integration Points

### External Services

None. By design there is no network, no sync, and no database.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| bin <-> cli | `run(argv, deps) -> Promise<exitCode>` | Single seam for in-process tests. |
| cli <-> core | Direct pure function calls | Core imports nothing from the shell, storage, or process. |
| cli <-> storage | `appendToDay(dir, date, text)`, `readDay(dir, date)`, `listDays(dir)` | Storage knows file naming only through `core/date.dayFileName`. Takes `dir` as a parameter. |
| cli <-> config | `resolveStorageDir(flags, env, homedir) -> string` | Pure. Resolved once, passed down; no module re-reads env. |
| cli <-> clock | `deps.now()` | The only source of time. |

### Platform notes (verify in the stack phase)

- Build paths with the platform path API (never string-concatenate `/` or `\`), and get the home dir from the platform API (`os.homedir()` or equivalent), not `$HOME` (undefined in plain PowerShell/cmd).
- Always write explicit UTF-8, no BOM, LF. Do not rely on a runtime default encoding (the Windows PowerShell 5.1 and legacy-codepage consoles are the known trap).
- Command-line arguments with Korean text arrive correctly in modern runtimes on Windows; the typical failure is on OUTPUT to a non-UTF-8 console and on STDIN piped from PowerShell 5.1. Include one e2e test spawning the real binary with a Korean argument, then read the bytes back.
- A single global install (npm bin / single binary) means `bin` must be tiny and import-light, since startup time is the user-facing speed.

## Testability Summary

| Concern | Technique |
|---------|-----------|
| "Today" / midnight / timezone | Inject `now`. Unit-test `localDate()` with fixed `Date`s, including a case where local date differs from UTC date (run test process with a non-UTC `TZ`, e.g. `Asia/Seoul`, or construct the Date from local components). |
| Storage dir | `--dir`/`TIL_DIR` pointed at a per-test temp directory; delete in teardown. Never touch the real `~/til` in tests. |
| Append safety | Temp-dir tests: append twice -> both present in order; pre-existing file without trailing newline -> entry on its own line; pre-existing content byte-for-byte unchanged (prefix check); concurrent appends via `Promise.all` -> no entry lost. |
| Encoding | Round-trip Korean, emoji, and CJK text; assert raw bytes are valid UTF-8, no BOM. |
| Output and exit codes | Inject `out`/`err` collectors; assert text and returned exit code from `run()`. |
| Arg grammar | Table-driven unit tests on `parseArgs`: bare text, multiple words, reserved words, `--`, empty text, bad date. |
| Real binary | 1-3 spawned-process smoke tests only (works as installed, exit codes, Korean arg). Everything else runs in-process for speed. |

## Suggested Build Order

Dependencies flow from the pure center outward. Each step is independently testable and leaves a working artifact.

1. **Core pure functions** (`date`, `format`, `config`): no I/O, no dependencies; the foundation. Local-date correctness and file-format decisions get locked in here, with the unit tests. Needs only a language/runtime choice.
2. **Storage adapter** (`appendToDay`, `readDay`, `listDays`) against a temp dir: depends on 1 (file name, planned text). All append-safety and encoding tests live here. This step satisfies Core Value on its own.
3. **CLI shell for `add`** (`args`, `deps`, `run`, `bin`): depends on 1 and 2. Yields the first end-to-end `til "..."` and the e2e smoke test. Resolve the subcommand grammar (Anti-Pattern 7) here.
4. **Read commands** (`show`, `list`, plus `parse.ts` if formatted output is wanted): depends on 2 and 3. Read-only and low risk, so it follows the write path.
5. **Packaging and cross-platform verification:** single global install; run the e2e suite on Windows (PowerShell + Git Bash) and at least one POSIX environment; verify console encoding. Depends on 3 (and 4 for the full surface). Can start as soon as step 3 works, to surface Windows encoding issues early.

**Roadmap implication:** steps 1-3 are the minimum viable product and one coherent phase ("append works, safely"). Step 4 is a natural second phase. Step 5 is a hardening/distribution phase, but a Windows smoke test should be run in step 3 since the author's primary platform is Windows.

## Sources

- Established design patterns (not individually web-verified in this pass): functional core/imperative shell (Gary Bernhardt, "Boundaries"); ports-and-adapters/dependency injection for testability; the "CLI `run(argv, deps)` returns exit code" convention used across well-tested CLIs; POSIX `O_APPEND` single-write append semantics for small writes.
- PROJECT.md (this repo): constraints on local timezone, append-only storage, UTF-8, cross-platform, zero-config.
- To verify in the stack phase: Windows console and stdin encoding behavior and argv decoding for the chosen runtime; append semantics of the chosen runtime's fs API on Windows.

---
*Architecture research for: small file-based note/journal CLI (til-cli)*
*Researched: 2026-10-04*
