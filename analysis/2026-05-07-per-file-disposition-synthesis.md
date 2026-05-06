Cross-synthesis. Each file → keep (no missteps), refactor-in-place (substrate correct, misstep is forward-fix), or re-derive (wrong shape under pi-context):

**KEEP** (✓ MD1, no MD2 misstep — substrate retrofit correct):
- `packages/pi-jit-agents/src/{agent-spec,compile,template}.ts`
- `packages/pi-jit-agents/package.json`, `pi-workflows/package.json`, `pi-behavior-monitors/package.json`
- `packages/pi-project/registry/blocks/*` (9 files, byte-identical moves)
- `packages/pi-project/src/project-context.{ts,test.ts}`, `project-dir.ts`
- `packages/pi-project/src/install-subcommand.test.ts`
- `packages/pi-workflows/src/{index,step-block,step-shared,template-validation,test-helpers,workflow-executor,workflow-sdk}.ts`
- `packages/pi-workflows/src/{integration,render-budget-overflow}.test.ts`
- `packages/pi-behavior-monitors/examples/{hedge,fragility}.patterns.json`
- `scripts/generate-skills.js`

**REFACTOR-IN-PLACE** (✓ MD1, MD2 misstep is forward-fix):
- `packages/pi-project/registry/schemas/*` (11 moved schemas: audit, conformance-reference, decisions, domain, handoff, issues, phase, project, rationale, requirements, tasks, verification, architecture) — apply #11 (port patterns from `.project/schemas/`) + #12 ($id/version/$ref to shared fragments) + #4/#5 (replace embedded enums with $ref to config-derived registries)
- `packages/pi-project/schemas/{config,relations}.schema.json` — apply #1 (extend ConfigBlock with block_kinds[]) + #2 (status_buckets) + #5 (relation_types[]) + #12 ($id/version)
- `packages/pi-project/src/project-sdk.ts` — apply #1 (derive ID_PREFIX_TO_BLOCK from config) + #6 (extract validateProject lens dispatch from PM coupling) + #9 (recursive walker option in buildIdIndex) + #10 (longest-prefix-match in expectedBlockForId) + #13 (authorship stamps via DispatchContext)
- `packages/pi-project/src/project-sdk.{substrate,}.test.ts` — extend tests for config-driven derivation
- `packages/pi-project/src/block-api.ts` — apply #13 (DispatchContext + authorship stamps) + #14 (writeSchema/updateSchema) + reject monitor-bypass writes per #16
- `packages/pi-project/src/block-validation.ts` + `block-api.config-root.test.ts` — extend per #13/#14
- `packages/pi-project/src/lens-view.{ts,test.ts}` — composition routing reads `lens.kind` from config-driven registry not hardcoded string

**RE-DERIVE** (⚠ MD1, scope-changing rework under pi-context):
- `packages/pi-project/registry/schemas/{plan,roadmap}.schema.json` — re-derive under config-driven block_kinds[] (no embedded prefix regex; prefix declared in config)
- `packages/pi-project/src/roadmap-plan.{ts,test.ts}` — re-derive as PM-lens module under pi-context (or pi-project-lens), with config-driven STATUS_VOCABULARY (#2) + opaque-slug validation codes (#3)
- `packages/pi-project/src/composition.test.ts` — re-derive (test fixtures change under config-driven kind)
- `packages/pi-project/src/substrate-schemas.test.ts` — re-derive (validates the new schema shape)
- `packages/pi-project/src/index.ts` — partial: keep installProject + view + lens-curate registrations; re-derive status-rollup + composition + roadmap-* tool registrations under config-driven dispatch

**Decided** (recorded in `.project/decisions.json` and analysis docs):
- #7 → independent (matches validateProject + validateProjectRelations no-gating pattern; substrate culture surfaces all defects in one pass)
- #8 → option (a): rename + migrate `.project/layer-plans.json` (preserves 1-prefix-1-block invariant; matches DEC-0009 single-storage-primitive; forward-compatible with config-driven `block_kinds[].prefix` from DEC-0013)

**Not file-touching but blocks refactors**:
- #12 (FGAP-006 schema versioning) is the load-bearing prerequisite for the registry-schema refactor cluster; without $id/version/$ref the in-place refactors of registry/schemas/* can't compose shared fragments cleanly.

**Counts**: ~30 KEEP, ~14 REFACTOR-IN-PLACE, ~6 RE-DERIVE, plus 9 byte-identical moves untouched.