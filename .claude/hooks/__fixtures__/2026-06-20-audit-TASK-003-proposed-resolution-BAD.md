# Audit — TASK-003 proposed resolution (CORRUPT FIXTURE — MUST FAIL)

This fixture is intentionally corrupt: it carries an anchor-leaking body (C2),
a hedge phrase, and a manifest missing a row for one corrected body (C5). The
deterministic checker MUST reject it.

Out of scope: the registry-merge edge cases are not handled here.

<!-- BEGIN CORRECTED BODIES -->

### FEAT-001 — `description`

```
Implement the substrate clone/import arc. The cloneSubstrate fn copies config +
all blocks into the destination, defined in context-registry.schema.json and
wired at packages/pi-context/src/context-sdk.ts:1685. See line 1685-1690.
```
Provenance:
- scope — DIRECTED: user requested clone/import arc
- citation — DERIVABLE: `cloneSubstrate`

### DEC-0002 — `decision`

```
Adopt the clone-then-mint model: a derived substrate copies its source and
mints a fresh substrate_id, recording a substrate_derived_from_substrate edge.
```
Provenance:
- model — DIRECTED: user accepted clone-then-mint

<!-- END CORRECTED BODIES -->

<!-- BEGIN FILING MANIFEST -->
- features -> description -> update -> write-ajv
<!-- END FILING MANIFEST -->
