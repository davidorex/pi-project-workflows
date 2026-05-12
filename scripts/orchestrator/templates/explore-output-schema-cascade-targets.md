**Required columns** for the Site Inventory table — every row MUST populate every column. Empty cells = audit failure:

| # | Site | File:line | Current code | Required change | DEC reference |

- `#` — row number (1, 2, ...)
- `Site` — short label naming the surface being changed (e.g. "writeBootstrapPointer signature", "initProject body — literal site")
- `File:line` — exact file path + line number
- `Current code` — verbatim code snippet OR specific framing language to remove (for JSDoc rewrites)
- `Required change` — directive the implementer applies verbatim; for signature changes give the full new signature; for JSDoc rewrites describe required-content + forbidden-phrases-to-remove; for handler rewrites give the full new function body
- `DEC reference` — DEC-NNNN (and any others)

The Required-change cell IS the implementer agent's binding directive — apply verbatim semantics with no hedging, OR-clauses, or implementer-deferred choices. If the resolution path is ambiguous from the substrate context provided, classify as INCONCLUSIVE and surface for orchestrator decision rather than emitting OR-options.
