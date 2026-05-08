# POC A — Identity-Display Decoupling

**Date:** 2026-05-04
**Scope:** self-contained POC under `analysis/poc/pi-context-poc/A-identity-display-decoupling/`. Touches no `packages/*/src/`, no `.project/`.
**Status:** runnable. First of nine POCs (A–I) enumerated in `../README.md`.

## What this POC proves

Renaming a block's display label under the proposed pi-context architecture is a `config.json` edit only — no data, schema, or SDK code change. The same `render.ts` reads two configs (`config.json` and `config-alt.json`) that differ only on `display_name` (and the parallel `naming` aliases), processes byte-identical fixture data through the identical pipeline, and emits markdown whose only differences are the display labels in the `# header` lines.

This empirically demonstrates the candidate articulation's headline claim (`analysis/2026-05-05-pi-context-executive-summary-candidate.md`, sections "Vocabulary surface" and "What the rename unlocks"): identity is opaque (`canonical_id`, `prefix`, item `id`); display is mutable (`display_name`); the universal `displayName(cfg, canonicalId)` lookup is the single decoupling point.

## How to run

```bash
# Primary profile
npx tsx analysis/poc/pi-context-poc/A-identity-display-decoupling/render.ts
# → writes output/primary/decisions.md + output/primary/issues.md

# Alternate profile
npx tsx analysis/poc/pi-context-poc/A-identity-display-decoupling/render.ts alt
# → writes output/alt/decisions.md + output/alt/issues.md
```

## Two-profile invocation table

| Aspect | Primary (`config.json`) | Alt (`config-alt.json`) |
|---|---|---|
| `block_kinds[0].canonical_id` | `decisions-block` | `decisions-block` (identical) |
| `block_kinds[0].display_name` | `Design Decisions` | `Architectural Records` |
| `block_kinds[0].prefix` | `DEC-` | `DEC-` (identical) |
| `block_kinds[1].canonical_id` | `issues-block` | `issues-block` (identical) |
| `block_kinds[1].display_name` | `Issues` | `Open Questions` |
| `block_kinds[1].prefix` | `issue-` | `issue-` (identical) |
| Fixture data | `data/decisions.json` + `data/issues.json` | identical (same files) |
| Schemas | `schemas/decisions.schema.json` + `schemas/issues.schema.json` | identical |
| Renderer | `render.ts` | identical |
| Output goes to | `output/primary/` | `output/alt/` |

## Verification (mechanical, no judgment)

Four checks the implementation is expected to pass:

1. Both invocations exit with code 0; expected output files appear under `output/<profile>/`.
2. `diff -r output/primary/ output/alt/` returns non-empty (display labels differ).
3. `grep -E "DEC-[0-9]+|issue-[0-9]+" output/primary/*.md output/alt/*.md` returns identical id sets across profiles.
4. `grep "^# " output/primary/decisions.md` returns `# Design Decisions`; same on `output/alt/decisions.md` returns `# Architectural Records`.

The `diff config.json config-alt.json` should show changes only on `display_name` lines and `naming` map entries — no other field deltas.

## Mapping to candidate articulation

| Candidate articulation section | What this POC demonstrates |
|---|---|
| "Substrate primitives" → typed memory store | `loadBlock()` reads typed JSON with declared schema reference; AJV is deferred to the production layer per POC scope |
| "Vocabulary surface" — single `config.json` declares everything identity-bearing | `config.json` carries `block_kinds[]` with `canonical_id`, `display_name`, `prefix`, `schema_path`, `array_key`, `data_path`; renderer consumes only this surface |
| "Identity is opaque, display is mutable" | `displayName(cfg, canonicalId)` lookup; `canonical_id` and `prefix` byte-identical across profiles, `display_name` swaps freely |
| "What the rename unlocks" → vocabulary-decision-pending becomes display-only edits | The two profiles are exactly that swap, mechanically reproduced |

## Out of scope (other POCs in the A–I sequence)

- Prefix mutability — POC keeps prefix constant per design (registration-time prefix-collision detection lands in a later POC)
- Content-hash skip detection (POC B)
- Two-phase token budgeting (POC C)
- Coverage-rank ranker over typed substrate (POC D)
- Relation-type registry (POC E)
- Cascade fail-stop semantics (POC F)
- Auto-extract with AJV gate (POC G)
- Producer-vs-observer status (POC H)
- End-to-end skip detection (POC I)
- AJV validation flow (POC reads + parses; production layer adds AJV-at-every-write)
- Closure-table relations and lens projections (covered by `analysis/poc-degree-zero-lens/`)

## File layout

```
A-identity-display-decoupling/
  README.md                     # this file
  config.json                   # primary profile
  config-alt.json               # alt profile (display_name + naming differ; everything else identical)
  schemas/
    decisions.schema.json       # minimal AJV-compatible schema (not invoked by POC)
    issues.schema.json          # minimal AJV-compatible schema (not invoked by POC)
  data/
    decisions.json              # 3 fixture entries, shared across profiles
    issues.json                 # 3 fixture entries, shared across profiles
  render.ts                     # tsx-runnable; profile selected via argv[2]
  output/
    primary/
      decisions.md              # generated; "# Design Decisions"
      issues.md                 # generated; "# Issues"
    alt/
      decisions.md              # generated; "# Architectural Records"
      issues.md                 # generated; "# Open Questions"
```
