# Data-flow validation — relation_type `consumes`

**category:** `data_flow`  
**cycle_allowed:** false  
**edges:** 3  
**items in scope:** 5

## Per-item upstream dependency report

| Item | Own hash | Upstream count | Upstream ids | Composite hash |
|------|----------|----------------|--------------|----------------|
| `PHASE-A` | `5e18e85cb7db` | 0 | (none) | `9bc54d6931ab` |
| `PHASE-B` | `6c7f007a8113` | 0 | (none) | `d0bcad63aa26` |
| `PHASE-C` | `1acb36921e1e` | 0 | (none) | `c360af5469f2` |
| `PHASE-D` | `ac7eb57257b6` | 0 | (none) | `a015e287e157` |
| `PHASE-E` | `32acf3e02404` | 3 | `PHASE-A`, `PHASE-B`, `PHASE-C` | `50604618de2a` |

## Propagation simulation

Mutating `PHASE-A.body` and re-deriving composite hashes. Items with `PHASE-A`
transitively upstream MUST observe a different composite hash; others MUST not.

| Item | Composite (round 1) | Composite (round 2, after PHASE-A mutation) | Re-render? |
|------|----------------------|----------------------------------------------|------------|
| `PHASE-A` | `9bc54d6931ab` | `3c568b9f30ff` | yes |
| `PHASE-B` | `d0bcad63aa26` | `d0bcad63aa26` | no (cached) |
| `PHASE-C` | `c360af5469f2` | `c360af5469f2` | no (cached) |
| `PHASE-D` | `a015e287e157` | `a015e287e157` | no (cached) |
| `PHASE-E` | `50604618de2a` | `0d79cf9077e1` | yes |

## Items with upstream dependencies

- `PHASE-E` (Verification) — 3 upstream: `PHASE-A`, `PHASE-B`, `PHASE-C`
