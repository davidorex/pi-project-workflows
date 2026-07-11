---
audit_group: intent-signals
description: David intent, corpus batch 2 (May8-29)
source_agent: a3b6bd9f95ebc841d
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/a3b6bd9f95ebc841d.output
verbatim: true
---

I read the entire batch (1047 statements, session `b62c055d…` almost throughout, spanning 2026‑05‑08 → 05‑29). Below are the statements that are INTENT SIGNALS — what David wants the project/code/work/process to BE. Tactical noise ("go on", "proceed", "what's next", "file it", "fix it", bare "plan mode → explore → plan" invocations, status questions) is excluded. Long statements are quoted at the intent-bearing sentence(s) with their ts.

## 1. INTENT SIGNALS (verbatim, by ts)

- [2026-05-08T11:45:40.477Z] "\"either\"? hedging bullshit is not a \"plan\"" — anti-hedging standard for plans.
- [2026-05-08T22:42:45.809Z] "plans must not have holes where llm's can introduce deviations and lazy solutions ignorant of project wide scope" — plan-quality standard.
- [2026-05-09T01:03:48.270Z] "so many \"or\" statements = you are being lazy" — no-hedging/pick-canonical standard.
- [2026-05-09T05:42:01.751Z] "all of you llm's seem determined to undermine the clearly stated mandated processes. that is unacceptable." — mandated processes are non-negotiable.
- [2026-05-10T01:03:21.562Z] "the entire purpose of config is so that .project is NOT a required dir. The intention is that what we have been using as .project … comes from config." — config-driven purpose.
- [2026-05-10T02:19:27.201Z] "Our premise will be: zero non-harnessed llm possibilities. Every action will only be through extension provided tools and jit-agents / workflows." — harness-confinement vision.
- [2026-05-10T06:21:02.883Z] "we cannot have such a dirty state across phases." (+ "agents need to commit work after each step") — no-dirty-state process standard.
- [2026-05-10T06:34:49.157Z] "there must be updating of status for phases and blocks as warranted after each progress step" — status-currency standard.
- [2026-05-10T11:31:27.647Z] "passing tests does not equal meets working intention." — verification standard.
- [2026-05-10T11:38:06.225Z] "we cannot rely on \"tests pass\" alone … better yet would be demonstrations that the code does what it needs to, for each step … we cannot open ourselves to spending implementation and testing time only to find things don't work because llm's do performance." — runtime-demo verification standard (DEC-0018 genesis).
- [2026-05-10T12:53:51.102Z] "you need to create far more constraining prompts that carry known project operating patterns to prevent llm hedging" — prompt-scoping standard.
- [2026-05-10T13:00:42.144Z] "we need the dec 0018 bar without deviation, uniformly." — uniform non-negotiable bar.
- [2026-05-10T22:15:11.963Z] "i don't want walls of opaque paragraphs as your output anymore … Bullet points, not prose blocks. … No hedging adverbs. … never trail off and never end with a question." — communication standard.
- [2026-05-11T11:41:26.264Z] "it needs to be persisted in other layers as well such that llm's choosing not to read the memory can't miss it; likely as a dec" — redundant-persistence standard.
- [2026-05-11T21:45:30.827Z] "rule must be that after each step, exact context can be known were a fresh session to start" — zero-loss persistence standard.
- [2026-05-11T22:40:33.878Z] "there should be no default." — no-default standard.
- [2026-05-12T09:37:49.707Z] "assuring our context stratum is well modeled, relationed, and queryable, such that atomic context elements can be composed via extension tools into jit agents." — core project purpose.
- [2026-05-13T05:58:12.461Z] "we should not be tracking any derivable stat or anything in either. … we need purely \"what is current focus and context\"" — no-derivable-tracking standard.
- [2026-05-13T21:20:04.153Z] "let's also not use the machine readable/designed FGAP etc. those are also similary opaque to humans … the machine readable part … one thing and human display another" — machine-vs-human vocabulary standard.
- [2026-05-13T21:39:16.239Z] "the only word i truly dislike is \"epic\" -- that means zero to me" — vocabulary standard (later: [2026-05-20T23:44:44.428Z] "epic is an alien term").
- [2026-05-13T21:47:11.449Z] "the context blocks must be the ground truth and entrance for any llm into the entirety of project context" — substrate-as-ground-truth vision.
- [2026-05-13T22:47:16.226Z] "milestones are aspirational until complete; then they're project history … the milestone is used then to do research, etc. filing of dec's etc all they down to \"task 1\" implementation" — layering/vocabulary model.
- [2026-05-13T22:57:04.162Z] "the real goal is that from config / schemas / macros the entirety can be bootstrapped and enacted for a wholly different conception of blocks and layers and relations. That's what the extension is to be, such that the memory shape arises out of user's / lmm's use of the tool and needs." — core product vision.
- [2026-05-15T23:22:54.787Z] "mirror is not permissive. a mirror mirrors. it does not alter." — agent-fidelity-to-spec standard.
- [2026-05-15T23:23:29.555Z] "you own the output. garbage in / garbage out." — orchestrator-owns-output standard.
- [2026-05-15T23:44:12.432Z] "nothing derivable goes in blocks, just like claude.md. 30+ Pi tools + ~5 commands is over engineered noise." — no-derivable-content standard.
- [2026-05-17T00:22:58.776Z] "MILESTONE is the aspirational end-state-with-criterion + evidence_query authored declaratively at the top of a roadmap. Everything below it is decomposition … Milestone is what reveals + organizes the work needing to be done." — adopted vocabulary/model definition.
- [2026-05-20T09:14:17.354Z] "first, we'll call the dir .context, not .project." — naming decision (later [2026-05-23T03:22:32.737Z] "yes unify on context").
- [2026-05-20T11:20:48.060Z] "there should be no such thing as /project as a command or tool." — non-negotiable naming/surface standard.
- [2026-05-20T11:23:40.422Z] "flexibility and no-hard-coding and revisability is the key framing." — key design framing.
- [2026-05-20T21:49:15.165Z] "our goal is for process + state to be exactly preserved for zero-loss persistence" — zero-loss goal.
- [2026-05-22T13:18:46.866Z] "we should not be shipping anything \"project\" as default let alone when it's hidden" — no-hidden-defaults standard.
- [2026-05-22T22:16:34.262Z] "yeah let's have start be only human; all other subcommands are twin'd" — onboarding-surface decision.
- [2026-05-23T01:30:15.809Z] "the simple fact is that i cannot trust ad hoc work done outside of process." — process is a trust prerequisite (non-negotiable).
- [2026-05-23T00:04:39.469Z] "our invariant method is plan mode --> explore agent --> plan." — canonical process definition.
- [2026-05-24T09:39:08.180Z] "A subagent is a tool call by the main context agent that carries relevant atomic context chunks composed into the shape of a prompt. … No perms. No tools. Configs and schemas and macros bring all into existence from empty state. The human stays in the loop by authorizing the config and its mutations …" — constitutional capability vision.
- [2026-05-24T23:04:03.852Z] "essentially we need the capability that you as orchestrator here have to validate not fake validate." — real-validation standard.
- [2026-05-24T23:10:57.789Z] "we need read-invidual-elements for anything we have in json; we should never leave an llm so they have read-all or nothing; and it should be DRY coded" — item-level-read + DRY standard.
- [2026-05-25T09:42:35.335Z] "there should be no bad route available. we've not yet solved the what happens after truncate issue." — no-bad-route standard for reads.
- [2026-05-25T13:13:36.625Z] "we're doing it for software dev; but anything that needs context is the target; it's all about the config (and the raw --> marked as valid + current, which is the only thing the constrained agent can read)" — generalized data-room vision.
- [2026-05-25T19:02:25.298Z] "expediency is never a valid consideration, especially when it persists something we're intentionally moving away from. … workflow is workflow. jit-agents are agents." — anti-expediency + architecture-separation principle.
- [2026-05-25T20:00:29.868Z] "we never use hard reset unless i direct it" — git-safety rule.
- [2026-05-25T20:07:28.814Z] "i said don't worry about push. natural language = don't pay attention to it. which means you don't touch it." — push is not the agent's purview.
- [2026-05-25T20:27:06.843Z] "no agent would author itself. the only agent that can author spec/schema is main context orchestrator. the others never even know the thing exists." — authorship architecture principle.
- [2026-05-25T22:01:44.806Z] "zero existing workflows are to be considered targets of any work. that goes for their tests too. they are nothing but legacy workflows development artifacts … The workflow framework is the only target." — scope non-negotiable (DEC-0048).
- [2026-05-25T22:02:19.290Z] "memory is not context" — substrate-vs-memory principle.
- [2026-05-26T22:41:13.813Z] "context hygiene is a pre-requisite for canonically informed work, is the project stance" — stated project stance.
- [2026-05-27T09:52:49.350Z] "\"decisions\" carries the meaning \"has been decided\"" — semantic standard for the decisions block.
- [2026-05-27T13:14:38.779Z] "i don't want anything minimal. that's llm crap talk. where in our context planning is \"agent in pi can author and use jit-agents with scoped perms and tools\"" — vision anchor (rejects minimalism).
- [2026-05-27T22:49:31.736Z] "design should explicitly forbid wholesale bash/write/edit from being added to TOOL_OPERATION_DEFAULTS so the composite command-allowlist isn't a gated alternative to an unrestricted original." — security design standard.
- [2026-05-27T22:51:59.148Z] "wrong interpretation: you identified a valid possible need then deferred it" — no-deferral-of-discovered-fragility standard.
- [2026-05-28T11:30:36.890Z] "before describing or recommending block_kinds / relation_types to a user, call read-samples-catalog (pre-install) or read-config (post-install) — never enumerate from prior expectation." — query-before-enumerate standard.
- [2026-05-28T21:37:35.438Z] "i want some tools made available to the main context agent but require auth by the user, so that the agent can't just write itself to omnipotent non-constrained state … The main agent must in certain circumstances be the executor of user's directed executive actions." — auth-gated executive-agent vision.
- [2026-05-28T22:25:20.674Z] "i want the script-constrained agent to be able to read files" — capability requirement.
- [2026-05-28T22:36:41.485Z] "we do a better job of that with our harness. let's explore how without a change to canonical pi we give exact feedback to the llm using pi's read and when it hits truncate not to simply blithely hand wave." — truncation-feedback standard.
- [2026-05-29T02:01:20.246Z] "better is \"with human auth\" and the main agent has the tool. that should be the general heuristic." — human-auth-not-human-only heuristic.
- [2026-05-29T06:47:37.535Z] "you do not on your own determine that something is low risk." — agent-authority limit.
- [2026-05-29T10:04:22.695Z] "we'll use none of the work created by the workflow run and we'll not use workflows again." — direction/rejection of workflows as a build path.
- [2026-05-29T10:29:20.920Z] "pi-workflows is not agents. jit-agents and agent dispatch are agents." — architecture-separation principle (reasserted).

Borderline (included per instruction, not padded):
- [2026-05-13T12:27:35.183Z] "\"The LLM-filed concrete decomposition is not authority.\" It would not have been filed without my authority. That does not mean something is not reviewable." — authority-vs-reviewability distinction (about how filed content should be treated).
- [2026-05-13T12:56:38.796Z] "ensure that misunderstanding never arises again." — durability-of-correction expectation.
- [2026-05-25T04:31:17.199Z] "there's no reason skills shouldn't be jit too; schema shaped; macro'd; reusable or composible on the fly" — extension of the everything-is-composable vision.
- [2026-05-25T04:42:38.173Z] "project-vision works for me; others might be \"policies\" (that which allows llm's to make reasoned by constrained decisions possibly)" — proposed context-layer for vision/policy.

## 2. EMERGENT INTENT KINDS (grown from the selected quotes)

- **Anti-hedging / pick-the-canonical-path (no "or", no deferral, no laziness)** — 7 (e.g., 2026-05-08T11:45:40.477Z).
- **Verification must be real, not performed (demos + real checks, not "tests pass")** — 4 (e.g., 2026-05-10T11:38:06.225Z).
- **Zero-loss context persistence; fresh session reconstructable; no derivable stats tracked** — 5 (e.g., 2026-05-11T21:45:30.827Z).
- **Context-substrate vision: config/schemas/macros bootstrap everything from empty; substrate is ground truth; generalized "data-room"** — 6 (e.g., 2026-05-13T22:57:04.162Z).
- **Harness-confinement + constitutional capability model: tools-only main agent, scoped/JIT perms, human-authorized widening** — 5 (e.g., 2026-05-24T09:39:08.180Z).
- **Architecture separation: workflows ≠ agents; jit-agents own the agent layer; no self-authoring** — 4 (e.g., 2026-05-25T20:27:06.843Z).
- **No-hardcoding / no-defaults / revisability; no "/project"; ".context" not ".project"** — 6 (e.g., 2026-05-20T11:20:48.060Z).
- **Communication standard: bullets not walls, no signal loss, no throat-clearing, never end with a question** — 3 (e.g., 2026-05-10T22:15:11.963Z).
- **Vocabulary standards: no "epic", no "oracle", "decisions"=decided, machine-readable vs human display** — 4 (e.g., 2026-05-13T21:39:16.239Z).
- **Process discipline is a trust prerequisite (plan→explore→plan→impl→audit; can't trust ad-hoc; mandates honored)** — 4 (e.g., 2026-05-23T01:30:15.809Z).
- **Orchestrator owns output / agent fidelity (garbage-in-garbage-out, mirror doesn't alter, well-scope agents)** — 2 (e.g., 2026-05-15T23:23:29.555Z).
- **Action-safety rules (no hard reset unless directed; push not the agent's purview; agent doesn't self-judge "low risk")** — 3 (e.g., 2026-05-25T20:00:29.868Z).
- **Read/discovery completeness (never read-all-or-nothing; no bad route on truncation; query-before-enumerate; DRY)** — 4 (e.g., 2026-05-24T23:10:57.789Z).
- **Scope non-negotiables (legacy workflows are not targets; memory is not context; no hidden "project" defaults)** — 3 (e.g., 2026-05-25T22:01:44.806Z).
- **Security/constraint design (forbid wholesale bash/write/edit; auth-gate sensitive tools; no deferring found fragility)** — 3 (e.g., 2026-05-27T22:49:31.736Z).

Note: the process phrases "plan mode → explore → plan → impl → audit" and "canonical pipeline" recur dozens of times as tactical invocations; counted once here at their defining statement (2026-05-23T00:04:39.469Z), not per repetition.
