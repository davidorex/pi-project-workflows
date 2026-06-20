# Audit — TASK-057 proposed resolution (read-schema-history + applied-at stamp + baseline lineage, G2)

Date: 2026-06-20. Read-only design audit (code-simplifier lens). No mutation, no implementation.

## Verdict: HAS-PROBLEMS

The read-only command itself (acceptance criterion 1) is sound and well-modelled by existing
ops. But TWO of the three sub-deliverables rest on poisoned assumptions about how this codebase
actually works:

- **Criterion 2 ("stamp an applied-at time when a migration runs") is WRONG** — there is no
  discrete "migration runs against the substrate" event to stamp. Migration application here is
  lazy, in-memory, recomputed on every read, and explicitly NOT persisted. There is no mutation
  site at which an applied-at could be recorded, and no per-substrate notion of "ran" at all.
- **Criterion 3 ("each new baseline keeps a pointer to the baseline it replaced") is sound in
  intent but mis-scoped/over-built as written** — the simplest correct form is a single
  `prior_content_hash` field on the existing `installed_from` baseline record, not new lineage
  machinery; and it must be reconciled against DEC-0004's "no native version DAG" boundary, which
  the task's notes wave away too quickly.

The command would therefore be specified to print history fields (criterion 4: "when" complete
from substrate data alone) that the recording fixes, as written, cannot actually produce.

---

## Evidence

### Finding A — "applied-at when a migration runs" has no event to attach to (criterion 2 WRONG)

`validateBlockWithMigrationForDir` (`packages/pi-context/src/schema-validator.ts:205-242`) is the
only path that runs a migration. Its own header states the design (`:200-203`):

> "The migrated data is what gets validated; the input is not mutated. Out of scope: writing the
> migrated form back to disk — call sites that need persistence handle that themselves..."

`:232-238`: when `schemaVersion !== blockVersion`, it calls `runMigrations(...)` purely in-memory
and returns the migrated copy to `validate()`. The on-disk block file's `schema_version` is never
advanced (Explore confirmed: no write-back). Consequences:

- A migration "runs" on EVERY read of a stale-version block, indefinitely, idempotently. There is
  no single "the migration was applied at T" moment — there are unbounded re-applications, none
  recorded.
- The `MigrationDecl` registry (`migrations-store.ts:74-93`) carries only `created_at` (authoring
  time of the *declaration*), confirming the task's own observation. But the task's proposed fix —
  "stamp an applied-at time when a migration runs" — presupposes a persisted apply event that the
  architecture deliberately does not have. There is nowhere to put the stamp without inventing a
  new persisted-application-log mechanism the task does not name and DEC-0004's scope discussion
  never contemplated.
- "Applied-at" is also ambiguous per-what: per substrate? per block file? per item? Lazy
  re-migration makes all three ill-defined.

This is the load-bearing poisoned assumption: the task frames applied-at as a small "recording
fix… event metadata, not git refs/DAG machinery," but there is no event. Making one means either
(i) a new migration-application ledger (sidecar file) with its own write path, validation, and
DispatchContext stamping — real scope, not a fix — or (ii) eager write-back-on-migrate, which
reverses the explicit `:202` design decision and is a separate, larger change with substrate-wide
blast radius.

### Finding B — baseline lineage is real but over-specified; simplest form is one field (criterion 3)

The install baseline is `config.installed_from.assets[name] = { content_hash, version }`
(`packages/pi-context/src/context.ts` `installed_from` type; written by `stampBaselineFromBody`,
`index.ts:2169-2191`). The advance overwrites in place (`:2181-2188`):

```ts
assets: { ...config.installed_from.assets, [name]: { content_hash: hash, version } }
```

So the prior `{content_hash, version}` is lost from config; the prior body survives only as an
orphaned object in `objects/` keyed by its now-unreferenced hash. The task's read — "each baseline
advance overwrites the prior with no parent pointer" — is ACCURATE.

But the fix as written ("baseline lineage") invites a list/chain structure. The minimal correct
fix is a single self-referential pointer on the existing record:
`assets[name] = { content_hash, version, prior_content_hash? }`, set from the pre-overwrite
`assets[name].content_hash` inside `stampBaselineFromBody`. That re-references the otherwise-orphaned
prior object and yields a walkable chain (follow `prior_content_hash` through `objects/`) WITHOUT a
new file, a new array, or new write op. Anything heavier is scope-creep against an existing,
already-content-addressed store.

### Finding C — DEC-0004 boundary under-examined (fragility / scope)

DEC-0004 (`enacted`) draws an explicit line: "No native version DAG, snapshot roots, branch refs,
or merge-base finder — git supplies all of them." The task notes assert applied-at + lineage "are
event metadata, not git refs/DAG machinery, so DEC-0004 does not speak to them." For the baseline
`prior_content_hash` pointer that holds (it is a content-address back-link inside an install
record, not a commit DAG). For "applied-at," the claim is shakier: a persisted migration-application
log IS a form of native version-event history, exactly the "when did the model change" question
git already answers via `git log` on `migrations.json`/`config.json`. The task's own framing ("the
`git log <file>` analog") concedes git already holds the "when." That makes criterion 4 ("when does
not require digging through git commits") a *new requirement to duplicate git's ledger inside the
substrate* — which is precisely the boundary DEC-0004 set. This needs an explicit decision, not a
notes-field wave-through.

### Finding D — the command (criteria 1, 5) is sound and well-precedented

The read-only op is clean and has direct models. `OpDefinition` shape (`ops-registry.ts`): `name`,
`label`, `description`, `promptSnippet?`, `parameters` (Typebox), `run(cwd, params, ctx?)`,
`surface: "use"`. Read-only schema-state precedents exist: `context-check-status` (installed-vs-
catalog drift, `Type.Object({})`, returns `{ json }`) and `read-config` (registry/id addressing,
`{ read: structureForRead(...) }`). A `read-schema-history --schemaName` op composing the existing
MigrationDecl registry + the `installed_from` baseline record is a faithful, low-risk addition. The
problem is not the command — it is that two of its declared input sources (applied-at; lineage as
specified) don't exist correctly yet.

---

## Proposed corrected proposed-resolution text (ready to replace the task's fields)

### description (replace)

> Schema version-history audit (the `git log <file>` analog): a read-only command
> (`read-schema-history --schemaName <name>`) that composes the history the substrate already
> records — the registered migration decls for the schema (from→to, kind, author, authored-at) and
> the install-baseline lineage — into one printed view, plus the installed/catalog versions. One
> recording fix is in scope and is the minimal form: on each baseline advance, retain a
> `prior_content_hash` pointer to the baseline it replaces, so the prior body in `objects/` stops
> being orphaned and the baseline chain is walkable from substrate data alone.
>
> NOT in scope, and why: an "applied-at" stamp per migration. Migration application here is lazy
> and unpersisted — `validateBlockWithMigrationForDir` runs migrations in-memory on every read of a
> stale-version block and explicitly does NOT write the migrated form back (schema-validator.ts:200-242);
> a block's `schema_version` never advances on disk. There is therefore no discrete
> "a migration ran at T" event to stamp without inventing a new migration-application ledger or
> reversing the no-write-back design — either is a separate, larger change, and the "when" it would
> record is already held by `git log` on `migrations.json`/`config.json` (which DEC-0004 keeps as
> git's job, not the substrate's). The history this command prints sources "authored-at" from the
> decl and baseline timestamps; "applied-at" is deferred to its own decision (see below).

### acceptance_criteria (replace the list)

1. A read-only command `read-schema-history --schemaName <name>` prints the schema's history —
   its registered migration decls (from→to, kind, author, authored-at) and its install-baseline
   lineage (each baseline's version + content_hash + the prior it replaced) plus installed/catalog
   versions; the read path mutates no substrate state.
2. On each baseline advance, `stampBaselineFromBody` records a `prior_content_hash` pointer to the
   baseline it replaces (single field on the existing `installed_from.assets[name]` record; the
   prior object in `objects/` is no longer orphaned). No new file, array, or write op is added.
3. The printed baseline lineage is walkable from substrate data alone (follow `prior_content_hash`
   through `objects/`); the migration-decl history is complete from `migrations.json` alone.
4. The op composes ONLY already-recorded substrate state (migration decls + baseline records +
   installed/catalog versions); it introduces no migration-application log and no `schema_version`
   write-back.
5. Canonical pipeline green (build + check + full test, runtime demo of a migrated/re-baselined
   substrate's printed history, fresh adversarial probe); docs-surface-sync pass for the new op's
   surfaces (monorepo + pi-context README + ops-registry description/promptSnippet + SKILL regen).

### notes (replace)

> Origin: operator-story G2 ("after a migration has been applied, I want to see the version history
> of a schema — which migrations ran, when, and from what base"). Scope corrected by code audit
> (analysis/2026-06-20-audit-TASK-057-proposed-resolution.md): the read command + baseline
> `prior_content_hash` pointer stand; the "applied-at when a migration runs" sub-deliverable is
> removed as resting on a non-existent event — migration application is lazy/in-memory/unpersisted
> (schema-validator.ts:200-242). Whether the substrate should persist its own migration-application
> ledger (duplicating the "when" git already holds, against the DEC-0004 "no native version DAG /
> git owns lineage" boundary) is a DECISION to file separately, not an in-scope recording fix here.

### Optional spin-off (do not auto-file)

If the operator genuinely needs a substrate-internal "applied-at" independent of git, file a
DECISION that confronts DEC-0004 directly (persist a migration-application event-log vs. rely on
`git log migrations.json`), with the new sidecar/write-path/validation scope named. That is a
design decision, not a recording fix folded into a read command.
