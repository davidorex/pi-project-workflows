That's structurally cleaner than the multi-package decomposition. Concrete shape:

**One package: `@davidorex/pi-context`** (renamed from `@davidorex/pi-project`).

Owns:
- Typed memory substrate (block-api with AJV-validated writes)
- Schemas + lens primitives (config-driven `block_kinds[]` per the vocabulary-decoupling architecture)
- Canonical-macro registry + render-by-id + resolve-by-id + marker grammar (currently scattered between pi-project, pi-jit-agents, pi-workflows)
- Closure-table relations + traversal + groupByLens
- Retrieval+injection patterns (cascade hook, coverage-rank ranker, auto-extract pipeline, aggregate budgeting — pi-memctx-derived)

**The four-workspace monorepo stays at four packages**:
- pi-context (substrate + lenses + injection — renamed from pi-project)
- pi-jit-agents (agent-spec load/compile/execute)
- pi-workflows (orchestration / DAG / dispatch — consumes pi-context macros)
- pi-behavior-monitors (steering — consumes pi-context state)
- pi-project-workflows (meta — renamed pi-context-workflows or kept as historical name)

No new packages. The retrieval+injection layer that the pi-memctx patterns demonstrate becomes a subdirectory in pi-context, not a separate npm package.

**Why this works against the earlier paste's option-C rejection**:

That rejection said "pi-project as a name is still accurate for what it does — it manages typed project artifacts." Under your lens reframe, that's the wrong claim — PM-shape is one lens, not the substrate. The honest substrate name is pi-context. The rejection's other concern (external-consumer churn) is mitigatable by keeping the @davidorex/pi-project npm name as a deprecation alias for one major-version cycle, both names resolving to the same package.

**What this resolves vs what stays open**:

Resolves:
- Package proliferation worry — stays at four
- Naming accuracy — pi-context honestly describes the substrate
- Lens reframe — lenses live in `config.block_kinds[]`, not in package boundaries
- Vocabulary-decoupling architecture — ships within pi-context as core
- Retrieval+injection — extends pi-context, doesn't spawn a new package

Open:
- Macros currently at `packages/pi-workflows/templates/shared/macros.md` should move to pi-context if canonical-macro registry lives there. Migration path needed.
- Internal source file naming (project-sdk.ts, project-context.ts, project-dir.ts) — keeps pi-project naming as historical artifact or renames incrementally. Either is workable; not blocking the npm rename.
- Repository name on GitHub (workflowsPiExtension) — separate decision from npm package name.
- The vocabulary-decision-pending in HANDOFF (ADR/FGAP terminology) — still open, but now part of a larger renaming wave that pi-context's vocabulary-decoupling architecture makes structurally cheap.

**Net**: one rename + one capability extension (the four pi-memctx-derived patterns A/B/C/D as new modules within pi-context), not three new packages. The lens reframe is preserved entirely in config, not in package boundaries.