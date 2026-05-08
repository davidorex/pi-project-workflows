Per-file CODE-only assessment. Markers: ✓ re-derive identical / ⚠ re-derive with rework / 🔄 re-derive byte-identical from pre-release source.

**`packages/pi-jit-agents/`** (3 files modified by 2b42760, 1 deleted by d931dc4)
- `src/agent-spec.ts`, `src/compile.ts`, `src/template.ts` — PROJECT_DIR retrofit; ✓ from issue-077 enumeration + HANDOFF
- `src/jit-runtime.smoke.test.ts` — deleted (Gate-A retirement); restoration not needed; ✓ trivial
- `package.json` — peer-dep `^0.72.1`; ✓ from HANDOFF

**`packages/pi-project/registry/`** (22 files: 9 blocks + 13 schemas)
- All file MOVES from `defaults/` (renamed in 53ebe39); 🔄 byte-identical from pre-release `defaults/` content
- Plus 2 NEW schemas: `plan.schema.json`, `roadmap.schema.json` from c5c4725 — ⚠ rework under config-driven block_kinds (don't restore byte-identical)

**`packages/pi-project/schemas/`** (2 files added by 8059764, modified by c5c4725 + 53ebe39)
- `config.schema.json`, `relations.schema.json` — substrate framework-contract schemas; ✓ from `analysis/poc-degree-zero-lens/schemas/*.schema.json` (POC has these); LensSpec extension from c5c4725 ⚠ rework under config-driven kind

**`packages/pi-project/src/`** (15 files)
- `project-sdk.ts` — substrate functions added (8059764) + completeTask + validateProject extensions; ✓ from POC degree-zero-lens render.ts
- `project-sdk.substrate.test.ts` — test added 8059764; ✓ derivable
- `project-sdk.test.ts` — modified for install (53ebe39); ✓ derivable
- `block-api.ts` — PROJECT_DIR retrofit (2b42760); ✓ from issue-077
- `block-api.config-root.test.ts` — test added 2b42760; ✓ derivable
- `block-validation.ts` — PROJECT_DIR retrofit; ✓ from issue-077
- `project-context.ts` — new module 2b42760; ✓ from issue-077 + HANDOFF (substrate types + projectRoot resolver)
- `project-context.test.ts` — added 2b42760; ✓ derivable
- `project-dir.ts` — modified 2b42760; ✓ from issue-077
- `index.ts` — modified by 53ebe39 + 2b42760 + ad03a00 + b7bf11b + 048a2ac + 5f852b1; mixed: ✓ for installProject + lens-curate + view subcommands; ⚠ for status-rollup + composition + roadmap tools (rework under pi-context)
- `install-subcommand.test.ts` — added 53ebe39; ✓ derivable
- `lens-view.ts` + `lens-view.test.ts` — added ad03a00, modified 048a2ac; ✓ from POC degree-zero-lens
- `composition.test.ts` — added 048a2ac; ⚠ rework under pi-context (test fixtures change)
- `roadmap-plan.ts` + `roadmap-plan.test.ts` — added b7bf11b, modified 5f852b1; ⚠ full rework under pi-context (PM-lens module, not pi-project)
- `substrate-schemas.test.ts` — added c5c4725; ⚠ rework

**`packages/pi-workflows/src/`** (8 files, all modified by 2b42760 PROJECT_DIR retrofit)
- `index.ts`, `step-block.ts`, `step-shared.ts`, `template-validation.ts`, `test-helpers.ts`, `workflow-executor.ts`, `workflow-sdk.ts`, `integration.test.ts`, `render-budget-overflow.test.ts` — all PROJECT_DIR retrofit consumer-side updates; ✓ from issue-077 enumeration

**`packages/pi-workflows/package.json`** — peer-dep `^0.72.1`; ✓

**`packages/pi-behavior-monitors/`**
- `package.json` — peer-dep `^0.72.1`; ✓
- `examples/hedge.patterns.json` + `examples/fragility.patterns.json` — pattern restructure (b120c4e + c5c4725 absorbed sibling-context content); ⚠ derivability depends on whether monitor-pattern source is in committed substrate (likely not — these were absorbed from "sibling context" per commit messages, source-of-truth unclear)

**`scripts/generate-skills.js`** — defaults/ → registry/ retarget (9ff3445); ✓ from DEC-0011

**Net counts**: ~50 files total changed in code paths.
- 🔄 byte-identical from pre-release: 22 (registry/ moves)
- ✓ re-derivable cleanly from issue-077 / HANDOFF / POC / DEC-0011: ~22
- ⚠ rework needed under pi-context direction: ~6 (roadmap-plan.{ts,test}, plan/roadmap schemas, composition.test.ts, substrate-schemas.test.ts, parts of index.ts)
- Uncertain source-of-truth: 2 (hedge/fragility pattern files — flag for separate handling if reverting)