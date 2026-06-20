# Audit — TASK-003 proposed resolution (CLEAN FIXTURE — MUST PASS)

A register-compliant, anchor-free audit of TASK-003's proposed resolution.
Every corrected body is substrate-anchored prose; every cited identifier
resolves; the filing manifest is in bijection with the corrected bodies.

<!-- BEGIN CORRECTED BODIES -->

### FEAT-001 — `description`

```
Substrate clone/import as a first-class derived-substrate operation: a clone
copies the source substrate's config, every block, its relations, and its
object store into a destination, mints a fresh substrate identity, and records
a derivation edge from source to clone. The same operation is exposed as a
library function, a Pi tool, and a CLI surface as one dual-surface unit, with
the registry entry carrying origin and provenance so a later read can tell a
foreign import apart from a native substrate.
```
Provenance:
- scope — DIRECTED: user requested the substrate clone/import arc per DEC-0002
- identity-mint — DERIVABLE: cited substrate-identity minter `mintSubstrateId`
- derivation-edge — DERIVABLE: relation_type `task_addresses_feature` precedent
- governing-decision — VERBATIM: TASK-003 cites DEC-0002 and FEAT-001

### DEC-0002 — `decision`

```
A derived substrate is produced by copying its source in full and then minting
a fresh substrate identity, rather than sharing the source identity. The clone
records a derivation relationship back to its source so provenance is queryable,
and validation distinguishes a native substrate that lost its registry entry
from a deliberately imported foreign substrate and from genuine drift.
```
Provenance:
- model — DIRECTED: user accepted copy-then-mint for derived substrates
- validation-distinction — DERIVABLE: cited validator `validateContext`
- block-target — DERIVABLE: target block kind `decisions`
- schema-target — DERIVABLE: target schema `pi-context://schemas/decisions`

<!-- END CORRECTED BODIES -->

<!-- BEGIN FILING MANIFEST -->
- features -> description -> update -> write-ajv
- decisions -> decision -> update -> write-ajv
<!-- END FILING MANIFEST -->

<!-- BEGIN EVIDENCE APPENDIX -->
Proof: FEAT-001 resolves; DEC-0002 resolves; FGAP-002 resolves; TASK-003 resolves.
Proof: `validateContext` and `mintSubstrateId` are exported source symbols.
The corrupt prior audit cited packages/pi-context/src/context-sdk.ts:1685 — quoted
here only as evidence of what a leaking body looks like; this appendix is exempt
from the operative-text hedge scan, so "out of scope" framing examples here do not
trip the gate, while the corrected bodies above remain anchor-free and hedge-free.
<!-- END EVIDENCE APPENDIX -->
