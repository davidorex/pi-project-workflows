# Audit — TASK-073 proposed resolution (block schema_version stamping, addresses FGAP-099)

Date: 2026-06-20
Scope: read-only design audit of TASK-073's description + acceptance_criteria against the actual cited code. No mutation, no implementation.

## Verdict

SOUND (with two refinements). The core mechanism the task names is real, the cited code locations are accurate, and the proposed direction (stamp `schema_version` + relax the envelope `additionalProperties:false` for it) is the minimal correct path. Two corrections improve it: (1) the envelope-vs-item "stamp location" is NOT genuinely open — the code already commits to **envelope-level**, so the framed-open DECISION is a derivable answer, not a fork; (2) the acceptance criteria under-specify the migration-registration half (a stale-version block can only be "caught" or "migrated" if a migration is registered, otherwise the existing code path THROWS — that throw-vs-migrate behavior must be named as acceptance, not left implicit).

## Assumption verification (all cited code read directly)

| Claim in TASK-073 / FGAP-099 | Cited location | Verified? |
|---|---|---|
| Read-time AJV hook is gated on `schema_version` presence and never fires for blocks | block-api.ts:785-791 | TRUE. Hook runs only when `existingBlockSchemaPathForDir(...) !== null` AND `typeof envelope.schema_version === "string"`. With no `schema_version` on data, the inner branch is skipped. |
| Write path stamps only author/identity fields; never produces `schema_version` | block-api.ts:870-938 (writeTypedFile), 1758-1767 (writeBlockForDir) | TRUE. `writeTypedFile` stamps only declared author fields via `stampItem`; it never adds `schema_version`. `writeBlockForDir` (1758-1767) routes through `validateBlockWithMigrationForDir` ONLY when `identityStamped.schema_version` is already a string — i.e. it carries through an existing value but never originates one. |
| Migration version-mismatch branch never triggers because `data.schema_version` is absent | schema-validator.ts:225-239 | TRUE. `blockVersion` is read off `data.schema_version`; the migrate branch is `if (schemaVersion && blockVersion && schemaVersion !== blockVersion)`. With `blockVersion` undefined, it falls straight to `validate(...)`. |
| Block schema envelopes are `additionalProperties:false` and reject a top-level `schema_version` | samples/schemas/story.schema.json | TRUE. Envelope is `type:object`, `additionalProperties:false`, sole top-level property `stories`. A top-level `schema_version` on data would fail AJV today. |
| Version lives only in the schema file, not the data envelope | story.schema.json `version: "1.0.1"` | TRUE. |

No WRONG assumptions found. The FGAP's "class" framing ("read-time validation and migration are inert whenever the versioned-data envelope is absent") is accurate to the code.

## Problem 1 — the "stamp location" DECISION is framed as open but is already decided by the code

Both the task description and `notes` defer "stamp location: envelope vs items" to a pre-implementation DECISION. The cited code already answers it — at the **envelope** level — and the answer is not reasonably reversible without far larger work:

- The read hook (block-api.ts:786-789) reads `envelope.schema_version` off the **whole-block** object and passes the **whole envelope** to `validateBlockWithMigrationForDir`. There is no per-item read.
- The comment at block-api.ts:782-784 states explicitly: "per-array-item migration is out of scope today (the block envelope is what carries schema_version, not each item)."
- `validateBlockWithMigrationForDir` (schema-validator.ts:225-239) reads `data.schema_version` off the top-level object and migrates the whole `data`, not per item.
- The write check (block-api.ts:1758-1767) reads `identityStamped.schema_version` — again top-level/envelope.

Per the standing "derive decisions, don't surface as forks" mandate: a choice fully determined by the existing read-hook + migration-branch + write-check shape is a decision to DERIVE and state, not a "your call" fork. Per-item stamping would require reworking all three sites and the migration runner to iterate items — that is a different, larger task, not the FGAP-099 minimal fix. The DECISION, if filed at all, should record envelope-level as derived-from-code, with per-item explicitly out of scope (matching the existing comment), rather than presenting envelope-vs-item as an undecided fork.

## Problem 2 — acceptance criteria #3 under-specifies the throw-vs-migrate boundary

Criterion #3: "A version-bump migration applies to existing block data on read; a stale-version block is caught." This conflates two distinct outcomes the code already distinguishes (schema-validator.ts:232-238):

- If `schemaVersion !== blockVersion` AND a migration is registered → `runMigrations(...)` walks data forward, then validates. ("migration applies")
- If `schemaVersion !== blockVersion` AND no registry / no chain → the function THROWS (`...declares schema_version '<x>' but schema is at '<y>' and no MigrationRegistry was supplied`). ("caught" = a hard read-time failure)

This is the load-bearing behavioral consequence of the whole change: once blocks carry `schema_version`, ANY schema `version` bump WITHOUT a registered migration turns every existing on-disk block of that kind into a read-time throw — `readBlockForDir` will throw on read, which means `read-block`, `context-validate`, and every consumer that reads that block break until a migration is registered or the data is rewritten. The proposed resolution does not surface this; it should, because it converts a silent-no-op today into a fail-closed read tomorrow. That is the correct safety posture, but it must be an explicit, tested acceptance criterion (both branches), not an unstated side effect.

Also note (not a defect, a scope boundary worth stating): the write path at block-api.ts:1758-1767 already migrates-or-throws on write when `schema_version` is present. Once writes stamp `schema_version`, a same-session schema bump can make the NEXT write of an unmigrated block throw too. The acceptance set should name write-path behavior as well as read-path, since the stamp activates both gates symmetrically.

## Problem 3 — "(or items)" parenthetical in the proposed_resolution should be removed

FGAP-099 `proposed_resolution` says "stamps the current schema version onto the block envelope (or items)". Per Problem 1 the "(or items)" branch is not viable within this task's cited surface and contradicts the in-code out-of-scope comment. Carrying the ambiguity forward into the task invites a downstream subagent (which consumes this text verbatim) to consider per-item stamping. Remove it.

## What is genuinely sound and should NOT change

- The minimal envelope relaxation (`additionalProperties:false` → admit a single typed `schema_version` top-level property) is the correct, smallest schema change. No need to relax `additionalProperties` wholesale; add `schema_version` as an explicit typed property (e.g. `{"type":"string"}`, optional so pre-stamped blocks still validate during rollout).
- Reusing the existing read hook + migration branch rather than building new validation machinery is correct — the change is "produce the value the existing gates already look for," which is exactly the right altitude.
- Files list (block-api.ts + samples/schemas/) is accurate. Note the schema change must also be applied to the **installed** schema bodies in real substrates (objects/ baseline + installed schemas), not only the samples catalog — a fresh `samples/` edit does not reach already-installed substrates without the install/update path. The acceptance set should name catalog + an install/update consideration so existing substrates' schemas admit the new field.

## Proposed corrected fields (ready to replace)

### description (replace)

> Originate `schema_version` on the block write path so the read-time AJV hook (block-api.ts:785-791) and the migration version-mismatch branch (schema-validator.ts:225-239) become active for all blocks. Today both gates read `schema_version` off the whole-block envelope but the write path (writeTypedFile block-api.ts:870-938; writeBlockForDir block-api.ts:1758-1767) only carries through an existing value and never produces one, and block schema envelopes are `additionalProperties:false` (samples/schemas/*) which rejects a top-level `schema_version`. Stamp the current schema `version` onto the block **envelope** (envelope-level is derived from the existing code: all three gates read/migrate the top-level object; per-item migration is explicitly out of scope per block-api.ts:782-784) on write, and admit an optional typed top-level `schema_version` on block schema envelopes. Activating the stamp turns both gates live symmetrically: on read and on write, a block whose stamped version differs from the schema `version` migrates forward if a migration is registered, else THROWS (schema-validator.ts:232-238) — fail-closed rather than the current silent no-op.

### acceptance_criteria (replace)

> - Block data carries `schema_version` (the current schema `version`) after a write through writeBlockForDir; block schema envelopes admit an optional typed top-level `schema_version` (envelope relaxed to permit exactly that property, not `additionalProperties` opened wholesale; optional so pre-stamped blocks still validate during rollout). Applied to the samples catalog AND reachable by already-installed substrates (install/update brings the new field into installed schema bodies).
> - The read-time AJV hook (block-api.ts:785-791) fires for blocks because `schema_version` is now present; a block at the current version validates and reads unchanged.
> - On a schema `version` bump WITH a registered migration: existing block data migrates forward on read (runMigrations) and validates against the current schema.
> - On a schema `version` bump WITHOUT a registered migration: read THROWS the version-mismatch error (schema-validator.ts:234-236) — a stale-version block is caught fail-closed, not silently read. Both branches (migrate / throw) are demonstrated.
> - Write-path symmetry: writeBlockForDir's pre-write migration gate (block-api.ts:1758-1767) likewise migrates-or-throws once `schema_version` is stamped; a same-version write is unaffected.

### notes (replace)

> Stamp location is envelope-level — derived from the existing read hook, migration branch, and write check, which all read/migrate the whole-block top-level object; per-item stamping is out of scope (block-api.ts:782-784). No open DECISION required; if a DECISION is filed it records envelope-level as derived-from-code with per-item explicitly deferred.

### FGAP-099 proposed_resolution (recommend amend, read-only — not mutated here)

> Remove the "(or items)" parenthetical; envelope-only. Add: activating the stamp makes both read and write gates fail-closed on an unmigrated version gap (throw), which is the intended safety posture and must be tested on both the migrate and throw branches; the schema field must reach already-installed substrates via install/update, not only the samples catalog.
