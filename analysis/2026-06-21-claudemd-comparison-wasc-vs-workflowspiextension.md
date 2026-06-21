# CLAUDE.md comparison — A (workflowsPiExtension) vs B (WASC)

Files compared, both read in full:
- **A** = `/Users/david/Projects/workflowsPiExtension/CLAUDE.md` (227 lines)
- **B** = `/Users/david/Projects/wasc-school-wide-improvement-plan/CLAUDE.md` (208 lines)

This report states what each file's text says. Load-bearing claims cite the file's heading or quote its text. "Absent in A/B" means the text does not appear in that file. No evaluation, ranking, or recommendation is given.

## Section inventory

### A — headings in order
1. `# pi-project-workflows` (line 1; intro, no heading body beyond preamble paragraphs)
2. `# How to establish exact current context for this project using pi-context` (line 7)
3. `## Commands` (line 24)
4. `## Current status — derive it, never cache it` (line 51)
5. `## Conventions` (line 62)
6. `## Canonical implementation pipeline (every code change, including in-loop fixes)` (line 76)
7. `## Subagent dispatch fit (Claude Code only — not the in-pi agent surface)` (line 90)
8. `## Completion Sequence (mandatory after every code change)` (line 94)
9. `## Do Not Touch` (line 116)
10. `## Experience-Gap Handling (mandatory)` (line 121)
11. `## Analysis-MD → Research block (heuristic)` (line 131)
12. `## Workflow SDK` (line 135)
13. `## Context SDK` (line 139)
14. `## Project Blocks (the active substrate)` (line 143)
15. `## Key Architecture` (line 177)
16. `## pi-context-cli — direct-drive discipline (dogfooding)` (line 195)
17. `## CLI Access from Other Agents` (line 205)
18. `## Substrate authorship semantics` (line 219)

Heading count A: 1 top-level `#` (title) + 1 additional `#` (line 7) + 16 `##` sections.

### B — headings in order
1. `# Project guidance for Claude Code` (line 1; intro paragraph)
2. `## Context status (2026-05-31): JSON is current; MDs are archive` (line 5)
3. `## Active-phase management (.context is the focused status)` (line 19)
4. `## Authoritative artifacts` (line 44)
   - `### Orchestration spine (always read first on session start)` (line 46)
   - `### Phased-workflow artifacts (Phase 0–15)` (line 56)
   - `### Decision + reference docs (read when working in adjacent areas)` (line 63)
   - `### Operational manage-the-work surfaces` (line 75)
5. `## Workflow` (line 82)
6. `## Verification convention (data + browser verification batched post-Phase-15)` (line 100)
7. `## Orchestrator discipline` (line 111)
8. `## Per-phase prompt rendering` (line 129)
9. `## Subagent posture` (line 138)
10. `## Directory conventions` (line 145)
11. `## Previewing the mockups / web pages` (line 154)
12. `## Discovery log` (line 168)
13. `## Working modes (active alongside the phased workflow)` (line 172)
    - `### Mode A — Phased (Phase 0–15)` (line 176)
    - `### Mode B — Post-Phase-15 architecture-refinement slices` (line 180)
    - `### Mode C — RETIRED (was: prompt-workshop iteration)` (line 184)
14. `## pi-context substrate (project state as queryable typed JSON)` (line 188)
15. `## Deployment` (line 205)

Heading count B: 1 top-level `#` (title) + 14 `##` sections + 7 `###` subsections (4 under "Authoritative artifacts", 3 under "Working modes").

## Topic comparison

### Project subject
- **A**: "Typed, multi-step workflow execution via `.workflow.yaml` specs. Schema-driven project state via pi-context. Behavior monitors that classify agent activity and steer corrections." (line 3). Describes itself as a "Monorepo: npm packages under `packages/*` with lockstep versioning" (line 5). The project IS the pi-context / pi-workflows tooling.
- **B**: "This repository plans and implements the WASC schoolwide-improvement-plan Django app. The Django project lives at `school-improvement-plans/`" (line 3). The project is a Django product; pi-context is consumed as installed tooling.
- **Delta**: differs. A's product is the tooling itself; B is a consumer of that tooling (B line 194 calls the CLI "the installed `pi-context` CLI on PATH … a self-contained binary," contrasted with "the pi-context dev repo").

### State / context stores named, and how read/written
- **A**: single store named — the pi-context substrate ("the active substrate," the dir named by `.pi-context.json`'s `contextDir`, line 14). Reads/writes via `contextState('.')`, `/context status`, and the globally-installed `pi-context` CLI ops. "Direct `Edit` / `Write` on the active substrate's `*.json` is forbidden" (line 155). "This file records NO project status" (line 53); all status derived from substrate + `git log`.
- **B**: multiple named stores: (a) decomposed JSON at `context-migration/decomposed/*.json` read via `context-migration/scripts/state.mjs` and `search.mjs` (lines 7, 9); (b) the `.context/` pi-context substrate read via `pi-context <op> --cwd .` (lines 21, 190); (c) frozen MD spine archive (`ORCHESTRATOR-STATE.md`, `ORCHESTRATOR-LOG.md`, etc., line 7) read for history only. B states the layers are "distinct, not duplicated: JSON = top-level focus + event spine + dispatch log; `.context` = the phase's structured PM" (line 23). Writes to decomposed JSON via `state.mjs append`/`upsert`, which "show `context-migration/write-policies.json` before writing" (line 9); `upsert` "REPLACES the whole matched element — it does not field-merge" (line 9).
- **Delta**: differs. A has one substrate. B has three concurrent layers (decomposed JSON spine + `.context` substrate + archived MDs) with an explicit layering statement. B's `state.mjs upsert`/`write-policies.json` mechanics are absent in A; A's `--writer` JSON + block-api primitive mechanics differ in form.

### Current-status policy
- **A**: dedicated section "Current status — derive it, never cache it" (line 51): "Position, focus, open work, counts, arc narrative, what-shipped, install state, and validation all go stale the moment they are written and are never stored here" (line 53). Names exact derive ops: `context-bootstrap-state`, `context-status`/`context-current-state`, `context-validate`, `context-validate-relations`, `git log`/`git status` (lines 55-58).
- **B**: section "Context status (2026-05-31)" carries a dated status statement ("JSON is current; MDs are archive," line 5) and a runnable "Current focus / next step — runnable, never static" block (lines 11-15): `state.mjs filter ORCHESTRATOR-STATE.pending-actions.json status eq open`, where "The single item carrying `\"priority\": \"next\"` is the current focus." B also describes free-form narrative fields on the focus item (`slice_status`/`*_progress`, `next_step`, `arc`, line 17).
- **Delta**: differs. A forbids storing any status in the file. B embeds a dated status line and a focus-deriving query, plus narrative-field maintenance on a focus item; A has no focus-item concept.

### Development / implementation pipeline and its steps
- **A**: two related sequences.
  - "Canonical implementation pipeline (every code change, including in-loop fixes)" — **7 numbered steps** (lines 80-86): 1 Implement (explore→plan→agent), 2 Verify (runtime demo + adversarial probe), 3 Iterate to zero, 4 Re-verify the fix (fresh, non-inherited), 5 Docs (`docs-surface-sync`), 6 Merge (`feature-branch-workflow`), 7 Substrate closure (honest status).
  - "Completion Sequence (mandatory after every code change)" — **13 numbered steps** (lines 98-110): 1 Edit, 2 Build (`npm run build`), 3 Check (`npm run check`), 4 Test (`npm test`), 5 Runtime demonstration, 6 Adversarial verification probe, 7 Docs + Skills, 8 Commit, 9 Status cascade, 10 Merge to main, 11 Release, 12 Credentialed verification, 13 Publish. "Steps 1-10 are the agent's responsibility … Step 13 requires user action" (line 112).
- **B**: "The canonical pipeline (`.context`-managed work)" — **5 numbered steps** (lines 26-30): 1 Plan mode → explore → VERIFY load-bearing findings → write plan; 2 Pre-impl — file the work in `.context` first; 3 IMPL; 4 Adversarial audit (separate agent); 5 Post-impl status cascade + verify. Plus a separate "Workflow" code block — **8 numbered steps** (lines 85-95) describing ORCHESTRATOR renders prompt → invokes IMPL → IMPL executes/commits → optional AUDIT → AUDIT emits `Total findings: N` → ORCHESTRATOR computes GO/NO-GO → per-phase automated gate → proceed to phase N+1.
- **Delta**: differs. Both have a "canonical pipeline" plus a second sequence. A's canonical pipeline = 7 steps; B's = 5 steps. A's second sequence (Completion Sequence) = 13 steps and is build/test/release-oriented; B's second sequence (Workflow) = 8 steps and is phase/prompt-render/GO-NO-GO oriented. Shared elements: plan→explore→implement→adversarial-audit→verify, and "iterate to zero findings" (A line 82; B line 36). A's steps 11-13 (release/credentialed-verify/publish) are absent in B. B's GO/NO-GO-from-`Total findings: N` count is absent in A.

### Gates and what defines "done"
- **A**: "Declaring work 'done' before step 10 is a failure" (line 112). Done requires the full Completion Sequence; "Tests-pass is necessary, not sufficient" (line 114). Substrate closure sets feature to "`complete` only when its acceptance criteria are actually met, `in-review` when a credentialed/release-gated piece remains" (line 86). "Block artifact writes are fatal — schema-validation failure … fails the workflow" (line 188). Gate ops: `context-validate` clean (line 86).
- **B**: "You may not declare a phase complete. Only the human does" (line 113). "Per-phase gate is automated: static checks (`manage.py check`, `ruff`, `mypy`, `pytest`, `make test-js`) green + AUDIT count == 0" (line 93). "done = gate exit 0 AND audit findings == 0" (line 114). "A completed task with no verification edge fails `context-validate` (the `completed-task-has-verification` invariant)" (line 30). "A task with any unmet criterion is not done" (line 32).
- **Delta**: differs. A's done = Completion-Sequence steps 1-10 complete + substrate closure. B's done = automated static-gate green + AUDIT findings == 0, and only the human declares a phase complete. Shared: adversarial-audit-zero-findings + `context-validate` as a gate; "tests-pass not sufficient" (A line 114) parallels B's automated-gate-plus-audit. B's named static tools (`ruff`, `mypy`, `pytest`, `make test-js`, `manage.py check`) are absent in A; A's `npm run build/check/test` are absent in B.

### Verification mechanism
- **A**: "Runtime demonstration" (step 5) + "Adversarial verification probe" (step 6), declared "LOAD-BEARING" (line 114). The probe is a "fresh-context agent (or grep when sufficient)"; "Both the adversarial agent and the orchestrator's own probe can under-flag … the orchestrator independently re-verifies the audit's load-bearing claims (don't relay a verdict), and the audit independently re-derives the orchestrator's" (line 103). "a fix to any audit/probe finding requires a FRESH re-audit of the fix" (line 103). "Credentialed verification … run the canonical verification protocol at `docs/reports/pi-internal-verification-protocol-2026-05-02.md` … when the release ships new public surface" (line 109).
- **B**: Adversarial audit by "a **separate** agent (not the implementer)" (line 29). VER `criteria_results` "verify EACH one by id — looping (re-IMPL → re-audit) until ALL pass" (line 32). The `verification_verifies_item` edge + `context-validate` machine-checks the cascade (line 30). "Verification convention" section batches human data+browser verification to post-Phase-15 (lines 100-109): per-phase gate "automated only: static checks + per-model `pytest` tests"; the post-Phase-15 pass covers data-population migrations, end-to-end evaluation of US-1..US-22+US-ext, and US-STATUS flips to `vivified` (lines 104-107). "Verify, don't narrate: after every context update, RE-RUN the session-start queries … confirm they reconstruct the reality you just created" (line 125).
- **Delta**: differs. Both require runtime/empirical verification + separate-agent adversarial audit + iterate-to-zero. A's mutual-re-derivation rule (orchestrator and audit each re-derive the other) is stated explicitly; B states "Verify, don't narrate" against the JSON queries. B's batched-to-post-Phase-15 human browser/data verification is absent in A. A's credentialed verification protocol (pi auth.json, release-gated) is absent in B.

### Subagent roles and posture
- **A**: "Subagent dispatch fit (Claude Code only — not the in-pi agent surface)" (line 90): "Explore is a read-only search/trace agent — dispatch it ONLY for read/trace/enumerate work. Any task whose decisive step RUNS code or WRITES … goes to an executing (general-purpose) agent or the orchestrator runs it, never Explore" (line 92). "Every empirical step in a brief … demand the actual observed output and instruct 'if blocked, STOP and report the blocker — never infer the result'" (line 92). The orchestrator "never hand-writes source" (line 80); "a foreground coding subagent implements from the approved plan" (line 80).
- **B**: "Subagent posture" (line 138): "IMPL executes phase content verbatim; never interprets; on spec ambiguity stops and reports. AUDIT enumerates findings; never recommends; ends with `Total findings: {N}`. Neither declares 'verified', 'complete', 'ready' … Neither grades severity" (lines 140-143). "Every agent dispatch (IMPL, audit, Explore) is a FRESH foreground `Agent` — you CANNOT resume a quiescent agent (SendMessage to one is hook-blocked)" (line 28). "You may not edit code an IMPL subagent produced unless the human explicitly directs the edit" (line 115).
- **Delta**: differs. A's posture is framed by tool-surface fit (Explore read-only vs executing agent) and a STOP-on-blocked rule. B's posture is framed by named roles IMPL/AUDIT with verbatim execution, `Total findings: {N}`, no-severity-grading, no-self-declaration. Shared: a separate/fresh adversarial reviewer; STOP-on-ambiguity (A line 92; B line 140). B's "FRESH foreground Agent, cannot resume" rule and "may not edit IMPL output" rule are absent in A. A's Explore-vs-executing-agent distinction is absent in B.

### Plan-mode usage
- **A**: pipeline step 1 "Enter plan mode; investigate *exclusively* via Explore agents … resolve the approach into a written plan; approve via ExitPlanMode" (line 80).
- **B**: pipeline step 1 "Plan mode → explore → VERIFY load-bearing findings → write plan. In plan mode, **explore by dispatching Explore / eval agents** … **Then corroborate, yourself, against current source, every load-bearing fact an Explore/eval finding asserts, BEFORE it enters the plan**" (line 26). "write the plan to `~/.claude/plans/...`, encoding steps 2–5 explicitly" (line 26).
- **Delta**: differs in emphasis; present in both. Both: plan mode + Explore-agent investigation + written plan. B adds an explicit "corroborate yourself against current source before the fact enters the plan" rule, with a worked check (`grep "class <Name>"` + migration/test checks, line 26) and a stated cost-cause ("skipping it once cost a full plan+dispatch cycle on a model DEC-45 had deleted," line 26). A names ExitPlanMode and "investigate exclusively via Explore agents"; B names plan-file location `~/.claude/plans/`. A's "approve via ExitPlanMode" is absent in B; B's self-corroboration-of-load-bearing-facts rule and `grep "class <Name>"` worked example are absent in A.

### What each says about memory
- **A**: "Feedback (behavioral mandates): `~/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/feedback_*.md` — indexed by MEMORY.md; binding, not suggestion" (line 226). Substrate is described as the persistence layer: "Anything that must persist beyond a session is filed in the substrate" (line 60).
- **B**: "`phases/discoveries.md` is append-only cross-phase memory" (line 60, line 168-170 "Discovery log"). "`MANDATES.md` … the 9 binding mandates. Also injected live each turn by the UserPromptSubmit hook" (line 51). Decomposed JSON spine is "the project's current state" (line 120). No `feedback_*.md` / MEMORY.md reference.
- **Delta**: differs. A points to a `feedback_*.md`/MEMORY.md mandates store. B points to append-only `discoveries.md` (DISC log) and `MANDATES.md` (9 mandates) injected via UserPromptSubmit hook. Both treat their substrate/JSON as the durable state. A's `feedback_*.md` index is absent in B; B's `discoveries.md`/DISC mechanism and "9 binding mandates"/UserPromptSubmit injection are absent in A.

### Branching / merge / commit discipline
- **A**: "branch off the porcelain-clean integration branch (per `feature-branch-workflow`)" (line 80); "Merge — `feature-branch-workflow`. Merge to the integration branch; rebuild (pi loads `dist/`)" (line 85); "Delete the branch; `context-validate` clean" (line 86); "Merge to main: if on a feature branch" (step 10, line 107). Commit: "forensic message per global CLAUDE.md guidelines" (line 105). "Husky pre-commit runs `npm run check && npm test`. Never `--no-verify`" (line 68). "Releases are HELD: no `release:*` and no push/publish without explicit per-release authorization" (line 60).
- **B**: "Per-task branching: each task is done on its own branch. The orchestrator creates it FIRST with `git switch -c <branch>` before any IMPL dispatch. IMPL agents commit on that branch. The orchestrator merges the branch to the main branch only after ALL the task's success criteria are validated, and only on the user's explicit authority" (line 127). "You never leave the working tree dirty. After every task, `git status` must return clean" (line 126). "`git`/`git log` is version control, not the project state record" (lines 53, 120). "Observed-green-before-commit — never commit on an unobserved or red gate" (line 124); coupled changes "land them in ONE commit and never commit the red intermediate" (line 124).
- **Delta**: differs in detail; present in both. Both: per-feature/per-task branch, merge to main/integration only after verification, human/explicit authority to merge or release. A names `feature-branch-workflow`, husky `--no-verify` prohibition, held releases. B names `git switch -c`, working-tree-clean-after-every-task, observed-green-before-commit, one-commit-for-coupled-changes. A's husky/`--no-verify`/release-hold specifics are absent in B; B's `git switch -c`/never-dirty-tree/red-intermediate specifics are absent in A.

### Prompt / dispatch mechanics
- **A**: "Each workflow step runs as a subprocess (`pi --mode json`) with its own context window" (line 181). "Agent specs are `.agent.yaml` only … Compiled to prompts via Nunjucks at dispatch time. Specs declare `inputSchema` … `contextBlocks` … `output.format`/`output.schema`" (line 182). "`templates/shared/macros.md` provides one rendering macro per block kind … Three-tier template search: project `.pi/templates/` > user `~/.pi/agent/monitors/` > package `examples/`" (line 183). "Monitor specs are `.monitor.json` … the phantom tool pattern: forced `toolChoice` on a `VERDICT_TOOL` … route through `normalizeToolChoice(api, toolName)`" (line 184). "Pi tools accessible from any LLM with shell access via `pi -p \"prompt\" --mode json`" (line 207); cost-control `--model openrouter/anthropic/claude-haiku-4.5`, `--tools read`, `--no-skills`, `gtimeout 120` (lines 212-215).
- **B**: "Per-phase prompt rendering" (line 129): "`bin/render-phase-prompt.sh impl <NN>` … audit `<NN>`" (lines 132-133). "The renderer is cat + sed + awk. No LLM. Deterministic. Same inputs → byte-identical output. Templates at `templates/{impl-static,audit-static,begin-block}.md`. Mandates inlined from `MANDATES.md` at render time" (line 136). The "Workflow" block (lines 85-95) describes ORCHESTRATOR rendering the phase prompt and invoking IMPL/AUDIT subagents.
- **Delta**: differs. A's dispatch is pi subprocess (`pi --mode json`), Nunjucks-compiled `.agent.yaml` specs, monitor phantom-tool/forced-toolChoice, `pi -p` for any-LLM shell access. B's dispatch is a deterministic shell renderer (`cat + sed + awk`, "No LLM," byte-identical) producing `tmp/phase-NN-{impl,audit}-prompt.md` consumed by subagents. The two prompt-rendering mechanisms have no overlap in named tooling. A's monitors/phantom-tool/Nunjucks/`pi -p` are absent in B; B's `render-phase-prompt.sh`/`cat+sed+awk`/`begin-block.md` are absent in A.

### Directory / tooling conventions
- **A**: "Conventions" (line 62) names: ESM + `tsc`→`dist/`; named subpath exports; test runners (`tsx --test`, `vitest`); Biome (tab indent, 120-char); husky; GitHub Actions Node 22/23; `SKILL.md` is generated, edit `skill-narrative.md`; lockstep `release:*`; the op-surface (`pi-context-cli` + `scripts/orchestrator/*.ts`); gitignored `compiled-contexts/` + `tmp/`; live PreToolUse hooks in `.claude/hooks/` (`FGAP-089`, line 74). "Do Not Touch": `.pi/` (runtime testing dir), `docs/` (gitignored planning docs) (lines 118-119).
- **B**: "Directory conventions" (line 145) names: Repo root subdirs (`phases/`, `templates/`, `bin/`, `dev-planning-knowledge-source/`, `sources/`, `docs/`, `data/`, `prompt-workshop/` RETIRED, `web/`, `mockups/`, `MANDATES.md`, `tmp/`); Django project root `school-improvement-plans/` (manage.py, app packages `users/ school/ accreditation/ plans/ ai/ planner/ devmocks/`, etc.). "Subagents do all `uv` and `manage.py` work from `school-improvement-plans/`" (line 150). "Dev server port: 8008" (line 152). "Previewing the mockups / web pages" (line 154) — `devmocks` DEBUG-gated launcher, ES-module/`file://` CORS note. "Authoritative artifacts" (line 44) enumerates `NORTH-STAR.md`, `MANDATES.md`, `ORCHESTRATOR-STATE.md`, `ORCHESTRATOR-LOG.md`, the phase MDs, decision/reference docs.
- **Delta**: differs. A's conventions are npm/TypeScript build-toolchain + monorepo package layout + hooks. B's are Django/`uv`/`manage.py` layout + dev-server port + mockup previewing + an enumerated artifact list (NORTH-STAR, MANDATES, ORCHESTRATOR-STATE/LOG, phase MDs). Shared: both name a "Do Not Touch / out-of-scope" notion (A `.pi/`+`docs/`; B deployment out of scope, prompt-workshop RETIRED). No overlap in named directories or build tools.

### Decisions / settled-establishment persistence
- **A**: "Anything that must persist beyond a session is filed in the substrate (gaps / tasks / decisions / verifications / research)" (line 60). DEC items written via the CLI; "Substrate writes via block-api primitives (validated + DispatchContext-stamped)" (line 155). Provenance: "Filing provenance (the `filing-provenance` convention, binding)" — every element is user-VERBATIM, user-DIRECTED, or DERIVABLE; a write guard "STOPS every such write" pending a per-element provenance table + `# provenance-reviewed` sentinel (line 153).
- **B**: "You proactively persist conversational establishments: when a decision, definition, or gap is settled, land it that turn in its JSON home via `state.mjs` … a DEC to `seed-round-plan.json`, a DISC to `discoveries.json`, a model-meaning to the relevant doc" (line 121). DEC log = `data/seed-round-plan.md` / `seed-round-plan.json` (lines 65, 201). Many named DECs referenced (see Quantifiable facts).
- **Delta**: differs. Both require settled establishments to be persisted that turn. A files into typed substrate blocks (decisions block) with a binding provenance guard. B files DECs into `seed-round-plan.json` and DISCs into `discoveries.json` via `state.mjs`. A's `filing-provenance` write-guard/`# provenance-reviewed` sentinel is absent in B; B's named DEC/DISC JSON homes and the dozens of cited DEC/DISC IDs are absent in A.

### Experience-gap / friction handling
- **A**: "Experience-Gap Handling (mandatory)" (line 121): a gap from *using* the tooling "must be tasked to an agent to determine root cause and shape … the basis for filing the gap (FGAP). Do not file … from ad-hoc self-investigation." Sub-conventions: "Explore before file (prior-art search)" (line 125), "De-ephemeralize at the source" (line 127), "Surface the gap's class" (line 129). "Friction hit while driving the CLI is an experience gap — file it … never route around it" (line 203).
- **B**: "Extension frictions → the findings ledger. A friction/footgun/bug/gap hit in a workflow extension (`pi-context-cli`, `pi-workflows`, etc.) is logged the turn you hit it in `prompt-workshop/PI-WORKFLOWS-FINDINGS.md` … (continue the per-package `WF-`/`CTX-` series). Distinct from `.context` items (wasc product work)" (line 42). "Explore a discovery to full context before filing it" (line 38): dispatch Explore/eval agents to establish root cause/blast radius before filing a `.context` item.
- **Delta**: differs. Both: investigate (Explore/eval) before filing; both distinguish tooling-extension friction from product work. A files product gaps as FGAP substrate items and adds prior-art-search, de-ephemeralize, and surface-the-class conventions. B logs extension friction to `prompt-workshop/PI-WORKFLOWS-FINDINGS.md` (WF-/CTX- series) separate from `.context` product items. A's FGAP/prior-art/de-ephemeralize/surface-class triad is absent in B; B's `PI-WORKFLOWS-FINDINGS.md` ledger + WF-/CTX- series is absent in A.

### Analysis-MD → research surfacing
- **A**: "Analysis-MD → Research block (heuristic)" (line 131): after writing `analysis/*.md`, "propose to the user surfacing it into the `research` block … The user decides whether it surfaces … Propose; do not auto-file."
- **B**: absent. No equivalent analysis-MD→research-block heuristic.
- **Delta**: only-A.

### Working modes
- **A**: absent. No multi-mode framing.
- **B**: "Working modes (active alongside the phased workflow)" (line 172): Mode A — Phased (Phase 0–15); Mode B — Post-Phase-15 architecture-refinement slices; Mode C — RETIRED (prompt-workshop). "the orchestrator picks the right one per task shape" (line 174).
- **Delta**: only-B.

### SDK surfaces
- **A**: "Workflow SDK" — `packages/pi-workflows/src/workflow-sdk.ts` (line 137); "Context SDK" — `packages/pi-context/src/context-sdk.ts` (line 141). "use `/workflow status`" / "`/context status` for derived state."
- **B**: no SDK-source-file section; references `gather-execution-context` and CTX-001..004 contracts (line 21) and the `/context` slash-command family via the how-to doc (line 196).
- **Delta**: differs. A names SDK source files as the queryable surface. B names CLI ops + the how-to doc; A's `workflow-sdk.ts`/`context-sdk.ts` sections are absent in B.

### pi-context CLI invocation discipline
- **A**: "pi-context-cli — direct-drive discipline (dogfooding)" (line 195): "drive the real global command **directly** (not `node …/dist/bin.js`)." Forbidden: bypassing the CLI (`cat`, `Read`/`Edit` on substrate JSON); wrapping in shell glue (`for`-loops, `| head`/`| tail`, `2>/dev/null`, tsx-eval re-parsing) (lines 200-201). The promote-cli mechanism: the operator CLI "IS this working tree's code, installed by `npm run promote:cli` … a publish-free packed COPY" (line 36).
- **B**: "Invocation: use the installed `pi-context` CLI on PATH (`pi-context <op> --cwd .`) — a self-contained binary needing no `NODE_PATH` prefix and no `file://` loader. The legacy `npx tsx scripts/orchestrator/*.ts` path in the pi-context dev repo … is superseded by the CLI" (line 194).
- **Delta**: differs. Both mandate the installed `pi-context` CLI as the substrate surface. A adds direct-drive prohibitions (no `node dist/bin.js`, no shell glue) and the `promote:cli` packed-copy install. B's `--cwd .` flag and "no NODE_PATH / no file:// loader" framing (vs the dev-repo legacy path) are absent in A; A's `promote:cli` and shell-glue prohibitions are absent in B.

### Key architecture / load-bearing rules
- **A**: "Key Architecture" (line 177) — 13 bulleted load-bearing rules: subprocess-per-step, `.agent.yaml`-only specs, macros/template tiers, monitor phantom-tool, `block:<name>` resolution, atomic state persistence, fatal block-artifact writes, fatal JSON output validation, `context:` inlining, raw-JSON output, `invokeMonitor`, DispatchContext attestation (lines 181-193).
- **B**: absent as a dedicated section. Architecture facts are distributed (e.g., `.context` PM model `phase → feature → story → task` and its edge/invariant vocabulary, line 21; DEC-57 architecture, line 21).
- **Delta**: differs. A has a dedicated architecture-rules section about the workflow/monitor engine. B has no such engine-internals section (B consumes the engine, does not document its internals); B's distributed architecture references are the `.context` PM-graph vocabulary instead.

### Substrate authorship semantics
- **A**: "Substrate authorship semantics" (line 219): "All substrate content … is LLM-authored unless verbatim quoted from a user message." "Filed substrate carries user filing-authority … the working baseline." Authorship-archaeology (claude-history) "report the distinction as targeted-review information … not as baseline-discard. Never introduce authorship-archaeology unprompted" (line 225).
- **B**: absent as a dedicated section. B states "Write every block for its consumers" (line 40) — overlapping with A's "Rhetorical situation for every block write" (A line 151) — but no authorship-provenance / filing-authority / archaeology framing.
- **Delta**: differs. A has a dedicated authorship-semantics section. B has the consumer-directed block-write rule but no authorship-archaeology / filing-authority content. The "write blocks for consumers, terse/signal-dense/DRY" rule is present in both (A line 151; B line 40).

### Deployment
- **A**: absent (A is a tooling monorepo; no deployment section).
- **B**: "Deployment" (line 205): "Deployment details are in the `django-subdomain-deployment` skill. Out of current scope." Also noted at line 80.
- **Delta**: only-B.

## Only-A (present in A, absent in B)

- Self-description as the pi-workflows/pi-context/behavior-monitors tooling monorepo (line 3-5).
- `## Commands` block: `npm run build|test|check|format|skills|promote:cli|release:*` (lines 26-34).
- `promote:cli` packed-copy operator-CLI install mechanism (line 36).
- `build-html-views.ts` substrate→HTML projection (lines 43-49, 72).
- `## Current status — derive it, never cache it` with the named derive ops `context-bootstrap-state`/`context-status`/`context-validate`/`context-validate-relations` (lines 51-58).
- `## Conventions`: ESM/`tsc`/`dist`, named subpath exports, `tsx --test`/`vitest`, Biome config, husky `--no-verify` prohibition, GitHub Actions Node 22/23, `skill-narrative.md`/generated SKILL.md, lockstep `release:*`, `compiled-contexts/`, live `.claude/hooks/` + `FGAP-089` (lines 64-74).
- 13-step `## Completion Sequence` including Release (step 11), Credentialed verification (step 12, `pi-internal-verification-protocol-2026-05-02.md`), Publish (step 13) (lines 94-114).
- `## Subagent dispatch fit` Explore-vs-executing-agent tool-surface rule (lines 90-92).
- `## Do Not Touch` (`.pi/`, `docs/`) (lines 116-119).
- `## Experience-Gap Handling` FGAP framing + "Explore before file" prior-art search + "De-ephemeralize at the source" + "Surface the gap's class" conventions (lines 121-129).
- `## Analysis-MD → Research block (heuristic)` (lines 131-133).
- `## Workflow SDK` / `## Context SDK` source-file sections (lines 135-141).
- `filing-provenance` write-guard with per-element provenance table + `# provenance-reviewed` sentinel (line 153).
- Install ceremony detail: `/context init`/`accept-all`/`install`/`update --dryRun`, `samples/conception.json`, 3-way merge (lines 164-169).
- `## Key Architecture` 13 engine-internal rules (monitors, phantom tool, `normalizeToolChoice`, Nunjucks specs, DispatchContext attestation) (lines 177-193).
- `## pi-context-cli — direct-drive discipline` shell-glue prohibitions (lines 195-203).
- `## CLI Access from Other Agents` (`pi -p`, cost-control `--model`/`--tools`/`--no-skills`/`gtimeout`) (lines 205-217).
- `## Substrate authorship semantics` incl. authorship-archaeology (lines 219-225).
- `feedback_*.md` / MEMORY.md mandates index (line 226).
- Substrate-strip note: acceptance_criteria/proposed_resolution "being stripped … as LLM-negligent/unverified bullshit" (line 145).

## Only-B (present in B, absent in A)

- WASC Django product framing; `school-improvement-plans/` Django project (line 3).
- Decomposed JSON spine `context-migration/decomposed/*.json` + `state.mjs`/`search.mjs` scripts + `write-policies.json` + `upsert`-replaces-whole-element mechanics (lines 7-9).
- Frozen MD archive concept (`ORCHESTRATOR-STATE.md`/`ORCHESTRATOR-LOG.md`/phase MDs as history) (lines 7, 48-54).
- `pending-actions` focus-item model: `priority:"next"`, `slice_status`/`next_step`/`arc` narrative fields, status `open`/`done` two-value contract (lines 11-17, 123).
- `.context` PM graph vocabulary: `phase → feature → story → task`, edges (`feature_contains_story`, `task_positioned_in_phase`, `task_depends_on_task`, `*_gated_by_item`, etc.), invariants (`completed-task-has-verification`), `gather-execution-context` CTX-001..004 (lines 21, 30).
- `NORTH-STAR.md` as the single end-result statement (lines 50, 186).
- `MANDATES.md` — 9 binding mandates injected each turn by a UserPromptSubmit hook; mandate-008 STOP-on-ambiguity (lines 51, 28, 114).
- 8-step `## Workflow` block with `Total findings: N` GO/NO-GO computation (lines 82-98).
- `## Verification convention` batching human data/browser verification to post-Phase-15; US-1..US-22+US-ext; US-STATUS `pending`/`enabled`/`vivified` lifecycle (lines 100-109, 119).
- `## Orchestrator discipline` rules: human-only phase-completion, DEC-58 autonomous-redispatch-on-deterministic-gate exception, may-not-edit-IMPL-output, atomic-work-process (ONE tool call per turn), verify-don't-narrate, never-dirty-tree, per-task `git switch -c` branching (lines 111-127).
- `## Per-phase prompt rendering` deterministic `cat+sed+awk` renderer (`render-phase-prompt.sh`, `templates/{impl-static,audit-static,begin-block}.md`) (lines 129-136).
- `## Subagent posture`: IMPL/AUDIT named roles, `Total findings: {N}`, no severity grading, no self-declaration (lines 138-143).
- `## Directory conventions` Django layout, `uv`/`manage.py` from `school-improvement-plans/`, dev port 8008 (lines 145-152).
- `## Previewing the mockups / web pages`: `devmocks` DEBUG-gated launcher, ES-module/`file://` CORS, `FRONTEND-CONVENTIONS.md` (lines 154-166).
- `## Discovery log` DISC append-only mechanism + `resolved_by` (lines 60, 117, 168-170).
- `## Working modes` A/B/C (lines 172-186).
- `## Deployment` (django-subdomain-deployment skill, Layer C in Phase 0) (lines 205-207).
- Extension-friction ledger `prompt-workshop/PI-WORKFLOWS-FINDINGS.md` + WF-/CTX- series (line 42).
- `prompt-workshop/` RETIRED per DEC-57; `wizard-v2.html` prototype; mockups a–e (lines 75-78, 147).
- Named DEC IDs: DEC-20, DEC-29, DEC-30, DEC-31, DEC-33, DEC-35, DEC-37, DEC-41, DEC-45, DEC-53, DEC-57, DEC-58 (lines 50, 51, 65, 68, 93, 114, 118, 124, 182, 186). Named DISC IDs: DISC-26 (lines 72, 186). Layer A/B/C framing (lines 58, 207).
- The dated "Context status (2026-05-31)" line (line 5).
- The how-to doc `docs/2026-05-30-pi-context-claude-code-howto.md` ("39 orchestrator scripts," auth-gate behavior) (lines 73, 196).

## Common (present in both)

- A pi-context `.context` typed-JSON substrate (schemas + block items + `relations.json` edges + `config.json` + `.pi-context.json` pointer) used as a queryable project-state surface (A lines 14, 143-175; B lines 21, 188-203).
- The installed `pi-context` CLI as the substrate read/write surface (A line 197; B line 194).
- A "canonical pipeline" requiring: plan-mode + Explore-agent investigation → written plan → file work into `.context` → implement via subagent → separate-agent adversarial audit → verify + status cascade, iterating to zero findings (A lines 76-86; B lines 25-36).
- Runtime/empirical verification + a fresh/separate-agent adversarial audit, with "tests-pass not sufficient" (A line 114) and "Verify, don't narrate" (B line 125).
- `context-validate` as a machine-checked integrity/cascade gate; verification edge required to mark a task done (A lines 86, 161; B lines 21, 30).
- No-triviality-exemption / no-ad-hoc-path mandate for the pipeline (A line 78 "including in-loop fixes"; B line 25 "no triviality exemption and no ad-hoc path").
- Investigate a discovery/gap to root cause before filing it (A line 123; B line 38).
- Distinguish workflow-extension friction from product work, and file/log friction the turn it is hit (A line 203; B line 42).
- Write every block terse, signal-dense, self-contained, DRY, for downstream consumers — not narration (A line 151; B line 40).
- Acceptance/success criteria are the contract carried verbatim through plan → impl → audit → verification; a task with any unmet criterion is not done (A line 86; B lines 32-34) — with the difference that A's section notes those criteria are "being stripped" to a placeholder (line 145) while B requires them populated before work starts.
- Branch-per-unit, merge to main only after verification and on explicit/human authority (A lines 80-86, 107; B line 127).
- Persist settled conversational establishments (decisions/gaps) to their store that turn (A line 60; B line 121).
- The Claude Code Task tool list is an ephemeral per-session view, not a source of truth (A line 106 "Status cascade: the Claude Code Task tool + … status blocks"; B line 23 "an ephemeral per-session view — never a source").
- Subprocess/`pi`-based or shell-based deterministic dispatch of subagent prompts (A `pi --mode json`, line 181; B `render-phase-prompt.sh`, line 132) — same role (render then dispatch), different mechanism.

## Quantifiable facts

- **Sections (`##` level):** A = 16; B = 14. Additional `#`-level: A = 2 (title + line 7); B = 1 (title). `###` subsections: A = 0; B = 7.
- **Numbered pipeline/sequence steps:**
  - A "Canonical implementation pipeline" = 7 steps; A "Completion Sequence" = 13 steps.
  - B "canonical pipeline" = 5 steps; B "Workflow" block = 8 steps.
- **Mandates:** B names "the 9 binding mandates" in `MANDATES.md` (line 51) and cites mandate-008 (line 28, 114). A names no numbered mandate set in this file; it points to `feedback_*.md` "behavioral mandates" indexed by MEMORY.md (line 226) without a count.
- **Named conventions (binding) in A:** `feature-decomposition`, `feature-branch-workflow`, `docs-surface-sync`, `de-ephemeralize-at-source`, `gap-explore-surfaces-class`, `filing-provenance` (lines 80, 84, 86, 127, 129, 153).
- **Named conventions in B:** `assemble-unit-context-via-gather-execution-context` (line 21).
- **Named DEC IDs in B:** DEC-20, DEC-29, DEC-30, DEC-31, DEC-33, DEC-35, DEC-37, DEC-41, DEC-45, DEC-53, DEC-57, DEC-58. **Named DISC IDs in B:** DISC-26. **Named in A:** `FGAP-089` (line 74); CTX/DEC/DISC IDs otherwise absent in A.
- **Named gate tools:** A = `npm run build|check|test`, husky, GitHub Actions (Node 22/23), Biome, `tsc`, `vitest`/`tsx --test`. B = `manage.py check`, `ruff`, `mypy`, `pytest`, `make test-js`, `node --check`, jsdom `node --test`.
- **Dev server port:** B = 8008 (line 152); A names none.
- **Phase count:** B = Phase 0–15 (16 phases, lines 56, 176); A has no phase numbering.
- **CLI invocation flag form:** A = `pi-context <op> --flag value` (no `--cwd`); B = `pi-context <op> --cwd .`.
