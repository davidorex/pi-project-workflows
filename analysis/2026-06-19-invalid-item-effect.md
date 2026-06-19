# Concrete effect of schema-invalid block items: the 14-`user_kind`-stories scenario

Date: 2026-06-19
Scope: establish, in code + a `/tmp` repro, what actually breaks if 14 live `story` items each
carrying a `user_kind` property are validated against a story schema that drops `user_kind`
under `additionalProperties:false`. READ-ONLY on the live `.context` substrate (nothing live
mutated). Repro at `/tmp/effect-probe`.

## Verdict (one line)

VALIDATION FLAG ONLY at READ/DERIVE (which in this case do not even flag — bare envelope, no
`schema_version`) + WRITE BLOCK scoped to the affected block; NO data loss, NO read brick, NO
substrate-wide failure. The invalid items are silently readable/derivable everywhere, `context-validate`
does NOT report them, and the only hard effect is that writes TO the story block fail (hard, exit 5,
enumerating all 14 `unexpected property user_kind`) until the items are reconciled — writes to OTHER
blocks are unaffected.

## Classification against the four candidate effects

| Candidate | Occurs? | Evidence |
|---|---|---|
| (a) DATA LOSS — items deleted/altered on disk | NO | Items byte-identical on disk after all ops; failed write aborts pre-persist |
| (b) READ BRICK — read/derive ops throw | NO | `read-block`, `read-block-item`, `context-current-state`, `context-status`, `context-lens-view` all `ok:true` |
| (c) WRITE BLOCK — writes fail | YES, block-scoped | `update-block-item` on story → exit 5, all 14 items rejected; `append-block-item` on `tasks` → `ok:true` |
| (d) VALIDATION FLAG ONLY | PARTIAL/NONE | `context-validate` did NOT detect the extra property at all (no per-item AJV in validate) |

`additionalProperties:false` + an extra property yields a HARD AJV error (`unexpected property
user_kind`), not a warning — but ONLY on the write path; it surfaces NOWHERE on the read/validate path.

## Part 1 — Code: where item-validation is (and is not) enforced

All refs `packages/pi-context/src/`. The AJV primitive `validate()`
(`schema-validator.ts:111`) THROWS `ValidationError`; AJV is `new Ajv({allErrors:true, strict:false})`
(`schema-validator.ts:13`) — `strict:false` does NOT disable `additionalProperties:false`, the keyword
still rejects extra props as a data error. A whole-block validate covers items because the block schema
declares `properties.<arrayKey>.items`.

- **READ (`readBlock`/`readBlockItem`/`readBlockPage`) — conditional, gated on `schema_version`.**
  `readBlockForDir` (`block-api.ts:754`) parses, then runs AJV ONLY when the envelope carries a string
  `schema_version`:
  ```
  block-api.ts:785  if (existingBlockSchemaPathForDir(substrateDir, blockName) !== null) {
  block-api.ts:787    if (envelope && typeof envelope === "object" && typeof envelope.schema_version === "string") {
  block-api.ts:789      data = validateBlockWithMigrationForDir(substrateDir, blockName, envelope, registry);
  ```
  No `schema_version` ⇒ hook skipped ⇒ read just parses + returns, NO per-item validation.
  `story.json` (live AND repro) is a bare `{"stories":[…]}` with NO `schema_version` ⇒ read-path AJV is
  DORMANT for story. `readBlockItem`/`readBlockPage` (`context-sdk.ts:1052`,`:1071`) delegate to
  `readBlock`, add no validation.

- **id-index build (`buildIdIndexForDir`, `context-sdk.ts:1312`) — NO per-item AJV.** Reads each block in a
  `try/catch` that SKIPS malformed blocks (`:1336-1338 … continue`); the only throw is the
  prefix-vs-block-kind invariant. An extra property is indexed without complaint.

- **`currentState`/`contextState`/lens — NO per-item AJV; tolerate throws.** `currentState`
  (`context-sdk.ts:728`) wraps the index build in `try/catch` collapsing to empty state on any throw
  (`:731-736`).

- **`validateContext` (`context-sdk.ts:2105`) — NO per-item AJV.** Runs only: SoT-drift, edge-integrity
  (`edge_endpoint_*`, error), edge registration/kind, cycle (`edge_cycle_detected`), config invariants
  (`requires-edge`, `status-consistency`), status-vocab (`status_unknown_value`, warning), and a
  schema-FILE nested-id-array warning (`nested_id_bearing_array`, warning, `:2418`). It returns
  `{severity,message,code}` issues, never throwing for data-shape. An extra property on an item produces
  NO issue. (Only indirect path: if the block carried `schema_version`, the build's `readBlockForDir`
  would throw and propagate as a hard failure — moot for story, which has none.)

- **WRITE (`appendToTypedFile`/`updateItemInTypedFile` → `writeTypedFile`) — WHOLE-BLOCK AJV, hard throw.**
  ```
  block-api.ts:893  if (schemaPath) {
  block-api.ts:894    validateFromFile(schemaPath, toWrite, label);
  ```
  `toWrite` is the entire block array, so AJV validates every sibling item. A pre-existing invalid sibling
  makes the write to a valid new/updated item THROW (`ValidationError`). Read-modify-write-whole-array
  semantics under `withBlockLock`; no single-item validation path. Scope is the file being written — other
  blocks' writes are independent.

## Part 2 — `/tmp/effect-probe` repro: observed effects (real output)

Setup: `context-init --contextDir .context --yes` → `context-accept-all --yes`
(17 schemas/blocks) → `context-install --yes`. The catalog story schema (`story.schema.json`) does NOT
ship `user_kind`, so the scenario was constructed per spec: (1) wrote a story schema INCLUDING
`user_kind`; (2) seeded 14 `STORY-001..014` items each carrying `user_kind`; confirmed valid via
`read-block` (`ok:true`, total 14); (3) OVERWROTE the schema with a version that DROPS `user_kind` while
keeping items' `additionalProperties:false`. Items left untouched. `story.json` is a bare envelope (no
`schema_version`).

Observed against the post-drop state:

- `read-block --block story` → `{"ok":true,…"total":14,…}` — all 14 returned WITH `user_kind`. No throw.
- `read-block-item --block story --id STORY-001` → `{"ok":true,…"data":{…,"user_kind":"developer"}}`. No throw.
- `context-current-state` → `{"ok":true,"focus":"no active focus.","inFlight":[],…}`. No throw (no
  task/feature seeded so empty by design, but it INDEXED story with no error).
- `context-status` → `{"ok":true,…"story":{"arrays":{"stories":{"total":14,"byStatus":{"ready":7,…}}}}}`.
  No throw; counts all 14 invalid items and bins them. (Stray `fatal: not a git repository` lines are the
  /tmp dir lacking `.git`, unrelated to schema.)
- `context-lens-view --lensId gaps-by-status` → `{"ok":true,…}`. Unrelated read works.
- `context-validate` → `{"ok":true,"status":"warnings","issues":[{…"code":"nested_id_bearing_array"…},{…}]}`
  — the ONLY issues are two schema-shape warnings on `layer-plans`; the 14 invalid story items are NOT
  reported. Confirms `validateContext` runs no per-item AJV.
- `update-block-item --block story --match {"id":"STORY-001"} --updates {"status":"complete"}` → exit 5,
  `{"ok":false,…"error":"validation failed for block file 'story.json': \`/stories/0\`: unexpected property
  \`user_kind\`; … \`/stories/13\`: unexpected property \`user_kind\`"}`. HARD failure; all 14 enumerated;
  the requested status flip did NOT apply (STORY-001 still `ready` on disk).
- `append-block-item --block tasks …` → `{"ok":true,…"Appended item 'TASK-001'…"}`. A write to an UNRELATED
  block SUCCEEDS while story is invalid → the write-block is BLOCK-SCOPED, not substrate-wide.
- Disk check (`Read story.json`): all 14 items byte-identical, `user_kind` present, STORY-001 still
  `status:"ready"` (the failed write aborted before persisting). NO data loss / NO alteration.

## What this means for the live `.context` substrate

The dreaded "config-load brick" failure mode does NOT reproduce here. Because `story.json` carries no
`schema_version`, the read-path migration/AJV hook never fires, so the invalid items are invisible to
every read and derivation surface (`read-block`, `current-state`, `status`, lenses) AND to
`context-validate`. The substrate would NOT brick and the items would NOT be lost or detected as invalid.
The single concrete consequence is latent: any subsequent CLI WRITE targeting the story block (a status
flip, an append, a field update on ANY story item) would fail hard (exit 5) until every story item is
reconciled to the new schema — and that failure enumerates all 14 offenders, which is the only signal the
operator would receive. Writes to all other blocks remain unaffected.

(Note: a block that DOES carry `schema_version` would behave differently — its read-path AJV hook fires,
so an invalid item there would throw on read and propagate through the index build as a hard failure. The
read-tolerance observed here is specific to version-less envelopes like `story.json`.)
