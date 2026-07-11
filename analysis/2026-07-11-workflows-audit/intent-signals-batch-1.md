---
audit_group: intent-signals
description: David intent, corpus batch 1
source_agent: af0b48d5a163bf8cb
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/af0b48d5a163bf8cb.output
verbatim: true
---

I read all 1047 statements in the batch. Below are the ones that are genuine INTENT SIGNALS — David's own words about what he wants the project, its architecture, its data, and its process to BE. Tactical/reactive/procedural lines are excluded. Where a statement is long, I quote only the intent-bearing sentence(s) verbatim with the ts.

## 1. INTENT SIGNALS (verbatim, ordered by ts)

- [2026-04-05T11:21:55Z] "we need a better durable generalized fix. plan it." — durability standard: fixes must be durable + generalized
- [2026-04-06T02:05:27Z] "we should not be tracking raw stats like that that require manual updating. raw stats that can be easily derived programattically are unncessary maintenance burden in docs." — doc-hygiene standard
- [2026-04-06T03:06:04Z] "why parse verdict and not constrain llm to valid output?" — structured/validated-output intent
- [2026-04-06T03:06:50Z] "can't it do thinking then produce a structured response we can validate as we validate other writes/outputs?" — structured/validated-output intent
- [2026-04-06T09:40:54Z] "will this be generalizable to agents in workflow as well? i don't want ad hoc non-architecturally aligned solutions." — architectural standard: no ad hoc solutions
- [2026-04-06T09:56:45Z] "the agent is not to preemptively make conclusions as to what is worthwhile or not." — agent-process standard
- [2026-04-06T10:21:41Z] "the idea i'm shooting for … is that agents are seen as composed tools that take context input and produce structured output, which itself then is composable later … this is for within pi first." — product vision: agents as composable tools
- [2026-04-06T11:45:34Z] "\"add a strong prompt\" -- as though llm's will not psychotically disregard it." — enforcement over prompting
- [2026-04-06T11:39:08Z] "why are we not requiring a specific shape of response" — structured/validated-output intent
- [2026-04-06T23:24:15Z] "monitors are simply agents, like workflow agents are … they have more in common with workflow agents then we are currently encoding." — vision: monitors ARE agents
- [2026-04-07T00:06:20Z] "the tuning must be able to be done on-the-fly, such that users and llm's can fine tune the monitors as a result of their enactments. that's the overarching goal of the entire extension here: the tool can be revised/reworked based on its actual use, live." — stated overarching goal
- [2026-04-07T00:14:05Z] "the vision of the project must be present in all its particulars, as in a fractal." — coherence standard
- [2026-04-07T01:59:37Z] "an artifact is any verifiable output from an agent/workflow: we're not building a coding agent framework but an outcome agnostic foundation framework. Artifact could be an updated spreadsheet; a lesson plan; research; etc." — product vision: outcome-agnostic foundation
- [2026-04-07T10:59:56Z] "i think an agent-core that lives within the monorepo because it's the clean architectural answer. \"path of least resistance\" is not intellectually rigorous or clean." — architectural standard
- [2026-04-07T11:18:15Z] "an agent can be composed not static and treated like a tool, as we're building towards here" — vision: composable (JIT) agents-as-tools
- [2026-04-07T11:21:22Z] "pi-jit-agents as the package name … as long as it is very architecturally clean and rational" — architectural standard
- [2026-04-07T11:47:21Z] "don't walk back the architectural separation we're going for. we don't want agents in workflows do we?" — architectural boundary intent
- [2026-04-08T21:45:55Z] "we must separate underlying framework from development artifacts." — architectural intent: framework vs artifacts
- [2026-04-08T21:47:38Z] "it is not true that the jit-agents boundary is not a real boundary." — asserts boundary as real
- [2026-04-09T10:12:46Z] "i want our concept of \"agents\" to be consistent and uniform. an \"agent\" is the same thing whether it be used as a monitor or used in and by workflows … all can be recreated using the generalized framework we are aiming for." — unifying vision
- [2026-04-13T22:25:19Z] "be far more concise in your responses, with zero loss of signal. perambulating responses only increase disclarity and cognitive load." — communication standard
- [2026-04-14T22:38:11Z] "ideally they can be structured in the way we are moving towards: not md but rather well structured json with schemas which writes can be validated against … such that entries can be atomically composed into prompts etc. downstream; such that they can be used as memory and context injection elements" — data-substrate vision
- [2026-04-15T22:28:07Z] "a: zero backward compatability. b: mandates-compliant proposals, e.g. never offer noise options that will never be chosen because of mandates." — standards: no back-compat debt, no noise options
- [2026-04-15T23:14:16Z] a string-form convention "encodes antipatterns." — anti-antipattern standard
- [2026-04-16T23:35:37Z] "part of what we need to do is not proliferate a taxonomy that itself becomes the major focus of congition and tokens but rather clarify (in the cooking sense)." — standard: reduce, don't proliferate
- [2026-04-16T23:40:44Z] "there is a difference between \"decisions made\" and \"a decision needs to be made.\" I'm not even sure of the need for llm agents to have \"decisions made\" since the evidence of decisions made is in the patterns of the codebase or in other context blocks that are forward looking constraints." — design/vocabulary intent
- [2026-04-17T23:06:56Z] "the real issue is your dangerous ignoring of existing mandates." — mandates-primacy standard
- [2026-04-18T00:04:44Z] "do not add any work files into package sources or dirs created by pi-project-workflows. all your working files must be in a tmp/ dir in the repo … do not pollute the packages with interim process files." — package-hygiene standard
- [2026-04-18T03:27:23Z] "we're evaling and validating the writing of the json; the validation of the content is a separate step. separation of concerns." — architectural standard
- [2026-04-24T23:14:37Z] "end result with no consideration of repeatable process is not a success metric. correctly working process is the prime success metric." — foundational process standard
- [2026-04-24T23:42:32Z] "be exceedingly constrained henceforth." — process guardrail
- [2026-04-24T23:44:06Z] "likely is not a word we use." — communication standard: no hedging
- [2026-04-24T23:44:33Z] "instead of speculating, determine. no state changes." — determinism standard
- [2026-04-25T00:05:11Z] "apply the statement \"memory is the residue of thinking\" … de-ephemeralize the ephemeral, so it can be recomposed into context." — memory/context vision
- [2026-04-25T01:50:44Z] "it should be in memory to not use background agents." — process guardrail
- [2026-04-25T03:04:02Z] "no pr's. rerespond. durable comprehensive fix." — durability standard
- [2026-04-26T00:58:52Z] "i aim for our monorepo to be as architecturally close to pi-mono in its philosophy as possible, to achieve desired functionality." — architectural allegiance to pi-mono
- [2026-04-26T02:52:06Z] "that's a crap solution. debug logs, not code investigation?" — standard: root-cause in code, not logging
- [2026-04-27T10:26:40Z] "There is no response without a tool call: the tool call is the response; the response is structured composable scored atomic context units that can be recomposed / reused / persisted." — synthesized vision
- [2026-04-27T11:15:54Z] "what code methods to avoid the wiki trap?" — anti-wiki-trap intent
- [2026-04-30T09:57:56Z] "which route leads to our project blocks being usable both by Claude Code and from within pi, such that we approach and build toward persisting / composable context for projects?" — persistent/composable-context goal
- [2026-04-30T10:37:59Z] "our model is pi-mono's approach to the greatest extent possible. our architecture isn't clean and minimal enough yet; it's not clarified well enough or concisely enough." — architectural standard
- [2026-05-01T01:32:10Z] "from the operating pattern that we share the pi philosophy of \"Primitives, not features\"" — design philosophy: primitives not features
- [2026-05-01T01:42:40Z] "the cost is worth the effect under the operational philosophy of atomically re-composability." — atomic-recomposability philosophy
- [2026-05-02T04:50:09Z] "no workarounds. correct durable complete solutions." — durability standard
- [2026-05-03T04:01:28Z] "context management is the most important current focus. our blocks are foundational to keeping track of where we are and what we know in a way that persists independent of llm session." — priority + vision
- [2026-05-03T10:14:18Z] "top-level configs for projects (which we'll likely need to re-name as pi-context) can itself be degree-zero an updatable yaml config schema as all else are schemas … an open nestable hierarchy, whereby one can add other nesting levels … and then names would be editable by users." — config-degree-zero vision
- [2026-05-03T12:11:16Z] "the heuristic we're developing can / should also govern what we currently call mandates.json as well as monitors. one heuristic for hierarchical context, writable and composable into prompts variably." — unifying vision
- [2026-05-03T14:46:53Z] (re work vs POC) — "how does the work relate to the poc" (borderline; excluded as tactical)
- [2026-05-03T23:44:18Z] "the goal is that llm's can create roadmaps and plans out of blocks. no hedging, no lame llm rejection or degradation." — stated goal
- [2026-05-04T02:22:18Z] "you don't make descisions." — process guardrail: LLM does not decide
- [2026-05-04T21:38:35Z] "to what extent can we have a config that articulates layer and display names a priori, shipped as a single file a user / llm edits … and whereby a display name change doesn't break anything related to block layer or relationships or atomic block content downstream" — naming-decoupled-from-identity vision
- [2026-05-04T21:46:57Z] "maybe we incorporate a raw engineering vocabulary and give each a display name that can be changed. llm and programmatic understandable, configurable for human." — encoded-name/display-name vision
- [2026-05-04T22:17:05Z] "i'm thinking that project management is a lens upon memory though" — reframe: PM as a lens on memory
- [2026-05-04T22:20:? / 22:26:16Z] "i don't want the various packages to be so split. that's proliferating too much. why would there not be what we have in pi-project renamed as pi-context, which is designed to give us the lenses we need and the block-api stuff we have for validated writing of and making use of the atomic context blocks?" — pi-context consolidation vision
- [2026-05-04T22:50:? / 22:20:1Z] "forget markdown packs. that's not the angle. our typed blocks are." — direction: typed blocks, not markdown
- [2026-05-06T22:36:45Z] "i'm leaning towards removing all code changes post the release … but only if all is correctly and well re-derivable from content blocks, analysis files, POCS, memory, and handoff." — re-derivability standard
- [2026-05-06T22:51:02Z] "be far less verbose with no loss of signal in your responses going forward. wall-of-text is not cognitive-load bearable." — communication standard
- [2026-05-08T11:30:34Z] "fix-forward will predictably continue llm chaos on top of already-created llm chaos. B represents opportunity to constrain llm's from their goal and purpose of compounding chaos and creating crap." — anti-chaos stabilization stance

Recurring guardrail (stated many times, one canonical quote each):
- [2026-05-02T00:07:26Z] "garbage in / garbage out. when creating agents you are responsible for their output." — LLM-ownership standard (also 2026-04-17T23:28, -04-17T23:56, -05-01T15:10, -05-02T00:07:55, -05-02T00:15:39, -05-02T08:14, -05-03T14:50, -05-03T15:10, -05-04T01:43)
- [2026-04-05T11:07:04Z] "\"likely\" is evidence of failure to do the requisite work" — anti-hedging (also -04-08T23:10 "There are likely more" = deficiency; -04-24T23:44)
- [2026-04-05T10:45:41Z] "you don't do anything without plan mode." — plan-mode-before-action standard (recurs throughout)
- [2026-04-06T05:20:08Z] "i despise lazy llm's. plan fixes so that the implementation is not lazy llm crap." — anti-lazy-LLM standard

## 2. EMERGENT INTENT KINDS (grown from what was selected)

1. **Product vision — what the framework fundamentally IS** (9): outcome-agnostic foundation, not a coding-agent framework; agents = composable typed tools; monitors ARE agents; PM is a lens on memory; the substrate is persistent composable context. Example ts: 2026-04-07T01:59:37Z.
2. **Architectural standards** (10): clean/rational/minimal, "as close to pi-mono philosophy as possible," no ad hoc / non-aligned solutions, uniform single agent concept, framework-vs-artifacts separation, don't over-split packages, separation of concerns. Example ts: 2026-04-06T09:40:54Z.
3. **Structured / schema-validated data & output** (5): constrain LLM to valid output; require a response shape; JSON+schema validated writes; atomically composable blocks. Example ts: 2026-04-06T03:06:50Z.
4. **Config degree-zero & naming decoupled from identity** (4): a shipped, user/LLM-editable config schema; encoded engineering names with changeable display names; nestable hierarchy; renames must not break downstream. Example ts: 2026-05-04T21:38:35Z.
5. **pi-context consolidation / memory substrate** (5): rename pi-project→pi-context; typed blocks (not markdown) as the memory substrate; de-ephemeralize thinking into recomposable context. Example ts: 2026-05-04T22:26:16Z.
6. **Documentation / memory hygiene** (4): no manually-maintained derivable stats; no stale or pointer-only docs; no unneeded historical context; keep memory current. Example ts: 2026-04-06T02:05:27Z.
7. **Process is the prime success metric** (2): a correct repeatable process outranks any end result. Example ts: 2026-04-24T23:14:37Z.
8. **Anti-LLM-degradation guardrails** (recurring, ~15+ instances): garbage-in/garbage-out ownership of subagents; no lazy LLM crap; no hedging/"likely"/option-proliferation; plan-mode before action; no background agents; no unauthorized state changes; LLM does not make decisions; constrain LLM chaos. Example ts: 2026-05-02T00:07:26Z.
9. **Communication standards** (3): concise with zero signal loss; no wall-of-text; never say "correct"; mandates-compliant. Example ts: 2026-04-13T22:25:19Z.
10. **Durability / no-debt standards** (5): durable generalized complete fixes; no workarounds; zero backward-compatibility; no "immediate" partial fixes; full re-derivability. Example ts: 2026-05-02T04:50:09Z.
11. **Live tunability** (1): the extension's stated overarching goal — tools revisable based on their actual live use. Example ts: 2026-04-07T00:06:20Z.
12. **Design philosophy borrowings** (2): "primitives, not features"; "atomic re-composability." Example ts: 2026-05-01T01:32:10Z.

Note: the batch is dominated by tactical/reactive turns; intent signals are a minority but are unusually dense in vision and standards because David repeatedly restates the framework's purpose and his non-negotiable process/communication norms. Many long statements in the batch are assistant analyses David pasted back for evaluation — those were excluded; only his own framing sentences within them were quoted.
