---
phase: 01-safe-capture
plan: 04
subsystem: distribution
tags: [npm-shims, powershell, cmd, git-bash, ci, github-actions, global-install, windows]

requires:
  - phase: 01-safe-capture
    provides: "01-02 grammar (--, add, --help, --version) and 01-03 hardened storage + stress gate"
provides:
  - "scripts/test-install.mjs: win32 shim matrix (npm pack -> temp-prefix install -> PowerShell 5.1 / cmd / Git Bash) with byte-exact day-file assertions"
  - "npm run test:install script"
  - ".github/workflows/test.yml: windows-latest + ubuntu-latest x Node 22/24 running npm ci, typecheck, test, test:stress"
  - "Global til (til, til.cmd, til.ps1) installed from this repo into the npm global prefix"
affects: [phase-02-readme, phase-02-show]

plan_head_before: 0f36667afce095dffe0e7d19efca3dcf65df324c
plan_head_after: e15461f8965aae2baa25367b40fac2f20a151375

actuals:
  tokens: 2500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Shim matrix: Korean text enters shells only through an env var (TIL_TEXT), never inside a script file, so cmd OEM and PowerShell 5.1 ANSI script decoding cannot mangle it"
    - "Every child process in the harness runs with timeout 60 s (npm 240 s), killSignal SIGKILL and input '' so nothing can wait on stdin"
    - "Day-file bytes (not shell-captured stdout) are the source of truth for Korean/emoji assertions"

key-files:
  created:
    - scripts/test-install.mjs
    - .github/workflows/test.yml
  modified:
    - package.json

key-decisions:
  - "Reused the stalled attempt's scripts/test-install.mjs after review (it matched the plan line by line) and hardened it with a shared RUN options object: timeout, SIGKILL and closed stdin on every spawn"
  - "actions/checkout and actions/setup-node pinned to @v7 (latest releases looked up with gh api: v7.0.1 and v7.0.0)"
  - "Global install is `npm install` then `npm install -g .` from the main checkout (npm links it as a symlink to the repo)"

requirements-completed: [DIST-01, DIST-02, CAPT-03, STOR-04]

duration: 12 min
completed: 2026-10-04

coverage:
  - id: D1
    description: "A Korean+emoji entry typed through the real PowerShell 5.1 (til.ps1), cmd (til.cmd via call) and Git Bash (til) shims lands in the day file as exact UTF-8, LF only, no BOM, one heading"
    requirement: "DIST-02"
    verification:
      - kind: command
        ref: "npm run test:install (powershell/cmd/git-bash korean+emoji, day file byte checks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`til '--' -dash` (PowerShell) and `til -- -dash` (cmd, Git Bash) record -dash; `til add show me` records `show me` in all three shells"
    requirement: "CAPT-03"
    verification:
      - kind: command
        ref: "npm run test:install (3 -dash lines, 3 show me lines in the day file)"
        status: pass
    human_judgment: false
  - id: D3
    description: "`til --version` prints 0.1.0 and `til --help` exits 0 with usage text through all three shims"
    requirement: "DIST-01"
    verification:
      - kind: command
        ref: "npm run test:install (version and help cases per shell)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The packed tarball holds only dist/cli.mjs and package.json (no src/ or test/)"
    requirement: "DIST-01"
    verification:
      - kind: command
        ref: "npm run test:install (tarball til-cli-0.1.0.tgz: 2 files)"
        status: pass
    human_judgment: false
  - id: D5
    description: "til is installed globally from this repo and answers from Git Bash: --version prints 0.1.0, --help contains til '--'"
    requirement: "DIST-02"
    verification:
      - kind: command
        ref: "til --version | grep -qx 0.1.0 && til --help | grep -q \"til '--'\"; npm ls -g shows til-cli@0.1.0"
        status: pass
    human_judgment: false
  - id: D6
    description: "CI matrix file exists for windows-latest and ubuntu-latest on Node 22 and 24 with npm ci, typecheck, test, test:stress"
    requirement: "STOR-04"
    verification:
      - kind: command
        ref: "grep of .github/workflows/test.yml for the required tokens"
        status: pass
    human_judgment: false
  - id: D7
    description: "In fresh PowerShell 5.1, Git Bash and cmd windows, til prints Saved: with readable Hangul and a File: path (console rendering, research A2)"
    requirement: "DIST-02"
    verification: []
    human_judgment: true
    rationale: "Hangul rendering in a real cp949 console window, fresh-window PATH and ExecutionPolicy behavior cannot be observed from a non-interactive agent session; deferred to end-of-phase human review per the plan"
  - id: D8
    description: "The ubuntu-latest jobs of test.yml pass once the repo has a GitHub remote (STOR-04 on a non-Windows OS, research A3/A4)"
    requirement: "STOR-04"
    verification: []
    human_judgment: true
    rationale: "No GitHub remote exists yet, so the workflow cannot run; deferred per D-22"
---

# Phase 1 Plan 4: Distribution Shim Matrix, CI and Global Install Summary

**`npm run test:install` packs the CLI, installs the tarball into a temp prefix and drives the real `til.ps1`, `til.cmd` and Git Bash shims, proving byte-exact Korean/emoji capture plus the `--`/`add`/`--help`/`--version` paths; a windows+ubuntu CI matrix is defined and `til` is installed globally from this repo.**

## Performance

- **Duration:** 12 min for this retry attempt (2026-10-04T13:54Z to 14:06Z); a prior attempt stalled earlier and produced no commits
- **Tasks:** 2 completed
- **Files:** 3 changed (2 created, package.json script)
- **Tests:** 154 passing, `npm run test:stress` 2 passing, `npm run typecheck` clean, `npm run test:install` all shells passed

## Accomplishments

- `scripts/test-install.mjs` runs the whole user path: `npm pack --json` (asserts only `dist/cli.mjs` and `package.json`, nothing under `src/` or `test/`), `npm install -g --prefix <tmp>` (asserts `til`, `til.cmd`, `til.ps1`), then 5 asserted cases per shell in PowerShell 5.1, cmd and Git Bash, then reads the day file as a Buffer: first byte `#`, no CR, no BOM, 1 heading, 1 each of `pwsh`/`cmd`/`bash` Korean+emoji lines, 3 `-dash`, 3 `show me`.
- The informational unquoted PowerShell run printed `exit 2, stderr has "til '--' <text>" hint: true`, confirming the D-18 npm `.ps1` shim limitation (not asserted).
- `.github/workflows/test.yml` (D-22): `push`/`pull_request`, `permissions: contents: read`, matrix `os: [windows-latest, ubuntu-latest]` x `node: [22, 24]`, `fail-fast: false`, official `actions/checkout@v7` and `actions/setup-node@v7` only, then `npm ci`, `npm run typecheck`, `npm test`, `npm run test:stress`.
- Global install done in the main checkout (`npm install`, then `npm install -g .`): `npm ls -g --depth=0` shows `til-cli@0.1.0 -> ...\til-cli`; Git Bash `til --version` prints `0.1.0` and `til --help` contains `til '--'`. The npm global prefix (`C:\Users\user\AppData\Roaming\npm`) is already in the user PATH, and the PowerShell ExecutionPolicy for CurrentUser is `RemoteSigned`.

## Task Commits

1. **Task 1:** `3ea2498` test(01-04): add PowerShell/cmd/Git Bash shim matrix
2. **Task 2:** `e15461f` ci(01-04): add windows/ubuntu test matrix

## Phase 2 README hand-off

1. PowerShell needs `til '--' <text>` to record text that starts with `-`; the npm `.ps1` shim swallows an unquoted `--` (D-18). cmd and Git Bash use `til -- <text>`.
2. Run `npm install` before `npm install -g .` (devDependencies are needed so `prepare` can build `dist/`).
3. The global install is a symlink to the repo directory: do not move or delete the checkout, and never install from a linked worktree that gets removed after merge.
4. PowerShell ExecutionPolicy `Restricted` blocks `til.ps1`; use `RemoteSigned` (the current setting on this machine) or call `til.cmd`.
5. PowerShell 5.1 needs `Get-Content -Encoding UTF8` to view day files without mojibake.

## Retry Record

A previous executor for this plan stalled (no progress for 600 s while fixing a regex escape) and made no commits, leaving `scripts/test-install.mjs` (194 lines, untracked) and the `test:install` script line in `package.json` uncommitted. This attempt reviewed that work against the plan, found it correct (all asserted cases, byte checks, informational run, `npm_execpath`, `windowsVerbatimArguments`, Git Bash resolution without the WSL launcher), and kept it. The only change was adding a shared `RUN` options object (`encoding`, `input: ''`, `timeout` 60 s, `killSignal: 'SIGKILL'`; npm calls 240 s) to every `spawnSync` so no child can hang, per the retry's anti-stall rules. Every process-running call in this attempt was bounded by a Bash `timeout` with stdin from `/dev/null`; no step needed a third retry.

## Deviations from Plan

None - plan executed exactly as written (the timeout hardening of the reused script satisfies the plan's own requirement of a deterministic, non-hanging harness and changes no behavior).

**Total deviations:** 0. **Impact:** none.

## Deferred to End-of-Phase Human Review

- Fresh-window console check (steps 1-7 of the plan's `<human-check>`): Hangul readable in real PowerShell 5.1, Git Bash and cmd windows, `File:` path under `~/til`, quoted vs unquoted PowerShell `--`, `--version`/`--help` in all three, optional PowerShell 7 (research A1, `pwsh` not installed on this machine so unverified).
- Step 8: push to a GitHub remote and confirm all four CI jobs, especially ubuntu-latest. Deferred: no remote yet (D-22).

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. The workflow uses only the two official actions with `contents: read` (T-01-15); the harness uses temp `TIL_DIR` per run so the real `~/til` was never touched (T-01-17); the tarball contents are asserted (T-01-14); the global install is the user's own prefix with no admin and no new packages (T-01-16, T-01-SC).

## Authentication Gates

None.

## Next Phase Readiness

- Phase 1 plans are all complete; ready for phase verification (`/gsd-verify-work`) with the two human-check items above queued.
- `npm test`, `npm run test:stress`, `npm run typecheck` and `npm run test:install` all exit 0.

## Self-Check: PASSED

- FOUND: scripts/test-install.mjs, .github/workflows/test.yml, package.json script `test:install`
- FOUND commits: 3ea2498, e15461f; `git rev-list --count 0f36667..HEAD` = 2 at SUMMARY time
- Re-ran acceptance criteria: `npm run test:install` ends with `test-install: all shells passed`; grep counts npm_execpath 1, windowsVerbatimArguments 1, TIL_TEXT 7; package.json script exact and no `dependencies`; informational output line present; workflow contains windows-latest, ubuntu-latest, npm ci, typecheck, test, test:stress, `contents: read`; `npm ls -g` shows `til-cli@0.1.0`; Git Bash `til --version` is `0.1.0`, `til --help` contains `til '--'`.
