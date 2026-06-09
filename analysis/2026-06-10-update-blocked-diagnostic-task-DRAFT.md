# DRAFT task — update `blocked` surfaces which item/field failed

**Status: DRAFT — held, not yet filed.**

## Description
When `update` blocks a schema, surface which item and field failed validation, so the operator can unblock it.

## Acceptance criteria (user stories)
- As an operator, when `update` blocks a schema, I can see which item and which field caused the validation failure.
- As an operator, I get the same diagnostic for `blocked` that `conflicts` already gives, instead of `blocked` being opaque.
- As an operator, I don't have to reverse-engineer the failure from the schema diff.
- As an operator, the tool gives me the diagnostic needed to unblock, instead of stopping at "no safe migration."
- As an operator, I can validate the block items directly against the target catalog schema and see what fails — which `update` doesn't expose and `context-validate` doesn't do.
- As an operator, once I see why the block items don't validate, I can fix either the items or the local schema and re-run `update`.
- As an operator, I want check-status to report which installed schemas are behind the catalog, and by what version gap.
- As an operator, I want update --dryRun to prospectively run the actual forward-migration + re-validation against the block items, so it never predicts resynced when the live run will hit blocked.
- As an operator, I want update to report, per blocked schema, which item id failed, on which field, against which constraint — so I can act without diffing schemas and hand-auditing the block.
- As an operator, I want update to drop the catalog schema as a sidecar file (or provide a command to fetch it), so I can diff locally without hunting through node_modules.
- As an operator, I want a resolve-conflict-style command for blocked schemas — I fix the items or widen the local schema, run it, and the merge base advances so the schema stops re-blocking.
- As an operator, I want the resolution loop for blocked to mirror conflicts/resolve-conflict end-to-end: diagnose → fix → retry, not a dead end.
- As an operator, when update blocks a schema, I expect failure markers written INTO the block file at the offending items and fields — the way git merge writes conflict markers into source files — so I open the block and see the problem inline, not only in a CLI report.
- As an operator, when I've fixed the in-file markers for a blocked schema, I expect a single command — resolve-blocked or update --continue — that re-validates the block against the target schema, advances the merge base, and writes the new schema file. The git model: fix conflicts → git add → git merge --continue.
