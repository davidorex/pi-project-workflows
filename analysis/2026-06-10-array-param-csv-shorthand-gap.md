# Experience gap: CSV shorthand absent for string-array op params (`--ids` rejects CSV)

Date: 2026-06-10
Package: `pi-context-cli`
Surfaced by: dogfooding — two agents independently hit `pi-context resolve-items-by-id --ids TASK-046,DEC-0018`.

## Repro (verbatim, bare CLI against `.context`, read-only)

Command:

```
pi-context resolve-items-by-id --ids TASK-046,DEC-0018
```

Output (exit 2):

```
error: --ids: Unexpected token 'T', "TASK-046,DEC-0018" is not valid JSON
```

The natural CSV form is rejected. The accepted form is a JSON-array string:

```
pi-context resolve-items-by-id --ids '["TASK-046","DEC-0018"]'
```

## Root cause

The CLI classifies every array-typed op param as a `"json"` field and parses it through a strict `JSON.parse`, with one hardcoded exemption that does not cover `--ids`.

- `fieldType` (`packages/pi-context-cli/src/cli.ts:126-142`) maps a schema with `type:"array"` to the `"json"` field type — the `default` arm at `cli.ts:138-140` returns `"json"` for `object | array | undefined`. `--ids` is `Type.Array(Type.String(), …)` (`packages/pi-context/src/ops-registry.ts:1746`), so its `fieldType` is `"json"`.
- For a `"json"` field, `parseOpArgs` runs the strict JSON path (`cli.ts:388-408`):

  ```
  // json: inline JSON or @file
  try {
      out.params[field] = value.startsWith("@")
          ? JSON.parse(readFileSync(value.slice(1), "utf8"))
          : JSON.parse(value);
  } catch (err) {
      // FGAP-025: the `value` field (the comparison operand of
      // filter-block-items, Type.Unknown) is the sole CSV-shorthand target. …
      if (field === "value" && !value.startsWith("@")) {
          out.params[field] = value;
      } else {
          throw new UsageError(`--${field}: ${err instanceof Error ? err.message : String(err)}`);
      }
  }
  ```

  `JSON.parse("TASK-046,DEC-0018")` throws; the catch retains the raw string ONLY when `field === "value"`. For `--ids` (`field === "ids"`) it re-throws as the `UsageError` the operator saw.

- The CSV-to-array transform is the post-loop block at `cli.ts:415-423`, gated on `op === "in"` AND `field value` (`out.params.value`):

  ```
  if (out.params.op === "in" && typeof out.params.value === "string") {
      out.params.value = out.params.value.split(",");
  }
  ```

The CSV transform is therefore **param-specific, not type-driven**: it fires for exactly one op (`filter-block-items`) on exactly one param (`--value`) under exactly one operator (`--op in`). No code path splits any other string-array param on commas; `--ids` has no CSV affordance at all. The FGAP-025 implementation chose the narrow `value`-field exemption deliberately (the comment at `cli.ts:395-401` states "the `value` field … is the sole CSV-shorthand target … Every other json field keeps the strict parse-or-error contract").

Test coverage corroborates the scope: the only CSV test (`packages/pi-context-cli/src/cli.test.ts:1290-1301`) asserts `--op in --value a,b,c` → `["a","b","c"]` against `filter-block-items` and nothing else.

## Class (gap-explore-surfaces-class)

This is an INSTANCE of a more general gap, not atomic. Class:

> CSV shorthand exists as a one-param special case (`filter-block-items --value` under `--op in`), not as a type-driven normalization for string-array params generally. Any op whose param is a `Type.Array(Type.String())` requires a JSON-array string and rejects the natural CSV form.

### Enumeration of every array-shaped use-op param

Two distinct shapes exist; only one is CSV-normalizable:

**String-arrays (`Type.Array(Type.String())`) — a general CSV transform WOULD cover these.**

| op | param | schema site | CSV today? |
|----|-------|-------------|------------|
| `resolve-items-by-id` | `--ids` | `ops-registry.ts:1746` (`Type.Array(Type.String())`) | NO |

A repo-wide grep for `Type.Array(Type.String` across `packages/pi-context/src/` and `packages/pi-jit-agents/src/` returns exactly one hit: `ops-registry.ts:1746`. `--ids` is the **sole** string-array param on the entire use-op surface today. A type-driven string-array CSV normalization would cover `--ids` and any future string-array param automatically.

**Object-arrays (`Type.Unknown`, carrying `[{…}]`) — a string CSV transform CANNOT cover these** (splitting on commas would shred object literals). They are correctly JSON-only:

| op | param | schema site |
|----|-------|-------------|
| `append-relations` | `--edges` | `ops-registry.ts:535` (`Type.Unknown`, array of `{parent,child,relation_type,ordinal?}`) |
| `append-block-item` | `--item` | `ops-registry.ts:263` (`Type.Unknown`, single object) |
| `upsert-block-item` | `--item` | `ops-registry.ts:583` |
| `append-block-nested-item` | `--item` | `ops-registry.ts:696` |
| `write-block` | `--data` | `ops-registry.ts:910` (`Type.Unknown`, object) |
| `update-block-item` | `--match` / `--updates` | `ops-registry.ts:308-309` (`Type.Record`) |
| `update-block-nested-item` | `--match` / `--nestedMatch` / `--updates` | `ops-registry.ts:737-744` |
| `remove-block-item` | `--match` | `ops-registry.ts:795` |
| `remove-block-nested-item` | `--match` / `--nestedMatch` | `ops-registry.ts:822-826` |
| `amend-config` | (Type.Unknown payload) | `ops-registry.ts:1177` |
| `write-schema` | `--schema` | `ops-registry.ts:1269` |
| `resolve-conflict` | (Type.Unknown) | `ops-registry.ts:1316` |
| `write-schema-migration` | (Type.Unknown) | `ops-registry.ts:1352` |
| `filter-block-items` | `--value` | `ops-registry.ts:1586` (`Type.Unknown`, scalar OR array — the EXISTING `--op in` CSV target) |
| `join-blocks` | `--whereValue` | `ops-registry.ts:1698` (`Type.Unknown`, scalar) |

So the class scope a general fix would address: a **type-driven CSV transform for string-array params** covers exactly `--ids` today (and any future `Type.Array(Type.String())` param) and MUST exclude object/record params (`--edges`, `--item`, `--data`, `--updates`, `--match`, `--schema`, etc.), which stay strict-JSON. The existing `filter-block-items --value` CSV case is a `Type.Unknown` param hand-special-cased for `--op in`; a type-driven string-array transform would NOT subsume it (its schema is `Type.Unknown`, not `Type.Array(Type.String())`), so that special case remains as-is.

The narrow framing ("add CSV to `--ids`") leaves the class as latent debt: the next string-array param added to any use-op would silently inherit the same JSON-only friction and invite a duplicate sibling filing. Filing at the class level (type-driven string-array CSV normalization) is warranted.

## Prior-art (bare CLI against `.context`)

- **FGAP-025** — `status: closed`, `closed_by: VER-029 / TASK-015`. Title: "CLI lacks the scripts' input shorthands (--writer kind:id, --where field:op:value, CSV --op in)". Its `proposed_resolution` scope verbatim: "accept --writer kind:id (lifted parseWriter), --where field:op:value (split into whereField/whereOp/whereValue), and --op in CSV (split to array)." The `--op in` CSV item is explicitly and only the `filter-block-items --value` membership operand. **FGAP-025 never enumerated `--ids` or string-array params generally** — it was scoped to the three script-parity shorthands, of which `--op in` CSV is one. `resolve-items-by-id` (and its `--ids` param) has existed since 2026-05-13 (`2ddf85f`, TASK-035), predating FGAP-025's close (2026-06-08), so `--ids` was a live surface when FGAP-025 was scoped — its omission is a coverage gap in FGAP-025's framing, not a param added afterward.
- **No open gap covers this.** The open `pi-context-cli` input/normalization gaps are adjacent but distinct concerns: **FGAP-032** (id-flag NAMING divergence `--id`/`--itemId`/`--taskId`/…, not value-shape), **FGAP-063** (camelCase→kebab flag-name normalization, not array-value CSV). Neither addresses CSV value-shorthand for array params. No substrate item tracks the `--ids` / string-array CSV friction; this is a justified new filing.

## CLI-provable verification conditions (for a fixing task)

A fix is type-driven (normalizes any string-array param), not a second hardcoded param exemption. Verify via the bare CLI against `.context` (read-only ops):

1. **CSV accepted on every string-array param.** `pi-context resolve-items-by-id --ids TASK-046,DEC-0018` exits 0 and resolves both ids (the id→location map keys both `TASK-046` and `DEC-0018`) — byte-equivalent to the JSON-array form. (Today the only string-array param is `--ids`; the transform keys off the param TYPE so any future string-array param inherits it.)
2. **JSON form still works (additive, non-regressive).** `pi-context resolve-items-by-id --ids '["TASK-046","DEC-0018"]'` still exits 0 with the identical result.
3. **Object-array params unchanged (strict JSON, no comma-split).** `pi-context append-relations --edges 'a,b'` (or any non-JSON `--edges`) still exits 2 with a JSON-parse usage error — the transform must NOT touch `Type.Unknown` object-array params. A dryRun append-relations with a valid JSON `--edges` array still parses normally.
4. **Existing `filter-block-items --op in --value a,b,c` CSV behavior preserved** — the FGAP-025 special case still yields `["a","b","c"]` (regression guard; the type-driven path coexists with, does not replace, the `value`/`--op in` case).
5. **A single CSV token / single id still works** — `--ids TASK-046` (no comma) resolves the one id (split-on-comma of a comma-free string yields a one-element array).
