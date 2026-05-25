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
