---
audit_group: intent-signals
description: David intent, corpus batch 3 (May29-Jun6)
source_agent: acd61fd6d37752956
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/acd61fd6d37752956.output
verbatim: true
---

Read all 1047 statements. The compaction-summary blocks (lines 34, 132, 343, 387, 460, 517, 641, 703, 746, 809, 942) are system-generated, not David's words — excluded. Below are the intent signals: statements expressing what he wants the project, code, or process to BE.

## 1. INTENT SIGNALS (verbatim, by ts)

- [2026-05-29T10:39:53Z] "the intention is NOT TO HAVE THEM IN WORKFLOWS" — architectural separation-of-concerns intent
- [2026-05-29T11:07:21Z] "what is the status of our non substrate context in terms of currency" → [2026-05-29T11:13:45Z is tactical] — (context: currency of non-substrate context is a standing concern)
- [2026-05-29T11:13:45Z] borderline — tactical
- [2026-05-29T11:07:21Z]…
- [2026-05-29T11:12:07Z] "nothing in claude.md should be staleable." (ts 2026-05-29T11:07:21 line 13) — standard: CLAUDE.md must not contain stale-able content
- [2026-05-29T11:21:58Z] "we don't need why a rule is there. just the rule." — standard: rules only, no rationale in canonical docs
- [2026-05-29T11:24:48Z] "handoff should say exactly where we are and what's next." — purpose definition for HANDOFF
- [2026-05-29T11:17:59Z] "quit saying \"awaiting direction.\" it's the fucking default state. quit trying to passively-seeming direct the show." — process norm: don't perform passive direction
- [2026-05-29T12:11:13Z] "with zero \"or\" statements in the plan. canonical resolution, no hedging, no \"out of scope\" hedging and degredation of my intention" — standard for plans
- [2026-05-29T23:26:01Z] "now let's file all new findings with zero hedging or scoping or decision making" — standard for filings
- [2026-05-30T01:06:10Z] "we need declarative statements, not performative raising of issues only to dismiss them in the same breath" — standard: no performative dismissal
- [2026-05-30T03:31:03Z] "our framing must be \"what will solve real problems now\"" — direction: real-problems-now filter
- [2026-05-30T03:37:44Z] "nothing that is derivable from other sources though - commits is duplication." — DRY / no-duplication standard
- [2026-05-30T04:31:49Z] "i'm suspicious of such things as ... which encode negative patterns uselessly" — standard: don't encode correction-narratives in filings
- [2026-05-30T04:42:53Z] "you should not be waiting for me to commit. i shouldn't have to babysit you on that." — process norm: commit proactively
- [2026-05-30T04:46:22Z] "there is no reason to leave claude.md dirty." — standard: keep CLAUDE.md committed/clean
- [2026-05-30T01:39:38Z] "it's time we start making use of the pi-context functionality" (line 82) — direction: adopt pi-context
- [2026-05-30T01:49:26Z] "we will not bulk add any. only as needed." — lazy-customization principle
- [2026-05-30T05:09:27Z] "our context switch family now gives us the ability to craft blocks and relations specifically scoped and shaped for a particular thing, from start to finish for the dev. i need you to see the pattern and apply it in your thinking ... we can even encode operational patterns in it." — vision for pi-context as the dev-management substrate
- [2026-05-30T04:08:03Z] "we need to elevate those scripts to a package in the monorepo; currently they are not portable" — direction: portability
- [2026-05-30T04:52:15Z] "we need a comprehesive how to doc until we have better help, for using pi-context from claude code side." — direction
- [2026-05-30T14:53:19Z] "there is a standing order not to keep stale-able derivable context on file." — standing standard
- [2026-05-30T23:23:42Z] "at most handoff should point to where and how to get current handoff status from context" — standard for HANDOFF
- [2026-05-30T23:43:22Z] "CLAUDE.md is a pointer. Update the factually wrong statements, and point to how to get packages intel." — role definition for CLAUDE.md
- [2026-05-31T01:42:34Z] "start from zero. the llm -- and you -- will find a way to negate my intentions and substitute your / their own if you have them read the existing spec." — protect-intent-from-LLM-substitution principle
- [2026-05-31T04:19:05Z] "you can't leave a spec that contains inaccurate or out of date info" — standard: specs must be current
- [2026-05-31T04:31:52Z] "asserting a negative only to dismiss it is pure noise." — standard (no performative negation)
- [2026-05-31T05:26:11Z] "i despise \"later....\" from llm's. they're never valid." — standard: no deferral
- [2026-05-31T05:53:55Z] "insisting on live demo of working state after each; no regressions; test success does not equal works" — verification standard
- [2026-05-31T06:00:01Z] "our canonical pipeline is plan mode / explore / write well scoped plan (no hedging deferall's \"out of scope\" invented) / impl / adverserial audit / demo." — the canonical process definition
- [2026-05-31T07:13:53Z] "no - no possible future enhancement. now." — standard: no deferral
- [2026-05-31T12:20:10Z] "commit everything. and also plan for fixing the block-api issue, not file" (borderline; contains "not file") — process
- [2026-05-31T13:39:58Z] "i prefer leaving zero debt especially when it's known" — no-debt standard
- [2026-05-31T21:53:53Z] "of course we fix all as you characterize" — no-debt / fix-all
- [2026-06-01T02:00:55Z] ".project is a NOT the framework; so we don't change the framework to account for .project. The script, yes: but pi-context is not .project." — framework-purity principle
- [2026-06-01T01:59:28Z] "the big goal: we can refer to elements in frozen .project in new context blocks that ARE canonically structured." — project goal
- [2026-06-01T02:08:30Z] "we remove this tool we're doing for .project specifically from the published package in the future." — direction: keep migration tooling out of the package
- [2026-06-01T02:43:32Z] "keep our triple-buffer concept and plan-mode rebuild of it as clean-emit (infer schemas from data, don't preserve source shapes)" — design standard
- [2026-06-01T11:11:59Z] "we are not updating .project. it is frozen." — invariant
- [2026-06-01T11:39:01Z] "valid process alone -- not you -- creates successful implementation that meets project goals." — process-primacy philosophy
- [2026-06-01T21:46:11Z] "i don't want claude.md carrying that handoff part" — CLAUDE.md scope standard
- [2026-06-02T13:05:11Z] "i don't want to have to update the cli when / if new things are added. i want it to be auto-updated such that cli commands track absolutely to code as it is" — binding CLI design constraint
- [2026-06-02T13:22:09Z] "relocate everything that is currently in the package that should not be ... it doesn't belong in the package source." — direction: package hygiene
- [2026-06-02T13:33:04Z] "scripts should not be being included in published package." — standard
- [2026-06-02T21:12:32Z] "non-blocking doesn't mean \"can be handwaved\"" — standard
- [2026-06-03T02:37:21Z] "process alone -- not you -- determines successful outcomes." (line 576) → and "i don't want or need self-referential records of your failures." — process-primacy + standard: don't record LLM-failure narratives
- [2026-06-03T09:33:06Z] "This is anti-mandates: Whether to harden the commit-guard now or accept the backstop is your scope call." — standard: no negligent accept-the-residual options
- [2026-06-03T11:19:25Z] "the agent itself didn't receive the mandates i require every subagent to adhere to so as not to return time-wasting crap." — standard: subagents must carry mandates
- [2026-06-03T22:50:32Z] "we don't need to remake git merging in pi-context. just a structure-aware merge/oid driver that allows pi-context to work in the context of a git merge" — scope/design direction
- [2026-06-03T23:06:58Z] "our goal is that the cli is the interface to doing whatever one needs to be able to do with pi-context, when not in pi. also you continue to use the useless bash echo and that is forebidden performance." — core CLI goal + forbidden-behavior standard
- [2026-06-04T11:24:03Z] "the canonical is plan mode -- explore -- write plan -- impl -- if error fix loop -- adverserial audit. process creates success. not ad-hoc llm throwing process out." — canonical process (restated)
- [2026-06-04T11:36:59Z] "using the cli is a) what i've directed repeatedly, and b) highly valuable for finding errors and gaps and issues" — direction + rationale for dogfooding
- [2026-06-04T11:41:07Z] "new mandatory process to be put in claude: an experience gap must be tasked with an agent to determine root cause / shape and provide intel and have reproducible conditions" — new process mandate
- [2026-06-04T12:07:38Z] "we leave no debt. this is not a question." — no-debt standard
- [2026-06-04T12:57:31Z] "ad-hoc is antipattern" — standard
- [2026-06-04T21:54:28Z] "let's survey other recent analysis md's... add the \"after analysis md file writing propose filing to research block to user\" so that hueristic is in claude.md" (line 744) — new heuristic to encode
- [2026-06-04T22:20:24Z] "do not bypass cli. we need cli usage feedback." — standard: drive the CLI directly
- [2026-06-04T22:58:07Z] "in-pi ops must not change; cli must work as cli without interfering with in-pi ops whatsoever; and capabilities of scripts must be enumerated such that cli side can be categorically in-parity." — design constraints
- [2026-06-04T22:36:26Z] "do NOT deviate from my required methods. It must be in Claude.md if it's not and you simply must adhere to it without execption." — process inviolability
- [2026-06-05T11:26:13Z] "also are readme's updated, both package and monorepo? that needs to be in canonical process when" — process requirement: README updates
- [2026-06-05T18:19:51Z] "don't we want to retire scripts in favor of cli commands?" — direction
- [2026-06-05T18:21:53Z] "we can't be wasting time on born-obsoletes, no?" — standard
- [2026-06-05T18:35:56Z] "all is organized around \"the operating target is real pi-context-cli\"" — orientation direction
- [2026-06-05T21:05:27Z] "there can be no thing done that isn't according to canonical process. canonical process including keeping .context exactingly accurately current must be followed for any implementation." — process inviolability + .context-currency invariant
- [2026-06-05T21:09:37Z] "you violated process. prior to filing, an agent scopes" — process rule
- [2026-06-05T22:26:43Z] "it shouldn't require me to tell you to commit after filing." — process norm: commit-after-filing
- [2026-06-05T23:29:06Z] "the intention for all .context filings and .context is to be a DRY context that is composed verbatim into subagent contexts. Writers of filings must clearly keep that audience and use in mind ... so that we do not produce garbage in / garbage out to subagents." — core purpose/standard for .context
- [2026-06-06T00:40:21Z] "i think tasks need to be more atomic. there've been multiple plans and such for one task." — standard
- [2026-06-06T00:46:35Z] "phase schema is going to need success criteria and tasks need success criteria not acceptance criteria; and both level's criteria must be binary outcome-based or invalid" — schema/design standard
- [2026-06-06T07:34:25Z] "we don't want .context to me an impossibly complex mental model to hold ... correctly modeled success criteria at each level simplifies upward" — design principle
- [2026-06-06T08:17:54Z] "polytropos. multiple no one single correct route of using pi-context. but in general planning CAN be done top-down ... done-ness does run bottom up. and probably the biggest organizer is going to be user stories." — design philosophy for the PM model
- [2026-06-06T08:25:33Z] "Block writes are for a future agent and the human who read them to orient and act. Write them terse, signal-dense, self-evident, and DRY. They are state records consumed downstream, not prose ... not narration, not handoff messages, not performative noise, not restatements of git or another live source." — block-writing rhetoric standard
- [2026-06-06T10:54:38Z] "add a headline rule framing the substrate as the PM system and that we are through use refining its usage ... Write every block for its consumers and its purpose, no more and no less. Write terse, signal-dense, self-containing ... Blocks are state and context atoms designed to be consumed downstream, not prose addressed to the a general audience." — framing (substrate = PM system) + block rhetoric standard
- [2026-06-06T11:50:48Z] "schema descriptions must include specific rhetorical demands / criteria for each block which can be used to validate upon writing via claude code hook." — design direction
- [2026-06-06T14:24:52Z] "the framework exists to allow for customization so we can't punish it if we update pi-context's sample pm schema set -- we need the entire blast radius" — framework purpose principle (protect user customizations)
- [2026-06-06T22:21:07Z] "a user can type pi-context --pi-bound and operate in pi with the agent bound by the extensions tools as they can now with the script" — feature goal
- [2026-06-06T23:13:38Z] "I want us to evaluate using branches for the feature work so we don't even run into the issue we had that led to needing to revert and spend huge time cleaning up" — process direction: feature branches
- [2026-06-06T23:16:31Z] "so it's a general heuristic, context-jit-spec-v2 being the first instance of the general rule." — process is a general rule, not one-off
- [2026-06-06T23:20:54Z] "We can't rely on llm's to know and read conventions." + "I prefer to think of it as something that happens at validation." — design principle: enforce conventions at validation, not by LLM diligence

Borderline (included per instruction rather than dropped):
- [2026-05-30T00:29:05Z] "be exactingly best practices in your invocation such that the agent returns written report with actual solutions and real-in-code (not fabricated hedging) issues" — invocation standard
- [2026-05-30T09:54:42Z] "add to proposed resolution that for each a count is given (you've seen x of y) as well as for reads give line numbers, not just kb." — feature-design intent (anti-truncation)
- [2026-05-30T03:52:17Z] / [2026-06-06T10:59:31Z] recurring "plain English / no walls / no loss of signal" — communication standard (see kinds)

## 2. EMERGENT INTENT KINDS (grown from the above)

1. **Canonical process definition & inviolability** — the pipeline (plan→explore→write-plan→impl→fix-loop→adversarial-audit→demo) is THE way, non-negotiable, a general rule. (~9; ex 2026-06-06T11:24:03Z-era, 2026-05-31T06:00:01Z, 2026-06-05T21:05:27Z)
2. **Anti-hedging / anti-deferral** — no "later", no "out of scope", no "or" options, no performative raise-then-dismiss. (~8; ex 2026-05-31T05:26:11Z)
3. **Zero debt / fix the whole class** — known debt is never left; non-blocking ≠ handwave. (~5; ex 2026-06-04T12:07:38Z)
4. **Context artifacts must be DRY, non-stale, derivable-not-duplicated** — CLAUDE.md, HANDOFF, memory, blocks. (~9; ex 2026-05-29T11:07:21Z "nothing in claude.md should be staleable", 2026-05-30T14:53:19Z)
5. **Block/filing rhetoric: terse, signal-dense, for downstream consumers** — filings are state atoms for subagents, not prose/narration. (~4; ex 2026-06-06T08:25:33Z, 2026-06-05T23:29:06Z)
6. **CLI as the single canonical interface / dogfood it / no bypass-glue / no bash-echo** — the CLI must do everything pi-context needs outside pi; drive it directly. (~7; ex 2026-06-03T23:06:58Z, 2026-06-04T22:20:24Z)
7. **Framework purity & customization purpose** — pi-context is not bent to .project; the framework exists to enable (and must protect) user customization. (~4; ex 2026-06-01T02:00:55Z, 2026-06-06T14:24:52Z)
8. **Design constraints on features/schemas** — auto-tracking CLI, binary outcome-based success criteria, machine-queryable milestones, low mental-model complexity, structure-aware merge driver. (~7; ex 2026-06-02T13:05:11Z, 2026-06-06T00:46:35Z)
9. **Process-autonomy norms** — commit proactively/after filing; don't await direction; scope before filing; subagents must carry mandates. (~6; ex 2026-05-30T04:42:53Z, 2026-06-05T22:26:43Z)
10. **No option-proliferation / no ranking / process-primacy over the LLM** — "process alone, not you, determines outcomes"; ranking is usurpation. (~4; ex 2026-06-03T02:35Z line 576, 2026-06-03 line 570)
11. **Protect user intent from LLM substitution** — don't let the LLM negate/substitute intentions (motivates start-from-zero, verbatim briefs). (~3; ex 2026-05-31T01:42:34Z)
12. **Communication standard: plain English, concise, no walls, answer the question** — pervasive (~20+ occurrences; representative 2026-06-06T10:59:31-era "plain english", 2026-06-03T22:53:04Z "less wall of text, no loss of signal", 2026-05-30T10:57:43Z "make it clearer, not more complicated")
13. **Project/migration goals** — frozen .project referenceable from canonically-structured new substrates; migration tooling excised from the published package. (~4; ex 2026-06-01T01:59:28Z, 2026-06-02T02:08:30Z)
14. **PM-model framing & authoring philosophy** — the substrate IS the PM system, refined through use; polytropos (no single correct route); done-ness bottom-up, planning any-direction, conventions enforced at validation. (~5; ex 2026-06-06T10:54:38Z, 2026-06-06T08:17:54Z, 2026-06-06T23:20:54Z)

Note: the batch is unusually intent-dense because it is a sustained build collaboration in which David repeatedly asserts standards; process/rhetoric norms dominate over one-off tactics.
