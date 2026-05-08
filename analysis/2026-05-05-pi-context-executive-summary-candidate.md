# Pi-Context — Executive Summary

## What it is

A single Pi extension package that owns the **typed-structured-context substrate**: authoring (validated writes), retrieval (query-driven selection), composition (lens projections + per-item rendering), and injection (cascade hooks into agent prompts). It replaces today's `pi-project` package with an honest name reflecting what the substrate actually does — manage typed memory consumed by LLMs at the right moment in the right shape.

## What it is not

- Not a project-management package. PM is one *lens* over the typed-context substrate, not the substrate itself. Other lenses (research, conformance, conversational, code-archaeology) are equally first-class.
- Not a markdown-memory layer. Markdown packs are out of scope. The substrate is typed JSON with AJV-validated writes, closure-table relations, schema-pinned identity.
- Not split across multiple packages. Substrate, lenses, and injection live in one package because they are one concern under "typed structured context."

## Substrate primitives (load-bearing)

- **Typed memory store**: schema-validated JSON files with AJV-at-every-write discipline (the F-006 single-ingress invariant). Block-API is the only authoring surface.
- **Closure-table relations**: hierarchical decomposition, ordering, membership all expressed as edges in `relations.json` with `relation_type` discrimination. No inline `depends_on` parallel storage.
- **Lens primitives**: `kind: "target" | "composition"` lenses project items across blocks and recurse through sub-lenses. Cycle-safe.
- **Canonical-macro registry**: per-kind renderers consumed by `render-by-id`, `resolve-by-id`, marker grammar.
- **Cross-block resolver**: stable id index, depth-aware traversal, cycle markers.

## Vocabulary surface

A single config (`<config.root>/config.json`) declares everything identity-bearing:

- `layers[]` — named work-altitude tiers with display labels
- `block_kinds[]` — per kind: opaque `canonical_id`, mutable `display_name`, `prefix` token, `schema_path`, `array_key`, `layer` FK, optional `lifecycle`
- `status_buckets` — per-project status-enum-to-bucket mapping (replaces hardcoded STATUS_VOCABULARY)
- `display_strings` — validation-code labels and other surface-text (codes stay opaque slugs)
- `naming` — block/lens/relation display aliases

**Identity is opaque, display is mutable.** Renaming a display label touches config only; data, schemas, relations, and code are untouched. Adding a new block kind is a config edit + schema file, no TS PR. Prefix-collision class becomes structurally impossible (declared at config registration, not discovered at fixture-write time).

## Retrieval + injection (capability extension)

- **Coverage-rank ranker** (lifted from pi-memctx pattern): non-embedding, query-driven selection over the id index. 4.8KB of code, no vector DB, no embedding-model lifecycle.
- **`before_agent_start` cascade hook**: per main-conversation user prompt, runs query-driven selection over typed substrate, composes top-k items into system prompt via canonical macros, applies anti-injection delimiters.
- **Aggregate token budgeting**: per-section + total injection budget with priority-driven trim. Extends today's per-field `x-prompt-budget` to section granularity.
- **Auto-extract pipeline**: `session_before_compact` hook extracts candidate items from recent turns, runs them through classifier agents, AJV-validates against target schemas, surfaces approved candidates for one-click block-API write. Closes the bidirectional substrate pipeline.

## Lifecycle & integrity

- AJV-at-every-write on all block files
- Cross-block referential walk (`validateProject`)
- Closure-table edge validation (cycle detection, dangling-edge diagnostics, relation-type vocabulary check)
- Lens-of-lenses composition cycle detection
- Per-kind lifecycle states with optional state-machine validation

## Tooling surface

- **Block-API**: read/write/append/update/remove + nested-array variants, all schema-validated, all routed through single ingress
- **Lens views**: load / render / curate (via follow-up-turn ceremony writing edges to relations.json)
- **Pi tools**: `read-block`, `render-item-by-id`, `resolve-item-by-id`, `enforce-budget`, lens projection, validation, status rollup
- **`/project` (or renamed `/context`) subcommands**: status, validate, view, install, init, new, lens-curate, plus future `before_agent_start` introspection
- **Skill generation**: SKILL.md derived from registered tools, commands, schemas, lenses

## Substrate-arc landings carrying forward

Code from the seven-step substrate-arc envelope migrates into pi-context:
- Lens-agnostic (≈70%): topoSort, rollupPhaseStatus, composition lens dispatch, substrate invariants — direct adoption
- PM-lens (≈25%): roadmap/plan loaders, validators, renderers — moves to pi-context's PM-lens module under config-driven block_kinds
- Superseded (≈5%): hardcoded prefix maps, hardcoded status vocab, hardcoded validation-code strings — replaced by config

## Consumers

- **pi-jit-agents**: agent-spec load/compile/execute. Consumes pi-context's id index + canonical macros + render primitives. Forced-tool-use shape normalization stays here.
- **pi-workflows**: orchestration, DAG, dispatch. Consumes pi-context macros for agent-step composition.
- **pi-behavior-monitors**: classifier loop and steering. Consumes pi-context state via `invokeMonitor` and read-only block reads.
- **pi-context-workflows** (meta): re-exports the four workspace packages for one-shot install.

The four-workspace monorepo stays at four packages. Rename happens within the existing structure.

## What the rename costs

- npm package name change `@davidorex/pi-project` → `@davidorex/pi-context`
- Peer-dep updates across pi-jit-agents, pi-workflows, pi-behavior-monitors, meta package — lockstep version bump
- Internal source file renames (project-sdk.ts → context-sdk.ts, etc.) — incremental, not blocking
- GitHub repo rename — separate decision
- Docs / READMEs / SKILL narratives refreshed

No data migration in `.project/` directories at consumer sites: the substrate format is unchanged. Only the package-name reference changes.

## What the rename unlocks

- Vocabulary-decision-pending (ADR/FGAP) becomes display-only edits — cost analysis that deferred it evaporates
- Issue-089 (PLAN- prefix collision) closes structurally — config-driven block_kinds makes prefix conflicts registration-time errors
- Audit findings (4 undeclared prefixes, 2 drift cases, 3 fragilities) close as same class
- FGAP-013 (status vocabulary registry) closes by `config.status_buckets`
- Pi-memctx-derived retrieval+injection patterns have an honest home rather than living awkwardly inside a "project" package
- New lens kinds (research-only, conformance-only, conversational-continuity) become config edits, not package PRs

## What the rename does not solve

- FGAP-006 (schema evolution / versioning / migration) — schemas without `$id` and without `$ref` composition still drift across projects; rename doesn't fix this
- FGAP-004 (authorship attestation at block write time) — orthogonal
- FGAP-007 (research staleness engine) — orthogonal
- Per-commit substantive trust audit on inherited substrate-arc work — still needed independent of rename
- Nested-array traversal blind spot in `buildIdIndex` — substrate-internal fix, separate from package rename

## Net read

Pi-context names the package what the substrate has been since v0.21+: a typed-context store with lens primitives and validated authoring, increasingly missing only the retrieval+injection layer that pi-memctx empirically demonstrated yields large practical wins. The rename is the structurally-honest acknowledgment of where the package's center of gravity already sits. The capability extension (config-driven vocabulary + cascade injection + auto-extract) delivers what makes the substrate actually consumable by main-conversation agents at the right moment in the right shape — closing the loop between "we have typed memory" and "the LLM sees it when it matters."