# CLI write-path UX — actionable AJV errors + `--show-schema` field hint (grounded intel for TASK-016 / TASK-017)

Date: 2026-06-07
Scope: two write-path frictions surfaced by dogfooding `pi-context append-block-item` (filing FGAP-062): (1) validation errors are non-actionable; (2) no inline way to see a block's writable field shape. Both are already filed (FGAP-023 → TASK-016; FGAP-022 → TASK-017, `cli-parity` release-group). This document is the grounded root-cause + seam intel to drive those tasks, so the implementer does not re-investigate.

All claims grounded against current code (two read-only Explore passes).

---

## Part 1 — Actionable validation errors (FGAP-023 / TASK-016)

### Root cause: one shared site discards AJV's structured params
`packages/pi-context/src/schema-validator.ts:88` — the `ValidationError` constructor message builder:
```ts
const details = errors.map((e) => `${e.instancePath || ""}: ${e.message}`).join("; ");
```
This single `.map` produces the observed string `Validation failed for framework-gaps: /gaps/61: must NOT have additional properties`. It reads only `instancePath` + `message` and discards `e.params`.

- AJV is built with `allErrors: true` (`schema-validator.ts:13`), so the full `ErrorObject[]` is populated.
- The constructor **receives** `errors: ErrorObject[]` and **stores it** on `this.errors` (`schema-validator.ts:92`) — but the message drops the structured fields.
- The actionable data is in `e.params`: `additionalProperties` → `params.additionalProperty` (the offending field, e.g. `"reproduction"`); `required` → `params.missingProperty`; `enum` → `params.allowedValues`. All present, none surfaced.

### Schema reachability
The schema object is **not** in the `ValidationError` constructor (it gets only `label` + `errors`). It **is** in-hand one frame up at `validate(schema, data, label)` (`schema-validator.ts:111`, throws `:129`). So:
- `params` alone makes errors actionable with no schema needed.
- A fuller "here are ALL allowed fields" message needs the schema threaded from `:111` into the error, or re-derived from `schemaPath`.

### One shared site, not a class
Every write op funnels through the single `ValidationError(label, errors)` constructor (`schema-validator.ts:87-93`):
- `append-block-item` → `block-api.ts:1766` `validateBlockWithMigrationForDir` + `block-api.ts:894` `validateFromFile`
- `update`/`upsert`/nested → `block-api.ts:894/1449` `validateFromFile`
- `write-block` → `block-api.ts:1766/894`
- `append-relation` + edits → `context-sdk.ts:1431/1472/1529/1582` `validateFromFile`
- `amend-config` → `context.ts:485/1205` `validateFromFile`
- schema writes → `schema-write.ts:519` `validateSchemaAgainstMeta`

All reach `validate()` (`schema-validator.ts:129`) → `ValidationError`. Improving line 88 fixes all write ops at once.

### Two fix locations (the real design choice)
- **(a) Library-side** — enrich the `.message` at `schema-validator.ts:88` by reading `e.keyword` + `e.params`. Fixes **every** surface, including the in-pi `pi -p` tool dispatch. BUT changes the in-pi op's error output.
- **(b) CLI-side** — the CLI catch reads `err.errors[].params` (the array is already carried on the `ValidationError`) and formats. Keeps the in-pi op message byte-unchanged. **This is TASK-016's chosen approach** (lift `formatAjvError` from `file-block-item.ts:184-205` into the `cli.ts:511-518` catch; new `render.ts`). The CLI is pure `err.message` pass-through today (`cli.ts:516-523`, `bin.ts:8-9`), reading neither `err.errors` nor `params`.

### Repro
`pi-context append-block-item --block framework-gaps …` with an item carrying an unknown field (`additionalProperties` → drops `params.additionalProperty`), a missing required field (`required` → drops `params.missingProperty`), or an out-of-enum `status` (`enum` → drops `params.allowedValues`).

---

## Part 2 — `--show-schema` field hint (FGAP-022 / TASK-017)

### The derivation primitive already exists
`read-schema` op (`ops-registry.ts:1140-1181`): params `schemaName` + optional `path` (dotted/bracket, e.g. `properties.tasks.items.properties.status`). Run body calls `readSchema(cwd, schemaName)` (`schema-write.ts:327` → `readSchemaForDir` `:298-314` → `schemaPathForDir` `context-dir.ts:386-389`, reading `<contextDir>/schemas/<schemaName>.schema.json`), then `addressInto(schema, {path})` + `structureForRead`. So `properties`/`required`/per-field `{type, enum, description}` are already on-demand addressable. The capability exists; only the **packaging** is the friction.
Live: `read-schema --schemaName tasks --path properties.tasks.items` → `["id","description","status"]`.

### The 3-step indirection (the friction `--show-schema` collapses)
To learn block `<X>`'s writable fields today:
1. Know `schemaName == block name`.
2. Resolve `array_key` from config: `read-config --registry block_kinds` (op `ops-registry.ts:896-942`) → e.g. `tasks` → `{schema_path, array_key:"tasks", data_path}`.
3. `read-schema --schemaName <X> --path properties.<array_key>.items` and hand-read `required` + `properties`.

`resolveBlockItemSchema` (`block-api.ts:2266-2295`) already finds the array property + resolves `items` (incl. `$ref`) and returns `{arrayKey, itemSchema}` — the exact primitive `--show-schema` composes.

### cli.ts seam + blast radius
- Early-return branch in `main()` mirroring the `parsed.help` branch (`cli.ts:469-472`), placed **before** `op.run` (`:496`), so nothing is written. Arg seam: `parseOpArgs` (`:460`), alongside the existing `injectWriter` global (`cli.ts:294-304`).
- Reuses `readConfig` (block_kinds → array_key) + `readSchema` + `resolveBlockItemSchema` — no new derivation.
- **Confined to `packages/pi-context-cli/src/cli.ts`** (TASK-017 `files` list); in-pi ops frozen / byte-unchanged.

---

## Part 3 — Existing-filing map (do not duplicate)
| Friction | Gap (status) | Task (status) | Release-group |
|---|---|---|---|
| Non-actionable AJV errors | FGAP-023 identified | TASK-016 planned (closes FGAP-020/021/023; files `cli.ts` + new `render.ts`) | cli-parity 2/5 |
| `--show-schema` preview | FGAP-022 identified | TASK-017 planned (closes FGAP-022/024/026; files `cli.ts`) | cli-parity 3/5 |

Both trace to `analysis/2026-06-05-cli-ops-scripts-parity-survey.md` (GAP-5 + GAP-4). They are **sibling, complementary** affordances — FGAP-023 reactive (error-time, names offending/allowed fields after a failure); FGAP-022 proactive (pre-write contract preview) — not duplicates. Both honor "in-pi ops byte-unchanged".

## Part 4 — Open decision
The in-pi `pi -p` tool surface keeps the **raw** AJV `.message` under the planned (CLI-scoped) fix. If actionable errors should also reach the in-pi surface, the fix must move to `schema-validator.ts:88` (library-side, Part 1 option (a)) — which TASK-016 deliberately avoids to keep in-pi output stable. This is a scope decision, not a defect.

## Key file:line index
- `packages/pi-context/src/schema-validator.ts:13` (allErrors), `:88` (message-collapse root cause), `:92` (this.errors stored), `:111/129` (validate, schema in-hand)
- `packages/pi-context-cli/src/cli.ts:294-304` (injectWriter global), `:460` (parseOpArgs), `:469-472` (parsed.help early branch — the `--show-schema` seam), `:496` (op.run), `:511-523` (catch, pure err.message)
- `packages/pi-context-cli/src/bin.ts:8-9` (top-level catch, err.message)
- `packages/pi-context/src/ops-registry.ts:896-942` (read-config), `:1140-1181` (read-schema)
- `packages/pi-context/src/schema-write.ts:298-329` (readSchema/readSchemaForDir)
- `packages/pi-context/src/block-api.ts:2266-2295` (resolveBlockItemSchema), `:894/1449/1766` (validate funnels)
- `scripts/orchestrator/file-block-item.ts:184-205` (formatAjvError to lift), `:113-142` (contract-preview to lift)
