# Config-schema migration — corrected implementation steps

Date: 2026-06-18

Clean, defect-free extraction of the verified config-migration implementation. Derived from `analysis/2026-06-18-config-migration-proposal-validation.md` (Part C corrections + the Part B proven facts). Every hunk below is the corrected form; the original proposal's broken references (`resolveChain`, `applyDeclarativeTransform`, `bundledConfigSchema`, the `$.blocked_by…` paths, the `1.7.0` re-stamp) are already replaced here. Two items remain decision-gated and are marked **DECISION** — they are not resolved in this document.

Goal: carry `.context/config.json` forward when `config.schema.json` bumps to a breaking shape, via the existing block-schema migration machinery extended with one transform primitive (`map_each`) plus a migration-aware config load path. No new file, no new op, no separate registry.

---

## Feature summary

- `map_each` — one new declarative-transform operation, dual mode:
  - **table mode** (`table` [+ `fallback`]): each STRING element of the array at `path` is replaced by `table[element]`, or by `{ relation_type: element, item_endpoint: fallback }` when unmatched; non-string (already-object) elements pass through unchanged (idempotent).
  - **set-on-each mode** (`field` + `value`): each OBJECT element of the array at `path` gets `element[field] = value`.
- Config load becomes migration-aware: `loadConfigForDir` reads the data's `schema_version`, compares to the bundled config schema's `version`, runs the registered `config` migration chain forward when they differ, then validates the migrated shape.

---

## Step 1 — `src/migrations-store.ts` — extend the `TransformOp` union

The union is at `src/migrations-store.ts:64-68`, terminating with the `coerce` variant at `:68`. Append the `map_each` variant after `coerce`:

```ts
	| { op: "coerce"; path: string; type: "string" | "number" | "boolean" | "array" | "object" }
	| {
			op: "map_each";
			path: string;
			table?: Record<string, Record<string, unknown>>;
			fallback?: "parent" | "child";
			field?: string;
			value?: unknown;
	  };
```

---

## Step 2 — `schemas/migrations.schema.json` — add the `map_each` variant to `TransformOp` `oneOf`

The `TransformOp` `oneOf` array spans `:72-120` (closes `]` at `:120`, definition `}` at `:121`). Insert the new variant object after the `coerce` variant object (`:119` `}`), comma-separated, before the `oneOf` close `]` at `:120`:

```json
,
{
	"type": "object",
	"required": ["op", "path"],
	"additionalProperties": false,
	"properties": {
		"op": { "type": "string", "enum": ["map_each"] },
		"path": { "type": "string", "description": "Dotted '$'-prefixed path to the array whose elements are mapped." },
		"table": {
			"type": "object",
			"description": "When present: each string element is replaced by table[element], or by {relation_type: element, item_endpoint: fallback} when unmatched.",
			"additionalProperties": { "type": "object" }
		},
		"fallback": { "type": "string", "enum": ["parent", "child"], "description": "item_endpoint used for an unmatched string element under `table`." },
		"field": { "type": "string", "description": "When present (and `table` absent): set this field on every object element." },
		"value": { "description": "Value assigned to `field` on each object element." }
	},
	"oneOf": [
		{ "required": ["table"], "not": { "required": ["field"] } },
		{ "required": ["field", "value"], "not": { "required": ["table"] } }
	]
}
```

The inner `oneOf` enforces `table` XOR (`field`+`value`).

---

## Step 3 — `src/migration-registry-loader.ts` — add the `map_each` case to `applyOp`

`applyOp` is at `:132-182`; the `coerce` case closes at `:180`, switch closes `:181`. Insert the new case after the `coerce` block, before the switch close. It uses the real `walkPath(data, op.path, false)` returning `{ parent, key }` and the same missing-path guard the existing cases use:

```ts
		case "map_each": {
			const read = walkPath(data, op.path, false);
			if (read.parent === null || !(read.key in read.parent)) return data;
			const arr = read.parent[read.key];
			if (!Array.isArray(arr)) return data;
			if (op.table) {
				read.parent[read.key] = arr.map((el) =>
					typeof el === "string"
						? (op.table![el] ?? { relation_type: el, item_endpoint: op.fallback ?? "parent" })
						: el,
				);
			} else if (op.field !== undefined) {
				for (const el of arr) {
					if (el && typeof el === "object") (el as Record<string, unknown>)[op.field] = op.value;
				}
			}
			return data;
		}
```

`walkPath` is unchanged; array-index addressing (`[...]`) stays rejected; `$`-prefixed paths are required by `walkPath` (`:85-87`).

---

## Step 4 — `src/context.ts` — make `loadConfigForDir` migration-aware

Replace the validate line at `:579` (`validateFromFile(bundledSchemaPath("config"), data, …); return data as ConfigBlock;`) with the migration-aware path. This variant preserves the CURRENT behavior of validating against the **bundled** package schema (`bundledSchemaPath("config")`), adding migration via the real `runMigrations`:

Add imports to `context.ts`:

```ts
import { runMigrations } from "./schema-migrations.js";
import { getProjectMigrationRegistryForDir } from "./migration-registry-loader.js";
```

Replace `:579`–return with:

```ts
	const schemaPath = bundledSchemaPath("config");
	const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as { version?: string };
	const schemaVersion = typeof schema.version === "string" ? schema.version : undefined;
	const dataVersion =
		data && typeof data === "object" && "schema_version" in (data as Record<string, unknown>)
			? ((data as Record<string, unknown>).schema_version as string | undefined)
			: undefined;
	let toValidate: unknown = data;
	if (schemaVersion && dataVersion && schemaVersion !== dataVersion) {
		const registry = getProjectMigrationRegistryForDir(substrateDir);
		toValidate = runMigrations(registry, "config", dataVersion, schemaVersion, data);
	}
	validateFromFile(schemaPath, toValidate, `config.json (${p})`);
	return toValidate as ConfigBlock;
```

Notes carried from the verification:
- No try/catch: `runMigrations` throws a descriptive error on an unresolvable chain; fail-fast is the established convention (a silent catch would mask a missing migration and validate a stale shape).
- New import edge `context.ts → migration-registry-loader.ts`. The loader imports `migrations-store` + `schema-migrations` + `context-dir`, none of which import the `context.ts` config loaders, so the edge is acyclic — verify under `tsc` at build.
- `validateBlockWithMigrationForDir` was the other candidate but validates against the SUBSTRATE-DIR schema (`schemaPathForDirHelper`), not the bundled package schema — a behavior change from today. The inline variant above is the minimal faithful correction (same schema target as current code + migration).

---

## Step 5 — `schemas/config.schema.json` — version bump + shape change

- `:4` `"version": "1.7.0"` → `"1.8.0"`.
- Shape change in the `state_derivation` definition: `blocked_by` replaces `relation_types: string[]` with `relations: [{ relation_type, item_endpoint }]`; `rollups` items gain required `rollup_endpoint`.

---

## Step 6 — `samples/migrations.json` — ship the `config` migration declaration

Add to `migrations[]`. Paths are `$.state_derivation.…` (the fields live under `state_derivation`); keys are the registry's real field names (`schemaName`/`fromVersion`/`toVersion`). Operation order is map_each-before-rename (proven required: transform-in-place under the old key, then rename the key):

```json
{
	"schemaName": "config",
	"fromVersion": "1.7.0",
	"toVersion": "1.8.0",
	"kind": "declarative-transform",
	"created_by": "human/davidryan@gmail.com",
	"created_at": "<ISO-8601 at write time>",
	"transform": {
		"operations": [
			{ "op": "map_each", "path": "$.state_derivation.blocked_by.relation_types",
			  "table": {
			    "task_depends_on_task": { "relation_type": "task_depends_on_task", "item_endpoint": "child" },
			    "task_gated_by_item":   { "relation_type": "task_gated_by_item",   "item_endpoint": "parent" }
			  },
			  "fallback": "parent" },
			{ "op": "rename", "from": "$.state_derivation.blocked_by.relation_types", "to": "$.state_derivation.blocked_by.relations" },
			{ "op": "map_each", "path": "$.state_derivation.rollups", "field": "rollup_endpoint", "value": "child" },
			{ "op": "set", "path": "$.schema_version", "value": "1.8.0" }
		]
	}
}
```

---

## Step 7 — `samples/conception.json` config version coverage — **DECISION**

`samples/conception.json:2` config `schema_version` is `"1.0.0"` (not `1.7.0`). After the schema goes to `1.8.0`, reading any config still at `1.0.0` (every existing substrate) needs a chain from `1.0.0`, which a lone `1.7.0→1.8.0` edge does not cover. Do NOT silently re-stamp to `1.7.0` (leaves `1.0.0` with no inbound chain → `runMigrations` throws → bricks). Pick one, explicitly:

- **(a)** If the `1.0.0` config is shape-identical to the `1.7.0` config — **requires confirming 1.0.0 ≡ 1.7.0 config shape** — ship an `identity` edge `config 1.0.0→1.7.0` AND the declarative `config 1.7.0→1.8.0` edge (chain resolves `1.0.0→1.7.0→1.8.0`); re-stamp the catalog config to `1.8.0`.
- **(b)** Ship a single declarative edge `config 1.0.0→1.8.0` carrying the same 4 operations (they no-op on a config lacking `state_derivation`, since `walkPath` returns `parent:null` on absent paths and every op guards it) plus any `1.0.0→1.7.0` shape deltas; re-stamp catalog config to `1.8.0`.

---

## Sequencing

- Steps 1–3 (engine + schema for `map_each`) may ship in an earlier commit — the op is inert until a migration decl references it. The catalog decl (Step 6) must NOT ship until `map_each` exists in the engine.
- Step 4 (the `loadConfigForDir` hook), Step 6 (the migration decl), and Step 5 (the `config.schema.json` version bump + shape) must ship together AND the registered config edge must cover the real on-disk `schema_version` (Step 7). Step 4 wires config-migration consultation for the first time (config is not migration-aware today). If the schema bumps to `1.8.0` without the hook + a covering decl, `loadConfigForDir` AJV-validates `1.8.0`-schema against older-shape data and every config read bricks.

---

## Proven facts (from the Part B empirical run; carry into verification)

- Operation order map_each-before-rename is required; rename-first leaves raw strings (map_each then targets the absent old key and no-ops).
- `walkPath` REQUIRES the `$.` path prefix and throws without it; `$.state_derivation.…` is correct.
- The 4-operation transform produced the exact 1.8.0 target and validated via the real `validateFromFile`; the old shape was rejected as negative control; idempotent at both op and engine layers.
- AJV caches the framework `config` schema by `$id` at module init — an in-process 1.8.0 test must use a distinct `$id`; a real shipped `config.schema.json` bump is picked up at next process start.

---

## Out of this document

This is the implementation spec only. It is not filed in the substrate, not decided, and not implemented. Implementing it is a separate plan-mode-gated act (it modifies `src/`, requires the full Completion Sequence — build/check/test/runtime-demo/fresh-probe — and a substrate task). The endpoint-direction AC4 work that motivated it (the reverted feat/task-020 change) likewise re-enters the pipeline only once this migration mechanism exists.
