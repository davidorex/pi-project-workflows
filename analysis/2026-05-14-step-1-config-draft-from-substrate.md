Draft config reverse-engineered from substrate state + pi-context source:

```json
{
  "schema_version": "1.0.0",
  "root": ".project",
  "block_kinds": [
    { "canonical_id": "project",              "display_name": "Project",                "prefix": "",        "schema_path": "schemas/project.schema.json",              "array_key": "name",          "data_path": "project.json" },
    { "canonical_id": "domain",               "display_name": "Domain",                 "prefix": "",        "schema_path": "schemas/domain.schema.json",               "array_key": "entries",       "data_path": "domain.json" },
    { "canonical_id": "requirements",         "display_name": "Requirements",           "prefix": "",        "schema_path": "schemas/requirements.schema.json",         "array_key": "requirements",  "data_path": "requirements.json" },
    { "canonical_id": "architecture",         "display_name": "Architecture",           "prefix": "",        "schema_path": "schemas/architecture.schema.json",         "array_key": "modules",       "data_path": "architecture.json" },
    { "canonical_id": "decisions",            "display_name": "Design Decisions",       "prefix": "DEC-",    "schema_path": "schemas/decisions.schema.json",            "array_key": "decisions",     "data_path": "decisions.json" },
    { "canonical_id": "framework-gaps",       "display_name": "Framework Gaps",         "prefix": "FGAP-",   "schema_path": "schemas/framework-gaps.schema.json",       "array_key": "gaps",          "data_path": "framework-gaps.json" },
    { "canonical_id": "tasks",                "display_name": "Tasks",                  "prefix": "TASK-",   "schema_path": "schemas/tasks.schema.json",                "array_key": "tasks",         "data_path": "tasks.json" },
    { "canonical_id": "verification",         "display_name": "Verifications",          "prefix": "VER-",    "schema_path": "schemas/verification.schema.json",         "array_key": "verifications", "data_path": "verification.json" },
    { "canonical_id": "issues",               "display_name": "Issues",                 "prefix": "issue-",  "schema_path": "schemas/issues.schema.json",               "array_key": "issues",        "data_path": "issues.json" },
    { "canonical_id": "rationale",            "display_name": "Rationales",             "prefix": "RAT-",    "schema_path": "schemas/rationale.schema.json",            "array_key": "rationales",    "data_path": "rationale.json" },
    { "canonical_id": "research",             "display_name": "Research",               "prefix": "R-",      "schema_path": "schemas/research.schema.json",             "array_key": "research",      "data_path": "research.json" },
    { "canonical_id": "features",             "display_name": "Features",               "prefix": "FEAT-",   "schema_path": "schemas/features.schema.json",             "array_key": "features",      "data_path": "features.json" },
    { "canonical_id": "spec-reviews",         "display_name": "Spec Reviews",           "prefix": "REVIEW-", "schema_path": "schemas/spec-reviews.schema.json",         "array_key": "reviews",       "data_path": "spec-reviews.json" },
    { "canonical_id": "layer-plans",          "display_name": "Layer Plans",            "prefix": "PLAN-",   "schema_path": "schemas/layer-plans.schema.json",          "array_key": "plans",         "data_path": "layer-plans.json" },
    { "canonical_id": "conventions",          "display_name": "Conventions",            "prefix": "",        "schema_path": "schemas/conventions.schema.json",          "array_key": "rules",         "data_path": "conventions.json" },
    { "canonical_id": "conformance-reference","display_name": "Conformance Reference",  "prefix": "",        "schema_path": "schemas/conformance-reference.schema.json","array_key": "principles",    "data_path": "conformance-reference.json" },
    { "canonical_id": "audit",                "display_name": "Audits",                 "prefix": "",        "schema_path": "schemas/audit.schema.json",                "array_key": "audits",        "data_path": "audit.json" },
    { "canonical_id": "handoff",              "display_name": "Handoff",                "prefix": "",        "schema_path": "schemas/handoff.schema.json",              "array_key": "sessions",      "data_path": "handoff.json" },
    { "canonical_id": "context-contracts",    "display_name": "Context Contracts",      "prefix": "CTX-",    "schema_path": "schemas/context-contracts.schema.json",    "array_key": "contracts",     "data_path": "context-contracts.json" },
    { "canonical_id": "phase",                "display_name": "Phases",                 "prefix": "PHASE-",  "schema_path": "schemas/phase.schema.json",                "array_key": "(file-per-phase, no array)", "data_path": "phases/" },
    { "canonical_id": "roadmap",              "display_name": "Roadmaps",               "prefix": "ROADMAP-","schema_path": "schemas/roadmap.schema.json",              "array_key": "roadmaps",      "data_path": "roadmap.json" }
  ],
  "relation_types": [],
  "lenses": [],
  "layers": [],
  "status_buckets": {},
  "naming": {},
  "display_strings": {},
  "hierarchy": [],
  "installed_schemas": [
    "project", "domain", "requirements", "architecture",
    "decisions", "framework-gaps", "tasks", "verification",
    "issues", "rationale", "research", "features",
    "spec-reviews", "layer-plans", "conventions",
    "conformance-reference", "audit", "handoff",
    "context-contracts", "phase", "roadmap"
  ],
  "installed_blocks": [
    "project", "domain", "requirements", "architecture",
    "decisions", "framework-gaps", "tasks", "verification",
    "issues", "rationale", "research", "features",
    "spec-reviews", "layer-plans", "conventions",
    "conformance-reference", "audit", "handoff",
    "context-contracts"
  ]
}
```

## Convention drift surfaced (needs L2 decision)

- `issue-` lowercase vs all others uppercase
- `R-` 4-digit zero-pad vs others 3-digit
- `DEC-` 4-digit zero-pad vs others 3-digit
- `phase` block kind: file-per-phase (no array_key), violates the array-block pattern
- `phase` schema discriminator is `number: integer` not a string id; `PHASE-NNN` form is the roadmap-side reference style, not the file's own discriminator
- `roadmap`, `phase`, `relations`, `config`, `bootstrap` schemas exist in `packages/pi-context/registry/schemas/` but NOT in `.project/schemas/` — not installed

## Block kinds NOT in `.project/` but in source

- inventory (`.project/inventory.json` exists but registry has no schema)
- runtime-spec (similarly orphan)
- layer / plan / priority / severity / source / status / verification-method (framework-shaped supporting schemas in registry, not user-block kinds)

## Missing entirely

- `relation_types[]` is empty — no DEC-0013-canon edges declared
- `lenses[]` empty — no projection registry
- `layers[]` empty — L1..L5 referenced in FGAP `layer` field has no registry

## Pi-context source authority

- `PROJECT_BLOCK_TYPES` at `packages/pi-context/src/project-sdk.ts:117` declares the install-time default 12 kinds: project / domain / requirements / architecture / tasks / decisions / issues / rationale / verification / handoff / conformance-reference / audit. Current `.project/` exceeds this by 9 user-added kinds; the install-time default is the floor, not the current state.