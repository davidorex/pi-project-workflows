Confirmed. Here is exactly what we're doing and exactly what I won't dodge.

---

## The decomposition phase

### What we build

```
context-migration/
  scripts/
    decompose-log.mjs           → reads ORCHESTRATOR-LOG.md, extracts 252 events
    decompose-state.mjs         → reads ORCHESTRATOR-STATE.md, extracts subagent-invocations + pending-actions
    decompose-decs.mjs          → reads data/seed-round-plan.md, extracts 45 DECs
    decompose-stories.mjs       → reads phases/US-STATUS.md, extracts 104 stories
    decompose-discs.mjs         → reads phases/discoveries.md, extracts 28 DISCs
    decompose-preamble.mjs      → reads phases/00-preamble.md, extracts conventions + story bodies
    decompose-source-gaps.mjs   → reads data/source-model-gaps.md, extracts ~40 gaps
    decompose-checklist.mjs     → reads phases/PHASE-LAUNCH-CHECKLIST.md, extracts procedure rules
    decompose-mandates.mjs      → reads MANDATES.md, extracts 9 mandates
    decompose-phases.mjs        → reads phases/phase-00..15.md, extracts 16 phases + numbered-step tasks
  decomposed/                   ← output dir (named for what it holds: the decomposed JSON)
    ORCHESTRATOR-LOG.json       ← array of 252 log events
    ORCHESTRATOR-STATE.subagent-invocations.json   ← array of ~12 IMPL/AUDIT subagent runs
    ORCHESTRATOR-STATE.pending-actions.json        ← array of ~10 orchestrator TODO items
    seed-round-plan.json        ← array of 45 DECs
    US-STATUS.json              ← array of 104 stories
    discoveries.json            ← array of 28 DISCs
    00-preamble.json            ← array of ~15 convention rules
    source-model-gaps.json      ← array of ~40 gaps
    PHASE-LAUNCH-CHECKLIST.json ← array of N procedure rules
    MANDATES.json               ← array of 9 mandates
    phase.phases.json           ← array of 16 phases
    phase.phase-tasks.json      ← array of ~120 numbered implementation steps
```

Naming: each output's basename is the source MD's basename (1:1 source↔output correspondence) — `ORCHESTRATOR-LOG.md` → `ORCHESTRATOR-LOG.json`. A source that yields two block-item kinds writes two files, disambiguated by a `.kind` infix on the same basename: `ORCHESTRATOR-STATE.md` → `ORCHESTRATOR-STATE.subagent-invocations.json` + `ORCHESTRATOR-STATE.pending-actions.json`; the 16 `phase-*.md` files collapse to the `phase` basename → `phase.phases.json` + `phase.phase-tasks.json`. All other scripts write one file.

Each output is one JSON array file per block-item kind, not one file per item. The array is the exact payload a consumption script hands to the block writer — `JSON.parse` once, map over the elements, bulk-write to the `.context` block. Per-item files would force the consumer to `readdir` + reassemble with no benefit, since `.context` (not this staging dir) is the addressable store; the intermediate only needs to be the load payload.

### What each script does

1. Reads ONE source MD file (using line-offset pagination for the 4 oversized files)
2. Parses its specific structure (markdown table, bullet list, section heading pattern, one-line-per-event)
3. Emits ONE JSON array file to `decomposed/`, basename == source MD basename (the extracted items as array elements); a script with two distinct item kinds emits two arrays, disambiguated by a `.kind` infix
4. Each array element's shape mirrors the target substrate schema field-for-field where the data exists in the source
5. Reports: `items_parsed: N, arrays_written: N, errors: N`
6. Never reads other MDs, never writes to `.context`, never modifies the source

### What the decomposition does NOT do

- Modify any source MD file — all reads are read-only
- Write to `.context/` blocks — that's the separate consumption phase
- Validate JSON against substrate schemas — extraction comes first, shape conformance comes later
- Skip any of the 10 source files — every state-bearing MD decomposes
- Invent data that isn't in the source — fields without source data are omitted
- Lose information — the JSON is a structural re-encoding, not a summary

### Ordering: by modification frequency

Rationale: the file that changes most often causes the most truncation-pain across sessions. Decompose it first so the JSON form stabilizes earliest, reducing the window where the MD diverges from the extraction and requiring re-extraction.

| # | Source MD | Git commits | Last modified | Script | Output dir | Items |
|---|---|---|---|---|---|---|
| 1 | `ORCHESTRATOR-LOG.md` | 172 | 2026-05-30 | `decompose-log.mjs` | `decomposed/ORCHESTRATOR-LOG.json` | 252 |
| 2 | `ORCHESTRATOR-STATE.md` | 157 | 2026-05-30 | `decompose-state.mjs` | `decomposed/ORCHESTRATOR-STATE.subagent-invocations.json` + `decomposed/ORCHESTRATOR-STATE.pending-actions.json` | ~22 |
| 3 | `data/seed-round-plan.md` | 58 | 2026-05-30 | `decompose-decs.mjs` | `decomposed/seed-round-plan.json` | 45 |
| 4 | `phases/US-STATUS.md` | 55 | 2026-05-28 | `decompose-stories.mjs` | `decomposed/US-STATUS.json` | 104 |
| 5 | `phases/discoveries.md` | 50 | 2026-05-30 | `decompose-discs.mjs` | `decomposed/discoveries.json` | 28 |
| 6 | `phases/00-preamble.md` | 23 | 2026-05-28 | `decompose-preamble.mjs` | `decomposed/00-preamble.json` | ~15 |
| 7 | `data/source-model-gaps.md` | 20 | 2026-05-25 | `decompose-source-gaps.mjs` | `decomposed/source-model-gaps.json` | ~40 |
| 8 | `phases/PHASE-LAUNCH-CHECKLIST.md` | 4 | 2026-05-25 | `decompose-checklist.mjs` | `decomposed/PHASE-LAUNCH-CHECKLIST.json` | N |
| 9 | `MANDATES.md` | 1 | 2026-05-18 | `decompose-mandates.mjs` | `decomposed/MANDATES.json` | 9 |
| 10 | `phases/phase-*.md` (16 files) | 0–1 each | 2026-05-19–21 | `decompose-phases.mjs` | `decomposed/phase.phases.json` + `decomposed/phase.phase-tasks.json` | 16 + ~120 |

`ORCHESTRATOR-STATE.md` carries unique state in two sections:

- **Last subagent invocations** — ~12 records of IMPL/AUDIT runs (commit SHA, phase, what was built, test count, gate status, DISCs filed). These are NOT in the LOG (the LOG has individual COMMIT events but not the grouped "this subagent ran and produced this commit" summary). Decomposed to `decomposed/ORCHESTRATOR-STATE.subagent-invocations.json`.
- **Pending orchestrator actions** — task-like items in grouped numbered sub-lists under bold sub-headers ("Immediate next", "Remaining"), some with nested (a)/(b)/(c) children; completion marked inline by the word "DONE" (not strikethrough); framing prose between lists captured as section-notes. Decomposed to `decomposed/ORCHESTRATOR-STATE.pending-actions.json` (8 actions + section-notes as observed 2026-05-31).

The remaining sections (Current working mode, Current position prose, Commit ledger, Verification convention, Known issues) are either derived from other sources we're already decomposing, derived from git, or procedure text that lives in the `conventions` block. The Current position HEAD/runtime/branch is derived from git at each `context-status` call. The session-boundary prose snapshot is captured by `SESSION-NNN` in the `session-notes` block.

### Order of execution

```
 1. decompose-log.mjs           → 252 events, 172 commits, changes every session
 2. decompose-state.mjs         → ~22 items, 157 commits, changes every session
 3. decompose-decs.mjs          → 45 DECs, 58 commits, changes on every new DEC
 4. decompose-stories.mjs       → 104 stories, 55 commits, changes on every story flip
 5. decompose-discs.mjs         → 28 DISCs, 50 commits, changes on every DISC resolution
 6. decompose-preamble.mjs      → ~15 conventions, 23 commits
 7. decompose-source-gaps.mjs   → ~40 gaps, 20 commits
 8. decompose-checklist.mjs     → procedure rules, 4 commits
 9. decompose-mandates.mjs      → 9 mandates, 1 commit, essentially static
10. decompose-phases.mjs        → 16 phases + ~120 tasks, 0–1 commits each, frozen
```

Each script is self-contained. Each succeeds or fails independently. The JSON array each produces is the canonical extracted form of that source — one load payload per block-item kind, ready for a separate consumption script to `JSON.parse`, validate against the substrate schema, and bulk-write into the target `.context` block.

---

## Consumption-phase mapping notes

The decomposition emits the faithful SOURCE shape; it never invents fields to match a target schema (mandate-002; spec "never invent data not in source"). Where a source's faithful shape does not line up 1:1 with the existing `.context` schema, the gap is a consumption-phase concern recorded here as it is discovered — one note per source, so the consumption script has a single place to read every mapping constraint before it writes a block.

### `seed-round-plan.json` → `decisions` block

- **body-blob vs discrete fields.** The decomposed element is `{id, num, title, body, refs, raw}` — `body` is one prose blob. `decisions.schema.json` requires discrete `context`, `decision`, `consequences` (+ `status`, `created_by`, `created_at`). Mapping `body` → those analytic sub-fields is consumption work; doing it at decomposition would be fabrication. Many entries do not state a separable context/decision/consequences triad at all, so some target fields will be synthesised or left to a human/judgement pass at consumption.
- **id width.** Source ids are `DEC-1`..`DEC-45` (1–2 digit); the schema's `id` pattern is `^DEC-\d{4}$`. The schema-widen to `^DEC-\d{1,4}$` is the already-tracked standing-open prerequisite; until it lands, these ids fail validation. (`num` is emitted precisely so the consumer can zero-pad or re-key without re-parsing the id string.)
- **status.** The schema's required `status` enum (`open`/`enacted`/`superseded`) is not a source field. Most DEC log entries are enacted decisions; `open` ones live in the separate "## Open decisions" section (the D1..D7 items), which this script does NOT extract. Status assignment is a consumption-phase determination.
- **refs.** Source `refs` are bare strings (commit SHAs, migration paths, cross-refs). The schema's `references` are `{label, path?, lines?, commit?}` objects. Classifying each ref string into that shape is consumption work.