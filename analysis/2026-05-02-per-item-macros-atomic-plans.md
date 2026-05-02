# Per-item macros — atomic plans and ordering

**Date:** 2026-05-02
**Spec source:** `analysis/2026-04-15-blocks-as-prompt-substrate.md` (Pass 2, canonical)
**Status:** outline persisted for plan-mode expansion

## Resolved by project philosophy / canonical-surface principle (DEC-0003)

- Renderer-registry owner: **pi-jit-agents** (composition boundary).
- Macro signature: **item-only** (declarative; traversal lives in registry).
- ID resolution: **kind-prefixed globally unique; fail-fast on unresolved**.
- `x-prompt-budget` enforcement: **renderer** (render-time concern).
- Whole-block macros: **derived view of per-item, or retire**.
- Principle: every schema lands with its per-item macro as a single unit of work — applies universally to legacy 12 blocks and 6 newer kinds alike.

## Atomic plans (eight)

1. **Renderer registry** in pi-jit-agents — kind → per-item-macro lookup; user-override layering from `.pi/templates/`.
2. **Cross-block reference resolver** — lifted from pi-project validation primitives, exposed as rendering service; `resolve(id) → { block, item }`.
3. **`contextBlocks` agent-spec schema extension** — typed object form with `name`, `item`, `focus`, `depth`.
4. **`compileAgent` integration** — honor new `contextBlocks` shape (item resolution, depth threading, focus passing); backward-compat path for bare-string form.
5. **`x-prompt-budget` annotation + renderer enforcement** — schema annotation; renderer reads, warns/truncates on overflow.
6. **`render_decision`** — REVIEW-001 unblocker; first per-item macro using registry + resolver.
7. **Remaining five newer per-item macros** — `render_spec_review`, `render_feature`, `render_framework_gap`, `render_layer_plan`, `render_research`.
8. **Twelve legacy per-item macros + whole-block as derived view + agent-template call-site migration** — coupled because retiring whole-block requires updating call sites.

## Order of operation

- **Wave 1 (parallel):** 1, 2, 3, 5
- **Wave 2:** 4 (depends on 1, 2, 3)
- **Wave 3:** 6 (depends on 1, 2; unblocks REVIEW-001)
- **Wave 4 (parallel):** 7, 8 (depend on 1, 2)

## REVIEW-001 critical path

1 → 2 → 3 → 4 → 6.

## Forcing artifacts

- REVIEW-001 (jit-agents-spec.md design review) blocked on `render_decision`.
- Substrate canon (2026-05-01) makes blocks/schemas/macros = one contract; per-item macros are the macro half.
- Pass 3 (`analysis/2026-04-15-runtime-step-context.md`) names budget as one of five agent-spec-surface refinements; `x-prompt-budget` here is the budget half on the rendering side.
