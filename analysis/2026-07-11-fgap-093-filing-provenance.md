# FGAP-093 hedge-clause filing provenance — forensic audit

Scope: the final sentence of FGAP-093's `proposed_resolution` — "Reconcile structured-endpoints.test.ts:288-310 (currently asserts dangling-append succeeds) as part of the change -- whether a legitimately forward-referencing append needs an explicit opt-out, or dangling is always a write error, is a genuine open implementation choice for the closing task." Question audited: is the opt-out-vs-unconditional-rejection fork genuinely undetermined by this project's own conventions/precedent, or resolvable from material the filer had and failed to apply? Read-only; nothing written except this report.

## VERDICT: genuinely-underdetermined-open-choice

Sub-classification: the clause is DERIVABLE in the transmission sense — it is carried nearly verbatim from the cited investigation MD's `proposed_resolution` section — and the fork it flags is a real, currently-undecided design choice that neither the user, the cited sources, nor the project's precedent resolves. It derives toward NEITHER branch. **No correction recommended.** The clause is not LLM augmentation and not a laundered laziness-fork; it is a faithfully transmitted, correctly flagged frontier for the closing task.

## 1. Filing locus

- Item read fresh 2026-07-11 (`pi-context read-block-item --block framework-gaps --id FGAP-093`): clause unchanged from the audit brief's quote. `created_at` 2026-06-14T07:17:10.372Z.
- Filing session: `8490e49a-7509-477f-9cb5-92f16552090a`. The append: `pi-context append-block-item --block framework-gaps --arrayKey gaps --autoId true --item @/tmp/fgap-dangling.json … # provenance-reviewed` at 2026-06-14T07:17:07.419Z (tool_executions, claude-history). Read-back 07:17:25, arc edges 07:17:46, `context-validate` 07:17:56, commit 07:18:22.
- An earlier "FGAP-093" (session `b62c055d`, 2026-05-22) is a different item in the retired `.project` substrate — unrelated.

## 2. User messages, investigation-dispatch → filing (verbatim, complete for the window)

All user text messages in the filing session between the surfacing of the gap and the append (claude-history `messages`/`message_content`, is_sidechain=0):

- 05:54:37 — "what does this mean: and how is scope my call and not determinable from process and context: - The write-time dangling-endpoint gap (TASK-062 probe): the validator doesn't reject a kind-violating edge whose offending endpoint doesn't exist; validateContext still catches it post-hoc. - The relation-graph completeness class (earlier audit): …"
- 05:55:26 — "that's not plain"
- 05:56:27 — "i can't tell from your obtuseness if these are new gaps or what"
- 05:56:59 — "what is the process for filing gaps"
- 05:57:20 — "what is the process for filing gaps. i'm asking so that you don't fuck up the process in your drive to create chaos and impede forward progress."
- 05:57:59 — "task 2 agents, one per" ← the investigation dispatch (one agent per candidate gap)
- 06:06:41 — "what needs to be done exactly and concisely: The only residual is a backfill task under FGAP-091 (write the missing edges), to be filed when you direct it — not a gap."
- 06:07:25 — "do so"
- 06:12:06 — "grant"
- 06:31:37 — "go on"
- 06:43:41 — "go"
- 06:52:06 — "file it in canonical process fully" ← the filing directive for this gap
- 07:16:46 — "go" ← the grant that produced the 07:17:07 append

**Finding: the user never discussed, proposed, or approved the opt-out-vs-unconditional fork.** Their instructions were dispatch ("task 2 agents, one per") and filing authorization ("file it in canonical process fully", "go"). The fork is not user-VERBATIM and not user-DIRECTED.

The grant-time provenance table (assistant message 2026-06-14T06:53:34) explicitly labeled the clause: "proposed_resolution (full parity: dangling + unregistered + cycle; the test-reconciliation flagged as an open implementation choice, not pre-decided) | DERIVABLE | investigation md §proposed_resolution; the open choice is a flagged frontier for the closing task, not augmentation." The user's "go" was given with that row visible — the hedge was disclosed at grant, not smuggled.

## 3. The two cited analysis MDs

- `analysis/2026-06-14-write-time-dangling-endpoint-gap-investigation.md` — its §proposed_resolution (line 95) contains the clause's source text: "Reconcile structured-endpoints.test.ts:288-310 … — decide whether a legitimately-forward-referencing append needs an explicit opt-out or whether dangling is always a write error." Its provenance note (line 97): "the 'always a write error vs. opt-out' reconciliation of the test is a genuine open implementation choice flagged for the task that closes this, not pre-decided here." Also line 74: "The catalog has no fixture exercising a legitimately-dangling-yet-desired append, so the test is the only known consumer of the current accept behavior." **Leaves the fork open, deliberately; recommends neither branch.**
- `analysis/2026-06-14-task-062-write-validator-adversarial-probe.md` — line 70: "Recommend the orchestrator decide whether write-time should additionally reject dangling endpoints (would close this gap; would also change the structured-endpoints.test.ts dangling-append behavior)." **Also leaves it open; recommends neither branch.**

The filed clause is a near-verbatim transmission of the investigation MD; the filing added no branch and pre-decided nothing the sources left open.

## 4. Precedent check — does FGAP-090/TASK-062 or FGAP-007/TASK-027 derive the answer?

- **TASK-062** (read fresh; completed): unconditional write-time rejection of kind-mismatched/unregistered edges, no opt-out flag; acceptance criteria demand write↔validate semantic agreement, with the presence-gate (unset kinds → unchecked) preserved.
- **FGAP-007/TASK-027** (read fresh; closed 2026-07-04, AFTER this filing): a bare ambiguous same-kind ordering append is REJECTED, "never auto-oriented," no opt-out; valid intent is expressed via the explicit role-typed `--primary/--counter` form.

Both precedents chose rejection — but both reject **permanently invalid** edges: a wrong-kind endpoint or a backwards orientation is never cured by a later write. A **dangling** endpoint is **transiently** invalid: filing the referenced item later makes the edge valid, so "append edge now, file item next" is a coherent workflow with no analogue in either precedent. The distinction is not hypothetical — the current code documents the affordance and a test consumes it:

- `resolveRelationSelector` doc, `packages/pi-context/src/context-sdk.ts` (~1608-1652 region, read 2026-07-11): bare-refname resolution "falls back to refname when unresolved so an edge to a not-yet-filed item is still expressible"; the foreign-alias branch likewise leaves oid=refname "so the endpoint round-trips … an unresolved foreign endpoint validates as a sentinel."
- `structured-endpoints.test.ts:288-310` (read fresh): still asserts the dangling FGAP-1→FGAP-2 append succeeds, with a comment noting the endpoints "dangle here … so the presence-gated kind check is skipped; registration is what passes."
- The write-guard code is unchanged since filing: `validateEdgeAgainstRegistry`'s JSDoc still declares dangling/unregistered "skipped for the kind check (endpoint-resolution failures are validateContext's own surface, not this helper's)."

So the precedents do NOT make "always reject" derivable: neither killed a documented, test-encoded expressibility affordance, and this fork is exactly about whether to kill one or gate it behind an explicit flag. That is a scope/value judgment about a breaking porcelain change — the category this project's own filing-provenance discipline says is "never derivable — a cited user decision or absent," and its plans-and-options rule says must not be laundered as derived.

Counter-weight, stated honestly: three signals lean toward "always a write error" — (a) FGAP-093's own goal sentence "so a write-accepted edge is always validate-clean" (an opted-out dangling write is not validate-clean); (b) no `pi-context` write op carries any validity opt-out flag today (grep of `ops-registry.ts` for force/allow/skip-style params: none); (c) validateContext flags `edge_endpoint_dangling` unconditionally at error severity. These make "always reject" the likely resolution, but leaning is not derivation: an explicit opt-out (parity-by-default with a disclosed escape hatch, cf. `--dryRun`'s explicit-mode pattern) is coherent with (a)–(c) read as defaults, and adopting or foreclosing it decides the fate of the documented forward-reference affordance. The closing task's plan (or a user decision) is the right locus, which is precisely what the clause says.

## 5. `pi-mono-is-exemplar`

Read fresh: its four binding rules (declarative population; installed resources locally editable; two-tier config; named exported defaults) are **silent** on write-time edge-validation strictness or opt-out flags. It does not bear on this fork.

## 6. Post-filing check (step 8)

- claude-history FTS + SQL sweep of all user messages after 2026-06-14T07:18 matching dangling/FGAP-093/opt-out: **no user statement resolves the fork.** The nearest touches: 2026-07-03 MILE-005 validity-gate audit judged FGAP-093 "VALID mechanism, STALE anchors (all context-sdk.ts anchors drifted ~+110–140; gap fully real today)" — hedge not flagged; 2026-07-08 user message quotes a derived decision to "decompose FGAP-093/085 into tasks and position them" — no branch chosen.
- `find-references --id FGAP-093`: only `gap_relates_to_gap` edges (FGAP-090, FGAP-007 as children; FGAP-101, FGAP-113 as parents). **No closing task filed yet**, so no task text has since resolved it either.
- Note (outside this audit's scope, already known): the item's `evidence[]` line anchors are stale per the 2026-07-03 audit; the hedge clause's own test anchor `structured-endpoints.test.ts:288-310` still matches the current test.

## RECOMMENDATION

None — no replacement text. The clause is grounded (carried from the cited investigation MD, disclosed in the grant-time provenance table, and consistent with the probe MD), and the fork is a genuine open implementation choice: the precedents cover only permanently-invalid edges, while this fork uniquely trades the filed parity invariant against a documented, test-consumed forward-reference affordance. Resolving it belongs to the closing task's plan approval or an explicit user decision, not to a filing correction.
