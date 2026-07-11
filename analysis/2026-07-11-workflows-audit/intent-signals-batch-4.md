---
audit_group: intent-signals
description: David intent, corpus batch 4 (Jun5-)
source_agent: a066f425c5f600a6c
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/a066f425c5f600a6c.output
verbatim: true
---

All 1047 statements read. Findings below.

## 1. INTENT SIGNALS (verbatim, chronological)

- [06-05 23:22:42] "the conventions must already have been accounted for; so what are the points where the considering of and application of conventions to govern thinking and planning happen." — process-timing standard: conventions govern thinking/planning, not just write-time
- [23:27:47] "a no convention should trigger a gap - 'there is no convention for this'" — design intent: absence-of-convention is itself a first-class gap
- [23:35:17] "confirm beforehand, not at write time" — process standard
- [00:37:40] "let's make sure our concept of conventions is *general* in those instances" — standard: generality of conventions
- [02:08:38] "that is not a user decision. this is a decision mandated by best-practices and intentions of the project. it is self-evident that it must work for pi-context" — intent: decisions derive from project intentions/best-practice, not user preference
- [02:35:00] "your suggestion of accepting the divergence is odious and mandates antipattern." — non-negotiable: no divergence/antipattern
- [03:46:35] "canonize explore before file" — process mandate
- [04:04:59] "there is one source of de-ephemeralized structured composable context, and that is .context." — architectural intent: single source of truth
- [04:07:14] "filing means it has my authority." — defines the meaning/weight of filing
- [04:09:24] "it's awfully opaque and i want exact declarative statements" — rhetorical standard
- [04:11:32] "we need another block for accepted language register. and like for conventions we need a force-to-look-at-rhetoric-requirements upon filing" — requirement: enforce rhetorical register at filing
- [05:48:53] "and for each task exact success criteria" — requirement
- [05:51:11] "using no bypasses from the pi-context cli" — non-negotiable: no CLI bypass
- [12:25:48] "what remains of necessary cli work such that the next release isn't knowingly deficient" — standard: no knowingly-deficient release
- [12:36:25] "i do not use your lazy metrics: my metric is the monorepo is best of breed and a superior user experience, period." — governing standard: best-of-breed + superior UX
- [12:44:37] "let's ensure that a new session would be able to identify exactly that as our current status and focus." — intent: state must be reconstructable by a fresh session
- [23:04:11] "adhere to full canonical pipeline within the implement to zero loop: that is the only way to create successful implementations per task." — process mandate: canonical pipeline is the ONLY valid path
- [23:47:06] "we need no scripts; is this persisting a regression? scripts are off the table. only in-pi + cli are the routes" — architectural non-negotiable
- [00:15:32] "say what you mean in at most 1 or 2 sentences." — communication standard
- [08:32:45] "do not deviate from canonical process within iterate to zero. If the agent surfaces an issue, it gets explored, planned, impl, etc. iterate to zero." — process mandate
- [09:45:04] "clearly you cannot control yourself to use the cli as I require, which I require as a means of surfacing frictions the feed into dev possibilities." — purpose: CLI use is required specifically to surface dev frictions
- [09:55:13] "the value is in requiring the use of the cli to find experience gaps and frictions… an explore on a gap must identify and surface if the gap being explored is a class of a more general thing." — purpose + convention
- [10:19:56] "no narrative discussion of understanding of gaps provenance / etc changes. it's a statement of atomic context." — rhetorical standard: atomic, non-narrative filings
- [10:22:15] "we need a hook for writing of gaps to present the rehtorical-register requirements prior to writing." — enforcement requirement
- [00:30:20] "i do not want it overly complicated… i want them called user stories, not just stories; they need to be able to work exactly like we're using them right now: they can serve as beginning points for research, exploring, gap or issue filing; they can also be used as a kind of mandatory verifiable success criteria for a task or feature." — schema/design intent for user-story block
- [10:29:34] "try to respond in exactly that kind of non-meandering concise way always. high signal, low flourishes." — communication standard
- [10:53:57] "i'm currently partial to the general process of de-ephmeralization. capturing intel and context when it happens and not having it exist in an ephemeral purgatory state" — direction: de-ephemeralization
- [11:07:17] "i'd like us to get to the point where an agent exploring a gap before filing writes the file and then writes a rhetorical-register-compliant research finding." — target-state direction
- [23:34:53] "the model must provide to the user evidence of each provenance to obtain permission to continue filing." — requirement: provenance-evidence gate before filing
- [01:05:47] "file that. without augmentation deviation or in any way changing what I just agreed to." — non-negotiable: execute exactly, no augmentation
- [01:41:35] "do not deviate. no sidecar. that 'or' is odious scope fragmentation." — non-negotiable: no scope fragmentation
- [01:42:39] "fix all three — no sidecar anywhere" — same
- [05:38:35] "certainly there is an implied best ordering that arises out of the aims and goals of the project" — intent: work ordering is derivable from project aims
- [04:15:39] "PROCESS FUCKING MATTERS." (repeated 9x) — process-primacy declaration
- [04:35:08] "why do we have dirty git status, and is clean git status not mandated." — standard: clean git status is mandated
- [22:20:59] "that must be a) exactingly and concisely detailed in CLAUDE.md and b) in our conventions block in .context." — requirement: agent-invocation practice must be documented in both loci
- [22:23:27] "be clear that this applies only to Claude Code, not to the in-pi context" — scope boundary
- [22:38:16] "we need a generalized method and infrastructure… to validate and prove implementations that never expose actual live .context to change or damage in the dev process." — intent: isolated proving ground
- [22:41:39] "we need gaps and issues to be sibling class items throughout the substrate. a task can and must be able to focus… on issues" — data-model requirement
- [15:18:20] "task = things to do. success criteria = what must be observably provably true binary yes no. verification is a separate thing." — conceptual-model intent
- [15:32:25] "gap means something we cannot do but need to be able to do." — definition
- [17:49:38 borderline] "do not presume past actions are the best way to accomplish the end result." — process principle
- [19:11:11] "Add nothing it does not say; omit nothing it does say." — non-negotiable execution-fidelity standard
- [00:54:02] "a new session must have zero ignorance about this project and its current status." — intent: fresh-session completeness
- [01:08:23] "do not make the same mistake of using proxies alone." — standard: no proxies for substrate truth
- [01:09:50] "you must correctly constrain the agent. i refuse to see '    Bash(cat .pi-context.json)'" — standard: constrain agents to CLI/substrate, no raw file reads
- [05:18:26] "the agents must admit zero tolerance for deviation." — standard: zero-tolerance deviation
- [06:15:37] "i don't want fucking failure and exist on a violation. i want a loop until no violation of any requisite criteria with zero tolerance." — intent: loop-to-zero-violations design
- [07:12:35 borderline] "i'll accept this provided the llm is prevented from typical llm lazy punt, hedging, refusal to adhere to policy, or handwaving" — standard: no laziness/hedging
- [08:00:27] "strip all inanities. leave exactly what I've asked for as my intent." — execution-fidelity standard
- [22:28:07] "i expect that when i give a prompt it is executed as I state it without omission or augementation on your part." — non-negotiable execution-fidelity standard
- [00:49:06 borderline] "claude.md must include only pointers -- nothing stupidly immediately stale like '45 open gaps'." — standard: CLAUDE.md carries pointers only, no perishable state

## 2. EMERGENT INTENT KINDS (grown from the selections)

1. **Canonical-process primacy — the pipeline is the ONLY valid path; no deviation; iterate-to-zero** (8): ex. [23:04:11]. Recurs as the spine of the batch.
2. **Execution fidelity to the exact directive — no augmentation, omission, substitution, "spin," or scope fragmentation** (8): ex. [19:11:11].
3. **Architecture/tooling constraints — only in-pi + CLI; no scripts; no bypasses; no proxies/raw reads** (6): ex. [23:47:06].
4. **Rhetorical-register / communication standard — terse, declarative, atomic, high-signal, no narrative/hedging** (7): ex. [10:29:34].
5. **De-ephemeralization & substrate-as-single-source-of-truth; fresh-session completeness; clean git** (7): ex. [00:54:02].
6. **Substrate schema/semantics design intent — gap/issue/story/success-criteria definitions and their required relations** (7): ex. [00:30:20].
7. **Best-of-breed / superior-UX / no-knowingly-deficient-release as the governing metric** (3): ex. [12:36:25].
8. **Anti-chaos guards on the LLM — provenance-evidence gates, isolated proving grounds, zero-tolerance loops, constrained agents** (6): ex. [22:38:16].
9. **Derivability — decisions, orderings, and next-steps must fall out of project aims/canon, not be invented or kicked to the user** (3): ex. [05:38:35].

Note: many signals appear as duplicate resends at adjacent timestamps (e.g. the "field of view / no noise" and "PROCESS FUCKING MATTERS" clusters); quoted once at the representative ts. The dominant, most-repeated intents are Kinds 1 and 2 — process-primacy and literal execution fidelity — which recur continuously and escalate in force across the batch.
