# Cycle 10 `.project-migrate` Canonicalization — Adversarial Audit

Date: 2026-06-01
Auditor role: fresh-context adversarial (read-only; no source edits, no npm, no commit, no substrate/pointer mutation persisted)
Scope: PRE = git `d4991e1` (baseline `bdc9161`); POST = HEAD `0edfcf4`. Engine commits `c17d2b6` + `a1ca610` (+ arc-introduction `8d7db4c`).
Default posture: FLAG when uncertain.

## Verdict summary

| Probe | Subject | Verdict |
|---|---|---|
| 1 | No item loss / no duplication | CLEAN |
| 2 | Promotion correctness + 55 membership edges | CLEAN |
| 3 | Clean-emit schemas inherit nothing + 0 nested-id | CLEAN |
| 4 | Content-addressing integrity | CLEAN |
| 5 | conventions registered + slug ids + singletons | CLEAN |
| 6 | 0 nested-id + 0 dangling on real substrate | CLEAN (one adjacent FLAG, see below) |
| 7 | Idempotency | CLEAN |
| 8 | Scope + framework untouched | CLEAN with scope-precision note |

FLAGs: **1 LOW-MEDIUM** (carried-forward unregistered relation_type), **1 LOW scope-precision note** (Probe 8).
No HIGH/CRITICAL findings. No item loss, no corruption, no source-schema inheritance, idempotent.

---

## Probe 1 — No item loss / no duplication — CLEAN

PRE reconstruction (`git show d4991e1:.project-migrate/*`):

- Registered block_kinds with data files (14 registered; 3 fileless): decisions 52, framework-gaps 187, tasks 75, verification 67, issues 91, features 11, research 14, rationale 8, spec-reviews 1, layer-plans 1, phase 10; context-contracts / story / work-orders = NO FILE (0). **SUM registered = 517.**
- Nested arrays: features.stories = 9; feature-story.tasks (depth-3, stories' tasks) = 34; layer-plans.layers = 5; layer-plans.migration_phases = 7. **Promoted = 55.**
- conventions.rules = 16 (unregistered orphan in PRE).

**PRE GRAND = 517 + 55 + 16 = 588.**

POST reconstruction (current files, every block_kind incl. promoted + conventions): SUM of all top-level array items = **588** (517 original registered + 16 conventions + 9 feature-story + 34 story-task + 5 plan-layer + 7 plan-phase). All 14 originally-data-bearing registered blocks retain identical counts; the 3 fileless block_kinds stay fileless.

De-nesting confirmed: 0 features items still carry `.stories`; 0 plans carry `.layers`/`.migration_phases`; 0 feature-story items carry `.tasks`.

Spot-checks (content reconciled via membership-edge `refname` → oid, excluding the intentionally re-minted `id` + added identity fields `oid`/`content_hash`/`content_parent`):
- All 9 stories: **0 content mismatches**.
- All 34 tasks: **0 content mismatches**.
- All 5 layers + 7 phases: **0 content mismatches**.

Count reconciliation is exact PRE→POST (588=588). No item dropped, none duplicated.

## Probe 2 — Promotion correctness + membership edges — CLEAN

`relations.json` is a 192-edge array. By relation_type: feature_contains_story 9, story_contains_task 34, plan_contains_layer 5, plan_contains_phase 7 → **membership total = 55.**

For all 55 membership edges:
- parent oid not resolving in named parent block: **0**
- child oid not resolving in named child block: **0**
- edges missing `ordinal`: **0**
- edges missing `child.refname`: **0**

Every promoted entity is a top-level item with a 32-hex `oid` + 64-hex `content_hash`; all ids match their target pattern (FSTORY-\d{3}, STORY-TASK-\d{4}, PLAN-LAYER-\d{3}, PLAN-PHASE-\d{3}). The child endpoint `refname` carries the ORIGINAL nested id (STORY-001, TASK-001-01, L1..L5, PHASE-1..PHASE-7), and `ordinal` = original array index. Ordinal-preservation verified: story_contains_task 0/34 ordinal mismatches; plan_contains_layer + plan_contains_phase 0 ordinal mismatches. Depth-3 (feature→story→task) both legs present and resolving.

## Probe 3 — Clean-emit schemas inherit nothing from source — CLEAN

PRE `features.schema.json`: `$ref` true, `definitions` true (a $ref-into-definitions tree).

POST audit of features / layer-plans (de-nested parents) + feature-story / story-task / plan-layer / plan-phase (promoted) + conventions:
- `$ref` / `$defs` / `definitions`: **false everywhere**.
- promoted + de-nested-parent item subschemas: `additionalProperties: false`, `item.required: ["id"]`, identity fields (`oid`,`content_hash`) declared, **0 nested id-bearing arrays in item**.
- top-level `required` = the array_key for each.
- de-nested parents dropped the nested array PROPERTY entirely: features item has no `stories`; layer-plans plan item has no `layers`/`migration_phases`; feature-story item has no `tasks`.

`conventions` (registered-orphan path per a1ca610 — identity-injected, NOT clean-rebuilt): keeps its already-clean source schema (`required:["id","description","enforcement","severity"]`, `additionalProperties` left as source `undefined`) + injected identity. This matches the commit's documented behavior; no source quirk inherited.

Data validates: per-block `validateBlockWithMigrationForDir` over all 16 data-bearing blocks = **16 pass / 0 fail**. substrate_id minted (`sub-0c813fd84348d4c2`); PRE had none.

## Probe 4 — Content-addressing integrity — CLEAN

- Total content-addressed items: **588**. Items missing a valid 32-hex oid: **0**. Duplicate oids: **0** (588 unique). Items missing valid 64-hex content_hash: **0**.
- Every referenced content_hash has an object file: **0 missing**.
- objects/ file count: **609**; orphans (objects not referenced by a current item): **21**. All 21 are byte-for-byte the `content_parent` of a current item — i.e. prior-version (pre-stamp) objects left after backfill re-hashed with identity fields. 0 orphans that are neither current nor a parent. All object filenames are 64-hex. **609 − 588 = 21 fully explained as intermediate-version objects; benign, not corruption.**
- Recompute `computeContentHash(contentProjection(schema, arrayKey, item))` for 6 sampled items spanning ordinary + promoted (feature-story, story-task) + conventions: **0 mismatches**.

## Probe 5 — conventions registration — CLEAN

- Registered as a block_kind in POST config (absent from PRE config block_kinds — was an unregistered orphan).
- 16 rule slug ids (esm, tsc-build, no-pi-dir, …, no-flat-duplication) **UNCHANGED** PRE→POST; no prefix+number id minted.
- All 16 rules fully content-addressed (oid + content_hash + object present); recompute on rule `esm` MATCH.
- Singleton fields `test_conventions` / `lint_command` / `lint_scope` preserved **verbatim** (deep-equal PRE==POST).

## Probe 6 — 0 nested-id + 0 dangling on the real substrate — CLEAN (one adjacent FLAG)

Pointer-switched to `.project-migrate`, ran `validateContext`, restored the pointer via library write + `git checkout -- .pi-context.json` (pointer confirmed byte-restored + git-clean afterward).

Targeted canonicalization codes: **nested_id_bearing_array = 0; edge_endpoint_dangling = 0; edge_endpoint_unregistered = 0; edge_parent_not_in_bins = 0; edge_cycle_detected = 0.** The previously-noted last nested array (conformance-reference:principles.rules) is gone — conformance-reference is absent from data + schema + config (present at baseline `bdc9161`, dropped at `d4991e1`).

The full run reported 90 issues; the remainder are lens/semantic warnings (41 completed-task-has-verification, 45 decision-cites-forcing-artifact, 1 task-completed-feature-complete) + the EXPECTED `substrate_id_unregistered` (work-dupe not in root registry) — none are canonicalization defects.

### FLAG (LOW-MEDIUM) — carried-forward unregistered relation_type

`validateContext` surfaced **2 errors**: edges `DEC-0048→DEC-0036` and `DEC-0048→DEC-0040` use relation_type `decision_relates_to_decision`, which is **NOT registered** in `config.relation_types[]`. Verified PRE state (`d4991e1`): these same 2 edges existed and `decision_relates_to_decision` was already absent from PRE config.relation_types. This is a **pre-existing source condition faithfully carried forward**, not canonicalizer-introduced corruption — the canonicalizer registers only the 4 membership types it mints (all 4 present in POST config), and does not reconcile pre-existing unregistered relation_types. Severity LOW-MEDIUM: the frozen canonical archive still emits 2 edges that fail `validateContext` on relation_type registration. Note the orchestrator's "0 dangling/unregistered edges" claim conflated edge-ENDPOINT-unregistered (genuinely 0) with relation_TYPE-unregistered (2) — a distinct validation category that was not zero.

## Probe 7 — Idempotency — CLEAN

`cp -r` of the current canonicalized `.project-migrate` to a mkdtemp scratch; ran `canonicalizeSubstrate(scratch, {promotionTargets: PROJECT_MIGRATE_TARGETS, registerBlocks: PROJECT_MIGRATE_REGISTER_BLOCKS})`:

- promotions: **0** · items_oid_minted: **0** · kinds_registered: **[]** · registered_blocks: **[]** · schema_denested: **[]** · relation_types_registered: **[]** · objects_stored: **0**.
- `items_hashed: 588` (re-hashes existing items but stores 0 new objects → hashes unchanged → no mutation).

Second run on already-canonical input is a no-op. Scratch removed.

## Probe 8 — Scope + framework untouched — CLEAN (scope-precision note)

- `.project` (pristine source): `git status .project` clean; `git diff d4991e1 HEAD -- .project` empty. **Byte-identical.**
- Data-apply commit `0edfcf4`: 644 files, **all under `.project-migrate/`** (no other path).
- Across `c17d2b6` + `a1ca610` + `0edfcf4`: **no** core framework module touched (schema-validator, block-api, schema-write, schema-migrations, context-sdk, content-hash, lens, closure). Engine commits touch only `canonicalize-substrate.ts` + its test + the orchestrator CLI + runtime-demo. The brief's `git show --stat c17d2b6 a1ca610` claim is accurate for those two.
- Active substrate `.context-jit-spec-v2`: **fully git-clean (0 changed files)** — unchanged by the canonicalizer arc. (The "golden 58/53/5" label maps to a lens-projected count basis; the tree itself is byte-clean, which is the load-bearing assertion.)

### Scope-precision note (LOW)

The arc-introduction commit `8d7db4c` (NOT among the 3 named probe targets, though part of Cycle 10) modified framework modules `context.ts` (+62/−6), `index.ts` (+56), `land-identity-fields.ts` (+1/−1). The context.ts change is **additive `…ForDir` config-write infrastructure** (`loadConfigForDir` / `writeConfigForDir` / `amendConfigEntryForDir`) with the existing cwd `amendConfigEntry` / `writeConfig` / `loadConfig` refactored into thin wrappers over the ForDir bodies (the 6 deletions are relocated bodies, behavior preserved). `land-identity-fields.ts` exports `IDENTITY_FIELDS` for reuse. These are new primitives the canonicalizer engine needs to write config into a non-active substrate dir — not changes to validation/write SEMANTICS of existing paths, and the active substrate is byte-clean. Recorded as a precision note: framework gained additive (refactored-not-broken) primitives during the arc, even though the two final engine commits are canonicalizer-file-scoped as claimed.

## Re-anchored verdicts on the four pivotal questions

- (a) **Zero item loss** — CONFIRMED. 588 = 517 registered + 55 promoted + 16 conventions, exact PRE→POST; spot-checked content byte-identical.
- (b) **Depth-3 promotion + 55 membership edges** — CONFIRMED. 9 feature_contains_story + 34 story_contains_task + 5 plan_contains_layer + 7 plan_contains_phase = 55; both endpoints resolve; refname = original id; ordinal = original index (0 mismatches).
- (c) **Clean-emit schemas inherit nothing + 0 nested-id** — CONFIRMED. No $ref/$defs/definitions; AP:false; required:["id"]; identity declared; 0 nested id-bearing arrays; validateContext nested_id_bearing_array = 0; 16/16 blocks validate.
- (d) **Idempotent** — CONFIRMED. Re-run on canonical input = 0 promotions / 0 mints / 0 registrations / 0 objects stored.

Single most important finding: the canonicalization is materially sound (zero loss, correct depth-3 promotion, clean-emit, content-addressed, idempotent); the one substantive flag is a **carried-forward source defect** — 2 `decision_relates_to_decision` edges remain whose relation_type is unregistered in config, so the frozen archive still fails `validateContext` on that relation_type-registration check (pre-existing in PRE, not introduced).
