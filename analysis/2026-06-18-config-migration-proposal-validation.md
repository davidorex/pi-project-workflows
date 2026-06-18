# Config-schema-migration proposal — feasibility verification + corrections

Date: 2026-06-18
Scope: validate, empirically prove, and correct-on-paper the 4-edit + catalog config-migration proposal against real `packages/pi-context` source. Verification only — no repo files mutated; all fixture work under `/tmp/config-migration-proof/`.

**VERDICT: VALID WITH CORRECTIONS.** The migration *mechanism* (map_each op + the 4-operation transform) is empirically sound and produces the exact 1.8.0 target, idempotently. But **File 4 is BROKEN as written** — it names two functions (`resolveChain`, `applyDeclarativeTransform`) that do not exist anywhere in the codebase, cites wrong line numbers, and invents a `bundledConfigSchema` binding that does not exist. The real wiring is `validateBlockWithMigrationForDir` / `runMigrations` / `registry.resolve`. Additional defects: the catalog decl's paths are written `$.blocked_by…` but the field lives under `$.state_derivation.blocked_by…`; the config-schema-`version` re-stamp claim conflates two distinct version fields; and config is NOT currently loaded through any migration-aware path, so File 4 must add the registry plumbing, not just a hook.

---

## PART A — Reference verification (file:line + quote; CONFIRMED / REFUTED)

### A1 — File 1: `TransformOp` union in `src/migrations-store.ts` — **CONFIRMED (line off by 0; shape exact)**
The union is at `src/migrations-store.ts:64-68`, terminating with the `coerce` variant at **:68** (the proposal's cited line):
```ts
export type TransformOp =
	| { op: "rename"; from: string; to: string }
	| { op: "set"; path: string; value?: unknown }
	| { op: "delete"; path: string }
	| { op: "coerce"; path: string; type: "string" | "number" | "boolean" | "array" | "object" };
```
The File-1 addition (append `map_each` variant after `coerce`) is well-formed and type-correct. CONFIRMED.

### A2 — File 3: `applyOp` switch + `coerce` case + `walkPath` signature/return + path syntax — **CONFIRMED, with a LOAD-BEARING correction to the proposal's premise**
`applyOp` is at `src/migration-registry-loader.ts:132-182`. Switch dispatches on `op.op`; the `coerce` case is `:156-180`. `walkPath` is at `:80-124`:
```ts
function walkPath(root: unknown, dottedPath: string, createParents: boolean):
	{ parent: Record<string, unknown> | null; key: string }
```
Return shape is **`{ parent, key }`** (proposal's assumption — CONFIRMED). The existing `coerce`/`delete` cases call `walkPath(data, op.path, false)` and guard `read.parent === null || !(read.key in read.parent)` — the File-3 `map_each` body uses exactly this idiom, so it type-checks against the real `walkPath` return and the (File-1-extended) `op` type. CONFIRMED.

**Path syntax — the load-bearing point, REFUTING the proposal's worry.** The proposal frets that `walkPath` may accept "plain dotted paths only" and the `$.` catalog paths could be wrong. The opposite is true. `walkPath:85-87`:
```ts
if (!dottedPath.startsWith("$")) {
	throw new Error(`migration path must start with '$' (got '${dottedPath}')`);
}
```
`$`-prefix is **REQUIRED**; a non-`$` path THROWS. Empirically proven (`/tmp/config-migration-proof/probe.ts`):
- `rename $.blocked_by.relation_types → $.blocked_by.relations` ⇒ `{"blocked_by":{"relations":["a","b"]}}` (works)
- `rename blocked_by.relation_types …` (no `$`) ⇒ `migration path must start with '$' (got 'blocked_by.relation_types')` (rejected)

So the catalog decl's `$.`-prefixed paths are **CORRECT**. (Note: the parser strips the leading `$`, then `tail.split(".").slice(1)` discards the empty first segment from the leading `.` — i.e. it expects `$.<seg>` form; bare `$foo` without a dot would mis-parse. The catalog uses `$.state_derivation…` — correct.) `walkPath` also rejects `[`/`]` (array-index addressing out of scope) — the proposal's paths use none.

### A3 — `applyDeclarativeTransform` (proposal: `migration-registry-loader.ts:188`) — **REFUTED (does not exist)**
There is **no function named `applyDeclarativeTransform`** anywhere in `packages/pi-context/src`. Line `:188` falls inside the doc-comment of `migrationFnFor` (`:196-218`). The real surface that applies a declarative transform is:
```ts
export function migrationFnFor(decl: MigrationDecl): MigrationFn {        // :196
	...
	if (decl.kind === "declarative-transform") {
		const ops = decl.transform?.operations;                          // expects { operations: TransformOp[] }
		...
		return (data: unknown) => {
			let cursor: unknown = JSON.parse(JSON.stringify(data));       // deep-clone
			for (const op of ops) cursor = applyOp(cursor, op);          // apply ops in order
			return cursor;
		};
	}
}
```
It takes a **single `MigrationDecl`** (not an array, not a bare op list) and reads `decl.transform.operations` — i.e. the `{ operations: [...] }` wrapper IS required (confirms A6/A7). It returns a `MigrationFn` (a `(data)=>data` closure), not a migrated object.

### A4 — `resolveChain` (proposal: `schema-migrations.ts:96`) — **REFUTED (does not exist; type mismatch is moot because the symbol is absent)**
There is **no function named `resolveChain`** anywhere in `packages/pi-context/src`. Line `schema-migrations.ts:96` is the start of the inner `resolve(...)` closure inside `createRegistry()`:
```ts
function resolve(schemaName: string, fromVersion: string, toVersion: string): MigrationFn[] {   // :96
```
The real chain-resolution surface:
- `MigrationRegistry.resolve(schemaName, fromVersion, toVersion): MigrationFn[]` — returns an **array of MigrationFns** (`schema-migrations.ts:96-131`).
- `runMigrations(registry, schemaName, currentVersion, targetVersion, data): unknown` (`:144-159`) — resolves the chain AND applies it, returning the migrated data.

**Adjudication of File-4's `applyDeclarativeTransform(data, chain)` call:** the call is doubly broken. (a) `applyDeclarativeTransform` does not exist. (b) Even mapping to the real `migrationFnFor`, that takes a `MigrationDecl`, not a `chain`; and `resolve` returns `MigrationFn[]` (functions), so passing the resolved chain into any "apply transform decl" function is a type mismatch (functions vs decl). **The correct primitive is `runMigrations(registry, "config", dataVersion, schemaVersion, data)`, which internally calls `resolve` → `MigrationFn[]` → applies each.** File 4 must be rewritten around `runMigrations` (or the existing `validateBlockWithMigrationForDir`, see C).

### A5 — `bundledConfigSchema` in `context.ts` scope — **REFUTED (no such binding)**
No identifier `bundledConfigSchema` exists in `context.ts`. The config schema is referenced **by file path**, never loaded into a value carrying `.version`:
```ts
function bundledSchemaPath(name: "config" | "relations"): string {   // context.ts:482
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "schemas", `${name}.schema.json`);
}
```
`loadConfigForDir` (`:564-581`) validates via `validateFromFile(bundledSchemaPath("config"), data, …)` — it never reads the schema's `version`. So File-4's `cfgSchemaVersion = bundledConfigSchema.version` is unresolved. The real accessor: read+parse `bundledSchemaPath("config")` and take `.version`, exactly as `validateBlockWithMigrationForDir` already does (`schema-validator.ts:216-225`: `schema = JSON.parse(fs.readFileSync(schemaPath)); schemaVersion = schema.version`). Better: route through `validateBlockWithMigrationForDir`, which does this for you.

### A6 — registry is schemaName-keyed; `"config"` decl + `transform.operations` parse — **CONFIRMED**
`createRegistry` keys edges by `schemaName` (`schema-migrations.ts:80`, outer `Map<string, …>`). `"config"` is a string like any block name — `runMigrations(reg, "config", …)` resolves identically to `"tasks"` etc. The loader (`buildRegistryFromSubstrateForDir:231-245`) registers every `MigrationDecl` regardless of schemaName, and `migrationFnFor` reads `decl.transform.operations`. The migrations schema permits `schemaName: <any string matching the substrate-name alphabet>` (`migrations.schema.json:27-30`) and a `TransformSpec` of `{ operations: TransformOp[] }` (`:59-69`). A `schema:"config"` declarative-transform decl is valid and loadable. CONFIRMED. **Caveat (see B/C):** config is not *currently* validated through this migration path — `loadConfigForDir` uses plain `validateFromFile`, never `validateBlockWithMigration*`. So the registry exists and would accept a config decl, but nothing consults it for config today. File 4's job is precisely to wire that consultation in.

### A7 — `migrations.schema.json` `TransformOp` `oneOf` closing context (:120-121) + File-2 insertion well-formedness — **CONFIRMED**
The `oneOf` array spans `migrations.schema.json:72-120`, closing:
```json
    }            // <- coerce variant object closes :119
  ]              // <- oneOf array closes :120
}                // <- TransformOp definition closes :121
```
A new `map_each` variant object inserted before `:120` (after the coerce variant `}` at :119, comma-separated) is valid JSON-schema in place. The inner `oneOf` enforcing `table` XOR (`field`+`value`) is well-formed JSON-schema (two mutually-exclusive sub-schemas). CONFIRMED structurally — corrected JSON in Part C.

### A-extra — config-schema `version` re-stamp claim — **REFUTED as written (version-field conflation)**
The proposal says "config `schema_version` re-stamp `1.0.0`→`1.7.0`" AND "`config.schema.json:4` version `1.7.0`→`1.8.0`". These conflate two different fields:
- `schemas/config.schema.json:4` `"version": "1.7.0"` — the **schema's** version (already 1.7.0; CONFIRMED on disk). Bumping it to `1.8.0` for the new shape is correct.
- `samples/conception.json:2` `"schema_version": "1.0.0"` — the **catalog config FILE's** declared version. It is `"1.0.0"`, NOT `"1.7.0"`. (CONFIRMED: `grep` shows `samples/conception.json:2 "schema_version": "1.0.0"`.)

The migration deriver (`validateBlockWithMigration*`) compares the **file's** `schema_version` against the **schema's** `version`. A config file at `schema_version:"1.0.0"` against a schema at `version:"1.8.0"` would require a chain `1.0.0→…→1.8.0`, which does NOT exist. So "re-stamp the catalog config to 1.7.0" is the proposal's attempt to make a single `1.7.0→1.8.0` edge sufficient — but that re-stamp is itself an unmigrated jump from the real `1.0.0`, and would brick any existing 1.0.0 config file that is read after the schema goes to 1.8.0 (no `1.0.0→1.8.0` path). **This is a real sequencing/coverage defect** — see Part C correction.

---

## PART B — Empirical end-to-end proof (`/tmp/config-migration-proof/`)

### B1/B2 — OLD-shape config + the proposal's exact 4 operations through the real engine
Built `OLD` = `schema_version:"1.7.0"` + stock 1.7.0 `state_derivation` (`blocked_by.relation_types:["task_depends_on_task","task_gated_by_item"]`, one milestone rollup). Ran the 4 operations through a prototype `applyOp` that **reuses the real `walkPath` semantics verbatim** for `rename`/`set` and pastes the **exact File-3 `map_each` body**, using the `$.`-prefixed syntax A2 proved correct. **Path correction applied: paths are `$.state_derivation.blocked_by.relation_types` / `$.state_derivation.rollups`, NOT the proposal's literal `$.blocked_by…` — the fields live under `state_derivation`** (config.schema.json:70 `state_derivation` → :112 `blocked_by` → :121 `rollups`). Output (`/tmp/config-migration-proof/e2e.ts`):
```json
{
  "schema_version": "1.8.0",
  "block_kinds": [],
  "state_derivation": {
    "blocked_by": {
      "relations": [
        { "relation_type": "task_depends_on_task", "item_endpoint": "child" },
        { "relation_type": "task_gated_by_item",   "item_endpoint": "parent" }
      ]
    },
    "rollups": [
      { "kind": "milestone", "membership_relation": "phase_positioned_in_milestone",
        "complete_status": "reached", "incomplete_status": "planned", "rollup_endpoint": "child" }
    ]
  }
}
```

### B3 — Target assertion + validation against a 1.8.0 schema via the REAL `validateFromFile`
The migrated object equals the stated 1.8.0 target (relations array with per-edge `item_endpoint`; `relation_types` gone; each rollup gains `rollup_endpoint:"child"`; `schema_version:"1.8.0"`). Validation result (`/tmp/config-migration-proof/validate.ts`):
```
VALIDATION: PASS (migrated 1.8.0 object validates against hand-edited 1.8.0 schema)
NEG CONTROL: old shape REJECTED as expected: /state_derivation/blocked_by: must have required property 'relations'; /state_derivation/blocked_by: must NOT have additional properties; /state_derivation/rollups/0: must have required property 'rollup_endpoint'
```
**Methodological finding (relevant to File 4 and to anyone testing this):** `validateFromFile`→`validate` reuses AJV's compiled schema keyed by `$id`. The framework `config` schema (`$id: pi-context://schemas/config`) is pre-registered at module init (`schema-validator.ts:54-77`) from the real on-disk 1.7.0 file. A `/tmp` schema copy retaining that `$id` is **ignored** — AJV validates against the cached 1.7.0. The proof therefore required re-`$id`-ing the proof schema to `pi-context://schemas/config-1-8-0-proof`. Implication: when File 4 ships, simply editing `config.schema.json` to 1.8.0 is correctly picked up at the next process start (pre-registration re-reads the file); but any in-process test must avoid `$id` collision.

### B4 — Idempotency
- Operation-level (`e2e.ts`): re-running the 4 ops on the already-migrated object yields an identical object (`IDEMPOTENT-EQUAL = true`) — each op no-ops on the migrated shape (map_each finds absent `relation_types`; rename finds absent source; rollup re-set to same value; schema_version re-set to same value).
- Engine-level (`order-and-engine.ts`): the real `runMigrations(reg, "config", "1.8.0", "1.8.0", obj)` is a pure pass-through (`current===target` ⇒ returns the input reference, `ENGINE 1.8.0->1.8.0 is pass-through identical: true`). So in production the migration runs **only** when the file is at an older version; never re-applied at the target. Idempotency is not a concern at the engine layer.

### B5 — Operation ORDER finding — proposal's order is CORRECT and REQUIRED
Proposal order: `map_each(relation_types, table)` THEN `rename(relation_types→relations)`. Proven correct (B2 output). Swapped order (`rename` first) proven BROKEN (`order-and-engine.ts`):
```
ORDER-SWAPPED (rename first) blocked_by: {"relations":["task_depends_on_task","task_gated_by_item"]}
```
With rename first, the string array is moved to `relations` untouched, then `map_each` targets the now-absent `relation_types` and no-ops — leaving raw strings, not `{relation_type,item_endpoint}` objects. **Keep the proposal's order: transform-in-place under the old key, then rename the key.**

---

## PART C — Verdict + exact corrected hunks

**VERDICT: VALID WITH CORRECTIONS.** The op semantics and 4-operation transform are proven correct; Files 1, 2, 3 are sound (with the catalog path correction). File 4 is broken (nonexistent functions, wrong lines, missing binding) and is fully rewritten below. The catalog version handling has a coverage defect, corrected below.

### Correction 1 — File 1 (`src/migrations-store.ts`, after :68) — VALID AS WRITTEN
Append after the `coerce` variant (drop the trailing `;` from coerce onto the new last line):
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

### Correction 2 — File 2 (`schemas/migrations.schema.json`, insert before the `oneOf` close at :120) — VALID, exact JSON
Insert after the coerce variant object (`:119` `}`), comma-separated, before `]` (:120):
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
(The inner `oneOf` enforces `table` XOR `field`+`value`. `fallback` is only meaningful with `table` but harmless if present otherwise.)

### Correction 3 — File 3 (`src/migration-registry-loader.ts`, new case after `coerce` at :180) — VALID AS WRITTEN
Insert after the `coerce` case block (after `:180` `}`), before the switch close `:181`:
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
Type-checks against the real `walkPath` return (`{parent,key}`) and the File-1-extended `op` type. The `op.table!` non-null assertion is sound inside the `if (op.table)` guard.

### Correction 4 — File 4 (`src/context.ts`, `loadConfigForDir`) — BROKEN AS WRITTEN; full replacement
The proposal's hook references `resolveChain` (does not exist), `applyDeclarativeTransform` (does not exist), and `bundledConfigSchema.version` (does not exist), with wrong line citations. **Replace the entire `loadConfigForDir` body's validate line with a migration-aware path built on the REAL primitive `validateBlockWithMigrationForDir`** (which already: reads the schema's `.version`, reads the data's `.schema_version`, runs `runMigrations` over the chain when they differ, and validates the migrated form). This collapses File-4's hand-rolled hook into one existing call and removes every nonexistent symbol.

Add imports to `context.ts`:
```ts
import { validateBlockWithMigrationForDir } from "./schema-validator.js";
import { getProjectMigrationRegistryForDir } from "./migration-registry-loader.js";
```
Replace `loadConfigForDir`'s validate line (`context.ts:579`):
```ts
	validateFromFile(bundledSchemaPath("config"), data, `config.json (${p})`);
	return data as ConfigBlock;
```
with:
```ts
	// Migration-aware validation: when config.json's schema_version lags the
	// bundled config schema's version, run the registered chain forward before
	// AJV-validating the migrated shape. The registry is built from the
	// substrate's migrations.json (schemaName "config" resolves like any block).
	// validateBlockWithMigrationForDir reads the schema's own .version and the
	// data's .schema_version internally — no separate version accessor needed.
	const registry = getProjectMigrationRegistryForDir(substrateDir);
	const validated = validateBlockWithMigrationForDir(substrateDir, "config", data, registry);
	return validated as ConfigBlock;
```
Notes on this correction:
- `validateBlockWithMigrationForDir(substrateDir, "config", …)` resolves the **substrate's own** `<substrateDir>/schemas/config.schema.json` via `schemaPathForDirHelper`, not the bundled package schema. For the active project this is the installed config schema; for the in-process bundled framework this is `schemas/config.schema.json`. If the intent is to validate against the **bundled** schema specifically (as `bundledSchemaPath("config")` did), `validateBlockWithMigrationForDir` is the wrong helper — it would need a bundled-schema variant. **Resolve this before implementing:** the current `loadConfigForDir` validates against `bundledSchemaPath("config")` (the package schema), so switching to the substrate-dir schema is a behavior change. The faithful drop-in that preserves "validate against the bundled schema" while adding migration is to inline the bundled-schema read + `runMigrations`:
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
with `import { runMigrations } from "./schema-migrations.js";` and `import { getProjectMigrationRegistryForDir } from "./migration-registry-loader.js";`. This is the **minimal faithful** correction: same schema target as today, plus migration. No try/catch is needed — `runMigrations` throws a descriptive error on an unresolvable chain (fail-fast is the established convention; a silent catch would mask a missing migration and validate stale shape).
- `migration-registry-loader.ts` does NOT currently import from `context.ts`; `context.ts` importing `getProjectMigrationRegistryForDir` introduces a new edge. Confirm no import cycle at build (loader imports `migrations-store` + `schema-migrations` + `context-dir`, none of which import `context.ts` config loaders — so the edge is acyclic, but verify under `tsc`).

### Correction 5 — Catalog version handling (samples) — coverage defect
The proposal re-stamps the catalog config to `1.7.0` and ships one `1.7.0→1.8.0` edge. But `samples/conception.json:2` is actually `schema_version:"1.0.0"`. After the schema goes to `1.8.0`, reading ANY config still at `1.0.0` (every existing substrate) needs a `1.0.0→1.8.0` chain. A lone `1.7.0→1.8.0` edge does not cover `1.0.0`. Two valid resolutions — pick one explicitly (do not silently re-stamp):
- **(a) If `1.0.0` config is shape-identical to `1.7.0` config** (the schema version advanced without the config file's declared `schema_version` keeping pace — plausible given the file is at 1.0.0 while the schema is at 1.7.0): ship an `identity` edge `config 1.0.0→1.7.0` AND the declarative `config 1.7.0→1.8.0` edge, so the chain resolves `1.0.0→1.7.0→1.8.0`. Re-stamp the catalog config to `1.8.0` (its new baseline). **This requires confirming 1.0.0≡1.7.0 config shape** — verify before declaring identity.
- **(b)** Ship a single declarative edge `config 1.0.0→1.8.0` carrying the same 4 operations (they no-op on a config that lacks `state_derivation`, since walkPath returns `parent:null` on absent paths and every op guards it) plus any 1.0.0→1.7.0 shape deltas. Re-stamp catalog config to `1.8.0`.
The proposal's "re-stamp to 1.7.0" leaves the catalog at a version with no inbound chain from real `1.0.0` files and is the defect. The `config.schema.json:4` bump `1.7.0→1.8.0` is correct as written.

### Correction 6 — Catalog decl paths (samples/migrations.json) — path-prefix defect
The proposal writes the decl ops as `map_each(blocked_by.relation_types…)` / `map_each(rollups…)`. The fields live under `state_derivation` (config.schema.json:70/112/121). Corrected decl (exact, drop-in for `samples/migrations.json` `migrations[]`):
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
Operation order is correct as the proposal specified (map_each before rename — proven in B5).

### Sequencing claim — partly CORRECT, with one addition
"Files 1–3 ship first, inert until referenced" is CORRECT (no code path constructs a `map_each` op until the catalog decl exists). "File 4 + the decl + the schema bump ship together or config reads brick" is CORRECT in spirit but incomplete: File 4 wires migration consultation for config for the FIRST time (config is not migration-aware today, A6 caveat) — so File 4 must also ensure the registry is built from a `migrations.json` that actually contains the config edge (Correction 5/6). If the schema bumps to 1.8.0 but no config edge is registered, `runMigrations` throws (no path) — which is the "brick" — confirming they must land together AND the edge must cover the real on-disk `schema_version` (1.0.0), per Correction 5.

---

## Evidence index (`/tmp/config-migration-proof/`)
- `probe.ts` — walkPath `$`-prefix requirement (A2)
- `e2e.ts` — full 4-op transform output + op-level idempotency (B2/B4)
- `config-1.8.0.schema.json` — hand-edited 1.8.0 config schema copy (distinct `$id`)
- `validate.ts` — real `validateFromFile` PASS on migrated + REJECT on old (B3)
- `order-and-engine.ts` — order-swap breakage + engine pass-through idempotency (B4/B5)

All ran against REAL `src/` via tsx (no build). No repo file mutated; no `.context*` or substrate file read or written.
