# Issues

**canonical_id:** `issues-block`  
**prefix:** `issue-`  
**array_key:** `issues`  
**item count:** 3

| ID | Status | Title |
|----|--------|-------|
| issue-001 | resolved | Render path must consume display_name uniformly |
| issue-002 | open | Prefix-collision class becomes registration-time error |
| issue-003 | in_progress | naming map is the fallback, block_kinds[].display_name is primary |

## issue-001 — Render path must consume display_name uniformly

Every markdown emission site (block headers, lens headers, render-by-id callouts) must route through displayName(cfg, canonicalId). Inline string literals for display labels are forbidden; they are the failure mode that re-couples identity to display.

## issue-002 — Prefix-collision class becomes registration-time error

Today (pre-rename), prefix collisions surface at fixture-write time when two block kinds independently emit overlapping id patterns. With config-driven block_kinds, the registry walk at config-load time enumerates declared prefixes and rejects duplicates structurally. POC A keeps prefixes constant per design; POC B and beyond exercise the registration-time check.

## issue-003 — naming map is the fallback, block_kinds[].display_name is primary

displayName(cfg, canonicalId) reads block_kinds[].display_name first, falls back to naming[canonicalId], finally returns canonicalId. The naming map remains as a place to alias non-block identifiers (lenses, relation types) once those POCs land.
