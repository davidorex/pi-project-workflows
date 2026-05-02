All seven are real residual debt, mandate-relevant. Per-item evaluation:

**Item 3 — whole-block scaffolding (9× repetition in shared/macros.md):**
Each whole-block delegator is `{% from "items/X.md" import render_X_item %}{% macro render_Xs(data) %}{% for x in data.<key> %}{{ render_X_item(x) }}{% endfor %}{% endmacro %}`. Real duplication. Could be retired by either (a) a single parameterized whole-block helper that takes a kind name and looks up its per-item macro via the registry at render time, or (b) the registry exposing a `renderWhole(kind, data)` JS surface with a Nunjucks global wrapping it. Same architectural pattern that closed the per-item duplication. Bounded medium scope.

**Item 4 — test scaffolding (14× duplicated makeEnv / buildFixtureIdIndex / renderItem / renderWhole / TEMPLATES_DIR):**
The largest and most embarrassing residual. test-helpers.ts exists but is under-consumed. The recent helper-tests diff added small per-file additions instead of consolidating into the shared harness — that's the asymmetry the user has been calling out throughout this session. Migrating all 14 render-*.test.ts to a shared harness eliminates ~40+ lines × 14 files of identical setup. Medium scope, high signal.

**Item 5 — dispatchInlineMacro (compile.ts:124-134 and render-by-id.ts:104-123):**
Two byte-similar copies of the inline-template-string-render logic. Direct consequence of v0.24.0's renderItemById helper landing alongside the existing compileAgent path without factoring the shared dispatch. Quick win — extract into pi-jit-agents (or wherever the registerCompositionGlobals helper lives) as `dispatchInlineMacro(env, templatePath, macroName, item, depth)`. Both sites import.

**Item 6 — bundled-builtin dir resolution (7× `path.resolve(import.meta.dirname, "..", "...")` in pi-workflows):**
Pure constant duplication. Quick win — define `BUNDLED_TEMPLATES_DIR` (or whatever the construct represents) once and import. Trivial.

**Item 7 — .project canonical path surface (9 hand-built `path.join(cwd, ".project", ...)` sites across pi-workflows + pi-jit-agents):**
The most cross-cutting. pi-project already exports `PROJECT_DIR` and `SCHEMAS_DIR` constants but adoption is partial. Mandate frame: every site that builds these paths inline is a parallel implementation of the canonical surface. Should land canonical builders (`projectDir(cwd)`, `schemaPath(cwd, blockName)`, `agentsDir(cwd)`, `templatesDir(cwd)`) in pi-project's `project-dir.ts` and migrate every consumer site. Largest scope of the seven but most architecturally important — closes the same kind of asymmetry the v0.23.0 surface-symmetry patch closed for block-api.

**Item 8 — expandFieldPathShorthand (private in compile.ts:44, re-implemented as expandShorthand in test-helpers.ts:65):**
Two implementations of the same JSON-pointer-or-shorthand expansion logic. Mandate frame: parallel ungated paths. Quick win — export from pi-jit-agents barrel; test-helpers consumes the export.

**Item 9 — markers module (4 shapes × 5 emit sites, no markers.ts):**
`[not-found: <id>]`, `[unrendered: <kind>/<id>]`, `[render_error: <msg>]`, `[cycle: <id>]` are inline-templated. Should be a `markers.ts` module with named constants + small format helpers (`notFoundMarker(id)`, `cycleMarker(id)`, etc.). Tests can then assert against the named constants rather than literal strings — drift between marker text and test assertion becomes impossible. Quick win, raises future-change safety.

**Aggregate evaluation:**

All seven are real. None should be deferred per mandate-007. Three quick wins (5, 6, 8, 9 — actually four). Three medium-bounded (3, 4). One cross-cutting (7).

Quick wins (5, 6, 8, 9) are byte-trivial and reduce architectural-debt count immediately. Medium (3, 4) reduce duplication that compounds with every new block kind or new macro test. Item 7 is the largest leverage — every future feature that touches `.project/` paths benefits from canonical builders.

Per "no niggling minimalism, complete solutions" pattern: bundle all seven into one coordinated debt-retirement patch. Single commit, single release. The refactor agent already demonstrated capability with the v0.24.1 helpers refactor; same pattern works here.