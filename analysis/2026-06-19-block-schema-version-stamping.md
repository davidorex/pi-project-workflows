# Block data files carry no `schema_version`: write-path-by-construction, universal

Date: 2026-06-19
Scope: pi-context block data files (`<block>.json`). READ-ONLY investigation; live `.context/` untouched. Evidence from CODE + a throwaway `/tmp/version-probe` install.

## Verdict

**(a) The write path never stamps `schema_version` onto block data — version-less by construction, UNIVERSAL to all blocks, not story-specific.** Story is not special; no block schema defines a top-level `schema_version` envelope property, and no write code path synthesizes one. The version of a block lives ONLY in its schema file (`*.schema.json` `"version"`), never on the data.

Consequence: with `schema_version` absent from block data, BOTH read-time paths that are gated on its presence are inert for block data —
- the read-time AJV/migration hook (`block-api.ts:785-789`), and
- the version-mismatch branch of `validateBlockWithMigrationForDir` (`schema-validator.ts:225-239`).

This mirrors the config-side gap (FGAP-095): a migration/version-check mechanism exists but never fires because nothing stamps the version assertion onto the data it compares against. On the block side the situation is even more closed than config — the block envelope schemas use `additionalProperties: false` and do NOT declare `schema_version`, so a `schema_version` on a block envelope would be REJECTED by AJV, not merely ignored.

## 1. Does the block-WRITE path stamp `schema_version`? — No.

`writeTypedFile` (`block-api.ts:870-938`) is the single sink for every block write. It stamps two things and only two things onto data:
- declared author fields, when the schema declares them (`block-api.ts:884-890`, via `stampItem`);
- per-item identity (`oid`/`content_hash`/`content_parent`) for identity-declaring arrays (in `writeBlockForDir` → `stampWholeBlockIdentity`, `block-api.ts:1738-1747`).

There is NO code anywhere in the write path that synthesizes a top-level `schema_version`. The only `schema_version` handling on write is *conditional on the incoming data already carrying one* — `writeBlockForDir` (`block-api.ts:1758-1767`):

```
let toWrite: unknown = identityStamped;
if (
    schemaPath !== null &&
    identityStamped &&
    typeof identityStamped === "object" &&
    typeof (identityStamped as Record<string, unknown>).schema_version === "string"
) {
    const registry = getProjectMigrationRegistryForDir(substrateDir);
    toWrite = validateBlockWithMigrationForDir(substrateDir, blockName, identityStamped, registry);
}
```

The branch only runs migration-aware validation when `identityStamped.schema_version` is already a string. Since nothing puts it there, the branch is dead for normal block writes. `appendBlockItem` / `appendManyToTypedFileIfAbsent` (`block-api.ts:1108-1183`) likewise only stamp identity/author per-item and call `writeTypedFile`; no `schema_version` is touched.

## 2. Envelope field or item field? — Neither is defined; the hook reads the ENVELOPE.

The read hook (`block-api.ts:785-789`) inspects the **top-level envelope** (the `{<arrayKey>:[…]}` object), not each item:

```
if (existingBlockSchemaPathForDir(substrateDir, blockName) !== null) {
    const envelope = data as Record<string, unknown> | null;
    if (envelope && typeof envelope === "object" && typeof envelope.schema_version === "string") {
        const registry = getProjectMigrationRegistryForDir(substrateDir);
        data = validateBlockWithMigrationForDir(substrateDir, blockName, envelope, registry);
    }
}
```

The block schemas do NOT define a top-level `schema_version` property. `story.schema.json` (`samples/schemas/story.schema.json`):

```
"type": "object",
"required": ["stories"],
"additionalProperties": false,
"properties": { "stories": { "type": "array", "items": { … } } }
```

Top-level properties are `stories` ONLY; `additionalProperties: false`. The schema's own version is the file-level `"version": "1.0.1"` (line 4) — a property of the schema document, not a data field. `tasks.schema.json`, `issues.schema.json`, `features.schema.json` all match: file-level `"version"`, no envelope `schema_version`, `additionalProperties: false` on items. So `schema_version` is neither an envelope field nor an item field in any shipped block schema — it is undefined on the data side, and `additionalProperties: false` on the envelope would actively reject it if written.

(The mechanism is genuinely wired — `block-api-fordir.test.ts:372-424` exercises it with a *synthetic* test schema that declares `required: ["schema_version","items"]` and data carrying `schema_version: "1.0.0"`. That proves the hook works when both schema-declares and data-carries; no SHIPPED block schema does either.)

## 3. /tmp repro — no block data carries `schema_version`, before or after a write.

`/tmp/version-probe` built via the global CLI: `context-init --contextDir .context` → `context-accept-all` → `context-install` (17 schemas + 17 block data files seeded). Then two appends through the CLI (`append-block-item`, planning-guard sentinel on the throwaway writes).

After install, before any write (`/tmp/version-probe/.context/story.json`, `tasks.json`):

```
{ "stories": [] }
{ "tasks": [] }
```

After a CLI append (same files, read directly):

```
{
  "stories": [
    { "id": "STORY-001", "title": "probe story", "status": "proposed",
      "created_by": "human/davidryan@gmail.com", "created_at": "2026-06-19T00:27:48.435Z",
      "modified_by": "human/davidryan@gmail.com", "modified_at": "2026-06-19T00:27:48.435Z",
      "oid": "e6fd23379a7f8ae896838a5bd45c7741",
      "content_hash": "bf9830983ec3a4adfa64a5fc28ca0678551923c84bc49d2331270175970b571b" }
  ]
}

{
  "tasks": [
    { "id": "TASK-001", "title": "probe task", "status": "planned", "description": "probe",
      "oid": "722fa1a07157008f425fd9ef18dbd8b0",
      "content_hash": "987a57ee8b55a594d76a2c7e823b8beb24a33927453e1eb1eec54ec5f0da35cc" }
  ]
}
```

Author + identity fields stamped (`created_by`/`oid`/`content_hash`); **no `schema_version` on envelope or item**, in either block, at either point. Empirically: no block data carries it after install, and a write does not introduce it.

## 4. Schema-version provenance — only in the SCHEMA file; data side is always absent.

`validateBlockWithMigrationForDir` (`schema-validator.ts:205-242`) compares `schema.version` (from the `*.schema.json` document, line 225) against `data.schema_version` (line 226-229). The mismatch/migration branch (line 232-238) only fires when BOTH are present and differ. Block schemas supply `schema.version`; nothing supplies `data.schema_version`. So `blockVersion` is always `undefined`, the migration branch never runs, and `toValidate === data` always (the data goes straight to `validate()`). The version-mismatch + migration-on-read machinery is dead for block data — exactly the config-side FGAP-095 shape, transposed to blocks.

CLI-surfacing note: `read-config` addresses only registries/maps (`--registry`/`--id`); it has no path to a top-level scalar, so the config envelope's `schema_version` is not surfaced by a read op either — consistent with the premise that this envelope field is not observable via the op surface and had to be established in code + a /tmp install.

## Decisive citations
- Write never stamps it: `block-api.ts:870-938` (`writeTypedFile`), `block-api.ts:1758-1767` (`writeBlockForDir` conditional), `block-api.ts:1108-1183` (append path).
- Read hook reads envelope, gated on presence: `block-api.ts:785-789`.
- Schema defines no envelope `schema_version`, `additionalProperties:false`: `samples/schemas/story.schema.json` (and tasks/issues/features siblings).
- Migration compares schema.version vs data.schema_version, branch dead: `schema-validator.ts:205-242`.
- /tmp evidence: `/tmp/version-probe/.context/{story,tasks}.json` pre- and post-write (pasted above).
