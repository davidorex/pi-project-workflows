# Enumeration of record — opaque planning-cycle vocabulary in source comments

Date: 2026-07-12. Produced by a read-only Explore enumeration (the agent type cannot write files; this file preserves its report verbatim). Grounds the planning-vocabulary jargon filing and its implementation.

## Scope & method
Swept all 7 packages' non-test `src` (`.ts`/`.js`, excluding `*.test.ts`/`*.spec.ts`) plus `scripts/` non-test, for the required patterns and every sibling noticed while reading. Resolved family meanings against the live `.context` substrate (`pi-context read-block-item`), the `analysis/` corpus (whose filenames are self-describing), and source self-annotations. Prior-art checked against FGAP-136 (read fresh) and TASK-128.

**Two packages are entirely clean:** `pi-behavior-monitors/src` and `pi-project-workflows/src` — zero planning-vocab hits. **23 distinct files** carry hits, concentrated in `pi-context/src` (15 files), `pi-jit-agents/src` (5), `pi-workflows/src` (3), `pi-agent-dispatch/src` (2), `pi-context-cli/src` (1).

---

## Prior-art verdict: UNTRACKED — filing justified

- **FGAP-136** (read fresh, status `closed`, `closed_by: TASK-108 … TASK-115`) is titled *"Internal tracker-ID citations in code comments are opaque jargon…"*. Its description, evidence, and `proposed_resolution` are exclusively about **ID-shaped tokens** (`FEAT-NNN, TASK-NNN, DEC-NNNN, FGAP-NNN, VER-NNN, JI-NNN`). It explicitly names the enforcement surface as `citation-rot-scanner.ts`'s `CITATION_RE` (an ID regex). Planning vocabulary that is *not* an ID is nowhere in its scope.
- **TASK-128** (status `completed`) is the residual sweep for the same ID class — *"comment citations of a framework-gap id"*, *"the archived predecessor substrate's feature id"*. Also strictly ID-scoped.
- The `analysis/2026-07-10-fgap-136-*-meaning-table.md` files are entirely ID→plain-English tables. The pi-context table's own note (row FGAP-136) confirms the de-jargon program is the tracker-ID rewrite.
- Searched `framework-gaps.json` for `planning vocabular|cycle vocabular|phase.?h|jargon` etc. — **no gap** covers the Cycle/Phase/Plan/Constraint/Bucket class.

**Conclusion:** the sibling ID-citation program (FGAP-136 + TASK-108–115 + TASK-128) is complete and ID-scoped; opaque *planning vocabulary* is a genuine untracked sibling class. Nothing to reuse; the filing is warranted.

## Tracker-ID zero-check (post-TASK-128)
- **`packages/*/src` comments: effectively ZERO real tracker-ID citations** — program success confirmed. The only `packages/*/src` matches are FALSE-POSITIVES: (a) `pi-context/src/ops-registry.ts` `examples:` array **values** (operator-facing CLI example command strings with synthetic ids like `TASK-001`, `DEC-0001` — not comments); (b) `pi-context/src/context.ts:492` uses `"FGAP-1"` as an **illustrative** string-key inside a comment explaining dedup-merge (the deliberately-excluded illustrative class named in the FGAP-136 closure).
- **`scripts/` non-test: tracker-ID comment citations REMAIN heavy** (dozens of files: `Per DEC-0019/0020`, `FGAP-026 closure arc`, `TASK-037 / Phase 2 sub-phase 2.4`, etc. in `scripts/orchestrator/*` and `scripts/migration/*`). These were outside TASK-128's file list. **If the new planning-vocab filing intends `scripts/` coverage, note that `scripts/` also still carries the ID class** — the ID program never reached `scripts/`.

---

## The planning-vocabulary families (classification + verified gloss)

### FAMILY 1 — "Cycle N" (the dominant family)
**Gloss (verified):** Cycles 1–10 are the implementation increments of the *content-addressed substrate identity* arc. Confirmed by self-annotations (`content-hash.ts:2` "content-addressed substrate identity (Cycle 2, Phase A)"; `context.ts:51` "content-addressed substrate identity, Cycle 3") and by the `analysis/2026-05-31-cycle{2..10}-*-adversarial-audit.md` filenames: Cycle 1 = dir-targeted `*ForDir` block-api primitives; Cycle 2 = content-hash + object-store; Cycle 3 = OID minting + per-item identity stamping; Cycle 4 = substrate registry + drift invariant; Cycle 5 = structured edge endpoints; Cycle 7 = SubstrateIndex split; Cycle 8 = `resolveRef` cross-substrate resolver + validator severity split; Cycle 9 = promote-guard; Cycle 9.1/9.2/9.3 = write-path ordering / nested-id guard / predicate hardening; Cycle 10 = active-substrate wiring + canonicalizer migration.
**Classification: (a) OPAQUE** — the cycle *number* is unresolvable from code; a maintainer cannot know "Cycle 8" = the resolver. Many sites carry a partial arc gloss ("content-addressed substrate identity, Cycle 3") which locates the arc but the ordinal remains dead weight. The `"Cycle-1 *ForDir pattern"` sites are borderline (b) because the pattern is named and cross-referenced (`cf. relationsPathForDir`), but "Cycle-1" itself is jargon.

Representative packages/*/src sites (family is ~70+ hits):
- `pi-context/src/block-api.ts`: `:87` "Cycle 3 / carried item 1; v3 spec §A2", `:124` "Cycle-2 surface enumerated", `:159` "Cycle 2 / Phase A", `:612` "Content-addressed identity stamping (Cycle 3 / Phase C)", `:1445`, `:1926`, `:1983`; `:806,838,1070` "(Cycle 9.1 P6)"; `:1727,1937` "(Cycle 9.1 P4)"
- `pi-context/src/context.ts`: `:51,54,374` (Cycle 3), `:371` "(…arc, Cycle 5)", `:379,380` (Cycle 8 / F2), and the `*ForDir` cluster `:561,576,622,720,767,822,857,896,928,1329` "the Cycle-1 `*ForDir` pattern", `:561,627,1334` "Cycle-10 canonicalizer"
- `pi-context/src/context-sdk.ts`: `:1313` "(Cycle 7 / Phase F1)", `:2084,2158,2161` "Endpoint resolution (Cycle 8 / Phase F2)", `:2614` "Cycle 4", `:2835` "Cycle 9.2"
- `pi-context/src/{content-hash,object-store,migrations-store,promote-item,schema-write,context-dir,context-registry,execution-context,ops-registry}.ts` (Cycle 2/3/9/9.2/9.3/10/1/5 references throughout)
- `pi-jit-agents/src/compile.ts:248`, `pi-workflows/src/render-by-id.ts:73` "F1 (Cycle 7): buildIdIndex now returns a SubstrateIndex"

### FAMILY 2 — "Phase X" lettered spine (A–H) + numbered dev-phases
**Gloss (verified):** Phase A–H is the letter spine of the *same* content-addressed-identity arc (A = content-hash, B = object-store, C = identity stamping, D = registry, E = structured endpoints, F1/F2 = index split / resolver, G2 = promote, H/H1 = the content-addressing data migration that registers legacy substrates + converts string endpoints). "Phase H" is specifically the **not-yet-run migration** that registers each legacy substrate and migrates the 30 `project:` string endpoints (`context-registry.ts:10`, `context-sdk.ts:2099,2180,2182,2214,2250,2620,2839,2864`). Separately, "Phase 2.1–3.2" in `execution-context.ts:12,14,18,55` are TASK-era dev phases of the query-surface work, and "Phase 1.2 / Phase 7 cascade" in `context-dir.ts:21,27,36` and "Phase 1 of the pi-context-cli arc" in `ops-registry.ts:12` are unrelated dev-phase numbering.
**Classification: (a) OPAQUE.** The most load-bearing instance is the `resolveRef` JSDoc "Phase H" cluster.

Key sites: `context-registry.ts:10,186`; `context-sdk.ts:2099,2180,2182,2214,2250,2620,2839,2864`; `context.ts:391,726`; `context-dir.ts:21,27,36`; `execution-context.ts:12,14,18,55`; `content-hash.ts:3`; `object-store.ts:2`; `block-api.ts:160,612,928` ("pre-Phase-0 ordering"); `pi-workflows/src/types.ts:50` "@deprecated Phase 6 — nested workflow invocation".

### FAMILY 3 — "Plan N / Wave N" (pi-jit-agents + pi-workflows)
**Gloss (verified — `analysis/2026-05-02-per-item-macros-atomic-plans.md`):** the "per-item macros" work was decomposed into 8 atomic plans over 4 waves. **Plan 4** (Wave 2) = the `compileAgent` integration honoring the object-form `contextBlocks` shape (item resolution, depth/focus threading, bare-string back-compat). **Plan 4.1** = a follow-up patch to Plan 4 fixing multi-entry-same-name silent collision (array-slot injection). **Plan 5** = `x-prompt-budget` annotation + renderer enforcement. **Plans 6/7/8** = the per-item render macros (render_decision, the five newer macros, the twelve legacy macros as derived views). **Wave 1** = plans 1,2,3,5; **Wave 2** = plan 4.
**Classification: (a) OPAQUE.**

Sites: `pi-jit-agents/src/compile.ts:9` (P1 anti-injection), `:286,288,292,303,403` (Plan 4 / Plan 4.1); `pi-jit-agents/src/types.ts:58,74,84,86,116` (Plan 4 / Wave 2); `pi-jit-agents/src/budget-enforcer.ts:9` (Plan 5); `pi-jit-agents/src/renderer-registry.ts:4,20` (Wave 1 / Plan-6/7/8); `pi-jit-agents/src/agent-spec.ts:104` (Plan 4 / Wave 2); `pi-workflows/src/test-helpers.ts:122` and `pi-workflows/src/render-by-id.ts:33` (Plan 6/7/8).

### FAMILY 4 — F/G/P sub-designators (F1, F2, G2, P4, P6, P1)
**Gloss (verified):** within-cycle work-labels: **F1** = the SubstrateIndex split (Cycle 7); **F2** = the `resolveRef` cross-substrate resolver (Cycle 8); **G2** = `promoteItem` (Cycle 9); **P4/P6** = write-path ordering sub-tasks in Cycle 9.1 (P4 = nested id-uniqueness guard, P6 = post-validation object persistence — both self-annotated in `runtime-demo-write-ordering.ts`); **P1** = framework-level anti-injection wrapping (compile.ts:9).
**Classification: (a) OPAQUE** (the letter+number carries no meaning without the plan doc).
Sites: `context.ts:379,1820,1868` ("F2 resolver"); `context-registry.ts:9,211`; `context-sdk.ts:1324,1327,1432,1433,1487,2670` (F1/F2, "DEC §F2"); `promote-item.ts:2` (G2); `block-api.ts:806,838,1070,1727,1937` (P6/P4).

### FAMILY 5 — "Constraint N" (locked Cycle-8 resolver design)
**Gloss (verified — self-annotated + `analysis/2026-05-31-cycle8-resolver-adversarial-audit.md`):** the numbered constraints of the locked `resolveRef` design. **Constraint 3** = the per-pass foreign-index cache (`context-sdk.ts:2663`). **Constraint 4** = only structured `lens_bin` endpoints are routed through item resolution — "the corruption-risk surface" (`context.ts:383`; `context-sdk.ts:2164`; `context.ts:449`).
**Classification: borderline (b)/(a)** — every site pairs the number with an inline gloss, so the *meaning* is recoverable but the *ordinal label* is dead-weight jargon. Also `context-sdk.ts:2161` "Algorithm (the locked Cycle-8 design)".

### FAMILY 6 — "Bucket-N" (tool authorization taxonomy)
**Gloss (verified):** Bucket-1 = built-in read-only file-system tools always granted — **defined inline** at `pi-context-cli/src/pi-bound.ts:31`. Bucket-2 = the sensitive-substrate-write tools requiring an affirmative operator confirm (the `AUTH_REQUIRED_TOOLS` allowlist), extensively described across `auth-gate.ts`.
**Classification:** Bucket-1 = **(b) LOCALLY-DEFINED**; Bucket-2 = **(a) OPAQUE numbering** (the file describes the *set* but never the bucket taxonomy).
Sites: `pi-agent-dispatch/src/auth-gate.ts:18,24,34,70`; `pi-agent-dispatch/src/index.ts:88,90`; `pi-context-cli/src/pi-bound.ts:31`.

### FAMILY 7 — "carried item N" (Cycle-3 spec carry-forward list)
**Gloss:** numbered items carried forward from the content-addressed-identity v3 spec into Cycle 3. "carried item 1" = the identity/addressing field partition (`block-api.ts:87,382,519`); "carried item 2" = the informed-authorization confirm surface (`block-api.ts:410`, `auth-gate.ts:166`).
**Classification: (a) OPAQUE** — the enumeration is unrecoverable from code; the referent is a spec-doc bullet list.

### FAMILY 8 — "locked decision N" (Cycle-3 locked decisions)
**Gloss:** numbered decisions locked for Cycle 3 identity stamping — decision 1 = the stamping-gate no-op (only arrays whose subschema declares identity fields get stamped); decision 2 = no lazy mint-on-read; decision 3 = oid is immutable. All are self-annotated at their sites but the *number* is jargon.
**Classification: borderline (a)/(b)** — glossed inline (e.g. `block-api.ts:663` "locked decision 3: oid is immutable"; `context-dir.ts:485`; `context-sdk.ts:2249`). Sites: `block-api.ts:170,345,554,645,663,1983`, `context-dir.ts:485`, `context-sdk.ts:2249`.

### FAMILY 9 — misc numbered design-artifacts
- `context-sdk.ts:2874` "Lens-validator dispatch (Step 7 / pi-context Divergence 3)" — **"Divergence 3"** is a numbered divergence from some design comparison. **(a) OPAQUE.**
- `§A2` / `§F2` / `v3 spec §` section-references: `block-api.ts:87,106,382` ("v3 spec §A2"), `context-sdk.ts:2670` ("DEC §F2"). **(a) OPAQUE** (point into an external spec doc).

---

## FALSE-POSITIVES (c) — do not rewrite
- `pi-context/src/context.ts:74` — "the P0..P3 gap rank" — real config value (gap-priority enum), self-defining domain vocabulary.
- `pi-workflows/src/workflow-executor.ts:987` — "// P7: Truncate completion message…" — a self-contained numbered inline comment step.
- `pi-context/src/ops-registry.ts` `examples:` array values (`TASK-001`, `DEC-0001`, …) — operator-facing CLI example command strings, not comments.
- `pi-context/src/context.ts:492` — illustrative `"FGAP-1"` string-key inside a dedup-merge comment (excluded-illustrative class).
- `scripts/orchestrator/extract-mandates.ts:24–72` — `id: "mandate-001".."mandate-009"` are the script's own data records; `scripts/orchestrator/runtime-demo-write-ordering.ts` `id:"P1"` is fixture data.
- The `"phase"` domain noun in pi-workflows (workflow-step sense) — the only pi-workflows planning hit is the genuine `"Phase 6"` at `types.ts:50` (Family 2).

## LOCALLY-DEFINED (b) clusters in `scripts/` (non-test)
`scripts/` mirrors Families 1–4 heavily (Cycle/Phase/Plan/F/G/P) but most sites are **self-contained**: the runtime demos and migration engines define their `STEP 0…STEP 6` sequences inline in the same file header (`scripts/migration/lib/migrate-content-addressed.ts`, `scripts/migration/lib/canonicalize-substrate.ts`, `scripts/orchestrator/migrate-strip-content-pin.ts`). The prompt's exact "STEP 1 allowlist" phrase was not found in current source — the only `STEP 1` sites are the self-defined migration sequences. The runtime-demo headers still cite Cycle/Phase families opaquely (e.g. `scripts/orchestrator/runtime-demo-resolve-ref.ts:2` "Cycle 8 / Phase F2", `scripts/migration/lib/migrate-content-addressed.ts:2` "§H content-addressing migration (Cycle 10 / Phase H1)") — same OPAQUE class as packages.

---

## Size summary (for the rewrite)
| Family | Classification | packages/*/src hits (approx) | Files |
|---|---|---|---|
| 1. Cycle N | (a) OPAQUE | ~70 | block-api, context, context-sdk, context-registry, context-dir, content-hash, object-store, migrations-store, promote-item, schema-write, execution-context, ops-registry, compile, render-by-id |
| 2. Phase A–H + dev-phases | (a) OPAQUE | ~30 | context-registry, context-sdk, context, context-dir, execution-context, content-hash, object-store, block-api, pi-workflows/types |
| 3. Plan N / Wave N | (a) OPAQUE | ~15 | compile, types, budget-enforcer, renderer-registry, agent-spec (jit); test-helpers, render-by-id (workflows) |
| 4. F/G/P sub-designators | (a) OPAQUE | ~20 | context, context-sdk, context-registry, promote-item, block-api, compile, render-by-id |
| 5. Constraint N | (a)/(b) glossed | 4 | context, context-sdk |
| 6. Bucket-N | Bucket-2 (a); Bucket-1 (b) | 7 | auth-gate, index (dispatch); pi-bound |
| 7. carried item N | (a) OPAQUE | 5 | block-api, auth-gate |
| 8. locked decision N | (a)/(b) glossed | 8 | block-api, context-dir, context-sdk |
| 9. Divergence 3 / §-refs | (a) OPAQUE | ~6 | context-sdk, block-api |

Two families carry inline glosses making meaning recoverable (5 Constraint, 8 locked-decision) — the ordinal labels are still dead weight; the rest are genuinely opaque. The `pi-context/src` package (esp. `block-api.ts`, `context.ts`, `context-sdk.ts`) is the epicentre.

All meanings above are verified against the substrate, the `analysis/` corpus, or in-file self-annotation — none are guessed. No family's referent was unrecoverable.
