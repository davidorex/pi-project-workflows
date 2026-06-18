# TASK-068 `pi-context update` impact analysis (READ-ONLY)

Date: 2026-06-19 · Branch: `feat/task-020-config-derivation` · Nothing applied; no substrate mutated.

Establishes, from the `update` decision-engine CODE and the live `.context` substrate, EXACTLY what an applied `pi-context update` would do before TASK-068's catalog issues-schema change (additive `resolved_at` + `x-lifecycle`) is brought into the live substrate.

## Dry-run baseline (the observed plan)

`pi-context update --dryRun --json`:
```
resynced:["issues","story"]  merged:["milestone"]  conflicts:[]  blocked:[]  refused:[]
inSync:[14 others]
```
`pi-context context-check-status --json` (per-asset states):
- `issues` → `catalog-ahead`, version_delta from 1.0.1 to 1.0.1, basis `content-only`
- `story` → `catalog-ahead`, from 1.0.1 to 1.0.1, basis `content-only`
- `milestone` → `both-diverged`, from 1.0.0 to 1.0.0, basis `content-only`, `installed_modified:true`
- all 14 others → `in-sync`

## 1. The update decision engine — processes ALL installed schemas, no per-schema target

`updateContext` (`packages/pi-context/src/index.ts:1818`). It calls the read-only drift detector `checkStatus(cwd)` (`index.ts:1850`), then loops over EVERY asset:

```ts
// index.ts:1864
for (const asset of report.perAsset) {
    const { name, state } = asset;
    switch (state) { ... }
}
```

`checkStatus` (`index.ts:1512`) builds `perAsset` by iterating `config.installed_schemas ?? []` — every installed schema, unconditionally:
```ts
// index.ts:1537
for (const name of config.installed_schemas ?? []) { ... }
```

Per-schema classification (`index.ts:1564-1585`), keyed on three content_hashes — baseline (`config.installed_from.assets[name].content_hash`), catalog-now, installed-now:
- `installedHash===undefined` → `missing-installed`; `catalogHash===undefined` → `missing-catalog`; `baseline===undefined` → `no-baseline`
- else: `catalogDrift = catalogHash!==baseline`, `installedDrift = installedHash!==baseline`
  - `!catalogDrift && !installedDrift` → `in-sync`
  - `catalogDrift && !installedDrift` → `catalog-ahead`
  - `!catalogDrift && installedDrift` → `locally-modified`
  - both → `both-diverged`

Routing in `updateContext` acts ONLY on the classified state (`index.ts:1866`): `in-sync`→no-op; `catalog-ahead`→`resyncSchema`; `locally-modified`/`both-diverged`→3-way `mergeSchema`.

**`updateContext` signature is `(cwd, { dryRun })` only — no schema/target parameter** (`index.ts:1818`), and `update --help` exposes only `--dryRun`. **CONFIRMED: applying `update` necessarily processes issues + story + milestone (and re-checks all 17) in a single run; the three cannot be separated through this op.**

## 2. issues (resync) — purely additive, the intended TASK-068 change

Diff `.context/schemas/issues.schema.json` (live, = baseline) vs `samples/schemas/issues.schema.json` (catalog). The ONLY deltas, both additive:
- new OPTIONAL property `resolved_at` (`{"type":"string","description":"ISO-8601 timestamp when the issue was resolved"}`) — not added to `required`
- new top-level `x-lifecycle` block (`field:status`, `states:[open,resolved,deferred]`, two transitions)

Both versions are `1.0.1`. Resync arm A (`resyncSchema`, `index.ts:1066-1069`) is the same-version verbatim overwrite: `fs.copyFileSync(sourceFile, destFile)` → `resynced`, no migration registered. **Purely additive: no existing issue item is invalidated** (the new field is optional; `x-lifecycle` is metadata, not an item constraint). This is the safe, intended outcome.

## 3. story (resync) — UNSAFE: pre-existing drift, resync would invalidate all 14 existing story items

Diff `.context/schemas/story.schema.json` (live, = baseline) vs `samples/schemas/story.schema.json` (catalog). This drift is UNRELATED to TASK-068 — it is pre-existing: the live story schema is the install baseline; the catalog story schema diverged in prior catalog work. Deltas live→catalog:
- `title`: `"User Stories"` → `"Stories"` (cosmetic)
- `description`: rewritten (live mentions the Agile `As a <user_kind>` form + `item_derived_from_item`; catalog describes the feature→story→task altitude) (cosmetic)
- **`user_kind` property REMOVED**: live defines `user_kind` (`story.schema.json:44-47`); catalog has NO `user_kind` property. The items object carries `additionalProperties:false`.

Resync overwrites the installed schema with the catalog body (`resyncSchema` arm A, verbatim `copyFileSync`, `index.ts:1067`). Because both declare version `1.0.1`, arm A fires and **NO item re-validation is performed** — the comment at `index.ts:1061-1065` asserts "Items are unaffected by a same-version schema body change," which is FALSE for a same-version body that REMOVES a property under `additionalProperties:false`.

Why the dry-run nonetheless lists story under `resynced` (not `blocked`): the predictor `simulateResyncOutcome` arm 1 (`index.ts:803-807`) returns `{outcome:"resynced"}` WITHOUT validating whenever `installedVersion===catalogVersion`. So the `resynced` prediction here means "same version, verbatim overwrite" — it is NOT a statement that items still validate.

Live story block carries 14 items (`STORY-001`..`STORY-014`), and EVERY one has `"user_kind":"cli-user"` (read via `read-block --block story`). Proof of post-overwrite invalidity — `pi-context validate-block-items --block story --json` (items vs the CATALOG story schema):
```
valid:false — 14 failures, one per item:
  instancePath:/stories/N  keyword:additionalProperties  "must NOT have additional properties"
```
**After an applied resync, the live story schema would forbid `user_kind`, and all 14 existing story items would be invalid against their own installed schema** — a subsequent `context-validate` would fail. The resync write itself (`copyFileSync`) does not validate items, so it would land silently and leave the substrate inconsistent.

## 4. milestone (merge) — clean, content-unchanged, benign

`both-diverged` → 3-way `mergeSchema` (`updateContext` `index.ts:1947-2002`). The three inputs:
- BASE = object-store body at recorded baseline hash `139f4887…` (`config.installed_from.assets.milestone.content_hash`), read at `.context/objects/139f4887….json`
- OURS = live `.context/schemas/milestone.schema.json`
- THEIRS = catalog `samples/schemas/milestone.schema.json`

OURS and THEIRS are **byte-identical**. They differ from BASE ONLY in two `description` strings (the top-level block description, line 6, and the `status.description`, line 38): BASE phrases milestone-reached in terms of a `phase_positioned_in_milestone` **child** ("≥1 … child and all such children bucket to complete"); OURS==THEIRS phrases it in terms of an **edge** ("the parent phase of every such edge buckets to complete"). No structural / property / required / enum change anywhere.

`mergeSchema` (`schema-merge.ts`) walks per node; at each differing `description`: `valuesEqual(base,ours)` false, `valuesEqual(base,theirs)` false, `valuesEqual(ours,theirs)` TRUE → returns `ours` ("both changed the same way → converged", `schema-merge.ts:169`). Every other node is equal on all three. **Result: zero conflicts (dry-run confirms `conflicts:[]`); merged body == current live body (no content change).** Applied, `updateContext` would `writeSchemaCheckedForDir(merged)` (content-identical to current) and re-stamp the merge baseline := THEIRS/catalog body (`index.ts:1992`, `stampBaselineFromBody`) so milestone reads `locally-modified`-stable next check. **No milestone item is at risk** — items carry only `id/name/status/release/…`; the change is description metadata. Benign.

## 5. VERDICT

**Applying `update` is NOT uniformly safe — it is (b): the story-resync changes the schema in a way that invalidates existing items, and it cannot be avoided through this op.**

| schema | state | applied effect | item risk |
|---|---|---|---|
| issues | catalog-ahead (TASK-068) | verbatim overwrite: add optional `resolved_at` + `x-lifecycle` | none — purely additive (intended) |
| story | catalog-ahead (PRE-EXISTING drift, not TASK-068) | verbatim overwrite REMOVES `user_kind` under `additionalProperties:false`; no item re-validation on the same-version arm | ALL 14 story items become invalid (proven: `validate-block-items` → 14× additionalProperties failures) |
| milestone | both-diverged (PRE-EXISTING drift) | clean 3-way merge; merged==live (description-only convergence); baseline re-stamped to catalog | none |

**Can issues be brought current WITHOUT touching story/milestone?** Not through `pi-context update` — it has no per-schema target and processes all installed schemas every run (§1). A sanctioned targeted path exists: write only the issues body via the schema-write surface. `write-schema`/`writeSchemaCheckedForDir` writes one named schema body (meta-validated, nested-id-guarded) without invoking the catalog drift loop, so the issues catalog body can be installed in isolation, leaving story + milestone untouched. (Their baselines would then still read `catalog-ahead`/`both-diverged` until separately handled — that is correct, they are independent drift.) Confirm the exact CLI op name/flags before use; `writeSchemaCheckedForDir` is the underlying primitive `updateContext`'s merge arm already calls.

**story and milestone are PRE-EXISTING catalog drift, not part of TASK-068, and should be handled as their own deliberate actions:**
- **story** is a genuine semantic conflict requiring a decision before any resync: either the catalog must re-add `user_kind` (the live substrate actively uses it on all 14 items), or the 14 items must shed `user_kind` first — blindly resyncing silently breaks the substrate. This also exposes a CODE gap: `resyncSchema` arm A (same-version verbatim overwrite, `index.ts:1066-1069`) and `simulateResyncOutcome` arm 1 (`index.ts:803-807`) skip item re-validation on the same-version path, so a same-version catalog body that narrows the schema (removed property / tightened `additionalProperties`) is neither predicted as `blocked` in dry-run nor caught at resync — a candidate FGAP (catalog-ahead same-version resync can invalidate existing items undetected).
- **milestone** is benign (clean, content-unchanged) but is still pre-existing drift; folding its baseline re-stamp into the TASK-068 run mixes unrelated changes. Cleaner as its own no-op-content reconcile.

**Recommendation for TASK-068:** do NOT run a blanket `pi-context update`. Bring ONLY the issues schema current (targeted schema write). Triage story (decision needed: catalog vs items) and milestone (benign reconcile) as separate deliberate actions, and consider filing the same-version-resync no-validation code gap.
