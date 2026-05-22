# FGAP-074 `/project`→`/context` rename — chunked codemod decomposition

Source-identifier rename of the framework's OWN surface (modules, exports, Pi tools, `/project` command, subpath exports) from pi-project-era `project` naming to `context`. Independent of DEC-0036 step-3 (`.context` data re-population) — pure source codemod; works with `.project` still the live substrate via the pointer. Gates FGAP-095 P2–P6 (the onboarding conductor is DEC-0042-specified in `/context` terms). Closes the residual-`project` cluster (with done FGAP-094; subsumes FGAP-093).

## Surface (from parallel Explore maps, 2026-05-23)

- **3 src modules** (+ 3 tests): `project-dir.ts`, `project-context.ts`, `project-sdk.ts`. Many of `project-dir`'s exports are ALREADY context-named (`resolveContextDir`, `writeBootstrapPointer`, `BootstrapNotFoundError`, `SCHEMAS_DIR`, `schemaPath`, `schemasDir`) — only `projectDir`, `projectTemplatesDir`, `PROJECT_DIR` carry `project`; the wide cost is the **subpath string** `@davidorex/pi-context/project-dir` (every importer of any symbol from it must change).
- **Exported identifiers**: `projectDir`, `projectRoot`, `projectState`, `projectTemplatesDir`, `getProjectContext`, `validateProject`, `installProject`, `PROJECT_DIR` (@deprecated), `PROJECT_BLOCK_TYPES`; interfaces `ProjectState`, `ProjectContext`, `ProjectValidationResult`, `ProjectValidationIssue`.
- **Pi tools (11)**: `project-status`, `project-validate`, `project-validate-relations`, `project-edges-for-lens`, `project-walk-descendants`, `project-roadmap-{load,render,validate,list}` → rename; **`project-init`, `project-accept-all` → DEC-0042 removal (FGAP-095 P4)**. (`context-current-state`, `context-bootstrap-state` already context-named.)
- **Command**: `/project` + `PROJECT_SUBCOMMANDS` (index.ts). Subcommands `status/view/validate/lens-curate/add-work/roadmap-*` → rename; **`init`/`accept-all`/`install` → DEC-0042 removal (P4)**.
- **Subpath exports (package.json)**: `./project-dir`, `./project-context`, `./project-sdk`. **tsconfig path mappings**: only `project-dir` + `project-sdk` present (NOT project-context — verify resolution).
- **Cross-package importers (36)**: pi-jit-agents (6: compile, template + tests), pi-workflows (29: workflow-sdk, workflow-executor, step-block, step-shared, index, template-validation, test-helpers + ~22 tests importing `writeBootstrapPointer`/`schemaPath`), pi-behavior-monitors (1 test).
- **Orchestrator scripts (14)**: accept-all, amend-config, append-relation, bootstrap-state, build-html-views, current-state, file-block-item, filter-block-items, join-blocks, read-block-item, read-block-page, read-config, read-schema, resolve-items-by-id.
- **Docs**: root `README.md` (~18), `CLAUDE.md` (~5), `packages/pi-context/skill-narrative.md` (~26); `SKILL.md` regenerates via `npm run skills`.
- **OUT of scope** (do NOT rename): package name `@davidorex/pi-project-workflows`; the `.project` substrate-dir literal (DEC-0036 step-5 cutover); user-substrate vocabulary (DEC-0025); already-`context`-named symbols.

## Hazards

- **`projectDir`→`contextDir` identifier collision**: `contextDir` is already used as a local var (resolveContextDir results) in several files. The codemod must scope the identifier rename (not blind global replace) — feedback_rename_scope_discipline.
- **`project-context.ts` target name**: `context-context` is awkward → naming DEC must choose (`context-core` / `context-substrate` / `context.ts`); the subpath `./project-context`→`?`.
- **Bare-string scope**: comments/JSDoc/temp-dir prefixes/test-fixture strings carry `project` in-scope vs out-of-scope — both scoped + bare-string scans required.
- **DEC-0042 overlap**: rename the bootstrap trio (init/accept-all/install + the 2 tools) UNIFORMLY now; FGAP-095 P4 removes the (then `context`-named) trio when `/context start` lands. Simpler than special-casing the rename to skip them.
- **`tsconfig` excludes `tmp`** ✓ (already, line 28) — precondition met. `biome.json` scope covers `packages/*/src/**` + `scripts/**` ✓.

## Strategy: transition-alias-bridged, green per commit

Husky runs `check && test` on EVERY commit, so each chunk must build+test green. A subpath/identifier rename touches all importers; doing it atomically = one ~40-file commit. Instead, **bridge with transition aliases** so consumer migration chunks stay small and per-package, each green because BOTH old and new names resolve throughout:

- subpath: package.json ships BOTH `./project-*` (legacy alias) and `./context-*` (new) → same dist during migration; tsconfig dual path mappings.
- identifiers: `export const projectRoot = contextRoot; /** @deprecated */` etc. during migration.
- tool names + command + docs: NOT aliased (strings, no code consumers) — renamed atomically in their own chunks + `npm run skills`.
- final chunk removes all aliases (proves no legacy consumer remains).

## Chunks (each = one green commit; substrate TASK filed at that chunk's plan-step-1 per discipline)

- **C0 — naming DEC (decision-only, no code).** Settle target names: the 3 filenames + 3 subpaths; identifier scheme (`projectRoot`→`contextRoot`, `projectDir`→`contextDir` [collision-scoped], `projectState`→`contextState`, `validateProject`→`validateContext`|`validateSubstrate`, `getProjectContext`→`getContext`, `installProject`→`installContext`, `projectTemplatesDir`→`contextTemplatesDir`, `PROJECT_BLOCK_TYPES`→`CONTEXT_BLOCK_TYPES`, interfaces `Project*`→`Context*`/`Substrate*`, `PROJECT_DIR` @deprecated → drop or rename); tool prefix `project-`→`context-`; command `/project`→`/context`. Gates C1–C7.
- **C1 — pi-context internal + aliases (additive, green).** Rename the 3 `project-*.ts`→new files (+ tests); update all pi-context-internal relative imports + identifier usages to new names; add DUAL package.json exports + DUAL tsconfig mappings; add deprecated identifier aliases. Internal package fully on new names; external world still resolves via aliases.
- **C2 — pi-jit-agents consumers (6 files).** Migrate old→new subpath+identifiers. Green.
- **C3 — pi-workflows consumers (29 files).** Migrate. Green. (Largest consumer set; mostly `writeBootstrapPointer`/`schemaPath`/`PROJECT_DIR` import-string changes.)
- **C4 — pi-behavior-monitors (1) + orchestrator scripts (14).** Migrate. Green.
- **C5 — tool names + `/project` command (index.ts).** `project-*`→`context-*` tool names; `/project`→`/context` + `PROJECT_SUBCOMMANDS`→`CONTEXT_SUBCOMMANDS`; `installProject`→`installContext`. Rename the DEC-0042 bootstrap trio uniformly (removed later in P4). **Constraint (DEC-0044 / FEAT-004): keep a `/context` dispatch-verb namespace open** — do not foreclose a future agent-dispatch tool/command (agents-as-tools); avoid claiming names that would collide with a `run`/dispatch verb. `npm run skills`. Green.
- **C6 — docs.** `README.md` + `CLAUDE.md` + `skill-narrative.md` `/project`→`/context` + tool names; any `.agent.yaml`/`.workflow.yaml`/`.monitor.json` referencing `/project` or `project-*` tools; `npm run skills`. Green.
- **C7 — remove aliases + bare-string sweep.** Drop the dual package.json exports → single `./context-*`; drop tsconfig legacy mappings; remove identifier aliases; scoped + bare-string sweep of residual in-scope `project` in comments/JSDoc/temp-dir prefixes. Green — proves zero legacy-name consumers remain. Closes FGAP-074.

## Verification (per chunk + final)

- Per chunk: `npm run build && npm run check && npm test` (husky-gated) + targeted grep that the chunk's migration is complete.
- C7 final: `grep -rn "@davidorex/pi-context/project-" packages scripts` returns nothing; `grep` for renamed identifiers shows no legacy survivors (excluding OUT-of-scope `pi-project-workflows` / `.project` literal). Fresh-context adversarial probe: no behavioral change (pure rename), no orphaned alias, OUT-of-scope items untouched.
- Runtime demo: `/context status` (renamed) + a `context-*` tool dispatch via `pi -p` resolve against the still-`.project` substrate (rename is surface-only; pointer unchanged).

## Sequence note

C0 (decision) → C1 (internal+aliases) → C2/C3/C4 (consumers, parallelizable but commit serially for green clarity) → C5 (surface) → C6 (docs) → C7 (alias removal). After FGAP-074: FGAP-095 P2–P6 build native on `/context`. The `.project`→`.context` DIR cutover (DEC-0036 step-5) + `.context` re-population (step-3) remain SEPARATE arcs.
