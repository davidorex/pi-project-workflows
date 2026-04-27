Persisted to `analysis/2026-04-27-pi-session-jsonl-substrate-confirmation.md`.

# The recursion you've named

We just enacted the thesis at the surface — and exposed where it breaks.

## What we did this turn

| Layer                          | Substrate                                                                                                               | Status                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Layer 1 (runtime)              | session JSONL — every content block emitted is typed atomic, scored, addressable, persisted                             | enacted by pi-mono itself     |
| Layer 1.5 (orchestrator stash) | `/copy` writes the response to `/tmp/claude/response.md` — de-ephemeralization                                          | enacted by `/copy`            |
| Layer 2 (curated)              | `mv` into `analysis/<date>-<slug>.md` — surfaced into project space                                                     | enacted by hand-orchestration |
| Layer 2.5 (atomized)           | response decomposed into addressable typed units (findings, latent-operations, recommendations) writable to `.project/` | **NOT enacted**               |

Layers 1 → 2 are blunt persistence. The file is on disk. The *content* is prose. There are no addressable atomic units a downstream agent can pull `latent-operation #4` from. Composability stops at the file boundary.

## The curation problem in full

You're naming the structural question that makes the thesis non-trivial. Let me lay out the failure modes precisely:

### Failure mode 1: shape ≠ value

`block-api.ts` validates AJV schema. A schema-valid `decision` item can be:
- *Premature* (decided before forcing-issue is real)
- *Redundant* (duplicates an enacted decision under a different slug)
- *Wrong* (cites the wrong forcing-issue)
- *Incoherent* (rationale doesn't actually address the decision)
- *Trivial* (records a non-decision as if it were architectural)

Schema validation passes for all five. The substrate accumulates noise that *looks* clean.

### Failure mode 2: validator regress

LLM A emits a unit → LLM B validates it → who validates B? Hierarchical validation has no terminator. Stacking validators just moves the unverified judgment up one level.

### Failure mode 3: withering with no mechanism

A decision enacted in 2026-03 may be irrelevant by 2026-09 because the constraint that forced it has changed. The schema doesn't know that. A fragility resolved by a commit may still be marked open. The substrate has no concept of "this used to matter."

### Failure mode 4: curation as silent edit

If curation is "human edits the JSON," provenance is lost. The atomic-unit shape is preserved but the *history of how it became this* disappears. That's wiki-drift inside a structured store.

## Mandate-compliant termination of the regress

Four mechanisms, none recursive:

### 1. Empirical grounding as base case

A claim is validated by reference to *measurable reality*, not by another LLM:

| Unit type        | Grounding terminator                                                  |
| ---------------- | --------------------------------------------------------------------- |
| decision         | the decision's effect is in code; check via grep/build/test           |
| fragility        | reproduces or doesn't; check via test or trace                        |
| requirement      | traces_to references resolve; check filesystem/git                    |
| framework-gap    | the gap is observable in current code; check via Grep or workflow run |
| feature / story  | demonstrable via `pi --mode json` invocation                          |
| research finding | citations resolve; check via fetch or read                            |

Validators terminate at *code, tests, git, files, metrics, traces*. No agent validates an agent without an empirical anchor.

### 2. Adversarial peer agreement, not hierarchy

N independent agents (typically 2–3, capped) examine the same unit with different priors and tool surfaces. Their VERDICT_TOOL outputs are typed atomic units themselves.

- **All agree (clean)** → unit's `validated` field flips to true
- **All agree (flag)** → unit's status moves to `disputed`, requires user
- **Disagreement** → unit's status moves to `contested`, requires user

The bound is structural: 2–3 peers, no meta-validator, disagreement always escalates. The thesis-compliant shape: validation produces typed atomic units (the verdicts themselves), composable into an audit trail.

### 3. User as ultimate terminator

The framework's job is to *compress* the surface the user must adjudicate, not eliminate it. `disputed` and `contested` items surface in `/project status`; the user resolves with a typed `adjudicate-block-item` operation that produces an audit-trail entry.

### 4. Schema constraints eliminate large classes of invalidity at write time

Required foreign keys (decision must cite forcing-issue), enum values (status ∈ {open, enacted, superseded, archived, contested, disputed}), conditional requireds (status=enacted requires `enacted_by_commit`). The schema is the cheapest validator; it runs before any agent.

## How "withering" works structurally

Withering is **score decay + status transition**, not editorial deletion. Every block schema gains:

```
score: {
  confidence:  0.0..1.0  // initial agent or user-asserted
  freshness:   0.0..1.0  // decays over time without renewal
  relevance:   0.0..1.0  // recomputed against current project state
}
provenance: {
  source:        "session:<id>" | "agent:<name>" | "user" | "workflow:<run>"
  parent_entry:  "<session-jsonl-id>" | null
  asserted_at:   ISO timestamp
  validated_by:  ["agent:foo@v1", ...] | []
}
status: open | validated | enacted | superseded | contested | disputed | withered | archived
```

A scheduled curation workflow:
1. Recomputes `freshness` (time-decay function)
2. Recomputes `relevance` (against current project state via empirical checks)
3. When score crosses threshold → status="withered"
4. Withered items remain in the substrate; queries filter by status
5. Renewal (re-validation, re-scoring) is an explicit typed operation producing audit trail
6. Withered ≠ deleted: the atomic unit persists; consumers see it filtered out by default

**Withering is structural, not editorial. No prose is rewritten. No knowledge is destroyed.**

## How curation avoids becoming wiki-drift inside the substrate

Curation is itself a typed operation, never a free-text edit:

```
curate-block-item:
  input:
    block:   "decisions"
    item_id: "DEC-0003"
    op:      "supersede" | "archive" | "wither" | "renew" | "adjudicate"
    rationale: <text>
    superseded_by: "DEC-0007" | null
  effect:
    1. update item.status
    2. write audit-trail entry with parent_entry → session-jsonl-id
    3. if op=supersede, set superseded_by; updated item never deleted
```

Every curation step writes its own typed atomic unit. The audit-trail block is the substrate's history-of-itself. Provenance is preserved by construction; "how this item became this" is queryable.

## The composability test

A unit is well-formed under the thesis iff:

1. Its schema is valid
2. Its `provenance.parent_entry` resolves to a session JSONL entry (when source is session/agent)
3. Its `score` fields are populated
4. Its `validated_by` list is non-empty OR its `status` is `open`
5. Some downstream consumer (workflow, query, agent contextBlock) can address it by id

If a unit can't be composed into a future agent's contextBlocks, it isn't a unit; it's noise. The composability test is the operational definition of "atomic context unit" the thesis demanded.

## What we have vs. what the thesis demands

| Capability                | Today                                                                   | Under thesis                                                       |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Shape validation          | AJV at write                                                            | unchanged                                                          |
| Score fields              | inconsistent across schemas                                             | first-class on every schema                                        |
| Provenance                | partial (some schemas have `decided_by_commit`); FGAP-004 names the gap | required field, `parent_entry` linking to session JSONL            |
| Status lifecycle          | partial (some schemas have it)                                          | required, with `withered` and `disputed` and `contested` terminals |
| Validation                | none beyond schema                                                      | adversarial-peer with empirical grounding                          |
| Withering                 | none                                                                    | scheduled curation workflow                                        |
| Audit trail               | none                                                                    | typed `audit` block, parent-linked to subject items                |
| Curation as typed op      | hand-edits and `block-api.ts` writes                                    | `curate-block-item` typed step with audit-trail emission           |
| User adjudication surface | implicit (user reads everything)                                        | `disputed` / `contested` in `/project status`                      |

## What this turn enacts and what it doesn't

The current turn:
- ✅ produced typed session-JSONL entries (Layer 1, by runtime)
- ✅ persisted prose-level synthesis to project space (`mv` into analysis/)
- ❌ did NOT decompose the synthesis into atomic block-items addressable by downstream agents
- ❌ did NOT score, validate, or attach provenance to those latent units
- ❌ did NOT write an audit-trail entry recording the curation step

So we've enacted the thesis at the file-boundary but stopped short of atomization. To go the full distance, the next move would be a workflow that reads `analysis/2026-04-27-*.md` files and emits typed block-items (e.g., `framework-gaps.json` entries for each named latent gap, `decisions.json` open-state entries for each architectural commitment), each with `provenance.source="analysis:<path>"` and `score.confidence` set by an empirical-grounded validator agent. That workflow is the regeneration recipe both prior lenses already pointed at.

Without it, analysis docs accumulate as a *mid-tier substrate* — denser than chat, less atomic than blocks. They're useful for human reading but they don't compose. They're the wiki layer Nate warned about, sitting between Layer 1 (sessions) and Layer 2 (blocks).

The curation question you've named is the central architectural question of the framework. The answer is: peer adversarial validation grounded empirically, structural withering via score decay, status transitions instead of deletion, audit trail as substrate-of-itself, and the user as terminator. None of which is recursive; all of which is mandate-compliant.