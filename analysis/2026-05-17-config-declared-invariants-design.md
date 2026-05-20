# Config-declared substrate invariants — design

Date: 2026-05-17
Status: DESIGN ONLY (no source / schema / substrate written by this pass)
Resolves: DEC-0025 violation in `validateProject`

---

## Problem (the DEC-0025 violation)

DEC-0025 (enacted) declares pi-context substrate canon **vocabulary-neutral**:

> "The framework's source code MUST operate on canonical_id-keyed registries derived purely from config.json + .project/schemas/ + .pi/templates/ macros … a user with a wholly different substrate conception can clone pi-context, author their own config + schemas + macros + relation_types + lenses + layers, and have a fully-functioning substrate canon for THEIR vocabulary without modifying any pi-context source. Implications: (a) hardcoded vocabulary literals in source … are gaps to close — vocabulary derives from loaded config."

`validateProject` (`packages/pi-context/src/project-sdk.ts:857`) currently hardcodes two substrate invariants that name **specific block kinds, specific statuses, and specific relation_type canonical_ids** as source literals:

- **completed-task-has-verification** (`project-sdk.ts:934-951`): hardcodes block `"tasks"`, status field/value `loc.item.status === "completed"`, relation_type `"verification_verifies_item"`, and edge direction (verification-as-child).
- **decision-cites-forcing-artifact** (`project-sdk.ts:953-975`): hardcodes block `"decisions"`, relation_type set `{decision_addresses_issue, decision_addresses_feature, decision_addresses_gap}`, and edge direction (decision-as-parent).

A user adopting the framework with a different conception — decisions that need no forcing artifact, tasks that need no verification, or entirely different block kinds — cannot remove or alter these invariants without editing pi-context source. That is precisely the lock-in DEC-0025 forbids: implication (a), hardcoded vocabulary literals in source.

The edge-integrity block above them (`project-sdk.ts:880-932` — parent/child resolve via `buildIdIndex`; relation_type registered in `config.relation_types[]`; cycle detection delegated to `validateRelations`) is **already generic** — it names no specific vocabulary. It stays as-is. Only the two invariants are the violation.

---

## Current hardcoded invariants (file:line)

```text
project-sdk.ts:857   validateProject(cwd) entry
project-sdk.ts:865   idIndex = buildIdIndex(cwd)         ← resolution surface (reused, generic)
project-sdk.ts:871   config = loadConfig(cwd)
project-sdk.ts:872   relations: Edge[] = loadRelations(cwd)
project-sdk.ts:880   if (config) { … edge integrity + invariants …
project-sdk.ts:934-951   INVARIANT 1 — completed-task-has-verification  (HARDCODED)
project-sdk.ts:953-975   INVARIANT 2 — decision-cites-forcing-artifact  (HARDCODED)
```

Invariant 1 shape (paraphrased from source):
```ts
const verifiedTasks = new Set<string>();
for (const edge of relations)
  if (edge.relation_type === "verification_verifies_item") verifiedTasks.add(edge.child);
for (const [id, loc] of idIndex) {
  if (loc.block !== "tasks") continue;
  if (loc.item.status === "completed" && !verifiedTasks.has(id))
    issues.push({ severity: "error", message: `Completed task '${id}' has no verification edge …`, block: "tasks", field: `${id}.verification` });
}
```

Invariant 2 shape:
```ts
const forcingRelTypes = new Set(["decision_addresses_issue","decision_addresses_feature","decision_addresses_gap"]);
const decisionsWithForcingEdge = new Set<string>();
for (const edge of relations)
  if (forcingRelTypes.has(edge.relation_type)) decisionsWithForcingEdge.add(edge.parent);
for (const [id, loc] of idIndex) {
  if (loc.block !== "decisions") continue;
  if (!decisionsWithForcingEdge.has(id))
    issues.push({ severity: "error", message: `Decision '${id}' cites no forcing artifact …`, block: "decisions", field: `${id}.forcing_artifact` });
}
```

Both share one structural pattern: **for items in block B (optionally filtered by a field-equality predicate), require ≥1 edge of relation_type ∈ {set} in a given direction (the item appears as `parent` or as `child`).** That single pattern is the `requires-edge` invariant class below.

---

## Proposed `config.invariants[]` shape

Add a top-level optional array `invariants` to `config.schema.json` and to the `ConfigBlock` type in `project-context.ts`. Each entry is one **requires-edge** invariant. The class field is reserved for extensibility (one value today: `requires-edge`) so a future class is an additive enum value, not a breaking shape change.

### JSON Schema fragment (to add under `config.schema.json` properties)

```json
"invariants": {
  "type": "array",
  "description": "Config-declared substrate invariants enforced generically by validateProject. Each names block kinds / relation_types / status values purely as DATA — no vocabulary literal lives in source (DEC-0025). User-overridable: a project ships only the invariants its conception requires.",
  "items": {
    "type": "object",
    "required": ["id", "class", "block", "relation_types", "direction"],
    "additionalProperties": false,
    "properties": {
      "id":           { "type": "string", "description": "Stable invariant id, e.g. 'completed-task-has-verification'. Surfaced in diagnostics + the issue `code` field." },
      "class":        { "type": "string", "enum": ["requires-edge"], "description": "Invariant class. Only requires-edge today; reserved for additive extension." },
      "block":        { "type": "string", "description": "canonical_id of the block whose items the invariant ranges over (matched against ItemLocation.block, i.e. the block file basename)." },
      "where":        {
        "type": "object",
        "description": "Optional field-equality predicate. Item qualifies only when EVERY (field,value) pair matches item[field] === value. Absent → all items in block qualify.",
        "additionalProperties": { "type": ["string", "number", "boolean"] }
      },
      "relation_types": {
        "type": "array",
        "minItems": 1,
        "items": { "type": "string" },
        "description": "canonical_ids of relation_types that satisfy the invariant. A qualifying item passes if ≥1 incident edge (in `direction`) has relation_type ∈ this set."
      },
      "direction":    { "type": "string", "enum": ["as_parent", "as_child"], "description": "Which endpoint the qualifying item must occupy on the satisfying edge. as_parent → item.id === edge.parent; as_child → item.id === edge.child." },
      "severity":     { "type": "string", "enum": ["error", "warning"], "default": "error", "description": "Diagnostic severity when the invariant is unsatisfied." },
      "message":      { "type": "string", "description": "Optional message template. Tokens {id} and {block} substitute. Absent → a generic default message is synthesized." }
    }
  }
}
```

### Worked example 1 — completed-task-has-verification

```json
{
  "id": "completed-task-has-verification",
  "class": "requires-edge",
  "block": "tasks",
  "where": { "status": "completed" },
  "relation_types": ["verification_verifies_item"],
  "direction": "as_child",
  "severity": "error",
  "message": "Completed task '{id}' has no verification edge (verification_verifies_item)"
}
```
Maps `project-sdk.ts:934-951` exactly: block `tasks`, predicate `status=completed`, edge `verification_verifies_item` with the task as the edge `child`.

### Worked example 2 — decision-cites-forcing-artifact

```json
{
  "id": "decision-cites-forcing-artifact",
  "class": "requires-edge",
  "block": "decisions",
  "relation_types": ["decision_addresses_issue", "decision_addresses_feature", "decision_addresses_gap"],
  "direction": "as_parent",
  "severity": "error",
  "message": "Decision '{id}' cites no forcing artifact (decision_addresses_issue|feature|gap edge)"
}
```
Maps `project-sdk.ts:953-975` exactly: block `decisions`, no `where` (all decisions), relation_type set of three, decision as the edge `parent`.

Both current invariants express **fully** in this shape (see closing answer (d)).

---

## `validateProject` generic consumer

Replace the two hardcoded blocks (`project-sdk.ts:934-975`) with one loop over `config.invariants`. The loop names **no** vocabulary literal — every string comes from the invariant entry. It reuses the already-built `idIndex` and the already-loaded `relations`.

```ts
// ── Config-declared invariants (DEC-0025: vocabulary-neutral) ─────────────
// Replaces the two previously-hardcoded invariants. All block / status /
// relation_type / direction literals come from config.invariants[] data;
// the loop body contains no vocabulary literal.
for (const inv of config.invariants ?? []) {
  if (inv.class !== "requires-edge") continue; // forward-compat: skip unknown classes

  // 1. Collect ids that satisfy the edge condition.
  //    direction as_parent → endpoint = edge.parent; as_child → endpoint = edge.child.
  const relTypeSet = new Set(inv.relation_types);
  const satisfied = new Set<string>();
  for (const edge of relations) {
    if (!relTypeSet.has(edge.relation_type)) continue;
    satisfied.add(inv.direction === "as_parent" ? edge.parent : edge.child);
  }

  // 2. Range over qualifying items in the named block; flag the unsatisfied.
  for (const [id, loc] of idIndex) {
    if (loc.block !== inv.block) continue;
    if (!matchesWhere(loc.item, inv.where)) continue;
    if (satisfied.has(id)) continue;
    issues.push({
      severity: inv.severity ?? "error",
      message: (inv.message ?? `Item '{id}' in block '{block}' violates invariant '${inv.id}'`)
        .replace("{id}", id).replace("{block}", inv.block),
      block: inv.block,
      field: `${id}.${inv.id}`,
      code: inv.id,
    });
  }
}
```

`matchesWhere` is the field-equality helper (next section):

```ts
function matchesWhere(item: Record<string, unknown>, where?: Record<string, string | number | boolean>): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) if (item[k] !== v) return false;
  return true;
}
```

The validity of the relation_type names themselves is already covered by the existing edge-integrity loop (`project-sdk.ts:899-906`), which errors on any edge whose `relation_type` is unregistered. An invariant referencing a relation_type that never appears on an edge simply never adds to `satisfied` — every qualifying item flags, which is the correct behavior (the conception requires an edge that nobody authored). No additional "is this relation_type registered" guard is needed inside the invariant loop; if desired as an authoring-quality nicety it belongs in a separate config-lint pass, not in the integrity gate.

Net effect: `project-sdk.ts:934-975` (≈42 lines, two named invariants) collapses to one ≈25-line vocabulary-free loop plus the small `matchesWhere` helper.

---

## Predicate expression recommendation

**Recommendation: field-equality map (the existing `where` shape), reuse the in-package precedent. Do NOT import `expression.ts`.**

Rationale, decisive:

1. **The exact shape already exists and is already validated in pi-context.** Composition-lens members use `where: Record<string, string|number|boolean>` with AND-of-equality semantics — schema at `config.schema.json:124-130`, runtime filter at `project-context.ts:773-778`. Reusing this shape means one predicate concept across lenses and invariants, one schema fragment, one filter helper. The brief's two real invariants need exactly one predicate (`status=completed`) and one no-predicate; field-equality covers both.

2. **`expression.ts` is the wrong dependency direction.** It lives in `packages/pi-workflows/src/expression.ts` (`evaluateCondition` at `expression.ts:252`). pi-context has zero dependency on pi-workflows (`packages/pi-context/package.json:95-101`) and is the *lower* layer (pi-workflows consumes pi-context, not the reverse). Importing it would invert the layering and pull the `${{ }}`/`input`/`steps` expression-root machinery (`expression.ts:35`) — built for workflow step scope, not substrate items — into the substrate core. That is over-engineering the brief explicitly warns against.

3. **No multi-operator need is evidenced.** Both current invariants are pure equality. Comparison operators (`>`, `!=`, `in`) are speculative. If a future invariant genuinely needs them, extend `where` with a small typed operator form (e.g. `{ field, op, value }`) as an additive schema change — cheaper than carrying a full evaluator now.

---

## Defaults + vocabulary-neutrality

### Where the two default invariants live

There is **no `registry/blocks/config.json` today** — `/project install` copies per-block *schemas* and *starter block data* (`registry/{schemas,blocks}/`), but config itself is authored directly in the project's substrate-dir `config.json` (`index.ts:314-372`; registry block dir contents confirmed: `decisions.json`, `tasks.json`, … but no `config.json`). So config has no "ship a default file" channel analogous to schemas/blocks.

Two consistent placements; recommend the second:

- **(rejected) Ship a `registry/blocks/config.json` and copy on install.** Would create a new install-copy path for config that does not exist today and risks clobbering a project's authored config. Inconsistent with current install semantics.
- **(recommended) Ship the two invariants as a documented config template / `/context init` scaffold contribution.** The canonical pi-context conception's `invariants[]` block (the two entries above) is what `/context init` (FGAP-026 Phase 6) writes into a fresh `config.json` alongside the canonical `block_kinds` / `relation_types` / `lenses` it already scaffolds. They are part of the *default authored config*, not a separately-installable asset. A user who wants a different conception edits or empties `invariants[]` in their own `config.json` — exactly as they edit `block_kinds` / `relation_types` today.

This honors DEC-0025: `invariants` is **absent-tolerant** (`config.invariants ?? []` in the consumer → a config with no `invariants` key validates and runs zero invariant checks). A user with a different conception ships only the invariants they want, or none. The framework source ships **zero** invariant vocabulary — the two canonical entries are config data in the canonical conception's `config.json`, replaceable wholesale. The source loop is conception-agnostic.

### .project (current working substrate)

For *this repo's* `.project/config.json` (the canonical conception, active until the DEC-0036 cutover), the two invariant entries are declared there so the existing substrate keeps the same gates it has today — just config-driven instead of source-driven.

---

## Migration path

Per CLAUDE.md "Orchestrator scripts dual-surface" + Completion Sequence; all steps are implementation work for a later authorized pass (this doc writes none of it):

1. **Schema** — add the `invariants` property to `packages/pi-context/schemas/config.schema.json` (fragment above). `additionalProperties:false` on config root means this MUST be added before any `config.json` can declare invariants, or AJV rejects the config (`loadConfig` → `validateFromFile`, `project-context.ts:203`).
2. **Type** — add `invariants?: InvariantDecl[]` to `ConfigBlock` (`project-context.ts:30-43`) and export the `InvariantDecl` interface alongside the sibling decls (`RelationTypeDecl` etc., `project-context.ts:63-92`).
3. **Consumer** — replace `project-sdk.ts:934-975` (the two hardcoded blocks) with the generic loop + `matchesWhere` helper. Update the `validateProject` JSDoc (`project-sdk.ts:850-855`) which currently *names* the two relocated invariants — rewrite to "enforces config.invariants[] generically; the canonical conception declares completed-task-has-verification + decision-cites-forcing-artifact as config data."
4. **Declare defaults** — add the two `invariants[]` entries to this repo's `.project/config.json` (via the canonical write surface — `config.json` is a substrate file; mutate through block-api/tsx-eval, never raw Edit per F-006). Add the same two entries to the `/context init` scaffold template (Phase 6) so fresh projects get the canonical conception.
5. **Tests** — (a) unit: a fixture config with one `requires-edge` invariant + a violating item → expect the diagnostic with `code === inv.id`; a satisfying edge → clean. (b) DEC-0025 universalization: a fixture config in a *different* vocabulary (e.g. block `notes`, relation `note_supports_claim`, predicate `kind=draft`) declares its own invariant and pi-context enforces it with no source change — the proof DEC-0025 demands. (c) absent-tolerance: config with no `invariants` key → zero invariant issues, no throw. (d) regression: the existing `.project` substrate validates clean under the config-declared form (same verdict as the hardcoded form).
6. **Sequencing vs DEC-0036 re-derivation** — the `.context` re-derivation (DEC-0036) authors items so invariants are satisfied *at authoring time* (forcing-artifact edges, completed-VER edges authored as the items are written). For that to be checkable, `config.invariants[]` MUST already be declared in the `.context` config *before* `validateProject` gates the re-derived substrate. Therefore steps 1-3 (schema + type + consumer) land before the Phase-10 cutover, and the `.context` config carries `invariants[]` from its first authored line. Order: 1→2→3 (source + schema, vocabulary-free) → 4 (declare in `.project` + scaffold) → 5 (tests) → then DEC-0036 re-derivation can rely on the gate.

Completion sequence per CLAUDE.md applies to the implementation pass: build → check → test → runtime demo (tsx-eval `validateProject` against a real fixture substrate, asserting an invariant fires + clears) → adversarial probe → skills → commit → cascade.

---

## Open forks (for the user's call)

1. **Invariant-class scope at landing.** Recommended: ship **only `requires-edge`** now (covers both current invariants; `class` enum is the extension seam). Candidate future classes — cardinality bounds (≥N / ≤N edges), mutually-exclusive relation_types, edge-target-block constraints — are **not** evidenced by any current invariant and would be speculative. Fork: land requires-edge-only (recommended) vs. pre-build additional classes now. Canon (anti-over-engineering) points to requires-edge-only; flagging because "minimal-but-extensible set" in the brief invites a yes/no.

2. **Severity default.** Both current invariants are `error` (substrate-invalid). The schema defaults `severity` to `error`. Recommended: keep `error` default. No real fork unless the user wants completed-task-without-verification to be a *warning* (non-blocking) — a conception choice, not a mechanism choice. Flagging only so the default is a conscious pick.

3. **Default-invariants placement (config-template vs install-copy).** Recommended: config-template / `/context init` scaffold (no new install-copy path), per the Defaults section. The alternative (a `registry/blocks/config.json` with an install-copy path) is a larger change to install semantics. This is the one genuine placement fork; recommendation is decisive but the user owns whether to introduce a config install-copy channel.

No other forks. Predicate language (field-equality, reuse `where`) and consumer shape (single generic loop) are determined by in-repo precedent + the layering constraint — recommended, not forked.

---

## Verification approach

- **Runtime demo (DEC-0018):** `npx tsx -e` constructs a temp substrate-dir with a `config.json` declaring `completed-task-has-verification`, a completed task, and NO verification edge; calls `validateProject(tmp)`; asserts an issue with `code: "completed-task-has-verification"`. Then add the `verification_verifies_item` edge; re-run; assert clean. Repeat for `decision-cites-forcing-artifact`. This exercises the real consumer path, not a mock.
- **DEC-0025 universalization probe:** the same temp-substrate harness with a foreign vocabulary (block `notes`, relation `note_supports_claim`, predicate `kind=draft`) declaring its own invariant — proves pi-context enforces a conception it ships zero literals for. This is the load-bearing DEC-0025 evidence.
- **Adversarial probe (DEC-0018):** fresh-context agent greps `project-sdk.ts` post-change for any residual `"tasks"` / `"decisions"` / `"verification_verifies_item"` / `"decision_addresses_"` / `"completed"` string literal inside `validateProject` — a residual literal means the violation was only partially relocated. Also checks the loop does not silently no-op (e.g. `config.invariants` undefined → zero checks must be intentional absence-tolerance, not a swallowed error).
- **Regression:** `validateProject('.')` on the existing `.project` substrate returns the same verdict before and after the migration (the two invariants, now config-declared, produce identical diagnostics).
