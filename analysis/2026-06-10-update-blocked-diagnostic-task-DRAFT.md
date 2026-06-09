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
