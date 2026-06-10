# Story-completion invariant — engine-fit audit (2026-06-10)

Assesses whether the user-stories DRAFT's Step-6 completion rule fits pi-context's existing config-declared invariant kinds or needs a validator extension. Read-only; grounds every claim in `file:line` + quoted code.

## The rule (verbatim from `analysis/2026-06-10-user-stories-block-DRAFT.md`, Step 6)

> - A story is met when the task or feature advancing it has met its success criteria.
> - A task or feature can't be complete until every story it advances is met.
>
> Your two cases:
> - A task advances 1 story → when that task meets its success criteria, the story is met.
> - A feature advances 3 stories, 2 met → the set is not met → the feature can't be complete until all 3 are met.

Two new relation types carry it: `task_advances_story` (task → story), `feature_advances_story` (feature → story).

Decomposed predicate: **for each completing advancer X (a `task` whose bucket → complete, or a `feature` whose bucket → complete), every story X advances must be MET, where MET(story) ≡ ∃ an advancer A of that story (via either relation type) whose bucket is complete.** "Met" is itself derived from advancer completion — the check at a completing X is over the OTHER advancers of each story X advances, AND X itself counts (the single-advancer no-deadlock case: a task advancing one story, completing, IS the complete advancer that meets it).

## Engine invariant-kind inventory

The whole invariant engine lives in `validateContext` (`packages/pi-context/src/context-sdk.ts:1849`). `InvariantDecl` (`context.ts:202-214`) declares exactly **two config-declared classes**, both run vocabulary-neutrally from `config.invariants[]`:

```ts
// context.ts:202
export interface InvariantDecl {
	id: string;
	class: "requires-edge" | "status-consistency";
	block: string;
	where?: Record<string, string | number | boolean>;
	relation_types: string[];
	direction: "as_parent" | "as_child";
	when_bucket?: "complete" | "in_progress" | "blocked" | "todo" | "unknown";
	require_target_bucket?: "complete" | "in_progress" | "blocked" | "todo" | "unknown";
	forbid_target_bucket?: "complete" | "in_progress" | "blocked" | "todo" | "unknown";
	severity?: "error" | "warning";
	message?: string;
}
```

### Class 1 — `requires-edge` (config-declared) — `context-sdk.ts:2055-2078`

Predicate: items in `inv.block` matching `inv.where` (field-equality, `matchesWhere` `:1824`) must occupy `inv.direction`'s endpoint on ≥1 edge whose `relation_type ∈ inv.relation_types`; else a diagnostic.

```ts
// context-sdk.ts:2055
for (const inv of config.invariants ?? []) {
	if (inv.class !== "requires-edge") continue;
	const relTypeSet = new Set(inv.relation_types);
	const satisfied = new Set<string>();
	for (const edge of relations) {
		if (!relTypeSet.has(edge.relation_type)) continue;
		satisfied.add(inv.direction === "as_parent" ? endpointKey(edge.parent) : endpointKey(edge.child));
	}
	for (const loc of index.byRefname.values()) {
		const id = loc.id;
		if (loc.block !== inv.block) continue;
		if (!matchesWhere(loc.item, inv.where)) continue;
		if (satisfied.has(id)) continue;
		issues.push({ severity: inv.severity ?? "error", /* … */ code: inv.id });
	}
}
```

Expresses: edge PRESENCE (existence of ≥1 qualifying edge). It is status-blind on the OTHER endpoint — it never reads the target item's status.

### Class 2 — `status-consistency` (config-declared) — `context-sdk.ts:2091-2121`

Predicate: for each item in `inv.block`, optionally gated by `when_bucket` on the **item's own status bucket**, walk edges whose `relation_type ∈ inv.relation_types` and whose `inv.direction` endpoint is the item; the OTHER endpoint is the **target**; violation when the **target's status bucket** `!== require_target_bucket`, or `=== forbid_target_bucket`.

```ts
// context-sdk.ts:2089
const vocab = resolveStatusVocabulary(cwd);
const bucketOf = (item) => vocab[String(item.status)] ?? "unknown";
for (const inv of config.invariants ?? []) {
	if (inv.class !== "status-consistency") continue;
	const relSet = new Set(inv.relation_types);
	for (const loc of index.byRefname.values()) {
		const id = loc.id;
		if (loc.block !== inv.block) continue;
		if (inv.when_bucket && bucketOf(loc.item) !== inv.when_bucket) continue;
		for (const edge of relations) {
			if (!relSet.has(edge.relation_type)) continue;
			const selfIsParent = inv.direction === "as_parent";
			if ((selfIsParent ? endpointKey(edge.parent) : endpointKey(edge.child)) !== id) continue;
			const otherId = selfIsParent ? endpointKey(edge.child) : endpointKey(edge.parent);
			const otherLoc = index.byRefname.get(otherId);
			if (!otherLoc) continue;
			const otherBucket = bucketOf(otherLoc.item);
			const violateRequire = inv.require_target_bucket !== undefined && otherBucket !== inv.require_target_bucket;
			const violateForbid = inv.forbid_target_bucket !== undefined && otherBucket === inv.forbid_target_bucket;
			if (violateRequire || violateForbid) { issues.push({ /* … */ code: inv.id }); }
		}
	}
}
```

Expresses: **per-edge** status comparison between the gated source item and ONE related item, where the target predicate is the target's own `item.status`-derived bucket. **No quantifier** — it fires independently for each violating edge; there is no "∃ over the edge set" or "∀ except one" aggregation, and the target predicate reads only the target's own `status` field, never a derivation over the target's other edges.

### Code-backed (hardcoded) checks, not config-declared

Enumerated by reading `validateContext` top to bottom:

| Check | `file:line` | Severity |
|---|---|---|
| `substrate_id_unregistered` / `substrate_id_registry_mismatch` (SoT drift) | `context-sdk.ts:1875-1906` | error |
| `edge_endpoint_unregistered` / `edge_endpoint_dangling` (edge integrity) | `:1933-1966` | error |
| relation_type-not-registered | `:1967-1974` | error |
| edge endpoint-kind (`source_kinds`/`target_kinds`) | `:1987-2021` | error |
| `edge_cycle_detected` (delegated to `validateRelations`) | `:2032-2046` | error |
| `status_unknown_value` (status value absent from vocab) | `:2130-2146` | warning |
| `nested_id_bearing_array` (schema-level) | `:2159-2186` | warning |
| registered lens-validators | `:2193+` | per-validator |

The analogs the task names — `task-completed-gap-closed`, `task-completed-feature-complete`, `verification-passed-task-complete`, `decision-shows-derivation`, `completed-task-has-verification`, `decision-cites-forcing-artifact` — are **NOT hardcoded**. They are config DATA in `.context/config.json` `invariants[]` (`pi-context read-config --registry invariants`), enforced by the two generic loops above. Source carries no block/status/relation literal for them (DEC-0025). Per `context-sdk.ts:1845`, the canonical conception ships `completed-task-has-verification` + `decision-cites-forcing-artifact` as `requires-edge`; the active `.context` additionally declares the status-consistency set.

## Analog analysis — `task-completed-gap-closed` / `task-completed-feature-complete`

Both are config-declared `status-consistency` instances (`read-config` output verbatim):

```json
{"id":"task-completed-gap-closed","class":"status-consistency","block":"tasks",
 "relation_types":["task_addresses_gap"],"direction":"as_parent","when_bucket":"complete",
 "require_target_bucket":"complete","severity":"warning",
 "message":"Completed task '{id}' addresses a gap that is not closed"}
{"id":"task-completed-feature-complete","class":"status-consistency","block":"tasks",
 "relation_types":["task_addresses_feature"],"direction":"as_parent","when_bucket":"complete",
 "require_target_bucket":"complete","severity":"warning",
 "message":"Completed task '{id}' addresses a feature that is not complete"}
```

Structure: "when a `tasks` item is itself complete (`when_bucket`), the item ON THE OTHER END of each `task_addresses_*` edge must have bucket complete." The target predicate is the **target item's own `status` bucket**, read directly (`bucketOf(otherLoc.item)` `:2105`).

**Can this pattern express the story rule?** No — three structural divergences:

1. **Direction of "met" derivation.** In the analogs the target's satisfaction = the target's own status. In the story rule the target is a `story`, and a story carries no "met" status field — MET(story) is *derived* from the story's OTHER incoming advancer edges (∃ a complete advancer). `status-consistency` reads `otherLoc.item.status` only; it has no path to "evaluate a predicate over the target's edge set." The DRAFT confirms stories get no status-of-met field (`description` holds text; only `user_kind` is added; "No `verification_verifies_item` requirement on stories").

2. **Missing existential/universal quantifier.** The rule is "EVERY story X advances is met" where each MET is itself "∃ advancer complete." `status-consistency` fires per-edge with no aggregation. Even if a story DID carry a met-bucket, the analog would (correctly, by coincidence) flag "completing task advances a story whose bucket ≠ met" per edge — but it still cannot compute met, which is the existential the rule hinges on.

3. **The self-counts / no-deadlock case.** The single-advancer worked case (a task advancing one story, completing, MEETS that story) requires the completing item to count as a satisfying advancer of its own stories. A naive status-consistency reading would read the story's "met" at the instant of the task's completion and, because met is not yet recomputed to include the just-completing task, **deadlock** the exact case the DRAFT says must succeed. The engine has no construct that treats "the item being completed as satisfying its own targets."

Conclusion: the analogs are the closest existing shape (status-consistency-across-a-completion-gate, same `when_bucket: complete` framing), but their predicate vocabulary (per-edge, target-own-status, no quantifier) cannot encode MET-as-derived-existential.

## Classification verdict — (b) a SMALL validator extension (a new config-declarable kind)

Not (a): no `requires-edge` or `status-consistency` config entry can express MET = ∃-complete-advancer-over-the-target's-incoming-edges with the completing-item-self-counts semantics. `requires-edge` is status-blind; `status-consistency` reads only the single target's own `status` and has no quantifier.

Not (c) preferentially: a one-off hardcoded check (like `edge_cycle_detected`) WOULD work, but it violates DEC-0025 (no invariant vocabulary — block/status/relation_type — in source) and the project's standing direction that derivations are config-declared (FEAT-004; `feedback_filing_pipeline_is_an_enforcement_surface`; CLAUDE.md "filing pipeline is an enforcement surface"). The existing analogs were deliberately moved OUT of source into config DATA (`context-sdk.ts:2048-2051`, "Replaces the two previously-hardcoded invariants"). A new hardcoded story check would re-introduce exactly the source-vocabulary the architecture eliminated.

**Canonical shape: a third config-declarable invariant `class` — call it `advancer-completion` (status-aggregate-over-incoming-edges).** It generalizes status-consistency from per-edge to ∃-over-an-edge-set with a self-satisfies clause:

```jsonc
{
  "id": "advancer-meets-every-story",
  "class": "advancer-completion",          // NEW class
  "block": "tasks",                          // also a sibling decl for "features"
  "when_bucket": "complete",                 // gate: only when the advancer itself is complete
  "advances_relation_types": ["task_advances_story", "feature_advances_story"],
  "advancer_direction": "as_parent",         // advancer is the parent (task/feature → story)
  "met_bucket": "complete",                  // a story is MET when ≥1 advancer has this bucket
  "self_satisfies": true,                    // the completing item counts as a complete advancer
  "severity": "error",
  "message": "Completing {id} advances a story with no complete advancer (story not met)"
}
```

Engine semantics (a third loop in `validateContext`, parallel to the two existing ones, vocabulary-neutral):
- For each item in `inv.block` whose own bucket matches `when_bucket` (the completing advancer X):
  - For each story S that X advances (edge `relation_type ∈ advances_relation_types`, X at `advancer_direction`):
    - MET(S) ≡ ∃ an edge of those relation_types with S at the story endpoint and an advancer A whose `bucketOf(A) === met_bucket` **OR** (`self_satisfies` AND A === X) — i.e. X counts even though X's status-write may not be the thing being validated.
    - If `met_bucket: complete` and `self_satisfies: true`, the single-advancer case is met by X itself → no deadlock.
  - Violation when any advanced S is not MET.

This is one new `class` literal in the `InvariantDecl` union (`context.ts:204`), one new branch in the `validateContext` invariant section, and config DATA to declare the two block-scoped instances. No story-specific or relation-specific literal in source — the relation_types, blocks, buckets are all `inv` DATA.

Two config instances are needed (one `block: tasks`, one `block: features`) unless the new class accepts a `blocks: string[]`; declaring two entries is consistent with how `*-articulates-convention` ships one entry per block today (`read-config`: `decision-`/`feature-`/`task-articulates-convention`).

## Enforcement-point findings

The rule says "can't be complete." Three candidate binding points; what each actually offers:

| Point | What exists | Binding strength for this rule |
|---|---|---|
| `context-validate` (`validateContext`, `context-sdk.ts:1849`) | All config invariants + hardcoded checks run here; emits `ContextValidationResult{status, issues[]}`. | **Post-hoc flag only.** Reports the violation after the status write has landed. `error` severity flips overall status to `invalid` but blocks nothing at write time. This is where the new class would naturally live. |
| Write path — `update-block-item` status mutation (`block-api.ts` `updateItemInBlock`/`upsertItemInBlock`) | Runs **AJV schema validation only** (`block-api.ts:1959` "AJV validation failure"). `grep` for `validateContext`/`invariant`/`status-consistency` in `block-api.ts` finds **no config-invariant hook** — only the OID/content-hash invariants and AJV. | **No write-time invariant gate exists.** A status update to `completed` is not invariant-checked. To "block the write" the engine would need a NEW hook calling the invariant evaluation pre-commit — not present today. |
| `completeTask` (`context-sdk.ts:2241`) | Task-only (no feature equivalent). Gates on: verification entry exists + `status === "passed"` (`:2261`); task exists + not already completed/cancelled (`:2282-2287`); a `verification_verifies_item` edge parent=verification child=task (`:2293-2300`). Then `updateItemInBlock(... {status:"completed"})` (`:2304`). It does **NOT** call `validateContext` or evaluate any config invariant. | **Could block, but only for tasks, and only if extended.** No analog gate exists for features (features complete via a plain `update-block-item`, not a guarded fn). Adding a story-met gate here would (i) be task-only, leaving features ungated, and (ii) hardcode the relation/bucket vocabulary into source — the DEC-0025 violation again. |

Summary: today the ONLY place any config invariant binds is `context-validate` (post-hoc report). There is no write-time invariant hook and no feature-side `completeTask`. "Can't be complete" is therefore enforceable as a post-hoc `error` diagnostic now (via the new class at `context-validate`); enforcing it as a hard write-time BLOCK would additionally require a new write-path invariant hook (a separate, larger change touching `block-api.ts` + `completeTask` + a feature-completion equivalent) that does not exist and is out of scope for the invariant-engine extension itself.

## "Met" derivation finding (incl. no-deadlock)

Can the engine express MET(story) = ∃ an advancer with bucket complete today? **No.** Both existing classes are confined to:
- `requires-edge`: edge presence, status-blind.
- `status-consistency`: a single target's own `status` bucket per edge; no ∃ over an edge set; no derivation over the target's other edges.

MET is an existential over a story's INCOMING advancer edges with a status predicate on the far endpoint — a shape neither class has (`bucketOf` is only ever applied to `loc.item` or a single `otherLoc.item`, never folded over an edge set, `context-sdk.ts:2090,2105`).

The **single-advancer no-deadlock case** specifically is unreachable by any reframing of `status-consistency`: at the instant task T (sole advancer of story S) completes, MET(S) must be TRUE *because of T*. A status-consistency declaration `block:tasks, when_bucket:complete, require_target_bucket:<met>` would need S to carry a met-bucket that is already true — but S's met-ness is derived from T, which the engine has no way to fold in. The new class's `self_satisfies: true` clause (X counts as its own stories' complete advancer) is the construct that closes this; it has no equivalent in either existing class.

## CLI-provable verification conditions (for the (b) classification, once implemented)

Setup uses the canonical filing surface (`pi-context append-block-item`/`append-relation`/`update-block-item`, `--writer`), then `pi-context context-validate --json`. The invariant must:

1. **Fire — feature with 2/3 stories met cannot complete.** Three stories S1,S2,S3; feature F advances all three (`feature_advances_story` F→S1,S2,S3). S1 met by a complete task A1 (`task_advances_story` A1→S1, A1 complete); S2 met by complete A2; S3 has only an incomplete advancer A3. Set F to its complete bucket. `context-validate --json` → an issue `code: advancer-meets-every-story`, `block: features`, `field` anchored to F, naming S3 unmet. (Demonstrates ∀-over-advanced-stories + the unmet existential.)

2. **Does NOT false-fire — single-advancer task completes cleanly.** Story S; task T is S's ONLY advancer (`task_advances_story` T→S). `completeTask` (or the status write) sets T complete. `context-validate --json` → NO issue with `code: advancer-meets-every-story` for T. (Demonstrates `self_satisfies`: T meets its own sole story; the no-deadlock case.)

3. **Clears on a multi-advancer met story.** Story S advanced by T (completing) and U (already complete); T completes. No issue — MET(S) holds via U as well as via T.

4. **Negative control — non-completing advancer is not gated.** T advances S, S unmet, T NOT in `when_bucket` (e.g. in-progress). No issue — the gate is the advancer's own completion.

Each condition is one `context-validate --json` read after the filing writes; the presence/absence of `code: advancer-meets-every-story` in `issues[]` is the assertion (mirrors the existing status-consistency tests' `result.issues.find((i) => i.code === …)` idiom, `context-sdk.test.ts:2801`).

## What a validator extension would touch (shape, not implementation)

- `packages/pi-context/src/context.ts:202-214` — extend the `InvariantDecl` union: add `"advancer-completion"` to `class`, and the new optional fields (`advances_relation_types`/`met_bucket`/`self_satisfies`/`advancer_direction`, or reuse existing `relation_types`/`direction` + add `met_bucket`/`self_satisfies`). Update the doc-comment at `:184-200`.
- `packages/pi-context/src/context-sdk.ts` — add a third invariant loop in `validateContext` (after the `status-consistency` loop, `:2091-2121`), vocabulary-neutral, using the same `vocab`/`bucketOf` (`:2089-2090`), `index.byRefname`, and `relations` already in scope; with the ∃-over-advancers fold + `self_satisfies` self-count.
- `.context/config.json` `invariants[]` (DATA, via the catalog) — two declarations (`block: tasks`, `block: features`); the two relation types (`task_advances_story`, `feature_advances_story`) added to `relation_types[]` with `source_kinds`/`target_kinds` (tasks/features → story) per the endpoint-kind check (`:1987-2021`); and the `samples/conception.json` catalog mirror so `/context update` propagates them.
- `packages/pi-context/src/context-sdk.test.ts` — a `describe("advancer-completion invariants")` suite mirroring the status-consistency suite (`:2755+`), covering conditions 1–4 above (especially the self-satisfies no-deadlock).
- Schema/write-AJV for `InvariantDecl` if config invariants are AJV-validated on write (the config-write path) — verify whether `config-write` validates invariant shape; if so the new fields must be admitted.

No write-time BLOCK is included — that is a separate, larger change (new write-path/completeTask hook + a feature-completion guard) and is NOT part of this invariant-engine extension. The (b) extension binds the rule as a post-hoc `error` at `context-validate`.
