# New composer suite for .context-jit-spec-v2 — specification (2026-05-31)

Specification of a NEW suite of Claude-Code-side composer scripts in their own dedicated directory `wo-composer/` (NOT under `scripts/orchestrator/`), modeled specifically on the `.context-jit-spec-v2` substrate. The suite mechanically projects a work-order (the dispatchable plan unit in `.context-jit-spec-v2`) and its relation-connected supporting context into a complete, dispatch-ready subagent prompt — with no LLM in the rendering path. Verbatim projection is the load-bearing property: every substrate field value reaches the prompt byte-for-byte, so the prompt cannot hedge, paraphrase, or cut corners the way an LLM-composed brief does.

All factual claims cite `file:line`. Items not establishable from the read inputs are marked UNVERIFIED.

---

## Plan-bearing block(s) in .context-jit-spec-v2 — fields, types, meanings, real values [file:line]

The dispatchable implementation plan lives in the **work-orders** block (`WO-` prefix). It is the only block whose item carries, in a single record, every element a subagent dispatch needs: the target agent, a typed input contract, the substrate-block context handoff, the bounded edit scope, and the deterministic real-check acceptance gate. No other block kind carries that composite.

Block registration: `.context-jit-spec-v2/config.json:124-131` — `canonical_id: "work-orders"`, `prefix: "WO-"`, `array_key: "work_orders"`, `data_path: "work-orders.json"`, `schema_path: "schemas/work-orders.schema.json"`.

Schema purpose (verbatim intent): "Orchestrator-authored work-order spec for the privileged JIT-agent that drives the in-pi bounded code-change loop. A work-order names the target agent, the typed input/output contracts, the substrate-block context handoff, the bounded scope within which the agent may operate, and the deterministic real-check criteria gating acceptance (deterministic verification; never LLM self-report — verdict comes from real checks the agent cannot fake)." (`.context-jit-spec-v2/schemas/work-orders.schema.json:6`).

Required item fields: `id, title, status, target_agent, input_contract, context_blocks, output_contract, scope, real_check_criteria` (`schemas/work-orders.schema.json:16-26`). `additionalProperties: false` at item level (`:15`) — the field set is closed; the suite enumerates exactly these.

### Every field — type / meaning / real value

| Field | Type [schema line] | Meaning [schema line] | Real value from substrate |
|---|---|---|---|
| `id` | string, `^WO-\d{3,}$` [`:28-31`] | Canonical work-order id [`:31`] | `"WO-002"` (`work-orders.json:82`) |
| `title` | string [`:33`] | One-line work-order title | `"Implement agentic-mode dispatch loop in jit-runtime.ts (FEAT-001)"` (`work-orders.json:83`) |
| `status` | string enum `proposed\|in-progress\|real-check-passed\|real-check-failed\|completed\|cancelled` [`:34-45`] | Work-order lifecycle, including deterministic real-check verdict states; "never LLM self-report" [`:44`] | `"proposed"` (`work-orders.json:84`) |
| `target_agent` | string [`:46-49`] | Name of the privileged JIT-agent that consumes this work-order; resolves to `<name>.agent.yaml` in the agents tier [`:48`] | `"jit-agents-implementation-agent"` (`work-orders.json:85`) |
| `input_contract` | object (JSON Schema) [`:50-53`] | Typed JSON Schema for what the agent receives at dispatch [`:52`] | `{type:"object", required:["target_file","feature_id","mode_id"], properties:{target_file:{const:"packages/pi-jit-agents/src/jit-runtime.ts"}, feature_id:{const:"FEAT-001"}, mode_id:{const:"MODE-002"}}}` (`work-orders.json:86-107`) |
| `context_blocks` | array of (string \| `{name, item?, depth?, focus?}`) [`:54-76`] | Substrate-block references the agent's `.agent.yaml` consumes via contextBlocks; string = whole-block injection, object = item-specific injection (ContextBlockRef shape) [`:56`] | `[{name:"features",item:"FEAT-001"}, {name:"dispatch-modes",item:"MODE-002"}, {name:"decisions",item:"DEC-0004"}, {name:"decisions",item:"DEC-0008"}, {name:"decisions",item:"DEC-0010"}, "concepts"]` (`work-orders.json:108-130`) |
| `output_contract` | object (JSON Schema) [`:77-80`] | Typed JSON Schema for the agent's return contract [`:79`] | `{type:"object", required:["implementation_summary","test_summary","runtime_demo_output"], properties:{...string...}}` (`work-orders.json:131-149`) |
| `scope` | object `{files?[], directories?[], operations?[]}`, `additionalProperties:false` [`:81-90`] | Bounds within which the agent may edit / run commands; used by the capability composer to clamp the grant at dispatch [`:84`] | `{files:["packages/pi-jit-agents/src/jit-runtime.ts","packages/pi-jit-agents/src/*.test.ts"], operations:[]}` (`work-orders.json:150-156`) |
| `real_check_criteria` | object, required `build_check_test`; optional `runtime_demo{invocation,expected}`, `adversarial_probe{targets[]}`; `additionalProperties:false` [`:91-117`] | Deterministic real-check gate; "NEVER LLM self-report; verdict comes from deterministic real checks the agent cannot fake" [`:95`] | `{build_check_test:true, runtime_demo:{invocation:"npx tsx packages/pi-jit-agents/scripts/runtime-demo-agentic-dispatch.ts", expected:"agentic dispatch loop end-to-end success"}, adversarial_probe:{targets:["jit-runtime.ts executeAgent boundary","compiled.tools threading to LLM tool registry","ExtensionContext.dispatchTool routing","loop termination on end_turn/max-turns/tool-failure","capability grant clamp per DEC-0047"]}}` (`work-orders.json:157-172`) |
| `description` | string (optional) [`:118`] | Free-text work-order description | Not present on any of WO-001..006 (`work-orders.json:1-457`) — UNVERIFIED as ever-populated |
| `created_by` | string (optional) [`:119`] | Authorship attestation | `"human:davidryan@gmail.com"` (`work-orders.json:173`) |
| `created_at` | string (optional) [`:120`] | Creation timestamp | `"2026-05-30T16:40:00Z"` (`work-orders.json:174`) |
| `modified_by` | string (optional) [`:121`] | Last-modifier attestation | `"human/davidryan@gmail.com"` (`work-orders.json:175`) |
| `modified_at` | string (optional) [`:122`] | Last-modification timestamp | `"2026-05-30T09:41:49.211Z"` (`work-orders.json:176`) |

The substrate carries six work-orders, WO-001..006 (`work-orders.json:4,82,179,246,318,387`), one per implementation arc. WO-002 is used above as the canonical worked example because it is the most populated (item-pinned context_blocks across three block kinds, multi-line scope, full real-check tuple).

**Decision (not the orchestrator's to revisit, per brief):** work-orders is the plan-bearing block. `tasks` (`TASK-` ) is a sibling lifecycle ledger (fields `id, description, status`, optional `files, acceptance_criteria, assigned_agent, notes` — `schemas/tasks.schema.json:15-30`) that narrates the same arc in prose (e.g. TASK-002 "Implement FEAT-001 agentic-mode dispatch loop in jit-runtime.ts:432-738 per MODE-002 spec" — `tasks.json:11-13`) but carries neither typed contracts nor scope nor real-check gate. The suite reads `tasks` only as optional supporting context for a work-order, never as the dispatch root.

---

## pi-context read/validate surface the suite builds on [file:line]

The suite is a pure read+validate+project surface. Cross-package import is via the named subpath exports declared in `packages/pi-context/package.json:19-83` — the suite needs `@davidorex/pi-context/schema-validator` (validation), `@davidorex/pi-context/context` (the `Edge` type + optional walk helpers), and `@davidorex/pi-context/context-dir` (`assertSubstrateName`, and `resolveContextDir` only for an optional sanity log). All three are exported subpaths (`package.json:28-31, 44-47, 36-39`); no new export is required. Block + relations files themselves are read with plain `fs`+`JSON.parse`, needing no pi-context import.

**Substrate resolution** (`packages/pi-context/src/context-dir.ts`, exported as `@davidorex/pi-context/context-dir`):
- `resolveContextDir(cwd: string): string` reads `<cwd>/.pi-context.json`, AJV-validates the pointer, returns `path.join(cwd, contextDir)`; hard-throws `BootstrapNotFoundError` when the pointer is absent (`context-dir.ts:102-141`). Current pointer value: `contextDir: ".context-jit-spec-v2"` (verified live read of `.pi-context.json`).
- `assertSubstrateName(name): void` — rejects names containing path separators / `..` / `.`; constrains to `[A-Za-z0-9_-]+` (`context-dir.ts:358-364`). The suite calls this on its `--substrate` value before joining paths.
- Block-file + schema-file paths are NOT taken from a `blockFilePath`/`schemaFilePathForBlock` helper (those route through the pointer); the suite builds them directly as `path.join(cwd, substrate, "<dataFile>.json")` and `path.join(cwd, substrate, "schemas", "<schemaFile>")`, with `<dataFile>`/`<schemaFile>` read from `config.json` `block_kinds[]`.

**Block read.** `readBlock(cwd, blockName, filter?): unknown` (`block-api.ts:293-341`) is the public block reader, but it resolves the file via `blockFilePath` which routes through `resolveContextDir` — i.e. it is **pointer-bound**: it reads whatever `.pi-context.json` currently points at, not an arbitrary substrate. The lower `readTypedFile(filePath, errorLabel)` (`block-api.ts:360`) takes an arbitrary path but is **module-private** (not exported, not on any subpath). **Decision:** the suite does NOT use `readBlock`; it reads each block file with plain `fs.readFileSync` + `JSON.parse` at `path.join(cwd, substrate, "<dataFile>.json")`, where `<dataFile>` comes from `config.json` `block_kinds[].data_path`. This is the only way to read a chosen substrate without depending on the global pointer, and `fs`+`JSON.parse` is exactly what `readBlock` does internally (`block-api.ts:300-312`) — no behavior is lost.

**Validation** (`packages/pi-context/src/schema-validator.ts`, exported as `@davidorex/pi-context/schema-validator`):
- `validateFromFile(schemaPath: string, data: unknown, label: string): unknown` (`schema-validator.ts:159-175`) — loads a JSON Schema from an **arbitrary file path**, validates `data` against it, throws `ValidationError` on failure. This is the public, pointer-independent validator the suite uses: `validateFromFile(path.join(cwd, substrate, "schemas/work-orders.schema.json"), doc, "work-orders (<substrate>)")`. A thrown `ValidationError` is fatal — the suite never emits a prompt from an invalid plan.

**Establishing the load-bearing capability — reading a specific substrate without mutating the global pointer.** Reading the targeted `.context-jit-spec-v2` requires bypassing the pointer-bound `readBlock`/`resolveContextDir(cwd)` path. The suite does so by constructing every path as `path.join(cwd, substrate, ...)` from a `--substrate` flag (default `.context-jit-spec-v2`, validated via `assertSubstrateName` at `context-dir.ts:358`), reading block files with `fs.readFileSync`+`JSON.parse`, and validating with the explicit-path `validateFromFile`. It never calls `readBlock`, never calls `resolveContextDir` on the read path, and never writes `.pi-context.json`. The suite is read-only on the pointer.

---

## Supporting-context via relations [file:line]

The closure table is `.context-jit-spec-v2/relations.json` — a flat `Edge[]` array; each edge is `{ parent, child, relation_type, ordinal? }` (the `Edge` interface is at `packages/pi-context/src/context.ts:199`). `loadRelations(cwd): Edge[]` (`context.ts:364`) reads `<contextDir>/relations.json` via the pointer — pointer-bound, so the suite does NOT use it. For the chosen substrate the suite reads `<substrate>/relations.json` directly with `fs.readFileSync`+`JSON.parse` (same pointer-independence rationale as the block reads above) and optionally validates it via `validateFromFile` against pi-context's bundled relations schema. The walk helpers `walkDescendants(parentId, relationType, edges)` (`context.ts:902`) and `walkAncestors(itemId, relationType, edges)` (`context.ts:936`) operate on an in-memory `Edge[]` and are exported from `@davidorex/pi-context/context`; the suite may use them on the directly-read edge array, since they take edges as an argument and do not touch the pointer.

A work-order names two kinds of supporting context:

1. **Inline `context_blocks`** — the work-order itself lists the exact blocks/items the consuming agent must receive (e.g. WO-002 → FEAT-001, MODE-002, DEC-0004/0008/0010, whole `concepts`; `work-orders.json:108-130`). These are authoritative and read first.

2. **Relation-connected items** — the substrate wires the work-order's referenced feature into its governing decisions, realized dispatch-mode, and addressed friction. From `relations.json`, for FEAT-001 (the feature WO-002 implements):
   - `DEC-0004 → FEAT-001 feature_governed_by_decision` (`relations.json:3-8`)
   - `DEC-0010 → FEAT-001 feature_governed_by_decision` (`relations.json:93-98`)
   - `FEAT-001 → MODE-002 dispatch_mode_realizes_decision` (`relations.json:9-14`)

   For other features the table wires friction → feature and decision → feature analogously: `FB-007 → FEAT-002 gap_addressed_by_feature` + `feature_depends_on_item` (`relations.json:15-20, 105-110`); `FEAT-003 → FB-009/FB-015 feature_depends_on_item`, `FB-009 → DEC-0008 friction_item_addressed_by_decision`, `DEC-0008 → FEAT-003 feature_governed_by_decision` (`relations.json:21-32, 57-62, 99-104`); `FB-016 → FEAT-004`, `FB-016 → DEC-0006` (`relations.json:33-38, 69-74`); `FEAT-005 → DEC-0001`, `DEC-0004 → FEAT-005`, `FB-001 → FEAT-005` (`relations.json:39-56`).

The relation_types the suite traverses to pull supporting context are registered in config: `feature_governed_by_decision` (`config.json:304-313`), `dispatch_mode_realizes_decision` (`config.json:513-522`), `feature_depends_on_item` (`config.json:271-280`), `gap_addressed_by_feature` (`config.json:249-258`), `friction_item_addressed_by_decision` (`config.json:579-588`), `concept_referenced_in_decision` (`config.json:502-511`), `axiom_grounds_decision` (`config.json:491-500`), `authority_doc_grounds_decision` (`config.json:601-610`).

**Decision — supporting-context resolution rule (deterministic, no LLM):** Starting from the work-order's `context_blocks` plus the feature id named in its `input_contract`, the suite does a one-hop relation walk over `relations.json` collecting every edge where the feature id (or a context_block item id) appears as `parent` or `child` under the relation_types above, dedupes the connected item ids, and reads each connected item from its block file by id. One hop, not transitive closure — bounded, deterministic, and matches the work-order author's intent that `context_blocks` is the primary handoff with relations supplying named adjacent grounding.

Supporting block schemas the suite reads connected items from (each has a closed required-field set):
- `features`: `id, title, description, status` required; `priority, acceptance_criteria[], effort, owner` optional (`schemas/features.schema.json:14-30`). Real: FEAT-001 (`features.json:3-9`).
- `decisions`: `id, title, rationale, status` required; `supersedes[]` optional (`schemas/decisions.schema.json:13-23`). Real: DEC-0004 "The four boundary surfaces: load / compile / execute / introspect" (`decisions.json:30-38`).
- `concepts`: `id, term, definition` required (`schemas/concepts.schema.json:14-21`). Real: CONCEPT-004 "Real-check criteria (deterministic acceptance)" (`concepts.json:24-30`).
- `dispatch-modes`: `id, name, description` required (`schemas/dispatch-modes.schema.json:14-21`). Real: MODE-002 "Agentic dispatch (multi-turn tool-use)" (`dispatch-modes.json:10-16`).
- `friction-items`: `id, summary, status` required; `detail, severity, area` optional (`schemas/friction-items.schema.json:14-24`). Real: FB-007 (`friction-items.json:13-22`).

---

## The new suite — each script: name / responsibility / flags / substrate-read / output

**Dedicated directories.** The suite gets its own dedicated dirs, not co-mingled with the existing `scripts/orchestrator/` or `compiled-contexts/`:
- **Scripts dir**: `wo-composer/` (repo root) — holds the suite's scripts + shared lib.
- **Rendered-prompts dir**: `wo-prompts/` (repo root) — holds the dispatch-ready prompt artifacts the suite emits; gitignored, paralleling `compiled-contexts/`.

Three scripts, single-responsibility each, composing left-to-right. All live under `wo-composer/`. All accept `--substrate <dir>` (default `.context-jit-spec-v2`) and a `--cwd <dir>` (default `process.cwd()`); all are read-only on substrate and on `.pi-context.json`.

### 1. `wo-composer/resolve-work-order.ts`
**Responsibility:** Read one work-order by id from the targeted substrate, validate it against the work-orders schema, resolve its inline `context_blocks` items and its one-hop relation-connected supporting items, and emit a single deterministic JSON bundle (the "resolved work-order"). This is the substrate-read tier; it contains zero prompt text.

**Flags:** `--wo <WO-NNN>` (required); `--substrate <dir>` (default `.context-jit-spec-v2`); `--cwd <dir>`; `--dry-run` (validate + report what would be resolved, write nothing); `--out <path>` (default stdout).

**Substrate-read:** `JSON.parse(fs.readFileSync(join(cwd, substrate, "work-orders.json")))` → find item where `id === --wo`. `validateFromFile(join(cwd, substrate, "schemas/work-orders.schema.json"), doc, label)` — a thrown `ValidationError` is fatal (never emit an invalid plan). For each `context_blocks` entry: string → read whole block file `join(cwd, substrate, "<dataFile>.json")` (data_file resolved from `config.json` `block_kinds[]`); object → read that block file and select the item where `id === entry.item`. Read `relations.json` directly via `fs`+`JSON.parse`; one-hop walk from the feature id in `input_contract` (and from each context_block item id) over the registered relation_types; read each connected item by id from its block file.

**Output shape (JSON):**
```
{
  "substrate": ".context-jit-spec-v2",
  "work_order": { ...verbatim WO item... },
  "context_blocks_resolved": [ { "ref": <verbatim entry>, "items": [ ...verbatim block items... ] } ],
  "supporting_items": [ { "id", "block", "relation_type", "item": <verbatim item> } ],
  "schema_valid": true
}
```
Every nested value is a verbatim copy of the substrate JSON — no reformatting, no summarization.

### 2. `wo-composer/render-work-order-prompt.ts`
**Responsibility:** Consume the resolved-work-order bundle and render it into the complete dispatch-ready subagent prompt by **deterministic template projection** — static section-header string literals interleaved with verbatim substrate values from the bundle. No model call. This is the projection tier.

**Flags:** `--in <path>` (resolved bundle, default stdin); `--wo <WO-NNN>` + `--substrate` + `--cwd` (alternative to `--in`: invoke `resolve-work-order` internally then render, so a caller can go substrate→prompt in one call); `--out <path>` (default stdout).

**Substrate-read:** none directly when `--in` is supplied; when invoked with `--wo`, it calls the `resolve-work-order` library function in-process (same module, shared code — not a parallel ungated path).

**Output shape:** a single markdown prompt string (the subagent brief), section order fixed (see mapping table). Begins with the verbatim binding preamble (see Binding preamble section), ends with the output-discipline section.

### 3. `wo-composer/dispatch-work-order.ts`
**Responsibility:** The end-to-end convenience entry: substrate → resolved bundle → rendered prompt → write the prompt to the dispatch-artifact location and report the path. Does **not** itself spawn the subagent (dispatch is the orchestrator/operator's act, per the agent-output-to-file + orchestrator-owns-output mandates); it produces the artifact the orchestrator hands to the foreground coding subagent.

**Flags:** `--wo <WO-NNN>` (required); `--substrate <dir>` (default `.context-jit-spec-v2`); `--cwd <dir>`; `--out <path>` (default `wo-prompts/<WO-NNN>-prompt.md`, the suite's dedicated gitignored rendered-prompts dir); `--dry-run`.

**Substrate-read:** delegates to `resolve-work-order` + `render-work-order-prompt` in-process.

**Output shape:** writes the rendered prompt file; final stdout line is the artifact path + a one-line provenance stamp (`source substrate: .context-jit-spec-v2`).

**Shared library extraction:** the three scripts share one library module (`wo-composer/lib/work-order-compose.ts`) exposing `resolveWorkOrder(cwd, substrate, woId)` and `renderWorkOrderPrompt(bundle)`. The CLIs are thin wrappers — one code path, three entry points; not three independent implementations. This keeps the single-gate property (no parallel ungated paths).

---

## Substrate-field → prompt-section mapping [table: field → section → verbatim|transform-rule]

The rendered prompt's sections, in fixed order, and how each is produced. "verbatim" = the substrate value is copied byte-for-byte into the section body. "transform" = a named deterministic rule (pure string/JSON operation, no LLM).

| Prompt section | Source | verbatim \| transform-rule |
|---|---|---|
| `# Binding preamble` (mandates) | Operating-context mandate-001..009 + the 9 feedback files | **verbatim** — injected as fixed literal text block (see Binding preamble section) |
| `# Work order: <id> — <title>` | `work_order.id`, `work_order.title` | **verbatim** (both inline) |
| `## Status` | `work_order.status` | **verbatim** |
| `## Target agent` | `work_order.target_agent` | **verbatim**; plus transform note: resolves to `<target_agent>.agent.yaml` (static literal suffix, per schema `:48`) |
| `## Input contract` | `work_order.input_contract` | **transform** = `JSON.stringify(input_contract, null, 2)` inside a ```json fence (deterministic serialization; key order preserved from source) |
| `## Context handoff` | `context_blocks_resolved[]` | **verbatim** — each resolved block item rendered as ```json fence of the item object; the `ref` printed verbatim as the label |
| `## Supporting context (relation-connected)` | `supporting_items[]` | **verbatim** — each item as ```json fence, labeled with verbatim `id` + `block` + `relation_type` |
| `## Output contract` | `work_order.output_contract` | **transform** = `JSON.stringify(output_contract, null, 2)` in a ```json fence |
| `## Scope (bounded edit grant)` | `work_order.scope.files[]`, `.directories[]`, `.operations[]` | **verbatim** — each path printed verbatim as a list item; arrays joined with newline (transform: array→bulleted-list, no value mutation) |
| `## Real-check criteria (deterministic gate)` | `work_order.real_check_criteria` | **verbatim** — `build_check_test` bool printed verbatim; `runtime_demo.invocation` + `.expected` printed verbatim (command in a fenced code block); `adversarial_probe.targets[]` each printed verbatim as a list item |
| `## Provenance` | `bundle.substrate` + `work_order.id` + `created_by`/`created_at`/`modified_by`/`modified_at` | **verbatim** — labels the actual source substrate string + WO id + attestation fields |
| `## Output discipline` | static literal | **literal** — fixed text: write substantive output to a file, return summary + path; raw JSON honoring `output_contract`, no markdown fences (per agent-output-to-file mandate) |

The transforms named (`JSON.stringify(x, null, 2)`, array→bulleted-list) are total, deterministic, and value-preserving: they change presentation, never content. No transform paraphrases, summarizes, or interprets a field.

---

## Verbatim-projection guarantee — how each section is produced with no LLM in the path

The whole prompt is the concatenation of: (a) fixed template string literals authored once in the script source (section headers, the output-discipline block, the binding preamble), and (b) values read from substrate JSON and inserted either byte-for-byte or via the value-preserving transforms in the table above. There is no model call anywhere in `resolve-work-order` → `render-work-order-prompt` → `dispatch-work-order`. The data flow is `fs.readFileSync` → `JSON.parse` → field access → string concatenation → `fs.writeFileSync`.

Per-section supplier:
- **Section headers + output-discipline + binding-preamble**: template string literals in the script source (constant; no substrate, no model).
- **Every WO field value (id, title, status, target_agent, scope paths, real_check strings, attestation)**: read from `work-orders.json` via `fs.readFileSync`+`JSON.parse` and inserted verbatim.
- **input_contract / output_contract**: `JSON.stringify(value, null, 2)` of the parsed object — a pure function of the substrate value; key order is preserved because the parse-then-stringify round-trip preserves insertion order for the contract objects as stored.
- **context_blocks_resolved items + supporting_items**: read from their block files by id via `fs.readFileSync`+`JSON.parse`, inserted as `JSON.stringify(item, null, 2)`.

Because no LLM sits in the path, the prompt cannot drop a real-check target, soften a scope bound, or paraphrase a contract — the failure modes the suite exists to eliminate. The guarantee is structural, not a request to a model to "be faithful."

**Adversarial-falsifiability of the guarantee (per the runtime-demo + adversarial mandate):** the property is checkable by re-derivation — given the same substrate, the rendered prompt is byte-identical across runs, and every WO/feature/decision/concept/mode/friction value in the prompt `grep`-matches the source JSON verbatim. A probe that diffs prompt-extracted values against the source block files to zero mismatches is the gate; tests-pass alone is insufficient.

---

## Substrate targeting + supporting-item reads

**Targeting `.context-jit-spec-v2` specifically:** the `--substrate` flag defaults to `.context-jit-spec-v2`, validated via `assertSubstrateName` (`context-dir.ts:358`). The scripts build all paths as `path.join(cwd, substrate, ...)`, read block + relations files with `fs.readFileSync`+`JSON.parse`, and validate with the pointer-independent `validateFromFile` (`schema-validator.ts:159`). They never call `readBlock` / `resolveContextDir` on the read path and never write `.pi-context.json`. Consequence: the suite reads `.context-jit-spec-v2` no matter where the global pointer points, and a `/context switch` elsewhere cannot misdirect it. (The pointer today already reads `contextDir: ".context-jit-spec-v2"`, but the suite does not depend on that.)

**Supporting-item reads:** per the resolution rule above — inline `context_blocks` read first (string → whole block file, object → item by id), then a one-hop relation walk over `<substrate>/relations.json` for the feature id in `input_contract` and each context_block item id, reading each connected item by id from its block file. Block-file names come from `config.json` `block_kinds[].data_path` (e.g. `features.json`, `decisions.json`, `concepts.json`, `dispatch-modes.json`, `friction-items.json` — `config.json:5-179`); the suite reads `config.json` once to map block name → data_path rather than hardcoding filenames.

---

## Binding preamble — mandates + feedback injected verbatim

Every rendered prompt opens with a binding-preamble section that is **non-optional and injected verbatim** — never paraphrased, never summarized, never made conditional.

**Two parts:**

1. **The 9 operating mandates (mandate-001..009).** Per the brief (`2026-05-31-new-composer-suite-brief.md:29`), these arrive each turn via the UserPromptSubmit hook in the orchestrator's own context. They must be carried into every rendered subagent prompt verbatim so the subagent operates under the same binding constraints. The verbatim mandate text is sourced from the UserPromptSubmit hook payload; its exact wording is not stored in the substrate read for this spec — **UNVERIFIED location of the canonical mandate text** (not found in `.context-jit-spec-v2` nor in the read inputs). The suite must read the mandate text from the authoritative hook source at render time (or from a single committed mandate file the hook also reads) and inject it verbatim; it must NOT hand-retype or paraphrase the mandates. Implementation dependency: the render script needs a verbatim source for mandate-001..009 (see Dependencies).

2. **The 9 binding feedback mandates** (read verbatim for this spec at `~/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/`). Each is short and injected as a verbatim literal block:
   - `feedback_constraining_subagent_briefs.md`: "Front-load every subagent brief with: binding mandates (the operating-context mandate-001..009), relevant DEC canon by id, the exact tool surface the agent may use, per-step commit discipline, and output discipline..." — this feedback is itself the design mandate for the preamble's existence.
   - `feedback_scope_agents_with_facts.md`: "Embed exact type signatures, property names, file paths, and line numbers in agent prompts. Never rely on the agent re-discovering facts the orchestrator already holds." — satisfied structurally by the verbatim context/supporting-item sections.
   - `feedback_dispatch_agent_type_must_match_tool_directives.md`: "Before delegating, verify the subagent_type has the tools the brief's <output_format> requires... architect/explorer/reviewer are read-only." — injected verbatim; the prompt's target_agent + scope must imply edit-capable tools.
   - `feedback_agent_output_to_file.md`: "Agent writes its substantive output to a file; returns only a short summary + the path." — drives the static Output-discipline section.
   - `feedback_subagents_no_npm.md`: "Subagent briefs forbid npm. The orchestrator runs all npm (build / check / test / release)." — injected verbatim.
   - `feedback_subagent_commits_per_step.md`: "Subagents commit after each step; never accumulate dirty working state across steps." — injected verbatim.
   - `feedback_runtime_demo_plus_adversarial_per_step.md`: "Tests passing is necessary but not sufficient. Every implementation step needs a runtime demonstration... plus an adversarial probe..." — injected verbatim; reinforced by the WO `real_check_criteria` section.
   - `feedback_orchestrator_owns_subagent_output.md`: "Verify every subagent claim — commits, files created, counts, deviations. Never relay subagent self-reports as fact." — injected verbatim (binds the orchestrator's handling of the result).
   - `feedback_no_parallel_ungated_paths.md`: "Adversarial probe can under-flag... Adding a gated alternative beside an unrestricted original is not enforcement. The framework validator is the only gate." — injected verbatim; also a design constraint the suite obeys (shared library, one code path).

**Injection mechanism:** the feedback text is read from the canonical feedback files at render time and concatenated verbatim into the preamble — not retyped into the script source (retyping is a drift surface the scope-agents-with-facts mandate forbids). The preamble is produced by `fs.readFileSync` of each feedback file + the mandate source, joined with fixed labels. No LLM. The preamble is unconditional: there is no flag to omit it, and no rendered prompt exists without it (single gate; no ungated path that skips the mandates).

---

## Provenance

The rendered prompt's `## Provenance` section labels its **actual** source substrate by reading `bundle.substrate` (which is the `--substrate` value used at resolve time, default `.context-jit-spec-v2`), never a hardcoded other directory. It additionally stamps the WO `id` and the WO attestation fields (`created_by`, `created_at`, `modified_by`, `modified_at` — `work-orders.json:173-176`). `dispatch-work-order.ts`'s final stdout line also prints `source substrate: <bundle.substrate>`. If a future caller points `--substrate` at a different dir, the provenance line reflects that dir verbatim — the label tracks reality, it is not a constant.

---

## Dependencies + sequencing

1. **pi-context built to `dist/`** — the suite imports `validateFromFile` from `@davidorex/pi-context/schema-validator` and (optionally) `walkDescendants`/`walkAncestors` from `@davidorex/pi-context/context` and `resolveContextDir`/`assertSubstrateName` from `@davidorex/pi-context/context-dir`. All three subpaths are already declared in `packages/pi-context/package.json` `exports` (`:28-31` schema-validator, `:44-47` context, `:36-39` context-dir) — **no new export subpath is required**. Block files and `relations.json` are read with plain `fs`+`JSON.parse`, requiring no pi-context import at all. Per CLAUDE.md, runtime needs the build; `npm run build` must precede any run.
2. **`resolve-work-order.ts` before `render-work-order-prompt.ts`** — render consumes the resolved bundle.
3. **Shared library module** (`lib/work-order-compose.ts`) before all three CLIs — they wrap it.
4. **Verbatim mandate-001..009 source** before the binding preamble is complete — the render script needs an authoritative verbatim source for the operating mandates (hook payload or a single committed mandate file). Until that source is named, the preamble's part-1 is incomplete (part-2 feedback files already exist on disk).
5. **`wo-prompts/` dir exists** (the suite's dedicated rendered-prompts dir, gitignored, paralleling `compiled-contexts/`) — `dispatch-work-order.ts` writes the artifact there.
6. **Sequencing of build/check/test/runtime-demo/adversarial-probe** per the project Completion Sequence — the suite is orchestrator-side tooling, so it follows the same library+tool+script-as-a-unit + runtime-demo + adversarial-probe discipline (CLAUDE.md Conventions; `feedback_runtime_demo_plus_adversarial_per_step.md`). Runtime demo: render WO-002 and diff every projected value against the source block files. Adversarial probe: a fresh-context check that the prompt contains zero paraphrased or dropped fields versus source JSON.

---

## Out of scope

Only items a reader could reasonably expect in scope but deliberately excluded:

- **Spawning the subagent / executing the dispatch.** The suite produces the prompt artifact; the orchestrator/operator performs the actual dispatch and owns verification of the result (`feedback_orchestrator_owns_subagent_output.md`, `feedback_agent_output_to_file.md`). Auto-spawn would put an unowned execution path in a tooling script.
- **Writing the subagent's result back into substrate** (status transitions on the WO, verification filing). That is a separate write-surface concern governed by the block-api write primitives + DispatchContext attestation; this suite is read-only on substrate.
- **A Pi tool counterpart.** CLAUDE.md's dual-surface convention pairs each new substrate op with a Pi tool. This spec defines the Claude-Code-side composer suite; the in-pi Pi-tool counterpart for work-order rendering is a separate deliverable and is not specified here.
- **Transitive (multi-hop) relation closure.** The supporting-context walk is deliberately one-hop (bounded, deterministic, matches the work-order author's `context_blocks`-primary intent); deeper closure is excluded to keep the projection bounded and the prompt size predictable.
- **The `tasks` block as a dispatch root.** `tasks` is read only as optional supporting context; it carries no typed contracts/scope/real-check and is not a plan-bearing block for dispatch.

The option of modifying, generalizing, or reusing any existing composer/extractor script does not exist for this task and is therefore not an out-of-scope item — it is excluded from the problem space entirely.
