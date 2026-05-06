Technical missteps preserved if we keep all post-release code:

**1. `ID_PREFIX_TO_BLOCK` hardcoded** (`project-sdk.ts:580+`). 11 prefixes in TS literal; root cause of issue-089 + 4 undeclared prefixes (audit).
→ derive from `config.block_kinds[].prefix`; deprecate hardcoded table.

**2. `STATUS_VOCABULARY` hardcoded** (`roadmap-plan.ts`). FGAP-013.
→ move to `config.status_buckets`; loadConfig provides the mapping.

**3. Validation-code names as TS string literals** (`roadmap_lens_missing` etc. in validateRoadmaps). Display-string-as-identity.
→ codes stay opaque slugs; display strings via `config.display_strings`.

**4. Priority enum mismatch** (`issues.schema.json` [low/medium/high/critical] vs `framework-gaps.schema.json` [P0–P3]). FGAP-016.
→ `config.priority_buckets` canonical registry; schema $ref to shared fragment; data migration.

**5. Schema lifecycle/severity/method enums diverge across 14+ schemas**. FGAP-016 broader form.
→ same as #4 generalized: $ref to canonical registries per dimension.

**6. PM-shape baked into pi-project namespace** (roadmap-plan.ts + validateRoadmaps wired into validateProject + roadmap_* validation codes).
→ pi-project → pi-context rename; roadmap-plan content stays as PM-lens module within pi-context; validateProject calls per-lens validators registered via config rather than imported by name.

**7. validateRoadmaps milestone-ordering** (independent vs gated unforced choice). issue-088.
→ ratify current independent choice via DEC, OR change to gated; one or the other.

**8. PLAN- prefix collision** (layer-plans vs new plan block). issue-089.
→ under #1 (config-driven prefix): pick one (rename layer-plans' PLAN- → LPLAN-, or retire layer-plans); migrate data; update resolve-id.test.ts:114.

**9. Nested-array traversal blind spot** in `buildIdIndex` (audit). 34 TASK-NNN-NN, 9 STORY-, 7 PHASE-N nested ids invisible.
→ recursive walker option in buildIdIndex; or accept limitation with explicit doc-comment.

**10. First-match-wins `startsWith` ordering hazard** (`expectedBlockForId`).
→ replace `startsWith` with longest-prefix-match; add test guarding prefix overlap.

**11. Registry vs `.project/`-schemas asymmetry** (12 registry schemas declare `id: {type:"string"}` with no pattern; project versions constrain).
→ port patterns from project-side schemas to registry; or accept asymmetry as deliberate strict-vs-loose tier.

**12. No `$id`/version/$ref composition in schemas** (FGAP-006).
→ add `$id` + `version` field per schema; introduce shared fragments (priority-fragment.schema.json, status-fragment.schema.json); schema-validator reads version; migration registry.

**13. No authorship attestation** (FGAP-004). block-api doesn't stamp created_by/modified_by/at.
→ extend block-api signatures with DispatchContext carrying writer identity; stamp on every write; schemas add the four fields.

**14. No canonical schema-write surface** (FGAP-011). Schemas mutated via direct fs Edit.
→ block-api `writeSchema`/`updateSchema`; AJV-validate against meta-schema; route schema edits through.

**15. POC B/I shared cache path** (issue-090). Order-dependent output drift.
→ separate `.cache-hashes-r1.json` / `.cache-hashes-r2.json`; or treat cache as ephemeral with mandatory clean-at-start.

**16. Direct fs writes by monitors** (issue-065). Produced two malformed monitor entries already removed twice.
→ monitor write-actions route through block-api appendToBlock with target-schema validation; reject malformed payloads at write time.

**17. Decision lifecycle missing broadened-by state** (FGAP-015). `superseded` enum mis-fits enacted→broadened.
→ add fourth enum value (`extended`); transition rule reachable-from-enacted; rebadge any historical enacted→superseded that were actually broadenings.

**18. SKILL.md regens land in every code commit**. Build-artifact noise.
→ accept (working as designed) OR gitignore + regenerate-on-demand. No structural fix needed.

Refactor sequencing: #12 (schema versioning) blocks several others; #1+#2+#5 close together via config-driven vocabulary substrate; #6 is the rename; #7+#8 await decisions; #9–#11 are smaller targeted fixes; #13+#14+#15+#16+#17 are orthogonal.