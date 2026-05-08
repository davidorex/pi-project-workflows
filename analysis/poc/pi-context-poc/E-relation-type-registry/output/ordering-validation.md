# Ordering validation — relation_type `phase_depends_on`

**category:** `ordering`  
**cycle_allowed:** false  
**edges:** 4  
**items in scope:** 5

## Cycle check

**Result:** acyclic

**Verdict:** OK (cycle_allowed=false enforced, none present)

## Topological order

```
[PHASE-A, PHASE-B, PHASE-C, PHASE-D, PHASE-E]
```

## Edges

- `PHASE-A` → `PHASE-B`
- `PHASE-B` → `PHASE-C`
- `PHASE-C` → `PHASE-D`
- `PHASE-D` → `PHASE-E`
