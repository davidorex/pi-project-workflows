# Disinfecting schema descriptions of originating-project identity

Installable context-model schema descriptions can carry the originating project's identity — internal package names, internal directory names, runtime/in-process assumptions, and a project-specific layer-architecture model name. A recipient project that installs these schemas inherits that leakage in field-level prompt-injectable text. This guide strips it so the context model is portable. It is a working strip-list, not an essay: apply the exact edits below, then run the rules + leak-finder against your own installed copies.

## Verbatim strip-list (the 8 edits)

All paths under `schemas/` (your installed copy of the catalog).

| # | File | Field | FROM | TO |
|---|------|-------|------|----|
| 1 | `issues.schema.json` | `properties.location.description` | `packages/pi-workflows/src/dag.ts:219` | `src/module/file.ts:NNN` |
| 2 | `issues.schema.json` | `properties.package.description` | `Which monorepo package this issue touches (e.g. pi-workflows, pi-project, pi-behavior-monitors)` | `Which package/module this issue touches (e.g. package-a, package-b)` |
| 3 | `work-orders.schema.json` | root `description` | `the in-pi bounded code-change loop` | `the bounded code-change loop` |
| 4 | `work-orders.schema.json` | `properties.context_blocks.description` | `the existing ContextBlockRef shape in packages/pi-jit-agents/src/types.ts` | `the ContextBlockRef shape defined by your agent layer` |
| 5 | `framework-gaps.schema.json` | root `description` | `Capability gaps in the pi-project-workflows framework` | `Capability gaps in the framework` |
| 6a | `layer-plans.schema.json` | root `description` | `restructuring the .project/ directory from flat-block storage into a layered artifact-ownership model` | `restructuring substrate storage into a layered artifact-ownership model` |
| 6b | `layer-plans.schema.json` | root `description` | `its conceptual source (e.g. Muni five-layer)` | `its conceptual source (e.g. a layered architecture model)` |
| 7 | `layer-plans.schema.json` | `properties.model.description` | `Conceptual source — e.g. 'Muni five-layer'` | `Conceptual source — e.g. 'a layered architecture model'` |
| 8 | `research.schema.json` | `properties.layer.description` | `Which Muni layer the research informs.` | `Which architecture layer the research informs.` (leave the `L1 identity/domain; L2 specification; L3 work; L4 execution; L5 memory` mapping unchanged) |

Edit only the named description text. Preserve all surrounding JSON syntax, quoting, and escaping.

## Generic substitution rules

Use these to find and fix your own variants beyond the exact strings above:

- **Monorepo / package names** (e.g. `pi-workflows`, `pi-jit-agents`, `packages/<x>/src/...`) → generic placeholder package names (`package-a`, `package-b`) or `src/module/file.ts:NNN` for path+line examples. When the text names a specific source-file shape your agent layer owns, replace with "your agent layer".
- **In-process / runtime assumptions** (e.g. `in-pi`) → drop the qualifier; describe the capability without binding it to a specific runtime.
- **Internal substrate directory names** (e.g. `.project/`) → "substrate storage".
- **Project-specific layer / architecture model name** (here `Muni five-layer` / `Muni layer`) → "layered architecture model" / "architecture layer". Keep any neutral layer mapping (e.g. `L1…L5` meanings) — that's portable; only the proper-noun model name leaks.

## Keep-or-drop note

Stripping description text does not make a whole-purpose project-specific schema portable. Some schemas are about *this* originating repo's internals:

- `layer-plans` — about restructuring *this* repo's substrate storage into a layered model.
- `work-orders` — *this* repo's JIT-agent / bounded-code-change machinery.

For schemas like these, the recipient should decide whether the schema belongs in their catalog **at all**, not merely sanitize its strings.

## How to find leaks

```
grep -riE '<your-package-names>|<internal-dir>|<layer-model-name>' schemas/
```

For this originating project the pattern is:

```
grep -riE 'pi-workflows|pi-jit-agents|pi-project|pi-behavior-monitors|\.project/|Muni|in-pi' schemas/
```
