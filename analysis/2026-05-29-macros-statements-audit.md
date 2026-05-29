# EXHAUSTIVE ENUMERATION: MACROS-RELATED STATEMENTS
## Total Statements Found: 463

SOURCE: .project/decisions.json
QUOTE: """
The user's framing names the substrate contract as 'six discrete blocks.' Five enumerated against POC v2 evidence (config, partitions, lenses, closure-table relations, per-item macros). The sixth block of the contract is unresolved. Pre-heuristic candidates from the conversation were schemas-as-substrate, hierarchies-as-distinct-block, or macros split into registry + emitter. The heuristic-widening pass (mandates + monitors as in-scope typed contexts under one heuristic) narrows preferred candidates to two: prompt-composition contract OR scopes (user / project / agent). Implementation cannot proceed with contract enumeration until this resolves.
"""

SOURCE: .project/decisions.json
QUOTE: """
Per-item macros + a separate cluster/whole-block render layer as separate blocks.
"""

SOURCE: .project/decisions.json
QUOTE: """
Superseded: off-by-one re-count of the substrate contract. Original framing claimed six discrete blocks while enumerating five (config + partitions + lenses + closure-table relations + per-item macros). On reflection no sixth block exists; the contract is five blocks. Filed under proliferation pressure during the heuristic-widening pass; retired without enactment.
"""

SOURCE: .project/decisions.json
QUOTE: """
contextBlocks parameterization: typed object form vs bare-string convention
"""

SOURCE: .project/decisions.json
QUOTE: """
The integration-map design proposed a bare-string `_lens:<id>` convention for lens-view injection in agent contextBlocks. The per-item-macros plan (analysis/2026-05-02-per-item-macros-atomic-plans.md plan #3) extends contextBlocks to a typed object form `{name, item, focus, depth}`. Two parallel parameterization mechanisms in one field. The heuristic-widening pass forces typed-only because bare-string cannot carry the parameter set the unified surface needs: `_mandate:<id>`, `_lens:<id>?status=open`, `_monitor:<id>:last-classification`, agent-scope omit lists, applicability filters. Bare-string would proliferate as `_kind:id:opt1:opt2` — a regression toward stringly-typed configuration. Surfaced as gap #29.
"""

SOURCE: .project/decisions.json
QUOTE: """
Typed object form of contextBlocks entries (name + optional item/focus/depth) is the canonical injection surface for selective composition. Bare-string form (whole-block injection by name) remains valid for backward compatibility with existing agent YAMLs. The heuristic-widening forces the typed form because bare-string cannot carry the parameter set the unified composition surface needs (lens id, item selector, focus, depth, applicability predicate). Per-item-macros plan #3 is the canonical landing path.
"""

SOURCE: .project/decisions.json
QUOTE: """
per-item-macros plan #3 (typed contextBlocks extension) is the canonical landing path; no parallel bare-string convention
"""

SOURCE: .project/decisions.json
QUOTE: """
per-item-macros plan #3
"""

SOURCE: .project/decisions.json
QUOTE: """
analysis/2026-05-02-per-item-macros-atomic-plans.md
"""

SOURCE: .project/decisions.json
QUOTE: """
readBlock('features/consumer-migration/stories/STORY-A'). Native tree shape on disk. Atomic per-item writes.
"""

SOURCE: .project/decisions.json
QUOTE: """
The roadmap/plan substrate proposal requires expressing per-phase ordering (phase A before phase B in a roadmap) and per-item ordering (task A before task B in a plan). DEC-0009 mandates closure-table edges as the canonical primitive for hierarchical decomposition, which covers ordering. Two authoring shapes are mandate-compliant under DEC-0009 — both ship ordering as edges; difference is the user-facing surface for declaring them. The proposal flagged this as a forking choice that user must resolve before implementation step 4 (loadRoadmap) lands.
"""

SOURCE: .project/decisions.json
QUOTE: """
All future Pi-runtime tooling outside pi-context (pi-jit-agents contextBlocks injection, pi-workflows substrate reads, pi-behavior-monitors block writes) imports the resolver from pi-context; no parallel resolution logic in any package.
"""

SOURCE: .project/decisions.json
QUOTE: """
Work-unit context (the bundle of items relevant to executing a unit-of-work) is composed at dispatch time by walking config-declared relation_types per a unit-kind-specific context contract. (1) RELATIONSHIPS: every link from a work-unit to context items is a closure-table edge in relations.json with a config-declared relation_type per DEC-0013 — NOT an inline array on the work-unit's schema. Reference-bearing fields like `related_requirements: string[]` on a task schema are forbidden as DEC-0013 violations; the substrate's authoritative reference graph lives in relations.json. (2) CONTEXT CONTRACT: per work-unit-kind, the substrate declares (in a context-contract block kind, OR encoded as composition-lens definitions in config.lenses[]) which relation_types compose the execution bundle. Different unit kinds have different bundles: implementation tasks need conventions + acceptance + architecture-touched; decision-making tasks need rationale + alternatives + related-decisions; verification tasks need verification-criteria + evidence-rules + items-under-verification. (3) GATHER PRIMITIVE: a single substrate operation (gather-execution-context(unitId, kind)) reads the unit + reads its context contract + walks the declared relation_types bidirectionally + composes the result as a single typed bundle returned as one structured payload. (4) DISPATCH-TIME INJECTION: pi-jit-agents' contextBlocks mechanism extends to item-level selectivity driven by gather-execution-context output — agents receive bundle as composed input, not as N whole-block dumps. (5) RELEVANCE SCOPING: traversal scoped per relation_type's category semantics; bounded by depth + applicability predicate (FGAP-010 territory) so reach-but-not-relevant items don't pollute the bundle.
"""

SOURCE: .project/decisions.json
QUOTE: """
FGAP cluster filed alongside this DEC: FGAP-029 (bidirectional scoped traversal primitive — walk-ancestors / gather-by-relation), FGAP-030 (per-work-unit-kind context contract substrate), FGAP-031 (gather-execution-context composition primitive), FGAP-032 (item-level contextBlocks selectivity in pi-jit-agents driven by gather output). FGAP-010 (applicability predicate language) supplies the relevance-scoping mechanism. FGAP-005 (state-machine validation) gates context-time validity. FGAP-024 (write-authority enforcement) extends to gather-time authority (who can request which bundles for which units).
"""

SOURCE: .project/decisions.json
QUOTE: """
POC TypeScript scripts under scripts/orchestrator/ (extract-mandates, extract-decs, extract-feedback, build-subagent-preamble, file-block-item, build-explore-brief landed at HEAD fa59884) were initially framed as orchestrator-side ergonomics wrappers replacing hand-construction variance in subagent briefs. Observed during their construction: each script's implementation surfaces a concrete gap in the extension surface — extract-feedback exposes memory-vs-substrate boundary violation (closed by FGAP-033 candidate); extract-mandates exposes mandate substrate-canon home gap; extract-decs exposes per-item macros library incompleteness (REVIEW-001); file-block-item exposes schema-aware filing UX gap that pre-existed for both Claude-Code orchestrator AND in-pi JIT agents; build-subagent-preamble exposes per-type context composition gap (DEC-0017 context-contracts territory). The scripts thereby double as both consumers of the canonical surface AND executable specifications of what the canonical surface must offer for agents to execute their work.
"""

SOURCE: .project/decisions.json
QUOTE: """
Pieces of this pattern exist scattered across canon: DEC-0017 names work-unit context composition substrate; FGAP-029/030/031/032 cluster covers bidirectional traversal + per-unit-kind context contract + gather-execution-context primitive + item-level contextBlocks; FGAP-034 enumerates 6 elided block kinds (cascade-target / audit-result / arc-cross-ref / import-chain / investigation / brief-history); DEC-0019 frames scripts/orchestrator/* as test surface that surfaces gaps; REVIEW-001 names per-item macros pending. The COHERENT LAYERED PATTERN that ties these pieces — explore → cascade-target items, plan → plan-step items, implement → impl-applied items, demo → demo-result items, probe → probe-result items; each layer reads prior layer's items via readBlock+filter where work_unit_id matches; each layer's output IS substrate (not markdown intermediate) — is implicit but not yet articulated as canon. Markdown-as-load-bearing-intermediate produced the C.3 v2 explore agent prose-summary contradiction; FGAP-034 enumerated the 6 specific elided kinds; this DEC canonicalizes the broader architectural position.
"""

SOURCE: .project/decisions.json
QUOTE: """
Every work-unit (sub-section commit, sub-phase commit, etc.) produces per-layer outputs as TYPED SUBSTRATE BLOCKS (one block_kind per layer-output type). All layer-output items carry a work_unit_id field associating them with the work unit they describe. Layer composability flow: explore agent block-writes cascade-target / audit-result / arc-cross-ref items; plan agent reads explore items via readBlock+filter+work_unit_id, block-writes plan-step items; implement agent reads cascade-target + plan-step, block-writes impl-applied items + commit-sha; demo agent block-writes demo-result items per DEC-0018 probe; adversarial-probe agent block-writes probe-result items. Markdown rendering becomes display-only via macros (one per layer-output block_kind); substrate is canonical. Agents — both in-pi (Pi tool dispatch) and Claude Code (file-block-item.ts wrapper) — block-write items rather than markdown reports. Status cascades + cross-session continuity + replay + adversarial verification all become substrate operations (readBlock+filter), not markdown-grep operations.
"""

SOURCE: .project/decisions.json
QUOTE: """
Per-item macros (REVIEW-001 territory) become per-layer-output kind: render_cascade_target / render_audit_result / render_plan_step / render_impl_applied / render_demo_result / render_probe_result. Each closure feeds back into REVIEW-001.
"""

SOURCE: .project/decisions.json
QUOTE: """
Agent dispatch discipline: every agent's task spec ends with 'block-write your output items via Pi tool / file-block-item.ts wrapper; NO markdown report file as deliverable'. Markdown rendering happens orchestrator-side via macros consuming the substrate.
"""

SOURCE: .project/decisions.json
QUOTE: """
Standing tension with implementation velocity: each new orchestrator-side script needs its output kind designed + schema'd + macro'd before lands. Accepted as cost of correctness; per DEC-0019's iteration model, gaps surface during script writing and feed back to schema design.
"""

SOURCE: .project/decisions.json
QUOTE: """
REVIEW-001 per-item macros pending
"""

SOURCE: .project/decisions.json
QUOTE: """
Schema title field is the canonical source for block-kind display_name. config.block_kinds[].display_name is override-only — populate ONLY when prose deviation from schema.title is needed for display context. Default rendering reads schema.title; UI/macros fall back to schema.title when config.block_kinds[].display_name absent. Same authority pattern extends to other block-kind metadata expressible in schema (description / title) before adding parallel config fields.
"""

SOURCE: .project/decisions.json
QUOTE: """
pi-context substrate canon is vocabulary-neutral; user's block / layer / relation / lens / status conception bootstraps entirely from config + schemas + macros without code changes
"""

SOURCE: .project/decisions.json
QUOTE: """
User direction 2026-05-14 dialogue articulating the foundational extension goal: the entire substrate apparatus must be bootstrappable + enactable for a wholly different conception of blocks / layers / relations than what pi-context ships defaults for. The memory shape arises from user/LLM use of the tool and needs, not from hardcoded canonical vocabulary in source. This generalizes DEC-0015 (config drives substrate location) + DEC-0011 (schema-install opt-in) to their full extent: pi-context's source is vocabulary-machinery (block-api primitives + closure-table + lens infrastructure + query primitives + DispatchContext attestation + execution-context composition); the canonical vocabulary (block kinds / IDs / relation_types / lenses / layers / status) is config-driven user-authored data, not built-in commitment. Currently pi-context ships defaults (PROJECT_BLOCK_TYPES list of 12 kinds; canonical macros for those kinds; etc.) which are USER-OPTIONAL per DEC-0011 install opt-in pattern but appear as hardcoded literals in source — partial alignment with the principle.
"""

SOURCE: .project/decisions.json
QUOTE: """
pi-context substrate canon is vocabulary-neutral. The framework's source code MUST operate on canonical_id-keyed registries derived purely from config.json + .project/schemas/ + .pi/templates/ macros. Built-in defaults shipped in packages/pi-context/registry/ are user-OPTIONAL; a user with a wholly different substrate conception can clone pi-context, author their own config + schemas + macros + relation_types + lenses + layers, and have a fully-functioning substrate canon for THEIR vocabulary without modifying any pi-context source. Implications: (a) hardcoded vocabulary literals in source (e.g. PROJECT_BLOCK_TYPES const) are gaps to close — vocabulary derives from loaded config; (b) macro library must scaffold user-added block kinds, not assume canonical-kind exclusivity; (c) lens-validator dispatch must be config-registerable, not code-registered; (d) layer registry must be runtime-honored from config.layers[], not symbolic; (e) test suite must exercise pi-context against a fully-different substrate vocabulary as universalization proof.
"""

SOURCE: .project/decisions.json
QUOTE: """
Macro library bootstrap surface for user-added kinds — drop-in macros + canonical-kind defaults + framework auto-discovery (FGAP-057 filed; cross-decision with FGAP-037).
"""

SOURCE: .project/decisions.json
QUOTE: """
Framework-machinery work stays real: validateProject edge-validation + relocated invariants; rename engine (FGAP-060); config-consumption (FGAP-052); macro library (FGAP-037/057); atomic-next (FGAP-059); PROJECT_BLOCK_TYPES removal (FGAP-056); mixed-shape block_kinds (FGAP-061); empty-prefix (FGAP-062); milestone elevation (FGAP-053/054/055). Schemas authored edge-based.
"""

SOURCE: .project/decisions.json
QUOTE: """
FGAP-074 renames the framework's OWN source surface (the 3 project-*.ts modules + their subpath exports, exported identifiers, the 11 project-* Pi tools, the /project command) from pi-project-era 'project' naming to 'context'. C0 is the decision-only chunk that settles the target names so C1-C7 are pure mechanical codemod. The surface already converges on 'context' (package @davidorex/pi-context, command target /context per DEC-0042, the .context dir target, context-* tools, the already-context-named resolveContextDir/writeBootstrapPointer/schemaPath). Two naming questions were non-mechanical: (1) the project-context.ts target (context-context is absurd), and (2) whether the data-layer identifiers (getProjectContext/ProjectContext/validateProject + the State/Validation interface families) should adopt a precise second noun 'substrate' (already the codebase's PROSE term for the data layer) or stay in the 'context' vocabulary. Empirical grounding: ProjectState provably carries non-substrate fields (sourceFiles, sourceLines, testCount, lastCommit, recentCommits) so it is a whole-project derived dashboard, not a data-layer artifact; getProjectContext loads config+relations (the materialized data layer); validateProject checks referential integrity of blocks/relations. The 'Context' token is overloaded in-tree (DispatchContext x50, ContextBundle x20, resolveContextDir x50, contextBlocks).
"""

SOURCE: .project/decisions.json
QUOTE: """
Evaluation (2026-05-24) of whether the orchestrator->subagent operational pipeline (run this session by a Claude-Code orchestrator tasking subagents) is achievable by an extensions-tools-constrained in-pi agent using pi-context + pi-jit-agents. Finding: the declarative pipeline is ~85% expressible today (pi-workflows agent/command/gate/block/monitor/pause steps; shell IS available via command/gate steps; substrate authorship complete via Cluster A+B; introspect.agentContract ALREADY projects an AgentSpec to a tool shape). The genuinely missing pieces for ADAPTIVE self-orchestration are (1) agent-dispatch as a first-class tool (FEAT-004 / DEC-0044, open; pi-jit-agents is tool-less) and (2) operation-granular JIT capability composition + sandbox (FEAT-005). User articulated the governing model: a subagent is a programmatic action (a tool call carrying composed atomic-context chunks) that receives its OWN exactly-scoped tools+perms, JIT-composed from an empty-state registry (no ambient tools/perms; configs+schemas+macros materialize everything — generalizing DEC-0015/0011/0025). The human stays in the loop by AUTHORIZING the config and its mutations proposed by the main agent. Framed as a separation of powers ('constitutional').
"""

SOURCE: .project/decisions.json
QUOTE: """
ENACTED (2026-05-26), in code terms (the prior legislative/executive/judicial framing was thinking-scaffolding; the model below is the operative form). No genuine fork remained at settlement — the model is determined by FEAT-005 + DEC-0014/0015/0011 + FGAP-102; settling = recording it. (1) A dispatched agent's tools are declared in its .agent.yaml spec (schema-shaped, macro/template-composed at the jit-agents compile boundary); default EMPTY (DEC-0015/0011 generalized) — an agent gets nothing it does not declare. (2) The grant is OPERATION-GRANULAR, not tool-wholesale (FEAT-005): a scoped right (run `npm test`; write path X) rather than `bash`/`write` entire. config + schemas + macros are the registry of what is grantable (default empty); the spec carries the per-invocation scoped grant drawn from it. (3) The dispatch path grants exactly the spec's declaration, CLAMPED to a subset of the dispatching parent's grant AT OPERATION SCOPE (FGAP-099, enforced at the DEC-0044 dispatch extension). A child can never exceed its parent; subagents are spec-blind recipients with no escalation path. (4) The orchestrator (DEC-0014: tools-only, no ambient bash/read/write/edit) is the SOLE spec/schema author. It may author work-orders/specs whose grants are within the existing registry (writer.kind=agent — allowed). WIDENING the registry (a new tool/op/capability bundle) is a capability mutation requiring HUMAN ratification: writes to capability/registry fields require writer.kind=human; agent-authored capability expansion is rejected at the block-api write chokepoint (no parallel ungated path). The existing DispatchContext WriterIdentity discriminant (human|agent|monitor|workflow) is the lever. (5) The TERMINAL acceptance verdict on any executable artifact (code or substrate change) is produced by RUNNING THE REAL DETERMINISTIC CHECKS the executive cannot fake — compiler/type-check/test exit code, schema validator, git diff, real runtime events — never an LLM self-assessment (FGAP-1
"""

SOURCE: .project/decisions.json
QUOTE: """
User-stated (JI-001, verbatim, 2026-04-09): "an 'agent' is the same thing whether it be used as a monitor or used in and by workflows." OPERATIVE: there is ONE agent abstraction — the jit-agent (pi-jit-agents library: AgentSpec + loader + compile/templates/macros/schemas/contextBlocks + capability composition + execute). Every consumer uses THIS abstraction: pi-behavior-monitors (monitor classifiers + steering subagents), pi-workflows (a workflow step that needs an agent dispatches a jit-agent), the agents-as-tools dispatch surface (FEAT-004 projects from introspect.agentContract over the same AgentSpec). There are no per-consumer agent kinds. Duplicates of the agent abstraction in consumer packages (e.g. pi-workflows' parallel AgentSpec + agent-spec loader + agent-template machinery + compileAgentSpec) are non-canon by construction and to be removed (FEAT-001). The disposability of existing artifacts (JI-002: 'all existing agents are development proofs of concept… recreatable from a correct framework') is recorded in DEC-0048.
"""

SOURCE: .project/features.json
QUOTE: """
An extension makes the LIVE main interactive pi session ASSUME one of our compiled jit-agent specs WITHOUT forking pi: system prompt + injected contextBlocks via before_agent_start -> result.systemPrompt (runtime-honored end-to-end; our compiled.systemPrompt already carries the <context_block role="data"> injection); tools/model/thinking via setActiveTools/setModel/setThinkingLevel from a registerCommand handler; a slash-command activation/exit seam that snapshots + restores prior session state. A 3rd dispatch modality alongside subprocess (pi --mode json, dispatch.ts) and in-process (executeAgent): strong where they are weak (live interactivity, zero spawn, context continuity), weak where they are strong (no typed-output GUARANTEE for the interactive loop — only a best-effort before_provider_request wire seam; F-012 forced-toolChoice inheritance). Output schema becomes prompt instruction, not contract, for the main agent.
"""

SOURCE: .project/features.json
QUOTE: """
a slash command applies a jit-agent spec to the live session (systemPrompt + contextBlocks + tools + model + thinking) and a clean exit restores prior state
"""

SOURCE: .project/features.json
QUOTE: """
Let users author a complete context model (config + schemas + starter blocks + relations + rendering macros) against the pi-context SDK, package it as a portable bundle, share it, and install it into any substrate to use immediately — the same way the package's own packaged conception (DEC-0037, samplesCatalog) works, generalized to any third-party conception. A 4th, DATA-ONLY artifact type distinct from Claude Code plugins / Pi extensions / behavior-monitor specs. Builds directly on B2/FGAP-068: samplesCatalog made the package conception queryable; this makes any conception portable + installable. Feasibility + reuse/gaps + the cross-package macro resolution + distribution channels: see R-0013 / analysis/2026-05-22-context-plugin-feasibility.md. Requires a new enacted decision for multi-source onboarding + external acquisition + provenance + conflict-resolution (DEC-0037/0038 are internal-samples-only).
"""

SOURCE: .project/features.json
QUOTE: """
A crafted conception (great block_kinds/relations/schemas/macros) is currently locked inside the package's own samples/. Making it portable turns pi-context into an ecosystem: teams share OKR / research-loop / spec-loop / domain conceptions; onboarding draws from external catalogs, not just the built-in one. Directly extends the value of the config-driven framework (DEC-0015) + the packaged conception (DEC-0037).
"""

SOURCE: .project/features.json
QUOTE: """
a bundle's rendering macros install into project .pi/templates/items/ (found by the existing 3-tier search) with no pi-workflows refactor; manifest carries a macro/template field so delivery is registered + validatable
"""

SOURCE: .project/features.json
QUOTE: """
Project pi-jit-agents' AgentContract (introspect's agentContract(spec): inputSchema -> tool parameters, output.schema -> return contract, contextBlocks -> substrate injection) into a callable agent-DISPATCH surface, dual-surfaced per DEC-0019/0020: a Pi tool (the harness-confined in-pi LLM per DEC-0014 delegates to a typed subagent) + an orchestrator CLI (Claude Code runs any .agent.yaml as a typed function). Today agents are WORKFLOW-STEP-ONLY — pi-workflows workflow-execute runs them, workflow-agents lists them, but there is no 'call agent X directly as a tool'. This is the net-new delegation surface: effectively Cluster E of the in-pi tool-surface-completeness program (after A write / B read / C onboarding / D validator) and the capstone of DEC-0014 — the in-pi LLM gains delegate-to-typed-subagent, not just read/write/query. The introspect bridge (agentContract) already exists. Sits on a stable pi-context (agents read/write substrate + draw contextBlocks via the hardened tools; discovered + understood through list-tools + the FGAP-085 / FGAP-095 self-describing surface). Sequenced AFTER pi-context solid + merged (FGAP-074 rename -> FGAP-095 onboarding -> merge). Gated by DEC-0044 (registration home) + the introspect->tool-shape contract.
"""

SOURCE: .project/features.json
QUOTE: """
The safety/capability layer that sits atop FEAT-004 (agents-as-tools dispatch). FEAT-004 makes a subagent invocable as a typed tool call by the main context agent; THIS feature governs WHAT that subagent may do. Model (user-articulated 2026-05-24): a subagent is a programmatic action — a tool call carrying atomic context chunks composed into prompt shape (already supported: pi-jit-agents compile boundary + contextBlocks + introspect agentContract tool-shape projection). The subagent receives its OWN tools, JIT-composed per invocation, scoped to EXACTLY the operations the task needs and no others — e.g. the right to run a specific command (`npm test`) rather than the `bash` tool wholesale; a specific file path to read/write rather than read/write generally. Default is EMPTY: no perms, no tools; configs + schemas + macros materialize the exact capability grant from empty state (generalizing DEC-0015/0011/0025 empty-state-config-driven philosophy from the substrate dir to the agent/tool/perm surface). Capabilities drawn from a tool+permission REGISTRY, atomically composable into a per-dispatch bundle, and ideally sandboxed (fs/network jail around the subprocess). Pairs with DEC-0047 (constitutional capability model) which makes the registry + its composition human-ratified config (legislative), the main agent's dispatch executive, and validators/monitors judicial.
"""

SOURCE: .project/features.json
QUOTE: """
Empty-state default: a subagent with no declared capabilities can do nothing; all capability arrives via config/schema/macro composition (no ambient tools/perms)
"""

SOURCE: .project/features.json
QUOTE: """
The ideal state (user-articulated 2026-05-25): a tools-only constrained in-pi orchestrator (DEC-0014, NO code/bash perms) authors a typed work-order/spec BLOCK via the substrate write tools; dispatches a privileged JIT-agent (spec-implementer-class: file write/edit + exactly-scoped command perms) that consumes the spec via contextBlocks; the agent makes ACTUAL source edits; the change is validated by an REAL DETERMINISTIC CHECKS (build/check/test exit code + runtime-demo + adversarial-against-artifacts per DEC-0018 — NOT LLM-self-report, FGAP-102); and the validated change is committed with DispatchContext agent-authorship attestation through husky. Net: a constrained agent can cause VALIDATED code changes through a privileged, governed, real-check-validated delegate without ever holding raw code-write or bash itself. Most of the mechanism already ships (self-implement.workflow.yaml skeleton + spec-implementer agent + contextBlocks injection + command/gate primitives); what remains is the ASSEMBLY, the real-check validation tail (FGAP-102), the capability scoping/clamp (FEAT-005 + FGAP-099), the dispatch-as-tool surface (FEAT-004), and the constitutional governance (DEC-0047). Includes defining the orchestrator-authored executable work-order block kind + its contextBlocks handoff (the spec-block-as-implementation-prompt; specs are self-contained coding prompts) — today the loop passes specs as transient workflow input, not a persisted orchestrator-authored block.
"""

SOURCE: .project/features.json
QUOTE: """
Agent consumes the spec via contextBlocks and makes real source edits
"""

SOURCE: .project/features.json
QUOTE: """
JIT skills — schema-shaped, macro-rendered, composable-on-demand guidance via contextBlocks; skill-blocks as single source projecting to SKILL.md + in-pi fragments
"""

SOURCE: .project/features.json
QUOTE: """
Vision (user 2026-05-25): skills join the JIT paradigm the rest of the system already runs on — agents JIT-compiled (pi-jit-agents), capabilities JIT-composed-from-empty (FEAT-005), context macro-rendered + injected (contextBlocks / render-item-by-id / templates macros), reads composed-to-need (FGAP-103). Today a skill is the ODD-ONE-OUT static markdown build-artifact (skill-narrative.md -> generate-skills -> SKILL.md). JIT skills = skill-blocks (schema-shaped substrate) rendered via Nunjucks macros, composed on demand scoped to need, delivered through the SAME contextBlocks channel as substrate data. SINGLE SOURCE / TWO PROJECTIONS: skill-blocks -> macro -> (a) SKILL.md for the external/marketplace+Claude-Code surface (replacing hand-written skill-narrative), (b) composable contextBlock fragments for in-pi JIT delivery. Unifies agents+skills as two instances of ONE JIT prompt-artifact compilation primitive in pi-jit-agents (DRY — the recurring 'don't repeat the code for different things'). REFRAMES FGAP-090 as ROUTE C, superseding its A/B fork (A inject-static-skills = always-on budget cost; B fold-into-descriptions = no home for cross-cutting guidance): JIT guidance is composed-when-relevant and reaches the agent without either cost. RELIEVES (does not kill) FGAP-085 — descriptions stay lean discovery+grounding; depth lives in composable skill-blocks. Intersects FGAP-103 (element-read of skill fragments — no read-all-or-nothing on skills), FGAP-101 (progressive), FGAP-090 (delivery solved). Generalizes the empty-state-config-driven philosophy (DEC-0015/0011/0025) from substrate/agents/capabilities to GUIDANCE itself. OPEN DESIGN FORK (UNSETTLED — must be decided before/at implementation; this FEAT carries the question, not the answer): WHO composes and WHEN. (a) COMPILER-COMPOSES — the dispatching context selects relevant skill-blocks and injects them at compile/dispatch time, declaratively (like agent contextBlocks: the agent spec / dispatch names the skills it n
"""

SOURCE: .project/features.json
QUOTE: """
Skills are the last static, non-JIT surface in a system where everything else is schema-shaped data + macro-rendered + composed-from-empty-to-need. Folding skills into that paradigm: makes authored guidance actually REACH the in-pi agent (closes FGAP-090, which today gives the agent zero passive benefit from the whole skill-narrative investment); is DRY (one schema'd source, two projections, one compile primitive shared with agents); and makes guidance composable/scoped rather than a monolithic blob. It is the capstone of the JIT/constitutional arc applied to guidance.
"""

SOURCE: .project/features.json
QUOTE: """
Skill-blocks render to prompt text via Nunjucks macros, reusing the existing macro system (no new bespoke renderer)
"""

SOURCE: .project/features.json
QUOTE: """
Skill fragments are delivered to the in-pi agent via the contextBlocks channel — verified in a live constrained-pi session that the composed guidance is in the agent's reported context (the FGAP-090 empirical test)
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Monitor specs today live as `.pi/monitors/<name>.monitor.json` with ad-hoc shape (classify.agent + collectors), classify templates as `examples/<name>/classify.md` with handcoded `{% if %}` guards on context variables. Monitor write-actions bypass block-api (issue-065 — silent schema drift from destination blocks). Under the unifying heuristic monitor specs become typed blocks: monitor.schema.json captures the spec contract (collectors, classify routing, write actions); validateMonitor() lives in pi-project SDK as a peer to validateProject() and validateRelations(). Classify templates declare typed contextBlocks (per DEC-0008) flowing through the same composition layer (DEC-0007) as workflow agents. Surfaced as gap #36.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Land monitors.json (flat block) or monitors/ subdirectory (only if DEC-0009 enacts subpath form, which is the rejected direction under the heuristic) + monitors.schema.json + validateMonitor() in pi-project SDK. Monitor write-actions route through block-api appendToBlock for any destination block they target (closes issue-065). Classify templates adopt typed contextBlocks (DEC-0008). Resolution coupled to DEC-0007 (composition contract for classify-prompt assembly) and DEC-0009 (storage primitive direction).
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
compileAgent's contextBlocks loop today reads each declared block unconditionally; no applicability filter at the compile boundary.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
loadLensView reads exactly one block via lens.target; renderLensView emits one heading-per-bin; no codepath for multi-target or lens-id resolution.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Extend LensSpec with kind: 'target' | 'composition' (discriminator), targets: string[] (when composition; pulls items from multiple blocks), members: array of either { lens: <id> } (sub-lens reference) or { from: <block>, where: <field-equality> } (flat selection). config.schema.json oneOf-enforces the kind-discriminated union. resolveComposition(cwd, lens) SDK function recurses sub-lens references with cycle detection (composition_cycle_detected diagnostic). loadLensView dispatches on lens.kind. renderLensView emits per-member subsections for composition lenses. validateRelations gains lens-graph cycle detection on relation_type='lens_member'. Closes the substrate-shape gap that the roadmap/plan substrate proposal demands.

CLOSURE (agent/step-8.5-orchestrator 2026-05-09T23:58:13.827Z): Structurally closed by `3625758` (Step 5 lens-view + composition lens dispatch + resolveComposition with cycle detection) — partially closed; 2 residuals filed as FGAP-022 (renderLensView per-member subsections) + FGAP-023 (validateRelations composition cycle detection). LensSpec extended with kind/targets/members; resolveComposition with cycle detection; loadLensView dispatches on lens.kind. Two refinement residuals (renderLensView per-member subsections + validateRelations composition cycle detection) filed as FGAP-022/023 per audit. Description text above preserves the forensic record of the pre-closure state.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
renderLensView, renderRoadmap (proposed), renderPlan (proposed), and any future projection renderer emit complete markdown with no pagination boundary. truncateHead (used by read-block via @mariozechner/pi-coding-agent) is intentionally NOT applied — full markdown is the contract; truncation defeats compositional projection. At small scales (≤10 phases per roadmap, ≤50 items per phase, ≤200 items per plan) this fits comfortably under typical context windows. At larger scales it overflows. The substrate currently has no primitive for: (a) page/section selection (render only phase X of roadmap Y), (b) summary-vs-detail rendering modes, (c) lazy materialization of nested compositions. Affects every aggregation primitive; particularly acute for the proposed roadmap/plan compositions.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
renderLensView emits all bins + items unconditionally; no pagination params; no summary mode.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Add optional render-time params to renderLensView/renderRoadmap/renderPlan: { detail: 'summary' | 'full', limit?: number, offset?: number, focus?: string[] (bin or item ids to render exclusively) }. SDK functions return paginated markdown with explicit cursor metadata (nextOffset, totalCount). Tool wrappers expose the params so LLMs can request specific sub-views. renderRoadmap's mermaid graph stays full (DAG topology rendering is cheap); per-phase item tables paginate. renderPlan's dependency graph stays full; item table paginates. Add a count-only mode that returns just the structural shape (phase names, item counts, status rollup) without item content. Filed forward per mandate-007 even though not currently triggered.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
renderLensView does not emit per-member subsections for composition lenses
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
renderLensView at packages/pi-context/src/lens-view.ts:100 detects composition via view.lens.kind === 'composition' and emits a header line stating 'composition over N member declaration(s)', but bin grouping uses view.grouped.get(bin) which projects items as a flat union. The composition's perItemOrigin map (populated by resolveComposition with member-source tags per item) is not consumed by the renderer. Output flattens membership; readers cannot see which member contributed which items.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Line 100-130 renderLensView body: composition path emits target/relation_type/source header lines but bin iteration (lines 125-130) operates on view.grouped without member dimension. perItemOrigin from ResolvedComposition is unused in this function.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
ResolvedComposition.perItemOrigin: Map<string, string> exists in the resolveComposition return type and tracks member-source per item id, but renderLensView does not access it.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Extend renderLensView to: (a) consume view.lensView.perItemOrigin or accept a ResolvedComposition reference alongside LoadedLensView for composition-kind lenses; (b) emit a per-member subsection (## Member: <member-id>) before the bin-grouped items contributed by that member; (c) annotate items appearing in multiple members with origin tags. Surfaced by adversarial audit of FGAP-012 closure (commit 3625758).
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Without dogfood-completeness as the criterion, substrate-arc work can ship as 'complete' while structurally inoperable for the consumer the substrate is built for. Concrete near-term consequence: v0.25.0 release (Task #12 / Step 10) could ship with all currently-enumerated FGAPs closed, all 4 packages tests green, all docs aligned, and a fresh-repo harness-confined main LLM still cannot author + execute its own arc because (a) filter-block-items doesn't exist (90 issues, can't query); (b) workflow-execute is subcommand-only (can't dispatch out-of-substrate work); (c) arc-tracking blocks (roadmap/phase/tasks/relations/config) have no concrete instances; (d) per-item read returns location not payload; etc. Step 9 (adversarial audit) and Step 10 (release) currently lack the dogfood-dispatch gate that would catch this. The rebuild arc could declare itself complete and ship a v0.25.0 npm publish that immediately surfaces as inoperable on first user dispatch.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Without bidirectional traversal, work-unit context cannot be gathered — backward edges from a unit to its constraining/motivating context are invisible. Under DEC-0014/0016 dogfood-completeness lens, work-unit dispatch is undispatchable because the orchestrator cannot ask 'what context informs this unit'. Cascades through DEC-0017 dependencies: FGAP-031 (gather primitive) needs FGAP-029; FGAP-032 (contextBlocks item-level selectivity) needs FGAP-031.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Item-level contextBlocks selectivity missing in pi-jit-agents — currently injects whole blocks, not work-unit-driven item selections
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
DEC-0017 specifies dispatch-time injection: agents receive context bundles as composed inputs, not as N whole-block dumps. Today pi-jit-agents' contextBlocks injection mechanism (DEC-0008 typed contextBlocks form) injects WHOLE BLOCKS — agent's compileAgent template gets the entire decisions.json under {{ _decisions }}, not just the decisions reached via gather-execution-context for THIS work-unit. Bundle from FGAP-031 is structured but injection is unstructured-dump.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
compileAgent reads contextBlocks declarations + injects whole block content under {{ _<name> }} variables. No mechanism to inject item-level selections driven by a work-unit's gather-execution-context output. Per the runtime-step-context analysis (analysis/2026-04-15-runtime-step-context.md) this gap was named earlier as 'agent spec must declare contextBlocks with item-level selectivity'.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
AgentSpec.contextBlocks current shape per DEC-0008: typed object form { name, item?, focus?, depth? } — item field exists at type level but is per-block-static, not per-dispatch-derived from a work-unit gather.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Extend AgentSpec.contextBlocks shape to support work-unit-driven gather: { name, gather_for_unit?: { unitId, kind } } — when gather_for_unit is present, compileAgent calls gather-execution-context(unitId, kind) and injects the bundle as { _<name>_bundle: ContextBundle } variable. Templates reference _<block>_bundle.perRelationType.<relation_type>[] for selective rendering. Existing per-item macros (per the macros-as-prompt-substrate work) consume the bundle's per-relation-type collections. Backward compatible: existing { name, item?, focus?, depth? } usage unchanged; gather_for_unit is additive.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
File six new block_kinds in packages/pi-context/registry/schemas/: cascade-target.schema.json (per-site cascade table rows: file/line/helper-or-inline/tmpdir-contents/first-resolver-cascading-call/classification/justification); audit-result.schema.json (pattern + hit-count + per-hit classification); arc-cross-ref.schema.json (concern-source pointer to existing arc planning); import-chain.schema.json (per-file direct + transitive pi-context reach registry); investigation.schema.json (id + question + target + status + results-pointer for Explore dispatches); brief-history.schema.json (composer-run log: extractors + params + substrate-state SHA at composition). Cascade: each affected scripts/orchestrator/* script writes via file-block-item.ts (or programmatically via block-api); downstream composers replace extract-markdown-section.ts calls with readBlock + filter. Markdown-rendering becomes display-only (substrate is canonical; markdown is a view). Same dual-direction pattern as DEC-0019: filing each block_kind surfaces additional gaps in macros library + per-item rendering; closures feed back to REVIEW-001 + tool-surface gap audit.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Per-block-kind Nunjucks macros missing for 6 newer block kinds — decisions / spec-reviews / features / framework-gaps / layer-plans / research
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md provides one Nunjucks rendering macro per supported block kind (current set is derivable from the file). Six newer block kinds shipped after macros.md was last refreshed do not have per-item rendering macros: decisions, spec-reviews, features, framework-gaps, layer-plans, research. The contextBlocks injection mechanism (compileAgent reads contextBlocks via readBlock + injects with framework anti-injection delimiters into Nunjucks context as `_<name>`) IS implemented and works for any block — but without per-block-kind macros, JIT agent templates cannot render the injected block items as readable markdown in the agent prompt. Symptom: REVIEW-001 (jit-agents-spec.md spec review) sits status: not-started gated on render_decision per CLAUDE.md note; the same gating implicitly blocks any JIT agent that wants to receive decisions / spec-reviews / features / framework-gaps / layer-plans / research as contextBlocks-injected prompt material. No actionable FGAP previously enumerated the macro set as work; only the REVIEW-001 symptom captured one instance.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
single-source of per-block-kind rendering macros; absent macros for the 6 listed kinds
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Notes: 'Per-item macros for newer block kinds (decisions, spec-reviews, features, framework-gaps, layer-plans, research) are pending — REVIEW-001 is gated on render_decision.' — implicit gap declaration, not actionable FGAP
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
REVIEW-001 status not-started; cannot dispatch as JIT agent without render_decision macro
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
contextBlocks injection implemented; injection works for any block; gap is at the macro layer not the injection layer
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
block schema defines item shape that the missing render_decision macro would render
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
schema defines shape for missing render_framework_gaps macro
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
schema defines shape for missing render_feature macro
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
schema defines shape for missing render_layer_plan macro
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
schema defines shape for missing render_research macro
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
schema defines shape for missing render_spec_review macro
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Every JIT agent that needs to read substrate block items beyond the original macro-covered kinds is unable to receive those items as rendered prompt material. Concretely: any explore / review / audit / implementation agent that should know the current DEC canon, framework-gaps state, feature arcs, layer-plan structure, research findings, or prior spec reviews cannot be dispatched substrate-natively — those blocks can be injected as raw `_<name>` objects but the template author has no canonical macro to render them. Workaround paths (hand-author inline rendering in each agent template OR copy-paste block content into the system prompt) duplicate the macro logic per agent and defeat the single-source-of-truth principle that macros.md exists to enforce. Blocks REVIEW-001 directly; blocks the dogfood-dispatchability gate (FGAP-028) for any agent that requires the listed blocks; blocks the future canonicalization of orchestrator briefs as JIT-agent specs (which would dispatch with DEC + framework-gaps + feedback substrate injected).
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Nunjucks template macro library — per-record-type rendering primitives
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Ship six per-block-kind macros in packages/pi-workflows/templates/shared/macros.md: render_decision, render_spec_review, render_feature, render_framework_gap, render_layer_plan, render_research. Each macro accepts the corresponding block-item record (per the registry schema's array_key item shape) and emits markdown rendering the canonical fields with stable heading levels + field ordering. Authoring discipline: schema-driven field enumeration (every required field rendered; optional fields rendered when present); per-block-kind sample fixtures committed for round-trip golden tests. Per CLAUDE.md authoring convention each schema's per-item macro lands as a single unit of work alongside the schema. Decision deferred: macro testing harness — currently macros.md macros are tested by full-template render tests, no per-macro unit tests; decide whether per-macro unit tests land alongside the new macros OR after as a separate testing-gap FGAP.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
scripts/orchestrator/compile-explore-context.ts and compile-implementation-context.ts accept --required-reading <full-file-paths> only — they cannot inject specific substrate items at item-level granularity natively in the composer. Result: Explore agents see full files (or worse, free-form preamble) but not the specific FGAP-035 record, TASK-031 record, DEC-0015 record that constitute the binding context. In pi-runtime the equivalent is FGAP-032 (item-level contextBlocks selectivity in pi-jit-agents). Claude Code orchestrator-side has the same shape of gap with no covering FGAP before this one. Per DEC-0019/0020 dual-surface, both layers need item-level injection. The script doubles as schema-shape discovery test surface: building it forces decisions on selector syntax (block:id vs structured JSON), projection shape (full item / projected fields / macro-rendered), output format (markdown requires macros — FGAP-037; raw JSON; XML-tagged).
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
FGAP-032 captures pi-runtime side (item-level contextBlocks); FGAP-038 is the Claude Code-side counterpart
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Add scripts/orchestrator/inject-context-items.ts. Args: --items <block:itemId,...> selector list + --format <markdown|json|xml> output mode + optional --fields <fieldList> projection. Output: structured context-block content for inclusion in compile-explore-context.ts / compile-implementation-context.ts via a new --context-items arg, or piped directly into Agent prompt. Per FGAP-037 dependency: markdown format requires per-block-kind render macros.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
read-block returns the entire block's JSON. Large blocks (decisions ~109KB, framework-gaps growing similarly) force whole-file fetch even when the caller wants one item. resolve-item-by-id covers by-ID lookup; filter-block-items covers predicate filter; but there's no read-block-item(block, id) for direct item fetch by ID without the block roundtrip, and no paginated read for blocks too large to inject. Distinct from FGAP-014 (pagination in renderers like renderLensView / renderRoadmap) and FGAP-032 (item-level INJECTION at JIT-agent dispatch via contextBlocks selectivity). This is item-level READ at the tool API surface for harness-confined main LLM consumption.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
FGAP-014 (renderer pagination) + FGAP-032 (item-level contextBlocks injection at dispatch) are adjacent but distinct — neither covers tool-API item-level read
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
(1) Substrate-wide audit of every registry schema's array<string> fields; classify each as data-field OR FK-array. (2) For each FK-array: migration to relations.json closure-table edges with declared relation_type (depends_on / related / etc.) registered in config.relation_types[]. (3) Schema modifications via schema-migrations.ts version bumps removing the inline array. (4) Existing block items: per-item migration writing the inline values as relations.json edges + removing the inline field. (5) Migration scope tied to Phase 5 + 6 of FGAP-026 closure; FGAP-040/041/046 + future-discovered instances share the same migration arc — file each surfaced instance against this canonical pattern; do not relitigate per-field.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
The LLM-filed Phase 5 sub-phase decomposition (analysis/2026-05-10-fgap-026-closure-sub-phase-structure.md line 14: 5.1 config / 5.2 relations / 5.3 roadmap / 5.4 phase / 5.5 context-contracts / 5.6 tasks-phase-edges) assumed vocabulary was settled but no upstream settlement step was filed. Concretely unsettled: (1) display layer — block-kind display_name + per-item ID-prefix display rendering have no canonical settlement; (2) ID prefix conventions — padding (3-digit vs 4-digit), casing (uppercase vs lowercase) have observed drift (see FGAP-048); (3) relation_type canonical_ids — DEC-0013 forced relation_type registry but no relation_types are declared anywhere except code test fixtures (phase_depends_on / phase_member); (4) lens ids — config.lenses[] would carry projection definitions but no lens-id naming convention exists; (5) layer registry — L1..L5 referenced in FGAP layer field but no .project/schemas/layer.schema.json or config.layers[] populated (FGAP-016 was closed but the registry remains unauthored); (6) status-bucket mapping — FGAP-021 tracks the 4 divergent lifecycle vocabularies (workflow-state / gate-state / authority-state / authoring-state) reconciliation but no status_buckets[] declared. Result: Phase 5 sub-phase 5.1 (config.json authoring) cannot proceed coherently — every block_kinds[] / relation_types[] / lenses[] / layers[] / status_buckets[] entry needs a settled convention before being authored.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
DEC-0015 substrate-canon claim is partially delivered. User attempting to set up custom work-altitude scheme (e.g. roadmap → milestone → epic → story → task → subtask) purely through config + schemas + macros would find that declarations parse and AJV-validate but produce no runtime altitude-aware behavior. Cross-package consumers (pi-workflows / pi-behavior-monitors) cannot rely on config.layers[] for any decision-making. The framework intention/reality gap is not currently visible as substrate. Phase 5 sub-phase 5.1 (config.json authoring) would surface this if config.layers[] is populated — the entries would have no consuming behavior. Cross-decision with FGAP-016 (closed) which surfaced similar declaration-without-consumer pattern for enum vocabularies.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Vocabulary-neutrality claim of DEC-0025 partially undelivered. User cannot adopt pi-context with wholly-different substrate conception purely through config + schemas + macros — the const remains as a framework default-vocabulary commitment in source. Tools relying on PROJECT_BLOCK_TYPES (e.g. /project init scaffolding) cannot scaffold a fully-custom substrate without code change. Cross-package consumers (pi-workflows, pi-behavior-monitors, pi-jit-agents) that reference PROJECT_BLOCK_TYPES inherit the same coupling.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Macro library bootstrap missing for user-added block kinds — framework provides canonical kinds' macros only; user-added kind has no scaffolding for vocabulary-neutral substrate
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Per DEC-0025 (vocabulary-neutral substrate canon), user must be able to author any block kind via config + schema + macro and have pi-context's machinery operate on it. packages/pi-workflows/templates/shared/macros.md ships per-block-kind Nunjucks render macros for canonical kinds (decisions / framework-gaps / etc.); FGAP-037 tracks 6 missing macros for canonical kinds. Beyond that gap: user-added block kinds (e.g. 'initiatives' / 'OKRs' / 'experiments' for a different substrate conception) have no canonical scaffolding pattern — no documentation of macro shape, no template generator, no auto-fallback rendering for kinds without dedicated macros. Result: even if user installs custom block kinds via config + schemas, prompt-injection rendering (block injection per DEC-0017 contextBlocks pattern) cannot proceed without authoring per-kind macros. Framework's vocabulary-neutrality claim is partially undelivered at the prompt-substrate layer.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Per-block-kind render macros — only for canonical kinds; FGAP-037 enumerates 6 missing among canonical set
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
FGAP-037 macro library coverage gap for canonical kinds; FGAP-057 extends to user-added kinds
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
contextBlocks injection assumes macro per block kind exists; no fallback for user-added kinds
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
DEC-0025 vocabulary-neutral substrate canon principle — implies macro library must support arbitrary user-defined kinds
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
User adopting pi-context with non-default substrate conception cannot inject their custom block kinds into agent prompts via the canonical contextBlocks pattern without authoring macros per-kind. No documentation guides what macro shape to author. No fallback render exists when macro absent (silent fail or template error). Vocabulary-neutrality is partially blocked at the prompt-substrate layer; downstream effect: in-pi LLM operating on user-defined substrate cannot receive context-block-injected prompts for those user kinds.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
macro-library-bootstrap, user-added-block-macro, fallback-render, prompt-substrate-vocabulary-neutrality
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Three-part: (a) Document the canonical macro shape — what fields a render macro must accept (block items array; injection delimiters; budget hints); add a 'authoring custom block macros' section to skill-narratives + CLAUDE.md. (b) Auto-discovery — pi-jit-agents compile-time looks for macros in three-tier search (.pi/templates → user templates → package); user drops a macro file matching kind name and framework picks it up. Already partially implemented per CLAUDE.md three-tier mention; verify cascade works for user-added kinds. (c) Fallback render — when no macro exists for a kind, framework auto-generates a minimal render (item iteration + key-value output) with a warning surfaced via execution-context diagnostics; prevents silent fail. Cross-decision with FGAP-037 (canonical-kind macro coverage) — same workstream extends to user-added kind support.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Per DEC-0025 (vocabulary-neutral substrate canon), a user with wholly-different substrate conception (e.g. {initiatives, OKRs, experiments, decisions, tasks, runs, observations} OR {hypotheses, experiments, results, papers, datasets} OR any other vocabulary) must be able to clone pi-context, author their own config + schemas + macros, and have the framework operate on their vocabulary without source modification. This claim is currently untested. pi-context's existing test suite (390 tests) exercises the framework against canonical-default vocabulary (decisions / framework-gaps / tasks / etc.) — every test fixture authors substrate using PROJECT_BLOCK_TYPES kinds. No test instantiates a fully-different substrate conception + exercises block-api / lens / closure-table / query primitives / execution-context against it. Result: claim is asserted (in DEC-0025) but unevidenced. Any latent coupling between pi-context source and the canonical-default vocabulary remains undiscovered until a real user attempts a vocabulary-neutral adoption + finds the gap.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
FGAP-056 (PROJECT_BLOCK_TYPES const) + FGAP-057 (macro bootstrap) — the surfaces a vocabulary-neutral test would exercise + likely fail against currently
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Author a fixture-based test that: (a) creates a tmpdir with .pi-context.json bootstrap pointer naming a custom dir (e.g. .lab/); (b) populates .lab/config.json + .lab/schemas/ + .lab/<custom-kinds>.json with a wholly-different substrate vocabulary (e.g. {hypotheses, experiments, results, datasets, papers}); (c) exercises block-api appendToBlock / readBlock / upsertItemInBlock against custom kinds; (d) declares custom relation_types in config.relation_types[] + populates .lab/relations.json with edges; (e) declares custom lens in config.lenses[] + verifies groupByLens projection works; (f) authors custom macro under .lab/templates/ + verifies pi-jit-agents contextBlocks injection picks it up; (g) calls gather-execution-context for a custom unit_kind via custom CTX-NNN context-contract + verifies bundle composition. Test failure cases reveal coupling sites; each becomes a code-path migration to vocabulary-neutral pattern. Lives at packages/pi-context/src/vocabulary-neutrality.integration.test.ts (analogous to execution-context.integration.test.ts which exists per Phase 3 Step 8.7.3.3). Cross-decision with FGAP-056 + FGAP-057 — those gaps surface DURING this test authoring; their resolution gates this test passing.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
validateProject (project-sdk.ts ~860-975, machinery unit 2.1 / commit 73e568d) hardcodes two substrate invariants: (1) completed-task-has-verification — every task status=completed requires ≥1 verification_verifies_item edge (child=task); (2) decision-cites-forcing-artifact — every decision requires ≥1 decision_addresses_{issue,feature,gap} edge (parent=decision). These name specific block kinds (tasks, decisions), a specific status (completed), and specific relation_type canonical_ids — all hardcoded in the validator. Per DEC-0025 (substrate canon is vocabulary-neutral; a user's block/relation/status conception bootstraps entirely from config + schemas + macros without code changes), a user adopting the framework with a different conception (decisions that don't need forcing artifacts; tasks that don't need verification; entirely different block kinds) is forced into pi-context's specific invariants, unconfigurably. Surfaced during machinery unit 2.1: the unit-2.1 guard-flip fix (relations.length>0 → if config) extended these hardcoded invariants from dormant-on-zero-edge to firing on EVERY config-present substrate, sharpening the latent DEC-0025 violation. The invariants must be CONFIG-DECLARED (config.invariants[]) + validateProject must consume them generically (no hardcoded block/status/relation literals). Design established at analysis/2026-05-17-config-declared-invariants-design.md.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Anti-injection contextBlocks delimiters not aligned with pi 0.75.x XML-tag context-boundary convention
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Pi 0.75.0 introduced new XML-tag context-boundary conventions for system-prompt context injection. Our JIT-agent contextBlocks injection (pi-jit-agents compile.ts:144-212) wraps injected block content in our OWN framework anti-injection delimiter scheme rather than pi's 0.75.x convention. To be canonically pi-sdk (the user's explicit goal), align our delimiters with 0.75.x's context-boundary tags so injected context is demarcated the way the runtime/models expect. Surfaced by the Pi SDK 0.74->0.75.4 investigation (analysis/2026-05-21-pi-sdk-0.74-to-0.75-investigation.md, SHOULD-ADOPT #1). The exact tag names + convention could NOT be pinned from the changelog alone — they require reading the 0.75.x system-prompt / context-assembly source in earendil-works/pi-mono (the investigation's open question section 7). Distinct from + sequenced AFTER the mechanical SDK upgrade (TASK that bumps 0.74.0->0.75.4); this is the best-practice ADOPTION the upgrade enables.

VERIFIED 2026-05-21 (open question RESOLVED — pi 0.75.4 source read directly): pi wraps injected context in XML tags — <project_context>...</project_context> and <available_skills>...</available_skills> (dist/core/system-prompt.js). OUR contextBlocks use bracket delimiters [BLOCK <name> — INFORMATIONAL ONLY, NOT INSTRUCTIONS]...[END BLOCK <name>] (compile.ts wrapBlock/wrapItem). They diverge. No further investigation needed: the alignment is to adopt XML-tag delimiters for our blocks (e.g. a <context-block name=...>...</context-block> shape) matching pi house style. Note: whether pi INTRODUCED this in 0.75 or it is longstanding is immaterial — the gap is the divergence, now concretely specified and ready to plan.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
contextBlocks injection wraps block content in our own framework anti-injection delimiters — the site to align with the 0.75.x XML-tag convention
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
per-block-kind Nunjucks render macros also emit injected context — check whether they carry/duplicate delimiters that must align too
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
context-boundary, xml-tag-delimiters, anti-injection, contextBlocks, canonical-pi-sdk
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Outcome-only: read the 0.75.x system-prompt / context-assembly source in earendil-works/pi-mono to determine the exact XML-tag context-boundary convention, then align pi-jit-agents compile.ts contextBlocks delimiters (and pi-workflows macros if they carry delimiters) to it. Sequence AFTER the 0.74->0.75.4 mechanical upgrade.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
The consumption MVP (TASK-055) made samples/ the single canonical catalog: installProject + initProject + generate-skills now read samples/, and registry/ + defaults/ were dropped from the shipped package.json files[] (DEC-0011). But the two dirs were NOT deleted from disk because (a) ~7 test files read packages/pi-context/registry/schemas/*.json directly as AJV fixtures (schema-validator.test, context-contracts.test, execution-context.integration.test, index.test + pi-workflows macros/render-architecture/render-task tests) and (b) 8 schemas live ONLY in registry/ with no samples/ home (architecture, audit, conformance-reference, domain, handoff, plan, project, roadmap — legacy, absent from the going-forward DEC-0037 conception). So registry/ + defaults/ are now dead-but-present: unshipped, unread by production, retained solely as test fixtures + legacy-schema holding.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
docs/reports/pi-internal-verification-protocol-2026-05-02.md is the canonical step-12 (CLAUDE.md completion-sequence) credentialed pre-publish verification gate for arc-completion releases. It was authored for the v0.24.x substrate and cannot be executed verbatim against the current surface: (1) it invokes removed project-* tool names (project-status/project-validate/project-init) renamed to context-* by FGAP-074; (2) it dispatches via a removed bare `workflow` tool — the current dispatch tool is `workflow-execute`; (3) it gates credentialed sections on OPENROUTER_API_KEY, contradicting CLAUDE.md step-12's directive that the protocol uses pi's auth.json directly (no separate env-var gate); (4) it assumes `gtimeout` is on PATH for per-call timeouts (absent on the current machine — neither gtimeout nor timeout present); (5) it asserts on old substrate fixtures (DEC-0001..0005 exact set, REVIEW-001/spec-reviews findings counts) that the pi-context-rebuild re-derivation has moved past. Per the protocol's own 'or successor' clause, a successor is now required. For the v0.26.0 release a SCOPED credentialed smoke was run in lieu (read/derive/validate + write->read->remove round-trip through the renamed context-* and block tools, with real tool_execution events asserted and byte-identical baseline restore verified); the deferred portion is the full agent contextBlocks injection + credentialed agent-dispatch tier.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
The mandated step-12 pre-publish credentialed gate cannot be run verbatim for arc-completion releases, so each such release must improvise an ad-hoc scoped smoke (as v0.26.0 did) instead of executing a maintained, comprehensive, repeatable protocol. Without a successor, credentialed verification coverage silently narrows release over release, and the deferred agent-dispatch/contextBlocks injection tier (the deepest end-to-end credentialed path) goes unexercised at release time.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Author a successor protocol (e.g. docs/reports/pi-internal-verification-protocol-<successor-date>.md) that: uses context-* tool names + workflow-execute; sources credentials from pi's auth.json (no OPENROUTER_API_KEY gate); drops the gtimeout dependency (rely on the harness/Bash timeout); asserts against current .project substrate (or a disposable temp substrate it bootstraps via /context start); and includes the full agent contextBlocks injection + credentialed agent-dispatch tier deferred from the v0.26.0 scoped smoke — authoring the required fixtures under .project/agents/*.agent.yaml + .workflows/*.workflow.yaml (NEVER .pi/, per the no-touch rule; agent loader project tier is .project/agents/, workflow discovery is .workflows/), dispatching credentialed via workflow-execute, and asserting the <context_block role="data"> XML boundary + injected item content reach the model. Pin a fast model + restrict --tools per call (F-006 cost discipline). Use the v0.26.0 scoped-smoke transcript (docs/reports/v0.26.0-step12-scoped-credentialed-smoke-2026-05-25.md) as the tier-1 starting point.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
proof-of-mechanism that a SEPARATE audit process flips a status via an edge; valid/current generalizes this from task-verification to per-item bits
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Per R-0014 recon axis 3: Claude Code dynamic workflows docs explicitly enumerate 6 quality patterns (adversarial-verify / perspective-diverse / judge-panel / loop-until-dry / multi-modal-sweep / completeness-critic) with concrete script-snippet templates. pi-workflows can express most via existing step types (parallel + agent + transform + gate) but lacks: (a) bundled .workflow.yaml templates under examples/patterns/; (b) Nunjucks macro library for boilerplate (vote-aggregation; majority-survives filter); (c) SDK documentation referencing patterns + when to use each. Load-bearing session evidence: FGAP-135 CHECK 11 PARTIAL surfaced operational ambiguity in 3 TruncationResult edge-case variants; single-Explore adversarial probe self-categorized as 'low-risk'; orchestrator hand-waved past + user caught the violation. With a bundled adversarial-verify pattern (N independent skeptics + structured findings-schema vote-aggregation), the hand-wave would have been mechanically refuted by N-1 of N skeptics rather than depending on orchestrator judgment.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
quality-pattern templates; bundled-workflow library; vote-aggregation primitive; majority-survives filter; pattern-composition macros
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Add packages/pi-workflows/examples/patterns/ subdirectory with 6 starter .workflow.yaml templates (adversarial-verify / perspective-diverse / judge-panel / loop-until-dry / multi-modal-sweep / completeness-critic) per R-0014 axis 3 specs. Add Nunjucks macro library (templates/shared/quality-patterns.macros.md) for boilerplate (vote-aggregation across N findings sets; majority-survives filter; per-lens-perspective dispatch). Update pi-workflows skill-narrative + SDK docs to reference each pattern + when canonical. Workflow validation gates ensure patterns load cleanly. No source-code-language changes; YAML + macros + docs.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Wall-clock loss on heterogeneous workflows (per-file audits, per-FGAP closures, per-package scans). The pattern Claude Code calls 'streaming pipeline' is canonical for fan-out-with-per-item-progression but inexpressible in pi-workflows spec today.
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
streaming pipeline; per-item asynchronous stage progression; soft-barrier between stages; asymmetric concurrency
"""

SOURCE: .project/framework-gaps.json
QUOTE: """
Add a 'stream' step type OR a 'streaming: true' flag on the existing parallel step type. Spec example: steps.analyze-all: { stream: { stages: [read-file, check-syntax, report], forEach: <expression> } }. Executor implementation: collect per-item per-stage promises; resolution polls for ready-items in stage N+1 rather than waiting for layer N completion. Risk: spec semantics now include two parallelism models (DAG-layered + streaming) — operator must choose. Documentation must clarify when each is canonical. Significant refactor in dag.ts + workflow-executor.ts; lower-priority than ADOPT items but not deferred.
"""

SOURCE: .project/issues.json
QUOTE: """
Template composition (extends/blocks/macros) used in only 1 of 22 template families
"""

SOURCE: .project/issues.json
QUOTE: """
The Nunjucks template system supports extends, block, macro, and include — powerful composition primitives. Only the analyzers/ family uses them (structure/quality/patterns extending base-analyzer.md). The other 21 template directories are flat files with no composition. This means the template machinery is over-engineered relative to actual usage, OR the agent library is under-exploiting available composition. Agents like investigator, researcher, gap-identifier, and gap-resolution-assessor share structural patterns (read code → produce structured findings → validate against schema) that could share a base template.
"""

SOURCE: .project/issues.json
QUOTE: """
contextBlocks injection only reads static files — no support for computed blocks derived at dispatch time
"""

SOURCE: .project/issues.json
QUOTE: """
compileAgentSpec() reads .project/<name>.json for each contextBlocks entry. Blocks whose content is derivable from code (architecture, domain reference entries) go stale between writes. The injection path should support registered generator functions alongside static files — for derivable blocks, the generator runs at injection time, returning the same shape as the static block. Agent templates and shared macros are unaffected — they render whatever data they receive regardless of source.
"""

SOURCE: .project/issues.json
QUOTE: """
Monitor classify calls hand-roll template rendering, context injection, model resolution, and output parsing that the agent spec system already provides declaratively. Monitors have their own createMonitorTemplateEnv(), collectors parallel contextBlocks, parseVerdict() hand-parses what output.schema validates, and parseModelSpec() reimplements model registry resolution. A monitor's classify call IS an agent call — structured input, prompt template, model, structured output. Direction: monitors declare classify.agent referencing a .agent.yaml that defines the LLM call contract, executed in-process via direct complete() rather than subprocess dispatch. One spec format for all LLM calls, monitor-specific concerns (collectors, patterns, actions, ceiling) stay in .monitor.json, verdict format becomes output.schema with enum validation. Eliminates issue-024 (thinking block extraction) as a side effect since agent output pipeline already handles it. The agent spec parser and template compiler are the only pieces needed from pi-workflows — they could live in pi-project or a small shared package without moving the entire workflow engine. Rejected alternative: extracting shared infrastructure from pi-workflows into pi-project is unbounded refactoring that defers the design question behind a prerequisite wall.
"""

SOURCE: .project/issues.json
QUOTE: """
Workflow artifacts (ArtifactSpec in types.ts:18 — path, from, schema) write JSON files to disk. Block data is structured and schema-validated but only machine-readable. Extension: add a format field to ArtifactSpec (markdown, csv, html, yaml alongside json). The executor calls a format renderer after schema validation: JSON data → rendered artifact in the declared format. The shared macros system (templates/shared/macros.md) already renders block data as markdown — render_project, render_architecture, render_tasks, render_conventions, etc. The same pattern extends to CSV (tabular blocks like tasks, issues) and HTML (dashboards, reports). The rendered artifact is a view of the block data, editable in the format's native tool (spreadsheet opens CSV, browser opens HTML, editor opens markdown). The block remains the source of truth; the artifact is a rendered surface. This is the 'editable artifacts' rubric item from agent theory: outcomes require surfaces you can edit. The system is domain-agnostic — a tasks block rendered as CSV is a project management spreadsheet; an issues block rendered as HTML is a bug tracker dashboard; a verification block rendered as markdown is a progress report. The block schema defines the data contract; the format renderer defines the presentation. Users work on the surface; the block persists the truth. Note: artifacts are not coding-process outputs — the framework is outcome-agnostic. An artifact is any verifiable output from an agent or workflow: an updated spreadsheet, a lesson plan, research findings, a project report, a compliance audit, a meeting summary. The artifact format system must serve any domain, not just software development.
"""

SOURCE: .project/issues.json
QUOTE: """
packages/pi-workflows/src/types.ts:18, packages/pi-workflows/templates/shared/macros.md
"""

SOURCE: .project/issues.json
QUOTE: """
Monitors currently classify agent behavior (hedge, fragility, etc.) and write findings to the issues block via executeWriteAction() (index.ts:1312) with merge: append/upsert. Extension: a writeback monitor that fires on agent_end for any workflow step, reads the step's structured output, and determines what to record — decisions made, issues resolved, verification evidence, execution metadata. The classify call determines what category of result the agent produced. The write action persists it to the corresponding block (decisions, verification, issues, tasks). This closes the feedback loop: workflow reads blocks via contextBlocks → agent executes → writeback monitor observes output → monitor writes results back to blocks → next execution reads richer blocks. Each cycle compounds context. The monitor spec format, event system, classify.agent pipeline, and executeWriteAction with merge: upsert all exist. The new component is the writeback monitor spec, its classifier agent YAML, and the mapping from agent output categories to block write targets.
"""

SOURCE: .project/issues.json
QUOTE: """
The generated SKILL.md surfaces tools, commands, vocabulary tables (collectors, when conditions, verdicts), agent contracts (inputSchema, contextBlocks, outputFormat). It does not surface: what Nunjucks variables each classify template expects (patterns, instructions, iteration, plus each collector name), what each collector returns and in what format (e.g., tool_results returns '---\n[toolName] result\n---' blocks), what tuning commands are available per monitor (issue-038), how to inspect execution traces and debug failures (issue-036/037). Without these in the skill, the LLM can use monitors but can't tune them or debug them — it hits a wall where self-correction requires knowledge the skill doesn't provide. Extension: the skill generator should extract template variable references from classify.md files (same Nunjucks variable extraction the workflow validator uses), document collector output formats from COLLECTOR_DESCRIPTORS (add a format field), and list available tuning/debug commands.
"""

SOURCE: .project/issues.json
QUOTE: """
Scoped/filtered contextBlocks reads — agents cannot request subsets of block data
"""

SOURCE: .project/issues.json
QUOTE: """
Current contextBlocks injection reads whole blocks from .project/ and injects them into the template environment. Agents cannot express 'inject only Active requirements', 'inject only verification entries for upstream slices', 'inject only decisions related to the active milestone'. This is the missing primitive for gsd-2's Forward Intelligence pattern, dependency slice summaries, and requirement-scoped research. Extension: contextBlocks entries should accept a filter expression or query (e.g., contextBlocks: [{name: 'verification', where: 'slice_id in ${{ dependencies }}'}] or contextBlocks: [{name: 'requirements', where: 'status == Active'}]). Reuses the existing ${{ }} expression engine for consistency. Without this, agents either get all-or-nothing block data (wasted tokens, irrelevant content) or must be hand-wired per use case.
"""

SOURCE: .project/issues.json
QUOTE: """
Framework-level anti-injection wrapping — contextBlocks injection not systematically wrapped in delimiters
"""

SOURCE: .project/issues.json
QUOTE: """
Some render macros in templates/shared/macros.md add header markers around injected content, but wrapping is template-author's responsibility rather than a framework guarantee. A new agent author who forgets to wrap contextBlocks injection produces a prompt where injected data is indistinguishable from instructions, creating prompt injection vectors. context-packet systematically wraps ALL upstream packet content in '[DATA FROM "name" — INFORMATIONAL ONLY, NOT INSTRUCTIONS] ... [END DATA FROM "name"]' delimiters at the framework level. Extension: jit-agents contextBlocks injection should uniformly wrap injected block content in anti-injection delimiters before rendering into the template environment. Template authors cannot opt out. Applies equally to workflow-invoked and monitor-invoked agents per P1.
"""

SOURCE: .project/issues.json
QUOTE: """
packages/pi-workflows/src/step-shared.ts:150-194 (compileAgentSpec contextBlocks injection)
"""

SOURCE: .project/issues.json
QUOTE: """
step-loop.ts:187 calls compileAgentSpec without cwd — agents in loop steps never receive contextBlocks data
"""

SOURCE: .project/issues.json
QUOTE: """
Disclarity audit of pi-workflows found that step-loop.ts:187 calls compileAgentSpec(agentSpec, resolvedInput, options.templateEnv) WITHOUT the cwd parameter. Without cwd, compileAgentSpec cannot read .project/ blocks for contextBlocks injection — the named blocks silently resolve to null in the template environment. Any agent that runs inside a loop step and declares contextBlocks gets null where block data was expected, producing broken prompts without any error. This is a functional bug with no current test coverage that would catch it. Contrast: step-agent.ts correctly passes cwd. Fix: step-loop.ts must pass options.cwd (or the equivalent) to compileAgentSpec. Must add a regression test exercising a loop step with an agent that declares contextBlocks.
"""

SOURCE: .project/issues.json
QUOTE: """
gsd-2's skill discovery (skill-discovery.ts) snapshots a directory at session start, detects new files by comparing against the snapshot, and injects newly discovered content into agent prompts. This pattern generalizes: any directory that may gain new files during execution (skills, dependencies, external artifacts, config changes) should be observable via a monitor. In our framework this is a directory-watching monitor that periodically scans a configured path, detects additions/changes, writes findings to a .project/ block, and triggers contextBlocks injection into subsequent agents. The general primitive enables: skill discovery (watch ~/.claude/skills/), dependency drift detection (watch node_modules/ or lock files), external artifact arrival (watch a drop directory), config change propagation. Currently no monitor collector observes filesystem state outside .project/.
"""

SOURCE: .project/issues.json
QUOTE: """
POC v2's listUncategorized() + suggestionTemplate() in analysis/poc-degree-zero-lens/render.ts demonstrate the curation surface shape — emit would-be edge-append payloads for items in the (uncategorized) bucket of a hand-curated lens. The ceremony itself — a /project lens-curate <lensId> slash command that interactively walks uncategorized items, accepts bin assignments, and translates to batched appendToBlock writes against relations.json — needs registration in pi-project's command surface. Without it, lens curation is manual edge-authoring; with it, lens curation becomes a first-class workflow. Couples to DEC-0008 (typed contextBlocks) for lens-view rendering during curation, and to DEC-0007 (composition contract) for how the curation prompt itself is composed. Aligns with analysis/2026-05-01-ceremony-ideas.md sibling commands (/project new, /project new-phase, /project edit-item, /project archive-item). Surfaced as gap #15 in the heuristic-widening pass.
"""

SOURCE: .project/issues.json
QUOTE: """
Resolved in commit ad03a00 — feat(pi-project): substrate consumption surface. /project view + /project lens-curate subcommands plus project-validate-relations + project-edges-for-lens + project-walk-descendants pi tools registered, all built on a new lens-view.ts pure-function module (loadLensView, renderLensView, buildCurationSuggestions, validateProjectRelations, edgesForLensByName, walkLensDescendants). 17 new tests; pi-project workspace at 256/256.
"""

SOURCE: .project/issues.json
QUOTE: """
Cycle handling composes between walkDescendants visited-guard and render_recursive depth-guard
"""

SOURCE: .project/issues.json
QUOTE: """
Integration map proposes templates combining walk_descendants() (Nunjucks global) with render_recursive(resolve(id), depth) per per-item-macros plan. POC v2's walkDescendants has a visited-guard preventing infinite traversal at edge-walk time. Per-item-macros' render_recursive has a depth-guard. The two guards must compose when authored relations contain cycles: walk-level visited prevents revisiting; depth-level guard prevents infinite recursion at render. Markers module (residual-debt survey item 9) emits [cycle: <id>] markers — tests against named constants. Without explicit composition, cyclic data could fail to render certain items (silent non-render) instead of emitting the cycle marker. Trace: cycle in authored edges → walk halts at visited → some items not visited → silent non-render vs marker emission. Surfaced as gap #27 in the integration-map review.
"""

SOURCE: .project/issues.json
QUOTE: """
Resolved in commit ad03a00 — feat(pi-project): substrate consumption surface. /project view + /project lens-curate subcommands plus project-validate-relations + project-edges-for-lens + project-walk-descendants pi tools registered, all built on a new lens-view.ts pure-function module (loadLensView, renderLensView, buildCurationSuggestions, validateProjectRelations, edgesForLensByName, walkLensDescendants). 17 new tests; pi-project workspace at 256/256.
"""

SOURCE: .project/issues.json
QUOTE: """
Resolved in commit ad03a00 — feat(pi-project): substrate consumption surface. /project view + /project lens-curate subcommands plus project-validate-relations + project-edges-for-lens + project-walk-descendants pi tools registered, all built on a new lens-view.ts pure-function module (loadLensView, renderLensView, buildCurationSuggestions, validateProjectRelations, edgesForLensByName, walkLensDescendants). 17 new tests; pi-project workspace at 256/256.
"""

SOURCE: .project/issues.json
QUOTE: """
Resolved in commit ad03a00 — feat(pi-project): substrate consumption surface. /project view + /project lens-curate subcommands plus project-validate-relations + project-edges-for-lens + project-walk-descendants pi tools registered, all built on a new lens-view.ts pure-function module (loadLensView, renderLensView, buildCurationSuggestions, validateProjectRelations, edgesForLensByName, walkLensDescendants). 17 new tests; pi-project workspace at 256/256.
"""

SOURCE: .project/issues.json
QUOTE: """
render_roadmap + render_plan macros in packages/pi-workflows/templates/shared/macros.md for contextBlocks injection
"""

SOURCE: .project/issues.json
QUOTE: """
Step 7. Per-block-kind render macros following the existing pattern in packages/pi-workflows/templates/shared/macros.md. Add render_roadmap(roadmap) and render_plan(plan) Nunjucks macros so workflow agents can declare contextBlocks: [roadmap, plan] and have rendered roadmap/plan markdown injected into their prompts. Closes the agent-prompt-substrate side of the substrate-arc thesis for these new block kinds.
"""

SOURCE: .project/issues.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md
"""

SOURCE: .project/research.json
QUOTE: """
Blocks as prompt substrate — rendering infrastructure gaps for pi-jit-agents contextBlocks injection
"""

SOURCE: .project/research.json
QUOTE: """
Given that .project/ blocks are composable prompt fragments injected via contextBlocks, what rendering infrastructure is missing to support per-item injection, depth control, token budgeting, and cross-block traversal?
"""

SOURCE: .project/research.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md (12 existing macros)
"""

SOURCE: .project/research.json
QUOTE: """
packages/pi-jit-agents/src/compile.ts (contextBlocks injection)
"""

SOURCE: .project/research.json
QUOTE: """
The .project/ blocks are not state storage separate from agent work — they are composable prompt fragments that pi-jit-agents injects into agent contexts via contextBlocks. The current macro library has 12 whole-block macros (render_conventions, render_requirements, render_conformance, render_architecture, render_project, render_domain, render_decisions, render_tasks, render_issues, render_exploration, render_exploration_full, render_gap). Every macro takes the entire block as input and renders every item.

Atomic composability requires per-item rendering. An agent working on STORY-001 needs FEAT-001 and its specific story, not every feature. Six new block kinds (decisions, spec-reviews, features, framework-gaps, layer-plans, research) have zero macros — they are prompt-unreachable. The contextBlocks agent-spec schema needs item-level selectivity: { name, item, focus, depth } instead of bare block names.

Nine shortcomings surfaced: (1) Per-item rendering missing across every existing macro. (2) Six per-item macros missing for new block kinds (render_decision, render_spec_review, render_feature, render_framework_gap, render_layer_plan, render_research). (3) contextBlocks schema needs item-level selectivity. (4) Rendering depth as first-class parameter. (5) Per-field token budget annotations (x-prompt-budget metadata). (6) Rendering-chain traversal subsystem (registry, cross-block query, depth-aware recursion, cycle detection). (7) Bidirectional schema contract not captured as principle. (8) render_gap name occupied by legacy concept. (9) REVIEW-001 blocked on render_decision existence — compile-chain dependency.
"""

SOURCE: .project/research.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md gains per-item macros
"""

SOURCE: .project/research.json
QUOTE: """
packages/pi-jit-agents/src/types.ts AgentSpec contextBlocks shape changes from string[] to structured
"""

SOURCE: .project/research.json
QUOTE: """
New block kinds gain rendering macros
"""

SOURCE: .project/research.json
QUOTE: """
12 existing whole-block macros
"""

SOURCE: .project/research.json
QUOTE: """
packages/pi-workflows/templates/shared/macros.md
"""

SOURCE: .project/research.json
QUOTE: """
contextBlocks injection in compileAgent
"""

SOURCE: .project/research.json
QUOTE: """
Articulates minimal-context specifications for 17 distinct agent roles across four categories: ten process agents (intention-capture, research, spec-drafting, spec-review, plan-drafting, plan-review, implementation, impl-review, verification, learning-capture), five monitor classify agents (hedge, fragility, work-quality, commit-hygiene, unauthorized-action), and two query/introspection agents (status summarizer, triage).

Five context classes identified: ambient (mandates, framework delimiters, output format), block-item injected (one entry from a block at specified depth), block-whole injected (entire block), collector-populated (session data from monitor collectors), and tool-access granted (dispatch context tools field). Each agent role uses a specific subset.

The minimal-context principle repeated across all 17 roles: work-scoped context (the specific item being worked on) always present at depth=0, role-scoped context always present at depth=0, ambient context always present, everything else excluded. The summary table maps each of 17 agent kinds against 13 context columns (project, conventions, architecture, domain, decisions, features, reviews, research, findings, gaps, patterns, session, tools).

Five new process refinements surfaced: (1) Agent spec must declare contextBlocks with item-level selectivity, depth, and focus. (2) Collectors must be first-class in pi-jit-agents, not monitor-only. (3) Exclusion must be explicit in agent spec (context_excludes field). (4) Ambient context composition must be declarative (L5 block injected via ambient contextBlocks). (5) Per-agent-role token budgets should be pre-computed before dispatch.
"""

SOURCE: .project/research.json
QUOTE: """
Agent spec schema (AgentSpec type in pi-jit-agents) gains contextBlocks item-level selectivity
"""

SOURCE: .project/research.json
QUOTE: """
AgentSpec type with contextBlocks
"""

SOURCE: .project/research.json
QUOTE: """
gsd-2 is a fork-and-absorb of the pi ecosystem containing pi-ai, pi-coding-agent, pi-tui, and pi-agent-core as packages alongside gsd-specific infrastructure (daemon, mcp-server, native, studio, vscode-extension, web). Its planning uses strict Milestone→Slice→Task hierarchy with markdown state files in .gsd/, checkbox parsing, and inline metadata tags.

gsd-2's planning methodology IS derivable: milestone/slice/task schemas map to .project/ blocks, context files map to contextBlocks injection, DECISIONS.md maps to decisions.json, STATE.md maps to projectState() SDK, CODEBASE.md maps to architecture.json, parallel slice execution maps to DAG parallelism, verification gates map to monitor: step type. All methodology is expressible as schemas + YAML + agent specs.

gsd-2's autonomous mode (20+ auto-*.ts files) is ALSO derivable but exposes every gap we know about: auto-detect-stuck → stuck-detection monitor, auto-budget → token-budget monitor, auto-recovery → recovery workflows from monitor FLAG verdicts, auto-verification → monitor: step type (issue-050 blocks this), auto-worktree → workflow step type, auto-dashboard → projectState() rendering, auto-observability → execution trace debugger (issue-036).

Nine specific framework issues required: working monitor verification gates (042/050), execution trace debugger (036), block write-back (028), writeback monitor (030), scheduled re-execution (031), token budgeting (042), per-monitor collectors (035), monitor tuning (038), SDK execution history (037). gsd-2 has two workflow engines (custom-workflow-engine.ts and dev-workflow-engine.ts) because they tried to build the framework inside their application. Our platonic form is what that framework should have been.
"""

SOURCE: .project/research.json
QUOTE: """
gsd-2 builds project intelligence through a four-layer sequential pipeline: (1) Codebase map generation — walks git ls-files, groups by directory, produces .gsd/CODEBASE.md with fingerprint + TTL staleness. (2) Vision capture — human-in-the-loop structured interview with mandatory pre-investigation pass (rg, find, web search before first question), anti-reduction rule, produces REQUIREMENTS.md. (3) Staged research — two tiers: milestone research (strategic, broad, shaped for roadmap planner) and slice research (tactical, per-slice, shaped for planner agent), with parallel dispatch of one subagent per slice. Research depth calibrated (deep/targeted/light) based on uncertainty. (4) Skill discovery — directory-watching for new skills, injection into system prompt via before_agent_start hook.

All four layers map to pi-project-workflows: codebase map → workflow writing to architecture.json block with render macro, vision capture → discussion workflow outputting to requirements.json, staged research → forEach workflow step with parallel research agents writing to research block, skill discovery → directory-watching monitor (issue-051). Cross-cutting patterns: inlined context preloading IS contextBlocks, forward intelligence between slices IS filtered contextBlocks reads (issue-041), research templates ARE agent specs without the framework to hold them.

New gaps surfaced: scoped/filtered contextBlocks reads (issue-041 — gsd-2's forward intelligence requires filtering verification/summary blocks to depends_on slice IDs), directory-watching monitor (issue-051), dynamic model selection (issue-052), pre-execution monitor gating on required tool calls (issue-053), per-agent tool-call budget tracking (issue-054). Every piece of gsd-2's intelligence pipeline is either already in our framework, in our open issues, or filed during this analysis.
"""

SOURCE: .project/research.json
QUOTE: """
Can a pi extension reshape the main interactive session into one of our compiled jit-agent specs (system prompt, contextBlocks, tools, model, thinking, output) seamlessly, WITHOUT forking pi?
"""

SOURCE: .project/research.json
QUOTE: """
HIGH-but-PARTIAL feasible, extension-only. Decisive enabling hooks: before_agent_start -> result.systemPrompt (runtime-honored end-to-end; carries our compiled.systemPrompt incl. <context_block> contextBlocks) + setActiveTools/setModel/setThinkingLevel via a registerCommand handler. Hard limits (why partial): no typed-output GUARANTEE for the interactive loop (no forced-toolChoice injection point; only a best-effort before_provider_request wire seam) + F-012 inheritance; setActiveTools narrows-only (cannot widen to never-loaded tools); system prompt self-restores but model/tools/thinking need explicit snapshot-restore. Conclusion: a genuine 3rd dispatch modality (= FEAT-002) — strong on live interactivity/zero-spawn/context-continuity, weak on typed-output. Honesty caveat: systemPrompt-replace confirmed in code end-to-end; the wire-seam toolChoice injection confirmed invoked but NOT runtime-verified against a live turn.
"""

SOURCE: .project/research.json
QUOTE: """
Can a complete context model (config + schemas + starter blocks + relations + macros) authored against the pi-context SDK be packaged as a portable, shareable bundle that another user installs into their substrate and uses immediately — and what does the current architecture already provide vs. require building?
"""

SOURCE: .project/research.json
QUOTE: """
Two read-only Explore passes over the live tree (2026-05-22): (1) install/distribution mechanics + what a complete portable model comprises + where each piece lives + validation-on-install + versioning/migration; (2) substrate/canon coverage + onboarding-model fit (DEC-0037/0038/0039, FGAP-068/066) + distribution-channel reality (4 distinct artifact types) + macro/template integration. Findings cross-checked against file:line.
"""

SOURCE: .project/research.json
QUOTE: """
Feasible; ~70% scaffolded. A context plugin is a 4th, DATA-ONLY artifact type (distinct from Claude Code plugin / Pi extension / behavior-monitor spec) and the next altitude above FGAP-068 (samplesCatalog made the package's own conception queryable; this makes any conception portable). REUSE: conception.json IS the manifest; installProject is the install flow; bootstrap pointer; schema $id+version+migration-chain; validateProject/validateSchemaAgainstMeta; samplesCatalog; the 3-tier template search (project .pi/templates tier-1). GAPS: (1) install-source abstraction — installProject:355 + samplesCatalog SAMPLES_DIR hardcode import.meta.dirname/..; need bundleSource. (2) pre-install validateConception (install copies with zero validation today). (3) provenance/version (installed_conceptions[]) + update path + AJV registration of plugin schemas with custom $id. (4) plugin migration discovery. (5) manifest lacks macros/hierarchy/naming. HARD PROBLEM (resolved cheaply): data lives in pi-context, rendering macros in pi-workflows — but the 3-tier search already reads project .pi/templates/, so install can EXTRACT bundle macros into .pi/templates/items/ with no pi-workflows refactor (Explore-pass-2 over pass-1's major-refactor framing). CANON: substrate does NOT cover external conceptions; DEC-0037/0038 are internal-samples-only; the onboarding MECHANISM (registry-amendment) is source-agnostic so external sources ADD to it, but multi-source onboarding + acquisition + provenance + conflict-resolution need a NEW enacted decision. CHANNEL: npm primary, git secondary, curated conception-catalog.json discovery; NOT MCP. Decomposition A-E in the findings doc.
"""

SOURCE: .project/research.json
QUOTE: """
Two systems solve the same architectural problem (multi-agent orchestration with quality patterns) at DIFFERENT layers and for DIFFERENT consumers — Claude Code dynamic workflows orchestrate Claude-Code-side subagents; pi-workflows orchestrates Pi-side step DAGs as subprocess dispatch. 13 axes evaluated; 6 verdicts of ADOPT (do-soon, low-effort, high-value), 7 verdicts of INSPIRE (medium-term), 0 N/A.

HIGH-PRIORITY ADOPT items:
(3) Quality-pattern bundled-template gap — Claude docs explicitly enumerate 6 patterns (adversarial-verify, perspective-diverse, judge-panel, loop-until-dry, multi-modal-sweep, completeness-critic); pi-workflows can express most via existing step types but lacks templates + pattern guidance + voting/scoring primitives. This is the SAME failure mode that surfaced in this session's FGAP-135 CHECK 11 PARTIAL: a single-Explore adversarial probe self-categorized findings as 'low-risk'; orchestrator accepted without challenge; user caught the violation. With a bundled adversarial-verify.workflow.yaml running N independent skeptics + structured findings-schema vote-aggregation, the hand-wave would have been mechanically refuted by N-1 of N skeptics — no orchestrator-judgment-call surface. Low-effort, high-leverage.
(4) Loop termination predicates — Claude's loop-until-dry pattern uses arbitrary expression gates; pi-workflows loop step is hardcoded maxAttempts/attempts. Add 'until' / 'untilBudgetRemaining' fields to LoopSpec.
(5) Schema pre-execution forcing — Claude's agent(prompt, {schema}) forces StructuredOutput tool BEFORE the agent runs; pi-workflows validates output.schema AFTER agent completes (wasted tokens on schema-violating outputs). Pass schema to dispatch + enforce tool-use upfront.
(7) Global token budget tracking — Claude exposes budget.total / budget.spent() / budget.remaining() shared across all spawned agents; pi-workflows has per-step usage but no aggregate. Add budget.maxTokens to WorkflowSpec + runtime enforcement.
(8) Worktree
"""

SOURCE: .project/tasks.json
QUOTE: """
FGAP-026 closure phase 7 (Step 8.7.7; Claude Code Task #27): Cross-package cascade + FGAP-032 item-level contextBlocks selectivity in pi-jit-agents
"""

SOURCE: .project/tasks.json
QUOTE: """
AgentSpec.contextBlocks gather_for_unit shape; bundle injection as _<name>_bundle template variable
"""

SOURCE: .project/tasks.json
QUOTE: """
json format emits items as JSON array; xml format wraps each item in <item block="X" id="Y">...</item>; markdown format uses per-block-kind render macros (FGAP-037 dependency — until macros land, markdown emits a minimal fallback projection)
"""

SOURCE: .project/tasks.json
QUOTE: """
Schema declares per-item: id (pattern ^CTX-\d{3,}$), unit_kind (string), bundle_relation_types[] (array of {relation_type, direction in/out/both, max_depth, applicability_predicate?}), created_by, created_at; optional modified_by/at/description/notes
"""

SOURCE: .project/tasks.json
QUOTE: """
[SPLIT 2026-05-26 — SUPERSEDED BY four sequenced successors: TASK-081 (pi-jit-agents element — additive build inside pi-jit-agents, spec.tools wired into executeAgent grant + clamp), TASK-084 (POC: orchestrator → pi-jit-agents direct dispatch end-to-end; runs after 081), TASK-082 (pi-workflows consume canonical + delete duplicate; runs after 084), TASK-083 (pi-behavior-monitors consume canonical + delete duplicate; runs after 082). status=cancelled (tasks schema has no 'superseded' status enum value); the four successors carry the actual scope. Original bundled-scope description preserved below as historical record.]

--- ORIGINAL DESCRIPTION (historical, pre-split) ---

FEAT-001 — pi-workflows + pi-behavior-monitors CONSUME pi-jit-agents' WHOLE agent layer; delete pi-workflows' duplicate. Re-scoped 2026-05-26 from the original type+loader-only cut (which was wrong — loader, templates, schemas, compile, and capability are one coupled concern). jit-agents owns AgentSpec + loader + compile (templates/macros/schemas/contextBlocks, spec-dir-relative resolution) + capability composition (spec.tools threaded to the dispatch grant per DEC-0047: operation-granular, default EMPTY, clamped child-subset-of-parent at operation scope). pi-workflows DELETES its duplicate: local AgentSpec type, agent-spec.ts loader, the agent parts of template.ts (the separate .pi/templates + templates/ roots), compileAgentSpec, separate agent-schema resolution. pi-workflows becomes orchestration-only (DAG, state, expressions, gates); a workflow step that needs an agent dispatches a jit-agent directly (per JI-021/010: orchestrator uses jit-agents directly; JI-001: agent is one thing whether monitor or workflow-used; FEAT-001 issue-043 duplication closes). pi-behavior-monitors repoints to jit-agents (drops the synthetic CompiledAgent build). Per DEC-0048: existing .workflow.yaml + bundled agents + their tests are NOT targets (disposable legacy predating pi-context/pi-jit-agents); a broken bundled-a
"""

SOURCE: .project/tasks.json
QUOTE: """
pi-jit-agents AgentSpec + loader + compile + agent-template/macro/schema resolution are the SOLE agent layer; pi-workflows consumers import from @davidorex/pi-jit-agents
"""

SOURCE: .project/tasks.json
QUOTE: """
FEAT-006 decomposition 1/4 — define the orchestrator-authored executable work-order block kind. Per FEAT-006: 'today the loop passes specs as transient workflow input, not a persisted orchestrator-authored block.' This task defines + registers the canonical block kind for the spec the in-pi orchestrator authors (the spec-block-as-implementation-prompt; specs are self-contained coding prompts per feedback_specs_are_implementation_prompts). Includes: schema for the work-order block (id pattern, fields covering input contract / context-blocks-injected / output contract / privileged-agent target / scope-of-edit / real-check criteria); registration in config.block_kinds[]; sample blocks demonstrating spec authoring shape; contextBlocks handoff pattern (how the privileged JIT-agent consumes the work-order spec via its declared contextBlocks at dispatch time); substrate-write tool surface for in-pi orchestrator to author work-orders (extends or reuses existing append-block-item / file-block-item canonical surface). Filed 2026-05-26 per user direction (supersede TASK-084's degraded POC framing; decompose FEAT-006 into concrete tasks). Substrate-only work; no jit-agents code changes.
"""

SOURCE: .project/tasks.json
QUOTE: """
contextBlocks handoff pattern documented: how the agent.yaml of the spec-implementer-class agent references the work-order block via contextBlocks, how compileAgent injects it, how the agent's prompt consumes it
"""

SOURCE: .project/verification.json
QUOTE: """
contextBlocks handoff pattern documented: how the agent.yaml of the spec-implementer-class agent references the work-order block via contextBlocks, how compileAgent injects it, how the agent's prompt consumes it
"""

SOURCE: .project/verification.json
QUOTE: """
TASK-088 substrate-only work-order block kind landed on branch task-088-work-order-block-kind. Six commits (one beyond plan due to discovered status-vocab framework invariant; canon-aligned addition): 7d06f61 (canonical schema), 443eb65 (status-vocab mappings real-check-passed → complete + real-check-failed → blocked), b107fad (samples schema mirror), 26d4ceb (samples empty-block seed), 95910ef (.project/config.json registration), 6ab7545 (samples/conception.json registration). Verification: build/check/test 830/830 green; 3/3 runtime demos PASS (schema discovery + author/round-trip + contextBlocks item-ref handoff via compileAgent); adversarial probe 10/10 PASS with zero false-pass scenarios + zero forbidden-term hits. Per DEC-0048: bundled-artifact tests not regression gates; engine unit tests + completeness guards are gates (all green). Per DEC-0037 + FGAP-087: zero touches to defaults/+registry/ (canonical-clean post-DEC-0037). ContextBlockRef item-ref handoff path empirically demonstrated end-to-end (WO content → compileAgent → wrapped in <context_block role="data"> → injected at _work_orders_item template key). NOTE on status-vocab addition: TASK-088 scope expanded by one TS file (status-vocab.ts) beyond pure-substrate because the framework's completeness-guard invariant required mapping the new enum values to canonical buckets; the addition is canon-aligned and is the right mechanism for new status values (FGAP-069 + DEC-0033 territory).
"""

SOURCE: CLAUDE.md:109
QUOTE: """
- **Lens-view consumption** (via `lens-view.ts`): `loadLensView`, `renderLensView`, `buildCurationSuggestions`, `validateProjectRelations`, `edgesForLensByName`, `walkLensDescendants`, `walkAncestorsByLens`, `findReferencesInRepo`
"""

SOURCE: CLAUDE.md:11
QUOTE: """
| `@davidorex/pi-workflows` | Workflow orchestration, agent dispatch, `/workflow` command, Nunjucks template + macros for block injection |
"""

SOURCE: CLAUDE.md:154
QUOTE: """
- Agent specs are `.agent.yaml` only (no `.md` fallback). Compiled to prompts via Nunjucks at dispatch time. Specs declare `inputSchema` (validated pre-spawn), `contextBlocks` (block names injected as `_<name>` into template context with framework anti-injection delimiters), `output.format`/`output.schema` (validated post-completion).
"""

SOURCE: CLAUDE.md:155
QUOTE: """
- `templates/shared/macros.md` provides one rendering macro per block kind. Agents import via `{% from "shared/macros.md" import render_<kind> %}`. Three-tier template search: project `.pi/templates/` > user `~/.pi/agent/monitors/` > package `examples/`.
"""

SOURCE: CLAUDE.md:84
QUOTE: """
- **pi-jit-agents** (library, not extension): boundary surfaces per `docs/planning/jit-agents-spec.md` — `agent-spec.ts` (load), `compile.ts` (compile + contextBlocks injection), `jit-runtime.ts` (execute + `normalizeToolChoice` provider shape normalization at dispatch boundary), `introspect.ts` (contract projection). `schemas/verdict.schema.json` is the phantom-tool classification contract
"""

SOURCE: CLAUDE.md:85
QUOTE: """
- **pi-workflows**: extension entry in `src/index.ts`; `workflow-sdk.ts` (queryable surface), `workflow-executor.ts` (orchestration), `workflow-spec.ts` (YAML + STEP_TYPES registry), `expression.ts` (`${{ }}` eval + filters), `dispatch.ts` (subprocess spawn), `dag.ts` (planner), `step-*.ts` (one per step type). `templates/shared/macros.md` carries per-block-kind Nunjucks rendering macros (FGAP-037 tracks pending macros)
"""

SOURCE: CLAUDE.md:94
QUOTE: """
- **Contracts**: `agentContracts(cwd)` — per-agent inputSchema + contextBlocks + output; `agentsByBlock(cwd, blockName)`
"""

SOURCE: CLAUDE.md:96
QUOTE: """
- **Validation**: `validateWorkflow(spec, cwd)` — agent + monitor + schema + step + filter + StepType metadata + contextBlocks + template-input alignment. Returns `{ status, issues[] }`. Surfaced as `/workflow validate [name]`.
"""

SOURCE: analysis/2026-04-13-spec-loop-derivability.md:28
QUOTE: """
- `from` (precursors) → step inputs / `contextBlocks`
"""

SOURCE: analysis/2026-04-13-spec-loop-derivability.md:75
QUOTE: """
**4. Template composition via Nunjucks shared macros.** The document says agents have "stances" with prompt contracts but doesn't address prompt authoring. Our shared macros library + template inheritance is the mechanism by which a stance becomes a reusable, composable prompt.
"""

SOURCE: analysis/2026-04-13-spec-loop-derivability.md:77
QUOTE: """
**5. Context injection from durable state (`contextBlocks`).** The document says "Relevant spec sections should be pasted into the prompt" (deficiency #5 of the adversarial audit failure). Our `contextBlocks` mechanism does this declaratively — the agent spec lists block names, the framework reads them at dispatch and renders them through shared macros.
"""

SOURCE: analysis/2026-04-13-spec-loop-derivability.md:94
QUOTE: """
**The document validates our direction.** Every open issue in our framework (issue-028 block write-back, issue-030 writeback monitor, issue-031 scheduled re-execution, issue-036 execution trace debugger, issue-041 scoped contextBlocks, issue-045 anti-injection, issue-050 unified classify) is something SYNTH had to build by hand in imperative TypeScript scaffolding or in folklore memory files. Closing those issues does not give us SYNTH's loop — it gives users the substrate to build SYNTH's loop (or any variant) by authoring schemas + workflows + agents, not by forking framework code.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:104
QUOTE: """
This is a substantive new subsystem. pi-project's `project-sdk.ts` has cross-block query primitives for validation, but they are not exposed as a rendering service, and the macros library has no registry. The subsystem lives at the boundary between pi-project (data + schemas) and pi-jit-agents (prompt composition).
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:112
QUOTE: """
1. **Read-shape**: when `compileAgent` reads a block and a macro renders it into prompt text
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:12
QUOTE: """
1. Agent spec declares `contextBlocks: [conventions, requirements, conformance-reference]`
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:120
QUOTE: """
## REVIEW-001 is blocked on decision-record macro existence
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:122
QUOTE: """
The fresh-context independent reviewer subagent for `docs/planning/jit-agents-spec.md` is an agent. Its `contextBlocks` must inject the three proposed decision records (DEC-0001/0002/0003) for the reviewer to evaluate them. Without a per-item decision macro, the reviewer agent cannot read the decisions from its prompt. The design review cannot run until at least `render_decision(dec)` exists.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:124
QUOTE: """
**Path D ordering consequence**: macros extension for `render_decision` precedes REVIEW-001 execution. This is not a preference — it is a compile-chain dependency.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:130
QUOTE: """
`analysis/research-blocks-design.md` specifies `findings_summary` as prompt-injectable content. The design is incomplete without `render_research(r)`. Research block enactment must land the macro alongside the schema and seed data, not as a follow-on epic.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:132
QUOTE: """
**Per principle**: every schema lands with its per-item macro. Schema and macro are a single unit of work. A schema without its macro is structurally unreachable and therefore not shipped.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:138
QUOTE: """
1. **Per-item rendering missing across every existing macro.** The library renders whole blocks only. Per-item is the precondition for scoped injection. Either every existing macro gains a per-item sibling, or the whole library is refactored to accept item filters.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:140
QUOTE: """
2. **Six per-item macros missing for the new block kinds.** `render_decision`, `render_spec_review`, `render_feature`, `render_framework_gap`, `render_layer_plan`, `render_research`. None exist. All six new block kinds are prompt-unreachable.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:142
QUOTE: """
3. **`contextBlocks` agent-spec schema needs item-level selectivity** with `name`, `item`, `focus`, and `depth` fields. Current block-name-only mechanism is insufficient.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:144
QUOTE: """
4. **Rendering depth as a first-class parameter** threaded through every per-item macro and every `contextBlocks` declaration.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:152
QUOTE: """
8. **`render_gap` name occupied by legacy concept that retires** under the canonical vocabulary direction. The name frees for the new `framework-gaps.json` per-item macro when the legacy validation `gap` concept folds into `issues`.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:154
QUOTE: """
9. **REVIEW-001 blocked on `render_decision`.** Compile-chain dependency. Macros extension precedes design review execution on the critical path of Path D.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:158
QUOTE: """
## Principle — every schema lands with its per-item macro
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:16
QUOTE: """
5. Templates render via macros at `packages/pi-workflows/templates/shared/macros.md`
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:160
QUOTE: """
A schema without its per-item macro is structurally unreachable from agent contexts. A block kind is not "shipped" until an agent can read one of its items from a `contextBlocks` injection. Future enactment of any new block kind must land schema + seed data + per-item macro as a single unit of work. This principle is proposed for ratification once a forcing artifact promotes it to a live decision.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:166
QUOTE: """
1. **Ratify the reframe**: blocks are prompt substrate; every new block ships with its per-item macro as a single unit of work
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:167
QUOTE: """
2. **Acknowledge REVIEW-001 blocker**: macros extension for `render_decision` precedes design review execution
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:20
QUOTE: """
## The critical observation — existing macros render whole blocks, not per-item
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:22
QUOTE: """
The current library has twelve macros: `render_conventions`, `render_requirements`, `render_conformance`, `render_architecture`, `render_project`, `render_domain`, `render_decisions`, `render_tasks`, `render_issues`, `render_exploration`, `render_exploration_full`, `render_gap`. Every name is plural or whole-block. Every macro takes the entire block as input and renders every item.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:24
QUOTE: """
**Atomic composability requires per-item rendering.** An agent working on STORY-001 does not need every feature in `features.json` — it needs FEAT-001 and the specific story and tasks it is working on. An agent reading a single decision does not need every decision in the log. The current library operates at the wrong granularity for the injection patterns the L2/L3 blocks demand.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:26
QUOTE: """
**The granularity mismatch is itself a framework gap.** Every existing macro needs a per-item sibling (or a refactor that accepts an item filter), and every new block kind must land with per-item macros from the start. Per-item rendering is the precondition for any scoped injection.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:32
QUOTE: """
| Block kind | Whole-block macro | Per-item macro | Block landed | Prompt-injectable today |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:34
QUOTE: """
| project.json | `render_project` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:35
QUOTE: """
| conventions.json | `render_conventions` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:36
QUOTE: """
| domain.json | `render_domain` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:37
QUOTE: """
| requirements.json | `render_requirements` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:38
QUOTE: """
| architecture.json | `render_architecture` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:39
QUOTE: """
| decisions.json (existing flat) | `render_decisions` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:40
QUOTE: """
| tasks.json | `render_tasks` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:41
QUOTE: """
| issues.json | `render_issues` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:42
QUOTE: """
| conformance-reference.json | `render_conformance` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:43
QUOTE: """
| exploration | `render_exploration`, `render_exploration_full` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:44
QUOTE: """
| gap (legacy cross-block validation concept) | `render_gap` | missing | yes | whole-only |
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:52
QUOTE: """
Six new block kinds are prompt-unreachable. Every existing block can only be whole-block injected. The `render_gap` name is occupied by a legacy cross-block validation concept that folds into `issues` under the canonical vocabulary direction, freeing the name for the new `framework-gaps.json` per-item macro once the legacy concept retires.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:56
QUOTE: """
## `contextBlocks` needs item-level selectivity
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:6
QUOTE: """
The `.project/` blocks are not state storage separate from agent work. They are **composable prompt fragments** that pi-jit-agents injects into agent contexts via `contextBlocks`. This reframes their shape, their cross-references, their token budget, and exposes missing rendering infrastructure.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:61
QUOTE: """
contextBlocks:
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:76
QUOTE: """
`render_decision(dec, depth=0)` emits the decision with cross-references as bare IDs. `depth=1` inlines direct references. `depth=2` recurses one level. `depth=∞` traverses the full graph. Depth is a first-class parameter threaded through every per-item macro and through the `contextBlocks` declaration.
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:97
QUOTE: """
Per-item macros that inline cross-references require:
"""

SOURCE: analysis/2026-04-15-blocks-as-prompt-substrate.md:99
QUOTE: """
1. A **renderer registry** mapping block-item kinds to their per-item macros
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:143
QUOTE: """
- Relevant file contents (via Read tool on demand, not contextBlocks injection)
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:15
QUOTE: """
| **Block-item injected** | One entry from a block (FEAT-001, DEC-0001, R-0008) | `contextBlocks` with `name + item + focus + depth` |
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:158
QUOTE: """
- The commit range (via `git diff` / `git log`, not contextBlocks)
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:16
QUOTE: """
| **Block-whole injected** | Whole block (conventions.json, patterns library) | `contextBlocks` with `name` only |
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:316
QUOTE: """
The minimum is the agent spec's declared `contextBlocks` list plus the ambient system prompt. Nothing else gets through.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:324
QUOTE: """
1. **Per-item macros** are the only way to inject a single item without polluting the prompt with whole-block content. Every process agent above that requires "depth=1" on a decision or feature requires per-item rendering. Seventeen of seventeen agent kinds require per-item rendering somewhere.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:326
QUOTE: """
2. **`contextBlocks` item-level selectivity** is the only way to express "FEAT-001 focused on STORY-001 + TASK-001-02" — which is the exact shape an implementation agent needs. Every process agent from plan-drafting onward requires item-level selectivity.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:332
QUOTE: """
5. **Rendering-chain traversal subsystem** is what executes depth=1 on related_decisions or related_findings — it walks the edge and invokes the target item's per-item macro. Without it, depth control is a declaration the renderer cannot fulfill.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:340
QUOTE: """
1. **Agent spec must declare `contextBlocks` with item-level selectivity, depth, and focus** — the current block-name-only shape is insufficient for 17 of 17 agent kinds. Schema extension to agent spec is a prerequisite for every other step.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:346
QUOTE: """
4. **Ambient context composition must be declarative** — today the nine mandates are prepended to every session as prose. Under the block substrate, they should be an L5 block injected into every agent's system prompt via an ambient contextBlocks declaration. Currently happens by convention, not by mechanism.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:348
QUOTE: """
5. **Per-agent-role token budgets should be pre-computed** — before dispatch, compute the sum of budget hints from every field the contextBlocks declaration injects. If the sum exceeds the agent's model context window minus output budget, fail before dispatch with a clear error naming the over-budget blocks. This is the `x-prompt-budget` metadata being used as a dispatch-time validator.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:376
QUOTE: """
Every column that does not appear in a row is explicitly excluded — the agent spec for that role must either not list it in `contextBlocks` or must list it in `context_excludes` once that field exists.
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:388
QUOTE: """
- `contextBlocks: string[]` (block names only)
"""

SOURCE: analysis/2026-04-15-runtime-step-context.md:392
QUOTE: """
- `contextBlocks: (string | { name, item?, focus?, depth? })[]` — item-level selectivity
"""

SOURCE: analysis/2026-04-27-canonical-loader-replaces-seedExamples.md:76
QUOTE: """
- pi-workflows shared templates (`templates/shared/macros.md` and friends) if currently seeded — verify
"""

SOURCE: analysis/2026-04-27-curation-recursion-termination-and-withering.md:141
QUOTE: """
If a unit can't be composed into a future agent's contextBlocks, it isn't a unit; it's noise. The composability test is the operational definition of "atomic context unit" the thesis demanded.
"""

SOURCE: analysis/2026-04-28-context-paths-extension-design.md:22
QUOTE: """
5. **`compileAgentSpec` builds its Nunjucks render context only from `resolvedInput`.** See `/Users/david/Projects/workflowsPiExtension/packages/pi-workflows/src/step-shared.ts:150-194`. The `ctx` object passed to `renderTemplateFile` / `renderTemplate` is constructed from `resolvedInput` (cast to `Record<string, unknown>`) plus auto-injected `_<blockname>` keys when `agentSpec.contextBlocks` is declared. **There is no caller-extensible third-channel context.** Consequence: classifier-side injection of `_context_paths` MUST happen by extending the `templateContext` object passed in at the call site, not by changing `compileAgentSpec`'s signature. See item 6.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:1
QUOTE: """
# Blocks, schemas, macros — synthesis of the contract direction
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:154
QUOTE: """
**Macros are the read-side of the schema contract, not a pi-workflows concern.** They must be co-shipped with schemas at per-item granularity with depth control. The "schema + seed data + per-item macro as a single unit of work" principle from `2026-04-15-blocks-as-prompt-substrate.md` is the consequence.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:16
QUOTE: """
The three documents converge on a single claim: **blocks, schemas, and macros are a single contract, not three independent systems**, and pi-project today implements only one side of it (write-shape validation at the block API boundary). The other two sides — read-shape (prompt composition via macros) and grounding/lifecycle/authorship (invariants the write path cannot enforce today) — are structurally absent.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:166
QUOTE: """
- Ship schemas plus per-item macros as a single unit of work, at per-item granularity, with depth control and cycle detection.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:185
QUOTE: """
| Twelve whole-block macros, no per-item | `2026-04-15-blocks-as-prompt-substrate.md` § "The critical observation" |
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:187
QUOTE: """
| REVIEW-001 blocked on render_decision | `2026-04-15-blocks-as-prompt-substrate.md` § "REVIEW-001 is blocked on decision-record macro existence" |
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:188
QUOTE: """
| Item-level contextBlocks selectivity | `2026-04-15-blocks-as-prompt-substrate.md` § "contextBlocks needs item-level selectivity" |
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:21
QUOTE: """
> 1. Read-shape: when compileAgent reads a block and a macro renders it into prompt text
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:26
QUOTE: """
pi-project today covers role 3 fully, covers role 2 at the API boundary, and covers role 1 only implicitly through macros that live downstream in pi-workflows with no structural coupling back to the schema.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:33
QUOTE: """
schema ⇄ block JSON ⇄ macro ⇄ agent prompt
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:36
QUOTE: """
Read direction (role 1): agent spec declares `contextBlocks: [name, ...]` → `compileAgent` reads blocks via `readBlock` → injects into Nunjucks context as `_<name>` → template imports macros from `packages/pi-workflows/templates/shared/macros.md` → macro renders the block into prompt markdown.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:50
QUOTE: """
**Operational consequence of the thesis**: a schema without its per-item macro is unreachable from agent contexts, so it is not really shipped. The document captures this as a principle:
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:52
QUOTE: """
> A schema without its per-item macro is structurally unreachable from agent contexts. A block kind is not "shipped" until an agent can read one of its items from a `contextBlocks` injection. Future enactment of any new block kind must land schema + seed data + per-item macro as a single unit of work.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:54
QUOTE: """
**Current macro library status**: twelve macros, all plural or whole-block (`render_conventions`, `render_requirements`, `render_conformance`, `render_architecture`, `render_project`, `render_domain`, `render_decisions`, `render_tasks`, `render_issues`, `render_exploration`, `render_exploration_full`, `render_gap`). Every macro takes the entire block as input. Per-item rendering is missing across the entire library.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:58
QUOTE: """
**REVIEW-001 is a compile-chain dependency**: the fresh-context reviewer for `docs/planning/jit-agents-spec.md` needs its `contextBlocks` to inject DEC-0001/0002/0003. Without `render_decision(dec)`, the reviewer cannot read the decisions from its prompt. This is not a scheduling preference; it is a structural blocker.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:62
QUOTE: """
1. **Item-level `contextBlocks` selectivity** — current block-name-only mechanism cannot express "inject just FEAT-001 focused on STORY-001." Proposed schema change:
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:65
QUOTE: """
   contextBlocks:
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:74
QUOTE: """
2. **First-class depth parameter** — `render_decision(dec, depth=0)` emits cross-references as bare IDs; `depth=1` inlines direct references; higher depths recurse with cycle detection.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:78
QUOTE: """
**Rendering-chain traversal subsystem**: per-item macros inlining cross-references require a renderer registry mapping block-item kinds to their per-item macros, a cross-block resolver (given a reference ID, find the block and entry that owns it), depth-aware recursion, and cycle detection. This subsystem lives at the pi-project ⇄ pi-jit-agents boundary. `project-sdk.ts` has cross-block query primitives for validation but does not expose them as a rendering service.
"""

SOURCE: analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md:8
QUOTE: """
- `analysis/2026-04-15-blocks-as-prompt-substrate.md` — reframing of blocks as prompt fragments and the macros/contract consequences
"""

SOURCE: analysis/2026-05-01-ceremony-ideas.md:43
QUOTE: """
4. Surface the ceremony+primitive proposal as a coherent unit with schema+macro+scaffold triple compliance
"""

SOURCE: analysis/2026-05-01-ceremony-ideas.md:49
QUOTE: """
- `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` — the substrate audit these ceremonies would operate over
"""

SOURCE: analysis/2026-05-01-github-issues-migration-inventory.md:18
QUOTE: """
| issue-002 | Template composition (extends/blocks/macros) used in only 1 of 22 template families | open | high | composition | `.project/issues.json` |
"""

SOURCE: analysis/2026-05-01-github-issues-migration-inventory.md:243
QUOTE: """
| F-023 | `blocks-schemas-macros-contract-synthesis.md` Document 3 audit-gap canonicality | proposed (Tier A) | `analysis/2026-05-01-substrate-arc-distillation.md:76` |
"""

SOURCE: analysis/2026-05-01-github-issues-migration-inventory.md:280
QUOTE: """
| `2026-05-01-blocks-schemas-macros-contract-synthesis.md` | Blocks/schemas/macros — contract direction synthesis | synthesis |
"""

SOURCE: analysis/2026-05-01-github-issues-migration-inventory.md:36
QUOTE: """
| issue-020 | contextBlocks injection only reads static files | open | high | capability | `.project/issues.json` |
"""

SOURCE: analysis/2026-05-01-github-issues-migration-inventory.md:57
QUOTE: """
| issue-041 | Scoped/filtered contextBlocks reads | open | high | capability | `.project/issues.json` |
"""

SOURCE: analysis/2026-05-01-github-issues-migration-inventory.md:61
QUOTE: """
| issue-045 | Framework-level anti-injection wrapping for contextBlocks | open | high | issue | `.project/issues.json` |
"""

SOURCE: analysis/2026-05-01-substrate-arc-distillation.md:221
QUOTE: """
- Pre-existing synthesis at HEAD: `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` (the substrate the arc attempted to operationalize; remains the authoritative on-disk substrate).
"""

SOURCE: analysis/2026-05-01-substrate-arc-distillation.md:50
QUOTE: """
  - Align all three consumers to the canonical project-tier path; same PR drops `~/.pi/agent/templates/` consumer references if F-022 disposition collapses macros to two-tier
"""

SOURCE: analysis/2026-05-01-substrate-arc-distillation.md:69
QUOTE: """
- **Symptom:** the three-tier macro convention (`.pi/templates/`, `~/.pi/agent/templates/`, package-bundled) has no active consumer for the user-tier middle layer. `~/.pi/agent/templates/` does not exist on this machine; pi-mono's canonical convention for skills/prompts is two-tier without bundled fallback.
"""

SOURCE: analysis/2026-05-01-substrate-arc-distillation.md:76
QUOTE: """
### F-023 — `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` Document 3 audit-gap canonicality
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:1
QUOTE: """
# Per-item macros — atomic plans and ordering
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:13
QUOTE: """
- Whole-block macros: **derived view of per-item, or retire**.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:14
QUOTE: """
- Principle: every schema lands with its per-item macro as a single unit of work — applies universally to legacy 12 blocks and 6 newer kinds alike.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:18
QUOTE: """
1. **Renderer registry** in pi-jit-agents — kind → per-item-macro lookup; user-override layering from `.pi/templates/`.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:20
QUOTE: """
3. **`contextBlocks` agent-spec schema extension** — typed object form with `name`, `item`, `focus`, `depth`.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:21
QUOTE: """
4. **`compileAgent` integration** — honor new `contextBlocks` shape (item resolution, depth threading, focus passing); backward-compat path for bare-string form.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:23
QUOTE: """
6. **`render_decision`** — REVIEW-001 unblocker; first per-item macro using registry + resolver.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:24
QUOTE: """
7. **Remaining five newer per-item macros** — `render_spec_review`, `render_feature`, `render_framework_gap`, `render_layer_plan`, `render_research`.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:25
QUOTE: """
8. **Twelve legacy per-item macros + whole-block as derived view + agent-template call-site migration** — coupled because retiring whole-block requires updating call sites.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:40
QUOTE: """
- REVIEW-001 (jit-agents-spec.md design review) blocked on `render_decision`.
"""

SOURCE: analysis/2026-05-02-per-item-macros-atomic-plans.md:41
QUOTE: """
- Substrate canon (2026-05-01) makes blocks/schemas/macros = one contract; per-item macros are the macro half.
"""

SOURCE: analysis/2026-05-02-per-item-macros-duplication-analysis.md:11
QUOTE: """
**4. Registry alias bridge** — 8 one-line wrappers (`render_<plural>(x, d) → render_<singular>(x, d)`) with near-identical doc-comments. Pure boilerplate driven entirely by a registry-default-name choice.
"""

SOURCE: analysis/2026-05-02-per-item-macros-duplication-analysis.md:17
QUOTE: """
- **`templates/shared/render-helpers.md`** with macros like `render_id_list(label, ids, depth)`, `render_id_single(label, id, depth)`, `render_optional_scalar(label, value)`, `render_optional_array(label, items, item_renderer)`. Each per-item macro imports the helpers it needs and shrinks 50–100 lines per file.
"""

SOURCE: analysis/2026-05-02-per-item-macros-duplication-analysis.md:19
QUOTE: """
- **Retire registry aliases by changing the registry default-name derivation** to match canonical singular names (or accept both). 8 alias macros disappear plus their doc-comments.
"""

SOURCE: analysis/2026-05-02-per-item-macros-duplication-analysis.md:25
QUOTE: """
Cost: substantial refactor across 14 macro files + new shared helpers file + test updates. Risk: low — no external macro consumers exist anywhere in the monorepo (verified earlier in this session); test coverage is per-macro and would catch regressions.
"""

SOURCE: analysis/2026-05-02-per-item-macros-duplication-analysis.md:27
QUOTE: """
Mandate-relevant: per-macro duplication is mandate-009 noise made architectural. It would compound for any new block kind added (new schemas demand new macros that copy-paste the recursion pattern). The duplication isn't accidental — it's a missing abstraction layer the per-item-macros plan didn't articulate because the duplication was incremental across waves.
"""

SOURCE: analysis/2026-05-02-per-item-macros-duplication-analysis.md:5
QUOTE: """
**1. Cross-reference recursion pattern** (the largest duplication): an 8-line `{% if X is defined %}... resolve/render_recursive ... fallback to bare ID ...` block repeats 5 times in decisions.md alone (supersedes, superseded_by, related_findings, related_features, related_gaps). Across the 6 macros with cross-block reference fields (decisions, spec-reviews, features, framework-gaps, layer-plans, research), this same pattern is duplicated dozens of times. Identical structure, only the field name varies.
"""

SOURCE: analysis/2026-05-02-residual-debt-survey.md:10
QUOTE: """
Two byte-similar copies of the inline-template-string-render logic. Direct consequence of v0.24.0's renderItemById helper landing alongside the existing compileAgent path without factoring the shared dispatch. Quick win — extract into pi-jit-agents (or wherever the registerCompositionGlobals helper lives) as `dispatchInlineMacro(env, templatePath, macroName, item, depth)`. Both sites import.
"""

SOURCE: analysis/2026-05-02-residual-debt-survey.md:22
QUOTE: """
`[not-found: <id>]`, `[unrendered: <kind>/<id>]`, `[render_error: <msg>]`, `[cycle: <id>]` are inline-templated. Should be a `markers.ts` module with named constants + small format helpers (`notFoundMarker(id)`, `cycleMarker(id)`, etc.). Tests can then assert against the named constants rather than literal strings — drift between marker text and test assertion becomes impossible. Quick win, raises future-change safety.
"""

SOURCE: analysis/2026-05-02-residual-debt-survey.md:28
QUOTE: """
Quick wins (5, 6, 8, 9) are byte-trivial and reduce architectural-debt count immediately. Medium (3, 4) reduce duplication that compounds with every new block kind or new macro test. Item 7 is the largest leverage — every future feature that touches `.project/` paths benefits from canonical builders.
"""

SOURCE: analysis/2026-05-02-residual-debt-survey.md:3
QUOTE: """
**Item 3 — whole-block scaffolding (9× repetition in shared/macros.md):**
"""

SOURCE: analysis/2026-05-02-residual-debt-survey.md:4
QUOTE: """
Each whole-block delegator is `{% from "items/X.md" import render_X_item %}{% macro render_Xs(data) %}{% for x in data.<key> %}{{ render_X_item(x) }}{% endfor %}{% endmacro %}`. Real duplication. Could be retired by either (a) a single parameterized whole-block helper that takes a kind name and looks up its per-item macro via the registry at render time, or (b) the registry exposing a `renderWhole(kind, data)` JS surface with a Nunjucks global wrapping it. Same architectural pattern that closed the per-item duplication. Bounded medium scope.
"""

SOURCE: analysis/2026-05-03-context-management-issue-cluster.md:42
QUOTE: """
- issue-020 — contextBlocks injection only reads static files, no computed blocks
"""

SOURCE: analysis/2026-05-03-context-management-issue-cluster.md:44
QUOTE: """
- issue-041 — Scoped/filtered contextBlocks reads (subsets, not whole blocks)
"""

SOURCE: analysis/2026-05-03-context-management-issue-cluster.md:46
QUOTE: """
- issue-045 — Framework-level anti-injection wrapping for contextBlocks injection
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:107
QUOTE: """
- issue-002 — Template composition (extends/blocks/macros) used in only 1 of 22 template families
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:120
QUOTE: """
- issue-049 — step-loop.ts cwd bug — agents in loop steps never receive contextBlocks
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:21
QUOTE: """
### Compile (template + contextBlocks + schema injection)
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:23
QUOTE: """
- issue-020 — contextBlocks injection only reads static files (no computed blocks at dispatch time)
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:24
QUOTE: """
- issue-041 — Scoped/filtered contextBlocks reads (subsets, not whole blocks)
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:25
QUOTE: """
- issue-045 — Framework-level anti-injection wrapping for contextBlocks
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:26
QUOTE: """
- issue-049 — step-loop.ts:187 calls compileAgentSpec without cwd — agents in loop steps never receive contextBlocks data
"""

SOURCE: analysis/2026-05-03-package-issue-clusters.md:56
QUOTE: """
**Secondary:** compile-tier issues (020, 041, 045, 049) — all about contextBlocks injection completeness.
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:11
QUOTE: """
> The architectural arc has a clearer shape. What was a loose collection of FGAPs + issues + planning docs now has a unifying frame: **substrate = config + partitions + lenses + closure-table relations + per-item macros. Six discrete blocks, one coherent contract.** Each open item locates inside that frame as either a closure, a reframing, or unaffected.
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:146
QUOTE: """
| 22 | POC v1 eval | `render_uncategorized` policy | Closed in POC v2 |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:153
QUOTE: """
| 29 | Integration map | Bare-string `_lens:` vs typed contextBlocks | Open — tracked as **DEC-0008**; proposed direction is typed-only |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:172
QUOTE: """
| 3 | **DEC-0008** | **#29 typed contextBlocks form** — the heuristic forces typed-only because bare-string `_lens:<id>` cannot carry the parameter set the unified surface needs (`_mandate:<id>`, `_lens:<id>?status=open`, `_monitor:<id>:last-classification`) | Locks API shape for agent authoring; conflict with per-item-macros plan #3 must resolve before either lands | Update `analysis/2026-05-02-per-item-macros-atomic-plans.md` plan #3; §5 status |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:207
QUOTE: """
- `packages/pi-behavior-monitors/examples/<name>/` — bundled monitor classify templates with `{% if %}` guards on context variables. Heuristic-aligned target: classify templates declare typed `contextBlocks` flowing through the unified composition layer.
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:214
QUOTE: """
- `analysis/2026-05-02-per-item-macros-atomic-plans.md` — per-item macros restructure (waves 1–8); complementary to substrate arc, not superseded
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:215
QUOTE: """
- `analysis/2026-05-02-per-item-macros-duplication-analysis.md` — macros library deduplication
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:217
QUOTE: """
- `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md` — blocks/schemas/macros = one contract framing; this arc realizes it
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:229
QUOTE: """
- `.project/spec-reviews.json` — REVIEW-001 blocked on `render_decision` per per-item-macros plan
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:23
QUOTE: """
- **Monitors** — currently `.pi/monitors/<name>.monitor.json` + `examples/<name>/classify.md`, ad-hoc shape. Under the heuristic: monitor specs as typed blocks; classify templates compose typed contexts via the same `contextBlocks` surface workflow agents use; closes the parallel-ungated path issue-065 surfaces.
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:243
QUOTE: """
Authoritative planning substrate for the substrate arc on this worktree. Synthesizes POC v2 mechanics + integration-map analysis + catalog reframing + heuristic-widening pass into a single navigable frame. Should be read before any planning, scoping, or implementation work that touches: contextBlocks, lens-view rendering, closure-table relations, the config block, partitions, per-item macros, mandates discipline, monitor authoring, or the resolution of any open item enumerated in §4.
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:253
QUOTE: """
3. `analysis/2026-05-02-per-item-macros-atomic-plans.md` (the complementary arc)
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:31
QUOTE: """
The substrate is a single coherent contract composed of named blocks. Each block has a schema, a write surface (block-api), a read surface (project-sdk), and a rendering surface (macros). The blocks compose as follows:
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:37
QUOTE: """
| **lenses** | Named projections over a target block, with `relation_type`, `bins`, optional `derived_from_field` (auto-derivation) and `render_uncategorized` policy. Lens views are computed-block injections at agent dispatch time. | `analysis/poc-degree-zero-lens/output/primary/{by-package,context-management}.md` and `output/alt/{by-priority,by-status}.md` |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:39
QUOTE: """
| **per-item macros** | Rendering layer: each schema lands with its per-item macro as a single unit of work. Renderer registry owned by pi-jit-agents per DEC-0003. `render_cluster` composes per-item macros over lens-view groupings. | Not in POC v2 (POC uses inline placeholder format); design canonical at `analysis/2026-05-02-per-item-macros-atomic-plans.md` and `analysis/2026-04-15-blocks-as-prompt-substrate.md` |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:45
QUOTE: """
- *Pre-heuristic candidates:* schemas-as-substrate, hierarchies-as-distinct-block, macros split into registry + emitter.
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:59
QUOTE: """
| **Monitor specs** | `.pi/monitors/<name>.monitor.json` + handcoded classify templates with `{% if %}` guards | Typed monitor block with `monitors.schema.json`; classify templates declare `contextBlocks: [_lens:..., _mandate:..., ...]` flowing through the same composition layer workflow agents use |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:79
QUOTE: """
| `render_uncategorized` policy | Per-lens field; primary's `by-package` runs false (clean view), `context-management` runs true (curation-ready view) |
"""

SOURCE: analysis/2026-05-03-substrate-arc-frame.md:96
QUOTE: """
| issue-041 | A lens with predicate IS a scoped/filtered contextBlocks read |
"""

SOURCE: analysis/2026-05-05-pi-context-executive-summary-candidate.md:18
QUOTE: """
- **Canonical-macro registry**: per-kind renderers consumed by `render-by-id`, `resolve-by-id`, marker grammar.
"""

SOURCE: analysis/2026-05-05-pi-context-executive-summary-candidate.md:36
QUOTE: """
- **`before_agent_start` cascade hook**: per main-conversation user prompt, runs query-driven selection over typed substrate, composes top-k items into system prompt via canonical macros, applies anti-injection delimiters.
"""

SOURCE: analysis/2026-05-05-pi-context-executive-summary-candidate.md:5
QUOTE: """
A single Pi extension package that owns the **typed-structured-context substrate**: authoring (validated writes), retrieval (query-driven selection), composition (lens projections + per-item rendering), and injection (cascade hooks into agent prompts). It replaces today's `pi-project` package with an honest name reflecting what the substrate actually does — manage typed memory consumed by LLMs at the right moment in the right shape.
"""

SOURCE: analysis/2026-05-05-pi-context-executive-summary-candidate.md:65
QUOTE: """
- **pi-jit-agents**: agent-spec load/compile/execute. Consumes pi-context's id index + canonical macros + render primitives. Forced-tool-use shape normalization stays here.
"""

SOURCE: analysis/2026-05-05-pi-context-executive-summary-candidate.md:66
QUOTE: """
- **pi-workflows**: orchestration, DAG, dispatch. Consumes pi-context macros for agent-step composition.
"""

SOURCE: analysis/2026-05-05-pi-context-rename-decomposition.md:15
QUOTE: """
- pi-workflows (orchestration / DAG / dispatch — consumes pi-context macros)
"""

SOURCE: analysis/2026-05-05-pi-context-rename-decomposition.md:35
QUOTE: """
- Macros currently at `packages/pi-workflows/templates/shared/macros.md` should move to pi-context if canonical-macro registry lives there. Migration path needed.
"""

SOURCE: analysis/2026-05-05-pi-context-rename-decomposition.md:8
QUOTE: """
- Canonical-macro registry + render-by-id + resolve-by-id + marker grammar (currently scattered between pi-project, pi-jit-agents, pi-workflows)
"""

SOURCE: analysis/2026-05-05-pi-context-rename-touched-items.md:14
QUOTE: """
- **issue-020** (contextBlocks injection reads static files only — no computed blocks at dispatch time) — Angle B (coverage-rank query-driven selection) addresses this.
"""

SOURCE: analysis/2026-05-05-pi-context-rename-touched-items.md:17
QUOTE: """
- **issue-042** (scoped/filtered contextBlocks reads — agents cannot request subsets) — Angle B addresses subset-by-query.
"""

SOURCE: analysis/2026-05-05-pi-context-rename-touched-items.md:18
QUOTE: """
- **issue-045** (framework-level anti-injection wrapping not systematically applied to contextBlocks) — Angle A (cascade injection) explicitly invokes the canonical anti-injection delimiters; closes when injection becomes the canonical entry point.
"""

SOURCE: analysis/2026-05-05-pi-context-rename-touched-items.md:19
QUOTE: """
- **issue-046** (step-loop.ts:187 compileAgentSpec without cwd — loop steps never receive contextBlocks) — not directly touched but related to making contextBlocks reachable from more entry points.
"""

SOURCE: analysis/2026-05-05-pi-context-rename-touched-items.md:27
QUOTE: """
**`.project/features.json`** — FEAT-001 (consumer migration arc) — touches because macros migration from pi-workflows to pi-context is consolidation work in this arc; pi-jit-agents consolidation similarly.
"""

SOURCE: analysis/2026-05-06-context-packet-comparison.md:154
QUOTE: """
| **Composition / projection** | Lens primitives (`kind: target | composition`); per-kind canonical macros; lens-of-lenses with cycle-safety; sub-lens recursion | One composition shape; `buildPrompt` hardcoded; `system` two-layer concat (graph + node) | **Pi-context advantage** — multi-lens composition vs single fixed projection. Trade-off: context-packet has zero abstraction overhead. |
"""

SOURCE: analysis/2026-05-06-context-packet-comparison.md:193
QUOTE: """
- **How it would map to pi-context**: pi-context's articulation mentions "aggregate token budgeting: per-section + total injection budget with priority-driven trim." This pattern operationalizes that with a specific shape: every block's per-item macro should produce a "summary segment" (always-keep) + "body segment" (truncatable). Per-kind macro registry can encode this convention. Combines with the proposed `before_agent_start` cascade hook.
"""

SOURCE: analysis/2026-05-06-context-packet-comparison.md:194
QUOTE: """
- **Integration cost**: **Medium**. Requires per-kind macro convention (summary-segment marker), token-budget enforcement layer that respects the convention, and a truncation marker convention. Macros library currently renders whole-block; needs structural refactor.
"""

SOURCE: analysis/2026-05-06-context-packet-comparison.md:202
QUOTE: """
- **How it would map to pi-context**: pi-context's articulation already mentions "anti-injection delimiters" applied during `before_agent_start` cascade and around `contextBlocks` injection. context-packet's contribution is the specific delimiter format and the per-item naming (`"<node>"` quoted in the delimiter). Adopt as the canonical delimiter format for pi-context's macro outputs and lens renders.
"""

SOURCE: analysis/2026-05-06-context-packet-comparison.md:203
QUOTE: """
- **Integration cost**: **Low**. Format-and-call-site decision only. pi-context's executor or macro-rendering layer applies the wrapper.
"""

SOURCE: analysis/2026-05-06-context-packet-comparison.md:45
QUOTE: """
- **Per-item rendering** is hardcoded inside `buildPrompt` (`src/resolve.ts:143-162`): renders each packet as `Status: ${status}\nSummary: ${summary}\n\n${body}\n\nData: ${JSON.stringify(data)}`. Not pluggable. No per-kind macro registry — there is only one item kind (`Packet`).
"""

SOURCE: analysis/2026-05-08-poc-plan-B-revert.md:98
QUOTE: """
- Goal: `lens-view.ts` module exporting `loadLensView`, `renderLensView`, `buildCurationSuggestions`, `resolveComposition`, plus `/project view`, `/project lens-curate` subcommands and `project-validate-relations`, `project-edges-for-lens`, `project-walk-descendants`, `project-resolve-composition`, `project-status-rollup` tools.
"""

SOURCE: analysis/2026-05-10-fgap-026-closure-sub-phase-structure.md:16
QUOTE: """
| **7** | **RETIRED per DEC-0021** — cross-package source cascade was the wrong abstraction; source-cascade is absorbed into per-package C.* atomic units in Phase 1.2. Concerns reframed: FGAP-032 item-level contextBlocks remains as a standalone pi-jit-agents concern, retracked under Phase 6.5 or its own sub-phase. | — |
"""

SOURCE: analysis/2026-05-10-fgap-026-implementation-walkthrough.md:22
QUOTE: """
- **`packages/pi-jit-agents/src/compile.ts`** — `contextBlocks` injection reads from `<resolveContextDir(cwd)>` not `.project/`.
"""

SOURCE: analysis/2026-05-10-tool-surface-gap-audit.md:131
QUOTE: """
| P2            | **render-item-markdown**                      | `render-item(id)` returning formatted markdown                                                   | No per-item rendering for downstream prompt injection                                                                             |
"""

SOURCE: analysis/2026-05-10-tool-surface-gap-audit.md:81
QUOTE: """
- `/project view <lensId>` — lens markdown rendering (`loadLensView` + `renderLensView` JS exports)
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:111
QUOTE: """
| Substrate = config + partitions + lenses + closure-table relations + per-item macros = six discrete blocks one contract (line 11) | Partial | Closure-table + lenses + macros components reified via DEC-0009/0013/0017; six-block framing itself filed as DEC-0006 (superseded) |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:121
QUOTE: """
| Cache placement #25 / synthetic-edge cardinality #26 / cycle composition #27 / cycle detection #28 / bare-string vs typed contextBlocks #29 / lens-view filter param #30 / seedExamples migration #31 / block-api register config #32 / partitions runtime semantics #33 (lines 149-158) | Partial | DEC-0008 (typed contextBlocks) enacted; DEC-0011 (retire packaged defaults) enacted; remaining items not separately filed as issues |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:136
QUOTE: """
| Substrate primitives: typed memory + closure-table + lens + canonical-macro registry + cross-block resolver (lines 13-19) | Partial | DEC-0009/0013/0017 enact relations + lens; canonical-macro registry across packages not in substrate as DEC |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:150
QUOTE: """
| Macros location migration from pi-workflows to pi-context (line 35) | Not reified | Open — `templates/shared/macros.md` still in pi-workflows |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:199
QUOTE: """
| render-item-markdown P2 (line 129) | Partial | FGAP-037 identified (per-block-kind macros); render-item tool not separately filed |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:224
QUOTE: """
| Whole-block macros wrong granularity; per-item macros precondition for scoped injection (lines 20-26) | Reified | FGAP-037 identified |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:226
QUOTE: """
| `contextBlocks` item-level selectivity with name/item/focus/depth (line 56) | Reified | FGAP-032 identified |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:231
QUOTE: """
| REVIEW-001 blocked on render_decision macro (line 120) | Reified | `spec-reviews.json:REVIEW-001` status `not-started`; blocker captured via FGAP-037 |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:233
QUOTE: """
| Principle: every schema lands with its per-item macro as single unit of work (line 158) | Not reified | Principle not filed as DEC |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:25
QUOTE: """
| Design discipline reminder: schema lands with macro as unit (line 91) | Partial | FGAP-037 filed (per-block-kind macros missing for 6 newer kinds) |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:263
QUOTE: """
| Agent spec needs item-level `contextBlocks` selectivity (line 340) | Reified | FGAP-032 identified |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:294
QUOTE: """
5. **Every-schema-lands-with-its-macro principle as DEC** (`2026-04-15-blocks-as-prompt-substrate.md:158`) — explicit unit-of-work discipline
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:328
QUOTE: """
  - **Quote**: "substrate = config + partitions + lenses + closure-table relations + per-item macros. Six discrete blocks, one coherent contract"
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:359
QUOTE: """
- Macros co-shipment: every new schema requires per-item macro (FGAP-037 binding) — `blocks-as-prompt-substrate.md:158` principle
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:363
QUOTE: """
- **Remaining open**: Whether ALSO to install `priority` / `severity` / `source` / `status` / `verification-method` / `layer` / `plan` schemas. Whether to additionally author `goals` / `milestones` / `subagent-dispatch` / `explore-output` blocks (none in registry). Whether per-item macros for newly-installed kinds land in same sub-phase (FGAP-037 binding suggests yes).
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:41
QUOTE: """
### A.3 — `analysis/2026-05-01-blocks-schemas-macros-contract-synthesis.md`
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:45
QUOTE: """
| Blocks/schemas/macros are one contract; only validate-shape implemented (line 16) | Partial | DEC-0013 + DEC-0017 + DEC-0020 enact substrate-canon; principle itself not stated as DEC |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:536
QUOTE: """
  - **Quote**: "lenses | Named projections over a target block, with `relation_type`, `bins`, optional `derived_from_field` (auto-derivation) and `render_uncategorized` policy."
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:568
QUOTE: """
- **Macros location**: `context-block-design.md:91` says "Per-block-kind macros land alongside schemas — FGAP-037 captures the 6 missing." `pi-context-rename-decomposition.md:35` says macros migration from pi-workflows → pi-context is open. The two docs agree macros need to move; neither says they HAVE moved. Substrate FGAP-037 identified, not closed.
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:569
QUOTE: """
- **Six-block contract identity**: `2026-05-03-substrate-arc-frame.md:11` claims "six discrete blocks" but enumerates only five with POC evidence (config / partitions / lenses / relations / per-item-macros). DEC-0006 attempted to formalize the sixth (prompt-composition contract OR scopes) and is now `superseded` — meaning the sixth-block question is unresolved and the contract enumeration sits at five+open.
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:598
QUOTE: """
- **Decision 1 (Block-kind set)**: Doc-evidence sets minimum-floor at `config + relations + roadmap + phase + context-contracts` (4 to install; context-contracts already done). **User direction needed on**: whether to additionally install `priority` / `severity` / `source` / `status` / `verification-method` / `layer` / `plan`; whether to author NEW kinds (`goals` / `milestones` / `subagent-dispatch` / `explore-output` / `lessons` / `postmortem`); whether per-item macros co-ship in same sub-phase.
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:66
QUOTE: """
| Q1 macro tier — collapse to two-tier (line 158) | Not reified | Tier-D research caveat; not filed |
"""

SOURCE: analysis/2026-05-14-arc-tracking-substrate-decision-sharpening.md:99
QUOTE: """
| Item 3: 9× whole-block scaffolding duplication in shared/macros.md (line 4) | Not reified | Not filed |
"""

SOURCE: analysis/2026-05-14-milestones-and-roadmap-draft.md:139
QUOTE: """
  derived purely from loaded config + schemas + macros — no built-in vocabulary commitments
"""

SOURCE: analysis/2026-05-14-milestones-and-roadmap-draft.md:145
QUOTE: """
  PROJECT_BLOCK_TYPES const removed from project-sdk.ts (FGAP-056); macro library bootstrap
"""

SOURCE: analysis/2026-05-14-milestones-and-roadmap-draft.md:15
QUOTE: """
- analysis/2026-05-01 substrate-arc-distillation + ceremony-ideas + blocks-schemas-macros-contract-synthesis
"""

SOURCE: analysis/2026-05-14-milestones-and-roadmap-draft.md:336
QUOTE: """
- Framework-gaps: FGAP-052 (config-declared-but-unconsumed) / FGAP-056 (PROJECT_BLOCK_TYPES const removal) / FGAP-057 (macro library bootstrap) / FGAP-058 (universalization integration test)
"""

SOURCE: analysis/2026-05-14-milestones-and-roadmap-draft.md:337
QUOTE: """
- Source changes: project-sdk.ts const removal cascade; macro auto-discovery fallback; runtime layer-aware behavior; lens-validator config-registration
"""

SOURCE: analysis/2026-05-17-config-declared-invariants-design.md:13
QUOTE: """
> "The framework's source code MUST operate on canonical_id-keyed registries derived purely from config.json + .project/schemas/ + .pi/templates/ macros … a user with a wholly different substrate conception can clone pi-context, author their own config + schemas + macros + relation_types + lenses + layers, and have a fully-functioning substrate canon for THEIR vocabulary without modifying any pi-context source. Implications: (a) hardcoded vocabulary literals in source … are gaps to close — vocabulary derives from loaded config."
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:15
QUOTE: """
1. **`before_agent_start` → `result.systemPrompt`** — runtime-honored: `agent-session.js:791-797` sets `this.agent.state.systemPrompt = result.systemPrompt`, which is snapshotted into the loop at `pi-agent-core/dist/agent.js:273` and sent to the wire at `pi-agent-core/dist/agent-loop.js:182`. This REPLACES the main system prompt for the entire prompt-to-completion arc (all tool-use turns of one user turn). This is the single most important lever — it lets our compiled `systemPrompt` (which already carries contextBlocks via Nunjucks injection) become the main agent's system prompt verbatim.
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:35
QUOTE: """
| **contextBlocks injection** (compose into system prompt) | `before_agent_start.systemPrompt` (carries our already-rendered `compiled.systemPrompt`, which Nunjucks-injects `_<name>` blocks wrapped `<context_block role="data">`) | YES | seamless | our injection: `compile.ts:162-187,407-502`; delivered as part of replaced system prompt per row 1 |
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:36
QUOTE: """
| **contextBlocks injection** (per-turn, as a message) | `context` event → `ContextEventResult.messages` | YES — runs every turn | seamless (data plane) | `types.d.ts:451-455,710-712`; runtime `runner.js:639-666`; wired as `transformContext` `sdk.js:235-240`; invoked every turn `pi-agent-core/agent-loop.js:175-176`. Returns the full replacement message array; an extension can prepend a synthetic context message |
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:37
QUOTE: """
| **contextBlocks injection** (one-shot alongside user msg) | `pi.sendMessage(..., {deliverAs:"nextTurn"})` / `BeforeAgentStartEventResult.message` | YES, once | seamless | `types.d.ts:832-836,735-736`; nextTurn injection `agent-session.js:770-789` |
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:5
QUOTE: """
Question: can a pi EXTENSION reshape the live main session (the harness-confined main LLM the user talks to) to assume one of our compiled `AgentSpec`s — system prompt, injected contextBlocks, tool surface, model/thinking, output contract — with no fork to pi?
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:58
QUOTE: """
1. **Load + compile our spec.** `createAgentLoader({cwd}).(name)` → `compileAgent(spec, {env, input, cwd})` (`agent-spec.ts:219`, `compile.ts:217`). This yields `compiled.systemPrompt` (already carrying `<context_block role="data">`-wrapped contextBlocks) + `compiled.spec.tools/model/thinking`.
"""

SOURCE: analysis/2026-05-21-main-agent-as-jit-agent-feasibility.md:61
QUOTE: """
4. **Impose the system prompt per turn.** Register a persistent `before_agent_start` handler that, while "agent mode" is active, returns `{ systemPrompt: compiled.systemPrompt }` every turn (`types.d.ts:796`, honored `agent-session.js:791-797`). Store the active compiled spec in extension state; the handler is a no-op when inactive. (Alternatively/additionally a `context` handler to inject fresh contextBlocks each turn as a synthetic message — useful if blocks change mid-session.)
"""

SOURCE: analysis/2026-05-21-pi-sdk-0.74-to-0.75-investigation.md:166
QUOTE: """
1. **Re-evaluate our anti-injection delimiter strategy against pi 0.75.0's XML-tag context boundaries** (compile.ts:144-212). 0.75.0 switched pi's own system-prompt + context-file boundaries from Markdown to explicit XML tags. Our `contextBlocks` wrapping uses hand-rolled delimiter markers; aligning our delimiter convention with pi's XML-tag convention makes injected blocks consistent with how the host now frames untrusted context. Highest value — directly on the "canonical" axis the user named. (Requires reading pi 0.75.x system-prompt source to confirm the exact tag names; see §7.)
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:11
QUOTE: """
- **Context plugin (proposed)** — pure DATA: `conception.json` + `schemas/` + `blocks/` + relations seed + macros. Carries no code.
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:29
QUOTE: """
5. **Conception manifest is incomplete for portability.** `conception.json` carries no macros, hierarchy[], or naming{} — a full portable model needs these (macros especially).
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:3
QUOTE: """
Floated by user: a portable, third-party-authorable bundle of a complete CONTEXT MODEL (config + schemas + starter blocks + relations + macros), installable into any pi-context substrate so others can use a crafted conception immediately. Grounded by two read-only Explore passes against the live tree. Status: feasibility exploration; idea filed as FEAT-003 (proposed) + R-0013.
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:32
QUOTE: """
Data model (schemas/config/blocks/relations/invariants/lenses) lives in **pi-context**; per-block-kind rendering **macros** live in **pi-workflows** (`templates/shared/macros.md`, keyed by canonical_id; per-item in `templates/items/<kind>.md`). A complete context model spans both packages.
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:36
QUOTE: """
- Pass 2 found the cheaper resolution: the **3-tier template search already reads project `.pi/templates/` (tier 1)**, so the install ceremony can **extract a bundle's macros into `.pi/templates/items/<kind>.md`** and they're discovered with NO pi-workflows change, provided macro names follow the `render_<canonical_id>` / per-item convention.
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:38
QUOTE: """
→ Recommended: ship macros inside the bundle; install extracts them to the project template dir. The conception manifest gains a `macros`/template-path field so macro delivery is registered + validatable rather than implicit. (Macro-discovery-as-data is the only pi-workflows-side touch, and it's additive.)
"""

SOURCE: analysis/2026-05-22-context-plugin-feasibility.md:49
QUOTE: """
- Sub-feature C: macro-in-bundle + extract-on-install into `.pi/templates/` + manifest macro field.
"""

SOURCE: analysis/2026-05-25-system-thesis-jit-everything-vision-candidate.md:16
QUOTE: """
- **macro-rendered:** `templates/shared/macros.md` per-block-kind render macros; agent specs compile via Nunjucks (pi-jit-agents); skills render via macros (FEAT-007).
"""

SOURCE: analysis/2026-05-25-system-thesis-jit-everything-vision-candidate.md:17
QUOTE: """
- **composed from empty to need:** DEC-0015 (no default substrate dir) + DEC-0011 (ship no defaults) + DEC-0025 (vocabulary-neutral) — default is EMPTY; config materializes exactly what's needed. Generalized to: agents (JIT compile), capabilities (FEAT-005 JIT-composed-from-empty per dispatch), context (contextBlocks injected to need), reads (FGAP-103 element-level, composed-to-need), guidance (FEAT-007 JIT skills), and governance (DEC-0047 constitutional model: nothing exists until config legislates it).
"""

SOURCE: analysis/2026-05-25-system-thesis-jit-everything-vision-candidate.md:27
QUOTE: """
It is the single sentence that predicts the right design for any new surface: when something is static/bespoke (the way skills were before FEAT-007, or reads before FGAP-103), the thesis says make it schema-shaped + macro-rendered + composed-to-need. It is the test a new feature is checked against. That predictive/normative role is what a vision/charter element is for — distinct from any one decision.
"""

SOURCE: analysis/2026-05-25-system-thesis-jit-everything-vision-candidate.md:7
QUOTE: """
> Everything — substrate, agents, capabilities, guidance — is schema-shaped data, macro-rendered, composed from empty to need.
"""

SOURCE: analysis/2026-05-26-decisions-block-shape-survey.md:22
QUOTE: """
| DEC-0008 | contextBlocks parameterization: typed vs bare-string | enacted | 970 | 640 | 5 / ~640 | 2 (1 rej) | – | – | 3 | [FEAT-001] | 2 | 2 (path) | user | 2026-05-03 | agent/claude-opus-4-7 |
"""

SOURCE: analysis/2026-05-26-decisions-block-shape-survey.md:253
QUOTE: """
- DEC-0006 sole consequence: "Superseded: off-by-one re-count of the substrate contract. Original framing claimed six discrete blocks while enumerating five (config + partitions + lenses + closure-table relations + per-item macros). On reflection no sixth block exists; the contract is five blocks. Filed under proliferation pressure during the heuristic-widening pass; retired without enactment."
"""

SOURCE: analysis/2026-05-26-decisions-block-shape-survey.md:282
QUOTE: """
- DEC-0017 consequences item: "FGAP cluster filed alongside this DEC: FGAP-029 (bidirectional scoped traversal primitive — walk-ancestors / gather-by-relation), FGAP-030 (per-work-unit-kind context contract substrate), FGAP-031 (gather-execution-context composition primitive), FGAP-032 (item-level contextBlocks selectivity in pi-jit-agents driven by gather output)."
"""

SOURCE: analysis/2026-05-26-decisions-block-shape-survey.md:283
QUOTE: """
- DEC-0025 consequences item: "Macro library bootstrap surface for user-added kinds — drop-in macros + canonical-kind defaults + framework auto-discovery (FGAP-057 filed; cross-decision with FGAP-037)."
"""

SOURCE: analysis/2026-05-26-decisions-substrate-revision-grounding.md:102
QUOTE: """
| Null-state convention | FGAP-110 per-item valid/current discipline applied at field level |
"""

SOURCE: analysis/2026-05-26-pi-subagents-eval-vs-jit-intentions.md:22
QUOTE: """
- Agents are **markdown + flat string frontmatter**, NOT JSON-schema-shaped, NOT macro-composed. `parseFrontmatter` (`src/agents/frontmatter.ts:1-29`) is a hand-rolled `key: value` line parser — no YAML lib, no schema, no `$ref`, no validation against a meta-schema. Tools/skills/reads are comma-split strings (`src/agents/agents.ts:585-615`).
"""

SOURCE: analysis/2026-05-26-pi-subagents-eval-vs-jit-intentions.md:30
QUOTE: """
- **Inverted default (DIVERGES from JI-024 empty-default).** README `:468` + `pi-args.ts:96`: *"If `tools` is omitted, pi-subagents does not pass `--tools`, so the child gets Pi's normal builtin tools."* The default is **full builtin toolset**, not empty. Our user's intent (JI-024) is the exact inverse: **"No perms. No tools. Configs and schemas and macros bring all into existence from empty state."** pi-subagents is opt-OUT; we want opt-IN.
"""

SOURCE: analysis/2026-05-26-pi-subagents-eval-vs-jit-intentions.md:63
QUOTE: """
| Spec format | Markdown + flat frontmatter, hand-parsed, no schema/macros (`frontmatter.ts`, `agents.ts:562`) | JI-024/033/034 | **DIVERGE** | NOT schema-shaped or macro-composed. Our schema-driven + Nunjucks-macro approach is strictly more aligned with the user's "everything schema-shaped, macro-rendered" thesis. Do not regress to flat markdown. |
"""

SOURCE: analysis/2026-05-26-pi-subagents-eval-vs-jit-intentions.md:86
QUOTE: """
- **Flat markdown + hand-rolled frontmatter as the spec format** (`frontmatter.ts`, `agents.ts:562-690`). No schema, no macros, no validation. Directly contradicts JI-024/033/034 (everything schema-shaped, macro-rendered, composed from empty). Our schema + Nunjucks approach is more aligned; do not regress.
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:103
QUOTE: """
- **F / FEAT-007** (proposed) — JIT skills (schema-shaped, macro-rendered, composable-on-demand guidance)
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:118
QUOTE: """
- **G / FGAP-032** — item-level `contextBlocks` selectivity missing (currently injects whole blocks)
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:144
QUOTE: """
- **G / FGAP-037** — per-block-kind Nunjucks macros missing for 6 newer block kinds (decisions / spec-reviews / etc.)
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:145
QUOTE: """
- **G / FGAP-057** — macro library bootstrap missing for user-added block kinds (also tagged pi-context)
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:57
QUOTE: """
- **G / FGAP-022** — `renderLensView` does not emit per-member subsections for composition lenses
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:71
QUOTE: """
- **G / FGAP-057** — macro library bootstrap missing for user-added block kinds (also tagged pi-workflows)
"""

SOURCE: analysis/2026-05-26-roadmap-by-extension.md:98
QUOTE: """
- **G / FGAP-110** — per-item valid/current bits + constrained-agent read-gate (data-room generalization)
"""

SOURCE: analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md:24
QUOTE: """
- **Cited canon excerpt:** "(1) A dispatched agent's tools are declared in its .agent.yaml spec … default EMPTY … (2) The grant is OPERATION-GRANULAR, not tool-wholesale … config + schemas + macros are the registry of what is grantable (default empty) … (4) WIDENING the registry (a new tool/op/capability bundle) is a capability mutation requiring HUMAN ratification: writes to capability/registry fields require writer.kind=human"
"""

SOURCE: analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md:34
QUOTE: """
- **Cited canon excerpt:** "there is ONE agent abstraction — the jit-agent (pi-jit-agents library: AgentSpec + loader + compile/templates/macros/schemas/contextBlocks + capability composition + execute). Every consumer uses THIS abstraction"
"""

SOURCE: analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md:67
QUOTE: """
### Item L: FEAT-007 (JIT skills — schema-shaped, macro-rendered, composable)
"""

SOURCE: analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md:69
QUOTE: """
- **Cited canon excerpt:** "everything — substrate, agents, capabilities, guidance — is schema-shaped data, macro-rendered, composed from empty to need" (JI-034, cited in FEAT-007)
"""

SOURCE: analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md:81
QUOTE: """
- **Cited canon excerpt JI-024:** "No perms. No tools. Configs and schemas and macros bring all into existence from empty state."
"""

SOURCE: analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md:82
QUOTE: """
- **Cited canon excerpt JI-028:** "we explicity grant tools using --tools for jit agents: schemas and macros and templates such that the agent gets programmatically carry what's declared"
"""

SOURCE: analysis/2026-05-28-launch-script-harness-canonical-audit.md:21
QUOTE: """
> "a tools-only constrained in-pi orchestrator (DEC-0014, NO code/bash perms) authors a typed work-order/spec BLOCK via the substrate write tools; dispatches a privileged JIT-agent (spec-implementer-class: file write/edit + exactly-scoped command perms) that consumes the spec via contextBlocks; the agent makes ACTUAL source edits; the change is validated by REAL DETERMINISTIC CHECKS (build/check/test exit code + runtime-demo + adversarial-against-artifacts...); and the validated change is committed with DispatchContext agent-authorship attestation through husky."
"""

SOURCE: analysis/2026-05-28-launch-script-harness-canonical-audit.md:33
QUOTE: """
**JI-024 (verbatim user):** "No perms. No tools. Configs and schemas and macros bring all into existence from empty state."
"""

SOURCE: analysis/2026-05-29-cc-workflows-vs-pi-workflows-recon.md:189
QUOTE: """
- validateWorkflow(spec, cwd): 11 checks (agent resolution, schema existence, step references, context refs, filter names, metadata, inputSchema required keys, contextBlocks, template alignment)
"""

SOURCE: analysis/2026-05-29-cc-workflows-vs-pi-workflows-recon.md:281
QUOTE: """
**Implementation**: executor collects per-item per-stage promises; resolution polls for ready items rather than layers.
"""

SOURCE: analysis/2026-05-29-cc-workflows-vs-pi-workflows-recon.md:321
QUOTE: """
**Verdict**: ADOPT — codify patterns as bundled workflow templates + step macros.
"""

SOURCE: analysis/2026-05-29-cc-workflows-vs-pi-workflows-recon.md:333
QUOTE: """
- Add macro library (Nunjucks) for boilerplate (e.g., `{% call vote_aggregation(judges) %}...{% endcall %}`)
"""

SOURCE: analysis/2026-05-29-cc-workflows-vs-pi-workflows-recon.md:564
QUOTE: """
**Substrate Context Injection**: Pi's contextBlocks mechanism injects project-specific context (architecture docs, codebase snapshots) into agent dispatch. Claude workflows must pass context as explicit input. Pi's advantage: less prompt boilerplate; automatic context selection.
"""

SOURCE: analysis/2026-05-29-cc-workflows-vs-pi-workflows-recon.md:566
QUOTE: """
**Nunjucks Template Rendering**: Pi agents have systemPrompt + taskTemplate rendered with Nunjucks (context injection, macros, loops). Claude workflows string-interpolate. Pi's advantage: flexible templating; less string concatenation; reusable macro libraries.
"""

SOURCE: analysis/context-block-design.md:76
QUOTE: """
Per FGAP-038 (item-level context injection script), markdown projection requires per-block-kind macros (FGAP-037). JSON projection is universal. XML projection (per-item wrapped) is universal. Open: is there a fourth shape needed where items are PARTIALLY rendered (specific fields only) — and if so does that need first-class config support (e.g. `display_strings.partial_renderings` map) or is it purely script-side?
"""

SOURCE: analysis/context-block-design.md:91
QUOTE: """
- **Per-block-kind macros land alongside schemas** — FGAP-037 captures the 6 missing
"""

SOURCE: analysis/gsd-2-derivability.md:118
QUOTE: """
**gsd-2 has built, in imperative code, the things our platonic form would build in declarative specs.** That is the precise sense in which gsd-2 should be derivable from pi-project-workflows: when the framework is complete, each `auto-*.ts` file collapses into a monitor spec or workflow step, each `M###-ROADMAP.md` template collapses into a block render macro, each workflow engine variant collapses into the single workflow executor. The methodology survives; the imperative code evaporates.
"""

SOURCE: analysis/gsd-2-derivability.md:43
QUOTE: """
| `M###-ROADMAP.md` | rendered view of `.project/milestones.json` via a macro |
"""

SOURCE: analysis/gsd-2-derivability.md:47
QUOTE: """
| `M###-CONTEXT.md` / `S##-CONTEXT.md` | `contextBlocks` injection from scoped block subsets |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:101
QUOTE: """
| Decisions register auto-regeneration | `decisions` block (already exists) + render macro to produce DECISIONS.md view. `append-block-item` with schema validation handles ID assignment. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:105
QUOTE: """
| Depth calibration (deep/targeted/light) | The decision is in the agent prompt. The INPUTS to the decision are framework concerns: how complex is this work, what has been done before, what constraints exist — delivered via `contextBlocks` and SDK queries. Without that context, depth calibration cannot work. The prompt provides the policy; the framework provides the facts the policy needs. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:111
QUOTE: """
Our current `contextBlocks` injection reads whole blocks. gsd-2 needs to inject:
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:116
QUOTE: """
This is a first-class framework gap. It is not currently in our open issues list. It is a concrete, specific missing capability: **contextBlocks with query/filter expressions**.
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:118
QUOTE: """
**2. gsd-2's "inlined context" IS contextBlocks by another name.** Every gsd-2 prompt has `{{inlinedContext}}` — preloaded file contents injected into the prompt template. That is exactly our `contextBlocks` injection, renamed. We have the primitive; gsd-2 uses it extensively.
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:122
QUOTE: """
**4. gsd-2's research templates are effectively agent specs without the framework to hold them.** `research-milestone.md` and `research-slice.md` are ~80-line markdown prompt templates. They are agent specs with `inputSchema` (milestone/slice identifier + inlined context), `contextBlocks` (research, architecture, requirements), `output.schema` (the research template sections), and a task template (the prompt body). They exist as standalone `.md` files because gsd-2 doesn't have our `.agent.yaml` compilation pipeline.
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:132
QUOTE: """
3. **Research in tiers** (milestone → slices, parallel) → write findings into research blocks, with scoped contextBlocks reads of upstream work
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:135
QUOTE: """
All four stages map to workflows + agents + blocks + render macros in our platonic form. The gaps this investigation surfaces — now filed as issues — include:
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:137
QUOTE: """
- **Scoped/filtered contextBlocks reads** (issue-041) — the direct primitive needed for gsd-2's Forward Intelligence and dependency-scoped context injection
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:89
QUOTE: """
| `.gsd/CODEBASE.md` generator | A workflow that runs `git ls-files`, walks directories, writes to `.project/architecture.json` (or a new `codebase` block). Render macro produces CODEBASE.md view. The JSON block is the truth; the markdown is a render. Fingerprint + TTL stored in block metadata. Auto-refresh is a scheduled workflow (issue 031). |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:91
QUOTE: """
| Discussion → `REQUIREMENTS.md` | A discussion workflow that drives the interview via an agent with `inputSchema` (user message) and outputs structured items into `.project/requirements.json` (already exists as a block). The reflection, anti-reduction, and investigation-first protocol are encoded in the agent's prompt template. Render macro produces REQUIREMENTS.md view. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:92
QUOTE: """
| `M###-CONTEXT.md` | A block subset injected via `contextBlocks: [requirements, decisions, milestones]` scoped to the active milestone. The injection is a render of filtered block data at agent compile time. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:93
QUOTE: """
| Milestone research | A workflow step that runs a research agent with `contextBlocks: [project, architecture, requirements]` and writes output to a `research` block (or appends to an existing one). The agent template is the current `research-milestone.md` content. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:94
QUOTE: """
| Slice research (parallel) | A `forEach` workflow step over slices, dispatching one research agent per slice in parallel. The DAG planner handles parallelism automatically. Forward intelligence = prior slice's verification/summary block data injected via `contextBlocks`. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:97
QUOTE: """
| Skill discovery | Expressible as a **directory-watching monitor** that observes a skills directory, writes detected skills to a `.project/skills.json` block, and the block is injected into agent prompts via `contextBlocks`. The monitor pattern is general — it generalizes to any filesystem observation (dependency changes, config drift, external artifact arrival). The specific hosting (Pi's extension loader invoking before_agent_start hooks) is Pi platform territory, but the detection-and-injection pipeline is derivable from our framework primitives. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:98
QUOTE: """
| Inlined context preloading | This IS `contextBlocks` injection. The mechanism already exists. What gsd-2 calls "inlined context" is exactly what our framework does when it reads declared `contextBlocks` from `.project/` and renders them into the template environment. |
"""

SOURCE: analysis/gsd-2-foundational-intelligence.md:99
QUOTE: """
| Forward intelligence between slices | A specific `contextBlocks` pattern where slice N+1's agent declares `contextBlocks: [verification, decisions]` filtered to completed upstream slices. Our current `contextBlocks` mechanism reads whole blocks; gsd-2's forward intelligence requires **filtered/scoped reads** — a capability we don't yet articulate. |
"""

SOURCE: analysis/research-blocks-design.md:250
QUOTE: """
contextBlocks: [
"""

