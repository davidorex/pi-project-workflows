# FGAP-124 proposed_resolution fork — filing provenance audit

Date: 2026-07-11. Investigating agent: fresh-context executing agent (claude-history + pi-context CLI reads + code reads; no substrate write made). Scope: provenance of the exact clause in FGAP-124's `proposed_resolution`:

> Decided under FEAT-014's dispatch-architecture decision: (a) dispatch acting agents as pi subprocesses (tools exist there; executeAgent stays the classify/structured-output primitive), (b) grow executeAgent a bound tool-execution loop, or (c) re-scope work-orders to output-only. Whichever is decided, the grant machinery must clamp a capability that actually exists on the dispatch path, and the WO-001 probe recipe becomes the regression pin.

Current stored text (`pi-context read-block-item --block framework-gaps --id FGAP-124 --json`, read 2026-07-11) is byte-identical to the quote above. FGAP-124 is closed; `closed_by` records option (a) shipped and verified (merge 8e2e764e). This audit judges the ORIGINAL fork as filed, not the closure.

## 1. Filing locus

- Session `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e`, 2026-07-07T00:27:37.617Z. One Bash tool call heredoc-writes `/tmp/fgap-jit-tools.json` and appends it: `pi-context append-block-item --block framework-gaps --arrayKey gaps --autoId true --item @/tmp/fgap-jit-tools.json --relations '[{"relation_type":"gap_addressed_by_feature","direction":"as_parent","other":"FEAT-014"}]' --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json` (tool description: "File gap: executeAgent no tools (Break 2)").
- The filed `proposed_resolution` in that payload is byte-identical to the clause under audit — it has never been reworded since filing.
- Same-burst context: FEAT-014's payload was written 26 seconds earlier (`cat > /tmp/feat-014.json`, 00:27:11.483Z, same session); the sibling gaps (FGAP-125 schema-engine 00:28:01, FGAP-126 non-interactive gate 00:28:36, FGAP-127 agents-tier 00:29:05, FGAP-128 confirm-default 00:29:41) and the research item r0029 (00:30:38) follow in the same burst. FGAP-124's birth relation targets FEAT-014, which therefore existed at append time.

## 2. User messages, investigation-dispatch → filing (session ac1621b3, verbatim)

- 2026-07-06T23:57:50.995Z: "because we have 2 operational contexts -- claude code v. within pi - the harness for claude code is warranted. try to use the work-order functionality and let's see where it breaks, if it breaks." — the investigation dispatch.
- 2026-07-07T00:20:29Z: `/model` local command (Set model to Fable 5) — no content bearing on the clause.
- 2026-07-07T00:22:54.577Z: "merge this branch to main. then delete the branch and push main."
- 2026-07-07T00:25:42.364Z: "i want all findings from 2026-07-07-work-order-dispatch-dogfood-breaks.md. validly and canonically filed" — the filing directive.
- (Post-filing, for completeness: 00:32:28.052Z "you don't set priority."; 00:34:56.338Z "all are priority 1".)

No user message proposes, discusses, or approves the three-way clause's wording. The user's directive is at the level of "file all findings from [the named report]" — the report is the directed source of the filed text.

## 3. The directed source report

`analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md`, read in full.

**Break 2** ("the dispatched agent had NO executable tools (highest-value finding)") is FGAP-124's own defect: root cause (executeAgent single-turn, `compiled.tools` consumed only by the grant clamp, DispatchContext has no implementation channel), the instrumented `toolsPassedToLLM: UNDEFINED` reproduction, and the class statement (line 54): "the class is 'in-process jit dispatch cannot execute tools; the grant machinery (composeToolGrant + GrantViolationError clamp) gates a capability that does not exist.'" Break 2 itself proposes no fix.

**The Cross-cutting section IS this gap's own source material for the fork.** Line 113: "Breaks 2, 3, and 5 are one architectural fact seen from three sides." Line 115, verbatim:

> A fix at the level of any single symptom (e.g. wiring scope.operations into the clamp) leaves the load-bearing defect (no tool execution) untouched. The decision the orchestrator faces is architectural: either (a) the work-order loop dispatches its target agent as a pi SUBPROCESS (the one place real tools exist — the same mechanism workflow steps use), keeping executeAgent for classify/structured-output surfaces; or (b) executeAgent grows a real tool-execution loop with bound implementations (a major scope change to a deliberately-minimal library); or (c) work-orders are re-scoped to output-only agents (which contradicts the schema's scope/operations contract). That choice is the user's, not this report's.

The "load-bearing defect (no tool execution)" the fork resolves is Break 2 — FGAP-124's defect — so the Cross-cutting fork is the report's own resolution discussion for this gap, not a separate topic. Recommendation count: **multiple options, zero single recommendation, deliberately** — the report names three options and explicitly defers the choice ("That choice is the user's, not this report's"). The gap's (a)/(b)/(c) is a near-verbatim condensation of this passage, including branch (a)'s parenthetical (subprocess = where tools exist; executeAgent stays classify/structured-output) and branch (c)'s scope-contract framing (carried by the report; the gap dropped the "(which contradicts…)" caveat but invented nothing).

The clause's tail is likewise sourced: "the grant machinery must clamp a capability that actually exists on the dispatch path" restates the Break 2 class statement (line 54); "the WO-001 probe recipe becomes the regression pin" matches FEAT-014's acceptance criterion "Regression: the probe recipe is a pinned test" (filed 26s earlier, same burst) and the report's standing-reproduction framing (lines 52, 105).

## 4. FGAP-008 sibling and the FEAT-014 decision reference

FGAP-008 (closed 2026-06-04) `proposed_resolution`, verbatim:

> Thread a writer/DispatchContext through the op-execution contract itself (a ctx/writer channel on OpDefinition.run + registerAll + the cli writer-injection) so every write op stamps uniformly — rather than per-op schema smuggling (the channel only promote-item / write-schema-migration / context-switch use today, and which context-archive declares-but-ignores). See DEC-0006.

FGAP-008's resolution is **unhedged** — one direction, with the rejected alternative named only to reject it. As precedent it neither mandates nor forbids a fork; it shows a single-direction resolution is the norm when one direction is supported. It points no direction among (a)/(b)/(c) — it is cited in FGAP-124's description purely as a structural analogy ("a contract lacking the channel its consumers assume"), which the source report itself made (line 54: "Note a structural sibling in FGAP-008 (closed)").

**"FEAT-014's dispatch-architecture decision" at filing time.** FEAT-014 existed 26 seconds before FGAP-124 (payload written 00:27:11.483Z; the birth relation `gap_addressed_by_feature → FEAT-014` succeeded at 00:27:37). FEAT-014's description states: "First decomposition step is a DECISION on the dispatch architecture (the underdetermined choice from analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md §cross-cutting): (a) … (b) … (c) …", and its first acceptance criterion: "The dispatch-architecture decision (subprocess vs executor tool-loop vs output-only re-scope) is filed as a decision before implementation." So the clause's "Decided under FEAT-014's dispatch-architecture decision" is a forward reference to a decision FEAT-014 mandated — not a claim an existing decision had resolved it. **DEC-0022 did NOT exist at filing time**: its append (`dec-dispatch-architecture.json`, relations `decision_derived_from_item` counter FGAP-124 + `decision_addresses_gap`) ran 2026-07-07T11:01:52–11:02:41Z in session `53383be9`, ~10.5 hours after FGAP-124; DEC-0022's own `context` field confirms: "Implementation shipped option (a) … without this decision being filed — surfaced by the 2026-07-07 currency audit; filed retroactively under user grant to record the enacted choice." The user grant in that session: 2026-07-07T10:57:17.586Z, verbatim: "\"or a subset.\" in what world is that an acceptable standard? what is the matter with you. do all. now."

## 5. pi-mono-is-exemplar

Read fresh; the convention's four binding principles, verbatim:

> 1. Population is declarative, not imperative -- resources install from a checked-in manifest reconciled at install/startup time, never a one-shot imperative script.
> 2. Installed/materialized resources are ordinary, locally editable files once installed -- never a read-only pointer to a shared/bundled location as the only option.
> 3. Configuration is two-tier, project-overrides-global, deep-merged.
> 4. Defaults are never hardcoded inline -- always a named, exported constant.

**Silent on this specific question.** It governs population/install/config/defaults design; it neither favors nor is contradicted by subprocess dispatch, an executeAgent tool loop, or output-only re-scoping. It is not cited as a tiebreaker here.

## 6. Code currency per branch

**Branch (a) — shipped and verified.** `packages/pi-agent-dispatch/src/work-order-loop.ts:169-225` `dispatchTargetAgent` spawns the subprocess: `const result = await runPiSubprocess({ cwd, model: modelSpec, tools: finalGrant, prompt: compiled.taskPrompt });` (`:201-206`), with the docblock (`:154-157`): "Dispatch the work-order's target agent as a `pi` subprocess — in-process dispatch can't execute tools (pi-jit-agents' executeAgent is a single-turn completion primitive binding none), so real tool execution requires a `pi` subprocess." `dispatch-loader.ts:31-33` wires the bundled builtin tier: `return { cwd, builtinDir: bundledDir("agents") };`. Matches FGAP-124's `closed_by`, DEC-0022's decision, and FEAT-014's acceptance criteria. Contradicts nothing.

**Branch (b) — never built; explicitly decided against.** `packages/pi-jit-agents/src/jit-runtime.ts` still makes exactly one completion call with no tool-execution loop: `response = await completeFn(dispatch.model as Model<Api>, context, options);` (`:573`), and the only tool ever attached is the phantom output-schema tool (`:567-571`: `if (compiled.outputSchema) { const phantomTool = buildPhantomTool(compiled.outputSchema); context.tools = [phantomTool]; … }`). DEC-0022 (status `enacted`), verbatim: "executeAgent remains a single-turn classify/structured-output primitive and is not grown a tool-execution loop." The shipped work-order-loop docblock codifies the same (`:11-15`). Branch (b) is superseded/rejected, not deferred.

**Branch (c) — never done; contradicted three ways.** (i) The work-orders schema's own `scope` contract (`pi-context read-schema --schemaName work-orders --path properties.work_orders.items.properties.scope`): "Bounds within which the agent may make edits / run commands. Used by the capability composer to clamp the agent's grant at dispatch." — acting capability is designed in; `scope` is a schema-required field. (ii) The source report flagged the contradiction at birth (line 115: "(which contradicts the schema's scope/operations contract)"). (iii) DEC-0022, verbatim: "Work-orders are not re-scoped to output-only." Shipped code now enforces the acting-scope contract against a real execution path (`work-order-loop.ts:99-103` `clampToScope` filtering the composed grant by `wo.scope.operations`).

## 7. Verdict per branch

- **Branch (a)**: DERIVABLE-from-a-source-that-supports-it — verbatim option (a) of the directed report's Cross-cutting fork (line 115), filed under the user's 00:25:42 directive to file all findings from that report. Subsequently the enacted choice (DEC-0022, FGAP-124 closed_by).
- **Branch (b)**: DERIVABLE-from-a-source-that-supports-it — verbatim option (b) of the same passage (the report itself carried the caveat "a major scope change to a deliberately-minimal library"). Not invented at filing.
- **Branch (c)**: DERIVABLE-from-a-source-that-supports-it — verbatim option (c) of the same passage; the report carried its own contradiction note, so filing it as a named-but-disfavored option reproduced the source faithfully.
- **The "Decided under FEAT-014's dispatch-architecture decision" frame**: DERIVABLE from FEAT-014 (same granted filing burst, 26s earlier), whose description and first acceptance criterion mandate exactly this decision. Not a fabricated qualifier.
- **The tail sentence** (clamp-must-be-real + WO-001 regression pin): DERIVABLE from the report's Break 2 class statement (line 54) and FEAT-014's regression acceptance criterion.
- **Nothing in the clause is LLM-augmentation-with-no-basis.** Unlike the FGAP-126 and FGAP-127 findings (invented "or"s), FGAP-124's fork is a faithful condensation of its directed source's own explicitly-user-deferred architectural fork ("That choice is the user's, not this report's").

## 8. Standing/underdetermined call for branches (b) and (c)

Not standing, and not underdetermined: both were **explicitly decided against** by DEC-0022 (status `enacted`, filed 2026-07-07T11:01Z under the user grant "do all. now." at 10:57:17Z): "executeAgent remains a single-turn classify/structured-output primitive and is not grown a tool-execution loop. Work-orders are not re-scoped to output-only." A claude-history sweep of user messages since the filing (FTS on executeAgent; user-message scan of the filing and decision sessions) finds no user message proposing, resurrecting, or separately directing branch (b) or (c) — nor needing to: the fork was never three standing directives, it was one mandated decision (FEAT-014 criterion 1) with three named options, and that decision was taken. DEC-0022 is the explicit contradictory signal per the audit's step-8 test; no FGAP-127-style still-open branch exists here.

## Correction

**None made.** The verdict is not LLM-augmentation; the gating condition for editing `proposed_resolution` is not met. The field is also historically coherent as it stands: it routes the choice to FEAT-014's mandated decision step, that decision now exists (DEC-0022, enacted, choosing (a)), the item is closed, and its `closed_by` records the enacted branch. No other field was touched; no substrate write was made by this audit.

Side observation (not acted on, outside mandate): FGAP-124's `description` still ends "hence P2 not P1" while `priority` is P1 — the user's post-filing "all are priority 1" (00:34:56Z) updated the field but not the description's trailing rationale.
