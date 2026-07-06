# Foreign-status derivation blindness — upstream verification of the downstream two-substrate report

**Date:** 2026-07-06
**Investigator:** fresh-context agent, upstream repo (`workflowsPiExtension`), code at `main` (HEAD `aafc8dc`, pi-context v0.32.0 + Unreleased)
**Provenance:** a downstream two-substrate experiment in another project surfaced the gap and handed a report upstream. Every downstream claim was treated as a hypothesis and independently re-derived against current upstream code plus a two-substrate scratchpad reproduction driven through `packages/pi-context/dist` (built 2026-07-06 08:12, current with source). Nothing here is relayed unverified.
**Repro fixture:** `/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e/scratchpad/foreign-repro/repro.mjs` (session scratchpad; outputs pasted verbatim below).

---

## 1. Downstream claims — verdicts

| # | Downstream claim | Verdict |
|---|---|---|
| 1 | Cross-substrate relationality shipped in v0.28.0: content-addressed identity, registry+aliases, resolveRef 4-way classification, structured foreign endpoints, promote-item lineage | **CONFIRMED** — `packages/pi-context/CHANGELOG.md` `[0.28.0] - 2026-06-03` lists all five (registry with aliases `633d154`/`87c0834`; `resolveRef` cross-substrate resolution `06331df`; `promoteItem` + `item_derived_from_item` `7cb1644`; structured `EdgeEndpoint` `fa91fda`). All present in current code. |
| 2 | Foreign gate endpoints are silently dropped from blockedBy via `index.byRefname.has(t)` against the ACTIVE index; item derives unblocked | **CONFIRMED** (mechanism + empirical repro, §3–4) — and it is worse than dropped: on a refname collision the foreign endpoint silently **mis-resolves to the active substrate's item** (§4, step 5). |
| 3 | Derivation, context-validate, and context-reconcile share one completeness helper (`derivedRollupComplete`), so a foreign-status fix has a single seam | **CORRECTED** — the sharing is real (three consumers, §5.2) but it is NOT the seam of the gate bug. The gate drop happens in `incompletePreds`/`unsatisfiedGates` membership filters BEFORE `derivedRollupComplete` is consulted, and `status-consistency`, `joinBlocks`, roadmap rollups, and the walks each carry their OWN active-index membership test. The actual single seam is one level down: `endpointKey()` + active-index lookup as the universal edge→item join (§5.4). |
| 4 | No FGAP, FEAT, or DEC upstream tracks foreign-status derivation | **CONFIRMED** (sweep, §6) — unfiled. Nearest neighbors are FGAP-061 (kind coverage of readiness, not endpoint resolution), FEAT-011 (owns `derivedRollupComplete`; says nothing about foreign endpoints), and R-0009 finding D1 (the template `resolve()` global is single-substrate — a sibling instance of the same class in the rendering surface). |
| — | "Foreign-status derivation was never designed" | **CORRECTED IN PART** — the 2026-05-31 identity spec contains NO design for derivation over foreign endpoints (zero occurrences of `currentState`/`blocked`/`derivation`/`gate` in the spec), so the derivation half is confirmed never-designed. But §J3 of that spec DID design foreign-aware **status-consistency**: "Foreign items may satisfy endpoint resolution, but status consistency should compare status only if the foreign item's block/status schema is readable. If unreadable, emit warning." The shipped status-consistency loop implements neither the compare nor the warning (§3.3) — §J3 is a designed-and-not-implemented slice inside the broader never-designed gap. |

---

## 2. The shipped foreign-endpoint model (what derivation ignores)

`packages/pi-context/src/context.ts:365-367` — structured endpoint:

```ts
export type EdgeEndpoint =
	| { kind: "item"; substrate_id?: string; oid: string; refname?: string; content_hash?: string }
	| { kind: "lens_bin"; bin: string };
```

`context.ts:405-413` — the load-bearing normalization every consumer joins on:

```ts
export function normalizeEndpoint(e: RawEndpoint): NormalizedEndpoint {
	if (typeof e === "string") {
		return { kind: "item", key: e, foreign: false };
	}
	if (e.kind === "lens_bin") {
		return { kind: "lens_bin", key: e.bin, bin: e.bin };
	}
	return { kind: "item", key: e.refname ?? e.oid, foreign: !!e.substrate_id };
}
```

`endpointKey(e)` (context.ts:422-424) returns `normalizeEndpoint(e).key` — for a structured FOREIGN endpoint that is the **bare refname**, with the `substrate_id` and the `foreign: true` flag discarded by every `endpointKey` consumer. Two consequences: (a) the foreign endpoint misses the active index → invisible; (b) if the active substrate happens to hold an item with the same refname, the foreign endpoint **collides onto the local item** and every consumer silently reads the wrong substrate's status.

The registry-aware resolver that CAN see foreign items exists — `resolveRef` (context-sdk.ts:2146-2242) classifies every endpoint `active | foreign | dangling | unregistered`, builds per-pass-cached foreign indices (`foreignIndexFor`, 2091-2111), and returns the foreign item's `loc`. It is wired into exactly two places: validateContext's edge-integrity classification (2513-2557) and `validateEdgeAgainstRegistry`'s kind checks. **No derivation or read surface routes through it.**

## 3. Mechanism — where foreign endpoints are dropped, per surface

### 3.1 Gate/dependency satisfaction (currentState → blocked/nextActions)

`context-sdk.ts:889-892`:

```ts
	const incompletePreds = (itemId: string): string[] =>
		dependencyPredsOf(itemId).filter((dep) => index.byRefname.has(dep) && !isCompleted(dep));
	const unsatisfiedGates = (itemId: string): string[] =>
		gatePredsOf(itemId).filter((target) => index.byRefname.has(target) && !isCompleted(target));
```

`index` is `buildIdIndex(cwd)` — the ACTIVE substrate only (line 781). A foreign gate/dep endpoint's `endpointKey` (bare refname) fails `byRefname.has` and is filtered out **before** any completeness check → the blocker never enters `blockedBy` → the item derives ready. The behavior rides the documented dangling-target guard (docstring, context-sdk.ts:710-711: "A dangling gate target (id resolves to no item) is treated as satisfied/non-blocking, mirroring the dangling-dep guard" — tested at context-sdk.test.ts:3035). The membership test cannot distinguish dangling from foreign, so a VALID foreign endpoint inherits the dangling-target's satisfied-by-default semantics — while validate simultaneously classifies dangling as ERROR and foreign as FINE (§3.5). No diagnostic is emitted anywhere on this path.

### 3.2 Rollup completeness — `derivedRollupComplete` (opposite polarity)

`context-sdk.ts:758-759`:

```ts
	const loc = index.byRefname.get(itemId);
	if (loc === undefined) return false;
```

A foreign MEMBER of a rollup (e.g. a foreign phase positioned in a local milestone) misses the active index → `false` → the rollup can NEVER derive complete, regardless of the member's actual status in its home substrate. Note the inverted polarity vs gates: foreign gate → silently satisfied (false-ready); foreign rollup member → silently incomplete (false-never-done).

### 3.3 status-consistency invariants

`context-sdk.ts:2352-2353` (inside `evaluateConfigInvariants`):

```ts
				const otherLoc = index.byRefname.get(otherId);
				if (!otherLoc) continue; // dangling endpoint handled by edge-integrity above
```

A foreign target endpoint is skipped. The comment is wrong for the foreign case: edge-integrity classifies a foreign endpoint as VALID (no issue, §3.5), so nothing "handles" it — the status comparison is silently never performed. This is the exact site the identity spec's §J3 designed (compare-if-readable, warn-if-not); neither leg shipped.

### 3.4 requires-edge invariants

`context-sdk.ts:2306-2311`:

```ts
		const satisfied = new Set<string>();
		for (const edge of relations) {
			if (!relTypeSet.has(edge.relation_type)) continue;
			satisfied.add(inv.direction === "as_parent" ? endpointKey(edge.parent) : endpointKey(edge.child));
		}
```

Satisfaction is edge-EXISTENCE with no resolution of the counter-endpoint: an edge whose other end is foreign — or dangling, or unregistered — satisfies a requires-edge invariant (e.g. completed-task-has-verification). Foreign-satisfying may even be the desired semantics, but it is unexamined behavior falling out of the same no-resolution join, not a decision.

### 3.5 validateContext edge-integrity — the certifying half of the split-brain

`context-sdk.ts:2513-2557`: every endpoint IS routed through `resolveRef`; `active`/`foreign` → **no issue**; `unregistered`/`dangling` → ERROR. So the substrate's integrity surface certifies a foreign edge as fully valid while every derivation surface behaves as if the edge does not exist (gates) or as if its target is permanently incomplete (rollups). The substrate is allowed to SAY the foreign edge is fine while DERIVING as if it were absent — confirmed empirically (§4, steps 2–3).

### 3.6 The remaining edge-consuming read surfaces (trace)

- **joinBlocks edge mode** — context-sdk.ts:1253: `const loc = index.byRefname.get(otherId);` → foreign right-items silently dropped from join results (or collision-joined to the local same-refname item).
- **roadmap-plan rollups** — roadmap-plan.ts:340 (`index.byRefname.get(phaseId)`) and :345 (same for tasks): foreign phases/tasks silently excluded from milestone/phase rollup counting; roadmap validation additionally flags a foreign milestone endpoint as "not a milestone-block item" (roadmap-plan.ts:415-446 checks `milestoneIds.has(endpointKey(...))` against active-index-derived sets).
- **walkDescendants / walkAncestors / walk ops** — context.ts:1586-1638: pure `endpointKey` traversal, no index join, so foreign nodes DO appear in walk output — but as **bare refnames with the substrate qualifier erased**, indistinguishable from local ids (and conflated with a local item on refname collision, corrupting the visited-set and the traversal itself).
- **findReferences / find-references op** — returns full `Edge[]` records (structured endpoints intact); this surface is NOT blind. It is the only edge-read surface that preserves foreignness.
- **context-reconcile + converge-on-write** — index.ts:2704 (`computeDerivedStatusDeltas`) and index.ts:2760 (`convergeDerivedStatusAfterWrite`) both route completeness through the same `derivedRollupComplete` (§3.2), then **WRITE the stored status** through `updateItemInBlock`. A rollup with a foreign member is therefore not merely mis-derived — the engine actively stamps `incomplete_status` onto the stored item on every reconcile/converge, making the foreign-blind derivation durable.
- **template `resolve()` global (rendering)** — already independently observed by R-0009 finding D1: "the resolve global is single-substrate (buildIdIndex) — no `<alias>:<refname>` / foreign-substrate classification in templates." Same class, different consumer stack.

## 4. Empirical reproduction (two substrates, real porcelain, dist code)

Fixture: project `projA` with active substrate `.project` (config declaring the stock `state_derivation` — `blocked_by: [task_depends_on_task, task_gated_by_item]`, milestone rollup via `phase_positioned_in_milestone` — plus a status-consistency invariant `gate-target-must-be-complete` requiring every `task_gated_by_item` target to bucket complete); foreign substrate `peerB` registered in `.pi-context-registry.json` as `sub-00000000000000b1` with alias `peer`, holding gap `gB` (status `identified` → bucket todo, NOT complete) and phase `phB` (status `completed`). Task `tA` (status `planned`) in A. All edges written through the sanctioned porcelain `appendRelationByRef` with `alias:refname` selectors.

**Observation 0 (porcelain note):** a bare `{parent, child}` append of `task_gated_by_item` is REFUSED ("orientation-ambiguous … Re-issue with --primary/--counter"); the role-typed form `{primary: "peer:gB", counter: "tA"}` succeeds. The foreign edge write itself is fully sanctioned.

**Step 1 — the sanctioned foreign gate edge lands, structured and resolvable:**

```
APPEND appendRelationByRef(tA gated_by peer:gB): {
 "appended": true,
 "edge": { "parent": {"kind":"item","oid":"tA","refname":"tA"},
           "child": {"kind":"item","substrate_id":"sub-00000000000000b1","oid":"gB","refname":"gB"},
           "relation_type": "task_gated_by_item" } }
RESOLVE_REF(child): {"status":"foreign","endpointKind":"item","substrate_id":"sub-00000000000000b1","oid":"gB","refname":"gB",
  "loc":{"id":"gB","block":"framework-gaps","arrayKey":"gaps","item":{"id":"gB","title":"open gap in B","status":"identified"}}}
```

`resolveRef` sees the foreign item AND its not-complete status. The machinery to resolve it exists and works.

**Step 2 — derivation ignores the gate (task gated by an OPEN foreign gap derives ready):**

```
CURRENT_STATE (foreign gate open in B):
  blocked:       []
  nextActions:   [{"id":"tA","kind":"task","reason":"unblocked planned task"}]
```

**Step 3 — validate says everything is fine, including the declared status-consistency invariant:**

```
VALIDATE (foreign gate open in B): { "status": "clean", "issues": [] }
```

Clean — despite `gate-target-must-be-complete` being declared and `tA`'s gate target being not-complete in B. The foreign target is skipped at context-sdk.ts:2353. Silent in BOTH derivation and validation: confirmed.

**Step 4 — control (identical local gate works):** adding local open gap `gLocal` with the same edge shape yields `blocked: [{"id":"tA","blockedBy":["gLocal"]}]`, `nextActions: []`, and validate `invalid ["gate-target-must-be-complete"]`. The harness derives local gates correctly; the foreign drop is specific to foreignness.

**Step 5 — refname collision mis-resolves to the wrong substrate:** with a LOCAL item also named `gB` (status `closed` → complete) while the FOREIGN `gB` stays open:

```
CURRENT_STATE (collision: LOCAL gB closed, FOREIGN gB open):
  blocked:       [{"id":"tA","block":"tasks","blockedBy":["gLocal"]}]
```

The foreign gate is now "satisfied" — by the LOCAL `gB`'s closed status. The edge points at `sub-…b1:gB`; the derivation read `.project:gB`. Cross-substrate identity aliasing, fully silent.

**Step 6 — rollup polarity (foreign member = permanently incomplete):** milestone `mA` with two members, local `phLocal` COMPLETED and foreign `peer:phB` COMPLETED:

```
CURRENT_STATE milestones (members: local phLocal COMPLETED + foreign phB COMPLETED): [{"id":"mA","status":"planned","phaseCount":2}]
CURRENT_STATE milestones (foreign member removed, only local COMPLETED member):      [{"id":"mA","status":"reached","phaseCount":1}]
```

Both members complete in their home substrates → milestone derives `planned`. Remove the foreign member → `reached`. Any `task_gated_by_item` gate on `mA`, the derived-status invariant, and a reconcile/converge stamp all consume this false-incomplete via the shared `derivedRollupComplete`.

## 5. The class

### 5.1 Statement

**Every edge-consuming derivation and read surface in pi-context resolves endpoints against the active substrate's index only (via `endpointKey` → bare refname → `byRefname`), while the write path and the integrity surface accept and certify foreign endpoints as valid. Foreign endpoints are uniformly invisible to derived state — dropped, defaulted, or collision-mis-resolved per surface — with no diagnostic on any derivation path.** The v0.28.0 cross-substrate arc shipped foreign IDENTITY (mint, register, resolve, classify, promote) and stopped before foreign CONSUMPTION: `resolveRef` exists and is correct but is wired only into validation classification, never into derivation.

### 5.2 Per-surface inventory

| Surface | Site | Foreign-endpoint behavior | Polarity | Evidence |
|---|---|---|---|---|
| Gate satisfaction (`unsatisfiedGates`) | context-sdk.ts:891-892 | dropped → gate treated satisfied | **false-ready** | repro steps 2–3 |
| Dependency satisfaction (`incompletePreds`) | context-sdk.ts:889-890 | dropped → dep treated satisfied | **false-ready** | trace (identical filter one line above the repro'd one) |
| Rollup completeness (`derivedRollupComplete`) → currentState milestones + gate `isCompleted` | context-sdk.ts:758-759 | member unresolvable → rollup never complete | **false-blocked** | repro step 6 |
| derived-status invariant | context-sdk.ts:2396 (same helper) | inherits §above; flags stored `reached` as divergent | false-blocked | trace (shared helper) |
| context-reconcile / converge-on-write | index.ts:2704, 2760 | inherits §above; **WRITES** `incomplete_status` onto the stored item | false-blocked, made durable | trace (shared helper → `updateItemInBlock`) |
| status-consistency invariant | context-sdk.ts:2352-2353 | target skipped (`continue`) | **drift invisible** | repro step 3 (declared invariant, clean validate) |
| requires-edge invariant | context-sdk.ts:2306-2311 | edge existence satisfies; counter-endpoint never resolved | foreign (or dangling) edge satisfies | trace |
| joinBlocks edge mode | context-sdk.ts:1253 | right-item dropped / collision-joined | rows silently missing | trace |
| roadmap-plan rollups + validation | roadmap-plan.ts:340,345,415-446 | members dropped; foreign milestone endpoint flagged as not-a-milestone | false-incomplete + false-error | trace |
| walkDescendants/Ancestors + walk ops | context.ts:1586-1638 | traversed, but substrate qualifier ERASED (bare refname) | identity loss; collision conflation | trace |
| template `resolve()` global | R-0009 D1 (render-helpers/compile) | single-substrate; foreign refs fall back to bare-ID text | silent non-render | prior filing R-0009 |
| findReferences / find-references op | lens-view.ts:343 | returns raw `Edge[]` — structured endpoints intact | **not blind** (only surface preserving foreignness) | trace |
| Edge write porcelain + edge-integrity validate | context-sdk.ts:1835, 2513-2557 | accepts + certifies foreign as valid | the certifying half of the split-brain | repro steps 1, 3 |

### 5.3 The collision sub-defect

`normalizeEndpoint`'s `key: refname ?? oid` (context.ts:412) makes every foreign structured endpoint alias onto any active item sharing the refname. Since refnames follow shared conventions (`TASK-001`, `FGAP-001`, `MILE-001` in every substrate installed from the same catalog), collisions across registered sibling substrates are the EXPECTED case, not the corner case — and each one silently swaps in the wrong substrate's status (repro step 5). This elevates the class from "foreign edges are inert" to "foreign edges can actively assert the wrong truth."

### 5.4 The seam (corrected single-seam claim)

The membership tests are plural (gate filters, `derivedRollupComplete`, status-consistency's `otherLoc`, joinBlocks, roadmap, walks), so there is no single FUNCTION to patch. The genuine single seam is the JOIN CONVENTION: every one of these sites computes `endpointKey(e)` and looks it up in the active `byRefname`. The class-correct fix replaces that convention with resolution through the already-shipped, already-pass-cached `resolveRef` (or an equivalent `resolveEndpointLoc(e)` returning `{loc, status, substrate_id}`), at every derivation join. `derivedRollupComplete` IS a genuine single seam for its three consumers (currentState/isCompleted, derived-status invariant, reconcile/converge) — fixing endpoint resolution inside it converges all three at once — but it covers only the rollup slice of the class.

## 6. Prior-art sweep — unfiled

Method: `pi-context filter-block-items` (one op per call, `matches` single-term regex; JS RegExp rejects inline `(?i)`, so bracket-class case folding was used) over framework-gaps, features, decisions, research on title + description/decision/findings_summary for: foreign, substrate, cross, cross-substrate, peer, derivation, promote.

- **framework-gaps**: `foreign` in descriptions → FGAP-002 (substrate clone/provenance; identity-level, no derivation), FGAP-009 (closed; op-surface coverage). `derivation` in titles → FGAP-061, FGAP-075 (changelog gate, unrelated), FGAP-102 (catalog parity, unrelated). `cross` in titles → 7 items, none about endpoint consumption. `cross-substrate` in descriptions → FGAP-002 only. `peer` → 0. `promote` → FGAP-118 (CLI promote step, unrelated).
- **FGAP-061** (read in full, status `identified`, P2, "gate-aware readiness derivation"): its residual scope is that `feature_gated_by_item` / `story_gated_by_item` have no readiness deriver because currentState buckets only tasks — a KIND-coverage gap in the same deriver. It says nothing about endpoint resolution or foreign substrates; the task-level gate leg it records as SHIPPED (TASK-065) is precisely the leg shown here to be foreign-blind. Disjoint scope; this gap should relate to it (same deriver, orthogonal axes), not fold into it.
- **features**: `foreign`/`cross`/`cross-substrate` → 0. `derivation` → FEAT-004 (config-driven derivation; FGAP-061's home) and FEAT-011 (currency-by-construction; owns `derivedRollupComplete`) — neither mentions foreign endpoints. FEAT-011's "currency by construction" criterion is the natural doctrinal home: a foreign-blind derivation is a currency hole its criteria do not currently cover.
- **decisions**: `foreign` → DEC-0002 (clone-as-fork, provenance ledger), DEC-0003 (switch registers native identity) — identity/registration, not consumption. `derivation` → DEC-0021 (unrelated). `cross-substrate` → 0.
- **research**: `foreign` → R-0009 (rendering-pipeline audit; finding D1 = template resolve() is single-substrate — a sibling instance, filed only as a rendering-pipeline finding). `cross-substrate` → R-0002 (portability feasibility; identity-level).

**Verdict: no FGAP, FEAT, DEC, or research item tracks foreign-endpoint awareness in derivation/read surfaces. Unfiled.**

Design-record check: `analysis/2026-05-31 PI-CONTEXT Substrate Identity & Integrity — Implementation Specification.md` — Phase J wires the resolver into validateContext (J1, shipped) and invariant matching (J2); §J3 (quoted in §1 above) designs foreign-aware status-consistency (compare-if-readable, warn-if-unreadable) — NOT implemented. No section designs derivation (currentState/rollups/reconcile) over foreign endpoints.

Sweep friction observed (not filed; surfaced for the orchestrator): `filter-block-items` has no field projection, so a broad predicate (`[Ss]ubstrate` in gap titles: 20 hits, 78KB) exceeds the 50KB read cap with no way to request id+title only; the refusal suggests `read-block-page`, which cannot express the predicate. A queryability gap candidate, distinct from this filing.

## 7. Resolution shape

Non-negotiable floor (correctness-over-cost): silent dropping cannot remain. Whatever semantics is chosen, a foreign endpoint on a derivation path must be either resolved or loudly surfaced — never defaulted.

The architecture already affords the fix: `resolveRef` + `foreignIndexFor` provide registry-resolution with per-pass caching and graceful degradation (unreadable foreign substrate → `dangling`, never a crash). The class-correct change routes every §5.2 join through it:

1. **Resolve-at-derive (recommended shape):** derivation joins resolve endpoints through the registry; a `foreign` endpoint's completeness/status is read from its home substrate's index (per-pass foreignCache, one build per substrate per derivation — the same cost profile validateContext already pays). Gate on a foreign open gap → blocked with `blockedBy: ["peer:gB"]` (qualifier preserved); milestone with a complete foreign member → reached. §J3's rule generalizes: compare when readable, degrade LOUDLY (not silently) when not.
2. **Derive-as-blocked-until-resolved:** a foreign gate/dep endpoint is conservatively treated as UNSATISFIED (blocked) without reading the foreign substrate. Cheap, safe-direction for gates, but inverts the rollup problem (foreign members still never complete) and reports blockage that may be stale.
3. **Flagged-not-silent floor:** derivation still excludes foreign endpoints but currentState/validate carry an explicit `foreignEndpointsIgnored`/warning channel per affected item. Minimum honest state; leaves derived truth wrong but labeled.

These are genuinely different foreign-resolution semantics (live cross-substrate read vs conservative local-only vs labeled exclusion) with real trade-offs (freshness, cost, offline substrates, trust in sibling-substrate status vocabularies). **That choice is DEC-shaped and should be recorded as a decision, not buried in an implementation.** Orthogonal but mandatory in any variant: kill the refname-collision aliasing — a foreign structured endpoint must never key-collide onto a local item (`normalizeEndpoint` must qualify foreign keys, e.g. `substrate_id:refname`, or every consumer must branch on `.foreign`); and the dangling-vs-foreign conflation in the gate guard must split (dangling stays satisfied-per-current-doc or is revisited; foreign follows the decided semantics). Reconcile/converge inherit whichever semantics is decided through `derivedRollupComplete` automatically — that shared helper is the one seam where the rollup slice converges.

## 8. DRAFT framework-gaps item (not filed — user-permission-gated; orchestrator presents)

```json
{
	"title": "Derivation is foreign-blind: every edge-consuming derived surface resolves endpoints against the active index only, so valid foreign endpoints are silently dropped (gates derive ready), defaulted (rollups never complete), or collision-mis-resolved to same-refname local items — while validate certifies the same edges as fine",
	"status": "identified",
	"priority": "P1",
	"package": "pi-context",
	"canonical_vocabulary": "registry-aware endpoint resolution in derived state",
	"description": "The v0.28.0 cross-substrate arc shipped foreign IDENTITY (structured EdgeEndpoint with substrate_id, registry+aliases, resolveRef active/foreign/dangling/unregistered classification, promoteItem lineage) but no derivation surface consumes it. Every derivation/read join computes endpointKey(e) — the BARE refname for a structured foreign endpoint (normalizeEndpoint key: refname ?? oid, substrate_id discarded) — and looks it up in the ACTIVE substrate's byRefname index only. Consequences by surface: (1) gate/dependency satisfaction (currentState incompletePreds/unsatisfiedGates, context-sdk.ts:889-892) filters foreign blockers out via index.byRefname.has() BEFORE the completeness check — the foreign endpoint rides the documented dangling-target-satisfied guard, so a task gated on an OPEN foreign item derives ready/nextActions; (2) derivedRollupComplete (context-sdk.ts:758-759) returns false for any foreign member — a rollup with a foreign member NEVER derives complete even when every member is complete in its home substrate, and context-reconcile/converge-on-write STAMP that false incomplete_status onto the stored item; (3) the status-consistency invariant skips foreign targets (context-sdk.ts:2352-2353 'if (!otherLoc) continue', comment wrongly claims edge-integrity handles it); (4) requires-edge satisfaction never resolves the counter-endpoint (foreign or dangling edges satisfy); (5) joinBlocks edge mode (context-sdk.ts:1253) and roadmap-plan rollups (roadmap-plan.ts:340,345) drop foreign counterparts; (6) walk ops emit foreign nodes as bare refnames (substrate qualifier erased). Refname collision is the aggravator: because the foreign key is the bare refname, a local item with the same refname (the EXPECTED case across catalog-installed sibling substrates) silently substitutes its status for the foreign item's — empirically, a task gated on foreign-open gB derived UNBLOCKED because a local closed gB existed. Meanwhile validateContext's edge-integrity DOES route through resolveRef and classifies foreign endpoints as VALID (no issue), so the substrate certifies edges that its own derivation treats as nonexistent. Zero diagnostics on any derivation path. The 2026-05-31 identity spec designed the resolver wiring for validation (Phase J1, shipped) and foreign-aware status-consistency (§J3: compare-if-readable, warn-if-unreadable — NOT implemented); it contains no design for derivation over foreign endpoints. findReferences (raw Edge[] out) is the only edge-read surface preserving foreignness.",
	"evidence": [
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "889-892", "reference": "incompletePreds/unsatisfiedGates filter blockers through index.byRefname.has() against the ACTIVE index — foreign gate/dep endpoints silently dropped before the completeness check" },
		{ "file": "packages/pi-context/src/context.ts", "lines": "405-413", "reference": "normalizeEndpoint: foreign structured endpoint keys on bare refname (refname ?? oid), substrate_id discarded — the collision-aliasing root; endpointKey consumers cannot distinguish foreign from local/dangling" },
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "758-759", "reference": "derivedRollupComplete: unresolvable (foreign) member returns false — rollup never complete; shared by currentState gate satisfaction, the derived-status invariant, and reconcile/converge (index.ts:2704,2760), which WRITE the false derivation to stored status" },
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "2352-2353", "reference": "status-consistency invariant: foreign target skipped ('if (!otherLoc) continue'); comment claims edge-integrity handles it, but edge-integrity classifies foreign as valid (no issue) — the drift is checked nowhere. The 2026-05-31 identity spec §J3 designed compare-if-readable/warn-if-unreadable for exactly this site; unimplemented" },
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "2513-2557", "reference": "validateContext edge loop routes every endpoint through resolveRef: foreign → no issue. The substrate certifies foreign edges as valid while deriving as if absent — the split-brain is empirically demonstrated (blocked:[] + nextActions:[tA] + validate clean, with a declared status-consistency invariant, task gated on an OPEN foreign gap via a porcelain-written structured foreign endpoint)" },
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "1253", "reference": "joinBlocks edge mode resolves the counter-endpoint via active byRefname only; roadmap-plan.ts:340,345 likewise for phase/task rollup members; context.ts:1586-1638 walks emit bare refnames (foreign qualifier erased)" },
		{ "file": "analysis/2026-07-06-foreign-status-derivation-blindness.md", "reference": "investigation of record: mechanism trace, two-substrate empirical reproduction (fixture + pasted outputs, incl. the refname-collision mis-resolution and the both-members-complete milestone deriving planned), per-surface class inventory, prior-art sweep, resolution shapes" }
	],
	"impact": "Cross-substrate edges — the entire point of the v0.28.0 identity arc — carry no derived consequence anywhere: a foreign gate silently releases (false-ready enters nextActions and is composed into agent contexts), a foreign rollup member permanently pins its container incomplete AND reconcile/converge durably stamp that wrong status, declared invariants silently skip foreign targets, and a refname collision (expected across catalog-installed substrates) makes derivation read the WRONG substrate's status as the gate truth. validate certifies all of it clean, so no audit surfaces the divergence. Downstream two-substrate projects hit this on first real use.",
	"proposed_resolution": "Route every edge-consuming derivation join through registry-aware endpoint resolution (resolveRef / a resolveEndpointLoc(e) shim with the existing per-pass foreignCache) instead of endpointKey+active-byRefname: gate/dep predicates, derivedRollupComplete (the one seam converging currentState, the derived-status invariant, and reconcile/converge), status-consistency (implementing spec §J3's compare-if-readable/warn-if-unreadable), joinBlocks, roadmap rollups, walks (qualify foreign keys in output). In every variant: eliminate silent dropping (unresolvable-foreign degrades LOUDLY), split the dangling-vs-foreign conflation in the gate guard, and kill refname-collision aliasing (foreign keys must never collide onto local items). The foreign-resolution SEMANTICS — live cross-substrate status read vs derive-as-blocked-until-resolved vs flagged-exclusion — is a genuine design choice (freshness/cost/offline-substrate trade-offs) and lands as a DECISION first; requires-edge foreign-satisfaction is examined and decided in the same decision. Relates to FGAP-061 (same deriver, orthogonal kind-coverage axis), FEAT-011 (currency-by-construction: this is a currency hole its criteria do not cover), R-0009 D1 (template resolve() single-substrate — same class, rendering stack), DEC-0002/FGAP-002 (identity/provenance layer this consumption layer completes).",
	"created_by": "human/davidryan@gmail.com",
	"created_at": "2026-07-06"
}
```

Priority reasoning (P1, recommended at filing per convention): derived state is the substrate's operating truth — false-ready feeds nextActions and verbatim-composed agent contexts, reconcile/converge actively WRITE the wrong status, and validate certifies clean, so nothing downstream can catch it; the collision variant asserts affirmatively wrong truth, not just missing truth. Not P0: single-substrate projects (the overwhelming current usage) are untouched; the surface only activates once a second substrate is registered and cross-substrate edges are filed.
