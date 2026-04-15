# Process articulation — what the block substrate supports

Date: 2026-04-15
Status: working articulation, current thinking focus

This document captures the process the `.project/` block substrate supports — the full lifecycle for any unit of work, from intention through verified completion, mapped to the blocks that own each phase. It emerged from the session's synthesis work (Muni five-layer model × canonical engineering vocabulary × consumer migration arc planning) and is the current anchor for decisions about which gaps to close next.

Vocabulary note: this document uses the current filenames (`adrs.json`, `FGAP-NNN`) since the rename proposed earlier in the session is still pending user authorization. The process is invariant under the vocabulary decision — only the terms change.

---

## Hierarchy of intent (top-down)

| Layer | Artifact | Current block |
|---|---|---|
| **Project** | Charter, vision, constraints, what cannot change | `project.json` (L1 Identity) |
| **Ultimate goals** | What the project exists to achieve — outcome statements | `project.json.goals` field (scalar); richer goal tracking would live in a `goals.json` block that does not yet exist |
| **Milestones** | Significant points along the way — externally visible thresholds | **gap**: no milestone block exists today; rolled into `phase.json` which is informal and under-used. Pending restructure per `layer-plans.json` PLAN-001 |
| **Roadmap** | Sequenced set of features advancing toward milestones | **gap**: no roadmap block; `features.json` is a flat list with no ordering primitive |
| **Element X** | A feature/epic — bounded unit of work | `features.json[i]` — FEAT-001 is the current live example |
| **Milestone a, b, c for X** | Stories within the feature, each delivering a slice | `features.json[i].stories[j]` |
| **Work inside a story** | Tasks, each a concrete unit | `features.json[i].stories[j].tasks[k]` |

---

## Lifecycle of one unit of work — ten phases

### Phase 1 — Intention / goal / articulation of complete

**What it produces**: the definition of done. Acceptance criteria. Verification statement that says explicitly how "complete" will be recognized — including but not limited to TDD tests. May reference schema validation, behavior checks, empirical observation, third-party review.

**Owning block**: `features.json[i].stories[j]` (or `.tasks[k]` at finer grain)

- `.description` — what is being built
- `.motivation` (on feature) — why it matters
- `.acceptance_criteria` — the list of statements that must all be true for completion

**Current gap**: acceptance criteria today is `string[]` — a flat list of prose statements. Does not distinguish *kinds* of verification (unit test, integration test, schema validation, manual smoke, empirical observation, independent review). If the intent is "verification statement beyond TDD test pass," the acceptance criteria schema needs richer shape. New discovered shortcoming — candidate for a new framework gap (verification-criteria taxonomy). Each acceptance criterion should carry a `kind` field (`unit-test | integration-test | schema-validation | empirical | manual | review-clean`) and a `verification_target` pointing at the thing that will demonstrate it.

### Phase 2 — Research

**What it produces**: the factual substrate under the decision. What is true in the problem space, environment, or options.

**Owning block**: `.project/research.json` (specified in `analysis/research-blocks-design.md`, not yet enacted). Each entry has:

- `question`, `method`, `grounding`, `findings_summary`, `citations`
- `informs` edges pointing at the feature/story/decision the research feeds
- `status` in `planned → in-progress → complete → stale / superseded / revised`

**Current gap**: research block does not exist yet. Today's workaround is `analysis/*.md` markdown files with no structured index, no cross-references, no staleness tracking. Issue-061 / FGAP-007 captures this gap. Enactment is a prerequisite for the process running end-to-end.

### Phase 3 — Initial spec

**What it produces**: the decision-ready articulation of what will be built and how. Options considered, chosen direction, rationale, consequences.

**Owning block**: `.project/adrs.json` (pending rename to `decisions.json`). Each entry:

- `context` — forces at play
- `options_considered` — each with tradeoffs and rejected_reason
- `decision` — the position taken
- `consequences` — what becomes easier / harder / impossible
- `related_findings` — review findings that drove this decision
- `research_sources` — research entries grounding it (back-edge, additive once research.json exists)
- `status` in `proposed → under-review → decided → superseded / deprecated`

**In this framework, a "spec" is compound**: one or more decision records + the feature/story/task node that references them + the research that grounds them. There is no standalone "spec" block — a spec is derived from its constituent parts. This is a deliberate design choice: the spec lives where its parts live, not in a monolithic document that drifts from reality.

### Phase 4 — Adversarial audit of spec + spec revision loop

**What it produces**: findings against the spec from a fresh-context independent reviewer. Findings cluster into resolution tasks that revise the spec until clean.

**Owning block**: `.project/spec-reviews.json`. Each entry:

- `target` — path to the artifact under review (could be a decision record, a feature, a design document)
- `target_revision` — git SHA pinning the review to a specific version
- `method` — "fresh-context independent reviewer" or other
- `findings[]` — embedded array, each finding with state machine `open → triaged → researching → proposed → decided → implementing → resolved / wontfix / duplicate`
- `clean` — boolean gate, true only when every finding is in a terminal state

**The revision loop is explicit**: if review N produces findings, spec revisions happen, then review N+1 runs against the new target_revision. Multiple review entries target the same spec over time, each pinned to a different revision. Historical review entries are not discarded — they become the audit trail of how the spec evolved.

**Current gap — loop iteration not yet first-class**: the schema supports multiple reviews of the same target via `target_revision`, but there is no explicit "review chain" linking them. Could be captured as `previous_review` field on each review entry, OR derived from `target_revision` ordering. New discovered shortcoming — candidate for adding to GAP-005 scope since review-chain traversal is a state-machine query.

### Phase 5 — Implementation plan to accomplish spec

**What it produces**: the decomposition of the spec into stories and tasks. Dependencies, ordering, files touched. How the work will actually be done.

**Owning block**: `features.json[i].stories[j].tasks[k]` — the nested decomposition IS the implementation plan. No separate plan block is needed.

- `tasks[].description` — what this task does
- `tasks[].files` — files touched
- `tasks[].acceptance` — how completion is recognized
- `tasks[].depends_on` — precondition chain
- `stories[].depends_on` — story-level precondition chain
- `stories[].gates` — stories that cannot advance until external gates (decisions, reviews, research) reach terminal states

**The plan lives in the feature**. Review of the plan reviews the feature, not a separate document.

### Phase 6 — Adversarial audit of plan + plan revision loop

**What it produces**: findings against the plan — does the decomposition actually accomplish the spec? Are dependencies correct? Is anything missing? Is the ordering coherent?

**Owning block**: `spec-reviews.json` again — the `target` field points at the feature/story node rather than the decision/spec document. The schema generalizes: any artifact can be the target of a review.

**Current gap — target type ambiguity**: today's `spec-reviews.schema.json` has `target: string` (a path). Does not distinguish "review of a markdown doc" from "review of a JSON block entry" from "review of a commit diff." The reviewer needs to know what kind of artifact it is reviewing to know what kind of findings are meaningful. Candidate: add `target_kind` enum field to the schema — new discovered shortcoming, folds into GAP-006 (schema versioning) since it requires a schema revision.

### Phase 7 — Task implementation

**What it produces**: actual code changes. Commits. Build results. Test runs.

**Owning blocks**:

- `features.json[i].stories[j].tasks[k].status` advancing `todo → in-progress → in-review → done`
- `handoff.json` — session-scoped context snapshots during in-flight work
- `features.json[i].findings` — defects discovered during implementation land in the feature's scoped finding registry (not in global `issues.json`)

**Current gap — git provenance not captured**: the task does not carry `commits[]` or `diff_hash` linking to the git history of what was actually done. Walking backward from a task to the code change is manual. Candidate: add `implemented_by: string[]` field (array of commit SHAs) to task schema — new discovered shortcoming, schema enhancement to features.json.

### Phase 8 — Adversarial audit of implementation

**What it produces**: findings against the actual code — against spec, against plan, against acceptance criteria, against quality standards.

**Owning block**: `spec-reviews.json` again — `target` points at the commit range or the changed files. Findings are quality defects, spec deviations, plan deviations, or acceptance failures.

**Current gap**: same target_kind ambiguity as Phase 6. A review of a commit diff uses the same schema as a review of a markdown spec, but the finding categories are different. May need either a review-kind enum or separate schemas for `doc-review` vs `code-review`.

### Phase 9 — Fix loop OR verification pass

**What it produces**: either new tasks that address findings (fix loop), OR recognition that all acceptance criteria are met and verification passes.

**Owning blocks**:

- New tasks added under the story for each finding requiring fix
- `verification.json` — V&V records per target (already exists, schema established)
- `features.json[i].stories[j].status` advancing `in-review → complete` only when findings are terminal AND verification records exist for every acceptance criterion

**The loop is explicit**: failing verification → new tasks → task completion → re-review → re-verification → loop until clean. Each iteration's state is preserved; the story does not advance to complete until the exit criteria hold.

**Current gap — verification.json schema is under-developed**: the existing schema is minimal. It does not link verification records to specific acceptance criteria, does not track method of verification (unit test run vs manual observation vs third-party review), does not track grounding (what was the state of the system when the verification passed — git SHA, test run ID, timestamp). Candidate for a follow-up schema enhancement.

### Phase 10 — Learning capture

**What it produces**: rules that emerged from this work that should apply to future work.

**Owning blocks**:

- Feedback memory (currently `~/.claude/.../memory/feedback_*.md`, eventually `.project/lessons.json` or similar under the intuitive-vocab direction)
- Postmortems for failures
- Cross-references from each rule back to the originating incident (story, task, review finding)

**Current gap**: no structured block exists for this yet. Lives in user's memory directory as markdown. Candidate for a new block in the same wave as research.json.

---

## The shared pattern — this lifecycle applies at every scale

The same ten-phase lifecycle applies whether the unit of work is:

- **A project**: intention = charter, research = domain study, spec = architecture docs, plan = roadmap, tasks = features, verification = project-level V&V
- **A feature**: intention = feature motivation + acceptance criteria, research = feasibility + options, spec = decision records, plan = story decomposition, tasks = stories, verification = feature-level acceptance
- **A story**: intention = user-visible slice definition, research = investigation specific to the story, spec = decision records scoped to the story, plan = task decomposition, tasks = individual tasks, verification = story-level acceptance
- **A task**: intention = one-line task definition, research = ad-hoc (if needed), spec = implicit in task description, plan = implicit in task steps, implementation = the code change, verification = task acceptance
- **A framework gap closure**: intention = what the gap means and what closing it looks like, research = how other frameworks solve it, spec = proposed resolution, plan = implementation decomposition, tasks = the gap-closing work, verification = the gap cannot be reproduced
- **A research investigation**: intention = the research question, method = how it will be answered, findings = the answer, review = adversarial audit of the findings by an independent reviewer, verification = citations resolve to ground truth

**Fractal.** The blocks support nested application of the same pattern because every artifact kind has a finding registry, every artifact has a state machine, and every artifact can cite research, decisions, and other artifacts. The pattern is the same; the scope differs.

---

## The traceability graph

Walking any node in either direction must be possible without scanning global state:

```
project.json (charter)
  ↕
goals (gap — not yet blocked)
  ↕
milestones (gap — rolled into phase.json today)
  ↕
features.json[i]
  ├─ gates → adrs.json[DEC-NNNN] (decision records)
  │           ├─ options_considered
  │           ├─ consequences
  │           ├─ research_sources → research.json[R-NNNN] (pending)
  │           │                      ├─ findings_summary
  │           │                      ├─ citations → file paths + lines + URLs
  │           │                      ├─ grounding (versioned deps)
  │           │                      └─ stale_conditions
  │           └─ related_findings → spec-reviews.json[REV-NNN].findings[]
  ├─ gates → spec-reviews.json[REV-NNN]
  │           ├─ target (path)
  │           ├─ findings[] (state machine per finding)
  │           └─ clean (bool)
  ├─ stories[j]
  │   ├─ depends_on → other stories
  │   ├─ gates → decisions + reviews + research + gaps
  │   ├─ findings[] (scoped defects discovered during story execution)
  │   ├─ tasks[k]
  │   │   ├─ depends_on → other tasks
  │   │   ├─ files[] (what the task touches)
  │   │   ├─ acceptance (how completion is recognized)
  │   │   └─ implemented_by (pending — commit SHAs)
  │   └─ verification → verification.json records per acceptance criterion
  ├─ findings[] (scoped defects at feature level)
  └─ blocks_resolved → existing issues.json entries the feature closes

framework-gaps.json[GAP-NNN]
  ├─ related_features → features.json (which features are blocked by or address)
  ├─ related_adrs / related_decisions → decisions that gate
  └─ proposed_resolution

layer-plans.json[PLAN-NNN]
  ├─ layers (L1-L5 mapping)
  ├─ migration_phases (sequenced, with exit_criteria)
  ├─ related_gaps
  └─ related_features
```

**Forward walk** (from project down to ground truth): project → feature → story → task → implementing commit → file at line → decision grounding the code → research grounding the decision → citation to source. Every arrow is a typed edge, not a free-form reference.

**Backward walk** (from a file change up to intent): commit → task → story → feature → project. Also: commit → task's acceptance → verification record → acceptance criterion → feature motivation → project goal.

**Cross walk** (between artifacts at the same layer): decision → supersedes chain → prior decision. Feature → depends_on → other feature. Research → informs → decision. Review → produces_decision → decision. Finding → related_findings → cluster of findings.

---

## Loop nature

The adversarial audits are not one-shot. Each audit may produce findings that drive revisions; the next audit runs against the revised target. Loop iterations are captured:

- **Spec revision loop**: `spec-reviews.json[REV-0001].target_revision = A` → findings → spec revised to B → new review entry `REV-0002.target_revision = B` → findings → revised to C → `REV-0003.target_revision = C` → clean. The history is preserved; the sequence of target_revision values shows the revision trajectory.
- **Plan revision loop**: same pattern, target is the feature/story node.
- **Implementation fix loop**: same pattern, target is the commit range or the changed files.

Each loop iteration is a new review entry. The review history is the audit trail. Multiple reviews sharing the same target reveal the iteration count.

---

## State machine — user-gated transitions

| Artifact | States | Transitions requiring user authority |
|---|---|---|
| Decision record | proposed → under-review → decided → superseded / deprecated | `under-review → decided`, `decided → superseded`, `decided → deprecated` |
| Spec review | not-started → in-progress → complete / abandoned | `in-progress → abandoned`, `complete → in-progress` (reopen) |
| Review finding | open → triaged → researching → proposed → decided → implementing → resolved / wontfix / duplicate | `proposed → decided`, `triaged → wontfix` |
| Feature | proposed → approved → in-progress → in-review → complete / blocked / cancelled | `proposed → approved`, `proposed → cancelled` |
| Story | proposed → ready → in-progress → in-review → complete / blocked | (none in current schema; likely should add `in-review → complete` gate for stories whose acceptance includes manual/review criteria) |
| Task | todo → in-progress → in-review → done / blocked | (none currently; arguable whether task-level completion needs user gate) |
| Framework gap | identified → accepted → in-progress → closed / wontfix | `identified → accepted`, any → `wontfix` |
| Layer plan | draft → proposed → decided → in-progress → complete / abandoned | `proposed → decided`, `draft → abandoned` |
| Research (pending) | planned → in-progress → complete → stale / superseded / revised | `stale → in-progress` if it informs a decided decision (because revising it may invalidate the grounding) |

The user-gated transitions are the authority-matrix principle: only the user can advance an artifact past a "decided/approved/accepted" threshold. Agents can propose, research, implement, revise — but cannot unilaterally ratify. That discipline is currently enforced by convention; GAP-004 (authorship attestation) + GAP-005 (state-machine validation on transitions) are what make it mechanically enforced.

---

## What is not yet supported — process shortcomings beyond the seven current framework gaps

Walking the lifecycle phases surfaces additional discovered shortcomings (mandate-007 — capture, do not defer):

1. **Goals block** — no structured block for ultimate goals today. `project.json.goals` is a string array. Goals need their own lifecycle (proposed → committed → achieved / abandoned / superseded) and cross-references to features that advance them.

2. **Milestones block** — no structured milestone primitive. `phase.json` is an informal partial replacement. Milestones need their own block with status (pending → reached), dependencies on features, and visibility metadata (externally-communicated milestones vs internal).

3. **Roadmap block** — no structured ordering of features over time. `features.json` is a flat collection. A roadmap would be a sequencing artifact — a materialized view over features with ordering and horizon tags.

4. **Verification criteria taxonomy** — `acceptance_criteria` is today `string[]`. Each criterion should carry a `kind` field (`unit-test | integration-test | schema-validation | empirical | manual | review-clean`) and a `verification_target` pointing at what will demonstrate it.

5. **Review target-kind ambiguity** — `spec-reviews.schema.json` `target: string` does not distinguish doc review from plan review from code review. Finding categories differ by target kind. Add `target_kind` enum.

6. **Review iteration chain** — multiple reviews of the same target over time are not explicitly linked. Add `previous_review` field or derive chain from `target_revision` ordering.

7. **Task git provenance** — tasks do not carry commit SHA references. Walking backward from a task to the code that implements it is manual. Add `implemented_by: string[]`.

8. **Verification.json schema depth** — minimal today. Does not link records to specific acceptance criteria, does not track verification method, does not track grounding (system state at pass time — git SHA, test run ID, timestamp).

9. **Lessons / feedback memory block** — no structured block for L5 memory. Currently in `~/.claude/.../memory/feedback_*.md` as markdown. Should have structured block with incident cross-references, rule wording, why, how-to-apply, originating session ID.

10. **Postmortem block** — no structured postmortem kind. For incidents significant enough to warrant retrospective analysis. Different from review findings (which are forward-looking); postmortems are backward-looking.

Items 1–3 are foundational — they define the top of the hierarchy. Items 4–6 are refinements of the review/verification substrate. Items 7–8 are execution traceability. Items 9–10 are learning capture.

---

## Concrete walk-through — STORY-001 (model-pin resolution) through its full lifecycle

Using the current live substrate and the vocabulary still pending rename:

**Intention** — `features.json[0].stories[0]`:

- `.description` "Apply the ADR-0001 decision by implementing bare-model-id resolution through ExtensionContext at the pi-jit-agents execute boundary"
- `.acceptance_criteria[0]` "A bare model id in an agent spec resolves against the current session's provider via ExtensionContext lookup"
- `.gates[0]` ADR-0001 (proposed, pending user decision)

**Research phase**:

- R-0001 (openrouter-pi-mono-setup, pending enactment as research.json) — complete, grounds the operational incident
- R-0008 (ExtensionContext currentModel availability, pending enactment, status: planned) — prerequisite research that has not yet run
- ADR-0001 cannot advance to `decided` until R-0008 is complete because the decision depends on whether option (iii) is mechanically implementable

**Spec phase**:

- ADR-0001 in `.project/adrs.json` — currently `status: proposed`
- Three options considered, option (iii) recommended, awaiting user ratification
- `related_features: ["FEAT-001"]`

**Spec review phase**:

- REVIEW-001 in `spec-reviews.json` — targets `docs/planning/jit-agents-spec.md`, currently `status: not-started`
- Until the design review runs and finds ADR-0001 compatible with the jit-agents-spec boundary contract, the decision cannot advance
- The review's `clean` flag gates ADR-0001's transition from `under-review` to `decided`

**Plan phase**:

- The plan is the story's task decomposition: `features.json[0].stories[0].tasks[0..2]`
- TASK-001-01 "Verify ExtensionContext exposes currentModel" (this IS R-0008 as a task)
- TASK-001-02 "Implement bare-id resolution in pi-jit-agents"
- TASK-001-03 "Unit tests for model resolution"

**Plan review phase**:

- A new review (REV-0002 or similar) targeting `features.json[0].stories[0]` would run after ADR-0001 is decided but before implementation starts
- Findings might surface: is TASK-001-01 the right first step? Does TASK-001-03 cover all edge cases?
- Revision loop runs until clean

**Implementation phase**:

- Each task's status advances `todo → in-progress → in-review → done`
- Commits are the actual work
- Session handoffs land in `handoff.json`
- Any defects surfaced during implementation go into `features.json[0].findings[]`

**Implementation review phase**:

- A new review targeting the commit range runs after all tasks are `done` and before the story advances to `complete`
- Independent reviewer checks: do the commits match ADR-0001? Do they match the story's acceptance criteria? Are there quality defects?

**Fix loop or verification pass**:

- If review findings exist: new tasks added, back through implementation phase
- If review is clean: verification records written to `verification.json` for each acceptance criterion
- Story advances to `complete` only when all findings are terminal AND verification records exist for every acceptance criterion

**Feature rollup**:

- When all nine stories in FEAT-001 reach `complete`, the feature itself advances from `in-review` to `complete`
- User-gated transition — requires user authority
- Cross-references: FEAT-001 closes issues 043, 045, 048, 049, 050, 062, 063, 065 (those `blocks_resolved` entries)

---

## What this articulation surfaces

**The process is mostly supported but requires discipline because several framework gaps are not yet closed**:

- GAP-001 (nested blocks) — means the feature/story/task hierarchy is flat-smuggled today, with parents storing children as embedded arrays rather than as subdirectories. Works but does not scale.
- GAP-002 (scoped findings) — means the story/feature finding registries exist in schema but have no block-api helpers today. Adding a finding to `features.json[0].findings[]` is a whole-file read-modify-write dance.
- GAP-003 (materialized views) — means there is no derived "all open findings across all features" query surface. Cross-scope queries are manual scans.
- GAP-004 (authorship attestation) — means user-gated transitions are enforced by discipline, not by the framework. An agent could advance ADR-0001 to `decided` today and nothing structural would stop it.
- GAP-005 (state-machine validation) — same story. The `x-lifecycle` metadata in the schemas declares allowed transitions but nothing validates them at write time.
- GAP-006 (schema versioning) — means any schema refinement (e.g. adding `target_kind` to spec-reviews) propagates through every existing entry with no migration path.
- GAP-007 (staleness engine) — means the research block's whole value proposition — automatic staleness detection when dependencies or revisions change — does not fire. The pi-ai 0.63.1 → 0.67.3 delta that occurred today is a live staleness event that cannot propagate to the decisions it informs without manual action.

**Plus the new shortcomings surfaced in this articulation** (goals block, milestones block, roadmap block, verification taxonomy, review target-kind, review iteration chain, task git provenance, verification.json depth, lessons block, postmortem block).

The process the blocks support today is **operationally correct for a single human running the pipeline by hand with discipline**. It is **not yet mechanically enforceable against an unattended agent**. Closing the seven existing framework gaps plus the ten new shortcomings is what makes the process run unattended with integrity.
