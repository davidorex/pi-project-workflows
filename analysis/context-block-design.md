# Context Block Design Board

Living design surface for substrate block kinds. Tracks: existing block schemas + their layer assignments, pending block-need drafts (pre-FGAP-filing), rejected designs with rationale, open design questions.

**Not substrate.** Substrate is the enacted state in `.project/*.json`. This doc is the design workspace where ideas are drafted before reification as FGAPs / DECs / schemas.

**Discipline**: when a draft hardens into a decision, file as FGAP/DEC/TASK; remove from the "pending drafts" section and reference its substrate-id.

---

## Current state — block kinds in this repo's substrate

Inventoried 2026-05-12 from `.project/` and `.project/schemas/`. The set may drift as blocks are added/installed; re-derive via `ls .project/*.json` + `ls .project/schemas/*.schema.json`.

### Live block files (`.project/*.json`)

| Block kind | Schema | Array key | ID prefix | Layer | Purpose |
|------------|--------|-----------|-----------|-------|---------|
| project | project.schema.json | (singleton) | — | L1 | Identity, vision, goals, constraints, scope, status |
| architecture | architecture.schema.json | (verify) | — | L1 | Modules, patterns, boundaries |
| roadmap | (registry only — not installed) | roadmaps | ROADMAP- | L1 | Phases[], milestones[], lens-projection per phase |
| phase | (registry only — not installed) | phases | PHASE- | L1 | Phase records (consumed by roadmap-plan) |
| plan | (registry only — not installed) | plans | PLAN- | L1 | Plan records with status + phase ordering |
| layer-plans | layer-plans.schema.json | layer_plans | PLAN- | L1 | L1–L5 Muni restructure plans |
| features | features.schema.json | features | FEAT- | L2 | L3 epics with nested stories/tasks/findings |
| tasks | tasks.schema.json | tasks | TASK- | L3 | Standalone task registry with status lifecycle |
| decisions | decisions.schema.json | decisions | DEC- | L3 | Choices with rationale, status (open/enacted/superseded) |
| issues | issues.schema.json | issues | issue- | L3 | Open items with priority, category, resolution |
| requirements | requirements.schema.json | requirements | REQ- | L3 | Functional/non-functional with MoSCoW priority |
| rationale | rationale.schema.json | (verify) | — | L3 | Design rationale with decision cross-references |
| framework-gaps | framework-gaps.schema.json | gaps | FGAP- | L4 | Pi-project capability gaps |
| spec-reviews | spec-reviews.schema.json | reviews | REVIEW- | L4 | Design reviews with embedded finding registries |
| audit | (registry only — not installed) | checks | — | L4 | Structured audit results from running conformance checks |
| conformance-reference | conformance-reference.json | (verify) | — | L4 | Executable code conventions with check methods/patterns |
| verification | verification.json | (verify) | — | L4 | Completion evidence per task/phase/requirement |
| research | research.schema.json | research | R- | L5 | Factual/analytical substrate under decisions |
| domain | domain.schema.json | (verify) | — | L5 | Research findings, reference material, domain rules |
| conventions | conventions.schema.json | rules | — | L5 | Project-specific conventions (this repo's local extension) |
| handoff | handoff.schema.json | (singleton) | — | meta | Session context snapshot |
| inventory | inventory.schema.json | (verify) | — | meta | (this repo's local extension; verify shape) |
| reference-contracts | reference-contracts.schema.json | (verify) | — | meta | (verify shape) |
| runtime-spec | runtime-spec.schema.json | (verify) | — | meta | (verify shape) |
| state | state.schema.json | (verify) | — | meta | (verify shape) |

### Layer assignments per L1–L5

L1-L5 are PM altitudes per config. Current layer mapping above is best-guess from CLAUDE.md + schema content; should be verified against config when `.project/config.json` exists. Items marked "verify" need direct schema inspection.

- **L1 strategy**: project, architecture, roadmap, phase, plan, layer-plans
- **L2 tactics**: features
- **L3 operations**: tasks, decisions, issues, requirements, rationale
- **L4 review**: framework-gaps, spec-reviews, audit, conformance-reference, verification
- **L5 reference**: research, domain, conventions
- **meta** (cross-cutting): handoff, inventory, reference-contracts, runtime-spec, state

### Closure-table relations (`.project/relations.json`)

Per DEC-0009 + DEC-0013 — closure-table is the canonical primitive for ALL inter-item relationships. Per-edge `relation_type` registered in `config.relation_types[]`. No FK-as-field allowed (DEC-0013).

---

## Pending designs (drafts under consideration; not yet FGAP-filed)

(empty — populate as design ideas surface; each draft below a `### <name>` heading with proposed shape, motivating use-case, open questions, and link to FGAP once filed)

---

## Open design questions

### How does plan-mode plan content reify into substrate?

Plan-mode plans currently live in `~/.claude/plans/<slug>.md`. Decisions there aren't substrate-injectable. Per `feedback_plan_mode_step_one_substrate_write.md` (filed 2026-05-12), plan-mode step 1 should substrate-write resolved decisions into TASK/FGAP/DEC blocks. Question: is there a structured slot in TASK schema for "design decisions resolved during plan-mode" beyond `notes` free-text? Or should each resolved decision become its own micro-DEC item? Or is this what FGAP-038's inject-context-items.ts surfaces as a schema-shape friction point?

### Item-level context injection — what does the projection shape look like

Per FGAP-038 (item-level context injection script), markdown projection requires per-block-kind macros (FGAP-037). JSON projection is universal. XML projection (per-item wrapped) is universal. Open: is there a fourth shape needed where items are PARTIALLY rendered (specific fields only) — and if so does that need first-class config support (e.g. `display_strings.partial_renderings` map) or is it purely script-side?

### Should explore-output be its own block kind

(see Rejected: change-specs). Open question: explore-reports block kind with items carrying nested cascade_targets[] / audit_grep_results / cross_references? Or is the explore output ephemeral and not worth substrate persistence (decay after implementer applies the changes)? The dogfooding rationale says yes-substrate; the lifecycle question (explore output decays once implementer applies it; FGAP-035 row 1 doesn't outlive the FGAP-035 closure) says maybe-not.

### Should "subagent dispatch records" be a block kind

Tracking who dispatched what brief, when, with what context items injected, what report came back, what commit it produced. Useful for audit trail + dogfood-dispatchability gate (FGAP-028). Open: is this metadata that lives in dispatch-records block, or in an extension to existing `audit` block, or somewhere else.

---

## Design discipline reminders

- **No FK-as-field for inter-item relationships** — relations.json closure-table is canonical (DEC-0013)
- **Per-block-kind macros land alongside schemas** — FGAP-037 captures the 6 missing
- **`source_id` field is a DEC-0013 violation** — use closure-table edges instead
- **Substrate-canon: agents write block-shape items, not free-form MD** — emerging policy from this turn; still to be canonicalized
- **Plan-mode step 1 = substrate-write decisions** — feedback_plan_mode_step_one_substrate_write.md
- **Item-level injection requires cwd-aware substrate access** — DEC-0015 cascade applies to scripts too (via @davidorex/pi-context/block-api)
