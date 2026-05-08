# Plan A — Fix-Forward (steel-manned defense)

## 1. Position statement

The substrate-arc envelope (commits `8059764` → `5f852b1`) is structurally correct in 90%+ of its surface and locally fixable in the remainder. Per `2026-05-07-per-file-disposition-synthesis.md`, ~30 files KEEP, ~14 REFACTOR-IN-PLACE, ~6 RE-DERIVE — meaning the typed-substrate skeleton (substrate SDK port, /project install, PROJECT_DIR retrofit, lens-view consumption surface, closure-table relations, AJV-at-every-write) is exactly what pi-context targets. Fix-forward closes the eighteen technical missteps as ordinary refactor work behind a single load-bearing prerequisite — FGAP-006 (schema versioning + `$id` + `$ref` composition) — and inherits the live `.project/` substrate (twelve typed blocks with hundreds of items, validated relations, cycle-checked lens views) without re-derivation. Revert-to-`3a7856c` discards working code that took multiple coordinated subagent runs to land and recreates the same path under a different package name.

## 2. Concrete code-change roadmap

The roadmap is sequenced by dependency. FGAP-006 unblocks #4/#5 (priority + status enum closure via `$ref`); #1/#2/#5 close together as a config-driven vocabulary substrate; #6 (pi-project → pi-context rename) is a name-only refactor that follows; #9–#11 are smaller targeted fixes parallelizable with the rest.

### 2.1 FGAP-006 closure (load-bearing prerequisite)

Goal: every schema gets `$id` + `version` + becomes composable via `$ref`. Without this, #4/#5 cannot land cleanly because shared enums have no canonical fragment to reference.

**Sub-step 6.1 — Add framework-contract shared fragments.**
New files:
- `packages/pi-project/schemas/priority.schema.json` — exports `{ "$id": "https://davidorex.dev/pi-project/priority/v1", "type": "string", "oneOf": [{ "$ref": "#/$defs/buckets" }] }` resolved at validate-time against `config.priority_buckets[].canonical_id`
- `packages/pi-project/schemas/status.schema.json` — same shape, resolves against `config.status_buckets[].canonical_id`
- `packages/pi-project/schemas/severity.schema.json`, `verification-method.schema.json`, `source.schema.json`, `layer.schema.json` — one fragment per FGAP-016-enumerated dimension
- `packages/pi-project/schemas/authorship.schema.json` — `{ created_by, created_at, modified_by, modified_at }` for FGAP-004 (#13)

These ship at `packages/pi-project/schemas/` (alongside existing `config.schema.json` + `relations.schema.json`), per the framework-contract location pattern (DEC-0011: not in `registry/`, reach users via the install mechanism).

**Sub-step 6.2 — Stamp every existing schema with `$id` + `version`.**
Mechanical edit across `packages/pi-project/registry/schemas/*.schema.json` (15 files) and `.project/schemas/*.schema.json` (parallel set, plus `framework-gaps.schema.json` which exists only on the project side — itself a registry-asymmetry data point per misstep #11):

```diff
 {
   "$schema": "http://json-schema.org/draft-07/schema#",
+  "$id": "https://davidorex.dev/pi-project/issues/v1",
+  "version": "1.0.0",
   "title": "Issues",
```

Same diff applied 30 times. One subagent run.

**Sub-step 6.3 — Extend `schema-validator.ts` to resolve `$ref` against shared fragments.**
File: `packages/pi-project/src/schema-validator.ts`. AJV already supports `$ref`; the change is registering shared fragments at validator construction time:

```diff
-export function getValidator(schema: object) {
-  return ajv.compile(schema);
+export function getValidator(schema: object, cwd?: string) {
+  if (cwd && !ajv.getSchema("https://davidorex.dev/pi-project/priority/v1")) {
+    ajv.addSchema(loadSharedFragment(cwd, "priority"));
+    ajv.addSchema(loadSharedFragment(cwd, "status"));
+    // ... one addSchema per fragment
+  }
+  return ajv.compile(schema);
 }
```

`loadSharedFragment(cwd, name)` resolves via the existing three-tier path: `<cwd>/.project/schemas/${name}.schema.json` → `~/.pi/schemas/${name}.schema.json` → `packages/pi-project/schemas/${name}.schema.json`. The cache discipline lives in the existing AJV instance (issue-069 closure already in place per memory).

**Sub-step 6.4 — Schema migration registry.**
New file: `packages/pi-project/src/schema-migrations.ts`:

```ts
export type Migration = (block: unknown) => unknown;
export const MIGRATIONS: Record<string, Record<string, Migration>> = {
  // "$id" → { "fromVersion → toVersion": migrationFn }
  "https://davidorex.dev/pi-project/issues/v1": {},
};
export function migrateBlock(blockData: unknown, schema: { $id?: string; version?: string }): unknown { /* dispatch */ }
```

Empty registry on landing; adds entries as schemas evolve. `block-api.ts:51 readBlock` calls `migrateBlock` after read, before AJV-validate. One subagent run.

### 2.2 One-fragment-cluster refactor as POC — priority closure across `issues` + `framework-gaps`

This is the proof-of-concept refactor that demonstrates #4 + #5 + #12 closing together. Picked because issues + framework-gaps have the most painful enum mismatch (low/medium/high/critical vs P0–P3) and the divergence is currently breaking every cross-block priority rollup.

**Step P1 — Add priority registry to config schema.**
File: `packages/pi-project/schemas/config.schema.json`. Insert after `lenses[]` (currently at line ~37):

```diff
+    "priority_buckets": {
+      "type": "array",
+      "description": "Canonical priority registry. canonical_id opaque + immutable; display_name mutable per project. Schemas $ref this registry rather than embed enums.",
+      "items": {
+        "type": "object",
+        "required": ["canonical_id", "display_name", "ordinal"],
+        "properties": {
+          "canonical_id": { "type": "string" },
+          "display_name": { "type": "string" },
+          "ordinal": { "type": "integer" }
+        }
+      }
+    }
```

**Step P2 — Extend `ConfigBlock` interface.**
File: `packages/pi-project/src/project-context.ts:32`:

```diff
 export interface ConfigBlock {
   schema_version: string;
   root: string;
   naming?: Record<string, string>;
   hierarchy?: HierarchyDecl[];
   lenses: LensSpec[];
   installed_schemas?: string[];
   installed_blocks?: string[];
+  priority_buckets?: PriorityBucket[];
+  status_buckets?: StatusBucket[];
 }
+export interface PriorityBucket {
+  canonical_id: string;
+  display_name: string;
+  ordinal: number;
+}
+export interface StatusBucket { canonical_id: string; display_name: string; bucket: "active" | "completed" | "blocked" | "unknown"; }
```

**Step P3 — Modify `priority.schema.json` to reflect against config.**
The `$ref` cannot literally point to a config field; AJV needs an enum at compile time. Resolution: validator-side custom keyword `x-config-registry` consumed by `schema-validator.ts:47`:

```ts
ajv.addKeyword({
  keyword: "x-config-registry",
  validate: function(schemaVal: { field: string }, data: unknown, _parentSchema: any, ctx: any) {
    const cfg = (this as any).cfg as ConfigBlock;
    const allowed = (cfg as any)[schemaVal.field]?.map((b: any) => b.canonical_id) ?? [];
    return allowed.includes(data);
  },
});
```

Then `priority.schema.json` becomes `{ "$id": "...", "type": "string", "x-config-registry": { "field": "priority_buckets" } }`.

**Step P4 — Replace embedded enums with `$ref`.**
File: `packages/pi-project/registry/schemas/issues.schema.json:21`:
```diff
-  "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
+  "priority": { "$ref": "https://davidorex.dev/pi-project/priority/v1" },
```

Same diff in `.project/schemas/issues.schema.json:25`, `.project/schemas/framework-gaps.schema.json:21`. The two divergent vocabularies converge at the config layer — projects pick one canonical priority registry, render-time aliasing handles per-block display.

**Step P5 — Data migration.**
One-shot script `scripts/migrate-priority-2026-05.mjs`: reads each block file, maps `low→P3 / medium→P2 / high→P1 / critical→P0` (or the reverse, project's choice; the canonical mapping lives in the project's seed `config.json`). Writes via `appendToBlock` / `writeBlock` from `block-api.ts:88` so AJV catches mismatches. Manual review of three or four edge items where mapping is ambiguous.

Estimated total for the POC cluster: 2 subagent runs (one for code, one for migration + tests).

### 2.3 Cascade through dependent missteps

Once FGAP-006 ($id + $ref + version + custom keyword) lands (§2.1) and the priority POC validates the pattern (§2.2), the following missteps unlock as mechanical refactors:

**#1 `ID_PREFIX_TO_BLOCK` hardcoded** (`project-sdk.ts:580`).
Cascade: extend `ConfigBlock.block_kinds[]` per §1's vocabulary registry pattern (parallel to `priority_buckets`), each carrying `canonical_id` + `display_name` + `prefix` + `schema_path` + `array_key`. Replace lines 580–592 with a function:

```diff
-const ID_PREFIX_TO_BLOCK: Record<string, string> = {
-  "DEC-": "decisions",
-  "FGAP-": "framework-gaps",
-  ... 11 entries ...
-};
+function idPrefixMap(cfg: ConfigBlock): Array<{ prefix: string; block: string }> {
+  return (cfg.block_kinds ?? []).map(k => ({ prefix: k.prefix, block: k.canonical_id }));
+}
```

`expectedBlockForId` (line 599) gains `cfg: ConfigBlock` parameter and applies #10 (longest-prefix-match) by sorting `idPrefixMap(cfg)` descending by `prefix.length` before iteration. `buildIdIndex` (line 626) reads cfg via `getProjectContext(cwd).config`. This closes #1 + #10 in one edit and structurally prevents issue-089 (PLAN- collision becomes a registration-time conflict at config load, not a runtime audit finding).

**#2 `STATUS_VOCABULARY` hardcoded** (`roadmap-plan.ts:55`).
Cascade: replace the const literal with `loadConfig(cwd).status_buckets` lookup. Every consumer at lines 115, 1080, 1155, 1194 currently does `STATUS_VOCABULARY[status]`; signature change is `rollupPhaseStatus(items: ItemRecord[])` → `rollupPhaseStatus(items: ItemRecord[], cfg: ConfigBlock)`. Mechanical edit; tests (`roadmap-plan.test.ts`) gain a config fixture. One subagent run.

**#3 Validation-code names as TS string literals** (`roadmap-plan.ts:457` `validateRoadmaps`).
Cascade: codes stay opaque slugs (`roadmap_lens_missing`, `phase_cycle_detected`, …); `config.display_strings` provides per-project labels; `lens-view.ts` rendering layer at `lens-view.ts:1+` resolves slug→label at format time. No code change to validateRoadmaps; addition of a `displayLabel(code, cfg)` helper consumed by `index.ts` tool registrations.

**#4 + #5 Priority + general enum mismatch** — closed by §2.2 pattern applied to severity, verification-method, source, layer dimensions. Each is one schema fragment + one config registry + N enum→`$ref` edits. Six dimensions × ~3 schemas each = ~18 mechanical diffs. Two subagent runs.

**#6 PM-shape baked into pi-project namespace** (`roadmap-plan.ts` + `validateProject` + `roadmap_*` codes).
Cascade: pi-project → pi-context **rename only**, no structural rewrite. Per `2026-05-05-pi-context-executive-summary-candidate.md` §"What the rename costs", this is package name + peer-dep updates + internal file renames. Steps:
- `packages/pi-project/package.json` `name` field → `@davidorex/pi-context`
- Peer-dep updates in `pi-jit-agents/package.json`, `pi-workflows/package.json`, `pi-behavior-monitors/package.json`, `pi-project-workflows/package.json`
- File renames `project-sdk.ts` → `context-sdk.ts`, `project-context.ts` → `context.ts` (optional cosmetic)
- Subpath export updates per the existing `package.json` `exports` map
- Lockstep version bump via `scripts/bump-versions.js`
The PM-lens module (`roadmap-plan.ts`) stays in the same package — pi-context owns all lenses including PM. One subagent run for the rename + one for downstream consumer fix-up.

**#7 milestone-ordering gated vs independent** — already decided independent per `feedback_no_scope_reduction.md` discipline (matches `validateProject` + `validateProjectRelations` no-gating pattern); requires only a DEC entry. Trivial.

**#8 PLAN- prefix collision** — closes structurally under #1 (config-driven block_kinds[]). No additional work beyond #1.

**#9 Nested-array traversal blind spot** (`buildIdIndex` at `project-sdk.ts:626`).
Cascade: add an opt-in `recursive` parameter. Signature: `buildIdIndex(cwd: string, opts?: { recursive: boolean }): Map<string, ItemLocation>`. When recursive, walks every nested array of objects under each block top-level array, surfacing the 34 TASK-NNN-NN, 9 STORY-, 7 PHASE-N nested ids currently invisible. Default off to preserve existing behavior; consumers opt in per call site. Half a subagent run.

**#10 First-match-wins `startsWith` ordering hazard** — folded into #1's `idPrefixMap` sort.

**#11 Registry vs `.project/` schemas asymmetry** — port id patterns from project-side schemas to registry-side via mechanical diff:
```diff
 "id": { "type": "string" }
+"id": { "type": "string", "pattern": "^FGAP-\\d{3}$" }
```
Eleven schemas × one field each. One subagent run. (Note: `framework-gaps.schema.json` exists only on the project side and must be added to registry — itself a finding from this work.)

**#13 Authorship attestation** (FGAP-004).
File: `packages/pi-project/src/block-api.ts`. Extend signatures:
```diff
-export function writeBlock(cwd: string, blockName: string, data: unknown): void {
+export function writeBlock(cwd: string, blockName: string, data: unknown, ctx?: DispatchContext): void {
-export function appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown): void {
+export function appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown, ctx?: DispatchContext): void {
```
`DispatchContext` already exists in `pi-jit-agents/src/types.ts` per the foundational principles; reuse it. Stamp `created_by` / `created_at` on first write, `modified_by` / `modified_at` on subsequent writes. The `authorship.schema.json` fragment from §2.1 composes into every block schema via:
```diff
 "items": {
   "type": "object",
+  "allOf": [{ "$ref": "https://davidorex.dev/pi-project/authorship/v1" }],
   "required": ["id", "title", ...],
```
One subagent run.

**#14 Canonical schema-write surface** (FGAP-011).
File: `packages/pi-project/src/block-api.ts`. New exports:
```ts
export function writeSchema(cwd: string, schemaName: string, schema: object): void;
export function updateSchema(cwd: string, schemaName: string, mutator: (s: object) => object): void;
```
Both AJV-validate against draft-07 meta-schema before writing; both route through the same atomic-write discipline as `writeBlock` (tmp + rename per `block-api.ts:88`). The `framework-gaps.schema.json` registry-side asymmetry from #11 was caused by direct fs Edit; this surface prevents recurrence. Half a subagent run.

**#15 POC B/I shared cache path** (issue-090) — analysis-only artifact, separate `.cache-hashes-r1.json` / `.cache-hashes-r2.json`. Trivial.

**#16 Direct fs writes by monitors** (issue-065).
File: `packages/pi-behavior-monitors/index.ts`. Monitor write-actions currently use `fs.writeFileSync`; replace with `appendToBlock` from `@davidorex/pi-project/block-api`. AJV-validate at write time → malformed monitor entries become rejected payloads, not silently-accepted-then-removed-twice corruption. Half a subagent run.

**#17 Decision lifecycle missing broadened-by state** (FGAP-015).
File: `.project/schemas/decisions.schema.json` — add `extended` to status enum. Update `decisions.json` entries that should have been `extended` not `superseded`. Mechanical. Half a subagent run.

**#18 SKILL.md regen noise** — accept (working as designed).

## 3. Subagent-run estimate per item

| Item | Runs | Notes |
|------|------|-------|
| 6.1–6.4 (FGAP-006 prerequisite) | 2 | Fragments + stamping + validator extension + migration registry skeleton |
| Priority POC cluster (§2.2) | 2 | Code + data migration |
| #1 `ID_PREFIX_TO_BLOCK` derive from config | 1 | `expectedBlockForId` signature change; longest-prefix sort folds in |
| #2 `STATUS_VOCABULARY` from config | 1 | Sig change `rollupPhaseStatus(items, cfg)`; tests updated |
| #3 validation codes opaque | 0.5 | New helper, no consumer surgery |
| #4+#5 Severity + verification-method + source + layer dimensions | 2 | Six dimensions × shared fragments + `$ref` swaps |
| #6 pi-project → pi-context rename | 2 | Package + peer-deps + internal file renames |
| #9 nested-array recursion in `buildIdIndex` | 0.5 | Opt-in flag |
| #10 longest-prefix-match | 0 | Folds into #1 |
| #11 registry/.project schema asymmetry | 1 | Port id patterns + add framework-gaps to registry |
| #13 authorship via DispatchContext | 1 | block-api signature extensions + schema $ref |
| #14 writeSchema/updateSchema | 0.5 | Two new exports + meta-schema validation |
| #16 monitor writes route through block-api | 0.5 | fs.writeFileSync → appendToBlock |
| #17 decision lifecycle 4th enum | 0.5 | Schema + data correction |
| #7, #8, #15, #18 | trivial each | DEC entry / folds into #1 / cosmetic / accept |

**Total: ~14 subagent runs over the entire arc.** Sequenced behind FGAP-006 (2 runs); priority POC (2 runs) gates the broader enum closure. Other items parallelize.

## 4. What survives without rework

Per `2026-05-07-per-file-disposition-synthesis.md` and `MAY 7 REPO MESS CLEANUP OPTION 1.md`:

**KEEP outright (no edits):**
- `packages/pi-jit-agents/src/{agent-spec,compile,template}.ts` — substrate retrofit correct
- `packages/pi-jit-agents/src/jit-runtime.ts` `normalizeToolChoice` boundary helper
- `packages/pi-project/registry/blocks/*` (9 files) — byte-identical
- `packages/pi-project/src/project-context.{ts,test.ts}` (682 lines) — substrate types + `loadConfig` + `loadRelations` + `validateRelations` + `getProjectContext` mtime cache + cycle detection. The load-bearing module of the entire arc.
- `packages/pi-project/src/install-subcommand.test.ts`
- `packages/pi-workflows/src/{index,step-block,step-shared,template-validation,test-helpers,workflow-executor,workflow-sdk}.ts` — PROJECT_DIR retrofit consumer-side, all correct
- `packages/pi-workflows/src/{integration,render-budget-overflow}.test.ts`
- `scripts/generate-skills.js`

**REFACTOR-IN-PLACE (substrate correct, edits land additively):**
- `packages/pi-project/registry/schemas/*` (15 files) — `$id`/`version`/`$ref` additions; embedded enums replaced with `$ref` (per §2.2 pattern). Schema bodies and field structures survive unchanged.
- `packages/pi-project/schemas/{config,relations}.schema.json` — extend with `block_kinds[]` + `priority_buckets[]` + `status_buckets[]` (additive; existing `lenses[]` + `hierarchy[]` untouched)
- `packages/pi-project/src/project-sdk.ts` (1121 lines) — most code survives; surgical edits at lines 580–604 (#1 + #10), at lens-dispatch sites for #6, at `buildIdIndex` (#9). Substrate functions (loadConfig/loadRelations/validateRelations/walkDescendants/edgesForLens) unchanged.
- `packages/pi-project/src/block-api.ts` (503 lines) — additive `ctx?: DispatchContext` parameters (#13), new `writeSchema`/`updateSchema` exports (#14). Existing call sites still type-check (optional parameter).
- `packages/pi-project/src/lens-view.ts` (256 lines) — composition routing reads `lens.kind` from same registry already in use; structurally complete.

**RE-DERIVE (scope-changing rework, but bounded):**
- `packages/pi-project/registry/schemas/{plan,roadmap}.schema.json` — drop embedded `pattern` regex; declare prefix in `config.block_kinds[]` instead.
- `packages/pi-project/src/roadmap-plan.{ts,test.ts}` (1214 lines) — body of `validateRoadmaps` (line 457), `topoSort` (line 151), `rollupPhaseStatus` (line 104) all carry forward as PM-lens; only the constants (`STATUS_VOCABULARY` at line 55, validation-code literals) and signatures gain `cfg: ConfigBlock` parameters. ~80% of code survives.
- `packages/pi-project/src/composition.test.ts` + `substrate-schemas.test.ts` — fixtures change under config-driven kind; algorithm tests unchanged.
- `packages/pi-project/src/index.ts` — partial: `installProject` + `view` + `lens-curate` registrations survive; status-rollup + composition + roadmap tools rewire to read `cfg`.

The `.project/` directory itself — twelve typed blocks, hundreds of items, validated relations.json, lens views, decisions/issues/framework-gaps history — is **untouched data substrate**. Fix-forward edits schemas, code, and config; data migrates only where #4 priority unification touches it.

## 5. Why revert-to-`3a7856c` is inferior

Revert discards working code and obligates re-implementation. Per `MAY 7 REPO MESS CLEANUP OPTION 1.md` enumeration:

**Lost code on revert (~50 files, ~5000+ lines of TS):**
- **Substrate SDK port** (commit `8059764`): `loadConfig`, `loadRelations`, `getProjectContext` with mtime cache, `validateRelations` with DFS recursion-stack cycle detection (the `edge_cycle_detected` diagnostic), `synthesizeFromField`, `edgesForLens`, `walkDescendants`, `groupByLens`, `displayName`, `listUncategorized`. ~500 lines of core substrate logic. Currently in `project-sdk.ts` substrate section + `project-context.ts`. Re-derivation source exists (`analysis/poc-degree-zero-lens/render.ts`) but per memory is a "POC stays in analysis/ as the empirical demonstration; production code is fresh implementation, not direct port" — meaning a re-derivation is fresh-coding work, not a copy-paste.
- **`/project install` opt-in mechanism** (commit `53ebe39`): `packages/pi-project/registry/{schemas,blocks}/*` registry layout (22 byte-identical moves), `installProject(cwd, options)` export, `initProject` reduction to directory creation + minimal config bootstrap, `install-subcommand.test.ts`. Per DEC-0011 enacted 2026-05-03 — re-implementing this requires re-litigating DEC-0011 in a fresh-context audit.
- **PROJECT_DIR retrofit** (commit `2b42760`): `packages/pi-project/src/project-context.ts` substrate types + `projectRoot(cwd)` resolver + context-aware path helpers. Every production path-construction site in pi-project + pi-jit-agents + pi-workflows currently composes `projectRoot(cwd)` instead of hardcoding `PROJECT_DIR`. Touches ~15 files across 3 packages. Re-derivation: re-walk every path construction site under issue-077 enumeration, re-thread `cwd` parameter, re-update all consumer call sites. Per `feedback_first_edge_is_a_landmark.md` this was a project-state landmark.
- **Substrate consumption surface** (commit `ad03a00`): `packages/pi-project/src/lens-view.ts` (256 lines) + two new `/project` subcommands (`view`, `lens-curate`) + three pi tools (`project-validate-relations`, `project-edges-for-lens`, `project-walk-descendants`) registered in `index.ts`. The `lens-curate` follow-up-turn ceremony pattern (`pi.sendMessage` → LLM persists via `append-block-item`) is non-obvious and was specifically designed under issue-068/078/079/080.
- **Roadmap/plan substrate envelope** (commits `c5c4725` → `5f852b1`): `roadmap-plan.ts` (1214 lines), composition lens dispatch (`048a2ac`), STATUS_VOCABULARY + topoSort + rollupPhaseStatus (`b7bf11b`). Even under fix-forward, ~80% of this code carries forward (algorithms are lens-agnostic per `2026-05-06-repo-cleaning-guide.md`). Reverting discards 1214 lines and re-derives them under pi-context, when only ~250 lines (constants + validation codes + signatures) actually need rework.

**Other revert costs:**
- Six framework gaps (FGAP-011..FGAP-016) and three decisions (DEC-0011, DEC-0012, DEC-0013) filed with forensic detail in `.project/` post-`3a7856c`. Revert either preserves them out-of-band (orphan history) or discards them — both bad.
- Analysis substrate `analysis/2026-05-0[1-7]-*.md` (substrate-arc canon, distillation, package issue clusters, executive summary, missteps) was authored against the post-release state. Under revert these become forward-references to code that no longer exists.
- The branch identity: nine resolved issues (068/073/074/077/078/079/080/081/082/083/084) currently track to commits in the post-release arc. Revert orphans the resolution lineage; re-resolving requires re-walking each issue's verification.

**Cost asymmetry:** fix-forward is ~14 subagent runs of additive refactor. Revert is the same ~14 runs **plus** re-deriving the substrate SDK + install + retrofit + consumption surface (estimated 8–12 additional runs) **plus** re-litigating DEC-0011/DEC-0012/DEC-0013 in fresh context **plus** orphaned-history cleanup. Net: revert costs roughly 2× the runs and discards work whose forensic value (per `feedback_first_edge_is_a_landmark.md`) is non-recoverable.

## 6. Risk assessment

**R1: FGAP-006 custom keyword `x-config-registry` introduces cwd-coupled validator state.**
Mitigation: the AJV instance lives per-cwd (already true via `getValidator(cwd)` cache discipline per issue-069). Caught by: extending `project-sdk.substrate.test.ts` with two-project fixture verifying isolated registries.

**R2: Schema migration registry empty on landing means no forward-compat for pre-versioning data.**
Mitigation: every existing block file gets implicit `version: "1.0.0"` on first read after upgrade; `migrateBlock` is no-op for known-version data. Caught by: `block-api.config-root.test.ts` extension covering version-absent → version-1.0.0 path.

**R3: Priority enum migration (low/medium/high/critical ↔ P0/P1/P2/P3) ambiguous in some entries.**
Mitigation: migration script logs each mapping decision; manual review pass before commit; canonical mapping declared in seed `config.json` — projects pick one, render-time aliasing handles per-block display. Caught by: AJV rejects post-migration block on mismatch (no silent corruption path).

**R4: `ID_PREFIX_TO_BLOCK` derivation from config makes `buildIdIndex` cwd-dependent in a way it wasn't.**
Mitigation: `getProjectContext(cwd)` already provides cached config; signature change is `buildIdIndex(cwd: string)` → `buildIdIndex(cwd: string, cfg?: ConfigBlock)` with default = `getProjectContext(cwd).config`. Pure addition, no breaking change. Caught by: existing `project-sdk.test.ts` runs unchanged (default behavior preserved).

**R5: pi-project → pi-context rename ripples through every consumer.**
Mitigation: lockstep version bump per `scripts/bump-versions.js`; one coordinated patch commit; CI catches missed peer-deps. Per `feedback_no_degraded_state.md`, ship this as one comprehensive coordinated patch, not piecewise.

**R6: One of the 18 missteps surfaces an entanglement not visible from `2026-05-07-per-file-disposition-synthesis.md`.**
Mitigation: each subagent run is gated by `npm run check && npm test` (per Completion Sequence steps 3–4); failures surface within the run, not after. Per `feedback_audit_findings_are_work.md`, an emergent finding is filed as a new issue, not glossed over.

**R7: Per-commit substantive trust audit on inherited substrate-arc work still pending** (`2026-05-06-repo-cleaning-guide.md` cross-cutting concern).
Mitigation: this is a separate orthogonal task that fix-forward does not block; revert does not solve it either (the audit must run against either tree). Run before any release per `feedback_adversarial_audits_not_self_audits.md`.

The fix-forward path's risks are bounded, locally-caught, and additive. Revert's risk surface is larger because re-deriving the substrate SDK + install + retrofit reintroduces every fragility that the original work already navigated (per the issue-068..084 closure history) — fresh code is fresh fragility.
