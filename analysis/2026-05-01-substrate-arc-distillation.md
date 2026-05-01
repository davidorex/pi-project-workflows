# Substrate-arc distillation

Date: 2026-05-01
Status: distillation. Single-file artifact preserving what proved valid independent of the methodology that produced an aborted substrate-authoring arc on this worktree.

## What this file is

A 2026-05-01 substrate-authoring arc on worktree `affectionate-margulis-11d284` produced ~30 hand-authored documents (decomposition + Q-exploration reports + roadmap + validator + adversarial audit + fix plans) that an adversarial audit revealed to carry cascading drift. The full arc was reset to commit `04907f3` per user instruction; all arc artifacts were discarded.

This file preserves what survived the discard:

- **Tier A** — codebase facts surfaced during the arc that exist independent of the arc itself. Real gaps awaiting reification when the canonical block-write surface unblocks.
- **Tier B** — methodology meta-findings about how to do substrate-authoring work in this project without re-triggering the cascade.
- **Tier D** — Q-exploration research evidence: agent-produced findings that survive the methodology-tainted briefs that produced them, retained with explicit caveat.

The arc's hand-authored decomposition, primitive-surface design, roadmap structure, validator implementation, audit findings, and fix plans were judged cascade-tainted (Tier C) and are not preserved here. They live only in the session conversation transcript queryable via `claude-history`.

## What this file is not

- Not a roadmap. Roadmap construction requires the extraction-first methodology described in Tier B before being attempted again.
- Not a primitive-surface design. The six-primitive surface from the prior arc is not reproduced; specific dependency relationships there were judged unreliable.
- Not a decision record. No ADR-style decisions were enacted from the arc.

---

## Tier A — Codebase facts and framework gaps

Each entry follows the shape of the existing `analysis/2026-04-25-pi-bypass-arc-fragilities.md` holding-place catalog. Proposed F-NNN numbers continue from F-018 in the existing catalog; these would land at canonical F-019 through F-025 when reified.

### F-019 — `biome.json` `$schema` URL pin and biome devDependency drift independently

- **Target block:** framework-gaps.json (priority `P3`, root-tooling scope)
- **Surfaced:** 2026-05-01 pre-commit hook output: `npm run check` printed biome info-level message `The configuration schema version does not match the CLI version 2.4.13. Expected: 2.4.13 Found: 2.4.9` because `biome.json` declared `$schema: https://biomejs.dev/schemas/2.4.9/schema.json` while root `package.json` devDependency pin resolved biome to `2.4.13`.
- **Symptom:** every commit prints schema-version mismatch info; becomes ambient noise that masks future real biome warnings; drift recurs on next biome upgrade unless preventive coupling is introduced.
- **Impact:** structural — the two pins have no synchronization mechanism. Every biome version bump requires a parallel manual edit (or remembered `biome migrate` run) on `biome.json`. Omission is silent (info-level not error-level).
- **One-time mitigation:** `npx @biomejs/biome migrate --write` aligns the URL. Was performed on this worktree during the aborted arc and reverted with the arc reset.
- **Candidate paths:**
  - **Preventive (mandate-004 favored):** extend `scripts/bump-versions.js` (or sibling `scripts/sync-tooling-pins.js`) to read the biome devDependency version after any `package.json` write and rewrite the `$schema` URL in `biome.json` to match. Single source of truth.
  - **Detective:** extend pre-commit hook (Husky) to assert the schema URL matches the installed biome version, fail commit on drift.
  - **Generalization (mandate-007 finding):** the same drift-pattern likely applies to any other tool that pins both a runtime version and a schema/config URL. Single sync script could close the class.
- **Decision shape needed:** preventive vs detective; generalization scope.

### F-020 — D3 (project-tier shadows bundled) is half-implemented across three packages

- **Target block:** framework-gaps.json (priority `P2`, packages `pi-jit-agents` + `pi-workflows` + `pi-behavior-monitors`)
- **Surfaced:** Q1-exploration agent on 2026-05-01 (cross-package grep + filesystem inspection).
- **Symptom:** `pi-jit-agents/src/template.ts` reads templates from `.project/templates/` while `pi-workflows/src/` template lookup paths and `pi-behavior-monitors/index.ts` template lookup paths still read from `.pi/templates/`. The intended D3 migration to project-tier-shadows-bundled was started but not completed.
- **Impact:** future template-customization work depends on which package the consumer is in. Any new tier-resolution primitive (the Q1-recommended `resolveTier` shape, hypothetical) cannot consolidate without first aligning the three consumers.
- **Candidate paths:**
  - Align all three consumers to the canonical project-tier path; same PR drops `~/.pi/agent/templates/` consumer references if F-022 disposition collapses macros to two-tier
  - Document the divergence + accept as permanent
- **Decision shape needed:** complete migration vs accept divergence.

### F-021 — Monitor-finding writes bypass `block-api.ts`

- **Target block:** framework-gaps.json (priority `P2`, package `pi-behavior-monitors`)
- **Surfaced:** Q3-exploration agent on 2026-05-01 (read of `packages/pi-behavior-monitors/index.ts` write paths cross-referenced against `packages/pi-project/src/block-api.ts` write surface).
- **Symptom:** monitor classify writes monitor findings via a path that does not route through `writeBlock` / `appendToBlock` / `updateItemInBlock`. Any future `_meta` stamping primitive at the block-api boundary cannot enforce on monitor writes.
- **Impact:** authorship attestation, schema validation, atomic-write guarantees that block-api enforces are absent for monitor findings. Parallel ungated path to write surface (per `feedback_no_parallel_ungated_paths.md`).
- **Candidate paths:**
  - Route monitor-finding writes through block-api (scope extension)
  - Build separate stamping primitive for monitor writes (qualified contract)
- **Decision shape needed:** routing vs separate stamping.

### F-022 — `~/.pi/agent/templates/` directory is theoretical capability with zero current consumers

- **Target block:** framework-gaps.json (priority `P3`, scope: cross-package convention)
- **Surfaced:** Q1-exploration agent on 2026-05-01 (filesystem inspection of `~/.pi/agent/templates/` + grep across pi-mono web search for skills/prompts conventions).
- **Symptom:** the three-tier macro convention (`.pi/templates/`, `~/.pi/agent/templates/`, package-bundled) has no active consumer for the user-tier middle layer. `~/.pi/agent/templates/` does not exist on this machine; pi-mono's canonical convention for skills/prompts is two-tier without bundled fallback.
- **Impact:** code maintaining three-tier resolution carries unused complexity. Future tier-resolution primitive must decide whether to preserve the empty middle tier.
- **Candidate paths:**
  - Collapse to two-tier (project + bundled); drop `~/.pi/agent/templates/` references
  - Preserve three tiers as documented future capability
- **Decision shape needed:** collapse vs preserve.

### F-023 — `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` Document 3 audit-gap canonicality

- **Target block:** framework-gaps.json (priority `P2`, scope: analysis-corpus integrity)
- **Surfaced:** Plan-C fix-plan agent on 2026-05-01 during analysis of cited-file numbering inconsistencies.
- **Symptom:** the synthesis Document 3 (which lives at HEAD `04907f3`) enumerates six audit gaps including "Authorship attestation" and "Schema versioning." Any future framework-gaps.json registry that drops or substitutes these without explicit decision risks silent divergence from the synthesis canonical numbering. Adjacent: synthesis Document 2 (research-blocks-design) specifies FGAP-007 staleness engine which is also not yet registered.
- **Impact:** when the canonical write surface is unblocked and framework-gaps.json is populated, the synthesis Documents 2 and 3 must be the authoritative source for initial gap enumeration. Author-time freedom to silently substitute would lose the synthesis traceability.
- **Candidate paths:**
  - Bind framework-gaps.json schema to require `Synthesis-source:` cross-reference per gap
  - Document the source-mapping informally
- **Decision shape needed:** schema enforcement vs convention.

### F-024 — JSON Schema draft-07 precludes `$vocabulary` declaration

- **Target block:** framework-gaps.json (priority `P3`, scope: schema-tooling foundation)
- **Surfaced:** Q4-exploration agent on 2026-05-01 (JSON Schema community-convention web research).
- **Symptom:** all bundled `.schema.json` files use draft-07. Custom keyword extensions (the existing `x-lifecycle` precedent in `.project/schemas/` is unprefixed) are informal. JSON Schema 2020-12's formal `$vocabulary` mechanism for declaring custom keyword sets is unavailable on draft-07.
- **Impact:** any future `x-` keyword extensions (topology declaration, prompt-budget metadata, transition validation) ship as informal convention with no formal vocabulary support unless schemas migrate to 2020-12. Migration cost: AJV upgrade + every schema touched.
- **Candidate paths:**
  - Stay on draft-07 indefinitely; accept informal `x-` extensions forever
  - Schedule 2020-12 migration as separate work track
  - Decide vendor-prefix convention for `x-` keywords in the meantime (`x-pi-*` vs unprefixed, given `x-lifecycle` is unprefixed)
- **Decision shape needed:** stay vs migrate; vendor-prefix convention.

### F-025 — Agent runtime keeps foreground-completed agents resumable; no `ListTasks` primitive in tool surface

- **Target block:** issues.json (category `tooling`, priority `low`, scope: harness)
- **Surfaced:** 2026-05-01 user reported a "locate pi-mono installation" bash task running after agent-dispatch wave completed.
- **Symptom:** agents dispatched without `run_in_background: true` (i.e., foreground) still keep a continuation handle alive in the runtime tracker after returning their result. Each agent's task_id remains valid for `SendMessage` until explicitly stopped via `TaskStop`. There is no list-tasks tool to enumerate active continuations, so an orchestrator cannot autonomously clean up orphaned background work.
- **Impact:** "foreground" in agent dispatch model does not mean "terminates on completion." `feedback_no_background_subagents.md` may need refinement to cover this case explicitly. Without `ListTasks`, `TaskStop` requires the user to provide task_id from UI — asymmetric tooling.
- **Candidate paths:**
  - Add `ListTasks` to the tool surface (harness-level change)
  - Document the resumability behavior + provide explicit guidance to call TaskStop on every agent dispatch
- **Decision shape needed:** harness change vs convention; not in this project's scope but worth surfacing upstream.

---

## Tier B — Methodology meta-findings

Durable insights about HOW to do substrate-authoring work in this project. Generic across any future arc.

### B-1 — The cascade's three originating root causes (R1, R2, R3)

A 2026-05-01 substrate-authoring arc produced cascading findings (adversarial audit found 10; fix plans surfaced 5+ new framework gaps; scope expansions revealed 15 truncated citations vs 2 audit-estimated). Cascade analysis identified three originating root causes:

- **R1 — Hand-authored citations with no mechanical extraction.** The arc's primary substrate-authoring artifact (a roadmap) was authored by reading source files and transcribing dispositions into a tracker. Completeness was bounded by the author's working-memory recall across ~12 cited files. The validator built afterward as a safety net checked only what its hand-authored patterns reflected — same bounded recall.
- **R2 — Citation syntax doesn't escape its own delimiter.** Citation syntax `` `<file>` § `<section>` — <claim> `` used backticks as section delimiters but allowed backticks INSIDE section text (real headings contained code symbols like `` `block-api.ts` `` or `` `$vocabulary` ``). Every cited section containing a backtick became a truncation hazard at hand-author time and parse-ambiguity at validator-read time. Empirical scope: 15 truncated citations across 6 files on a single roadmap.
- **R3 — Pre-existing analysis-file silent drift.** Pre-existing files in `analysis/` had drift between them that was not caught by any validator (because no validator was looking). Substrate-authoring artifacts inheriting these citations propagate the drift downstream.

### B-2 — F-010 anticipated this exact bootstrapping fragility

The pre-existing fragilities catalog entry F-010 (in `analysis/2026-04-25-pi-bypass-arc-fragilities.md`) titled "Project's own write-surface bootstrapping is fragile within the framework being built" structurally describes the cascade. Quoted insight: the substrate-authoring framework being built is the framework that, once built, would prevent the kind of failures observed building it. Recursive condition. F-010 should be treated as a meta-mandate that constrains how new substrate-authoring work is conducted.

### B-3 — Extraction-first methodology pattern

For any future substrate-authoring work that reauthors the discarded arc's intent:

- **Phase 0** — Pre-existing-file drift reconciliation. Audit existing analysis corpus for inter-file drift (synthesis Documents vs any registry, stale phrasings propagated across multiple files). Catalog drift as Tier-A-shape findings.
- **Phase 1** — Build extraction tooling FIRST. A script that walks every file in `analysis/`, extracts findings by per-file ID-pattern conventions declared in YAML frontmatter, emits a structured manifest (JSON sidecar) the substrate artifacts CONSUME. Single source of truth for findings.
- **Phase 2** — Design citation syntax with escapability BEFORE writing citations. Heading-anchor slugs (kebab-case heading-derived IDs) or escape sequences for backtick-delimited section text. Document the choice + provide a converter from literal headings.
- **Phase 3** — Re-dispatch evidence-gathering agents (Q-exploration equivalents) with extraction-aware briefs that emit findings in the canonical extraction format and register their finding-ID-pattern in their report frontmatter.
- **Phase 4** — Generate substrate-authoring artifacts from the extraction manifest. Roadmap dispositions tracker is rendered, not authored. Citations use Phase 2 syntax. Cross-cutting findings computed from the manifest's cross-reference graph.
- **Phase 5** — Validator becomes regression check that manifest is in sync with source files; generated artifacts match manifest; no manual edit drifted from generation. Wire into `npm run check`.
- **Phase 6** — Adversarial audit on generated artifact (per `feedback_adversarial_audits_not_self_audits.md`).

The Phase 1 extractor + Phase 5 validator are reusable substrates for any future substrate-authoring work in this project.

### B-4 — Adversarial audit + fix-plan dispatch cost data

Empirical observation from the aborted arc: an adversarial audit + 4 fix-plan dispatches together produced ~30+ identified-fix items but each fix-plan dispatch surfaced its own new framework gaps (~5 new gaps across the 4 plans). Cycle is recursive without methodology reform — patching the surface findings does not stop the cascade because R1/R2/R3 keep producing new ones.

Reinforces `feedback_adversarial_audits_not_self_audits.md` with cost data: in this arc, audit + fix-plan cycle would have iterated indefinitely; the only break-condition was the methodology change to extraction-first.

---

## Tier D — Q-exploration research evidence

Six agent-produced research reports were generated during the aborted arc. The reports themselves were judged cascade-tainted (R1 methodology) and discarded. The FINDINGS from those agents — empirical observations about the codebase + literature surveys — are independent of brief quality and are preserved here as research evidence.

### Caveat

These findings were produced via cascade-tainted methodology. They should be re-verified before being treated as authoritative for any new substrate-authoring work. They are preserved to avoid re-running ~15 minutes of agent compute and to retain the literature-survey citations for future reference. Each is summary-level; full agent reports were discarded.

### Q1 — Macro tier model

- **Recommendation:** collapse to two-tier (project + bundled).
- **Empirical basis:** filesystem inspection — `~/.pi/agent/templates/` does not exist on this machine. Cross-package grep — pi-jit-agents reads `.project/templates/` while pi-workflows + pi-behavior-monitors read `.pi/templates/` (already F-020 above). pi-mono web search — canonical convention for skills/prompts is two-tier without user-customization tier.

### Q3 — `authored_by` source

- **Recommendation:** plumb `WriteContext` parameter through `writeBlock` / `appendToBlock` / `updateItemInBlock` rather than infer caller identity at the write site.
- **Empirical basis:** code-read of `block-api.ts` (current write surface accepts only cwd + payload — no identity field). Code-read of `pi-jit-agents/src/jit-runtime.ts` `executeAgent` and `DispatchContext` (already carries `monitorName`/spec.name/model but does not flow to block-api). Empirical pi subprocess test (`packages/pi-workflows/src/dispatch.ts:162` preserves `env: process.env` unmodified — no caller-identity CLI flag). Inference candidates (stack walk, env sniff, ExtensionContext heuristic) all return coarser identity than the call site already knows; mis-attribution is the failure mode; mandate-004 forecloses inference.

### Q4 — `target` topology declaration

- **Recommendation:** explicit `x-`-prefixed keyword on schema root (specific name pending vendor-prefix convention disposition per F-024).
- **Empirical basis:** worktree grep — exactly one existing `x-` precedent (`x-lifecycle` unprefixed in 6 `.project/schemas/*.json` files; no code reads it yet). Code-read of `packages/pi-project/src/schema-validator.ts:9` confirms AJV is configured `strict: false` → unknown root keywords compile and validate cleanly today, zero validator change needed for new `x-` keywords. JSON Schema community canonical pattern (OpenAPI 3.x, Vega/Vega-Lite, AsyncAPI) is `x-`-prefix vendor extension. Prior art (Prisma, GraphQL SDL, Avro) uniformly declares topology via explicit schema-local keyword; none infer; none use external registries.

### Q6 — Form-supported schema feature subset

- **Recommendation:** `@mariozechner/pi-tui` for any TUI form library (already a v0.70.2 dependency in pi-workflows + pi-behavior-monitors per package.json inspection).
- **Empirical basis:** enumeration of 57 bundled `*.schema.json` files; per-schema feature footprint computed; AJV draft-07 union feature set across all bundled schemas is 19 keywords; never-used keywords across all bundled schemas: `not`, `else`, `propertyNames`, `patternProperties`, `dependencies`, length/numeric bounds, `uniqueItems`, `multipleOf`. Six schemas exceed a TUI-form-friendly core: `decisions` (`allOf`+`anyOf`), `audit` × 2 (`allOf`+`if/then`), `tasks` × 2 (`if/then`), `state` (`oneOf` string-or-object). Two framework-internal validator schemas (`agent-trace`, both `verdict.schema.json` files) use `oneOf`/`allOf`/`if/then` but are not user-authored and out-of-scope for form rendering.
- **Migration shape proposal:** two extension keywords `x-required-when` and `x-cross-field-required-any` could replace structural `oneOf`/`anyOf`/`if/then` with form-side validators. Inherits F-024 vendor-prefix convention disposition.
- **Library comparison data:** `@mariozechner/pi-tui` already a dep; `enquirer.Form` adds new dependency without covering nested objects/arrays; `ink-form` 959 weekly downloads, no nested/array support.

### Q7 — Cross-reference dispatcher factoring

- **Recommendation:** three separate primitives, none built into a hypothetical `formFromSchema`.
- **Empirical basis:** code survey identified three distinct shapes conflated under "block reference resolution":
  - `block:<name>` schema-URI transform — duplicated in `packages/pi-workflows/src/step-shared.ts:54-62` and `packages/pi-jit-agents/src/compile.ts:40-47`, no other consumers
  - `readBlock(cwd, name, filter?)` data I/O — already extracted as canonical primitive in `packages/pi-project/src/block-api.ts:50-80` with 21 call sites across all packages
  - Item-ID cross-reference validation — concentrated in `validateProject` (`packages/pi-project/src/project-sdk.ts:540-786`) as ~70 lines of `Set<string>`-builder boilerplate
- **Implication:** no single `resolveBlockReference(ref)` signature subsumes all three. Mandate-004 demands separate primitives because multiple consumers exist for each.

### Q9 — Migration field operations DSL

- **Recommendation:** split `transform` into named operation arrays (`add`, `rename`, `remove`, `changeType`); per-value-review for type-change delegates to TUI via `onUnmapped: "review"` channel.
- **Empirical basis:** survey of 13 declarative + imperative migration libraries (Liquibase YAML/JSON, json-migrator, evolve, code-migrate, Alembic, Prisma, Sequelize, Knex, node-pg-migrate, db-migrate, json-migrate variants). Cross-library consensus: four-verb decomposition is canonical. Defaults split cleanly into literal vs computed channels (Liquibase's `defaultValue` vs `defaultValueComputed`). Rename carry-data is implicit via the verb. Remove is universally drop-only with no archive precedent — `mode: "archive"` would be opinionated extension beyond upstream.
- **Critical finding:** per-value-review for type-change is **not declaratively expressible in any surveyed library**. All 13 reduce to default-with-fallback or imperative escape. Resolution requires TUI delegation.
- **Pi-mono precedent:** none — config migrations are imperative startup code.

---

## Reification plan when block-write surface is restored

Each Tier-A entry above should land in its target block via the F-006-mitigation pattern:

```
pi -p "call the append-block-item tool with name issues and key issues and item {...}" --mode json --tools read --no-skills --model openrouter/anthropic/claude-haiku-4.5
```

For framework-gaps targets (F-019, F-020, F-021, F-022, F-023, F-024), use `name framework-gaps key gaps`. F-025 targets `issues.json`. Each entry will need an `id` field — assigned at reification time to maintain canonical numbering with F-001..F-018 in the existing catalog.

Tier B meta-findings remain in this distillation file rather than being reified to a `.project/` block — they are methodology, not framework gaps. Future substrate-authoring work cites this file's Tier B section as the canonical reference for the cascade-avoidance methodology.

Tier D research evidence remains in this file as research notes; if the recommendations are adopted in future substrate-authoring work, that work should cite the recommendation here as provenance and re-verify the empirical basis under extraction-first methodology before committing to any specific design.

---

## Sources

- Aborted substrate-authoring arc on worktree `affectionate-margulis-11d284` between commits `04907f3` and reset state, 2026-05-01. Five commits authored and discarded: substrate decomposition, biome `$schema` alignment, Q-exploration evidence, roadmap, validator. Reset to `04907f3` per user instruction.
- Q-exploration agent reports (now discarded; preserved in summary form here).
- Adversarial audit report (now discarded; aggregated findings preserved in B-3 + B-4).
- Four fix-plan agent reports (now discarded; aggregated findings inform B-3).
- Pre-existing fragilities catalog: `analysis/2026-04-25-pi-bypass-arc-fragilities.md` (existing F-001..F-018; F-019 entry from arc reverted with reset).
- Pre-existing synthesis at HEAD: `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` (the substrate the arc attempted to operationalize; remains the authoritative on-disk substrate).
