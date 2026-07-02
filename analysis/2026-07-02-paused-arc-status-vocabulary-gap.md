# Paused-arc status-vocabulary gap — investigation

Date: 2026-07-02. Trigger: the user declared the WASC operation-framework port arc (PHASE-PORT-OPS, status `in-progress`) paused; the phase status vocabulary has no value that records a paused/suspended arc, so derived state keeps presenting it as active work. Investigation only — nothing filed, nothing changed. All substrate reads via `pi-context` CLI ops; all derivation experiments on a scratchpad DUPLICATE of `.context`, never the live substrate.

## 1. Root cause + shape

**Where the enum lives** (both copies in sync at version `2.0.1`):

- Installed schema — `pi-context read-schema --schemaName phase --path properties.phases.items.properties.status` returned exactly:
  ```json
  {"type":"string","enum":["planned","in-progress","completed"]}
  ```
  (`read-schema --schemaName phase --path version` → `"2.0.1"`.)
- Packaged catalog — `packages/pi-context/samples/schemas/phase.schema.json` lines 40-47: same three-value enum; the schema `description` (line 6) also narrates the lifecycle as "(planned, in-progress, completed)".

**The filed item** — `pi-context read-block-item --block phase --id PHASE-PORT-OPS`:
status `"in-progress"`, name "Port the WASC operation framework into this project". No representable value for its true (paused) state.

**Consumers of phase status** (all in pi-context; pi-workflows/pi-jit-agents have no phase-block status consumption — grep over their `src/` finds only workflow-internal "phase" concepts):

| Consumer | Anchor | Behavior |
|---|---|---|
| Status→bucket map | `packages/pi-context/src/status-vocab.ts:56-107` (`STATUS_VOCABULARY_DEFAULTS`) | `"in-progress" → in_progress` (line 72). **`"paused" → blocked` already exists at line 80** — the bucket vocabulary reserves a paused value that no shipped schema enum admits. Live `config.status_buckets` is empty (`read-config --registry status_buckets` → `{}`), so defaults govern. |
| Focus fallback | `read-config --registry state_derivation` → `focus_fallback: {"kind":"phase","bucket":"in_progress"}`; consumed at `packages/pi-context/src/context-sdk.ts:941-958` | When `inFlight` is empty, the first phase whose status buckets to `in_progress` becomes the derived focus string. |
| context-status lifecycle metrics | `packages/pi-context/src/context-sdk.ts:583-593` | `phases.current` counts `status === "completed"` (literal — the FGAP-018 hardcode); `blockSummaries.phase.byStatus` is generic. |
| Milestone rollup | `context-sdk.ts:920-937` + invariant `reached-milestone-phases-complete` (`read-config --registry invariants`) | Members must bucket `complete`; a non-complete phase keeps the milestone `planned` (truthful for a paused arc). |
| Roadmap phase rollup | `packages/pi-context/src/roadmap-plan.ts:72` (`rollupPhaseStatus`) | Derives phase progress from member ITEMS' buckets, not `phase.status` — unaffected. |
| HTML view | `scripts/orchestrator/build-html-views.ts` | Status-value-generic (pills derived from data, line 799ff) — no enum coupling. |

**The false signal, precisely:** the vocabulary cannot distinguish "deliberately suspended by the user, to resume" from "actively worked". `in-progress` is the only non-terminal started state, and it buckets to `in_progress` — exactly the focus-eligible bucket. Consequences observed:

- `pi-context context-status` today: `blockSummaries.phase.byStatus = {"in-progress":1,"completed":1}` and `phases: {"total":2,"current":1}` — the paused arc is counted as active in-progress work in every projection.
- `pi-context context-current-state` today: `focus = "in-flight: TASK-068"` — the misrepresentation is currently MASKED by an in-flight task, but the fallback is unconditional code: the moment `inFlight` empties, the paused arc becomes the derived focus (demonstrated in §4).

## 2. The class (gap-explore-surfaces-class)

Status enums of every lifecycle-bearing installed schema (each read via `pi-context read-schema --schemaName <kind> --path properties.<array_key>.items.properties.status`; installed set from `read-config --registry installed_schemas`):

| Kind | Status enum | Can it represent suspended-but-not-abandoned? |
|---|---|---|
| phase | planned, in-progress, completed | **No — nothing at all between "active" and terminal.** Only work-bearing kind with zero non-active, non-terminal value. |
| tasks | planned, in-progress, completed, blocked, cancelled | Approximated by `blocked` (bucket `blocked`) — conflates dependency-blocked with user-paused, but does leave active derivation. |
| features | proposed, approved, in-progress, in-review, complete, blocked, cancelled | Approximated by `blocked` (same conflation). |
| story | proposed, ready, in-progress, in-review, complete, blocked | Approximated by `blocked`. Schema description: "Intentionally divergent from pi-context://schemas/status; reconciliation deferred to a future status-schema unification." |
| milestone | planned, reached | N/A — derived phase-rollup, authored status rejected by canon. |
| framework-gaps | identified, accepted, in-progress, closed, wontfix, superseded_by | No paused value; `accepted` buckets `in_progress` (still active), `wontfix` terminal. |
| issues | open, resolved, deferred | `deferred` (bucket `unknown`) — semantically "won't work on it", not "resume later". |
| requirements | proposed, accepted, deferred, implemented, verified | `deferred` (bucket `unknown`), same shading. |
| research | planned, in-progress, complete, stale, superseded, revised | No; stale/superseded are terminal-degraded. |
| verification | passed, failed, partial, skipped | N/A — event-like record, not a resumable work item. |
| spec-reviews | not-started, in-progress, complete, abandoned | `abandoned` is terminal, not suspension. |
| layer-plans | draft, proposed, decided, in-progress, complete, abandoned | `abandoned` terminal. |
| work-orders | proposed, in-progress, real-check-passed, real-check-failed, completed, cancelled | `cancelled` terminal. |

**Class statement.** The gap is NOT phase-atomic. Two-level class:

- **General class:** no shipped lifecycle vocabulary carries a deliberate-suspension value — every kind can only express "active", "blocked by something", "terminal-done", or "terminal-not-done". The framework's own bucket layer already anticipates the state: `STATUS_VOCABULARY_DEFAULTS` maps `paused → blocked` (status-vocab.ts:80) and the canonical bucket enum exists (`packages/pi-context/schemas/status.schema.json`: todo/in_progress/blocked/complete/unknown), yet no schema enum can emit `paused`. Adjacent precedent for non-active states exists per-kind (tasks/features/story `blocked`; issues/requirements `deferred`; gaps `wontfix`; plans/reviews `abandoned`) — the family convention is that non-active states are admitted where a kind's use exercised them, and no arc has exercised suspension until now.
- **Acute instance (the trigger):** phase — the only work-bearing kind with NO non-active non-terminal value whatsoever, AND the `state_derivation.focus_fallback` kind, so the missing value directly corrupts the derived focus/position signal rather than merely shading semantics.

Filing at the class level is warranted: the general gap (no deliberate-suspension vocabulary; phase acutest) with PHASE-PORT-OPS as the triggering instance. Whether every kind should gain a paused value, or only phase (with `blocked` continuing to approximate elsewhere), is a scope judgment for the user — the filing must surface the class, not silently decide its extent.

## 3. Prior art (explore-before-file)

Searches run (all `pi-context filter-block-items`, `--op matches`; the PreToolUse pipe-guard blocks `|` even inside a quoted regex alternation — see note below — so one term per call):

- framework-gaps `title` ~ `vocabulary` / `status` / `phase` / `enum`; `description` ~ `vocabulary` (12 hits, inspected via title search) / `paus` (0) / `suspend` (0) / `unification` (0)
- decisions `title` ~ `status` (0) / `vocab` (0); `description` ~ `paus` (0)
- issues `title` ~ `status` (0); `description` ~ `paus` (0)
- features `title` ~ `vocabulary` (0)
- conventions `description` ~ `status` (1 hit: `gap-explore-surfaces-class` itself — not coverage)

**Nothing tracks this gap.** No item mentions pause/suspend semantics or the phase status enum's missing state. The active `.context` is the only read target (the archived substrate was forward-synced into it, commit fd71f26).

Adjacent items (relate-to candidates, none covering the gap):

- **FGAP-018** (identified, P3) — `context-status` hardcodes phase lifecycle literals (`status === "completed"` at context-sdk.ts:589). Adjacent hardcode in the same projection; does not touch the vocabulary itself.
- **FGAP-102** (identified, P0) — catalog↔config parity + state_derivation referential integrity. Governs HOW any vocabulary/schema change must land (dual-surface); does not name this gap.
- **FGAP-040** (identified, P2) — story schema field/enum re-cut. Precedent for filing a per-kind status-enum change as an FGAP; story-scoped only.
- **FGAP-017** (closed, via TASK-020/VER-057) — the config-declared `state_derivation` registry: the machinery a new status value flows through; closed, not coverage.
- **TASK-072** (planned) — additive-diff build gate for `config.schema.json` + expand-contract discipline. Config-schema-scoped, not block schemas; establishes the additive discipline a resolution would follow.
- The **story schema's own description** documents a "deferred … future status-schema unification" that no FGAP tracks (unification search: 0 hits) — a known-but-untracked sibling of this class, worth naming in the filing.

Verdict: **new filing justified** — the substrate does not already track it; relate to FGAP-018 and FGAP-102 rather than duplicating either.

## 4. Reproducible conditions

**(a) The enum lacks the state** — exact op + verbatim output:

```
pi-context read-schema --schemaName phase --path properties.phases.items.properties.status --json
→ {"ok":true,"op":"read-schema","output":{"data":{"type":"string","enum":["planned","in-progress","completed"]},"truncated":false,"totalBytes":89,"complete":true}}
```

with the paused arc filed as the only value it can hold:

```
pi-context read-block-item --block phase --id PHASE-PORT-OPS --json
→ … "id":"PHASE-PORT-OPS","name":"Port the WASC operation framework into this project", … "status":"in-progress" …
```

**(b) Derived state misrepresents the paused arc.**

Live substrate today (mask in place):

```
pi-context context-current-state --json
→ "focus":"in-flight: TASK-068" …
pi-context context-status --json
→ …"phase":{"arrays":{"phases":{"total":2,"byStatus":{"in-progress":1,"completed":1}}}} … "phases":{"total":2,"current":1} …
```

Deterministic demonstration of the unmasked state, on a byte-copy of `.context` in the session scratchpad (`scratchpad/repro/`, pointer file authored there; live substrate untouched). With the copy's sole in-flight task (TASK-068) set `completed` and everything else identical:

```
npx tsx -e "import { currentState } from './packages/pi-context/src/context-sdk.ts'; …currentState('<scratchpad>/repro')…"
→ { "focus": "phase: PHASE-PORT-OPS (Port the WASC operation framework into this project)", "inFlight": [] }
```

The paused arc IS the derived focus the moment nothing is in flight — `context-sdk.ts:941-958` (focus_fallback: first phase bucketing `in_progress`) with `STATUS_VOCABULARY_DEFAULTS["in-progress"] = "in_progress"`.

Counterfactual on the same copy — phase status set to the (schema-invalid today) value `paused`:

```
→ { "phaseStatus": "paused", "focus": "no active focus.", "inFlight": [] }
```

`paused` buckets to `blocked` via the EXISTING default map (status-vocab.ts:80) and drops out of focus eligibility with **zero deriver change** — the derivation layer is already ready for the value; only the schema enum (write-time AJV) rejects it.

## 5. Resolution shape (dimension set — intel, not a decision)

- **Which schema(s):** phase alone (the triggering instance and the acute case) vs. the class set (tasks/features/story et al.) — the scope call is the user's; the class table in §2 is the input.
- **Enum addition vs new field:** adding a value (e.g. `paused`) to `status` rides every existing mechanism — bucket map (already present, status-vocab.ts:80), state_derivation (no registry change: `blocked ≠ in_progress` removes focus eligibility, observed in §4), invariants (only `reached-milestone-phases-complete` touches phase, via buckets — a paused phase correctly keeps its milestone unreached), the status-vocab completeness test (`status-vocab.test.ts` requires every samples enum value to resolve — `paused` already resolves). A separate field (e.g. a suspension flag) would instead require deriver changes everywhere status is bucketed. Bucket semantics note: `paused` maps to the `blocked` bucket; a DISTINCT bucket would mean widening the closed `StatusBucket` union (context.ts:261, hand-kept-in-sync per context.ts:293-295) — a materially larger change.
- **Catalog + live parity (the FGAP-102 lesson):** both surfaces must change — `packages/pi-context/samples/schemas/phase.schema.json` (enum at lines 42-46 AND the prose lifecycle in the line-6 description) and the installed `.context/schemas/phase.schema.json`, brought current via `/context update` (catalog-ahead resync; both sit at 2.0.1 today, so a catalog version bump makes drift visible to `context-check-status`).
- **Migration:** enum widening is additive — existing items remain valid; no data rewrite; `validateBlockWithMigration` fires only on block `schema_version` mismatch. Version bump (2.0.1 → 2.1.0) per the schema-versioning discipline; consistent with TASK-072's expand-contract direction (that gate is config.schema.json-scoped — no interaction, same discipline).
- **state_derivation:** no change for the focus effect. The `context-status` special-case (`phases.current` counts `completed`, context-sdk.ts:589) is unaffected by a paused value; its hardcoding is FGAP-018's existing scope.
- **Docs surface:** schema description strings enumerate the lifecycle; `status-vocab.ts` block comment line 46 lists `phase.status: planned | in-progress | completed`; check README/SKILL mentions per docs-surface-sync at implementation time.
- **Experience-gap side-note surfaced during this run:** the PreToolUse pipe-guard (`block-pi-context-glue.sh`) blocks a `filter-block-items --value` containing regex alternation `|` inside a quoted argument — a false positive against the op's own documented `matches` operator (friction hit while driving the CLI; reported here per Experience-Gap Handling, not filed).

## Conclusions

1. **Already tracked?** No — new filing justified. Relate to FGAP-018 (adjacent phase-status hardcode) and FGAP-102 (dual-surface parity discipline); nothing to refile against.
2. **Class:** not phase-atomic. General class — the shipped lifecycle vocabularies admit no deliberate-suspension value on any kind, while the framework's bucket layer already reserves `paused → blocked`; phase is the acute instance (only kind with zero non-active non-terminal value, and the focus_fallback kind, so derived position/focus misrepresents a paused arc as active). File the general gap with PHASE-PORT-OPS as the triggering instance; per-kind extent is a user scope judgment the filing surfaces, not decides.
3. **Filing shape:** one `framework-gaps` item (FGAP; package `pi-context`) — experience gap in the framework's PM vocabulary, matching the FGAP-040/FGAP-094 register. Body: title naming the class; description carrying the enum evidence, the bucket-layer `paused` reservation, and the focus_fallback consequence; `evidence[]` anchored to `samples/schemas/phase.schema.json:40-47`, `status-vocab.ts:80`, `context-sdk.ts:941-958`, `context-sdk.ts:583-593`, the `state_derivation` config registry, and this document; `impact` = derived focus/status present a user-paused arc as active work; `proposed_resolution` = the §5 dimension set (additive enum + dual-surface parity + version bump; scope extent flagged as the user's call). Terse, self-contained, composable verbatim into downstream briefs. Priority is the user's determination.
