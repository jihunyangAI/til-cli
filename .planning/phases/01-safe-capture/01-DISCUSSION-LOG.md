# Phase 1: Safe Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-04
**Phase:** 1-Safe Capture
**Areas discussed:** Bare `til` behavior, Command grammar, Confirmation output, Text normalization, Storage location, Exit codes, Install method
**Mode:** `--auto` — every choice is the recommended default; no user answers were collected.

---

## Bare `til` behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Print help, exit 0 | Phase 1 has no `show`; avoids scope creep | ✓ |
| Show today's entries | Needs Phase 2 `show` logic | |
| Error, exit 2 | Treat as missing text | |

**Choice:** [auto] Print help (recommended). Revisit in Phase 2.

## Command grammar

| Option | Description | Selected |
|--------|-------------|----------|
| Reserve `add`/`show`/`list`/`help` as first token; `--` and `add` escapes | Stable grammar before Phase 2 | ✓ |
| Reserve only when sole argument | Fewer collisions, less predictable | |
| Flags only (`-s` for show) | No reserved words, less readable | |

**Choice:** [auto] Reserve first tokens (recommended).

## Confirmation output

| Option | Description | Selected |
|--------|-------------|----------|
| `Saved: - HH:MM text` + `File: <path>` (ASCII framing) | Shows exact stored text and path; safe in cp949 consoles | ✓ |
| Single line with ✓ glyph | Glyph risk on legacy consoles | |
| Silent on success | Fails CAPT-06 | |

**Choice:** [auto] Two plain lines (recommended).

## Text normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Trim + collapse all whitespace/newlines to one space, no escaping | One list item per entry, verbatim content | ✓ |
| Escape Markdown specials | Changes what the user typed | |

**Choice:** [auto] Collapse, no escaping (recommended).

## Storage location

| Option | Description | Selected |
|--------|-------------|----------|
| `~/til` default, `TIL_DIR` override with `~` expansion | Matches CONF-01/02 | ✓ |
| `~/.til` hidden dir | Harder to find/sync | |

**Choice:** [auto] `~/til` (recommended).

## Exit codes

| Option | Description | Selected |
|--------|-------------|----------|
| 0 ok / 1 IO failure / 2 usage error | Conventional | ✓ |
| 0 / 1 only | Less scriptable | |

**Choice:** [auto] 0/1/2 (recommended).

## Install method

| Option | Description | Selected |
|--------|-------------|----------|
| `npm install -g .` from repo (+ `npm link` for dev) | No publish needed | ✓ |
| Publish to npm | Out of v1 scope | |

**Choice:** [auto] Local global install (recommended).

---

## Claude's Discretion

- Module layout, message wording, test organization, clock injection mechanics.

## Deferred Ideas

- Bare `til` → show today (Phase 2); `--no-time`, stdin, `-d`, `--dir`/config, rollover cutoff (v2).
