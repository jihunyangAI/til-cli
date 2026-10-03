# Technology Stack

**Project:** til-cli (`til "<one line>"` appends to dated Markdown file)
**Researched:** 2026-10-04
**Mode:** Ecosystem + Comparison (greenfield)
**Overall confidence:** HIGH (versions verified against the npm and PyPI registries on 2026-10-04; install and Korean-text behaviour verified by a working prototype on the author's Windows 11 machine)

## Verdict

**Use Node.js (>=22.12, develop on Node 24 LTS) + TypeScript + commander, built to a single ESM file with tsdown, tested with vitest, installed globally with `npm install -g` (and `npm link` during development).**

Why this one, in order of weight:

1. **The toolchain is already on the author's machine.** Node 24.12.0, npm 11.6.2, Python 3.14.0 and uv 0.11.12 are installed. `go` and `cargo` are NOT installed. Go or Rust would add a toolchain install before the first line of code, for a tool whose whole value is being trivial.
2. **Single global command with zero ceremony.** `npm install -g .` creates `til`, `til.cmd` and `til.ps1` shims. I built, packed and installed a prototype into a temp prefix, then ran `til "한글 ..."` from Git Bash, PowerShell and the cmd shim. All three wrote correct UTF-8 (emoji included). No PATH fiddling beyond npm's global bin dir, which is normally already on PATH.
3. **Korean argv is a non-issue in Node on Windows.** Node receives argv as UTF-16 and writes files as UTF-8 by default. Python on Korean Windows has real traps (see below). Go and Rust are also fine here, but they lose on point 1.
4. **Tiny runtime surface.** The tool does `mkdir -p`, `appendFile`, `readFile` and a date format. `node:fs` and `Intl` cover all of it. Only one runtime dependency (commander) is needed.

A native-binary tool (Go/Rust) is only worth choosing if the author later wants to hand a `.exe` to people without Node. That is explicitly not a requirement ("personal tool"). It is a clean rewrite later because the file format is the contract, not the code.

## Recommended Stack

### Runtime and Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | `engines: ">=22.12"`; develop on 24 LTS (24.12.0 installed) | Runtime | Node 24 is Active LTS (EOL 2028-04-30). Node 22 is EOL 2027-04-30. Node 26 is Current and enters LTS Oct 2026. The `>=22.12` floor is dictated by commander 15 (`engines: >=22.12.0`) and vitest 5. | HIGH |
| TypeScript | 7.0.2 (`latest` on npm; native Go compiler, stable since mid-2026) | Type checking only (`tsc --noEmit`) | Verified: `tsc -p . --noEmit` works on 7.0.2 with `module: NodeNext`, `strict`. Used for checking only, so the missing stable programmatic API (promised in 7.1) does not affect this project. Fallback: pin `typescript@^6` if any tool in the chain complains. | MEDIUM-HIGH |
| ESM (`"type": "module"`) | n/a | Module format | Node 22+/24 handles ESM natively; commander 15 works as ESM. Avoids CJS/ESM interop pain. | HIGH |

### CLI Framework

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| commander | 15.0.0 | Arg parsing, `--help`, subcommands | The most widely used Node CLI parser, 1.0+ stable API, ships its own types, zero dependencies. Verified in prototype: `til "text with spaces"` and `til word word word` (variadic `[text...]`) both work. | HIGH |

Command surface to implement with it: default action `til <text...>` (append); `til show [date]` (today or given `YYYY-MM-DD`); `--dir <path>` override. Keep `til <text>` as the default command (commander `.argument("[text...]")` plus a `show` subcommand), because the Core Value is a zero-ceremony `til "..."`.

### Build and Distribution

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| tsdown | 0.23.0 | Bundle `src/cli.ts` to `dist/cli.mjs` | Successor to tsup (tsup 8.5.1 is no longer where the ecosystem is heading). Verified: one command (`tsdown src/cli.ts --format esm`) emits a 0.5 kB file; the `#!/usr/bin/env node` shebang from the source is preserved. Targets `node22.12.0` automatically from `engines`. Pre-1.0, so pin exactly. | MEDIUM-HIGH |
| npm global install | npm 11.x | Distribution as "a single global command" | `package.json` `"bin": {"til": "dist/cli.mjs"}` yields `til`, `til.cmd`, `til.ps1` on Windows and a symlink on macOS/Linux. Verified with `npm pack` then `npm install -g --prefix`. | HIGH |

Install paths, in increasing effort:
- Dev: `npm run build && npm link` (symlinks the repo; rebuild picks up changes).
- Personal use: `npm install -g .` from the repo (or `npm pack` then install the tarball).
- Optional later: `npm publish` then `npm i -g til-cli` (or `npx til-cli`). Not needed for v1.

### Storage and Date Handling (no libraries needed)

| Need | Use | Why |
|------|-----|-----|
| Append | `node:fs/promises` `appendFile(path, text, "utf8")` (flag `a`, i.e. `O_APPEND`) | Append-only is a hard requirement. `appendFile` never truncates. Never read-modify-write the day file. |
| Create dir | `mkdir(dir, { recursive: true })` | Zero-config first run. |
| Local date `YYYY-MM-DD` | `new Intl.DateTimeFormat("sv-SE").format(date)` (or manual `getFullYear/getMonth/getDate` padding) | Verified: for an instant of `2026-10-03T16:30Z` (01:30 KST on 10-04), `toISOString().slice(0,10)` gives the WRONG date `2026-10-03`, while the sv-SE formatter gives the correct local `2026-10-04`. `sv-SE` is the standard trick for ISO-like local dates. |
| Local time `HH:mm` | `getHours()/getMinutes()` padded | Local, same reason. |
| Home dir default | `os.homedir()` + `til` subdir (e.g. `~/til`), overridable via `TIL_DIR` env or `--dir` | Portable on all three OSes. |
| Config | env var `TIL_DIR` only for v1 | Do not add a config-file library. |
| Dates in code | Plain `Date` + `Intl` | Do not add dayjs/date-fns/luxon for one formatted string. |

Encoding detail: write files as UTF-8 **without BOM** and use `\n` line endings, even on Windows. Editors, GitHub and grep all handle this best. Do not use `os.EOL`.

### Testing

| Tool | Version | Purpose | Why | Confidence |
|------|---------|---------|-----|------------|
| vitest | 5.0.3 | Unit and integration tests | Verified on this machine: runs TS tests directly, 1 test in about 1 s, no config needed. `engines: ^22.12 \|\| ^24 \|\| >=26`. Compatible with the Node floor above. | HIGH |
| `node:fs` `mkdtemp(os.tmpdir())` | built in | Isolated per-test data dir | Pass the dir through the `TIL_DIR` env or a function parameter, so tests never touch the real `~/til`. |
| `execa` or `node:child_process` | optional | E2E smoke test of the built binary | Run `node dist/cli.mjs "한글"` against a temp dir. Plain `child_process.spawnSync` is enough; skip execa. |

Design for testability: put logic in pure functions (`formatEntry(date, text)`, `dayFilePath(dir, date)`, `appendEntry(...)`) taking an injected `Date` or clock, with `cli.ts` as a thin wrapper. The "1am KST" midnight-boundary case must be a unit test with an injected clock.

### Dev Tooling

| Tool | Version | Purpose | When |
|------|---------|---------|------|
| @types/node | `^22` (match the engines floor, NOT the registry latest 26.6.4) | Node typings | Always. Typing against 26 would let you use APIs missing in the supported Node 22. |
| TypeScript `tsc --noEmit` | 7.0.2 | `npm run typecheck` | CI/pre-commit |

Linting and formatting (eslint/prettier/biome) are intentionally left out of the required stack. For a roughly 150-line tool they add more config than value. Add Biome later if desired.

## Alternatives Considered (compared head to head)

| Criterion | **Node/TS + commander** (recommended) | Python + typer/click + uv | Go + cobra | Rust + clap |
|-----------|----------------------------------------|---------------------------|------------|-------------|
| Toolchain on author's machine today | Yes (Node 24.12) | Yes (Python 3.14 + uv 0.11.12) | **No** (`go` missing) | **No** (`cargo` missing) |
| Single global command | `npm i -g` / `npm link`; shims for cmd, PowerShell and bash | `uv tool install .` / `pipx install .`; exe lands in `~/.local/bin`, which often needs a one-time `uv tool update-shell` on Windows | Single static `.exe`; copy to a PATH dir manually or `go install` | Single `.exe`; `cargo install --path .` |
| Runtime needed on target | Node (>=22.12) | Python (>=3.10) | None | None |
| Korean argv/stdout on Windows | Good out of the box | Risky: console and `open()` default to cp949 unless forced. I hit `UnicodeEncodeError: 'cp949' codec can't encode` while printing emoji during this research. Must pass `encoding="utf-8"` to every `open()` and reconfigure stdout. | Good | Good |
| Startup latency | about 40-60 ms | about 50-100 ms (typer/click import cost) | about 5 ms | about 5 ms |
| Test story | vitest (excellent) | pytest 9.1.1 (excellent) | `go test` (excellent) | `cargo test` (excellent) |
| Distribution effort for a non-Node user | Needs Node (or later `bun build --compile`/Node SEA) | Needs Python/uv | Easiest: attach exe to release (SmartScreen warning for unsigned exe) | Same as Go |
| Current lib versions verified | commander 15.0.0, citty 0.2.2, cac 7.0.0 | typer 0.27.2, click 8.5.0, cyclopts 5.1.1 | cobra v1.10.2 | clap 4.6.7 |

Why not each:

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Language | Node/TS | **Python (typer + uv tool)** | Close second and perfectly viable, since uv is installed. Loses on Windows encoding hazards (cp949 default, as I tripped over live), slower import-time startup, and an extra PATH step (`uv tool update-shell`). Choose Python if the author would rather maintain Python than TS. Python 3.15 makes UTF-8 mode the default (PEP 686), which narrows this gap later. |
| Language | Node/TS | **Go + cobra** | Best end product (static binary, about 5 ms start) but requires installing Go, and cobra's scaffolding is heavy for a one-command tool (the stdlib `flag` package would suffice). Right choice only if the goal shifts to "give a binary to other people". |
| Language | Node/TS | **Rust + clap** | Same binary benefits, highest build and learning overhead, nothing in this problem needs it. Overkill. |
| CLI parser | commander 15 | citty 0.2.2 | Pre-1.0, so API churn risk; smaller community. Nice DX but no reason to take the risk. |
| CLI parser | commander 15 | cac 7.0.0 | Fine and small, but commander has better help output, subcommand semantics and docs. |
| CLI parser | commander 15 | `node:util` `parseArgs` (zero dependency) | Genuinely viable for 2 subcommands and makes the package dependency-free. Rejected only because commander gives `--help`/`--version`/error messages for free; if the author prefers zero deps, this is the acceptable swap. |
| CLI parser | commander 15 | yargs, oclif, clipanion, `@clack/prompts` | yargs is heavy; oclif is a framework meant for plugin-based CLIs; clack is interactive prompts and the product is explicitly non-interactive. |
| Bundler | tsdown | tsup 8.5.1 | Still works but tsdown is the maintained successor (same author lineage, rolldown-based). |
| Bundler | tsdown | no bundler (`tsc` emit, or Node native type-stripping) | Node 24 can run `.ts` directly, but NOT from inside `node_modules` (global install), so a published or installed package must ship JS. A build step is required for `npm i -g`. `tsc` emit also works; tsdown is simply a one-liner with shebang handling. |
| Test | vitest | `node:test` | Viable (zero dep) but vitest's TS support, watch mode and assertions are nicer. Either is fine. Not worth debating. |
| Test | vitest | jest | Needs extra TS/ESM config. No. |
| Date | `Intl` / manual | dayjs, date-fns, moment, luxon | Dependency for one `YYYY-MM-DD` string. No. |
| Packaging | npm global | pkg, nexe, Bun compile, Node SEA | Binary-izing Node apps is a distribution concern for later. Not v1. |

## Installation

```bash
# Project setup
npm init -y            # then set: "type":"module", "bin":{"til":"dist/cli.mjs"},
                       #           "files":["dist"], "engines":{"node":">=22.12"}
npm install commander@^15

npm install -D typescript@^7 tsdown@0.23.0 vitest@^5 @types/node@^22

# package.json scripts
#   "build":     "tsdown src/cli.ts --format esm"
#   "typecheck": "tsc --noEmit"
#   "test":      "vitest run"
#   "prepare":   "npm run build"      # so `npm i -g .` / `npm link` always has dist/

# Source entry must start with:  #!/usr/bin/env node   (tsdown preserves it)

# Use on the author's machine
npm run build && npm link          # during development
npm install -g .                   # stable personal install
```

Recommended `tsconfig.json`: `target ES2023`, `module NodeNext`, `moduleResolution NodeNext`, `strict`, `noEmit`, `skipLibCheck`, `types: ["node"]` (this exact config was verified under TS 7.0.2).

## What NOT to Use

- **`new Date().toISOString().slice(0, 10)` for the filename.** It is UTC. A note written at 01:30 KST would land in yesterday's file (verified). Use local-date formatting.
- **`fs.writeFile` / read-modify-write for entries.** Risks clobbering prior content (violates the Core Value). Use `appendFile` only; create the heading with an exclusive-create (`flag: "wx"`) or an existence check immediately before the first append.
- **`os.EOL` or CRLF, and a UTF-8 BOM.** Produces noisy diffs and ugly GitHub rendering.
- **A config-file or database library** (conf, cosmiconfig, sqlite). Out of scope; env var plus flag is the whole configuration.
- **Interactive prompt libraries (inquirer, clack).** Must be faster than opening an editor.
- **Chalk/colour libraries.** Not needed; `picocolors` (1.1.1) only if colour is wanted later.
- **`ts-node`.** Superseded by build output or Node native type stripping.
- **Python without `encoding="utf-8"`** (if the stack is ever switched): the default on Korean Windows is cp949.

## Sources

- npm registry (`npm view`, 2026-10-04): commander 15.0.0 (`engines >=22.12.0`), citty 0.2.2, cac 7.0.0, typescript 7.0.2 (`latest`), vitest 5.0.3 (`engines ^22.12 || ^24 || >=26`), tsdown 0.23.0 (peer typescript `^5 || ^6 || ^7`), tsup 8.5.1, @types/node 26.6.4. HIGH (primary registry).
- PyPI JSON API (2026-10-04): typer 0.27.2, click 8.5.0, cyclopts 5.1.1, pytest 9.1.1. HIGH.
- crates.io API: clap 4.6.7. Go module proxy: cobra v1.10.2. HIGH.
- Local prototype in the session scratchpad (2026-10-04, Windows 11, Node 24.12.0): commander plus tsdown build, shebang preserved, `tsc --noEmit` on 7.0.2, `npm pack` plus `npm install -g --prefix` created `til`/`til.cmd`/`til.ps1`, Korean and emoji args written correctly from PowerShell, `til.cmd` and Git Bash, vitest 5.0.3 test passing, UTC vs local date discrepancy reproduced. HIGH (directly observed).
- [TypeScript 7 released (InfoQ)](https://infoq.com/news/2026/08/typescript-7-released/), [devclass: TypeScript 7.0 first stable Go release](https://www.devclass.com/development/2026/07/10/speedier-type-checks-in-typescript-70-as-first-stable-go-release-ships/5269206): TS 7 stable, programmatic API deferred to 7.1. MEDIUM (web search, multiple concordant sources).
- [Node.js Releases](https://nodejs.org/about/releases/) and [Node.js release schedule summary](https://gorbe.io/posts/nodejs/release-schedule/): Node 24 Active LTS (EOL 2028-04-30), Node 22 EOL 2027-04-30, Node 26 enters LTS Oct 2026. MEDIUM (search summaries; consistent with known schedule).
- Startup-time figures in the comparison table are approximate typical values, not measured here. LOW; they do not drive the decision.

## Open Items for Roadmap

- Decide at phase planning whether the default entry has a `HH:mm` prefix (requirement says optional); that is a feature decision, not a stack one.
- Confirm npm's global bin dir is on PATH on the author's PowerShell and Git Bash (`npm config get prefix`). It was fine for the shim test, but verify in the real environment during the install phase.
- If TypeScript 7 causes any tooling friction, pin `typescript@^6`; nothing in the design depends on 7.
