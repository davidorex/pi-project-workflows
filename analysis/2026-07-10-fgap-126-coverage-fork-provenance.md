# FGAP-126 filing provenance — the second `proposed_resolution` "or" (coverage-inconsistency clause)

Scope: this is the sibling investigation to `analysis/2026-07-10-fgap-126-filing-provenance.md`, which covered ONLY the first "or" in FGAP-126's `proposed_resolution` (the FGAP-068 caller-as-reconciler-shape vs pre-authorization-channel fork). That investigation explicitly scoped out the SECOND, separate "or" in the same field:

> "close the coverage inconsistency by gating the composite (run-work-order-loop) or routing its commit through the gated tool path."

This report applies the same method to that second clause.

## 1. FGAP-126, fresh read

`pi-context read-block-item --block framework-gaps --id FGAP-126 --json`, read at the start of this investigation: `status: "identified"` (still open, unaddressed). `proposed_resolution` verbatim, in full:

> "Under FEAT-014: apply the FGAP-068 caller-as-reconciler shape (the interactive orchestrator authors; non-interactive steps never need the gated ceremony) or give the pi-only gated tools an explicit pre-authorization channel equivalent to the CLI --yes, as a decision; close the coverage inconsistency by gating the composite (run-work-order-loop) or routing its commit through the gated tool path."

The clause under investigation here is everything after the semicolon.

Note the earlier report's footnote applies here too: an unrelated, differently-scoped FGAP-126 (context-init writer.kind enforcement) existed earlier, closed 2026-05-29 by VER-060, and was closed again by unrelated commits (`62a2d890`, `d51f4ce1`, `cf6fbec0` — all about that OLD FGAP-126 or a stale citation fix, not this clause). Out of scope; not relevant to the current FGAP-126's resolution text.

## 2. What the source investigation report says about this specific inconsistency

`analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md` (`git show 251dedbb:...`, still on disk, read in full). The gate-coverage inconsistency is documented in **Break 1**, subsection "Gate-coverage inconsistency (corollary)," verbatim in full:

> "The gate operates on tool NAMES at the `pi.on("tool_call")` boundary. `run-work-order-loop` is NOT in the gated set (auth-gate.ts:34 names call-agent / run-real-checks as deliberate pass-throughs; run-work-order-loop is likewise ungated) and it invokes the commit path as a LIBRARY call (`_internals.attestedCommit`, work-order-loop.ts:171), not via the gated `commit-attested` tool. Had the real-check passed, the `pi -p` run would have produced an attested commit with no operator confirm — while the far less consequential spec-authoring was refused. **The gate refuses the ceremony but not the composite that embeds the ceremony's effect.**"

That is the entire treatment of this specific inconsistency in the report. It states the problem — bolded, single sentence, no proposed fix attached. The findings table's Break-1 row repeats the same framing ("plus a gate-coverage inconsistency... ungated run-work-order-loop internally library-calls the commit the gated commit-attested tool protects") with no resolution column content for it (severity: "MED-HIGH — sanctioned authoring path unusable... forces hand-written bypass" — about Break 1's main finding, not this corollary specifically).

The report's "Cross-cutting" section proposes three lettered options (a/b/c) — but those are explicitly about the **tool-execution architecture** (Break 2 — dispatch as subprocess vs. grow executeAgent vs. re-scope to output-only), a completely different decision from the gate-coverage question. Nothing in that section, or anywhere else in the 280-line report, uses the words "gating the composite" or "routing... through the gated tool path," and nothing frames the coverage inconsistency as a two-option fork.

**Answer to the "one, two, or none" question: NONE.** The report identifies the inconsistency as a problem and proposes zero resolution options for it — not one, not two.

## 3. FEAT-014's own acceptance criterion for this inconsistency

FEAT-014 (`read-block-item --block features --id FEAT-014`, filed the same day, `status: "in-progress"`) has, as acceptance criterion #5:

> "Non-interactive runs report honest statuses (no environment default recorded as a human decision) and carry an explicit opt-in retry policy; **the gate-coverage inconsistency is closed (a composite op never embeds an effect its gated ceremony tool protects without the gate).**"

This is the closest thing to a citable resolution shape in the substrate, and it points in exactly ONE direction, not two: the effect (the commit) must pass through the gate somehow. It does not name "gating the composite" as an acceptable alternative shape — read literally, "a composite op never embeds an effect ... without the gate" is satisfied by routing the commit through the gate; it is NOT obviously satisfied by refusing the composite outright (see §4 — that would remove the effect's *availability*, not route it through the gate; and it collides with AC#2 below regardless).

## 4. claude-history check — did the user ever discuss this as two options?

Searched the filing session `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e` (spans 2026-07-03 to 2026-07-07, confirmed by cross-checking known verbatim anchors from the sibling report — "because we have 2 operational contexts," "i want all findings from 2026-07-07-work-order-dispatch-dogfood-breaks.md," "you don't set priority" — all present at their expected line offsets) for every user-authored (`type='user'`, `block_type='text'`) message, then grepped the full extracted text for: `gat(e|ing).*composite`, `routing.*commit`, `coverage inconsist`, `run-work-order-loop`, `commit-attested`, `gated tool path`, `composite`, `coverage`, and a bare `gat` prefix.

**Zero matches** for every one of those terms/phrases in any user message in that session. The only place "gating the composite... or routing its commit through the gated tool path" appears anywhere in claude-history at all is as a **verbatim quotation of the already-filed FGAP-126 field itself**, being re-read back in later sessions (`53383be9` on 2026-07-07, and this project's current session `d3030496` on 2026-07-10) — i.e., the phrase is only ever an artifact being cited, never a user proposal preceding the filing.

The three user-authored fix briefs found while searching for `run-work-order-loop` in that session (dispatching FGAP-128, FGAP-124, and part of FGAP-125 as implementation tasks) are all POST-filing engineering directives for OTHER gaps' fixes — none discusses the gate-coverage question or names two options for it.

**Conclusion: no user statement, in this session or any other indexed session, proposes or discusses "gating the composite" vs. "routing through the gated tool path" as distinct options.**

## 5. Independent technical assessment — is "gating the composite" even coherent given FEAT-014's shipped AC#2?

FEAT-014 acceptance criterion #2: *"A dispatched target agent can act: the WO-001 probe recipe (a work-order whose agent must write a file, verified by a runtime-demo real-check) passes end to end, non-interactively."*

This is not aspirational — `FGAP-124` (`read-block-item --block framework-gaps --id FGAP-124`) is `status: "closed"`, closed 2026-07-07, with an independently-reverified `closed_by` record: *"Verified end to end and re-run independently by the orchestrator with the artifact deleted first: runWorkOrderLoop against a fixture whose agent must write a file produced out.txt='FGAP-124-PROVEN', the deterministic runtime-demo real-check passed, final_status=completed."* AC#2 is shipped and verified, not merely proposed.

Reading the current code (`packages/pi-agent-dispatch/src/work-order-loop.ts`, read in full, post-FGAP-124/125/128 fixes):

- `runWorkOrderLoop` (the exported function backing the `run-work-order-loop` tool — "the composite") iterates: dispatch the target agent as a `pi` subprocess (`dispatchTargetAgent`, lines 169-225), run deterministic real-checks (line 247), and **only if `realCheck.passed`** call `_internals.attestedCommit` (lines 252-261) — a direct library call to `attestedCommit` from `./attested-commit.js`, never a `pi.on("tool_call")` dispatch of the named `commit-attested` tool. This is exactly the mechanism `auth-gate.ts` intercepts at (`pi.on("tool_call")`, per the source report) — a library call structurally never reaches that boundary, regardless of `hasUI`.
- The auth-gate's own mechanism (`auth-gate.ts:156-161`, per both reports) is a **whole-tool-call, unconditional refusal** when `ctx.hasUI === false` — it does not have (and nothing in this codebase has) a notion of gating one internal sub-step of a tool while letting the rest of that same tool call proceed. Gating is applied per tool NAME at the dispatch boundary.

Two readings of "gating the composite," worked through against that structure:

- **Reading (a) — add `run-work-order-loop` itself to `dispatchGatedTools`, the same unconditional-refusal mechanism the other 14 tools use.** This is the literal, most natural reading of "gating the composite ... the same way the auth-gate currently refuses the other tools." Under this reading, `run-work-order-loop` would refuse outright whenever `ctx.hasUI === false` — which is precisely the condition every `pi -p` / workflow-subprocess non-interactive run operates under. That refusal would make the loop unable to start non-interactively at all, which **directly un-ships and contradicts FEAT-014's own AC#2** — the very capability FGAP-124 built and the orchestrator independently re-verified end-to-end. This reading is self-contradictory with shipped, verified state.
- **Reading (b) — gate only the commit sub-step inside the loop, not the loop's ability to start/iterate.** This would let non-interactive dispatch + real-check continue to work (preserving AC#2) and refuse only at the point a commit would be produced without a gate. But nothing in `auth-gate.ts` implements sub-tool-call-boundary gating today — it is a new, undesigned mechanism, not an application of "the same way the auth-gate currently refuses the other tools" (that mechanism is whole-tool-call only). And functionally, a hypothetical sub-step gate on "the commit inside the loop" is not distinguishable in effect from the clause's OTHER branch, "routing its commit through the gated tool path" — both describe making the commit itself subject to the same authorization the `commit-attested` tool enforces. Under this reading the "or" is not two alternatives; it is one fix described twice.

**Plain verdict on coherence:** the clause as worded presents "gating the composite" and "routing its commit through the gated tool path" as if they were two mutually exclusive architectural options — but the only reading of "gating the composite" that is structurally distinct from the second branch (reading (a), whole-tool refusal via the existing mechanism) is self-contradictory with FEAT-014's own already-shipped, independently-verified AC#2. The reading that avoids that contradiction (reading (b)) collapses into being the same fix as the second branch. There is no version of "gating the composite" that is simultaneously (i) actually different from "routing the commit through the gated tool path" and (ii) compatible with the non-interactive end-to-end operation FEAT-014 already shipped and verified.

## 6. Provenance verdict

Using the project's three-class framework (user-VERBATIM / user-DIRECTED / LLM-augmentation-with-no-basis / DERIVABLE-from-a-cited-source):

**LLM-augmentation-with-no-basis.**

- Not user-VERBATIM: zero matches for any phrasing of this clause, or its substance, in any user message across the filing session or any other indexed session (§4).
- Not user-DIRECTED: the user's only instruction in the filing session was "file all findings, validly and canonically" (per the sibling report, §2) — a completeness/process directive, not a content directive naming two resolution options for this inconsistency.
- Not DERIVABLE: the only two candidate sources are the investigation report (§2) and FEAT-014's own AC#5 (§3). The report states the problem and proposes **zero** resolution options for it. FEAT-014's AC#5, if it points anywhere, points toward routing the effect through the gate ("never embeds an effect ... without the gate") — it does not name or support "gating the composite" as a coordinate alternative. Neither source supports a two-option fork.
- Independently (§5): one of the clause's two branches, read the way the clause's own parenthetical invites ("gating the composite ... the same way the auth-gate currently refuses the other tools"), is not a neutral architectural option at all — it would revert FEAT-014's shipped, independently-reverified AC#2 (non-interactive end-to-end completion). Presenting it coordinate with the other branch as if both were equally live choices is not just unsourced, it is technically unsound on the current shipped state of the code.

This is the same pattern the sibling report found for the first "or" in this same field: an unhedged, single-direction problem statement in the source material, converted at filing time into a symmetric "or ... as a decision" framing with no basis in either the investigating agent's findings or the cited precedent (here, FEAT-014's own AC#5) — and, in this second clause's case, with one of the two presented options being independently identifiable as incompatible with what the project has since shipped and verified.
