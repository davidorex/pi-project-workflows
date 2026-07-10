# TASK-112 meaning-gathering: pi-behavior-monitors internal-tracker-ID comment citations

Scope: this package has no src/ subdirectory — its code lives at the package root:
`index.ts`, `index.test.ts`, `auth-required.ts`. Re-verified via direct grep of all three
files: 6 raw citation instances, 2 unique IDs, no others found (also swept for any other
`TASK-/FEAT-/DEC-/FGAP-` shaped strings — none beyond these two). `auth-required.ts` has
zero hits of either ID and needs no changes for this task.

Method: each ID was looked up live via `pi-context resolve-item-by-id --id <ID> --json`. Both
resolved to live substrate items that are topically disjoint from what the comments claim — the
IDs have been recycled in the live substrate for later, unrelated items. `.project-archived/*.json`
(the frozen predecessor substrate) was checked for each and matched the comments' claims exactly.
No meaning was fabricated.

## Site list

| ID | File | Line | Context |
|---|---|---|---|
| FGAP-019 | index.ts | 62 | JSDoc block above `PATTERN_LIST_SCHEMA_PATH` — claims side-car schema paths route through `appendToTypedFile`/`writeTypedFile` so AJV/atomic-write/proper-lockfile "apply uniformly with `.project/<block>.json` writes" |
| FGAP-019 | index.ts | 972 | Inline comment in `saveInstructions()` — same claim, re: `writeTypedFile` call |
| FGAP-019 | index.ts | 1517 | Inline comment in pattern-append path — same claim, re: `appendToTypedFile` call |
| FGAP-019 | index.test.ts | 1498 | Section-header comment: "Side-car writers (Step 6.1 — FGAP-019 closure)" above the side-car-writer test suite |
| DEC-0005 | index.ts | 1288 | JSDoc above `resolveTraceSettings()` — claims "the trace stream is push-write inside executeAgent" and is "intentionally divergent from pi-mono's pull/replay session model" |
| DEC-0005 | index.ts | 1400 | Inline comment near the classify-call trace wiring — same claim, "dispatch surface is pi-jit-agents' executeAgent (DEC-0005 push-write trace pipeline)" |

## Substrate lookups

**FGAP-019 — live substrate mismatch, archived match found.**
The live `.context` item titled "Block-mutation ops require `arrayKey` though it is derivable from config (CLASS: 7 ops)" is about `pi-context-cli` op-schema ergonomics — completely unrelated to monitor side-car writes, AJV, or lockfiles. The ID has been reused/recycled in the live substrate for a different, later gap.

`.project-archived/framework-gaps.json`'s FGAP-019 matches the comments exactly: "No canonical validated write surface for monitor side-car state (instructions/patterns)" — `saveInstructions` and the pattern-learning writer wrote `MonitorInstruction[]`/`MonitorPattern[]` via raw `fs.writeFileSync`, bypassing AJV validation, `proper-lockfile` contention guarding, and a centralized write choke point. Closed by routing both writers through the generalized `appendToTypedFile`/`writeTypedFile` block-api primitives.

**DEC-0005 — live substrate mismatch, archived match found.**
The live `.context` item titled "Convergent ordered-sequence field-kind: non-interleaving Fugue-class CRDT over item-refs + move-CRDT position register" is about a CRDT-based ordered-array field-kind — unrelated to trace streams, monitors, or `executeAgent`. Again, ID reuse in the live substrate.

`.project-archived/decisions.json`'s DEC-0005 matches the comments exactly: "Monitor observability via push-write trace stream (intentional divergence from pi-mono pull model)" — pi-mono's `SessionManager` is read-only to extensions, so monitors (side-channel classify calls outside the main agent loop) can't write execution traces into the session; monitors get their own independent push-write trace subsystem (`TraceWriter` at the pi-jit-agents `executeAgent` boundary) instead. Trace writes are schema-validated and redacted, rotate daily, retain 30 days, and are explicitly non-fatal to the classify call if they fail.

## Replacement-text table

| ID | Status found | Plain-English replacement text |
|---|---|---|
| FGAP-019 | stale-archived (live substrate item unrelated — ID reused for an unrelated pi-context-cli op-schema gap; original meaning recovered from `.project-archived/framework-gaps.json`) | This closes the gap where monitor side-car state (per-monitor instructions and learned patterns, stored outside `.project/`) was written with raw, unguarded file writes — no schema validation, no lockfile protection against concurrent writes, and no shared write path. Fixed by routing both writers through the same validated-write helpers (`writeTypedFile` / `appendToTypedFile`) used for the project's block files, so these writes now get AJV schema validation, atomic write-then-rename, and lockfile-guarded read-modify-write, matching the guarantees already applied to `.project/<block>.json` writes. |
| DEC-0005 | stale-archived (live substrate item unrelated — ID reused for an unrelated CRDT ordered-sequence field-kind decision; original meaning recovered from `.project-archived/decisions.json`) | Because the underlying agent framework's session log is read-only from an extension's perspective, monitors can't record their classification activity into it. So monitors write their own separate trace log instead, via a dedicated writer at the point where the classify agent actually runs — this is a deliberate departure from how the framework normally handles observability (which is to read back a shared session history), scoped only to monitors. Trace writes are non-fatal: if writing a trace record fails, that failure never aborts the classify call itself. |

## Notes

Both IDs show the same failure mode: the live `.context` substrate has recycled these ID slots for later, unrelated items, while the code comments cite the original referents that only exist now in `.project-archived/`. All 6 sites are genuine explanatory/provenance comments, not test fixture data — `index.test.ts`'s one hit is a section-header comment above test code.
