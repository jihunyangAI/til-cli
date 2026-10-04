---
status: diagnosed
trigger: "UAT gap G-01-2: CI run 37210646435 windows-latest Node 24 failed npm run test:stress - STOR-06 '20 parallel identical entries: no de-duplication, one heading' got two '# 2026-10-04' headings (test/stress.test.ts:57 via :90)"
created: 2026-10-04T14:53:09Z
updated: 2026-10-04T15:10:00Z
goal: find_root_cause_only
---

## Current Focus
<!-- OVERWRITE on each update - always reflects NOW -->

hypothesis: CONFIRMED - check-then-act (TOCTOU) race in src/storage.ts. The 'ax' creator makes the file (0 bytes) and writes heading+entry in two separate syscalls; a concurrent loser (EEXIST -> appendExisting) that opens 'a+' and fstat()s inside that gap sees size===0, takes the "empty file needs a heading" branch, and appends its own `# date\n\n` + entry. Triggered when the creator is preempted between openSync('ax') and writeSync (CPU contention on CI).
test: done - instrumented branch logging (heading count == creator + size0 losers in every trial), deterministic 40ms widening, natural repro under 2-CPU pinning, and unmodified real gate failing 3/4 runs under 2-CPU pinning.
expecting: n/a (diagnose-only)
next_action: return ROOT CAUSE FOUND to caller; fix belongs to plan-phase --gaps (D-11 re-plan).
bug_class: concurrency  # deterministic logic flaw (TOCTOU) surfaced non-deterministically by scheduling; atomicity-violation class
known_pattern_candidate: none (no knowledge-base.md)
reasoning_checkpoint:
  hypothesis: "Duplicate headings occur because appendExisting decides to write dayHeading from fstat size===0, and the 'ax' creator leaves a 0-byte file visible between openSync and writeSync; a loser whose fstat lands in that gap writes a second heading."
  confirming_evidence:
    - "Instrumented runs: every file with N headings had exactly 1 creator + (N-1) loser-size0 branches (mismatch 0 across 165 trials); size0 losers' fstat preceded the creator's write by 1.9-7.4 ms."
    - "Unmodified gate pinned to 2 CPUs failed 3/4 runs at stress.test.ts:57 with the exact CI message (2 headings), once with 3 headings."
    - "CI log: lines[0]/lines[1] correct, all exit 0, one file - second heading is mid-file, the shape a late size0-loser write produces."
  falsification_test: "A duplicate-heading file where the number of size0-loser records + 1 != heading count, or a duplicate with zero size0 losers, would refute it. Observed: never."
  fix_rationale: "n/a (find_root_cause_only). Direction: the heading decision must not depend on observing a transient 0-byte state - either make create+content atomic or make a loser that sees 0 bytes unable to also write a heading."
  blind_spots: "CI Node 24.21.0 / Windows Server 2025 runner not instrumented directly (inferred from identical assertion shape and local repro on 24.12.0). Node 22 not run locally. Linux exposure of the same TOCTOU not measured (window there is presumably narrower, but the code flaw is OS-independent)."
  candidate_causes:
    - "code: TOCTOU between openSync('ax') and writeSync + size===0 heading branch in appendExisting (CONFIRMED)"
    - "environment: Windows O_APPEND non-atomic / torn writes (ELIMINATED - 0 lost/fragmented entries)"
    - "environment: CPU contention / scheduler preemption on CI runner widening the window (CONTRIBUTING trigger)"
    - "config: Node 24 vs 22 'ax' (O_EXCL) behavior difference (ELIMINATED - creators==1 in every trial)"
    - "data: stale dir / midnight straddle / test artifact (ELIMINATED - fresh mkdtemp, one file, same date)"
  and_gate: "yes - failure requires (a) the code TOCTOU AND (b) a loser's fstat landing inside the creator's create->write gap, which needs the creator delayed (preemption under CPU contention) or tighter process start clustering. (a) is the root cause; (b) only sets the probability, which is why idle 12-core local runs pass (0/300) and contended runs fail."
tdd_checkpoint: null

## Symptoms
<!-- Written during gathering, then immutable -->

expected: 20 parallel `til` processes writing to the same new day file produce exactly one `# YYYY-MM-DD` heading line, no de-duplication of entries.
actual: GitHub Actions run 37210646435. ubuntu-latest Node 22/24 and windows-latest Node 22 passed. windows-latest Node 24 failed `npm run test:stress`, test "STOR-06: 20 parallel processes (10 trial(s)) > 20 parallel identical entries: no de-duplication, one heading".
errors: "AssertionError: expected [ '# 2026-10-04', '# 2026-10-04' ] to have a length of 1 but got 2 at checkCommon test/stress.test.ts:57:51 (called from test/stress.test.ts:90:25)"
reproduction: `npm run test:stress` on Windows (intermittent; passed on windows Node 22 in the same run). `gh run view 37210646435 --log-failed`.
started: Discovered during UAT (Phase 01 Test 2, CI matrix).

## Eliminated
<!-- APPEND only - prevents re-investigating after /clear -->

- hypothesis: Windows O_APPEND writes are not atomic (interleaved/torn/overwritten writes) and produced the extra heading
  evidence: Across 165 instrumented trials (incl. 40ms widening and 2-CPU pinning) lostEntries=0 and every line parsed as a whole entry; CI scenario A (distinct entries, interleaving check) passed on the failing job. The extra text is a complete `# date\n\n` block, which only dayHeading() emits - it is a logic decision, not a torn write.
  timestamp: 2026-10-04T15:04:00Z

- hypothesis: 'ax' (O_CREAT|O_EXCL) is not exclusive on Node 24/Windows, so two processes both took the creator branch
  evidence: creators==1 in every instrumented trial on Node 24.12.0; every duplicate was creator + loser-size0.
  timestamp: 2026-10-04T15:04:00Z

- hypothesis: Test artifact - midnight straddle, stale/reused directory, or a second day file
  evidence: CI assertions before line 57 passed (one file == date.md, lines[0] heading, lines[1] blank); both headings carry the same date; each trial uses fresh mkdtemp.
  timestamp: 2026-10-04T14:55:30Z

- hypothesis: Node 22 vs 24 behavioral difference is the cause (failed only on Node 24)
  evidence: Failure is probabilistic (~1/44 Windows trials on CI, 0/300 idle locally, 3/4 runs of 30 trials under 2-CPU pinning on Node 24.12); mechanism is version-independent code logic. Node 22 passing in the same run is consistent with chance.
  timestamp: 2026-10-04T15:09:00Z

## Evidence
<!-- APPEND only - facts discovered during investigation -->

- timestamp: 2026-10-04T14:53:09Z
  checked: src/storage.ts appendEntry/appendExisting
  found: appendEntry does openSync(file,'ax') then a SEPARATE writeAll(heading+line). On EEXIST, appendExisting opens 'a+', fstat()s size, and if size===0 writes dayHeading(date) itself. The heading decision for losers is based on observed file size, not on who created the file.
  implication: Between the creator's openSync('ax') (file exists, 0 bytes) and its writeSync, any loser that fstat()s sees size 0 and also writes a heading -> two headings. Candidate race window.

- timestamp: 2026-10-04T14:53:09Z
  checked: .planning/STATE.md decisions
  found: "[Phase 01]: 01-03: stress gate passed unchanged; 'ax' creator 0-byte window recorded as residual risk, no retry/lock added"
  implication: The 0-byte window was known at plan 01-03 and accepted as residual risk because the stress gate passed locally.

- timestamp: 2026-10-04T14:55:30Z
  checked: 01-RESEARCH.md (D-10, D-11, F3, line 285, A3) and 01-03-SUMMARY.md "Residual Risk"
  found: Research line 285 states verbatim "a second process arriving in the microsecond window after another process created but has not yet written can add a second heading (cosmetic, entries preserved). Not observed in 175 stress trials." 01-03-SUMMARY "Residual Risk" says the 'ax' creator "makes the file and writes the heading in two syscalls. A concurrent loser that opens 'a+' in the gap sees size 0 and also prefixes a heading". D-11 says the stress test is the gate and a failing gate requires adding retry/lock (re-plan). A3 (POSIX O_APPEND atomicity) was the only CI-pending assumption; the failure is on Windows, not ubuntu.
  implication: The design knowingly accepted a TOCTOU between create (openSync 'ax') and heading write, guarded only by a probabilistic gate. The CI failure is the D-11 gate firing.

- timestamp: 2026-10-04T14:55:30Z
  checked: gh run view 37210646435 --log-failed (windows-latest, 24)
  found: Scenario A (distinct entries, 10 trials) passed; scenario B failed. Assertions before line 57 passed: all 20 exit codes 0, readdir == [date.md], first byte 0x23, no 0x0D, lines[0]=='# 2026-10-04', lines[1]==''. Only the "exactly one '# ' line" assertion failed with 2 identical headings for the same date.
  implication: The file starts correctly with heading+blank line, so the second heading is in the middle of the file (a later write carried a heading prefix). No process errored, no extra/temp file, no midnight split (same date, one file), no CR. This rules out EBUSY/EPERM failure paths, cross-date splits, and stale-file contamination. Consistent with a loser writing dayHeading(date)+line after observing size==0.

- timestamp: 2026-10-04T14:55:30Z
  checked: src/run.ts, src/core/format.ts, dist/cli.mjs (bundled storage), test/helpers.ts tempDir, .github/workflows/test.yml
  found: run() computes date once and calls appendEntry once; the only two code paths that emit dayHeading are (1) the 'ax' creator and (2) appendExisting when fstat size===0. dist/cli.mjs is a faithful bundle of src/storage.ts. Each trial uses a fresh mkdtemp directory. CI runs the same `npm run test:stress` (10 trials) on all 4 jobs.
  implication: Exactly two heading writers are possible per file: the creator plus any loser whose fstat ran before the creator's writeSync landed. A duplicate heading requires at least one loser in the size==0 branch.

- timestamp: 2026-10-04T14:57:00Z
  checked: Deterministic repro. Scratch instrumented copy of dist/cli.mjs (scratchpad/make-instr.mjs -> cli-instr.mjs) logging per-process branch (creator-HEADING / loser-size0-HEADING / loser-append) with QPC hrtime stamps, plus optional DELAY_MS busy-wait between the creator's openSync('ax') and writeSync. Harness scratchpad/harness.mjs mirrors stress scenario B (20 identical entries, fresh nested dir). Ran 5 trials with DELAY_MS=40.
  found: SUMMARY {"trials":5,"dupTrials":2,"mismatch":0,"lostEntries":0,"size0Losers":2}. In both duplicate trials: exactly 1 creator + 1 loser-size0, heading count in file == creator+size0 count (mismatch 0), 20/20 entries, all exit 0. Loser fstat happened at creatorCreated+32.6ms / +34.6ms, i.e. 7.4ms / 5.8ms BEFORE the creator's write. File head e.g. ["# 2026-10-04","","- 23:55 same 한글","- 23:55 same 한글","# 2026-10-04","", ...] - second heading mid-file, exactly the CI shape (lines[0], lines[1] correct, extra heading later).
  implication: Mechanism confirmed by direct observation: a loser that fstat()s the file while the creator holds it open at 0 bytes writes its own heading. Every duplicate heading is accounted for by a size0 loser; no other path contributes. Entries are never lost (O_APPEND writes are atomic on Windows), so only the heading invariant breaks.

- timestamp: 2026-10-04T15:01:00Z
  checked: Unmodified `npm run test:stress` x15 on this machine (Windows 11, Node 24.12.0, 12 logical CPUs, idle) = 300 scenario trials / 6000 process runs.
  found: 15/15 runs rc=0, zero duplicate headings.
  implication: On an idle many-core machine the race is rare, matching the research note "Not observed in 175 stress trials". Local passes are not evidence of safety; the failure is probabilistic.

- timestamp: 2026-10-04T15:02:30Z
  checked: Zero-delay instrumented harness (scratchpad/harness2.mjs), 40 trials, all 12 CPUs.
  found: creator create->write gap min/median/max = 213/389/1046 us. Earliest loser fstat relative to creator write min/p10/median = +11.3ms/+20.3ms/+45.1ms. size0Losers=0, dupTrials=0.
  implication: The race window is ~0.2-1 ms, but process start-up normally staggers the first loser 11+ ms behind the creator, so it rarely lands in the window. Any delay of the creator between CreateFile and WriteFile (preemption) or tighter process clustering closes that margin.

- timestamp: 2026-10-04T15:04:00Z
  checked: Same zero-delay harness, 60 trials, pinned to 2 CPUs (`cmd start /affinity 3`) to emulate a CPU-contended CI runner (windows-latest = windows-2025-vs2026 image; Node 24.21.0 failed, 22.23.3 passed in the same run).
  found: SUMMARY {"trials":60,"dupTrials":1,"mismatch":0,"lostEntries":0,"size0Losers":1}. In trial 12 the creator's create->write gap stretched to ~5.2ms (max across trials 58.4ms - the creator was preempted between openSync('ax') and writeSync); one loser fstat'd 1.9ms before the creator's write, saw size 0, and wrote a second heading. 20/20 entries, all exit 0, heading count == creator+size0.
  implication: Natural reproduction (no injected delay) of the exact CI failure at ~1/60 trials under CPU contention - same order as CI (1 failing trial out of 44 Windows scenario trials: 2 jobs x (1 npm-test + 10 stress) x 2 scenarios). The trigger is scheduler preemption of the creator inside the create->write gap; Node 22 vs 24 passing/failing is chance, not a version-specific behavior (creators==1 in every trial, so O_EXCL works).

- timestamp: 2026-10-04T15:09:00Z
  checked: UNMODIFIED real gate - `node node_modules/vitest/vitest.mjs run test/stress.test.ts` with TIL_STRESS_TRIALS=30, pinned to 2 CPUs (`cmd start /affinity 3`), 4 runs.
  found: 3 of 4 runs FAILED at test/stress.test.ts:57:51 (the one-heading assertion): run 1 scenario A (distinct) via :68; run 2 scenario B (identical) via :90 with "expected [ '# 2026-10-05', '# 2026-10-05' ] to have a length of 1 but got 2" - byte-for-byte the CI error; run 4 scenario A with THREE headings ("expected [ Array(3) ] ... got 3"). Run 3 passed.
  implication: The shipped code reproduces the CI failure on this machine without any instrumentation once CPU is contended. Both scenarios fail at the same assertion, so identical vs distinct text is irrelevant. Three headings show multiple losers can fall into the same 0-byte window. The 12-CPU idle runs passing is purely timing luck.

- timestamp: 2026-10-04T15:09:00Z
  checked: Phase 0 knowledge base - .planning/debug/knowledge-base.md
  found: File does not exist (debug dir was empty before this session); MemPalace not used.
  implication: No prior known pattern; investigation proceeded from first principles.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "TOCTOU (check-then-act) race in src/storage.ts. appendEntry creates the day file with openSync(file,'ax') and only afterwards, in a separate writeSync, writes dayHeading(date)+line, so the file is visible at 0 bytes for a window (~0.2-1 ms idle, up to tens of ms when the creator is preempted). appendExisting (the EEXIST path) decides whether to write a heading from fstatSync(fd).size === 0 - a branch added in 01-03 for touched/crash-left empty files - and cannot tell 'empty file' from 'creator has not written yet'. Any loser whose fstat lands in the window writes a second '# YYYY-MM-DD\\n\\n' block (entries are never lost because O_APPEND writes are atomic). The race was documented as accepted residual risk (01-RESEARCH line 285, 01-03-SUMMARY 'Residual Risk', STATE decision) and only guarded by a probabilistic gate that passes on idle many-core machines; CPU contention on the CI windows runner triggered it. Contributing condition (AND-gate): scheduler preemption of the creator inside the create->write gap."
fix: "(not applied - find_root_cause_only)"
verification: "(not applicable - diagnose-only)"
oracle_type:
files_changed: []
