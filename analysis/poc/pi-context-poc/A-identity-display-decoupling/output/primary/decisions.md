# Design Decisions

**canonical_id:** `decisions-block`  
**prefix:** `DEC-`  
**array_key:** `decisions`  
**item count:** 3

| ID | Status | Title |
|----|--------|-------|
| DEC-001 | enacted | Adopt config-driven block_kinds registry |
| DEC-002 | enacted | Identity is opaque, display is mutable |
| DEC-003 | enacted | POC scope excludes AJV validation |

## DEC-001 — Adopt config-driven block_kinds registry

All identity-bearing vocabulary (canonical_id, display_name, prefix, schema_path, array_key, data_path) is declared in config.json rather than hardcoded in TypeScript. Adding a block kind is a config + schema edit; renaming the displayed label is a config-only edit.

## DEC-002 — Identity is opaque, display is mutable

canonical_id is the programmatic handle and never appears in user-facing surfaces. display_name flows through one universal lookup (displayName(cfg, canonicalId)) consumed by every render path. This decouples vocabulary churn from data, schema, and code.

## DEC-003 — POC scope excludes AJV validation

POC A reads + parses fixture JSON without AJV invocation. The production pi-context layer adds AJV-at-every-write per the F-006 single-ingress invariant; POC stays at minimum surface to keep the identity-display claim mechanically isolated.
