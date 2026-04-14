# pi-project schema and naming conventions — current state audit

Snapshot date: 2026-04-14. Cross-checked against `.project/schemas/` in this repo and `packages/pi-project/src/`.

This document captures the conventions pi-project actually uses today, measures them against canonical engineering vocabulary, and inventories the framework gaps that surface when the L1–L5 artifact-ownership model from Muni is applied. It exists to inform the consumer migration arc and the broader question of how `.project/` should be restructured to natively support per-scope finding registries, hierarchical work decomposition, and state-machine validation.

---

## Current conventions

### Schema location

- `.project/schemas/` per project — scaffolded by `/project init`, not shipped from the package
- `packages/pi-project/schemas/` does not exist; the package has no default-shipped schemas
- 18 schema files exist in this repo's `.project/schemas/` as of the snapshot date

### Schema standard

- JSON Schema **draft-07** (`http://json-schema.org/draft-07/schema#`)
- AJV-based validator (`packages/pi-project/src/schema-validator.ts`)
- No `$id`, no `$ref`, no `allOf` / `anyOf` composition — flat schemas with no inheritance or shared fragments
- No schema-evolution version field, no migration story, no schema registry — schemas drift silently per project

### File naming

- kebab-case + `.schema.json` suffix
- Singular for type-of-thing identity blocks (`project.schema.json`, `domain.schema.json`)
- Plural for collection blocks (`decisions.schema.json`, `tasks.schema.json`, `issues.schema.json`, `requirements.schema.json`)

### Top-level shape

Every block is a JSON object with one required wrapper property whose value is an array. Wrapper key matches the schema title in lowercase plural:

- `decisions.schema.json` → `{ "decisions": [...] }`
- `tasks.schema.json` → `{ "tasks": [...] }`
- `issues.schema.json` → `{ "issues": [...] }`
- `architecture.schema.json` → `{ "modules": [...], "patterns": [...], ... }` — the only schema that breaks the single-wrapper pattern (multi-array)

### Item shape

- Every item in the array has a required `id: string`
- `id` is free-form string — not constrained to slug/uuid/numeric/UUID format
- Plus type-specific required fields per schema

### State enums (lifecycle vocabulary in actual use)

| Block | Enum field | Allowed values |
|---|---|---|
| `decisions` | `status` | `decided`, `tentative`, `revisit` |
| `tasks` | `status` | `planned`, `in-progress`, `completed`, `blocked`, `cancelled` |
| `issues` | `status` | `open`, `resolved`, `deferred` |

Each block invents its own enum. There is no global lifecycle vocabulary shared across blocks. State semantics are not aligned with canonical issue-tracker lifecycles (`open → triaged → in-progress → in-review → resolved → closed`).

### Cross-references (referential integrity)

Enforced by `validateProject()` in `project-sdk.ts`. 11 dimensional checks. FK targets are by string id — no `$ref` in schemas; integrity is asserted in code, not in schema.

Known cross-references:

- `task.phase → phase.id`
- `decision.phase → phase.id`
- `gap.resolved_by → task.id` (the term `gap` survives in this check despite not being a current block name — likely legacy)
- `requirement.traces_to → ?` (target unverified)
- `verification.target → task.id | phase.id | requirement.id`
- `rationale.related_decisions → decision.id`

### Authorship attestation

- `issues.schema.json` has a `source` enum (`human | agent | monitor | workflow`) — partial coverage
- `tasks.schema.json` has `assigned_agent: string` — assignment, not authorship
- No block records `written_by` / `authored_by` / `created_by` consistently
- `block-api.ts` does not stamp authorship on writes

### `additionalProperties`

- Only `issues.schema.json` declares `additionalProperties: false`
- Other schemas implicitly permit unknown fields
- Enforcement is inconsistent across blocks

### Title and description style

- Every schema has a prose `title` (PascalCase noun)
- Substantive `description` paragraph framing what the block is *for*, in consumption-oriented language ("Consumed by planning agents to understand what exists before proposing changes")
- Descriptions read like ADR-flavored rationale, not formal IEEE 830 statements

### Schema-aware tooling

- `block-api.ts` validates writes against `.project/schemas/<name>.schema.json` automatically
- `schema-validator.ts` wraps AJV
- `block-validation.ts` snapshots `.project/*.json` before a workflow step and rolls back on failure
- `project-sdk.ts` reads schemas to build `schemaVocabulary()` and `schemaInfo()` queries
- `block:<name>` schema-ref convention: `output.schema: block:project` resolves to `.project/schemas/project.schema.json` from cwd

### Hierarchy

**Flat.** Every block is a single top-level JSON file containing a single array. No nested directories. `tasks.json` is a flat array, not `tasks/{id}.json` per task. `phase.schema.json` exists as a separate block but is not a parent directory — phases are referenced by integer or string id from inside `tasks` and `decisions`.

### Schema evolution

- User-customizable per project ("Edit `.project/schemas/*.schema.json` to add fields, change enums, or restructure — no code changes needed" per CLAUDE.md)
- No version field, no migration, no compatibility check
- Drift is silent

---

## Current 18 schemas

```
architecture.schema.json
audit.schema.json
conformance-reference.schema.json
conventions.schema.json
decisions.schema.json
domain.schema.json
handoff.schema.json
inventory.schema.json
issues.schema.json
phase.schema.json
project.schema.json
rationale.schema.json
reference-contracts.schema.json
requirements.schema.json
runtime-spec.schema.json
state.schema.json
tasks.schema.json
verification.schema.json
```

---

## Naming mismatches against canonical engineering vocabulary

| Current name | Canonical equivalent | Status |
|---|---|---|
| `decisions.json` | **ADR log** (Nygard 2011) | uses `decision` + `rationale` + `status` — exactly an ADR; just not named that way |
| `rationale.json` | (subset of ADR) | duplicates ADR-level rationale; should fold into `decisions` |
| `phase.json` | **milestone** / **epic** | `phase` is informal; canon is milestone or epic |
| `gap` (in `resolved_by` check) | **issue** / **defect** | overlaps `issues`; legacy term |
| `conformance-reference.json` | **coding standards** / **lint config** | overlaps `conventions.json` |
| `verification.json` | **acceptance test results** / **V&V records** (IEEE 1012) | canonical match exists |
| `inventory.json` | **catalog** / **registry** | unclear what it inventories |
| `runtime-spec.json` | **runtime contract** / **operational spec** | |
| `state.json` | **derived state cache**? | unclear; possibly a runtime artifact |
| `reference-contracts.json` | **API contract** / **interface spec** | |
| `handoff.json` | **session notes** | not standard; informal |
| `audit.json` | **review report** / **audit log** | canonical |

---

## What pi-project does well today

- JSON Schema draft-07 + AJV is canonical
- kebab-case file naming is canonical
- Validate-on-write at the API boundary is correct
- `block:<name>` schema reference is a clean abstraction
- User-customizable schemas without code changes is the right philosophy
- The descriptions read like ADR rationale already — half the vocabulary shift is just renaming files

---

## Framework gaps surfaced by the L1–L5 + canonical-vocabulary direction

Six shortcomings of pi-project's current schema convention, measured against canonical engineering practice and against the artifact-ownership model needed to support pre-implementation verification, per-scope finding registries, and state-machine-gated lifecycles.

### 1. Hierarchical / nested blocks

No `tasks/{id}.json` per task. No `epics/{id}/stories/{id}/tasks/{id}.json` tree. Block I/O assumes a single flat JSON file per block. The `roadmap → milestone → epic → story → task` decomposition canonical to Agile/GitHub cannot be expressed as schemas today; it would have to be smuggled into a flat array with denormalized parent references.

### 2. Per-scope finding registries

No convention for a block carrying its own embedded `findings: [...]` array distinct from the global `issues.json`. A spec contradiction discovered during a design review of `jit-agents-spec.md` has nowhere to live except the global issue tracker, where it's mixed with task-level bugs and feature-level scope conflicts.

### 3. Materialized views

No derived block kind. `projectState()` does in-memory aggregation but it is not a persisted, addressable, schema-validated block. There is no way to declare "global `issues_view.json` is a derived index over per-scope finding registries."

### 4. Authorship attestation as a write-time invariant

Only `issues.schema.json` has a `source` enum; `tasks.schema.json` has `assigned_agent` (a different concept). No automatic stamping in `block-api.ts`. Cannot enforce "only the user can advance a finding from `proposed` to `decided`" because the writer's identity isn't recorded.

### 5. State-machine validation on enum transitions

AJV draft-07 validates *current value* membership; it cannot express "this transition is allowed only from `proposed` to `decided`." Would need either custom AJV keywords, a validation layer above the schema, or a dedicated state-machine primitive in pi-project.

### 6. Schema versioning / evolution

No `version` field on schemas, no `$id`, no migration story, no `$ref` composition. Schemas drift silently across projects. A schema rename or field rename has no backward-compatibility story.

---

## Application to the consumer migration arc

These six gaps are not novel asks invented from SYNTH folklore or Muni's five-layer model. They are existing shortcomings of pi-project's current schema convention measured against canonical engineering practice. The consumer migration arc must either:

- **Address them in scope** — expand the migration's L3 feature decomposition to include pi-project schema-substrate work as parallel stories
- **Track them as a parallel L2 work track** that the migration consumes — the migration drafts its impl spec only after the schema substrate it depends on has been resolved
- **Defer them with explicit acknowledgement** — accept that the migration ships against today's flat-block reality and the layered structure is enacted manually, with the gaps captured as L2 design issues to be closed in a subsequent epic

The choice is the user's, per mandate-007 (no deferring discovered issues without the user deciding scope) and mandate-004 (no negligent fix paths that leave known fragility unaddressed).
