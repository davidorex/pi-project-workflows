# Audit — TASK-004 proposed resolution (git merge driver + post-merge integrity pass)

Date: 2026-06-20
Scope: read-only audit of TASK-004's `description` (its proposed resolution), against upstream design (DEC-0004, FGAP-004, FEAT-002), the dependency TASK-005, and the actual `packages/pi-context/src` code the resolution touches. No mutation, no implementation.

## Verdict: HAS-PROBLEMS

The core design (git owns branches/merge-base/refs; pi-context supplies a per-file structure-aware driver + a cross-file post-merge pass) is architecturally sound and matches how git merge drivers actually work. But the task as filed encodes four concrete defects that would mislead implementation: a circular dependency with TASK-005, a blind spot to an ALREADY-BUILT 3-way merge + conflict engine in the same package, no handling of per-write-derived metadata fields (the #1 source of spurious merge conflicts in this substrate), and scope/sequencing that bundles too much into one task.

---

## Evidence base (all from actual output / code)

- `pi-context read-block-item --block tasks --id TASK-004 --json` — the resolution under audit.
- `find-references` → addresses FEAT-002, governed by DEC-0004, **`task_depends_on_task` → TASK-005**, conventions feature-branch-workflow + cli-command-form.
- DEC-0004 (`enacted`), FGAP-004 (`accepted`), FEAT-002 (`proposed`) — the upstream design, all internally consistent with the task.
- TASK-005 description: "**Depends on the substrate merge driver (TASK-004).**"
- `packages/pi-context/src/schema-merge.ts` — `export function mergeSchema(...)`, `export interface SchemaConflict`, "Deterministic key/path-level draft-07 3-way schema merge", "3-way set merge honoring adds AND removes", base × ours × theirs.
- `conflict-resolver-helpers.test.ts` imports `renderConflicts` from `./index.js` (a built, exported, tested conflict-set renderer).
- `ops-registry.ts` `context-update` op string: an existing **deterministic 3-way merge of base (object-store body at the baseline content_hash) × ours (installed) × theirs (catalog)**, "required / enum / array-valued type nodes merge as sets", with **git-style in-file failure markers** (`<<<<<<< BLOCKED … / >>>>>>> target:`) and a pending-blocked record → resolve-blocked. This is, structurally, three-quarters of what TASK-004 proposes to build from scratch.
- `context.ts:1712` `validateRelations(config, relations, itemsByBlock, resolve?)` and `context-sdk.ts:2106` `validateContext(cwd)` — the post-merge pass's referential-integrity + invariant/lens revalidation already exist as callable functions.
- `block-api.ts:1375` `upsertItemInTypedFile` + `maybeIdentityStampTypedItem` / `maybeStampTypedItem`: every written item carries `oid`, `content_hash`, `content_parent`, and (schema-declared) `created_by/at` + `modified_by/at`. These are derived per write.
- `git-env.ts` `cleanGitEnv()` — mandatory env-scrubbing for any child git process; a merge driver/hook that shells git inherits the husky-hook GIT_DIR poisoning unless it uses this. Not named anywhere in the task.

---

## Problem 1 (WRONG / blocking) — circular dependency with TASK-005

TASK-004 declares `task_depends_on_task → TASK-005`, while TASK-005's own description states it depends on TASK-004. DEC-0004 consequence #4 and FEAT-002 criterion 4 make the real relationship explicit: the merge driver (TASK-004) is the **host** that *invokes* the convergent sequence field-kind (TASK-005) inside its field-merge dispatch. So:

- The sequence field-kind (TASK-005) is the leaf; it has no dependency on the driver to exist as a field-type — it only needs to be *callable* by the driver.
- The driver (TASK-004) depends on TASK-005 for the SEQUENCE branch of field dispatch, but every other branch (scalar/object, edge-set, config/schema) is independent of it.

The edge as filed is backwards relative to one of the two, and the two together form a cycle. Implementation guidance: **TASK-005 ships first (or the driver lands with the SEQUENCE branch stubbed to a declared-policy/conflict fallback and TASK-005 fills it in)**; the `task_depends_on_task` edge should point TASK-004 → TASK-005, and TASK-005's "depends on TASK-004" prose should be corrected to "is invoked by / plugs into TASK-004's field-merge dispatch" (a hosting relation, not a build-order dependency).

## Problem 2 (OVERLY COMPLEX / non-best-practice) — ignores the 3-way merge + conflict engine already in the package

The task says to build, in block-api, a per-file 3-way merge, a field-kind dispatch, a config/schema 3-way merge, and a "typed structured conflict set … surfaced by the post-merge pass," as if from nothing. But the package ALREADY contains, shipped and tested for `/context update`:

- `mergeSchema(base, ours, theirs)` — deterministic draft-07 3-way merge with set-semantics for array nodes and a typed `SchemaConflict[]` output. This IS the "config/schema 3-way; divergent redefinition → conflict" the task re-specifies.
- `renderConflicts(...)` — a conflict-set renderer (the "typed structured conflict set" the task wants is already a type + a renderer).
- The update path's base-from-object-store + git-style in-file markers + pending-blocked → resolve pattern — a working precedent for "surface conflicts the deterministic merge cannot auto-resolve, let a calling agent reconcile, then commit."

The task neither names these nor instructs the implementer to extend/reuse them. As written it invites a parallel second 3-way/conflict implementation — duplication, drift, and two conflict vocabularies. **Corrected resolution must direct the implementer to reuse `mergeSchema`/`SchemaConflict`/`renderConflicts` for the config+schema files and to model the item/edge conflict set on the same `SchemaConflict` shape + `renderConflicts` rendering, not invent a second one.** Likewise the post-merge pass must be expressed as a thin composition of the existing `validateContext` + `validateRelations`, not a new validation engine.

## Problem 3 (WRONG assumption / fragility) — per-write-derived metadata fields will generate spurious conflicts

The task's item-match-then-field-merge rule treats every differing field as a real edit. But `upsertItemInTypedFile` + the identity/author stamps mean every item carries `content_hash`, `content_parent`, `oid`, and `modified_by/modified_at` that change on essentially every write. Two branches that both touched the same item will differ on `content_hash`/`content_parent`/`modified_*` **even when the semantic payload merges cleanly** — a naive "modified-on-both → field-level merge / conflict" rule conflicts on the bookkeeping, not the content. DEC-0004 explicitly says merge must NOT use content_parent/content_hash for base-finding (git's %O is the base) but is silent on what the driver DOES with them when merging an item body. The resolution must specify: **content_hash/content_parent are recomputed (not merged) on the merged item; oid is preserved from the stable identity; modified_by/at are re-stamped by the merge-finalize writer; only the schema's semantic fields participate in field-level 3-way.** Without this the driver conflicts constantly on noise.

## Problem 4 (SCOPE / sequencing + missing concrete hooks) — one task carries too much, omits load-bearing specifics

The task bundles: .gitattributes registration, the driver entrypoint, item-match logic, field-kind dispatch (incl. the not-yet-built sequence kind), edge-set merge, config/schema merge, AND a separate post-merge hook/command doing full revalidation + typed conflict emission. That is at least three independently shippable, independently verifiable units (per-file item/edge driver; config+schema driver reusing mergeSchema; post-merge finalize command). Per the canonical decomposition convention this is a feature to decompose into sub-tasks, not one task. Additionally, two concrete, non-inferrable implementation facts are absent and must be named so the implementer doesn't rediscover or miss them:

- The driver/finalize command MUST shell git via `cleanGitEnv()` (`git-env.ts`) — under husky/hook invocation an inherited `GIT_DIR` silently targets the wrong repo.
- The merge driver entry is a CLI command form (governed by `cli-command-form`); the resolution should name the actual op/command surface (a `pi-context` op the `[merge "pi-context"]` driver line invokes) rather than "the driver entrypoint," so the brief specifies the reflected-op deliverable + its `description`/`promptSnippet` (docs-surface-sync).

---

## Proposed corrected resolution text (ready to replace TASK-004 `description`)

> Implement the structure-aware git merge driver + post-merge integrity pass per DEC-0004 / FGAP-004 / FEAT-002, as a reflected `pi-context` op the `[merge "pi-context"]` driver entry invokes (cli-command-form), registered via `.gitattributes` mapping substrate files (`<block>.json`, `relations.json`, `config.json`, `schemas`) to `merge=pi-context`. The driver consumes git's `%O`/`%A`/`%B`/`%P` and writes a data-model-valid 3-way merge:
> - **Items** matched by stable `id`/`oid` (never array index); add-on-one → include, remove-on-one & untouched-other → remove, modified-on-one → take, modified-on-both → field-level merge, removed-on-one & modified-other → conflict. **Only schema-declared semantic fields participate in field-level merge; the per-write-derived metadata (`content_hash`, `content_parent`, `oid`, `modified_by`/`modified_at`) is NOT merged — `oid` is preserved from stable identity, `content_hash`/`content_parent` are recomputed on the merged item, and `modified_*` is re-stamped by the finalize writer** (block-api identity/author-stamp path). This prevents spurious bookkeeping conflicts.
> - **SEQUENCE fields** dispatch to the convergent ordered-sequence field-kind (TASK-005); the driver hosts it — if TASK-005 is not yet landed, this branch falls back to the declared deterministic policy / conflict and is filled in by TASK-005.
> - **Edges** (`relations.json`) merge by 3-way set ops on `(parent, child, relation_type)`.
> - **config/schema** merge **reuses the existing deterministic 3-way engine** (`mergeSchema` + `SchemaConflict` from `schema-merge.ts`); divergent redefinition of the same block_kind / relation_type / schema → a `SchemaConflict`.
> - `objects/` need no driver (distinct content-hash names; git unions equal-content files).
>
> Driver + per-file merge logic live in block-api. A separate **merge-finalize** op (git post-merge hook OR CLI command — a per-file driver cannot see across files) composes the EXISTING `validateContext` + `validateRelations` to enforce cross-block referential integrity (drop/conflict edges whose endpoints were deleted in another file) + full invariant + lens revalidation, and emits a typed conflict set modeled on `SchemaConflict` and rendered via the existing `renderConflicts` (do NOT introduce a second conflict vocabulary). All git subprocesses pass `env: cleanGitEnv()` (`git-env.ts`).
>
> Branches, merge-base, commit lineage, refs, and cherry-pick remain git's — not reimplemented. Decompose into sub-tasks (item/edge per-file driver; config/schema driver reusing mergeSchema; merge-finalize command) per the feature-decomposition convention. Full completion sequence incl. docs-surface-sync for the new op's `description`/`promptSnippet` + README + SKILL. Via coding subagent; orchestrator runs all npm + is sole git writer; per-step commit.

## Proposed acceptance_criteria deltas (FEAT-002 + any task criteria)

- Add: "config/schema merge is implemented by reusing `mergeSchema`/`SchemaConflict`; the item/edge conflict set reuses the `SchemaConflict` shape + `renderConflicts` — no second conflict type/renderer is introduced."
- Add: "per-write-derived metadata (`content_hash`, `content_parent`, `oid`, `modified_*`) does not participate in field merge and does not produce conflicts; a both-edited item whose semantic fields are disjoint merges clean."
- Add: "the post-merge pass is a composition of existing `validateContext` + `validateRelations`, not a new validator."
- Add: "all child git processes use `cleanGitEnv()`."
- Fix the dependency direction: TASK-004 → TASK-005 (host invokes leaf), and correct TASK-005's prose from 'depends on TASK-004' to 'plugs into TASK-004's field-merge dispatch'.

## What is SOUND (keep as-is)

- Git owns branches/merge-base/refs/cherry-pick; pi-context supplies only per-file reconcile + cross-file finalize. Correct division — matches how git merge drivers + post-merge hooks actually work.
- Item-match by stable id/oid not array index. Correct and necessary.
- objects/ unioned by git's directory merge (equal hash == equal content). Correct.
- The per-file-driver-can't-see-across-files justification for a separate post-merge pass. Correct and load-bearing.
