# Intent spec — David's intent atoms (disposition reference)

Consolidated from the six intent-signal batches (2026-03-13 → 07-11). Each atom's core is a verbatim David quote + ts. This is the trustworthy criterion set a work atom or project state is judged against ("is the project what David wants"), not a backlog. Where the record shows an intent shifted, the atom carries an `evolution` note with both quotes; latest governs but is not silently applied.

## Groups (kinds of intent)
- GROUP-IN-01: Product vision / north star — atoms: ATOM-IN-01..07
- GROUP-IN-02: Data architecture — JSON source of truth, schemas not human-facing — atoms: ATOM-IN-08..11
- GROUP-IN-03: Derive-from-code / auto-tracking / no stale-derivable content — atoms: ATOM-IN-12..16
- GROUP-IN-04: Context substrate as ground truth / de-ephemeralization / zero-loss persistence — atoms: ATOM-IN-17..22
- GROUP-IN-05: Canonical process & iterate-to-zero — atoms: ATOM-IN-23..29
- GROUP-IN-06: Directive / execution fidelity — atoms: ATOM-IN-30..34
- GROUP-IN-07: Anti-hedging / anti-deferral / anti-laziness — atoms: ATOM-IN-35..40
- GROUP-IN-08: Real verification, not theatre — atoms: ATOM-IN-41..45
- GROUP-IN-09: Durability / zero-debt — atoms: ATOM-IN-46..50
- GROUP-IN-10: Agent conduct mandates — atoms: ATOM-IN-51..56
- GROUP-IN-11: Communication / rhetorical register — atoms: ATOM-IN-57..63
- GROUP-IN-12: Architecture standards — atoms: ATOM-IN-64..74
- GROUP-IN-13: Harness confinement / capability model / CLI-only — atoms: ATOM-IN-75..81
- GROUP-IN-14: Schema & data-model semantics + vocabulary — atoms: ATOM-IN-82..93
- GROUP-IN-15: Mechanistic enforcement over trust — atoms: ATOM-IN-94..100
- GROUP-IN-16: Provenance & hygiene (commit / git / package / docs) — atoms: ATOM-IN-101..106
- GROUP-IN-17: Bias to working code over ceremony (late) — atoms: ATOM-IN-107..110
- GROUP-IN-18: Governing quality metric — best-of-breed / superior UX — atoms: ATOM-IN-111..112
- GROUP-IN-19: Anti-relitigation — atoms: ATOM-IN-113
- GROUP-IN-20: Authority / role boundaries — atoms: ATOM-IN-114..117
- GROUP-IN-21: Monitors design intent — atoms: ATOM-IN-118..122
- GROUP-IN-22: Method fidelity & discovery / induction — atoms: ATOM-IN-123..126
- GROUP-IN-23: Porting fidelity to wasc — atoms: ATOM-IN-127..128

## Atoms

### ATOM-IN-01 — Developer-independence (axe-handle philosophy)
- group: GROUP-IN-01
- intent (verbatim): "If pi-project-workflows is done right, users need not wait for developers to implement changes that they find through use that they need. The use of the tool shows you the shape of how to make the version of the tool that you want." [2026-03-24T22:33:27.754Z]
- recurrence: dominant vision of batch 0; restated at [2026-03-15T23:51:04.933Z] "apps don't need to wait for a PR to be accepted or a developer to release an update", [2026-03-18T09:39:17.077Z], [2026-03-18T10:07:58.660Z], [2026-03-18T21:38:58.658Z] "we ship a working product but a user+llm need not wait for requested changes from developer or forking or create PR".

### ATOM-IN-02 — Outcome-agnostic foundation framework, not a coding-agent framework
- group: GROUP-IN-01
- intent (verbatim): "an artifact is any verifiable output from an agent/workflow: we're not building a coding agent framework but an outcome agnostic foundation framework. Artifact could be an updated spreadsheet; a lesson plan; research; etc." [2026-04-07T01:59:37Z]
- recurrence: identity reasserted at [2026-04-04T09:07:27.039Z] "we are trying to create a foundational framework", [2026-04-04T01:06:10.578Z] "this is a harness".

### ATOM-IN-03 — The project exists to produce a WORKING pi-context, not to file
- group: GROUP-IN-01
- intent (verbatim): "i want more than just filings. this is not a project to file things. it is to create a fully functioning pi-context and to use it." [2026-07-02T11:36:20]
- recurrence: batch 5; anchors the late working-code bias (see GROUP-IN-17).

### ATOM-IN-04 — pi-mono philosophy is the gold-standard north star
- group: GROUP-IN-01
- intent (verbatim): "our model for our installation and population of any and everything is pi itself. a golden north star of this project must be that we use pi-mono's philosophy as gold-standard exemplar." [2026-07-11T00:12:47]
- recurrence: pervasive across all batches — [2026-03-17T10:41:37.250Z] "canoncially pi-mono organizing style ... as close as possible", [2026-04-26T00:58:52Z], [2026-04-30T10:37:59Z], [2026-04-03T22:35:13.304Z] "profoundly canonically pi project philosophy".

### ATOM-IN-05 — Live tunability is the overarching goal
- group: GROUP-IN-01
- intent (verbatim): "the tuning must be able to be done on-the-fly, such that users and llm's can fine tune the monitors as a result of their enactments. that's the overarching goal of the entire extension here: the tool can be revised/reworked based on its actual use, live." [2026-04-07T00:06:20Z]
- recurrence: single canonical statement; consonant with ATOM-IN-01.

### ATOM-IN-06 — Main context is the user's control panel
- group: GROUP-IN-01
- intent (verbatim): "the main context is the control panel for the functionality of all 3 packages at the service of the user, to extend, adjust, change." [2026-03-18T20:24:39.387Z]
- recurrence: [2026-03-18T20:26:56.800Z] "the user also must be able to say 'validate that workflow'".

### ATOM-IN-07 — Agents are composable typed tools (context in → structured output out)
- group: GROUP-IN-01
- intent (verbatim): "the idea i'm shooting for … is that agents are seen as composed tools that take context input and produce structured output, which itself then is composable later … this is for within pi first." [2026-04-06T10:21:41Z]
- recurrence: [2026-04-07T11:18:15Z] "an agent can be composed not static and treated like a tool", [2026-04-27T10:26:40Z] "the tool call is the response; the response is structured composable scored atomic context units".

### ATOM-IN-08 — JSON is the source of truth; MD only rendered
- group: GROUP-IN-02
- intent (verbatim): "no optional human readable md. json as source of truth. md can be rendered if wanted out of json." [2026-03-15T00:16:56.996Z]
- recurrence: [2026-03-15T02:55:15.237Z] "the pattern of json being the source of truth", [2026-03-18T09:39:17.077Z] "json always being the source of truth and md's never a source of truth but rather a rendered artifact".

### ATOM-IN-09 — JSON schemas are not human-readable
- group: GROUP-IN-02
- intent (verbatim): "zero json schemas are intended to be human readable. if the human wants to know something they ask the agent." [2026-03-18T20:49:13.203Z]
- recurrence: consistent with the machine-vs-human display standard (ATOM-IN-60).

### ATOM-IN-10 — Schema is the enforcement boundary, not metadata
- group: GROUP-IN-02
- intent (verbatim): "schema defines shape → agent produces to shape → validator enforces shape → next step consumes typed fields... They're not metadata — they're the enforcement boundary." [2026-03-16T22:55:37.451Z]
- recurrence: single canonical articulation.

### ATOM-IN-11 — Constrain the LLM to valid structured output; don't parse loose text
- group: GROUP-IN-02
- intent (verbatim): "why parse verdict and not constrain llm to valid output?" [2026-04-06T03:06:04Z]
- recurrence: [2026-04-06T03:06:50Z] "can't it do thinking then produce a structured response we can validate", [2026-04-06T11:39:08Z] "why are we not requiring a specific shape of response".

### ATOM-IN-12 — Derive docs from code, don't hand-maintain
- group: GROUP-IN-03
- intent (verbatim): "rather than having claude.md have and need handwritten updates, why don't we point instead to programmatic ways of deriving the info, so we don't have to keep updating" [2026-03-15T23:06:51.500Z]
- recurrence: [2026-05-30T23:43:22Z] "CLAUDE.md is a pointer."

### ATOM-IN-13 — Generate skills/SDK from the codebase, not by hand
- group: GROUP-IN-03
- intent (verbatim): "i don't want the skill narrative updated. i want the skill to be generated from the codebase as indicated." [2026-04-04T10:53:03.914Z]
- recurrence: [2026-03-17T21:38:50.414Z] "skill.md as not a by-hand written document but rather a derived and composed document ... created likely during the build process".

### ATOM-IN-14 — SDK/validator auto-track the code as it evolves
- group: GROUP-IN-03
- intent (verbatim): "ideally both would programmatically surface and structure from actual code, such that ... the sdk and validator automatically keep pace and are correct and current." [2026-04-04T22:45:52.364Z]
- recurrence: [2026-03-15T22:29:22.506Z] "we add something later, it shows up in the sdk", [2026-03-15T22:50:46.154Z] "a derived state from command / at query time".

### ATOM-IN-15 — CLI commands auto-track code (no manual CLI updating)
- group: GROUP-IN-03
- intent (verbatim): "i don't want to have to update the cli when / if new things are added. i want it to be auto-updated such that cli commands track absolutely to code as it is" [2026-06-02T13:05:11Z]
- recurrence: single binding constraint.

### ATOM-IN-16 — No stale-able / derivable content on file
- group: GROUP-IN-03
- intent (verbatim): "nothing in claude.md should be staleable." [2026-05-29T11:12:07Z]
- recurrence: strong — [2026-04-06T02:05:27Z] "raw stats that can be easily derived programattically are unncessary maintenance burden", [2026-05-13T05:58:12.461Z] "we should not be tracking any derivable stat", [2026-05-30T14:53:19Z] "standing order not to keep stale-able derivable context on file", [2026-05-30T03:37:44Z] "nothing that is derivable from other sources ... is duplication", batch4 [00:49:06] "nothing stupidly immediately stale like '45 open gaps'".

### ATOM-IN-17 — .context is the single source of de-ephemeralized composable context
- group: GROUP-IN-04
- intent (verbatim): "there is one source of de-ephemeralized structured composable context, and that is .context." [batch4, 04:04:59]
- recurrence: [2026-05-13T21:47:11.449Z] "the context blocks must be the ground truth and entrance for any llm into the entirety of project context".

### ATOM-IN-18 — De-ephemeralize thinking (memory is the residue of thinking)
- group: GROUP-IN-04
- intent (verbatim): "apply the statement \"memory is the residue of thinking\" … de-ephemeralize the ephemeral, so it can be recomposed into context." [2026-04-25T00:05:11Z]
- recurrence: batch4 [10:53:57] "capturing intel and context when it happens and not having it exist in an ephemeral purgatory state".

### ATOM-IN-19 — Zero-loss persistence: a fresh session must be fully reconstructable
- group: GROUP-IN-04
- intent (verbatim): "rule must be that after each step, exact context can be known were a fresh session to start" [2026-05-11T21:45:30.827Z]
- recurrence: [2026-05-20T21:49:15.165Z] "process + state ... exactly preserved for zero-loss persistence", batch4 [12:44:37] and [00:54:02] "a new session must have zero ignorance about this project and its current status."

### ATOM-IN-20 — The whole substrate bootstraps from config/schemas/macros; shape arises from use
- group: GROUP-IN-04
- intent (verbatim): "the real goal is that from config / schemas / macros the entirety can be bootstrapped and enacted for a wholly different conception of blocks and layers and relations ... the memory shape arises out of user's / lmm's use of the tool and needs." [2026-05-13T22:57:04.162Z]
- recurrence: [2026-05-12T09:37:49.707Z] "atomic context elements can be composed via extension tools into jit agents".

### ATOM-IN-21 — Memory is not context (distinct substrata; PM is a lens on memory)
- group: GROUP-IN-04
- intent (verbatim): "memory is not context" [2026-05-25T22:02:19.290Z]
- recurrence: [2026-05-04T22:17:05Z] "project management is a lens upon memory".

### ATOM-IN-22 — Filings are DRY context composed verbatim into subagent contexts
- group: GROUP-IN-04
- intent (verbatim): "the intention for all .context filings and .context is to be a DRY context that is composed verbatim into subagent contexts. Writers of filings must clearly keep that audience and use in mind ... so that we do not produce garbage in / garbage out to subagents." [2026-06-05T23:29:06Z]
- recurrence: connects to block-rhetoric standard (ATOM-IN-59) and garbage-in/garbage-out (ATOM-IN-100).

### ATOM-IN-23 — The canonical pipeline (the ONLY valid path)
- group: GROUP-IN-05
- intent (verbatim): "our canonical pipeline is plan mode / explore / write well scoped plan (no hedging deferall's \"out of scope\" invented) / impl / adverserial audit / demo." [2026-05-31T06:00:01Z]
- recurrence: dozens — [2026-05-23T00:04:39.469Z] "our invariant method is plan mode --> explore agent --> plan", [2026-06-04T11:24:03Z] "process creates success. not ad-hoc llm throwing process out", batch4 [23:04:11] "the only way to create successful implementations per task", [2026-07-07T23:42:57] "fucking use the canonical process and iterate to fucking zero."

### ATOM-IN-24 — Process-primacy: valid process, not the LLM, creates success
- group: GROUP-IN-05
- intent (verbatim): "valid process alone -- not you -- creates successful implementation that meets project goals." [2026-06-01T11:39:01Z]
- recurrence: [2026-06-03T02:37:21Z] "process alone -- not you -- determines successful outcomes", batch4 [04:15:39] "PROCESS FUCKING MATTERS." (repeated 9x), [2026-04-24T23:14:37Z] "correctly working process is the prime success metric."
- evolution: earlier the process was framed as the end and prime metric — [2026-04-24T23:14:37Z] "end result with no consideration of repeatable process is not a success metric. correctly working process is the prime success metric." Later the process is subordinated to producing working code and measured by best-of-breed output — [2026-07-08T23:21:26] "substrate management does not take precedence over producing valid best of breed project canonical working code" and [2026-07-07T22:23:46] "far too much blind stupid bureaucratizing without balance of cost v. benefit." The canonical pipeline is NOT abandoned late ([2026-07-07T23:42:57] "use the canonical process and iterate to fucking zero"); what shifts is that process is in service of working code, not an end in itself. Latest governs (see GROUP-IN-17).

### ATOM-IN-25 — Iterate-to-zero, bounded by validated success criteria
- group: GROUP-IN-05
- intent (verbatim): "make sure that a step includes validating the success criteria. the success criteria drive the iterate to zero, so it is not unbounded." [2026-07-09T22:47:47]
- recurrence: batch4 [08:32:45] "iterate to zero", [06:15:37] "a loop until no violation of any requisite criteria with zero tolerance."

### ATOM-IN-26 — No action without plan mode
- group: GROUP-IN-05
- intent (verbatim): "you don't do anything without plan mode." [2026-04-05T10:45:41Z]
- recurrence: recurs throughout as the pipeline's first gate.

### ATOM-IN-27 — Explore / scope before filing
- group: GROUP-IN-05
- intent (verbatim): "canonize explore before file" [batch4, 03:46:35]
- recurrence: [2026-06-05T21:09:37Z] "prior to filing, an agent scopes".

### ATOM-IN-28 — Ad-hoc work outside process cannot be trusted
- group: GROUP-IN-05
- intent (verbatim): "the simple fact is that i cannot trust ad hoc work done outside of process." [2026-05-23T01:30:15.809Z]
- recurrence: [2026-06-04T12:57:31Z] "ad-hoc is antipattern", [2026-03-19T09:53:29.660Z] "we don't just jump in to implementation without thinking things out."

### ATOM-IN-29 — An experience gap must be tasked to an agent for root cause + reproducible conditions
- group: GROUP-IN-05
- intent (verbatim): "an experience gap must be tasked with an agent to determine root cause / shape and provide intel and have reproducible conditions" [2026-06-04T11:41:07Z]
- recurrence: new process mandate; consonant with query-before-enumerate (ATOM-IN-88).

### ATOM-IN-30 — Absolute directive fidelity: no invention, augmentation, omission, or deviation
- group: GROUP-IN-06
- intent (verbatim): "zero jugement calls. absolute adherence to clearly stated valid non augmented non deviating directives that exactly transmit my stated intention." [2026-06-21T11:57:25]
- recurrence: the single most-repeated standard in the corpus — [2026-03-13T09:26:35.826Z] "don't dare deviate and screw up my code", [2026-06-21T10:42:37] "restrain yourself from any invention or chaos causing maltransmissions of my exact intent", [2026-06-21T22:25:07] "do not change it or alter it or deviate and do not fuck up my intentions again", batch4 [01:05:47] "without augmentation deviation or in any way changing what I just agreed to", [08:00:27] "strip all inanities. leave exactly what I've asked for as my intent", [22:28:07] "executed as I state it without omission or augementation".

### ATOM-IN-31 — Add nothing it does not say; omit nothing it does say
- group: GROUP-IN-06
- intent (verbatim): "Add nothing it does not say; omit nothing it does say." [batch4, 19:11:11]
- recurrence: crisp restatement of ATOM-IN-30.

### ATOM-IN-32 — No scope fragmentation / no sidecar
- group: GROUP-IN-06
- intent (verbatim): "do not deviate. no sidecar. that 'or' is odious scope fragmentation." [batch4, 01:41:35]
- recurrence: batch4 [01:42:39] "fix all three — no sidecar anywhere".

### ATOM-IN-33 — Strict scope discipline; no unrequested reduction or overreach
- group: GROUP-IN-06
- intent (verbatim): "removing anything not directly related to the bug is a tortious overstep" [2026-03-28T01:16:20.275Z]
- recurrence: [2026-03-13T10:02:55.529Z] "you must quit ad hoc chaos", [2026-04-01T10:41:46.740Z] "don't ever present things needlessly reducing scope again. add to issues."

### ATOM-IN-34 — Start from zero to protect intent from LLM substitution
- group: GROUP-IN-06
- intent (verbatim): "start from zero. the llm -- and you -- will find a way to negate my intentions and substitute your / their own if you have them read the existing spec." [2026-05-31T01:42:34Z]
- recurrence: motivates on-disk verbatim briefs — [2026-07-10T23:17:45] "so that ... the orchestrating agent's ability to deviate augment invent etc. is lessened" (see ATOM-IN-96).

### ATOM-IN-35 — No "or" / no hedging; canonical resolution in plans
- group: GROUP-IN-07
- intent (verbatim): "with zero \"or\" statements in the plan. canonical resolution, no hedging, no \"out of scope\" hedging and degredation of my intention" [2026-05-29T12:11:13Z]
- recurrence: [2026-05-08T11:45:40.477Z] "'either'? hedging bullshit is not a 'plan'", [2026-05-09T01:03:48.270Z] "so many 'or' statements = you are being lazy".

### ATOM-IN-36 — "likely" is evidence of failure to do the work
- group: GROUP-IN-07
- intent (verbatim): "\"likely\" is evidence of failure to do the requisite work" [2026-04-05T11:07:04Z]
- recurrence: [2026-04-24T23:44:06Z] "likely is not a word we use", [2026-04-24T23:44:33Z] "instead of speculating, determine."

### ATOM-IN-37 — No deferral / no "later" / no "future enhancement"
- group: GROUP-IN-07
- intent (verbatim): "i despise \"later....\" from llm's. they're never valid." [2026-05-31T05:26:11Z]
- recurrence: [2026-05-31T07:13:53Z] "no - no possible future enhancement. now", [2026-05-27T22:51:59.148Z] "you identified a valid possible need then deferred it" (wrong).

### ATOM-IN-38 — Anti-lazy-LLM: no quick/simple/easiest/minimal unless it is best
- group: GROUP-IN-07
- intent (verbatim): "durable architecturally solid solutions, nothing quick, simple, easiest, if it's not best." [2026-03-29T00:49:02.157Z]
- recurrence: [2026-03-18T22:20:07.846Z] "i don't want the lame lazy llm 'do the minimal thing'", [2026-04-06T05:20:08Z] "i despise lazy llm's", [2026-05-27T13:14:38.779Z] "i don't want anything minimal. that's llm crap talk", [2026-03-27T12:34:52.341Z] "why would you offer the simpler option. how is that best practices."

### ATOM-IN-39 — No performative raise-then-dismiss; declarative statements only
- group: GROUP-IN-07
- intent (verbatim): "we need declarative statements, not performative raising of issues only to dismiss them in the same breath" [2026-05-30T01:06:10Z]
- recurrence: [2026-05-31T04:31:52Z] "asserting a negative only to dismiss it is pure noise."

### ATOM-IN-40 — No noise options that mandates guarantee will never be chosen
- group: GROUP-IN-07
- intent (verbatim): "never offer noise options that will never be chosen because of mandates." [2026-04-15T22:28:07Z]
- recurrence: consonant with anti-option-proliferation (ATOM-IN-74).

### ATOM-IN-41 — Passing tests ≠ meeting working intention
- group: GROUP-IN-08
- intent (verbatim): "passing tests does not equal meets working intention." [2026-05-10T11:31:27.647Z]
- recurrence: [2026-04-04T02:37:28.637Z] "your test coverage so far is crap. tests pass. things don't work", [2026-05-31T05:53:55Z] "test success does not equal works".

### ATOM-IN-42 — Live runtime demonstration after each step
- group: GROUP-IN-08
- intent (verbatim): "better yet would be demonstrations that the code does what it needs to, for each step … we cannot open ourselves to spending implementation and testing time only to find things don't work because llm's do performance." [2026-05-10T11:38:06.225Z]
- recurrence: [2026-05-31T05:53:55Z] "insisting on live demo of working state after each; no regressions".

### ATOM-IN-43 — Validation must verify correctness, not mere existence
- group: GROUP-IN-08
- intent (verbatim): "that \"validation\" was not actual validation but rather simply seeing if a file existed, not that it was correct -- is a tendency of llm's." [2026-03-29T02:03:16.118Z]
- recurrence: [2026-03-29T02:04:38.079Z] "file existence = valid for important gates is not controlling".

### ATOM-IN-44 — Real validation, not fake validation
- group: GROUP-IN-08
- intent (verbatim): "essentially we need the capability that you as orchestrator here have to validate not fake validate." [2026-05-24T23:04:03.852Z]
- recurrence: [2026-05-15T23:22:54.787Z] "a mirror mirrors. it does not alter."

### ATOM-IN-45 — Adversarial validation + demonstration of intended functionality
- group: GROUP-IN-08
- intent (verbatim): "adverserial validation and verification and DEMONSTRATION of intended functionality." [2026-04-04T01:31 (931)]
- recurrence: [2026-04-04T02:36:42.496Z] "establishing working verification not just theatre tests".

### ATOM-IN-46 — Durable, generalized, complete fixes; no workarounds
- group: GROUP-IN-09
- intent (verbatim): "no workarounds. correct durable complete solutions." [2026-05-02T04:50:09Z]
- recurrence: [2026-04-05T11:21:55Z] "we need a better durable generalized fix", [2026-05-03T04:01:28Z]-era "durable comprehensive fix", [2026-05-08T11:30:34Z] "fix-forward will predictably continue llm chaos".

### ATOM-IN-47 — Leave zero debt; fix the whole class, don't file it
- group: GROUP-IN-09
- intent (verbatim): "we leave no debt. this is not a question." [2026-06-04T12:07:38Z]
- recurrence: [2026-05-31T13:39:58Z] "i prefer leaving zero debt especially when it's known", [2026-07-07T21:03:28] "i want the class level fix enacted, not filed."

### ATOM-IN-48 — Zero backward compatibility
- group: GROUP-IN-09
- intent (verbatim): "zero backward compatability." [2026-04-15T22:28:07Z]
- recurrence: single canonical statement.

### ATOM-IN-49 — Root-cause in code, not logging or proxies
- group: GROUP-IN-09
- intent (verbatim): "that's a crap solution. debug logs, not code investigation?" [2026-04-26T02:52:06Z]
- recurrence: batch4 [01:08:23] "do not make the same mistake of using proxies alone."

### ATOM-IN-50 — Non-blocking does not mean handwave-able
- group: GROUP-IN-09
- intent (verbatim): "non-blocking doesn't mean \"can be handwaved\"" [2026-06-02T21:12:32Z]
- recurrence: [2026-06-03T09:33:06Z] rejects "accept the backstop is your scope call" as anti-mandates.

### ATOM-IN-51 — Never end a response with a question to the user
- group: GROUP-IN-10
- intent (verbatim): "ensure to say \"Do not end your response with a question to the user.\"" [2026-03-13T09:23:46.486Z]
- recurrence: [2026-03-14T06:56:43.420Z] "why are you asking me questions in violation of mandates", [2026-05-10T22:15:11.963Z] "never trail off and never end with a question."

### ATOM-IN-52 — Answer the question; do not act
- group: GROUP-IN-10
- intent (verbatim): "when i ask a question, answer it. get your negligent tortious overactivity under control." [2026-03-28T01:18:12.239Z]
- recurrence: single canonical statement.

### ATOM-IN-53 — Commit proactively; don't await direction; don't perform passive direction
- group: GROUP-IN-10
- intent (verbatim): "you should not be waiting for me to commit. i shouldn't have to babysit you on that." [2026-05-30T04:42:53Z]
- recurrence: [2026-06-05T22:26:43Z] "it shouldn't require me to tell you to commit after filing", [2026-05-29T11:17:59Z] "quit saying \"awaiting direction.\" it's the fucking default state."

### ATOM-IN-54 — The LLM does not make decisions
- group: GROUP-IN-10
- intent (verbatim): "you don't make descisions." [2026-05-04T02:22:18Z]
- recurrence: connects to authority atoms (GROUP-IN-20) and derivability (ATOM-IN-116).

### ATOM-IN-55 — The agent does not self-judge risk
- group: GROUP-IN-10
- intent (verbatim): "you do not on your own determine that something is low risk." [2026-05-29T06:47:37.535Z]
- recurrence: single canonical statement.

### ATOM-IN-56 — The agent does not preempt conclusions about what is worthwhile
- group: GROUP-IN-10
- intent (verbatim): "the agent is not to preemptively make conclusions as to what is worthwhile or not." [2026-04-06T09:56:45Z]
- recurrence: single canonical statement.

### ATOM-IN-57 — Concise, zero signal loss, no walls of prose
- group: GROUP-IN-11
- intent (verbatim): "be far more concise in your responses, with zero loss of signal. perambulating responses only increase disclarity and cognitive load." [2026-04-13T22:25:19Z]
- recurrence: pervasive — [2026-05-06T22:51:02Z] "wall-of-text is not cognitive-load bearable", [2026-05-10T22:15:11.963Z] "Bullet points, not prose blocks", batch4 [10:29:34] "high signal, low flourishes", batch4 [00:15:32] "at most 1 or 2 sentences."

### ATOM-IN-58 — Don't pollute the user's cognition with unasked-for noise (codified)
- group: GROUP-IN-11
- intent (verbatim): "Don't pollute user's cognition with unasked for noise. Do not waste tokens and mental space relating performative noise... Do not make any statements designed to create any impression in the user's mind, including 'make the work look considered.' Do not interfere with the user's cognitive focus." [2026-07-09T12:19:26]
- recurrence: [2026-07-08T22:32:06] "do not pad with unasked for cognitive noise", [2026-07-08T07:22:17] "your job is not to overwhelm cognitive load of user but to HELP CLARIFY, not proliferate fog."

### ATOM-IN-59 — Block/filing rhetoric: terse, signal-dense, for downstream consumers
- group: GROUP-IN-11
- intent (verbatim): "Write them terse, signal-dense, self-evident, and DRY. They are state records consumed downstream, not prose ... not narration, not handoff messages, not performative noise, not restatements of git or another live source." [2026-06-06T08:25:33Z]
- recurrence: [2026-06-06T10:54:38Z] "Blocks are state and context atoms designed to be consumed downstream, not prose addressed to the a general audience", batch4 [10:19:56] "it's a statement of atomic context."

### ATOM-IN-60 — Machine-readable identity vs human display are separate
- group: GROUP-IN-11
- intent (verbatim): "the machine readable part … one thing and human display another" [2026-05-13T21:20:04.153Z]
- recurrence: [2026-05-04T21:46:57Z] "raw engineering vocabulary and give each a display name that can be changed. llm and programmatic understandable, configurable for human."

### ATOM-IN-61 — Code comments in plain English; no opaque harness jargon
- group: GROUP-IN-11
- intent (verbatim): "all code in the repo similarly has all opaque jargon removed and comment semantics in code-valid plain english." [2026-07-10T01:05:21]
- recurrence: [2026-07-09T23:56:58] "a pre-commit hook that flags the use of such harness jargon in any code comment ... opaque and useless and noise."

### ATOM-IN-62 — Canonical docs carry the rule, not its rationale
- group: GROUP-IN-11
- intent (verbatim): "we don't need why a rule is there. just the rule." [2026-05-29T11:21:58Z]
- recurrence: single canonical statement.

### ATOM-IN-63 — Forbidden bash-echo "performance"
- group: GROUP-IN-11
- intent (verbatim): "you continue to use the useless bash echo and that is forebidden performance." [2026-06-03T23:06:58Z]
- recurrence: single canonical statement.

### ATOM-IN-64 — Clean/rational architecture over path of least resistance
- group: GROUP-IN-12
- intent (verbatim): "\"path of least resistance\" is not intellectually rigorous or clean." [2026-04-07T10:59:56Z]
- recurrence: [2026-04-30T10:37:59Z] "our architecture isn't clean and minimal enough yet", [2026-04-07T11:21:22Z] "as long as it is very architecturally clean and rational".

### ATOM-IN-65 — No ad-hoc, non-architecturally-aligned solutions
- group: GROUP-IN-12
- intent (verbatim): "will this be generalizable to agents in workflow as well? i don't want ad hoc non-architecturally aligned solutions." [2026-04-06T09:40:54Z]
- recurrence: [2026-05-25T19:02:25.298Z] "expediency is never a valid consideration".

### ATOM-IN-66 — Separate the framework from development artifacts
- group: GROUP-IN-12
- intent (verbatim): "we must separate underlying framework from development artifacts." [2026-04-08T21:45:55Z]
- recurrence: [2026-04-04T09:29:07.195Z] "you have not separated framework from workflows created as incremental demonstrations", [2026-05-25T22:01:44.806Z] "zero existing workflows are to be considered targets ... they are nothing but legacy workflows development artifacts."

### ATOM-IN-67 — Workflows are not agents (architecture separation)
- group: GROUP-IN-12
- intent (verbatim): "pi-workflows is not agents. jit-agents and agent dispatch are agents." [2026-05-29T10:29:20.920Z]
- recurrence: [2026-04-07T11:47:21Z] "we don't want agents in workflows do we?", [2026-05-25T19:02:25.298Z] "workflow is workflow. jit-agents are agents."

### ATOM-IN-68 — "Agent" is one uniform concept whether monitor or workflow
- group: GROUP-IN-12
- intent (verbatim): "i want our concept of \"agents\" to be consistent and uniform. an \"agent\" is the same thing whether it be used as a monitor or used in and by workflows … all can be recreated using the generalized framework we are aiming for." [2026-04-09T10:12:46Z]
- recurrence: [2026-04-06T23:24:15Z] "monitors are simply agents, like workflow agents are".

### ATOM-IN-69 — Don't over-split packages; consolidate
- group: GROUP-IN-12
- intent (verbatim): "i don't want the various packages to be so split. that's proliferating too much." [2026-05-04T22:26:16Z]
- recurrence: motivates pi-project→pi-context consolidation.

### ATOM-IN-70 — Primitives, not features; atomic re-composability
- group: GROUP-IN-12
- intent (verbatim): "from the operating pattern that we share the pi philosophy of \"Primitives, not features\"" [2026-05-01T01:32:10Z]
- recurrence: [2026-05-01T01:42:40Z] "the operational philosophy of atomically re-composability."

### ATOM-IN-71 — The vision must be present in every particular (fractal); local decisions through the vision lens
- group: GROUP-IN-12
- intent (verbatim): "the vision of the project must be present in all its particulars, as in a fractal." [2026-04-07T00:14:05Z]
- recurrence: [2026-04-04T09:54:17.072Z] "local decisions like this must be seen through the lens of project vision."

### ATOM-IN-72 — Only the main-context orchestrator authors spec/schema; no self-authoring
- group: GROUP-IN-12
- intent (verbatim): "no agent would author itself. the only agent that can author spec/schema is main context orchestrator. the others never even know the thing exists." [2026-05-25T20:27:06.843Z]
- recurrence: single canonical statement.

### ATOM-IN-73 — Framework purity: don't bend the framework to .project; protect user customization
- group: GROUP-IN-12
- intent (verbatim): ".project is a NOT the framework; so we don't change the framework to account for .project. The script, yes: but pi-context is not .project." [2026-06-01T02:00:55Z]
- recurrence: [2026-06-06T14:24:52Z] "the framework exists to allow for customization so we can't punish it".

### ATOM-IN-74 — Reduce and clarify; do not proliferate taxonomy
- group: GROUP-IN-12
- intent (verbatim): "part of what we need to do is not proliferate a taxonomy that itself becomes the major focus of congition and tokens but rather clarify (in the cooking sense)." [2026-04-16T23:35:37Z]
- recurrence: [2026-05-15T23:44:12.432Z] "30+ Pi tools + ~5 commands is over engineered noise." Also separation of concerns — [2026-04-18T03:27:23Z] "we're evaling and validating the writing of the json; the validation of the content is a separate step."

### ATOM-IN-75 — Zero non-harnessed LLM possibilities
- group: GROUP-IN-13
- intent (verbatim): "Our premise will be: zero non-harnessed llm possibilities. Every action will only be through extension provided tools and jit-agents / workflows." [2026-05-10T02:19:27.201Z]
- recurrence: constitutional premise of the harness.

### ATOM-IN-76 — A subagent is a constrained tool call: composed context, no perms, no tools by default
- group: GROUP-IN-13
- intent (verbatim): "A subagent is a tool call by the main context agent that carries relevant atomic context chunks composed into the shape of a prompt. … No perms. No tools. Configs and schemas and macros bring all into existence from empty state. The human stays in the loop by authorizing the config and its mutations …" [2026-05-24T09:39:08.180Z]
- recurrence: single constitutional statement.

### ATOM-IN-77 — The CLI is the single interface outside pi; no bypass
- group: GROUP-IN-13
- intent (verbatim): "our goal is that the cli is the interface to doing whatever one needs to be able to do with pi-context, when not in pi." [2026-06-03T23:06:58Z]
- recurrence: [2026-06-04T22:20:24Z] "do not bypass cli. we need cli usage feedback", batch4 [05:51:11] "using no bypasses from the pi-context cli", [2026-06-04T22:58:07Z] "cli must work as cli without interfering with in-pi ops whatsoever."

### ATOM-IN-78 — Only in-pi + CLI are the routes; no scripts
- group: GROUP-IN-13
- intent (verbatim): "we need no scripts; is this persisting a regression? scripts are off the table. only in-pi + cli are the routes" [batch4, 23:47:06]
- recurrence: [2026-06-05T18:19:51Z] "retire scripts in favor of cli commands", [2026-06-02T13:33:04Z] "scripts should not be being included in published package."

### ATOM-IN-79 — Constrain agents to substrate/CLI; no raw file reads; never read-all-or-nothing
- group: GROUP-IN-13
- intent (verbatim): "you must correctly constrain the agent. i refuse to see '    Bash(cat .pi-context.json)'" [batch4, 01:09:50]
- recurrence: [2026-05-24T23:10:57.789Z] "we need read-invidual-elements ... we should never leave an llm so they have read-all or nothing; and it should be DRY coded", [2026-05-25T09:42:35.335Z] "there should be no bad route available."

### ATOM-IN-80 — CLI use is required to surface experience gaps and frictions (dogfooding purpose)
- group: GROUP-IN-13
- intent (verbatim): "the value is in requiring the use of the cli to find experience gaps and frictions… an explore on a gap must identify and surface if the gap being explored is a class of a more general thing." [batch4, 09:55:13]
- recurrence: [2026-06-04T11:36:59Z] "highly valuable for finding errors and gaps and issues."

### ATOM-IN-81 — Executive tools for the main agent are auth-gated (human auth, not human-only)
- group: GROUP-IN-13
- intent (verbatim): "i want some tools made available to the main context agent but require auth by the user, so that the agent can't just write itself to omnipotent non-constrained state … The main agent must in certain circumstances be the executor of user's directed executive actions." [2026-05-28T21:37:35.438Z]
- recurrence: [2026-05-29T02:01:20.246Z] "better is \"with human auth\" and the main agent has the tool. that should be the general heuristic."

### ATOM-IN-82 — Success criteria at every level must be binary, outcome-based
- group: GROUP-IN-14
- intent (verbatim): "phase schema is going to need success criteria and tasks need success criteria not acceptance criteria; and both level's criteria must be binary outcome-based or invalid" [2026-06-06T00:46:35Z]
- recurrence: batch4 [15:18:20] "success criteria = what must be observably provably true binary yes no. verification is a separate thing."

### ATOM-IN-83 — Definition: a gap is something we cannot do but need to
- group: GROUP-IN-14
- intent (verbatim): "gap means something we cannot do but need to be able to do." [batch4, 15:32:25]
- recurrence: single definitional statement.

### ATOM-IN-84 — Gaps and issues are sibling-class items throughout the substrate
- group: GROUP-IN-14
- intent (verbatim): "we need gaps and issues to be sibling class items throughout the substrate. a task can and must be able to focus… on issues" [batch4, 22:41:39]
- recurrence: single design requirement.

### ATOM-IN-85 — User stories are a versatile block (research start-point and verifiable success criteria)
- group: GROUP-IN-14
- intent (verbatim): "i want them called user stories, not just stories; they need to be able to work exactly like we're using them right now: they can serve as beginning points for research, exploring, gap or issue filing; they can also be used as a kind of mandatory verifiable success criteria for a task or feature." [batch4, 00:30:20]
- recurrence: [2026-06-06T08:17:54Z] "the biggest organizer is going to be user stories."

### ATOM-IN-86 — Definition: milestone is the declaratively-authored aspirational end-state with criterion
- group: GROUP-IN-14
- intent (verbatim): "MILESTONE is the aspirational end-state-with-criterion + evidence_query authored declaratively at the top of a roadmap. Everything below it is decomposition … Milestone is what reveals + organizes the work needing to be done." [2026-05-17T00:22:58.776Z]
- recurrence: [2026-05-13T22:47:16.226Z] "milestones are aspirational until complete; then they're project history."

### ATOM-IN-87 — "Decisions" means "has been decided"
- group: GROUP-IN-14
- intent (verbatim): "\"decisions\" carries the meaning \"has been decided\"" [2026-05-27T09:52:49.350Z]
- recurrence: [2026-04-16T23:40:44Z] "there is a difference between \"decisions made\" and \"a decision needs to be made.\""

### ATOM-IN-88 — Query before enumerate; never enumerate from prior expectation
- group: GROUP-IN-14
- intent (verbatim): "before describing or recommending block_kinds / relation_types to a user, call read-samples-catalog (pre-install) or read-config (post-install) — never enumerate from prior expectation." [2026-05-28T11:30:36.890Z]
- recurrence: single canonical statement.

### ATOM-IN-89 — No hardcoding / no defaults; revisability is the key framing
- group: GROUP-IN-14
- intent (verbatim): "flexibility and no-hard-coding and revisability is the key framing." [2026-05-20T11:23:40.422Z]
- recurrence: [2026-05-11T22:40:33.878Z] "there should be no default", [2026-05-22T13:18:46.866Z] "we should not be shipping anything \"project\" as default let alone when it's hidden", [2026-05-03T10:14:18Z] config degree-zero "an open nestable hierarchy."

### ATOM-IN-90 — Naming decoupled from identity: display-name changes break nothing downstream
- group: GROUP-IN-14
- intent (verbatim): "a display name change doesn't break anything related to block layer or relationships or atomic block content downstream" [2026-05-04T21:38:35Z]
- recurrence: [2026-05-04T21:46:57Z] encoded engineering name + changeable display name.

### ATOM-IN-91 — Absence of a convention is itself a first-class gap; conventions confirmed beforehand
- group: GROUP-IN-14
- intent (verbatim): "a no convention should trigger a gap - 'there is no convention for this'" [batch4, 23:27:47]
- recurrence: batch4 [23:22:42] "the points where the considering of and application of conventions to govern thinking and planning happen", [23:35:17] "confirm beforehand, not at write time."

### ATOM-IN-92 — Polytropos PM model: many routes; done-ness runs bottom-up; user stories organize
- group: GROUP-IN-14
- intent (verbatim): "polytropos. multiple no one single correct route of using pi-context. but in general planning CAN be done top-down ... done-ness does run bottom up. and probably the biggest organizer is going to be user stories." [2026-06-06T08:17:54Z]
- recurrence: [2026-06-07T-era 07:34:25 (2026-06-06T07:34:25Z)] "correctly modeled success criteria at each level simplifies upward."

### ATOM-IN-93 — Vocabulary: the directory is .context, not .project; term "epic" rejected
- group: GROUP-IN-14
- intent (verbatim): "first, we'll call the dir .context, not .project." [2026-05-20T09:14:17.354Z]
- recurrence: [2026-05-23T03:22:32.737Z] "yes unify on context"; the term "epic" rejected — [2026-05-13T21:39:16.239Z] "the only word i truly dislike is \"epic\" -- that means zero to me", [2026-05-20T23:44:44.428Z] "epic is an alien term."
- evolution: the substrate directory/package name migrated from ".project" / "pi-project" to ".context" / "pi-context" — earlier "pi-project" ([2026-05-04T22:26:16Z] "what we have in pi-project renamed as pi-context") → later fixed at ".context" ([2026-05-20T09:14:17.354Z], [2026-05-23T03:22:32.737Z]). Latest governs; ".project" is frozen and referenced, not renamed ([2026-06-01T11:11:59Z] "it is frozen").

### ATOM-IN-94 — Enforcement over prompting (LLMs will disregard a strong prompt)
- group: GROUP-IN-15
- intent (verbatim): "\"add a strong prompt\" -- as though llm's will not psychotically disregard it." [2026-04-06T11:45:34Z]
- recurrence: undergirds the entire mechanistic-enforcement stance.

### ATOM-IN-95 — Enforce conventions at validation, not by LLM diligence
- group: GROUP-IN-15
- intent (verbatim): "We can't rely on llm's to know and read conventions." + "I prefer to think of it as something that happens at validation." [2026-06-06T23:20:54Z]
- recurrence: [2026-06-06T11:50:48Z] "schema descriptions must include specific rhetorical demands / criteria ... which can be used to validate upon writing via claude code hook", batch4 [10:22:15] "a hook for writing of gaps to present the rehtorical-register requirements prior to writing."

### ATOM-IN-96 — Mechanically constrain orchestrator deviation (on-disk verbatim briefs)
- group: GROUP-IN-15
- intent (verbatim): "let's have that on disk simply so that it is pass verbatim and the orchestrating agent's ability to deviate augment invent etc. is lessened." [2026-07-10T23:17:45]
- recurrence: coheres with ATOM-IN-34 (start-from-zero) and ATOM-IN-30 (directive fidelity).

### ATOM-IN-97 — Loop until zero violations, not fail-on-first-violation
- group: GROUP-IN-15
- intent (verbatim): "i don't want fucking failure and exist on a violation. i want a loop until no violation of any requisite criteria with zero tolerance." [batch4, 06:15:37]
- recurrence: [batch4, 05:18:26] "the agents must admit zero tolerance for deviation."

### ATOM-IN-98 — Provenance-evidence gate before filing
- group: GROUP-IN-15
- intent (verbatim): "the model must provide to the user evidence of each provenance to obtain permission to continue filing." [batch4, 23:34:53]
- recurrence: consonant with isolated proving grounds [batch4, 22:38:16].

### ATOM-IN-99 — Subagents must carry the mandates
- group: GROUP-IN-15
- intent (verbatim): "the agent itself didn't receive the mandates i require every subagent to adhere to so as not to return time-wasting crap." [2026-06-03T11:19:25Z]
- recurrence: [2026-05-30T00:29:05Z] "be exactingly best practices in your invocation."

### ATOM-IN-100 — Garbage-in/garbage-out: the orchestrator owns subagent output
- group: GROUP-IN-15
- intent (verbatim): "garbage in / garbage out. when creating agents you are responsible for their output." [2026-05-02T00:07:26Z]
- recurrence: heavily repeated (batch 1 counts ~10 instances) — [2026-05-15T23:23:29.555Z] "you own the output. garbage in / garbage out."

### ATOM-IN-101 — Forensic commit/merge provenance; lose no intention or work
- group: GROUP-IN-16
- intent (verbatim): "let's make sure we have merge commit message so zero forensic evidence of intention and work done is lost" [2026-03-16T02:06:29.974Z]
- recurrence: [2026-03-17T22:21:18.526Z] "i don't want crucial philosophical / vision statements loast."
- evolution: David's forensic/provenance apparatus is later judged, in its hook form, as ceremony — see ATOM-IN-110. The commit-message forensic intent itself is not retracted; the automated attestation hooks are.

### ATOM-IN-102 — READMEs informative, factual, with LLM usage guidance; docs kept current
- group: GROUP-IN-16
- intent (verbatim): "The readmes should be informative and factual and should include for llm's how to use it and what to consult in the files." [2026-03-16T09:36:29.039Z]
- recurrence: [2026-06-05T11:26:13Z] "are readme's updated, both package and monorepo? that needs to be in canonical process", [2026-07-08T01:36:23] "are we rebuilt, with all readmes and skills and documentation exactingly current", [2026-05-31T04:19:05Z] "you can't leave a spec that contains inaccurate or out of date info."

### ATOM-IN-103 — Clean / porcelain git status is mandated
- group: GROUP-IN-16
- intent (verbatim): "why do we have dirty git status, and is clean git status not mandated." [batch4, 04:35:08]
- recurrence: [2026-06-21T01:13:41] "make sure we're porcelain clean", [2026-05-30T04:46:22Z] "there is no reason to leave claude.md dirty", [2026-05-10T06:21:02.883Z] "we cannot have such a dirty state across phases."

### ATOM-IN-104 — No work/interim files in package sources; keep them in tmp/
- group: GROUP-IN-16
- intent (verbatim): "do not add any work files into package sources or dirs created by pi-project-workflows. all your working files must be in a tmp/ dir in the repo … do not pollute the packages with interim process files." [2026-04-18T00:04:44Z]
- recurrence: [2026-06-02T13:22:09Z] "relocate everything that is currently in the package that should not be", [2026-06-02T13:33:04Z] scripts not in published package.

### ATOM-IN-105 — Assertions must be code-founded, never invented
- group: GROUP-IN-16
- intent (verbatim): "all assertions must be founded in code and not invented" [2026-04-04T22:58:58.286Z]
- recurrence: coheres with induction-from-facts (ATOM-IN-125).

### ATOM-IN-106 — Git safety: never hard reset unless directed; push is not the agent's purview
- group: GROUP-IN-16
- intent (verbatim): "we never use hard reset unless i direct it" [2026-05-25T20:00:29.868Z]
- recurrence: [2026-05-25T20:07:28.814Z] "i said don't worry about push ... which means you don't touch it."

### ATOM-IN-107 — Working substrate is the aim; substrate management is not
- group: GROUP-IN-17
- intent (verbatim): "substrate management is not the aim or purpose of this project. working substrate is." [2026-07-08T23:00:24]
- recurrence: [2026-07-08T23:01:43] "ensure this is in claude.md and conventions"; codified as standard.
- evolution: earlier context/substrate management was framed as the prime current focus — [2026-05-03T04:01:28Z] "context management is the most important current focus. our blocks are foundational", [2026-05-26T22:41:13.813Z] "context hygiene is a pre-requisite for canonically informed work, is the project stance" → later [2026-07-08T23:00:24] and [2026-07-08T23:21:26] "substrate management does not take precedence over producing valid best of breed project canonical working code." Latest governs.

### ATOM-IN-108 — Get working code out; enact/fix, don't file or register
- group: GROUP-IN-17
- intent (verbatim): "i don't want register i want fucking fixed. canonical pipeline." [2026-07-11T12:47:23]
- recurrence: [2026-07-07T02:00:24] "get more actual working code out the door", [2026-07-07T01:35:58] "i want valid fucking code fixes to known issues ... such that pi-context and the rest of my fucking extensions here fucking work", [2026-07-11T07:35:06] "i want to accelerate valid substrate correcting", not filing.

### ATOM-IN-109 — Cost/benefit balance; anti-bureaucracy
- group: GROUP-IN-17
- intent (verbatim): "far too much blind stupid bureaucratizing without balance of cost v. benefit." [2026-07-07T22:23:46]
- recurrence: single pointed statement; motivates ATOM-IN-110.

### ATOM-IN-110 — Remove provenance/attestation hooks that became ceremony
- group: GROUP-IN-17
- intent (verbatim): "i want the provenance attesting hooks etc. and from claude code removed. they've become ceremony playacting token consuming distractions for solving real coding problems." [2026-07-08T23:08:29]
- recurrence: single decisive statement.
- evolution: reverses the earlier build-out of provenance machinery — earlier David authored provenance/forensic apparatus and gates ([2026-03-16T02:06:29.974Z] forensic merge messages; [batch4, 23:34:53] "the model must provide ... evidence of each provenance ... to continue filing") → later [2026-07-08T23:08:29] removes the attesting hooks as ceremony. The tension is between provenance-rigor and anti-ceremony/working-code; latest governs for the hook form specifically.

### ATOM-IN-111 — Governing metric: best-of-breed monorepo and superior UX
- group: GROUP-IN-18
- intent (verbatim): "i do not use your lazy metrics: my metric is the monorepo is best of breed and a superior user experience, period." [batch4, 12:36:25]
- recurrence: [2026-07-05T01:01:50] "do not presume status quo is privileged. best of breed operability of pi-context is privileged."

### ATOM-IN-112 — No knowingly-deficient release
- group: GROUP-IN-18
- intent (verbatim): "what remains of necessary cli work such that the next release isn't knowingly deficient" [batch4, 12:25:48]
- recurrence: single canonical statement.

### ATOM-IN-113 — Do not relitigate what precedent/convention/mandate already governs
- group: GROUP-IN-19
- intent (verbatim): "'now or later' seems a minor deviation i despise in that it elevates to relitigation something already governed by precedent and convention and mandate." [2026-07-06T00:40:09]
- recurrence: [2026-07-06T07:26:22] "the relitigating of things as though no policies or conventions exist proliferates chaos actively instead of creating actionable clarity."

### ATOM-IN-114 — The user sets priority
- group: GROUP-IN-20
- intent (verbatim): "you don't set priority." [2026-07-07T00:32:28]
- recurrence: coheres with ATOM-IN-54 (LLM does not decide).

### ATOM-IN-115 — Do not act without the user's direction
- group: GROUP-IN-20
- intent (verbatim): "do not act without my direction." [2026-06-21T10:35:05]
- recurrence: single standing non-negotiable.

### ATOM-IN-116 — Decisions derive from project intentions/best-practice, not user preference (nor LLM)
- group: GROUP-IN-20
- intent (verbatim): "that is not a user decision. this is a decision mandated by best-practices and intentions of the project. it is self-evident that it must work for pi-context" [batch4, 02:08:38]
- recurrence: [batch4, 05:38:35] "there is an implied best ordering that arises out of the aims and goals of the project."

### ATOM-IN-117 — Filing carries the user's authority
- group: GROUP-IN-20
- intent (verbatim): "filing means it has my authority." [batch4, 04:07:14]
- recurrence: [2026-05-13T12:27:35.183Z] "It would not have been filed without my authority. That does not mean something is not reviewable."

### ATOM-IN-118 — Monitors must not confuse the main agent into ad-hoc action
- group: GROUP-IN-21
- intent (verbatim): "we need to rationalize this so that the monitors work as intended, when intended, and do not confuse the main context agent into thinking they should engage in non-planned non-directed ad hoc action." [2026-03-29T21:36:35.443Z]
- recurrence: [2026-03-18T21:29:07.566Z] micro-programs that inject and wait.

### ATOM-IN-119 — Monitors ask for re-output, not pre-revision
- group: GROUP-IN-21
- intent (verbatim): "we say \"reoutput your resposne without the undesired behavior and do not do it again.\"" [2026-04-03T21:21:41.444Z]
- recurrence: single canonical spec.

### ATOM-IN-120 — No monitor's working is blocked by another's
- group: GROUP-IN-21
- intent (verbatim): "Desired: no monitor's intention and working is blocked by another's." [2026-04-03T20:.. (899)]
- recurrence: single canonical requirement.

### ATOM-IN-121 — A companion monitor per domain updates that domain's block on change
- group: GROUP-IN-21
- intent (verbatim): "there needs to be a companion monitor for each domain for when code in its domain is updated, it updates the domain block." [2026-03-19T12:00:45.120Z]
- recurrence: [2026-03-19T11:59:48.129Z] "domain agents that own their blocks."

### ATOM-IN-122 — One heuristic governs mandates and monitors alike (hierarchical, composable context)
- group: GROUP-IN-21
- intent (verbatim): "the heuristic we're developing can / should also govern what we currently call mandates.json as well as monitors. one heuristic for hierarchical context, writable and composable into prompts variably." [2026-05-03T12:11:16Z]
- recurrence: consonant with the unified-agent concept (ATOM-IN-68).

### ATOM-IN-123 — Showboat/Willison method: codebase-upward, no motivated prose
- group: GROUP-IN-22
- intent (verbatim): "do not deviate from the Showboat / Willison method: no motivated prose. Codebase upward, not llm conception framing." [2026-03-29T21:57:49.253Z]
- recurrence: single canonical method statement.

### ATOM-IN-124 — Discovery over documentation: surface what we would not otherwise see
- group: GROUP-IN-22
- intent (verbatim): "i want us to be able to discover things we would not have seen otherwise." [2026-03-29T22:11:11.703Z]
- recurrence: single canonical statement.

### ATOM-IN-125 — Inductive reasoning from facts; don't hunt for invented phrases
- group: GROUP-IN-22
- intent (verbatim): "we need inductive reasoning; we can't go looking for invented phrases we hope we'll find." [2026-07-11T14:12:08]
- recurrence: coheres with code-founded assertions (ATOM-IN-105).

### ATOM-IN-126 — Exact data, never partial or invented
- group: GROUP-IN-22
- intent (verbatim): "there is no place where claude-history cannot yield exact data rather than accept partial and that is invented" [2026-06-21T10:44:17]
- recurrence: single rigor statement.

### ATOM-IN-127 — Port the wasc operating harness exactly; exclude nothing that works
- group: GROUP-IN-23
- intent (verbatim): "excluding anything from source project related to the running of the process is deficient deviation." [2026-06-21T11:54:51]
- recurrence: [2026-06-21T06:03:18] "we want to port the operation to this project exactly, with the exception of the bifurcated context", [2026-06-21T11:54:20] "excluding nothing from source project that works is warranted."

### ATOM-IN-128 — Reproduce the wasc autonomous prompt-to-merge iterate-to-zero loop
- group: GROUP-IN-23
- intent (verbatim): "This is the pattern I want." (re: the wasc prompt-to-merge autonomous loop) [2026-07-08T09:06:29]
- recurrence: [2026-07-08T07:01:10] "this one has never succeeded operationally as the wasc project's has, especially the iterate to zero loop full pipeline that this project's llm routinely fail at."
