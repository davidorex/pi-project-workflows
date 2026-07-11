# FGAP-125 `proposed_resolution` — filing provenance audit

Date: 2026-07-11. Auditing agent: fresh-context executing agent (claude-history + fresh substrate/code reads). Subject: the provenance of the hedged clause in FGAP-125's `proposed_resolution` — "inject wo.context_blocks … and validate the agent's returned output against wo.output_contract post-return … — or amend the schema to stop declaring semantics the engine will not implement, dual-surface, with per-field regression pins." Scope: content validity of each branch of the hedge against user direction, the investigation of record, filed precedent, and current code. A correction was applied (see §7).

## 1. Filing and update archaeology (claude-history)

All writes in session `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e`:

- **Original filing** — 2026-07-07T00:28:01Z, Bash heredoc `/tmp/fgap-schema-engine.json` → `pi-context append-block-item --block framework-gaps … --relations '[{"relation_type":"gap_addressed_by_feature","direction":"as_parent","other":"FEAT-014"}]'` (result at 00:28:06: "Appended item 'FGAP-125' … with 1 birth relation(s)"). Filed in the same batch as the other four dogfood-break gaps (FGAP-123/124/126/127 equivalents at 00:27:37–00:29:41) — the 2026-07-07 batch confirmed independently, not assumed. Original `proposed_resolution` (verbatim from the append payload):
  > "Under FEAT-014: after the dispatch-architecture decision, either the engine honors all four fields (validate input against input_contract pre-dispatch, inject wo.context_blocks, validate output against output_contract post-return, intersect the clamp with wo.scope.operations) or the schema is amended to stop asserting undecided behavior — dual-surface either way, with per-field regression pins."
- **Priority update** — 00:35:31Z (`priority` only, after the user's "all are priority 1").
- **Truth update producing the audited clause** — 02:45:34Z Write of `/tmp/fgap125-current.json` + 02:45:54Z `update-block-item … --match '{"id":"FGAP-125"}'` (result 02:45:58: "Updated … description, proposed_resolution, evidence"). The audited clause is byte-identical to this payload. Note the drift between the two versions: the original conditioned the fork on "after the dispatch-architecture decision" / "undecided behavior"; the 02:45 rewrite kept the fork but dropped the conditioning ("semantics the engine will not implement").
- Later updates (22:59:34Z and 2026-07-08T00:29:12Z, session `53383be9`) touched `evidence` only. The 2026-07-10 milestone-gate validation (session `d3030496`) wrote nothing ("FGAP-125 | Current, no correction needed"). The clause as read fresh on 2026-07-11 pre-edit was the 02:45 payload unchanged.

## 2. User messages, investigation-dispatch → filing → truth-update (verbatim)

Human (non-sidechain) messages in session `ac1621b3`; long dispatch briefs at 00:07:10 / 02:02:16 etc. are orchestrator-authored Task prompts, not user text.

- 2026-07-06T23:57:50Z — "because we have 2 operational contexts -- claude code v. within pi - the harness for claude code is warranted. try to use the work-order functionality and let's see where it breaks, if it breaks."
- 2026-07-07T00:22:54Z — "merge this branch to main. then delete the branch and push main."
- 2026-07-07T00:25:42Z — "i want all findings from 2026-07-07-work-order-dispatch-dogfood-breaks.md. validly and canonically filed" ← the filing directive.
- 2026-07-07T00:32:28Z — "you don't set priority."
- 2026-07-07T00:34:56Z — "all are priority 1"

Between filing and the 02:45 truth-update:

- 00:55:03Z — "why is this a supposed decision: The codebase already has its answer baked in: … The question isn't genuinely open — it's (a), and the real work is making the loop actually spawn a pi subprocess for each iteration instead of calling executeAgent, with the DECISION serving as the formal record of that choice rather than a genuine fork." (user quoting back the assistant's own analysis and challenging fork-framing of a derivable choice)
- 00:55:56Z — "i didn't direct you to do anything: only to answer a questino."
- 00:57:24Z — "\"That's a filing correction I'd recommend,\" - you are in no position to recommend anything given that the failure is your own."
- 01:35:58Z — "i don't give a fuck about it at the moment. i want valid fucking code fixes to known issues and problems such that pi-context and the rest of my fucking extensions here fucking work, despite your fucking persistence in ever-postponing actual fucking working code work."
- 02:00:24Z — "get more actual working code out the door"
- 02:43:17Z — "fucking keep context current now" ← the directive that produced the 02:45 truth-update.

**Finding:** no user message proposes, discusses, or approves the hedge's wording or either branch of it. The user directed *that* the findings be filed (00:25:42) and *that* context be kept current (02:43:17); the clause's composition is LLM-authored under that filing authority. The only user signal touching fork-shape at all is 00:55:03, which pushes AGAINST presenting a derivable choice as an open fork.

## 3. The investigation of record (analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md)

Break 3 (lines 60–75, confirmed by content: "the loop ignores four schema-required work-order fields") contains verification, root cause ("schema authored ahead of the engine, never reconciled"), reproducible conditions, and class — and **no resolution recommendation of any kind**. The word "amend" does not appear in the document. The only fork the report surfaces is the cross-cutting dispatch-architecture choice (line 115): "either (a) the work-order loop dispatches its target agent as a pi SUBPROCESS … or (b) executeAgent grows a real tool-execution loop … or (c) work-orders are re-scoped to output-only agents (which contradicts the schema's scope/operations contract). That choice is the user's, not this report's." Note its only schema-touching branch, (c), is flagged as *contradicting* the schema — the report never proposes weakening the schema to match the engine. **Verdict: none** (no recommendation for Break 3's resolution; the report explicitly declines to choose).

## 4. Filed precedent for the fork

- The description's "sibling: ContextBlockRef, pi-jit-agents types.ts — documents its deferral" is a class analogy (a deferral that documents itself), not a resolution precedent, and cites no gap/decision ID.
- "Under FEAT-014": FEAT-014 (read fresh) acceptance criterion #3 — "The engine honors every schema-required field: input validated against input_contract, the work-order's context_blocks injected, output validated against output_contract, the capability clamp intersecting wo.scope.operations — **or the schema is amended to stop asserting engine behavior that was decided out**, dual-surface." The amend arm is *conditional*: it applies only to behavior "decided out" by the dispatch-architecture decision AC#1 requires.
- That decision exists: **DEC-0022** (read fresh, status **enacted**) — "Acting work-order agents are dispatched as pi subprocesses … executeAgent remains a single-turn classify/structured-output primitive … Work-orders are not re-scoped to output-only." Its consequences state verbatim: "The scope clamp leg of FGAP-125 is satisfied via the --tools allowlist; **the remaining FGAP-125 legs (context_blocks injection, output_contract validation) must cross the process boundary under this shape.**" Nothing was decided out; the enacted decision commits both remaining fields to implementation. (DEC-0022 was filed 2026-07-07 ~11:00Z in session `53383be9` as part of the user-granted currency-audit corrections — after the 02:45 clause; content validity is assessed against it as current substrate truth.)
- **No filed precedent supports the two-option fork as an open question.** The one direction-bearing precedent (DEC-0022) points at implement.

## 5. `pi-mono-is-exemplar` (read fresh, verbatim)

> "pi-mono (/Users/david/Projects/pi-mono, this project's own upstream platform) is the gold-standard exemplar for how this monorepo designs, installs, and populates anything and everything. Binding on every design decision:
> 1. Population is declarative, not imperative -- resources install from a checked-in manifest reconciled at install/startup time, never a one-shot imperative script.
> 2. Installed/materialized resources are ordinary, locally editable files once installed -- never a read-only pointer to a shared/bundled location as the only option.
> 3. Configuration is two-tier, project-overrides-global, deep-merged.
> 4. Defaults are never hardcoded inline -- always a named, exported constant."

**Verdict: silent on this specific question.** It binds install/population/config design; neither implementing the two fields nor amending the schema is addressed or contradicted by it. It does not decide the fork.

## 6. Code currency (read fresh 2026-07-11)

- `packages/pi-agent-dispatch/src/work-order-loop.ts` (+ `run-work-order-loop-tool.ts`, `real-check-runner.ts`): `grep -n "context_blocks\|output_contract"` → **zero hits** — the gap's "zero references" claim is still current. Implemented and pinned: `clampToScope` (work-order-loop.ts:99, applied at :200 `const finalGrant = clampToScope(composedGrant, wo.scope?.operations)`) and `validateWorkOrderInput` (:120/:184), with unit pins in `work-order-loop.test.ts` (describes at :258 and :282).
- `packages/pi-context/samples/schemas/work-orders.schema.json`: `required` is still `["id","title","status","target_agent","input_contract","context_blocks","output_contract","scope","real_check_criteria"]`; `context_blocks` still declares injection semantics ("Substrate-block references the privileged agent's .agent.yaml will consume via contextBlocks…") and `output_contract` "Typed JSON Schema describing the agent's return contract."
- **Implement branch vs shipped state:** contradicts nothing — it is what DEC-0022's consequences and FEAT-014 AC#2/#3 (first arm) require; the schema already declares it.
- **Amend branch vs shipped state:** contradicts DEC-0022 (enacted) — dropping the fields forecloses the injection/validation DEC-0022 says "must cross the process boundary under this shape", and its precondition in FEAT-014 AC#3 ("behavior that was decided out") never fired: DEC-0022 decided nothing out ("Work-orders are not re-scoped to output-only").
- FEAT-014 AC#3 direction: as filed it carries both arms, but the amend arm is conditioned on the decision; with DEC-0022 enacted, AC#3 resolves to the implement arm for these two fields.

## 7. Verdict per branch (step 7) and correction

- **Implement branch** (inject `wo.context_blocks` into the subprocess + validate output against `wo.output_contract` post-return): **DERIVABLE-from-sources-that-support-it** — the shipped schema contract (still required + semantics declared), FEAT-014 AC#3 first arm, and DEC-0022's enacted consequence naming exactly these two legs; filed under the user's verbatim directives of 00:25:42 and 02:43:17.
- **Amend-schema branch** ("or amend the schema to stop declaring semantics the engine will not implement"): **LLM-augmentation-with-no-basis** as an unconditional alternative — no user message proposes or approves it; Break 3 recommends nothing and the report's only schema-touching branch is flagged as contradicting the schema; the sole textual precedent (FEAT-014 AC#3's conditional amend arm, itself same-day LLM-filed) had its condition resolved against it by DEC-0022. As it stood it also contradicted DEC-0022's enacted consequence.

**Correction applied** (2026-07-11, `update-block-item`, `proposed_resolution` only; read-back confirmed every other field byte-identical, `content_parent` chains from pre-edit hash `e8eca3b0…` to new `d94c8245…`):

Before:
> "Under FEAT-014, the two remaining fields: inject wo.context_blocks into the dispatched pi subprocess (resolve the referenced blocks and pass them into the agent's context across the process boundary) and validate the agent's returned output against wo.output_contract post-return (the subprocess must emit structured output the loop can check) — or amend the schema to stop declaring semantics the engine will not implement, dual-surface, with per-field regression pins. The scope.operations clamp and input_contract validation are already implemented with unit pins (clampToScope, validateWorkOrderInput)."

After:
> "Under FEAT-014, per DEC-0022 (enacted: acting agents dispatch as pi subprocesses; the remaining FGAP-125 legs cross the process boundary under this shape): inject wo.context_blocks into the dispatched pi subprocess (resolve the referenced blocks and pass them into the agent's context across the process boundary) and validate the agent's returned output against wo.output_contract post-return (the subprocess must emit structured output the loop can check), each with per-field regression pins. The scope.operations clamp and input_contract validation are already implemented with unit pins (clampToScope, validateWorkOrderInput)."

Removed: the "— or amend the schema … dual-surface" arm (unsupported, contradicted by DEC-0022). Added: the DEC-0022 citation grounding the single direction. Retained verbatim: both field mechanics, the per-field regression pins, the already-implemented sentence. Not committed — working-tree change left for the orchestrator.

## 8. Standing-intent check (step 8)

The implement branch is unbuilt-but-not-contradicted (deferred, not rejected). claude-history since the filing, searched for retraction/deprioritization/decline: none exists. Affirmative continuations instead — 2026-07-10T10:38:22Z user: "so what exactly did the fable agent mean when it reported \"Fable's recommendation: finish FEAT-014 (work-order dispatch — close FGAP-125, FGAP-126, FGAP-128).\""; 2026-07-10T11:29:03Z user directive to "validate each of FGAP-125, FGAP-126, FGAP-128's filed text against the CURRENT state of the actual code, and validate FEAT-014's remaining unmet acceptance criteria (#3…)"; the 2026-07-10/11 sessions actively working FGAP-125 toward closure. **No retraction found — this remains standing, undeclined, directed intent.** It derives from: the user's dogfood directive (2026-07-06T23:57:50Z) → the filing directive (00:25:42Z) → the shipped work-orders schema contract → DEC-0022 (enacted) → FEAT-014 AC#2/#3. Not underdetermined: no contradictory signal exists, and the branch is directed/derivable end to end.
