# Surface ceremony ideas

Date: 2026-05-01
Status: ideas. Not committed design. Conversation-derived shape captures forward intent for substrate-authoring ceremonies; not Tier A, not Tier B, not Tier D under the discipline of `2026-05-01-substrate-arc-distillation.md`. Pre-design conversation note.

## Why this file exists

Future substrate-authoring work in this project will eventually face decisions about which user-facing slash commands to expose. Capturing the ceremony ideas separately from the cascade-tainted primitive-surface recall preserves the surface-level intent without inheriting R1 contamination.

These are entry-point shapes, not contracts. The primitive substrate they would invoke is to be derived under extraction-first methodology when substrate-authoring work is actually attempted.

## Ideas

### `/project new`

Substrate-authoring ceremony. Schemas-first onboarding for a new project: list bundled schemas, drill into one, edit/add/select, finalize, materialize chosen subset into `.project/`. Replaces existing `project-init` if it lands.

### `/project new-phase`

Item-authoring ceremony. Author a new phase entry against the phase schema; write to `.project/phases/<id>.json` (or whatever the topology resolves to per the phase schema's declared shape).

### `/project edit-item`

Future ceremony. Edit an existing block item by predicate match; surface schema-shaped form populated with current values; write back via the canonical write surface.

### `/project archive-item`

Future ceremony. Transition an existing item to an archived state without deletion; preserves audit trail; matches the lifecycle pattern needed for cross-block referential integrity (e.g., a decision references a task that should not be hard-deleted).

## What this file is not

- Not a primitive-surface design. The primitives that would back these ceremonies are to be designed under extraction-first methodology (Phases 0–6 per `2026-05-01-substrate-arc-distillation.md` Tier B-3) before any commitment.
- Not a roadmap. Sequencing among ceremonies is a future scope decision, not implied by this listing.
- Not a contract. Any reader treating these as architectural commitments re-introduces the R1 hand-authored-substrate-from-working-memory failure mode.

## Reification path

If future substrate-authoring work adopts any of these ceremonies, they should:

1. Run extraction-first Phase 0 (drift reconciliation against synthesis Documents 1–3 and the distillation's Tier A entries)
2. Determine whether the ceremony's invoked primitive(s) exist or need design
3. Re-derive primitive contracts under empirical methodology, not session recall
4. Surface the ceremony+primitive proposal as a coherent unit with schema+macro+scaffold triple compliance

The four ideas here are durable as user-facing intent; the architectural decisions backing them remain open.

## Cross-references

- `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` — the substrate audit these ceremonies would operate over
- `analysis/2026-05-01-substrate-arc-distillation.md` — methodology canon (Tier B), framework gaps (Tier A), Q-exploration evidence (Tier D) that any future implementation must reconcile
