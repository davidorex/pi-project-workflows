# Root cause: pi-context test-suite hang after the converge-on-write cells (2026-07-05)

Empirical investigation of the `npm test` hang on `feat/task-087-converge-on-write`. Every claim below is
observed, not inferred; commands were bounded (`perl -e 'alarm shift; exec @ARGV' <secs> …` — macOS here has no
`timeout`/`gtimeout`). No repo files were modified; cell isolation used `--test-name-pattern`, not edits.
Environment: node v23.7.0, tsx v4.21.0, proper-lockfile 4.1.2.

## Verdict in one paragraph

The hang is NOT a lock/timer/event-loop-handle leak — proper-lockfile is exonerated (its update timer is
`unref()`d, and no lockfile frame appears in any captured stack). The hang is a **100%-CPU synchronous spin
inside node:assert's failure-message reconstruction**: the new cell `opt-in: without a derived-status invariant
the hook writes nothing` contains the file's one **message-less** `assert.ok(typeof result === "object")`; that
assertion FAILS (see "underlying defect" below), and a failing bare `assert.ok` makes Node re-derive the
expression text by reading the source at the throwing frame's position and parsing it with acorn
(`getErrMessage → getCode → findColumn → parseCode → parseExpressionAt`, node:internal/assert/utils). Under tsx
the frame position refers to the esbuild-transformed module — **line 1, column 111387** — which never matches
the on-disk multi-line TS, so the reconstruction never converges: observed ≥49 min CPU with no completion.
The spin starves the event loop, so (a) no TAP output ever flushes (log frozen), (b) the child never exits and
the `tsx --test` parent waits forever (the suite "hang"), and (c) SIGTERM is absorbed — signal-exit
(a proper-lockfile dependency) registers a TERM handler whose callback is queued on the starved loop, so the
child survives `kill` and needs SIGKILL.

## Reproduction table (all bounded)

| Run | Command (bounded) | Result |
|---|---|---|
| Full file, runner mode | `alarm 150 npx tsx --test …/install-subcommand.test.ts` | killed at 150s (exit 142), **0 bytes output**; child left spinning at 100% CPU, R state |
| Full file, in-process | `alarm 100 npx tsx …/install-subcommand.test.ts` | same: spin, 0 bytes |
| Cell 1 `member-status op write` (`--test-name-pattern`) | 100s bound | **fails fast** (~8ms): `AssertionError: the member write must succeed` — messaged assert, no spin |
| Cell 2 `membership-edge` | 100s bound | **fails fast**: thrown `Error: Relation 'phase_positioned_in_milestone' … orientation-ambiguous … re-issue with --primary/--counter` (context-sdk.ts:1814) |
| Cell 3 `opt-in` | 100s bound | **SPINS** — killed at deadline; this is the hang cell |
| Cell 4 `best-effort` | 100s bound | **fails fast**: `ReferenceError: makeDivergentSubstrate is not defined` (defined inside the *other* describe's scope, test.ts:3224) |
| Minimal repro, bare assert | `alarm 45 npx tsx mini/bare-assert.test.ts` (3000 padding lines + failing `assert.ok(expr)`) | killed at 45s, 0 bytes — spin reproduced outside pi-context |
| Minimal repro, messaged assert | identical file + message arg | clean failure in **0.36s** |
| Hang cell + `--test-timeout=5000` | `alarm 100 npx tsx --test --test-timeout=5000 --test-name-pattern=opt-in …` | runner parent reports `'test timed out after 5000ms'` + full summary at ~5s, but never exits — alarm killed it at 100s; child had absorbed the parent's SIGTERM |

Stray-process evidence: three orphaned children found spinning R-state at ~100% CPU (one from the user's
original hang at 42–49 min accumulated CPU, PID 89540 — left running, not mine to kill; it also survived the
suite's termination, consistent with the starved signal handler).

## The proven mechanism (stack evidence)

Native sample (`sample <pid>`) of the spinning child: all samples inside
`Builtins_PromiseFulfillReactionJob → Builtins_AsyncFunctionAwaitResolveClosure → InterpreterEntryTrampoline…`
— a pure-JS loop inside a resumed async function (a node:test subtest), zero fs/syscall frames, zero libuv
timer frames.

JS stack via V8 inspector (SIGUSR1 + CDP `Debugger.pause`; `--report-on-signal` was useless — the report
signal handler is itself starved by the spin). Captured **twice on independent processes**, identical:

```
Parser              (acorn)        :537
parseExpressionAt   (acorn)        :655
parseCode           node:internal/assert/utils :138
findColumn          node:internal/assert/utils :57/:78   (deep self-recursion, ~60 frames)
getCode / getErrMessage            :87/:217
innerOk / ok        node:assert    :268/:190
(anon)              install-subcommand.test.ts  1:111387   ← the failing bare assert.ok, tsx-transformed position
runInAsyncScope → Test.run → processPendingSubtests        (node:test machinery)
```

`1:111387` is the smoking gun: node:test also reports the new cells at `install-subcommand.test.ts:1:109628`
etc. — tsx serves the transformed module as effectively one line, and error positions are not source-mapped
back. `getErrMessage` opens the *on-disk* file and hunts for line 1 / column 111387; the mismatch drives
`findColumn`'s recursive re-reads and acorn re-parses without a terminating match. Empirical bound: ≥49 min
CPU without completing on this ~3200-line file; the 3000-line minimal repro also exceeds 45 s, while the
message-carrying twin finishes in 0.36 s (message present ⇒ `getErrMessage` is skipped entirely).

Why "frozen log, completed suites, no summary" in the full run: the file's tests are synchronous, so the whole
file executes as one macrotask chain; the reporter's stream output only flushes when the loop turns, which the
spin prevents — everything already "passed" in memory but nothing was written. Why `withBlockLock` is clean:
lockSync's refresh timer is `unref()`d and `unlockSync` runs in `finally` (block-api.ts:45–56); no lock frame
appears in any stack; the hook's `catch {}` (index.ts, `convergeDerivedStatusAfterWrite`) correctly swallowed
the pre-identity stamping throw — the locked section itself behaved.

## The underlying defect the spin was masking (why the assert fails at all)

`OpResult = string | { json } | { read }` (ops-registry.ts:130), and for most of the 11 CONVERGE_AFTER_OPS a
**string is the SUCCESS result**: `update-block-item` returns `` `Updated item (…)` `` (ops-registry.ts:324),
`append-block-item` `` `Appended item…` ``, `write-block` `` `Wrote block …` ``, `remove-block-item`,
`replace-relation` — all string-on-success. The new wrapper (ops-registry.ts:2391–2399) converges only when
`result !== null && typeof result === "object"`, on the stated premise "a string result on these ops is an
error/refusal surface" — that premise is inverted. Consequences:

1. **The feature is dead for the string-returning wrapped ops**: the hook never fires after e.g.
   `update-block-item`, so cell 1's convergence assertion fails honestly.
2. All four cells assume an object success result (`assert.ok(typeof result === "object" …)`), so cells 1 and 3
   fail on the op contract, independent of convergence.
3. Cell 3's copy of that assertion is the file's only bare one → the spin.

Note the earlier green full-suite run is consistent: no fixture declared a `derived-status` invariant, no
wrapped-op result was ever asserted to be an object, so neither defect could surface.

Independent test-authoring defects (fail fast, no hang): cell 2 appends the orientation-ambiguous role-bearing
relation with bare `--parent/--child`, which `orientAppendInput` (context-sdk.ts:1814) rejects by design —
the fixture must use `--primary/--counter` or a relation without `role_direction`; cell 4 calls
`makeDivergentSubstrate` from outside its defining describe scope (`ReferenceError`, test.ts:3224).

## Fix path (production-first, class-level)

1. **Wrapper success boundary** (`packages/pi-context/src/ops-registry.ts`, the CONVERGE_AFTER_OPS wrapper,
   ~line 2391): an op signals failure by THROWING (observed: cell 2's refusal is a throw; success is a string
   or object). Converge when `inner()` returns without throwing — not on a result-shape heuristic — and skip
   when the call was a preview: `append-relation`/`remove-relation`/`replace-relation` accept `dryRun`
   (ops-registry.ts:371/439/492), and a dry run must not trigger a substrate write. Shape:
   `const result = inner(cwd, params, ctx); if (result instanceof Promise) return result.then(s => { if (!(params as any)?.dryRun) convergeDerivedStatusAfterWrite(cwd, ctx); return s; }); if (!(params as any)?.dryRun) convergeDerivedStatusAfterWrite(cwd, ctx); return result;`
   Fix the wrapper's comment (its "string = refusal" claim is false) and the parallel claim inside the
   `INTENTIONALLY_UNEXPOSED_WRITERS` entry if worded the same way.
2. **Test cells corrected to the real contracts** (install-subcommand.test.ts, new describe at ~3079):
   assert success as "did not throw" + converged DISK state (`milestoneStatus`), never `typeof result`;
   cell 2's fixture: either register the membership relation without overlapping endpoint kinds or drive the op
   with `primary`/`counter`; cell 4: move `makeDivergentSubstrate` to module scope (it is used by two describes
   now) — the `withSubstrateId` param stays.
3. **Hang-class guard (every failing bare assert in ANY tsx-run test file can freeze the whole suite —
   958 occurrences repo-wide: 344 in pi-context, 542 in pi-workflows + pi-jit-agents `assert.ok(x);` /
   `assert(x);`)**: adopt "every assert carries a message" as a gate. A message makes node:assert skip
   `getErrMessage` entirely (0.36 s vs unbounded, measured). Enforceable as a husky/CI grep gate over
   `src/*.test.ts` (`assert\.ok\([^,]*\);` and bare `assert\(`); retrofitting all 958 is mechanical but can be
   staged — gating NEW code stops the class growing.
4. **Runner deadline — what actually bounds a future hang** (measured, see addendum): `--test-timeout`
   passes through `tsx --test` and the RUNNER PARENT enforces it — with `--test-timeout=5000` the hang cell
   produced a full spec report naming the file (`'test timed out after 5000ms'`, `cancelled 1`, summary
   printed) at ~5 s. That converts the silent freeze into a bounded NAMED failure in the log. BUT the parent
   process still never exited (external alarm fired at 100 s): its kill of the cancelled child is SIGTERM,
   which the child absorbs (signal-exit handler on a starved loop), so the spinning child — and the parent
   waiting on it — linger. The scripts change is therefore two parts: (a) add `--test-timeout=<ms>` to each
   package's `"test": "tsx --test …"` (packages/pi-context/package.json:133 and siblings) so any future hang
   is named and diagnosable; (b) an external wall-clock **SIGKILL** for process exit — in CI
   `timeout -s KILL 15m npm test` (GNU coreutils on the Linux runners); locally macOS lacks
   `timeout`/`gtimeout` (verified), so use the perl-alarm idiom or a tiny node spawn-wrapper. SIGTERM-based
   bounds do not work against this class (observed: TERM absorbed, child survived).

**Regression pins**: cell 1 (fixed) pins the wrapper boundary — a string-success op converges the container on
disk; a new sibling cell pins dryRun-no-converge (`append-relation --dryRun` on a divergent substrate leaves
the rollup block byte-identical); the messaged-assert gate pins the hang class; the corrected cell 4 pins
best-effort (hook throw never fails the landed write) — it already targets the right behavior, it just never
ran.

## Artifacts

- Stack captures + samples + logs: session scratchpad (`sample-98365.txt`, `repro*.log`, `cell{1..4}.log`,
  `mini-*.log`, `cdp-pause.mjs`) — ephemeral, quoted above where load-bearing.
- Leftover from the ORIGINAL hang: PID 89540 (`node … src/install-subcommand.test.ts`) was still spinning at
  ~100% CPU ≥49 min when observed; it ignores SIGTERM and needs `kill -9 89540`. Left running (not this
  session's process).

## Addendum: bounded outcome of the `--test-timeout` probe

`perl alarm 100 npx tsx --test --test-timeout=5000 --test-name-pattern=opt-in packages/pi-context/src/install-subcommand.test.ts`
→ overall exit 142 (alarm at 100 s), but the captured log contains the COMPLETE runner report emitted at ~5 s:

```
✖ packages/pi-context/src/install-subcommand.test.ts (5001.248ms)
ℹ tests 1 … ℹ cancelled 1 … ℹ duration_ms 5005.247625
✖ failing tests:
test at packages/pi-context/src/install-subcommand.test.ts:1:1
  'test timed out after 5000ms'
```

So the runner-parent enforces the timeout and NAMES the hung file within the deadline (report bounded), while
process exit stays unbounded because the cancelled child ignores SIGTERM (signal-exit handler queued on the
spin-starved event loop; only SIGKILL reaps it — verified on four separate spun children). Both halves of fix
item 4 follow directly from this measurement.
