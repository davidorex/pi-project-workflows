# System thesis (candidate project-vision element for .context)

**Status:** holding-place per catalog-as-holding-place — the canonical home (a project `vision`/`charter` block kind, in `.context`) does not exist yet. Reify as the inaugural `.context` vision instance on DEC-0036 cutover; this file carries a Status: link to that commit when done.

## The thesis (verbatim candidate text)

> Everything — substrate, agents, capabilities, guidance — is schema-shaped data, macro-rendered, composed from empty to need.

## Genre / home
- **Genre:** project vision / charter / site-policy (a standing declaration of what the system fundamentally is), NOT a decision (DEC = "chose X over Y because Z") and NOT a convention (style rule). It is the generative north-star the discrete DECs instantiate.
- **Home:** `.context` (DEC-0036 clean re-derivation), NOT frozen `.project`. Requires a `vision`/`charter`/`tenets` block kind that the current 15-kind conception lacks (the old `project.json` project-level block was dropped in re-derivation). Defining that kind is re-derivation catalog work (conception = `packages/pi-context/samples/`, DEC-0037).

## What it unifies (the instances already in canon)
The thesis is the meta-principle these all instantiate — it is filed canon distributed across the substrate, named here as one statement:
- **schema-shaped:** every block kind has a JSON Schema; config is data; agents are `.agent.yaml` specs; capabilities are registry entries (FEAT-005); skills become skill-blocks (FEAT-007).
- **macro-rendered:** `templates/shared/macros.md` per-block-kind render macros; agent specs compile via Nunjucks (pi-jit-agents); skills render via macros (FEAT-007).
- **composed from empty to need:** DEC-0015 (no default substrate dir) + DEC-0011 (ship no defaults) + DEC-0025 (vocabulary-neutral) — default is EMPTY; config materializes exactly what's needed. Generalized to: agents (JIT compile), capabilities (FEAT-005 JIT-composed-from-empty per dispatch), context (contextBlocks injected to need), reads (FGAP-103 element-level, composed-to-need), guidance (FEAT-007 JIT skills), and governance (DEC-0047 constitutional model: nothing exists until config legislates it).

## Lineage (canon that this thesis generalizes)
- Empty-state / config-driven: DEC-0015, DEC-0011, DEC-0025
- Zero-loss / substrate-is-SoT: DEC-0040
- Harness-confined, capability-from-config: DEC-0014, DEC-0047 (constitutional model)
- JIT arc: pi-jit-agents (agents); FEAT-004 (agents-as-tools); FEAT-005 (JIT capability composition); FEAT-007 (JIT skills)
- DRY element-level read: FGAP-103; progressive disclosure: FGAP-101; guidance delivery: FGAP-090 (route C = FEAT-007)

## Why it earns a vision element
It is the single sentence that predicts the right design for any new surface: when something is static/bespoke (the way skills were before FEAT-007, or reads before FGAP-103), the thesis says make it schema-shaped + macro-rendered + composed-to-need. It is the test a new feature is checked against. That predictive/normative role is what a vision/charter element is for — distinct from any one decision.

## Block-kind taxonomy (2026-05-25 design dialogue)

Emerging project-level context kinds (THIS project's vocabulary, not framework defaults — conception ships no kinds as defaults per DEC-0011/0025). Homed in `.context` (DEC-0036), not frozen `.project`.

- **project-vision** (confirmed) — the aspirational north-star / what the system fundamentally is. Inaugural instance = the system thesis above. Predictive/normative: the test a new surface is checked against.
- **policies** (candidate) — "that which allows LLMs to make reasoned but constrained decisions": the guardrail/constraint envelope inside which autonomous reasoning is permitted. Distinct in FUNCTION from vision (aim) and from point-decisions (chose X over Y).
- **decisions** (narrowed) — genuine point-decisions only ("chose X over Y because Z").

**Survey finding — policy-genre is already recorded, distributed (not absent):**
- `conventions` block (16 items: esm / tsc-build / no-pi-dir / fail-fast / types-in-types-ts / expression-no-eval / bundled-specs-source-of-truth / domain-in-specs …) = ENGINEERING conventions — a narrow policy subset (how-we-code), not decision-bounding policy.
- `decisions` block: ~23 of 47 are policy-SHAPED standing rules (DEC-0014 tools-only, DEC-0015 config-drives-location, DEC-0018 runtime-demo+adversarial-always, DEC-0020 typed-substrate-outputs, DEC-0021 atomic-cascade, DEC-0025 vocabulary-neutral) vs genuine point-decisions (DEC-0001, DEC-0003). The block conflates two genres.
- Outside substrate: feedback memories (behavioral mandates) + mandate-001..009 (hook-injected) are also policy-genre.

**Open taxonomy decision (for `.context` re-derivation):**
1. Split `decisions` → point-decisions vs `policies` (migrate the ~23 standing-rule DECs to `policies` on re-derivation).
2. Decide `policies` vs `conventions` relationship — conventions as an engineering subset of policies, a sibling, or folded in.
3. Whether the out-of-substrate behavioral mandates (feedback memories) reify as `policies` instances in `.context` (unifying the policy genre into one home).

Not actioned in frozen `.project`; this is `.context` catalog design. Reify project-vision + policies kinds + this thesis on cutover.
