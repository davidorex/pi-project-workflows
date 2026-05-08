# Plan B — Revert to v0.24.2 (3a7856c) and Rebuild Under pi-context

## 1. Position

The 39-commit post-release arc was authored under a now-superseded frame (`pi-project` as PM-flavored substrate) and verified through a self-admittedly shallow loop ("tests-pass + lint-clean + spot-check, not substantive design audit" — `analysis/2026-05-06-repo-cleaning-guide.md:17`). Fix-forward preserves that authorship lineage and the suspect-process baseline along with it: every kept file inherits the unaudited trust ceiling, and every misstep that *can* be forward-fixed gets carried as a retrofit rather than authored correctly the first time. Reverting to `3a7856c` discards the code while preserving the substrate the post-release arc actually produced — `analysis/`, `memory/`, `.project/` — which is the design-source-of-truth for rebuild. The rebuild then authors the same surface against pi-context's structural correctness rules from line 1: config-driven vocabulary, `$id`/version/`$ref` schemas, AJV-at-write authorship stamps, opaque slugs, longest-prefix-match resolution, recursive id index. Every misstep in `analysis/May 7 Technical missteps for Repo Stablizing.md` becomes a thing-not-done rather than a thing-to-undo.

## 2. Concrete revert-and-rebuild roadmap

### 2.1 Revert mechanic

**Command (single-shot, working tree clean per `git status`):**

```
git reset --hard 3a7856c
```

`git reset --hard` (not `git revert`) is canonical here because:

- `git revert` of 39 commits produces 39 inverse commits and an unreadable history; the goal is a clean baseline, not a documented undo trail. The post-release arc *is* the documented undo trail (commits + analysis MDs).
- The release tag `v0.24.2` already names the baseline; `git revert` would put HEAD ahead of the tag with anti-content, which is semantically wrong.
- `feedback_no_destructive_git_ops.md` requires explicit user instruction for `reset --hard`; this entire document is the instruction-defense, not the execution.

**Preservation step (run BEFORE `reset --hard`):**

The substrate produced post-release lives in three trees that are NOT in the `3a7856c` snapshot:

- `analysis/` — 19 new MDs (per `git diff 3a7856c..HEAD --stat -- analysis/`); these are gitignored at top-level (`feedback_docs_reports_gitignored.md`-adjacent — but `analysis/` itself IS tracked, confirmed by `git log` of `analysis/2026-04-25-pi-bypass-arc-fragilities.md` predating the release). They MUST be preserved.
- `memory/` — auto-memory MDs at `~/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/`; these live OUTSIDE the repo and are unaffected by `git reset`.
- `.project/` — typed blocks with DEC-0006..DEC-0013, FGAP-001..FGAP-016, issue-066..issue-090. These are tracked in-repo and WILL be wiped by `reset --hard`.

Preservation procedure:

```
mkdir -p /tmp/revert-preserve
cp -R analysis /tmp/revert-preserve/
cp -R .project /tmp/revert-preserve/
git reset --hard 3a7856c
cp -R /tmp/revert-preserve/analysis ./analysis
cp -R /tmp/revert-preserve/.project ./.project
git add analysis .project
git commit -m "chore(substrate): preserve post-release substrate (analysis + .project) atop reverted v0.24.2 baseline"
```

The single preservation commit lands the substrate-arc design-source-of-truth on top of the clean code baseline. Memory persists across the operation untouched (lives outside repo).

### 2.2 Per-pre-session-commit rebuild path

Five commits carry load-bearing code that must be re-authored. The order below preserves dependency: substrate-SDK → install → PROJECT_DIR retrofit → consumption surface → skill generator. Each is rebuilt by a fresh-context subagent briefed against the preserved substrate.

#### Rebuild item R1 — Substrate SDK port (originally 8059764)

**Brief shape (subagent input):**

- Goal: land `loadConfig`, `loadRelations`, `getProjectContext`, `synthesizeFromField`, `edgesForLens`, `walkDescendants`, `groupByLens`, `validateRelations`, `displayName`, `listUncategorized` in the substrate package.
- Design source: `analysis/poc-degree-zero-lens/render.ts` (the empirical demonstration); `analysis/poc-degree-zero-lens/schemas/{config,relations}.schema.json`.
- Authoring corrections vs original 8059764:
  - Schemas land with `$id` (e.g., `https://davidorex.dev/pi-context/schemas/config.json`) and `version: "1.0.0"` from line 1 — closes FGAP-006 at authoring rather than as a backfill misstep #12.
  - `ConfigBlock` type carries `block_kinds[]` (`{canonical_id, display_name, prefix, schema_path, array_key, layer, lifecycle?}`), `status_buckets`, `relation_types[]`, `display_strings`, `priority_buckets`, `layers[]` from the start — closes missteps #1, #2, #4, #5, #17 by authoring the config-driven substrate as the FIRST shape rather than retrofitting hardcoded TS literals later.
  - No `ID_PREFIX_TO_BLOCK` constant. Resolver derives `prefix → canonical_id` from `config.block_kinds[]` at load time.
  - `expectedBlockForId` uses longest-prefix-match — closes misstep #10 at authoring.
  - `buildIdIndex` walks nested arrays recursively via an explicit recursive walker — closes misstep #9 at authoring.
- Package name: `@davidorex/pi-context` (NOT `@davidorex/pi-project`). See §2.3.
- Output location: `packages/pi-context/src/context-sdk.ts` and `packages/pi-context/src/project-context.ts` (substrate types live alongside SDK from the start; no later extraction needed because there is no project-sdk.ts to extract from).
- Constraints: AJV at every read via `schema-validator.ts:47`; no parallel AJV (issue-069 discipline encoded as a contract from line 1).

**Estimated subagent runs:** 2 — one author run, one adversarial-audit run by a fresh-context agent (per `feedback_adversarial_audits_not_self_audits.md`).

#### Rebuild item R2 — `/project install` mechanism (originally 53ebe39)

**Brief shape:**

- Goal: opt-in installable assets at `packages/pi-context/registry/{schemas,blocks}/`; `installProject(cwd, options)` reads `config.installed_schemas[]` + `config.installed_blocks[]` and copies named assets.
- Design source: post-release `.project/decisions.json` (DEC-0011) carries the full enacted decision; commit message of `53ebe39` documents the actual code shape (initProject reduced to dir-creation + minimal-config bootstrap; idempotent).
- Authoring corrections:
  - Registry schemas land with the `$id`/version/`$ref` apparatus from R1 already in place. They `$ref` shared fragments (`priority.schema.json`, `status.schema.json`, `severity.schema.json`) authored alongside — closes misstep #11 (registry/.project schemas asymmetry) and #12 (no $ref composition) at authoring.
  - Schema-write surface (`writeSchema`/`updateSchema` on block-API) is authored in the same commit, not deferred to FGAP-011 — closes misstep #14 at authoring.
- Output: 22 byte-identical block + schema asset moves are NOT byte-identical here; they are re-authored under the new conventions. ~13 schemas + 9 starter blocks, all with `$id` + version.

**Estimated subagent runs:** 2 (author + adversarial audit). Schemas are mechanical given R1's contract; the audit checks each `$ref` resolves and each prefix is declared in `block_kinds[]`.

#### Rebuild item R3 — PROJECT_DIR retrofit (originally 2b42760)

**Brief shape:**

- Goal: every path-construction site in pi-context + pi-jit-agents + pi-workflows composes `projectRoot(cwd)` instead of hardcoding `PROJECT_DIR`.
- Design source: `.project/issues.json` issue-077 enumeration + commit `2b42760`'s message; `analysis/2026-05-05-pi-context-rename-touched-items.md` lists the consumption sites.
- Authoring corrections:
  - In a clean rebuild the retrofit is NOT a retrofit — `projectRoot(cwd)` ships in R1's `project-context.ts` and every path-helper in R1+R2 already calls it. There is no consumer-side patch wave because there are no consumers authored against `PROJECT_DIR`.
  - `.project/` bootstrap exemption (config.json + relations.json at literal `<cwd>/.project/`) is documented in the module docstring at first authoring.
- Output: same `project-context.ts` module already produced by R1, with path helpers exported. pi-workflows' 8 files (`step-block.ts`, `step-shared.ts`, `template-validation.ts`, `test-helpers.ts`, `workflow-executor.ts`, `workflow-sdk.ts`, `integration.test.ts`, `render-budget-overflow.test.ts`) and pi-jit-agents' 3 files (`agent-spec.ts`, `compile.ts`, `template.ts`) are authored against `projectRoot(cwd)` from line 1.

**Estimated subagent runs:** 1 — this collapses into R1+R2 because retrofit is only a retrofit when there's pre-existing wrong code. In a rebuild there isn't.

#### Rebuild item R4 — Consumption surface (originally ad03a00 + 048a2ac + b7bf11b + 5f852b1)

**Brief shape:**

- Goal: `lens-view.ts` module exporting `loadLensView`, `renderLensView`, `buildCurationSuggestions`, `resolveComposition`, plus `/project view`, `/project lens-curate` subcommands and `project-validate-relations`, `project-edges-for-lens`, `project-walk-descendants`, `project-resolve-composition`, `project-status-rollup` tools.
- Design source: post-release `packages/pi-project/src/lens-view.ts` (~70% lens-agnostic, direct adoption per `analysis/2026-05-05-pi-context-executive-summary-candidate.md:60`); `analysis/poc-degree-zero-lens/render.ts` for the algorithmic core; `analysis/poc/pi-context-poc/E-relation-type-registry/` for the relation-type registry shape; `analysis/poc/pi-context-poc/H-producer-vs-observer-status/` for the status-bucket shape.
- Authoring corrections vs the four originating commits:
  - PM-shape (roadmap-plan.ts) authored as `packages/pi-context/src/lenses/pm-lens.ts` — a registered lens module, NOT pi-context-namespace code. Closes misstep #6 at authoring.
  - `STATUS_VOCABULARY` is read from `config.status_buckets`, not declared as a TS literal at `roadmap-plan.ts:55` — closes misstep #2 at authoring.
  - Validation codes (`roadmap_lens_missing` etc.) remain opaque slugs; display strings come from `config.display_strings` — closes misstep #3 at authoring.
  - LensSpec carries `kind: "target" | "composition"` discriminator from line 1 — closes FGAP-012 at authoring rather than as a step-3 envelope landing.
  - `validateProject` calls per-lens validators registered via `config.relation_types[]` rather than imported by name — closes misstep #6 generalization.
  - PLAN- prefix collision (issue-089) is structurally impossible: both `plan` and `layer-plans` declare prefixes in `config.block_kinds[]`, and registration-time validation forbids duplicates. The choice between renaming `layer-plans` PLAN- → LPLAN- vs retiring `layer-plans` is made BEFORE schema-authoring rather than AFTER (misstep #8 closure at design-time).
  - Milestone-ordering choice (issue-088) is decided in writing before code is authored, not surfaced as emergent behavior — closes misstep #7 at authoring.
- Block-API authorship stamps (`created_by`, `created_at`, `modified_by`, `modified_at`) ship in this rebuild's block-API rather than as FGAP-004 backfill — closes misstep #13 at authoring.
- Monitor write-actions route through `appendToBlock` with target-schema validation, rejecting malformed payloads at write-time — closes misstep #16 at authoring (the two malformed monitor entries that landed twice in post-release simply cannot land).

**Estimated subagent runs:** 3 — split as (a) lens-view + composition-dispatch author, (b) PM-lens module author, (c) consolidated adversarial audit covering both.

#### Rebuild item R5 — Skill generator retarget (originally 9ff3445)

**Brief shape:**

- Goal: `scripts/generate-skills.js` reads `packages/pi-context/registry/` and emits `<installable_blocks>` + `<installable_schemas>` XML sections in SKILL.md.
- Design source: commit `9ff3445`'s message + `scripts/generate-skills.js` lines 132 / 221 / 748 from post-release tree.
- Authoring corrections:
  - "registry" (not "defaults") from line 1; no path-string transitions in code. Misstep was a transition state in post-release; in rebuild there is no transition.
  - `<planning_vocabulary>` XML block reads from `registry/schemas/` from first authoring — no silent-null-drop period exists.
  - SKILL.md noise discipline (misstep #18) is decided at first authoring: regenerated artifacts checked in OR gitignored. Decision is recorded in `.project/decisions.json` before rebuild begins.

**Estimated subagent runs:** 1 — generator code is mechanical; existing post-release `scripts/generate-skills.js` is the design source.

#### Rebuild item R6 — Test suite

**Brief shape:**

- Re-author the test suites that originally landed in 8059764, 53ebe39, 2b42760, ad03a00, 048a2ac, b7bf11b, 5f852b1, c5c4725: `project-sdk.substrate.test.ts`, `install-subcommand.test.ts`, `block-api.config-root.test.ts`, `project-context.test.ts`, `lens-view.test.ts`, `composition.test.ts`, `roadmap-plan.test.ts`, `substrate-schemas.test.ts`.
- Design source: existing post-release test files are the spec-as-test source-of-truth for behavior; rebuild re-implements the assertions against the new (config-driven, `$id`-bearing, longest-prefix-match) shapes.

**Estimated subagent runs:** 2 — one author run paralleling R1+R2+R4, one adversarial run.

### 2.3 Why pi-context naming from line 1

**Decision: rebuild as `@davidorex/pi-context`, not `@davidorex/pi-project`.**

Rationale (drawn directly from `analysis/2026-05-05-pi-context-executive-summary-candidate.md:73-90`):

1. The substrate is typed-context, not project-management. Continuing to author into `pi-project` perpetuates the misnomer the executive summary calls out at line 4.
2. Renaming later costs the same npm-name change + peer-dep updates + internal source renames (`project-sdk.ts → context-sdk.ts`) — but ALSO costs a deprecation cycle of `@davidorex/pi-project` and a migration arc of touched-items per `analysis/2026-05-05-pi-context-rename-touched-items.md`. Renaming-from-line-1 makes that touched-items migration a non-event.
3. PM is one *lens* over the substrate (per executive summary line 9). Authoring `pi-context/src/lenses/pm-lens.ts` from line 1 closes misstep #6 structurally; authoring `pi-project/src/roadmap-plan.ts` and renaming it later is the misstep.
4. Issue-089 (PLAN- prefix collision), FGAP-013 (status registry), the four undeclared prefixes — all close as same-class structural impossibilities under `pi-context`'s config-driven `block_kinds[]`. Naming `pi-project` from rebuild and adding `block_kinds[]` later means those issues exist for the duration of the gap.

Internal consumer references in pi-jit-agents + pi-workflows + pi-behavior-monitors update to `@davidorex/pi-context` peer-dep + `import` strings during R3. The meta-package `@davidorex/pi-project-workflows` renames to `@davidorex/pi-context-workflows` (per executive summary line 67). User-facing `.project/` directory naming is preserved (no consumer-site data migration; per executive summary line 80).

## 3. Total subagent-run estimate

| Item | Author runs | Audit runs | Notes |
|---|---|---|---|
| R1 substrate SDK | 1 | 1 | POC + schemas as design source |
| R2 install + registry | 1 | 1 | Mechanical given R1 contract |
| R3 PROJECT_DIR retrofit | 0 | 0 | Collapses into R1+R2 |
| R4 consumption surface | 2 | 1 | lens-view + PM-lens split |
| R5 skill generator | 1 | 0 | Mechanical, no novel design |
| R6 test suite | 1 | 1 | Parallel to R1+R2+R4 |
| **Total** | **6** | **4** | **10 subagent runs** |

Comparison: fix-forward as scoped in `analysis/2026-05-07-per-file-disposition-synthesis.md` requires per-misstep refactor PRs (~14 REFACTOR-IN-PLACE items × ~1.5 runs each for author+audit) + ~6 RE-DERIVE items × ~2 runs each = ~33 runs minimum, all on a substrate that *also* needs the per-commit substantive trust audit (estimated 11 runs at one fresh-context audit per envelope commit). Fix-forward total ≈ 44 runs to reach the same structural-correctness baseline rebuild reaches in 10.

## 4. What's gained by clean rebuild

1. **Structural correctness baseline.** Every misstep in the missteps-doc is a thing-not-done in the rebuild rather than a thing-to-undo. `ID_PREFIX_TO_BLOCK` (project-sdk.ts:580), `STATUS_VOCABULARY` (roadmap-plan.ts:55), validation-code TS string literals (roadmap-plan.ts ~lines 1080/1155/1194), priority-enum drift (issues vs framework-gaps), severity/lifecycle/method enum divergence across 14+ schemas — all simply do not get written.
2. **No-suspect-process baseline.** `analysis/2026-05-06-repo-cleaning-guide.md:17` flags that the per-commit substantive trust audit was never performed on c5c4725, b7bf11b, 5f852b1, 428d29a, 7f1596c, 048a2ac, ad03a00, 9ff3445. Rebuild discards the suspect code; substantive audit happens once, on the rebuilt code, by a fresh-context adversarial agent — the audit primitive `feedback_adversarial_audits_not_self_audits.md` actually requires.
3. **pi-context naming from line 1.** No rename arc (`analysis/2026-05-05-pi-context-rename-decomposition.md` becomes obsolete), no transition state where docs say "project" and code says "context," no peer-dep churn, no `.project/` directory naming awkwardness.
4. **Config-driven vocabulary substrate baked in, not retrofitted.** `block_kinds[]`, `status_buckets`, `relation_types[]`, `display_strings`, `priority_buckets`, `layers[]` — every identity-bearing token authored once, in config, validated at registration. Adding a new block kind is a config edit + schema file (executive-summary line 31). Compare to the post-release tree where `ID_PREFIX_TO_BLOCK` lives at `project-sdk.ts:580`, `STATUS_VOCABULARY` at `roadmap-plan.ts:55`, validation codes scattered across roadmap-plan.ts as TS string literals.
5. **Schema versioning ($id/version/$ref) at first authoring.** FGAP-006 closes by authoring rather than backfill. Shared fragments (`priority.schema.json`, `status.schema.json`, `severity.schema.json`) compose from line 1; cross-schema enum divergence (misstep #5) does not have a window to occur.
6. **Authorship attestation at first authoring.** FGAP-004 closes by including `created_by`/`created_at`/`modified_by`/`modified_at` in every block-API write signature from R2; no schema-migration to backfill them across existing data.
7. **Schema-write surface at first authoring.** FGAP-011 closes; direct fs Edit of schemas (the bypass that enabled multiple post-release missteps) is structurally absent because `writeSchema`/`updateSchema` are the only authoring paths.
8. **Lens-of-lenses + closure-table-only edges from line 1.** DEC-0009, DEC-0012, DEC-0013 all enacted as the FIRST shape rather than as supersession entries reframing earlier authoring. No inline `depends_on` parallel storage ever exists.

## 5. Why fix-forward is inferior

Fix-forward is honestly appealing: ~30 KEEP files do not need to move (`analysis/2026-05-07-per-file-disposition-synthesis.md:3-13`), tests are passing, runtime is reachable, the substrate-arc thesis is empirically demonstrated. The argument for fix-forward is "the code works; the missteps are tractable retrofits."

Three concrete cost components defeat that argument:

### 5.1 Preserved missteps as retrofits

Each REFACTOR-IN-PLACE item carries its misstep through the retrofit period:

- **Misstep #1 (`ID_PREFIX_TO_BLOCK` at project-sdk.ts:580):** under fix-forward, retrofit means deriving the table from `config.block_kinds[]` while the literal still ships in the next 1+ release. Two paths exist in the codebase — the literal AND the derivation — for the duration of the retrofit cycle. `feedback_no_parallel_ungated_paths.md` flags this as the antipattern: adding a config-driven derivation next to the unrestricted literal is not enforcement.
- **Misstep #6 (PM-shape baked into pi-project namespace):** fix-forward keeps `roadmap-plan.ts` in pi-project's source tree, then renames the package, then extracts to a lens module. Three steps with two intermediate states where the namespace is wrong. Rebuild authors `pi-context/src/lenses/pm-lens.ts` directly.
- **Misstep #12 (no `$id`/version/`$ref` in schemas):** fix-forward backfills `$id` across ~13 registry schemas + ~13 `.project/` schemas + LensSpec extension + monitor schemas. Each backfill is an opportunity for divergence (different `$id` URL conventions per schema, version numbering disagreement, etc.). Rebuild authors `$id` from line 1; no divergence window.
- **Misstep #13 (no authorship stamps):** fix-forward extends block-API signatures with DispatchContext, then migrates existing block data to add the four fields, then updates every consumer call site. Rebuild authors `DispatchContext` in the block-API signature from R2; no data-migration step.
- **Misstep #14 (no schema-write surface):** fix-forward adds `writeSchema`/`updateSchema` to existing block-api.ts, then audits which post-release commits used direct fs Edit (issue-065 already names the monitor case but the schema-edit case is unaudited), then migrates. Rebuild authors `writeSchema`/`updateSchema` as the only schema-write surface from R2.

### 5.2 Verification ceiling problem

`analysis/2026-05-06-repo-cleaning-guide.md:17` names the load-bearing fact: "the per-commit substantive trust audit I named as needed earlier in this session has STILL not been performed." Fix-forward keeps the unaudited code AND requires that audit to retroactively happen on c5c4725, b7bf11b, 5f852b1, 428d29a, 7f1596c, 048a2ac, ad03a00, 9ff3445 — eight commits of suspect content. Even if fix-forward's missteps-list refactor lands cleanly, the audit ceiling persists because the code still LIVES at those SHAs in history; bisecting against future regressions cites authorship from a verification gap.

Rebuild trades 11 commits of "audit retroactively, accept ceiling" for 10 subagent runs of "audit once, against fresh-authored code that was authored against the corrected substrate." The audit is more effective on rebuild because rebuild has the corrected design as input; fix-forward's audit has the incorrect-design code as input and must reverse-engineer the correction.

### 5.3 Compounding-debt arithmetic

Counting concretely from `analysis/May 7 Technical missteps for Repo Stablizing.md`:

- Missteps #1, #2, #4, #5 close together via config-driven vocabulary substrate (#6's prerequisite). 4 missteps, 1 rebuild item (R1).
- Missteps #11, #12 close together via $id/version/$ref. 2 missteps, 1 authoring step in R2.
- Missteps #6, #8 close together via pi-context naming + config-driven block_kinds. 2 missteps, encoded in R1+R4 design.
- Missteps #13, #14, #16 close via block-API authoring discipline at R2.
- Missteps #9, #10 close via R1's recursive walker + longest-prefix-match.
- Missteps #3, #17 close via opaque-slug + decision-lifecycle authoring at R1+R4.

13 of the 18 missteps are absorbed into 6 rebuild items. Fix-forward addresses each as a separate refactor-PR with author + audit + migration + consumer-site update overhead. The compounding multiplier is the cost differential: 33 runs vs 10.

## 6. Risk assessment

### 6.1 Substrate not actually re-derivable cleanly

**Risk:** the preserved `analysis/` + `.project/` substrate is insufficient as design-source-of-truth — the rebuilt code drifts from post-release behavior in ways the tests don't catch.

**Mitigation:** preserved post-release source IS the secondary design reference. Subagent briefs cite `git show <SHA>:packages/pi-project/src/<file>` as ground-truth for algorithmic behavior; the brief specifies WHICH parts to carry forward (algorithm) vs WHICH to discard (hardcoded literals, namespace placement). The post-release code remains queryable in the reflog (`git reflog` retains the pre-reset HEAD for ~90 days; `git tag rebuild-source-pre-revert HEAD` BEFORE `reset --hard` makes it permanently retrievable). This converts the risk from "code lost" to "code reachable but not on main."

### 6.2 Hidden dependencies

**Risk:** pi-jit-agents or pi-workflows depends on a post-release pi-project export not enumerated in the rebuild brief; rebuild ships without that export; consumer breaks at runtime.

**Mitigation:** R3's enumeration is sourced from issue-077's complete consumption-site listing (already audited during the original retrofit). R4's consumption-surface enumeration is sourced from the existing `packages/pi-project/src/index.ts` tool/command registrations. Both are exhaustive lists, not samples. Adversarial-audit run for R3+R4 includes a pre-rebuild diff: `git diff 3a7856c..rebuild-source-pre-revert -- packages/pi-jit-agents packages/pi-workflows` enumerates every consumer-side touch; any not represented in R3 fails the audit.

### 6.3 npm consumer breakage

**Risk:** users of `@davidorex/pi-project@0.24.2` upgrade and find no upgrade path because the next published version is `@davidorex/pi-context@0.25.0`; their `package.json` references break.

**Mitigation:** publish `@davidorex/pi-project@0.24.3` as a deprecation-only release pointing to `@davidorex/pi-context`. Take the 0.24.x line through one final patch that does nothing but emit a deprecation warning at module load. The rename arc is documented but absorbed into a single deprecation release rather than a multi-release migration.

### 6.4 Rebuild-loop quality drift

**Risk:** subagent rebuilds are themselves authored under a shallow verification loop, recreating the original problem.

**Mitigation:** every rebuild item ships with an adversarial-audit run by fresh-context agent per `feedback_adversarial_audits_not_self_audits.md`. The audit's input is (a) the brief, (b) the rebuilt code, (c) the missteps-doc to confirm each named misstep is structurally absent. Pass condition: audit produces a misstep-by-misstep checklist with "structurally absent" for each entry, citing file:line evidence. Self-audit by the authoring agent is forbidden (memory feedback rule).

### 6.5 .project/ block referential integrity post-revert

**Risk:** `.project/issues.json` carries entries (issue-077, issue-082..087) whose `resolved_by` SHAs reference post-release commits that no longer exist on main after revert.

**Mitigation:** these entries become forward-looking targets for the rebuild. Re-run `validateProject` after rebuild lands; expected diagnostic: `resolved_by SHA <X> not reachable`. Resolution: reset issue lifecycle states to `open` for any whose `resolved_by` references a reverted SHA, OR rewrite `resolved_by` to the rebuild's new SHA. Recorded in a single `chore(.project): reset issue lifecycle post-rebuild` commit. Closes the integrity gap deterministically.

### 6.6 The honest residual risk

What revert-then-rebuild does NOT fix: FGAP-006 (schema-evolution-and-migration tooling beyond `$id`+version), FGAP-007 (research staleness engine), the per-commit substantive trust audit on the substrate-arc *analysis* (analysis MDs are also unaudited substrate; rebuild makes the code clean but does not re-audit the analysis). Executive summary line 91-96 is explicit on this: rename does not solve schema evolution, authorship-attestation completeness beyond stamps, staleness, or substrate-arc verification debt at the analysis layer. Rebuild inherits that residual debt; it is honest about doing so.

---

**Net read.** Revert-to-`3a7856c` discards 16,229 lines of suspect-process code (per `git diff 3a7856c..HEAD --stat`) and preserves the substrate that produced those lines as design-source-of-truth. Rebuild authors the same surface in 10 subagent runs against pi-context's structural-correctness rules from line 1, closing 13 of 18 missteps as things-not-done rather than things-to-undo. Fix-forward preserves the suspect-process baseline, perpetuates the misnomer, and pays compounding retrofit overhead estimated at 33 runs to reach the same correctness — and even then the per-commit substantive trust audit ceiling persists in history. Revert is the structurally correct path.
