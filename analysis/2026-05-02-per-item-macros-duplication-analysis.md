True. Real and substantial.

Reading decisions.md confirms multiple repeated patterns:

**1. Cross-reference recursion pattern** (the largest duplication): an 8-line `{% if X is defined %}... resolve/render_recursive ... fallback to bare ID ...` block repeats 5 times in decisions.md alone (supersedes, superseded_by, related_findings, related_features, related_gaps). Across the 6 macros with cross-block reference fields (decisions, spec-reviews, features, framework-gaps, layer-plans, research), this same pattern is duplicated dozens of times. Identical structure, only the field name varies.

**2. Optional-array-with-empty convention** (consequences, options_considered, references in decisions.md alone — 3 times): identical `{% if X is defined %}{% if X | length > 0 %}{% else %}  (none){% endif %}{% endif %}` shell.

**3. Optional scalar field** (enacted_by, enacted_at): same `{% if dec.X %}label: {{ dec.X }}{% endif %}` shape repeated.

**4. Registry alias bridge** — 8 one-line wrappers (`render_<plural>(x, d) → render_<singular>(x, d)`) with near-identical doc-comments. Pure boilerplate driven entirely by a registry-default-name choice.

**5. Header doc-comments** — per-file ~30-line doc blocks documenting the same depth contract, ambient globals, and empty-array convention with minor wording variations.

**Concrete abstraction opportunities:**

- **`templates/shared/render-helpers.md`** with macros like `render_id_list(label, ids, depth)`, `render_id_single(label, id, depth)`, `render_optional_scalar(label, value)`, `render_optional_array(label, items, item_renderer)`. Each per-item macro imports the helpers it needs and shrinks 50–100 lines per file.

- **Retire registry aliases by changing the registry default-name derivation** to match canonical singular names (or accept both). 8 alias macros disappear plus their doc-comments.

- **enforceBudget as a Nunjucks filter** (`{{ rule.description | budget("conventions", "rules.items.description") }}`) — cosmetic but readable improvement over the function-call form.

The dominant wins are the first two: helpers for the recursion pattern (the dozens-of-copies duplication) and registry-name reform (the 8 aliases). Shared doc header is a smaller win.

Cost: substantial refactor across 14 macro files + new shared helpers file + test updates. Risk: low — no external macro consumers exist anywhere in the monorepo (verified earlier in this session); test coverage is per-macro and would catch regressions.

Mandate-relevant: per-macro duplication is mandate-009 noise made architectural. It would compound for any new block kind added (new schemas demand new macros that copy-paste the recursion pattern). The duplication isn't accidental — it's a missing abstraction layer the per-item-macros plan didn't articulate because the duplication was incremental across waves.