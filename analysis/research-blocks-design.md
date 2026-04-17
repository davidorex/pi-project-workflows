# Research blocks — shape, functionality, and placement

Design document for a new `.project/research.json` block kind that captures the factual and analytical substrate under decisions. Produced during the consumer migration arc planning work, as the next structured-artifact kind after decisions, spec-reviews, features, framework-gaps, and layer-plans.

Status: design proposed, not yet enacted. Enactment requires a new schema + seed data + additive `research_sources` back-edges on the existing five block schemas.

---

## Framing

Research is the factual and analytical substrate under decisions. It is distinct from adjacent kinds:

| Kind | Role |
|---|---|
| **Research** | What is true about the problem / the environment / the options |
| **Specification (decision, spec)** | What we chose, given the research |
| **Findings (review findings, feature defects)** | Problems discovered against a target |
| **Feedback memory (L5)** | Distilled rules from past incidents |
| **Domain (L1)** | Stable domain knowledge and glossary |

Research is the material a decision's `context` paragraph draws from. Without research, decisions become assertions. With research, they become traceable to ground truth.

---

## Two orthogonal dimensions

Research is not a sixth layer. It runs *across* the five Muni layers, each commissioning its own research with different cadence and different grounding requirements.

### Dimension 1 — Layer the research informs

| Layer | Research cadence | Typical question |
|---|---|---|
| **L1 Identity** | project-lifetime, stable | "What is this domain, who are the stakeholders, what's the landscape" |
| **L2 Specification** | per-design-cycle | "Is this feasible, what are the options, how does this external API work, what are the constraints" |
| **L3 Work** | per-feature, per-decomposition | "How big is this, what dependencies are hidden, what files are affected, how do we break it down" |
| **L4 Execution** | per-task, ephemeral | "Why did this fail, what's the actual behavior of this function" |
| **L5 Memory** | post-incident, accumulator | "Why did this class of failure happen, what's the pattern" |

### Dimension 2 — Research type

Matching the `research:*` skill taxonomy already in the environment:

- `investigative` — factual inspection of code / docs / APIs (e.g. `analysis/openrouter-pi-mono-setup.md`)
- `comparative` — side-by-side analysis against an external model (e.g. `analysis/gsd-2-derivability.md`, `analysis/2026-04-13-spec-loop-derivability.md`)
- `empirical` — did X actually work under Y conditions (e.g. hedge monitor against OR-Claude — STORY-008)
- `historical` — what has been tried, prior art, canonical lineage
- `audit` — inventory of current state at scale (e.g. `analysis/pi-project-schema-conventions-audit.md`)
- `landscape` — map of the space, tools, players, gaps
- `feasibility` — can we do X given our constraints
- `curation` — pointer to external source material (e.g. `analysis/The Fully-Instrumented Specification Loop.md`)

Each type has different reliability characteristics and different staleness behavior.

---

## What already exists informally

- `analysis/` directory holds seven markdown research artifacts — this is the *de facto* research layer, but unstructured
- `.project/domain.json` schema description says "research findings, reference material, domain rules" — partial L1 coverage, schema exists but currently empty
- Individual findings cite sources inline (the existing `evidence` arrays on `spec-reviews.schema.json` and `framework-gaps.schema.json` act as micro-citations) — but there is no central block where the research itself lives

The gap: the `analysis/` markdowns have no structured index, no lifecycle state, no cross-references to the decisions/features/reviews they feed, and no staleness signaling.

---

## Shape — required fields for a research entry

```json
{
  "id": "R-0001",
  "title": "OpenRouter as provider in pi-mono",
  "status": "complete",
  "layer": "L2",
  "type": "investigative",
  "question": "How do we add OpenRouter alongside Anthropic, and what are the caveats for monitor forced-tool-choice dispatch",
  "scope": [
    "pi-ai 0.63.1 installed provider code",
    "pi-mono main branch as of 2026-04-10",
    "OpenRouter API documentation"
  ],
  "method": "code-inspection + web-fetch",
  "conducted_by": "agent/claude-opus-4-6",
  "conducted_at": "2026-04-10T00:00:00Z",
  "grounded_at": "2026-04-10T00:00:00Z",
  "grounding": {
    "dependencies": ["@mariozechner/pi-ai@0.63.1"],
    "revisions": ["pi-mono main branch retrieved 2026-04-10"],
    "external_refs": ["openrouter.ai/docs retrieved 2026-04-10"]
  },
  "stale_conditions": [
    "pi-ai upgrades past 0.63.x",
    "OpenRouter deprecates openai-completions endpoint"
  ],
  "findings_summary": "<self-contained ~300-800 word prompt-injectable summary>",
  "findings_document": "analysis/openrouter-pi-mono-setup.md",
  "citations": [
    { "label": "env-api-keys", "path": "node_modules/@mariozechner/pi-ai/dist/env-api-keys.js", "lines": "93" },
    { "label": "openai-completions provider", "path": "node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js", "lines": "240-400" },
    { "label": "models.generated.js openrouter bucket", "path": "node_modules/@mariozechner/pi-ai/dist/models.generated.js", "lines": "6517+" }
  ],
  "informs": ["DEC-0001", "DEC-0003", "STORY-008"],
  "informed_by": ["R-0000"],
  "related_research": [],
  "produces_findings": [],
  "supersedes": [],
  "superseded_by": ""
}
```

### Critical fields for composability

- **`findings_summary`** — self-contained, prompt-injectable, approximately 300–800 words. This is what gets pasted into an agent's context when the research is cited. Must stand alone without the full document.
- **`findings_document`** — pointer to the full markdown (or other rich document) for deep reads. Typically in `analysis/`.
- **`citations`** — array of source references with file+line or URL+retrieval-time. Every factual claim in the summary traces back to a citation.
- **`grounding`** — what's load-bearing. Version-pinned deps, retrieved revisions, dated external refs. This is what staleness tracks.
- **`stale_conditions`** — explicit list of "if these change, this research is no longer authoritative." Enables a query: "our pi-ai upgraded past 0.63.x — which research is now stale?"
- **`informs` / `informed_by`** — edges to other artifacts (decisions, features, reviews, gaps, plans, other research entries). Enables the traceability walk "why is this decision stated this way" back to ground truth.

---

## Placement — flat collection with cross-references

**Decision**: one flat `.project/research.json` block with a layer-tag per entry, NOT research embedded inside decisions or features.

Rationale:

- Some research informs multiple artifacts (openrouter-pi-mono-setup informs DEC-0001 AND DEC-0003 AND STORY-008). Embedding it inside one would force duplication.
- Research has its own lifecycle orthogonal to what it informs. A research entry can go stale while the decision it fed stays enacted. A new research entry can supersede an older one without touching the decisions.
- Research needs to be queryable across layers ("show me all L2 research conducted in the last 30 days") — embedding breaks that.
- Global view of research-to-ground-truth is load-bearing for understanding project state.

**Back-reference on existing schemas**: every artifact that cites research carries a `research_sources: [R-NNNN]` array so the bidirectional walk works without scanning the whole research collection. That is an additive edit to `decisions.schema.json`, `features.schema.json`, `spec-reviews.schema.json`, `framework-gaps.schema.json`, and `layer-plans.schema.json`.

---

## Lifecycle

```
planned → in-progress → complete → (stale | superseded)
                                 ↘ (revised → in-progress)
```

| State | Meaning |
|---|---|
| `planned` | Question framed, method chosen, no work started |
| `in-progress` | Investigation underway; summary and citations not yet complete |
| `complete` | Findings summary and citations finalized; informs-edges wired |
| `stale` | A stale condition fired; findings may or may not still be correct but are no longer authoritatively grounded |
| `superseded` | A newer research entry replaces this one with updated findings |
| `revised` | Transient state; the research entry is being re-run against updated grounding |

User-authored transition gates:

- `in-progress → complete` needs no user authority — agents can mark their own research complete
- `complete → stale` — any party can mark stale when a condition fires
- `complete → superseded` — requires the superseding entry to exist
- `stale → in-progress` (revise) — requires user authority if the research is currently cited by an `enacted` decision, because revising it may invalidate the decision's grounding

---

## Method field — reliability implications

The `method` enum is load-bearing because not all research is equally trustworthy:

| Method | Reliability | When to use |
|---|---|---|
| `code-inspection` | high | Direct read of source at a known revision |
| `empirical-test` | high | Actually ran the thing under controlled conditions |
| `web-fetch` | medium-high | Fetched a specific URL; reliability depends on source |
| `web-search` | medium | Searched; results may be incomplete |
| `paper-read` | medium-high | Academic citation; reliability depends on paper quality and recency |
| `curation` | medium | Curated an existing external document; reliability inherited from source |
| `llm-query` | low-medium | Asked an LLM; must be cross-checked against ground truth before citing |
| `interview` | variable | Human expert; depends on expertise |
| `static-analysis` | high | Tool-driven inspection (tsc, AST, static checkers) |
| `runtime-introspection` | high | Ran the code and inspected its behavior |

Research entries that cite low-reliability methods should carry a `cross-checked_against` field listing higher-reliability verifications.

---

## Cross-layer traceability — the critical capability

From any artifact, a reader must be able to walk:

```
FEAT-001 → research_sources → R-0001 → citations → file paths + line numbers → ground truth
```

And backward:

```
file change in pi-ai 0.64 → stale_conditions match → R-0001 goes stale → informs: DEC-0001 → DEC-0001 grounding lost → user decision required
```

This traceability is the entire point. Without it, research becomes write-once archives that nobody rereads. With it, research becomes an active substrate that self-invalidates when the world changes.

---

## Staleness enforcement — a new discovered framework gap

**Current state**: staleness must be checked by hand. The framework cannot automatically fire `stale_conditions`.

**New framework gap FGAP-007 — staleness engine**: a runtime that reads every research entry's `stale_conditions` and compares them against the current state (installed dep versions, git revisions, external-URL content hashes) and transitions research entries to `stale` automatically. Downstream effect propagates via `informs` edges to flag affected decisions as needing re-grounding.

This is a substantive addition to the framework-gaps roster. It should be captured in `.project/framework-gaps.json` as a seventh gap, related to the research block. Priority P2 (not blocking the consumer migration arc but materially affects long-term trust in cited research).

---

## Integration — what needs to happen for research blocks to function

1. **New schema**: `.project/schemas/research.schema.json` — defines the item shape, the method enum, the layer enum, the type enum, the lifecycle metadata (`x-lifecycle`).
2. **New data block**: `.project/research.json` — seeded with structured entries for each existing markdown in `analysis/` plus planned research entries for the consumer migration arc.
3. **Back-edge additions**: add `research_sources: string[]` field to the existing five schemas (`adrs`, `features`, `spec-reviews`, `framework-gaps`, `layer-plans`). Additive; does not break existing data.
4. **Cross-link the seed decisions**: DEC-0001 and DEC-0003 should cite R-0001 (openrouter research) and a new R-0008 for pi-agent-core ExtensionContext inspection (which does not yet exist — so it lands as `status: planned`). DEC-0002 should cite an empirical-test research entry for the Anthropic thinking + toolChoice rejection.
5. **Add FGAP-007** to `framework-gaps.json`: staleness engine gap.

---

## Seed research entries for this repo

Initial entries for the seven existing markdowns:

| ID | Title | Layer | Type | Status | Grounding |
|---|---|---|---|---|---|
| R-0001 | OpenRouter provider in pi-mono | L2 | investigative | complete | pi-ai 0.63.1, pi-mono main 2026-04-10 |
| R-0002 | gsd-2 derivability from platonic pi-project-workflows | L1 | comparative | complete | gsd-2 as observed 2026-04 |
| R-0003 | gsd-2 foundational intelligence pipeline | L1 | comparative | complete | gsd-2 as observed 2026-04 |
| R-0004 | Fully-Instrumented Specification Loop (external source) | L2 | curation | complete | SYNTH document as retrieved |
| R-0005 | Spec-loop derivability against platonic ideal | L2 | comparative | complete | R-0004 + framework as of 2026-04-13 |
| R-0006 | pi-project schema conventions audit | L2 | audit | complete | repo state 2026-04-14 |
| R-0007 | Moonshot AI API endpoint usability in pi-mono | L2 | investigative | complete | pi-ai 0.63.1 |

Candidate `planned` entries for what the consumer migration arc needs but has not yet produced:

| ID | Title | Layer | Type | Status |
|---|---|---|---|---|
| R-0008 | ExtensionContext currentModel availability | L2 | investigative | planned (prerequisite for DEC-0001) |
| R-0009 | Forced toolChoice + Claude via OpenRouter | L2 | empirical | planned (STORY-008) |
| R-0010 | Forced toolChoice + Kimi (any route) | L2 | empirical | planned (STORY-008) |
| R-0011 | Anthropic thinking + toolChoice constraint | L2 | empirical | complete (already-known; grounded in pi-behavior-monitors/index.ts:1231 comment and observed API rejection) |

---

## Composability demonstration

An agent handed `FEAT-001.stories[0]` (STORY-001 — model-pin resolution) can be injected with:

```
contextBlocks: [
  FEAT-001.stories[0],                    // the story and its tasks
  DEC-0001,                               // the gating decision
  R-0001.findings_summary,                // why OpenRouter matters
  R-0008.findings_summary || R-0008.question,  // ExtensionContext investigation (pending)
  R-0011.findings_summary                 // thinking + toolChoice constraint
]
```

Every element is atomically composable. The agent has ground truth for the decision it is implementing without needing to read the whole repo. Research's `findings_summary` plus `citations` lets it trust the claims and walk to source if needed.

---

## Summary of the design

- **Shape**: flat collection, each entry self-contained, grounded, cited, layer-tagged, type-tagged, lifecycle-gated
- **Placement**: `.project/research.json` + `.project/schemas/research.schema.json`; back-edge `research_sources` on the existing five schemas
- **Functionality**: informs / informed-by traceability, grounded_at + stale_conditions for automatic staleness detection, method enum for reliability tracking, findings_summary for prompt composition, findings_document for deep reads
- **Integration**: `analysis/*.md` files remain as `findings_document` targets; research.json is the structured index and the prompt-composable layer above them
- **Gap surfaced**: FGAP-007 staleness engine — automatic stale-condition checking with downstream invalidation propagation
