# Adversarial audit — pi-context reader-facing doc update (content-addressed model)

**Date:** 2026-06-02
**Auditor role:** fresh-context adversarial. Verified every load-bearing claim against current pi-context code/exports, not commit messages.
**Range audited:** `e8391f2..HEAD` — `aa407c7` (pkg README), `b1ef49c` (root README), `4b8e5c2` (skill-narrative.md + regenerated SKILL.md).
**Source-of-truth referenced:** `analysis/2026-06-02-pi-context-doc-survey-and-source.md` (PART B).

---

## Overall verdict: REFUTED on one load-bearing point (1 HIGH); all other claims CONFIRMED.

A single factual error is present in **all three edited prose docs** (pkg README ×3 spots, skill-narrative.md, regenerated SKILL.md): the `promote-item` tool is described as the intra-substrate "nested array item → top-level entity + membership edge" promoter. The actual `promote-item` tool/module is a **cross-substrate derivation** (`source` + `destinationSubstrate` → new content-addressed copy + `item_derived_from_item` lineage edge). The intra-substrate nested-array promotion is performed by `canonicalize-substrate`, not `promote-item`. The error originated in the survey (PART B :91, :130) and was copied verbatim into the docs; the doc edit did not catch the mismatch against the live tool.

Everything else verifies: three-layer identity, content-addressing/object-store, registry + `resolveRef` four-way, structured endpoints, validation codes, migrations narrative, every exported subpath, every named tool, no citation-rot, no `.project-migrate`, no surviving `phases/` dir claim, no hardcoded tool count in prose, SKILL↔narrative consistency, SKILL `<tools_reference>` carries the three lifecycle tools.

---

## Per-claim results

### Claim 1 — skill-narrative.md + SKILL.md new-model accuracy: **CONFIRMED (with the Claim-6 promote-item exception)**

- Identity fields. `MANDATORY_METADATA_FIELDS = {id, oid, content_hash, content_parent}` at `src/block-api.ts:90`; `mintOid(substrateId, nonce?)` at `:619` returns `sha256Hex(canonicalJson([substrateId, seed])).slice(0,32)` — the doc's "32-hex, content-independent, minted once, salted by substrate_id, immutable, write with different incoming oid rejected" all match (`prepareItemIdentityForWrite` `:657`, update-mode oid-mismatch throw documented `:653-655`). `contentProjection` at `:453`. No-op gate: `arrayDeclaresIdentityFields` gate at `:670-672` matches "stamping no-op unless the array subschema declares all three identity fields."
- `content_parent` "advances only when content actually changed; metadata-only write carries prior parent forward" — matches block-api `:651-654` mode-update comment.
- Content-addressing. `objects/<content_hash>.json`, idempotent, atomic tmp+rename: `src/object-store.ts:76-90` (`putObject` writes `JSON.stringify(content,null,2)` via tmp+rename). Git-tracked-not-gitignored claim: `object-store.ts:17` ("objects/ is tracked in git ... gitignoring it would lose pinning"). Deferred-until-after-validation claim: block-api `:in prepareItemIdentityForWrite` comment "Object persistence is deferred to writeTypedFile's post-validation walk ... so an AJV-fail leaves no orphan content object" — matches narrative `<content_addressing>`.
- Content hash = JCS/RFC 8785 → SHA-256: `content-hash.ts:7,28,39,55` (`canonicalize` pkg + `createHash("sha256")`). Narrative says "SHA-256 over the content projection" — accurate.
- Metadata floor + discretionary + `x-identity.metadata_fields` override REPLACES discretionary, floor always unioned: `block-api.ts:90` (floor), `:109-110` (`closed_by`/`closed_at`), `:372-394` (`MANDATORY ∪ (override ?? DISCRETIONARY)`), `:374` ("override REPLACES"). README's phrasing "floor is always excluded" and narrative's "floor is always unioned in" describe the same fact (floor ∈ metadata ⇒ excluded from hash) — not contradictory.
- registry + resolveRef four-way: `context-sdk.ts:1401` `ResolveStatus = "active"|"foreign"|"dangling"|"unregistered"`; `resolveRef` at `:1489`; lens_bin→always active `:1499`; foreign/dangling/unregistered branches `:1552-1584`. `context-registry.ts`: `resolveSubstrateDir` `:214`, `resolveAlias` `:229`, returns null on miss, `RegistryEntry{dir,aliases[]}` `:70`, keyed by substrate_id `:76`.
- structured endpoints: `schemas/relations.schema.json:17-37` — `{kind:"item", oid (required), refname?, substrate_id?, content_hash?}` and `{kind:"lens_bin", bin}`; matches doc verbatim. `ordinal` field present `:56`.
- validation codes: `context-sdk.ts:1681` `substrate_id_unregistered`, `:1696` `substrate_id_registry_mismatch`, `:1734/:1751` `edge_endpoint_unregistered`, `:1742/:1759` `edge_endpoint_dangling`, `:1976` `nested_id_bearing_array`. All present.
- migrations: `migrations-store.ts:64-82` — `TransformOp` = rename/set/delete/coerce, `MigrationDecl.kind = "identity"|"declarative-transform"`, `migrations.json` per-substrate (`:3`). `$id` pattern `pi-context://schemas/<name>`: confirmed `schemas/config.schema.json:3` etc. Version-bump-requires-migration-or-throw: `schema-migrations.ts:89-122` throws; block-api routes read AND write through `validateBlockWithMigrationForDir` (`:784` read path, `:1749` write path) — matches "reading or writing an item with an older schema_version throws."

### Claim 2 — no stale pre-arc claims survive: **CONFIRMED**

- No "items identified by refname/id only" framing: `<block_files>` in both files now opens with the three-layer identity paragraph.
- No bare-string-only endpoints: `<lens_views>` in both now documents the dual-form structured endpoints.
- `phases/` dir: `grep 'phases/'` over all four edited docs returns ONLY the corrected negation at skill-narrative.md:142 + SKILL.md:789 ("Phases are not a directory ... there is no `phases/` dir"). The READMEs replaced the `phases/` row with `objects/`. Phase block uses plural `phases` array_key — confirmed `samples/schemas/phase.schema.json:9,13`.

### Claim 3a — skill-narrative ↔ SKILL.md consistency: **CONFIRMED**

The five edited `<...>` sections are byte-identical between skill-narrative.md and the regenerated SKILL.md (diff shows the same insertions in both). SKILL `<tools_reference>` includes `promote-item` (:51), `migrate-content-addressed` (:65), `canonicalize-substrate` (:76). SKILL now carries 47 `<tool name=` descriptors (survey noted stale 45; regeneration closed the gap).

### Claim 3b — README accuracy (both): **CONFIRMED** (subpaths, layout, families) — except the promote-item description (Claim 6).

- Every exported subpath the pkg README documents (`content-hash`, `object-store`, `context-registry`, `promote-item`, `migrate-content-addressed`, `canonicalize-substrate`, `schema-migrations`, `land-identity-fields`, `read-element`, `dispatch-context`, plus block-api/schema-write/rename-canonical-id/samples-catalog/schema-validator/lens-view) resolves in `package.json` `exports` — 16/16 OK, none invented, none of the new ones missing.
- Every tool named in either README's family list exists among the 47 `registerTool` registrations in `src/index.ts` — no phantom tool, no phantom family.
- Root README layout additions (`.pi-context-registry.json`, `objects/`, `migrations.json`, `config.json` carrying `substrate_id`) are all real (object-store.ts, migrations-store.ts, context-registry.ts, config.schema.json `substrate_id`). Identity/registry paragraph (root README :99) matches code; it does NOT carry the promote-item behavioral error (lists promote-item only in the family enumeration).

### Claim 4 — no hardcoded tool count in prose: **CONFIRMED**

`grep -E '[0-9]+ tools?'` over both READMEs + skill-narrative.md returns nothing. Both READMEs explicitly defer the count to SKILL.md / `list-tools`.

### Claim 5 — no citation-rot, no stale substrate names: **CONFIRMED**

- Canonical-id-pattern literal scan over all four edited docs: ZERO hits.
- `.project-migrate` scan over all four: ZERO hits.

### Claim 6 — surface anything else: **REFUTED — promote-item misdescription (HIGH)**

The `promote-item` tool registered at `src/index.ts:1035` and backed by `src/promote-item.ts:1-19` is a **cross-substrate** operation: takes `source` + `destinationSubstrate` (alias) + optional `newRefname`/`dryRun`/`writer`, copies the source item's content projection into the destination substrate as a NEW content-addressed item (fresh oid/content_hash/object), and files an `item_derived_from_item` lineage edge into the destination relations.json. Its parameters contain no nested-array / dotted-path concept. The intra-substrate "promote every nested id-bearing array to a top-level entity block + ordinal-bearing membership edges" operation is performed by **`canonicalize-substrate`** (its own SKILL.md descriptor and `promotionTargets` parameter, src/index.ts).

The edited docs assert the opposite in five places:
- `packages/pi-context/README.md:68` — "nested entities are promoted to top-level blocks via the `promote-item` tool"
- `packages/pi-context/README.md:79` — "`promote-item` (nested → top-level entity + membership edge)"
- `packages/pi-context/README.md:104` (source-file table) — "Promotes a nested item to a top-level entity + membership edge (`promote-item` tool)"
- `packages/pi-context/skill-narrative.md:68` — "nested entities are promoted to top-level blocks via the `promote-item` tool"
- `packages/pi-context/skills/pi-context/SKILL.md:715` — same sentence (regenerated from narrative)

Root cause: the survey's PART B (`:91` and `:130`) states the same wrong attribution; the doc edit propagated it without checking against the live tool descriptor in the very SKILL.md it regenerated (which carries the correct cross-substrate description at SKILL.md:51). Remediation: in all five spots, attribute the nested-array→top-level-entity+membership-edge promotion to `canonicalize-substrate`, and (in the family lists) describe `promote-item` as cross-substrate derivation copy + lineage edge. The survey source should be corrected too, or future regenerations re-introduce it.

#### Minor over-statement (LOW)

skill-narrative.md / SKILL.md `<cross_substrate>`: "Any string containing `:` is first attempted as an alias parse." `resolveRef` uses `colon > 0` (`context-sdk.ts:~1521`), so a string with a leading `:` (index 0) is NOT alias-parsed — it is treated as a bare refname. Immaterial for documentation (a leading-colon endpoint is not a real locator), but the "any string containing `:`" wording is marginally broader than the code. No remediation required; noting for completeness.

---

## Findings table

| Severity | Finding | Evidence | Verdict |
|---|---|---|---|
| HIGH | `promote-item` described as intra-substrate nested-array→top-level promoter in 5 doc spots; the tool is actually cross-substrate derivation + lineage edge. The nested-array promotion is `canonicalize-substrate`. | `src/promote-item.ts:1-19`, `src/index.ts:1035-1057`, SKILL.md:51 (correct tool descriptor) vs README:68/79/104 + skill-narrative.md:68 + SKILL.md:715 (wrong). Origin: survey PART B :91/:130. | REFUTED |
| LOW | "Any string containing `:` is first attempted as an alias parse" — code gates on `colon > 0`, excluding leading-colon strings. | `context-sdk.ts` resolveRef colon-index branch. | over-statement, immaterial |
| — | Three-layer identity / oid mint / content-hash JCS / object-store deferral / floor+discretionary | block-api.ts:90,109,372-394,453,619,657; content-hash.ts:7,28,39,55; object-store.ts:17,76-90 | CONFIRMED |
| — | registry + resolveRef four-way + structured endpoints + ordinal | context-sdk.ts:1401,1489,1499,1552-1584; context-registry.ts:70,214,229; relations.schema.json:17-56 | CONFIRMED |
| — | validation codes (substrate_id_unregistered/_registry_mismatch, edge_endpoint_dangling/_unregistered, nested_id_bearing_array) | context-sdk.ts:1681,1696,1734,1742,1751,1759,1976 | CONFIRMED |
| — | migrations narrative ($id, version, migrations.json, identity/declarative-transform, read+write throw) | migrations-store.ts:64-82,90; schema-migrations.ts:89-122; block-api.ts:784,1749; config.schema.json:3 | CONFIRMED |
| — | all 16 documented exported subpaths resolve; all named tools exist (47 registered) | package.json exports; index.ts registerTool ×47 | CONFIRMED |
| — | no citation-rot, no `.project-migrate`, no surviving `phases/` dir, no hardcoded count, narrative↔SKILL identical | grep scans over 4 edited docs; phase.schema.json:9,13 | CONFIRMED |

---

## Counts by severity
- HIGH: 1
- LOW: 1
- (all other audited claims CONFIRMED)
