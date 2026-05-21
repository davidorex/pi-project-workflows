# Context-plugin feasibility (2026-05-22)

Floated by user: a portable, third-party-authorable bundle of a complete CONTEXT MODEL (config + schemas + starter blocks + relations + macros), installable into any pi-context substrate so others can use a crafted conception immediately. Grounded by two read-only Explore passes against the live tree. Status: feasibility exploration; idea filed as FEAT-003 (proposed) + R-0013.

## Framing: a 4th, data-only artifact type

Distinct from the three existing distributables (Explore-confirmed):
- **Claude Code plugin** — CLI skills/agents/commands; marketplace/GitHub URL.
- **Pi extension** — `dist/index.js` loaded by pi; npm `@davidorex/pi-*` (lockstep).
- **Behavior-monitor spec** — classifier YAML, bundled in pi-behavior-monitors.
- **Context plugin (proposed)** — pure DATA: `conception.json` + `schemas/` + `blocks/` + relations seed + macros. Carries no code.

It is the next altitude above B2/FGAP-068: `samplesCatalog()` made *the package's own* packaged conception (DEC-0037) queryable; a context plugin makes *any* conception portable, shareable, installable.

## Already exists (reuse)
- `conception.json` IS the manifest form of a context model (block_kinds / relation_types / lenses / layers / invariants / status_buckets / installed_*). `samples/conception.json`.
- `installProject` (index.ts ~333-401) — the copy-into-substrate flow (installed_schemas[]/installed_blocks[] → substrate via projectRoot).
- Bootstrap: `.pi-context.json` pointer + `writeBootstrapPointer` + `resolveContextDir` (project-dir.ts).
- Schema identity + evolution: per-schema `$id` (URN) + `version` + the migration-chain registry (schema-migrations.ts createRegistry/resolve/runMigrations).
- Validation surfaces: `loadConfig` AJV (config.schema.json), `validateSchemaAgainstMeta` (draft-07), `validateProject` (referential integrity, FGAP-086 endpoint-kind).
- Discovery: `samplesCatalog()` (samples-catalog.ts) — enriched per-kind packaged view.
- 3-tier template search (pi-workflows template.ts): project `.pi/templates/` > user `~/.pi/agent/templates/` > package — tier-1 is project-local.

## Gaps to build
1. **Install-source abstraction.** `installProject` (index.ts:355) AND `samplesCatalog` (samples-catalog.ts SAMPLES_DIR) both hardcode `path.resolve(import.meta.dirname,"..",…)`. Need a `bundleSource?` param resolving a local path / npm package / git checkout, with source paths relative to it.
2. **Pre-install validation.** Install currently `fs.copyFileSync`s with ZERO validation; malformed/incoherent conceptions only surface post-install via `validateProject`. Need `validateConception(bundleDir)`: manifest well-formed (a conception-manifest schema) + every bundled schema meta-valid + invariants cite registered relation_types + relation_type source/target_kinds name real block_kinds — run BEFORE copy.
3. **Provenance + versioning + update path.** Record installed conceptions (author/url/version/timestamp) — candidate `config.installed_conceptions[]` or in the bootstrap pointer. No update/upgrade command exists. Plugin schemas with custom `$id` (e.g. `my-plugin://schemas/x`) must be registered with AJV at install or `$ref` won't resolve (currently only framework URNs pre-register, schema-validator.ts).
4. **Plugin migration discovery.** Migration machinery is framework-internal; a plugin must ship its migration chain (migrations.json? inline?) and the validator must discover it at load. Currently no shipped migrations exist.
5. **Conception manifest is incomplete for portability.** `conception.json` carries no macros, hierarchy[], or naming{} — a full portable model needs these (macros especially).

## The hard problem — cross-package data/rendering split (resolved cheaply)
Data model (schemas/config/blocks/relations/invariants/lenses) lives in **pi-context**; per-block-kind rendering **macros** live in **pi-workflows** (`templates/shared/macros.md`, keyed by canonical_id; per-item in `templates/items/<kind>.md`). A complete context model spans both packages.

The two Explore passes diverged:
- Pass 1 framed it as needing a major pi-workflows refactor (decouple template resolution from hardcoded paths).
- Pass 2 found the cheaper resolution: the **3-tier template search already reads project `.pi/templates/` (tier 1)**, so the install ceremony can **extract a bundle's macros into `.pi/templates/items/<kind>.md`** and they're discovered with NO pi-workflows change, provided macro names follow the `render_<canonical_id>` / per-item convention.

→ Recommended: ship macros inside the bundle; install extracts them to the project template dir. The conception manifest gains a `macros`/template-path field so macro delivery is registered + validatable rather than implicit. (Macro-discovery-as-data is the only pi-workflows-side touch, and it's additive.)

## Canon gap → needs a new decision
The substrate does NOT cover external conceptions. DEC-0037 (samples ARE the packaged conception) + DEC-0038 (onboarding from the samples catalog, accept-all | step-through) + DEC-0039 are **internal-samples-only**. The onboarding *mechanism* (registry-amendment surfaces) is source-agnostic, so external sources ADD to the model rather than replacing it — but multi-source onboarding + external acquisition + provenance + conflict resolution (a bundle redefining an existing kind) require a **new enacted decision** (DEC-0041 candidate, user-enacted). FGAP-068's annotation explicitly deferred bespoke-kind authoring; external import is a sibling deferral, untracked until now.

## Distribution channel
npm package primary (semver + dependency-on-pi-context-version + existing @davidorex tooling); git repo secondary (no publish bottleneck for community authors); a curated `conception-catalog.json` discovery list (opt-in, higher trust, avoids fragmentation). NOT MCP (project hard-no).

## Suggested decomposition (if pursued)
- Sub-feature A: install-source abstraction (`installProject` + `samplesCatalog` accept `bundleSource`).
- Sub-feature B: `validateConception(bundleDir)` pre-install gate.
- Sub-feature C: macro-in-bundle + extract-on-install into `.pi/templates/` + manifest macro field.
- Sub-feature D: provenance/version tracking (`installed_conceptions[]`) + update/migrate path + AJV registration of plugin schemas.
- Sub-feature E: distribution channel + curated catalog + a new DEC for multi-source onboarding/provenance/conflict.
