# Filing-time nested-shape discovery friction — investigation and verdict

Date: 2026-07-06. Investigator: fresh-context agent (Experience-Gap Handling dispatch). Method: empirical CLI probes against the live substrate (read-only), source inspection of `packages/pi-context-cli/src/cli.ts` + `packages/pi-context/src/context-sdk.ts` + `packages/pi-context/src/samples-catalog.ts`, sample-schema enumeration via a node script over `packages/pi-context/samples/schemas/`, and a framework-gaps prior-art sweep via `filter-block-items`.

## The observed event

During a live research-block filing (2026-07-06), the author ran the documented pre-step — `read-schema --schemaName research --path properties.research.items.required` — which returned only the required field NAMES. The payload was then authored with `grounding` as a prose string and `citations` as `[{path, note}]`. The append was refused whole (no partial write) with per-field diagnostics: grounding expected object; citations[i] missing required `label`, unexpected `note`. Two follow-up per-field `read-schema --path ...properties.grounding` / `...properties.citations` calls revealed the nested shapes; the corrected payload landed. Cost: one refused write + two extra schema reads. In-the-moment verdict was "working as designed, no gap"; this investigation re-evaluates independently.

## 1. Affordance inventory (all outputs observed 2026-07-06)

### 1a. read-schema — the sufficient read EXISTS and is one call

| Invocation | Observed result |
|---|---|
| `read-schema --schemaName research --json` (bare, whole schema) | complete, `"truncated":false`, **totalBytes 10,906** — full nested shapes of `grounding` (object: dependencies/revisions/external_refs, all array<string>) and `citations` (array<object>: label required; path/lines/url/retrieved_at optional) visible |
| `read-schema --schemaName research --path properties.research.items --json` (full item subtree) | complete, `"truncated":false`, **totalBytes 6,311** — everything an author needs, one call |
| `read-schema --schemaName research --path properties.research.items.required --json` (the documented pre-step) | `["id","title","status","layer","type","question","method","findings_summary","created_by","created_at"]` — **totalBytes 134, names only, no shapes** |

Size survey (`ls -la packages/pi-context/samples/schemas/`): the largest catalog schema is research at **10,251 bytes**; all 18 are between 2,401 and 10,251 bytes. **Every whole-schema and item-subtree read fits the 50KB cap with an order of magnitude to spare.** The "hunt" framing (one read per nested field) is empirically false as a necessity: one `--path properties.<key>.items` call affords the complete item contract for every installed block kind. `read-catalog-schema` equally returns the verbatim full catalog body in one call.

### 1b. --show-schema — the purpose-built preview flattens nested shapes

The global flag exists (`pi-context --help`: "preview a block op's contract (array_key/required/types/id) and exit"; shipped by FGAP-022 → TASK-017). Its render loop, `cli.ts:1028-1041`:

```ts
const type =
    typeof fschema.type === "string"
        ? fschema.type
        : typeof fschema.$ref === "string"
            ? (fschema.$ref as string)
            : enumVals
                ? "enum"
                : "object";
```

One level only: `grounding` renders as `grounding: object` (no keys), `citations` as `citations: array` (no items shape, no `label` requirement). The preview purpose-built to show "what is expected" (FGAP-022's own words) cannot reveal the two contracts the observed refusal was about.

Empirical side-finding: the preview could not be observed live — `pi-context append-block-item --block research --show-schema` was **blocked by the live gap-register-guard.sh PreToolUse hook** (observed: "Blocked: a planning-block write..."). The guard (`.claude/hooks/gap-register-guard.sh:20-21`) matches op-name + block-name and is insensitive to the no-write preview/`--dry-run` forms, so the two authoring-affordance flags FGAP-022/FGAP-024 shipped are behind the user-permission ceremony precisely on the planning blocks where filing happens. Adjacent to FGAP-089's op-shape-scoped-matching class (distinct facet: preview-vs-write insensitivity, where FGAP-089 files target-substrate insensitivity). The projection conclusion above is source-anchored, not inferred from a run.

### 1c. read-samples-catalog — the catalog shape projection also flattens

`read-samples-catalog --kind research --json` (observed, totalBytes 32,058, complete): `shape.itemProperties.research[]` lists every field as `{name, type, required, description?, enum?}` — `grounding` appears as `{"name":"grounding","type":"object","required":false}` with **no keys and no description**; `citations` as `type: array` with **no items shape**. Root: `schemaInfoFromPath` (`context-sdk.ts:209-264`) extracts item properties **"one level deep"** (its own comment, line 232); `SchemaProperty` (`context-sdk.ts:179-184`) has no nested-children field. `samples-catalog.ts:175` projects that directly into the catalog output.

### 1d. Sample blocks ship no exemplars

`packages/pi-context/samples/blocks/research.json` (observed): `{"research": []}` — every starter block is an empty array. No example item exists anywhere on the authoring surface, and no documented pattern points authors at exemplar payloads.

### 1e. --dry-run

`append-block-item --dry-run` (FGAP-024, shipped) validates the prospective whole file and writes nothing — it converts a refused write into a refused preview with the same diagnostics, but only after the payload is already authored blind. It is a safety net, not a discovery affordance (and is guard-gated on planning blocks per 1b).

## 2. Guided behavior vs sufficient behavior

What the guidance actually says:

- **CLAUDE.md canonical filing pattern**: "Use `read-schema --schemaName <name> --path properties.<key>.items.required` first when unfamiliar with the block's fields" — the names-only read.
- **ops-registry.ts:1473** (read-schema's only example, surfaced in `--help` EXAMPLES): `pi-context read-schema --schemaName framework-gaps --path properties.gaps.items.required --json` — the same names-only read.
- **SKILL.md read-schema description** (generated from the op string): "Address ONE property via `path` (dotted/bracket, e.g. properties.tasks.items.properties.status) **instead of reading the whole schema**" — actively steers away from the one-call sufficient read.

Delta: guided behavior yields field names; sufficient behavior is `--path properties.<key>.items` (or the bare schema), which every guidance surface either omits or counter-recommends. An author who follows the documentation exactly — as the observed session did — authors nested fields blind, and the refused write becomes the de-facto shape-discovery mechanism.

## 3. Class characterization

Nested object / array-of-object item fields per catalog schema (node enumeration over `samples/schemas/`, observed):

| Schema | Nested-shape fields an author must discover |
|---|---|
| context-contracts | bundle_relation_types (array<object>; required: relation_type, direction, max_depth) |
| decisions | options_considered (array<object>; required: label, description); references (array<object>; required: label) |
| framework-gaps | evidence (array<object>; required: file, reference) |
| layer-plans | layers (array<object>; 5 required keys); migration_phases (array<object>; 5 required keys) |
| phase | success_criteria (array<object>; required: criterion, verify_method); specs (array<object>; 4 required keys) |
| research | grounding (object: dependencies, revisions, external_refs); citations (array<object>; required: label) |
| verification | criteria_results (array<object>; required: criterion, status) |
| work-orders | scope (object); real_check_criteria (object) |
| conventions, features, issues, milestone, rationale, requirements, session-notes, spec-reviews, story, tasks | NONE |

**8 of 18 catalog block kinds** carry nested shapes invisible to every projection surface — and they sit on the everyday filing path: every gap filing (`evidence`), every task closure (`verification.criteria_results`), every decision (`options_considered`/`references`), every phase (`success_criteria`). The observed research instance is one member of this class, not an atomic event.

## 4. Prior-art sweep (framework-gaps, `filter-block-items` title regex; observed 2026-07-06)

| Term | Hits | Coverage verdict |
|---|---|---|
| "authoring" | 0 | — |
| "scaffold" | 0 | — |
| "discover" | 1 — FGAP-062 (closed; top-level --help listing) | not covering |
| "template" | 1 — FGAP-072 (closed; per-op help template: SYNOPSIS/EXAMPLES/RELATED) | adjacent, not covering — per-OP examples, not per-BLOCK item shapes |
| "filing" | 2 — FGAP-110, FGAP-121 | not covering (raw-reader class; birth-relations orientation). FGAP-121 is family-adjacent: another authoring-atom affordance subset with a preview-parity facet |
| "shape" | 2 — FGAP-089, FGAP-107 | not covering (hook scoping; config raw readers). FGAP-089 is the tracked home for the guard side-finding in §1b |
| "nested" | 1 — FGAP-100 (sub-element identity) | not covering — identity of nested parts, not discoverability of nested shapes |
| "schema" | 31 hits, payload 107,404 bytes → `data:null, total:31, complete:false` | over-cap count-without-ids — itself a fresh observed instance of FGAP-117's filed envelope; narrower regexes above cover the space |
| description "show-schema" | 0 | — |

Directly-adjacent closed gaps read in full: **FGAP-022** (shipped --show-schema; its impact clause — "raising write-time validation failures" — is exactly the failure mode observed today, recurring one nesting level below the projection it shipped), **FGAP-024** (--dry-run), **FGAP-072** (per-op help). **FGAP-117** (identified) is the read-side field-projection gap — different axis (bulk query cost), not authoring-time shape discovery.

**Sweep conclusion: not tracked. A new filing is justified; it relates to FGAP-022 (closed origin of the flattened preview) and the §1b guard observation informs FGAP-089.**

## 5. Verdict: GAP — nested-shape fidelity of the authoring-time projections, plus counter-guiding documentation

Neither candidate framing survives whole:

- Framing (a) is right that the validator behaved correctly (loud, precise, whole refusal — nothing to fix there) and that the hunt is avoidable: **one** documented-op call (`read-schema --path properties.<key>.items`, 6,311 bytes for the largest case) affords the complete contract. "One read-schema call per nested field" is not a real necessity.
- Framing (a) fails at "the residual cost is the author's choice": the author followed the documented pre-step exactly, and **every** purpose-built shape surface — the CLAUDE.md pre-step, the op's own example, SKILL.md's "instead of reading the whole schema" steering, `--show-schema`'s one-level render (cli.ts:1028-1041), `read-samples-catalog`'s one-level `itemProperties` (context-sdk.ts:232 "one level deep"), and the empty sample blocks — reveals names/flat types only. The guided path and the purpose-built path both under-answer for 8/18 block kinds, including the highest-traffic filings. When every affordance built to answer "what does an item look like" flattens exactly the fields that cause refusals, the refusal loop is a designed-in discovery mechanism, not an author error.

The class is **nested-shape discoverability at authoring time**: two independent one-level projections (cli.ts `--show-schema` render; context-sdk.ts `schemaInfoFromPath` feeding the samples catalog) plus three guidance surfaces pointing at the names-only read. The atomic fix set is small and additive; the per-field hunt and the refused-write loop both disappear when the projections expand one recursion level (which covers the entire current catalog — no nested field nests further) and the guidance names the item-subtree read.

Interim authoring pattern (usable today, no code change): before authoring an item for an unfamiliar block, run `pi-context read-schema --schemaName <block> --path properties.<key>.items --json` — the full item contract in one call, always under the cap — and validate with `append-block-item --dry-run` before the live write.

## 6. Side-findings (report-only, not part of the draft payload)

1. **gap-register-guard.sh blocks no-write forms** (`--show-schema` observed; `--dry-run` by the same match) on planning blocks — matches op-name + block-name only (`.claude/hooks/gap-register-guard.sh:20-21`). Inform FGAP-089 (its class is op-shape-scoped matching; this is the preview-vs-write facet).
2. **filter-block-items over-cap count-without-ids reproduced**: title regex "schema" → `data:null, total:31, totalBytes:107404, complete:false`. Fresh confirming instance for FGAP-117's evidence.

## 7. Draft framework-gaps payload (NOT filed — user permission gate; orchestrator presents)

```json
{
	"title": "Authoring-time shape projections flatten nested item shapes — --show-schema and the samples-catalog itemProperties render object/array<object> fields as bare types, and every documented pre-step points at the names-only required read, so the refused write is the de-facto nested-shape discovery mechanism",
	"status": "identified",
	"priority": "P2",
	"package": "pi-context",
	"canonical_vocabulary": "nested-shape-faithful authoring projections",
	"description": "Two independent one-level projections hide nested item contracts: (1) the --show-schema render (pi-context-cli cli.ts:1028-1041) types each field as fschema.type | $ref | 'enum' | 'object' — a nested object prints as bare 'object' (no keys), an array<object> as 'array' (no items keys, no items.required); (2) schemaInfoFromPath (pi-context context-sdk.ts:209-264, comment 'one level deep' at 232) emits SchemaProperty {name,type,required,description?,enum?} with no nested-children field, and samples-catalog.ts:175 projects it as read-samples-catalog shape.itemProperties — research.grounding surfaces as {type:'object'} with no keys, citations as 'array' with no items shape. Guidance compounds it: the CLAUDE.md canonical filing pre-step reads properties.<key>.items.required (names only), read-schema's sole example (ops-registry.ts:1473) addresses the same .required path, and SKILL.md's read-schema description says to address ONE property 'instead of reading the whole schema' — while the sufficient one-call read (read-schema --path properties.<key>.items; 6,311 bytes for research, every catalog schema ≤10,251 bytes, all under the 50KB cap) is named nowhere. samples/blocks/*.json ship empty arrays — no exemplar items. 8 of 18 catalog schemas carry nested shapes invisible to every projection: context-contracts.bundle_relation_types, decisions.options_considered+references, framework-gaps.evidence, layer-plans.layers+migration_phases, phase.success_criteria+specs, research.grounding+citations, verification.criteria_results, work-orders.scope+real_check_criteria. Observed instance (2026-07-06): a research filing authored after the documented pre-step passed grounding as a string and citations as [{path,note}]; the append was refused whole with per-field diagnostics; two follow-up per-field read-schema calls recovered the shapes. The refusal is FGAP-022's filed impact ('raising write-time validation failures') recurring one nesting level below the preview it shipped.",
	"evidence": [
		{ "file": "packages/pi-context-cli/src/cli.ts", "lines": "1028-1041", "reference": "--show-schema field loop: type = fschema.type | $ref | 'enum' | 'object'; no expansion of nested properties or items.required" },
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "209-264", "reference": "schemaInfoFromPath extracts item properties one level deep (comment line 232); SchemaProperty (179-184) has no nested-shape field; consumed by samples-catalog.ts:175 for read-samples-catalog shape.itemProperties" },
		{ "file": "packages/pi-context/src/ops-registry.ts", "lines": "1473", "reference": "read-schema's sole example addresses properties.gaps.items.required — the names-only read; the CLAUDE.md canonical filing pre-step and the SKILL.md read-schema description steer the same way" },
		{ "file": "packages/pi-context/samples/blocks/research.json", "reference": "starter blocks ship empty arrays — no exemplar item anywhere on the authoring surface" },
		{ "file": "analysis/2026-07-06-filing-shape-discovery-friction.md", "reference": "investigation of record: affordance inventory with observed byte sizes, 8/18 nested-shape schema enumeration, the refused-write instance, prior-art sweep (not tracked; FGAP-022 origin, FGAP-117/072/089 adjacent-not-covering)" }
	],
	"impact": "An author on any of the 8 nested-shape block kinds who follows the documented pre-step or either purpose-built projection authors nested fields blind; first contact with the nested contract is the refused write. The affected fields sit on the every-filing path: framework-gaps.evidence (every gap), verification.criteria_results (every task closure), decisions.options_considered/references (every decision).",
	"proposed_resolution": "Expand nested shapes at both projection sites, one recursion level (covers the entire current catalog — no nested field nests further): the --show-schema render prints an object field's nested keys+types and an array<object> field's item keys/types + items.required; SchemaProperty gains an optional children field populated by schemaInfoFromPath and rendered through read-samples-catalog shape.itemProperties. Correct the guidance to the sufficient one-call read (read-schema --path properties.<key>.items): the CLAUDE.md canonical filing pre-step, the read-schema example in ops-registry.ts, skill-narrative.md, SKILL regen — docs-surface-sync. Additive; in-pi op behavior frozen except the read-schema example string."
}
```

Provenance note for the presenting orchestrator: every element above is DERIVABLE from cited observed outputs and source lines in this report; the priority (P2) derives from family precedent (FGAP-022/024/072 all P2 — authoring-ergonomics gaps with an existing workaround). No user-verbatim elements; no qualifiers narrowing user direction.
