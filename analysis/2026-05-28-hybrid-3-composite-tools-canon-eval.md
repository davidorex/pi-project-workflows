# Hybrid 3 (Composite Tools) — Canon Alignment Evaluation

Date: 2026-05-28
Scope: pi-agent-dispatch composite-tool design proposal

## Design recap

Hybrid 3: extension code declares a small fixed set of canonical composite KINDS (typed param schema + typed execute fn; new kind = source change + release). Project config (`config.tool_operations[]`) declares named bounded INSTANCES of those kinds (`{canonical_id, kind, instance_params, …}`). At extension load, pi-agent-dispatch dynamically constructs Pi tools by closing each kind's execute over its instance_params and registering under `canonical_id`. Granting flows unchanged through TASK-089 composeToolGrant + TASK-081 executeAgent clamp. A new `author-tool-grant` Pi tool extends `amendConfigEntry` with `writer.kind=human` enforcement (DEC-0047 pattern, mirrors `author-agent-spec`).

## Per-canon evaluation

### Item A: DEC-0040 (substrate single source of truth)
- **Verdict:** ALIGN
- **Cited canon excerpt:** "The .context substrate (typed blocks + relations) is the SINGLE authoritative source for both PROCESS … and STATE … State is DERIVED from the substrate as a pure function of its contents; it is never independently hand-stored."
- **Rationale:** Hybrid 3 puts the catalog of granted composite-tool instances in `config.tool_operations[]` (substrate) and derives the live Pi-tool registry at load by pure function of config. Code carries only the kind vocabulary; the per-project tool surface is derived from substrate. No hand-stored duplicate registry.

### Item B: DEC-0044 (narrowed) — pi-agent-dispatch scope
- **Verdict:** ALIGN-with-caveat
- **Cited canon excerpt:** "the new pi-agent-dispatch extension whose ONLY scope is hosting the sub-agent→sibling-agent pi.registerTool site (FEAT-004) and the dispatch-boundary capability clamp (FEAT-005, parent-grant ⊆ child-grant enforcement). The extension does NOT wrap or intermediate orchestrator use of jit-agents. The extension does NOT re-expose jit-agents' library surfaces."
- **Rationale:** Composite tools live at the registration site (the extension's domain) and clamp via the existing TASK-081 boundary — squarely on-scope. CAVEAT: each composite KIND's execute fn (`read-files`, `git-log`, `grep-paths`, `command-allowlist`) is a leaf capability primitive, not agent dispatch. DEC-0044's "ONLY scope" language reads narrowly as the call-agent registration site. Whether pi-agent-dispatch is the right HOME for non-agent leaf capabilities (vs. e.g. a sibling pi-capability extension or pi-context for read-files) is a home-question the narrowed DEC-0044 does not answer affirmatively.

### Item C: DEC-0047 (capability model in code)
- **Verdict:** ALIGN
- **Cited canon excerpt:** "(1) A dispatched agent's tools are declared in its .agent.yaml spec … default EMPTY … (2) The grant is OPERATION-GRANULAR, not tool-wholesale … config + schemas + macros are the registry of what is grantable (default empty) … (4) WIDENING the registry (a new tool/op/capability bundle) is a capability mutation requiring HUMAN ratification: writes to capability/registry fields require writer.kind=human"
- **Rationale:** Hybrid 3's `config.tool_operations[]` IS the registry; the per-invocation grant is the spec's declared subset (existing pipeline); the `author-tool-grant` tool enforces `writer.kind=human` at the block-api chokepoint per the canonical pattern. Cleanly enacts DEC-0047 surface (1)+(2)+(4). NOTE: DEC-0047 (4) reads as "writes to capability/registry FIELDS require writer.kind=human" — Hybrid 3's gate at `amendConfigEntry` extension is consistent with the existing `author-agent-spec-tool.ts` pattern (verified at packages/pi-agent-dispatch/src/author-agent-spec-tool.ts:45).

### Item D: DEC-0048 (bundled artifacts NOT regression gates)
- **Verdict:** TANGENTIAL
- **Cited canon excerpt:** "zero existing workflows are to be considered targets of any work. that goes for their tests too … framework/engine UNIT tests … ARE targets and remain regression gates"
- **Rationale:** Hybrid 3 is framework work (extension code + config schema + dispatch-time wiring); not a target-class. Adds engine unit tests (kind execute fns + closure binding + registry-load) which ARE regression gates. No interaction with disposable bundled artifacts.

### Item E: DEC-0049 (uniform-agent axiom)
- **Verdict:** ALIGN
- **Cited canon excerpt:** "there is ONE agent abstraction — the jit-agent (pi-jit-agents library: AgentSpec + loader + compile/templates/macros/schemas/contextBlocks + capability composition + execute). Every consumer uses THIS abstraction"
- **Rationale:** Composite tools are TOOLS not agents — they expand the tool vocabulary the one jit-agent abstraction can be granted. No per-consumer agent kind introduced; no parallel agent abstraction.

### Item F: DEC-0019/0020 (orchestrator scripts dual-surface)
- **Verdict:** ALIGN-with-caveat
- **Cited canon excerpt:** "new substrate op = library + Pi tool + CLI script as a unit" + "Per the just-landed dual-surface pattern … library + Pi tool + CLI script land as a unit. DEC-0019 adds: the CLI script ALSO articulates the API contract requirement set surfaced during its writing"
- **Rationale:** Each composite KIND should land as a triple (library fn + the dynamically-constructed Pi tool + a CLI script under `scripts/orchestrator/`) per DEC-0019/0020. Hybrid 3 design summary names library + Pi tool but does NOT explicitly include the CLI-script third leg or its FGAP-surfacing role. CAVEAT: the design must specify CLI parity per KIND or it under-fulfills the dual-surface canon.

### Item G: FEAT-004 (agents-as-tools dual-surface)
- **Verdict:** TANGENTIAL
- **Cited canon excerpt:** "Project pi-jit-agents' AgentContract … into a callable agent-DISPATCH surface, dual-surfaced per DEC-0019/0020"
- **Rationale:** FEAT-004 is the call-agent dispatch tool; Hybrid 3 is composite leaf-capability tools that compose ALONGSIDE call-agent in the same extension. Adjacent but not the same surface. Hybrid 3 does not block or modify FEAT-004.

### Item H: FEAT-005 (JIT capability composition + sandbox)
- **Verdict:** ALIGN — Hybrid 3 IS one possible enactment of FEAT-005's registry surface
- **Cited canon excerpt:** "A capability/permission registry exists (config-declared, empty by default) whose entries are tool grants AND operation-level permissions (e.g. an allowlisted command, a path-scoped read/write), not just tool categories" + "Per subagent-dispatch, a capability bundle is composed JUST-IN-TIME from the registry"
- **Rationale:** Hybrid 3's `config.tool_operations[]` of instance-bound composites is concretely a config-declared empty-by-default registry of operation-level grants (path-scoped read/write, allowlisted command, etc.) — verbatim what FEAT-005 acceptance criterion #1 names. The kind-vs-instance split is a design choice for HOW the registry is shaped, not a conflict.

### Item I: FEAT-006 (constrained-orchestrator → spec-block → privileged-agent → real-check → attested-commit)
- **Verdict:** ALIGN
- **Cited canon excerpt:** "Privileged JIT-agent dispatched as a typed call (FEAT-004) with exactly-scoped capabilities composed from empty (FEAT-005) and clamped to its declared grant (FGAP-099)"
- **Rationale:** Composite tools are how "exactly-scoped capabilities" become invocable primitives the privileged agent can receive. A `command-allowlist` instance bound to `npm test` is exactly the FEAT-006 acceptance shape ("scoped right (run `npm test`) rather than `bash` … entire" per DEC-0047). Hybrid 3 is on the FEAT-006 path.

### Item J: FGAP-099 (workflow agent-step dispatch tool-clamp)
- **Verdict:** ALIGN
- **Cited canon excerpt:** "At the dispatch boundary (buildArgs/dispatch in pi-workflows — the canonical cross-cutting locus): … intersect agentSpec.tools with it and fail-closed on any spec tool outside the parent set … gate any capability-broadening beyond the parent set behind the DEC-0047 human-ratification path. Pairs with FEAT-005"
- **Rationale:** Hybrid 3's "Granting via `--tools <name>` works through the existing TASK-089 composeToolGrant + TASK-081 executeAgent clamp pipeline unchanged" preserves the boundary clamp at the canonical site. Composite tools become first-class names in that clamp set with no parallel ungated path. (Reminder: FGAP-099's prior workflow-local fix was reverted as wrong-layer; Hybrid 3 keeping the clamp at dispatch is correct-layer per the narrowed DEC-0044.)

### Item K: FGAP-102 (real-check verdict, not LLM self-report)
- **Verdict:** TANGENTIAL
- **Cited canon excerpt:** "the terminal verdict must key on a real external-command exit code; an LLM verifier may triage/route but may not be the terminal gate"
- **Rationale:** Hybrid 3 governs the capability layer; FGAP-102 governs the verdict layer. Composite tools could include a `command-allowlist` for `npm test` (the real-check primitive itself) but Hybrid 3 does not speak to verdict shape. No conflict.

### Item L: FEAT-007 (JIT skills — schema-shaped, macro-rendered, composable)
- **Verdict:** ALIGN — Hybrid 3 is structurally consistent with the JIT-everything thesis
- **Cited canon excerpt:** "everything — substrate, agents, capabilities, guidance — is schema-shaped data, macro-rendered, composed from empty to need" (JI-034, cited in FEAT-007)
- **Rationale:** Hybrid 3 enacts the "capabilities are schema-shaped data, composed from empty to need" half of the JIT-everything paradigm. Config-side instance entries are the schema-shaped data; kind execute is the deterministic-composition primitive. Coherent with the broader JIT vision FEAT-007 names.

### Item M: JI-021/010 (orchestrator uses jit-agents directly; jit-agents owns spec→typed-result)
- **Verdict:** ALIGN
- **Cited canon excerpt JI-021:** "let's presume it wasn't necessarily a pi-workflow; rather the orchestrator using jit-agents (which could be tasked bash and given it as a tool in its rendered prompt, e.g., or a file read, or a file write."
- **Cited canon excerpt JI-010:** "It owns everything between 'I have a spec' and 'I have a typed result.'"
- **Rationale:** Composite tools live in pi-agent-dispatch (the registration site), not in pi-jit-agents (the library). jit-agents' four boundary surfaces remain unchanged; composites are tools the spec can DECLARE, executed via the dispatch path. JI-021's example ("given bash as a tool … or a file read") is structurally the SAME shape as a composite `read-files` or `command-allowlist` — Hybrid 3 is one mechanism for that intention.

### Item N: JI-023/024/028/029 (user-articulated capability vocabulary)
- **Verdict:** ALIGN — Hybrid 3 most directly enacts JI-023
- **Cited canon excerpt JI-023:** "The sub agent gets its own tools to call. Specific sub agent tool calls can be permed exactly for specific tasks in the prompt and no others. Eg A bash command. Not bash. Tools and perms can be atomically and just-in-time composed, too. There can be a registry of them. Could even likely be sandboxed."
- **Cited canon excerpt JI-024:** "No perms. No tools. Configs and schemas and macros bring all into existence from empty state."
- **Cited canon excerpt JI-028:** "we explicity grant tools using --tools for jit agents: schemas and macros and templates such that the agent gets programmatically carry what's declared"
- **Cited canon excerpt JI-029:** "our tool for deciding valid + current is simply the work of a jit agent with perms for specific things -- read, amend blocks, etc. i think we have the primitives."
- **Rationale:** Hybrid 3 instantiates EXACTLY JI-023's "A bash command. Not bash." via `command-allowlist` instances and JI-023's "There can be a registry of them" via `config.tool_operations[]`. JI-024's empty-state default is preserved (existing TASK-089 + DEC-0047). JI-028's `--tools` grant pipeline is unchanged. JI-029's "perms for specific things" maps to instance-bound composites.

### Item O: feedback_no_stderr_diagnostics
- **Verdict:** TANGENTIAL
- **Cited canon excerpt:** "Never use console.error / console.log as diagnostic capture; extend the canonical TraceEntry pipeline instead"
- **Rationale:** Composite execution paths should route diagnostics through TraceEntry, not stderr. Implementation discipline, not a design conflict.

### Item P: feedback_no_parallel_ungated_paths
- **Verdict:** ALIGN — with vigilance flag
- **Cited canon excerpt:** "Adding a gated alternative next to an unrestricted original is not enforcement"
- **Rationale:** Hybrid 3 routes all composite grants through the existing TASK-089/TASK-081 clamp pipeline — no parallel ungated path introduced. VIGILANCE FLAG: if the `command-allowlist` kind sits next to a still-grantable wholesale `bash` tool, that IS a parallel ungated path. The design must either (a) deprecate broad-category tools from the registry once composite kinds exist, or (b) explicitly defend their co-existence. Design summary does not address this.

### Item Q: feedback_substrate_blocks_not_changelogs
- **Verdict:** TANGENTIAL
- **Cited canon excerpt:** "Block bodies are current-truth guidance, not changelogs"
- **Rationale:** Affects how the substrate WRITES describing Hybrid 3 are shaped (TASK/FEAT/DEC bodies = current-truth, not journey). Not a design property.

### Item R: TASK-088 work-orders schema
- **Verdict:** TANGENTIAL
- **Rationale:** TASK-088 governs orchestrator-authored work-order shape; Hybrid 3 governs tool-grant shape. Substrate-authorship-by-orchestrator pattern is reused for `author-tool-grant` (same writer.kind=human enforcement) but the work-order schema itself is unaffected.

### Item S: TASK-089 author-agent-spec pattern (writer.kind=human enforcement)
- **Verdict:** ALIGN — Hybrid 3 explicitly reuses the canonical pattern
- **Cited canon excerpt (verified at packages/pi-agent-dispatch/src/author-agent-spec-tool.ts:45):** `author-agent-spec: writer.kind must be 'human' per DEC-0047 (got '${params.writer?.kind}'). Capability/spec authoring is human-only; sub-agents have no escalation path.`
- **Rationale:** Hybrid 3 names `author-tool-grant` "analogous to author-agent-spec" with the identical writer.kind=human enforcement at the block-api write chokepoint. Reuses the canonical mutation gate pattern verbatim. Mechanically sound.

## Discovered conflicts

NONE FATAL. Two design-incompleteness issues surface that require decisions before implementation but do not contradict canon:

1. **CLI-script third leg (DEC-0019/0020):** Hybrid 3's summary names library + Pi tool but is silent on the CLI script under `scripts/orchestrator/` that each kind requires per the dual-surface unit. **Resolution direction:** name the CLI surface per kind (e.g. `scripts/orchestrator/exec-composite-<kind>.ts`) in the design before build.

2. **Co-existence with broad-category tools (feedback_no_parallel_ungated_paths):** If `command-allowlist` instances exist alongside a still-grantable `bash` operation in `TOOL_OPERATION_DEFAULTS` (verified at packages/pi-agent-dispatch/src/operation-vocab.ts: no `bash` listed currently; all 54 operations are pi-context/pi-workflows/pi-behavior-monitors tool ids), the registry today does NOT carry the broad-category alternative. **Resolution direction:** the design should explicitly forbid adding wholesale `bash`/`write`/`edit` to TOOL_OPERATION_DEFAULTS — composite kinds are the only path for those categories.

## Discovered alignments not explicitly claimed in the design summary

1. **DEC-0040 (substrate single-source):** Hybrid 3 derives the registered Pi-tool set at load from `config.tool_operations[]` — a pure function over substrate. Closes the gap where the live tool registry was code-side static.

2. **JI-023 verbatim "A bash command. Not bash.":** The `command-allowlist` kind with `instance_params: {allowed_commands: ["npm test"]}` is the most direct mechanical realization of this user verbatim that has surfaced; Hybrid 3 design summary does not call out this verbatim mapping.

3. **DEC-0047 surface (4) writer.kind=human chokepoint:** The block-api chokepoint enforcement already lives at `author-agent-spec-tool.ts:45`; Hybrid 3's `author-tool-grant` extends the exact same pattern to capability-registry writes — implementation cost low, pattern proven.

## Net judgement

Hybrid 3 represents a canonical-aligned design that is one concrete shape of FEAT-005's required "config-declared, empty-by-default capability registry whose entries are tool grants AND operation-level permissions." It cleanly enacts DEC-0047 surfaces (1)+(2)+(4), reuses the proven TASK-089 writer.kind=human pattern, preserves the TASK-081/TASK-089 clamp pipeline at the canonical site (no parallel ungated path), and most directly realizes JI-023's "A bash command. Not bash." + "There can be a registry of them" verbatim. The kind/instance split is a design choice (vs. one flat instance-only schema), not a canon conflict. Two design-completeness items require decisions before build: (a) CLI-script third leg per DEC-0019/0020; (b) explicit forbid on co-existence with wholesale tool categories per feedback_no_parallel_ungated_paths. Both are scopable additions, not redesigns. Hybrid 3 does NOT require canon evolution — it lands cleanly inside existing canon.

## Untouched canon (out-of-scope for this design)

- FEAT-007 (JIT skills) — Hybrid 3 is consistent with the JIT-everything thesis but does not enact skills
- FEAT-006 real-check / attested-commit tail (FGAP-102) — verdict layer, not capability layer
- TASK-088 work-orders schema shape
- DEC-0048 disposable bundled artifacts (no interaction)
- FEAT-004 call-agent dispatch tool (adjacent, not modified)
- feedback_no_stderr_diagnostics (implementation discipline, not design)
- feedback_substrate_blocks_not_changelogs (substrate-write discipline)
