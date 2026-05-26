# Draft Roadmap by Extension — 2026-05-26

Persisting draft. Substrate is the source of truth (DEC-0040); this file is a projection that groups currently-open items by extension home so a fresh context can see the per-package work surface at a glance. Item bodies live in `.project/{decisions,framework-gaps,features,tasks}.json` — query for full text.

Status legend: **D** = decision-need (open DEC), **G** = open framework-gap, **F** = feature (proposed/in-progress), **T** = task. Item IDs are queryable substrate IDs.

---

## Cross-cutting (governance / multi-extension)

Enacted this session, framing all per-extension work below:
- **DEC-0044** — agent-dispatch home = NEW extension wrapping pi-jit-agents (CONFLICTS with JI-021 per FGAP-112 — pending user re-anchor)
- **DEC-0047** — capability model: spec-declared, default empty, operation-granular, clamped ⊆ parent, terminal verdict = real checks (de-oracled)
- **DEC-0048** — existing workflows + bundled agents + their tests = disposable legacy, NOT targets
- **DEC-0049** — uniform-agent axiom (JI-001): ONE agent abstraction across consumers
- **DEC-0036** — re-derive `.context` clean (umbrella, in-flight via TASK-043)
- **DEC-0040** — substrate = single source of truth; state derived

Cross-cutting open:
- **D / DEC-0001** — agent spec `model:` field semantics
- **D / DEC-0002** — thinking-seam enforcement for forced-toolChoice dispatch
- **D / DEC-0003** — `parseModelSpec` ownership at execute boundary
- **D / DEC-0026** — ID-prefix padding (3-digit vs 4-digit)
- **D / DEC-0027** — ID-prefix casing (uppercase vs lowercase)

---

## pi-context (substrate engine)

### Decision needs
- **D / DEC-0031** — lens id naming convention
- **D / DEC-0032** — layer registry adoption (`config.layers[]` L1..L5)
- **D / DEC-0033** — status-bucket normalization (per-block enums → canonical buckets)
- **D / DEC-0034** — conventions block schema migration (relational/lens/lookup discoverability)

### Work needs — framework gaps
**Substrate vocabulary / shape:**
- **G / FGAP-021** — substrate enum vocabularies not reconciled between shared schemas + registry consumers
- **G / FGAP-047** — vocabulary settlement upstream of Phase 5 LLM-filed decomposition (also TASK-042)
- **G / FGAP-048** — ID-prefix convention drift (issue- lowercase + R-/DEC- 4-digit)
- **G / FGAP-049** — phase block-kind pattern divergence (file-per-phase vs canonical array)
- **G / FGAP-051** — conventions block underspecified for relational/lens/lookup discoverability
- **G / FGAP-052** — `config.layers[]` + `block_kinds[].layer` FK + lens-validator dispatch declarable in config
- **G / FGAP-053** — milestone elevation (inline `roadmap.milestones[]` → top-level kind)
- **G / FGAP-054** — CTX-NNN context-contract for `unit_kind=milestone`
- **G / FGAP-055** — roadmap shape thinning post-milestone-elevation
- **G / FGAP-056** — `PROJECT_BLOCK_TYPES` const hardcodes 12 default kinds — should derive from config
- **G / FGAP-061** — `config.block_kinds[]` requires single array_key — cannot represent mixed-shape blocks
- **G / FGAP-063** — orchestration/procedural-policy canon has no dedicated block
- **G / FGAP-064** — no top-level user-story block (only nested in features)
- **G / FGAP-069** — `status_buckets` falls back to hardcoded default vocabulary
- **G / FGAP-071** — `block_kind` canonical_id rename requires file/data_path/array_key/schema_path cascade

**Lens / composition / relations:**
- **G / FGAP-022** — `renderLensView` does not emit per-member subsections for composition lenses
- **G / FGAP-023** — `validateRelations` does not surface composition lens cycles
- **G / FGAP-070** — lens composition cannot express edge-traversal rollups

**FK enforcement (DEC-0013 violations):**
- **G / FGAP-040** — `tasks[].phase` carries free-text labels instead of FK refs
- **G / FGAP-041** — `issues[].resolved_by` carries free-text instead of VER-NNN FK
- **G / FGAP-046** — `tasks[].depends_on` inline FK array (third instance of pattern)
- **G / FGAP-098** — no FGAP↔FGAP cross-reference affordance (`related_gaps`)

**Bootstrap / onboarding:**
- **G / FGAP-026** — substrate bootstrap hardcodes `.project/` (partial closure via FGAP-026 closure phases TASK-025..030, planned)
- **G / FGAP-027** — framework cannot detect user-authored hardcoded substrate-dir references
- **G / FGAP-028** — substrate completeness measured by LLM-arc-dispatch capability, not is-set-up
- **G / FGAP-057** — macro library bootstrap missing for user-added block kinds (also tagged pi-workflows)
- **G / FGAP-066** — no conversational onboarding for `/context init`
- **G / FGAP-087** — `registry/` + `defaults/` retained on disk as AJV fixtures post de-shipping
- **G / FGAP-091** — no project-install tool (tool-trilogy incomplete)
- **G / FGAP-093** — `/project install` no-config error misdirects to `/project init`
- **G / FGAP-095** — `/context start` impossibilized single-entry onboarding conductor (IN-PROGRESS)
- **G / FGAP-097** — in-pi substrate-read tools should emit onboarding-actionable message pre-bootstrap

**Validators / diagnostics / read-surface:**
- **G / FGAP-002** — per-scope finding registries
- **G / FGAP-003** — materialized views over scoped blocks
- **G / FGAP-005** — state-machine validation on enum-field transitions
- **G / FGAP-007** — staleness engine for research blocks
- **G / FGAP-008** — mandates as typed block in substrate contract
- **G / FGAP-010** — applicability predicate language for typed-context entries
- **G / FGAP-014** — no render-time pagination primitive (large views overflow context)
- **G / FGAP-015** — decision lifecycle has no broadened-by state
- **G / FGAP-024** — no write-authority enforcement layer beyond schema validation
- **G / FGAP-033** — no substrate block for communication-style preferences
- **G / FGAP-034** — orchestrator-side intermediates have no substrate home
- **G / FGAP-042** — precise-diagnostic-without-repair-surface pattern
- **G / FGAP-058** — test suite doesn't exercise pi-context against a fully-different vocabulary
- **G / FGAP-078** — no tool-surface for `MigrationFn` registration
- **G / FGAP-085** — tool descriptions need discovery-readiness + grounding rubric
- **G / FGAP-100** — canonical credentialed verification protocol stale post-FGAP-074
- **G / FGAP-104** — tsx-eval-reachable modules must not statically import SDK root barrel for VALUES
- **G / FGAP-105** — derived-state / computed read tools bypass `serializeForRead` (uncapped bodies)
- **G / FGAP-110** — per-item valid/current bits + constrained-agent read-gate (data-room generalization)
- **G / FGAP-111** — raw tier + raw→block decomposition front-end

### Work needs — features
- **F / FEAT-003** (proposed) — context plugin (portable, installable third-party context models)
- **F / FEAT-007** (proposed) — JIT skills (schema-shaped, macro-rendered, composable-on-demand guidance)

### Work needs — tasks
- **T / TASK-042** (in-progress) — vocabulary settlement upstream of TASK-025 Phase 5
- **T / TASK-043** (in-progress) — re-derivation machinery (DEC-0036 step 2): build `.context` clean via config
- **T / TASK-025..030** (planned) — FGAP-026 closure phases 5-10

---

## pi-jit-agents (agent layer)

### Decision needs
- **D / FGAP-112** — DEC-0044 home conflict vs JI-021 (orchestrator uses jit-agents directly). User re-anchor required: (a) reaffirm new-extension with explicit JI-021 mapping, or (b) supersede toward orchestrator-direct-use. **Gates FEAT-004/005 home selection.**

### Work needs — framework gaps
- **G / FGAP-032** — item-level `contextBlocks` selectivity missing (currently injects whole blocks)
- **G / FGAP-099** — workflow agent-step dispatch does not clamp child tool surface (subsumed by FEAT-005; subject to DEC-0044 home)
- **G / FGAP-102** — autonomous code-change loop validates via LLM-self-report, not real deterministic checks (de-oracled)
- **G / FGAP-109** — exported-API JSDoc + code-comments assert false `.project/` resolution paths

### Work needs — features
- **F / FEAT-001** (proposed, IN-PROGRESS via TASK-080) — pi-jit-agents consumer migration arc (pi-workflows + pi-behavior-monitors consume jit-agents' WHOLE agent layer; delete duplicates)
- **F / FEAT-002** (proposed) — in-session jit-agent persona (reshape main pi agent into one of our jit-agents)
- **F / FEAT-004** (proposed) — agents-as-tools dual-surface typed dispatch (Cluster E delegation) — **home pending FGAP-112**
- **F / FEAT-005** (proposed) — JIT capability composition + sandbox (operation-granular tool+perm composition) — **home pending FGAP-112**
- **F / FEAT-006** (proposed) — end-to-end constrained-orchestrator → spec-block → privileged-agent → real-check-validated loop (north-star)

### Work needs — tasks
- **T / TASK-080** (in-progress, re-scoped) — FEAT-001 unit: pi-workflows + pi-behavior-monitors consume jit-agents' whole agent layer; delete workflow duplicate; bundled agents conform or are discarded (DEC-0048)

---

## pi-workflows (orchestration)

Under DEC-0048, existing workflows + bundled agents + their tests are NOT targets. The workflow FRAMEWORK (engine + dispatch + step types) is the only target.

### Decision needs
None open at extension level. Several cross-cutting DECs above affect workflow dispatch surface (DEC-0001/0002/0003 model/thinking-seam/parseModelSpec at execute boundary).

### Work needs — framework gaps
- **G / FGAP-037** — per-block-kind Nunjucks macros missing for 6 newer block kinds (decisions / spec-reviews / etc.)
- **G / FGAP-057** — macro library bootstrap missing for user-added block kinds (also tagged pi-context)
- **G / FGAP-099** — workflow agent-step dispatch tool-clamp (REVERTED at workflow layer; subsumed by FEAT-005 at jit-agents/new-extension home per FGAP-112)
- **G / FGAP-102** — autonomous code-change loop real-check verdict (tagged workflows; agent-layer per DEC-0047)

### Work needs — features
None purely workflow-owned currently proposed. All in-flight feature work flows through jit-agents consumption (FEAT-001/TASK-080).

### Work needs — tasks
- **T / TASK-080** (in-progress) — co-target with pi-jit-agents above (workflows is the consumer being detangled)

---

## pi-behavior-monitors

No open decisions or FGAPs at extension level beyond:
- **G / FGAP-009** — monitor specs as typed blocks under substrate contract (currently identified)

Co-target of TASK-080 (consumes pi-workflows' duplicate `createAgentLoader` / `compileAgentSpec` / `AgentSpec` — repoints to jit-agents).

---

## pi-project (umbrella / un-homed)

Several early FGAPs filed against generic `pi-project` package label that pre-dates current package boundary; need re-homing as part of substrate vocabulary work:
- FGAP-002, 003, 005, 007, 008, 010, 014, 015 (all listed above under pi-context substrate surface — re-home pass pending)

---

## Reading order for a fresh context

1. **Cross-cutting governance** above — enacted DEC framing
2. **pi-jit-agents → FGAP-112** — the open architectural decision gating multiple FEATs
3. **pi-jit-agents → TASK-080** — the in-progress unit
4. **pi-context** — large surface, mostly substrate-evolution work; FGAP-095 + TASK-043 are the in-flight items
5. Everything else is queryable from substrate at need
