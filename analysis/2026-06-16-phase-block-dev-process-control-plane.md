# The phase block + pi-context elements as a dev-process control plane

The `phase` block is installed and empty. Combined with the relation_types, invariants, and derivation ops already shipped, it forms a dev-process control plane that is largely discipline-closable — substrate writes, not code — with three named code dependencies stated flatly below.

## What ships today

### The phase block

`phase` is in `installed_schemas` and the schema is at `.context/schemas/phase.schema.json` (version `2.0.1`). The block is empty (`read-block --block phase` → `[]`, total 0).

Schema (`read-schema --schemaName phase`): item `required` is `["id","name","intent","status"]`. Full field set:

- `id` — string, pattern `^PHASE-[A-Z0-9-]+$`. Canonical phase id.
- `name` — string.
- `intent` — string. Required.
- `goal` — string, optional. "What is true after this phase that was not true before."
- `status` — string enum `planned | in-progress | completed`. Required.
- `success_criteria` — array, optional. Items `{criterion: string, verify_method: "command"|"inspect"|"human"}`; both required per item. The proposal's "{criterion, verify_method}" is correct; `verify_method` is an enum, not free string.
- `specs` — array, optional. Items `{number: integer, name, intent, status (planned|in-progress|completed), acceptance_criteria: string[]}`. `number` is an integer discriminator, not a string. Required per spec: `number, name, intent, status`.
- `artifacts_produced` — array of strings, optional.
- `oid` / `content_hash` / `content_parent` — content-addressed-identity metadata, optional, stamped on write.

`intent` is REQUIRED, not optional. `goal`, `success_criteria`, `specs`, `artifacts_produced` are all optional.

### task_positioned_in_phase

Registered (`read-config --registry relation_types --id task_positioned_in_phase`): category `membership`, `source_kinds: ["tasks"]`, `target_kinds: ["phase"]`. Edge `{parent: PHASE, child: TASK}` reads "task positioned in phase." Tasks point at the phase block.

### The roadmap layer is a DISTINCT surface from the phase block

`context-roadmap-load`, `context-roadmap-render`, `context-roadmap-validate`, and `context-roadmap-list` are shipped ops (`ops-registry.ts:2055/2081/2101/2122`), reachable through the global CLI (`context-roadmap-list` → `[]` against `.context`). They operate on `<config.root>/roadmap.json` — NOT the `phase` block. Two distinct surfaces:

- The **`phase` block** (`phase.json`, PHASE-* items with intent/goal/success_criteria/specs). Tasks attach via `task_positioned_in_phase`.
- The **`roadmap` block** (`roadmap.json`, opt-in, NOT installed in `.context` — `read-block --block roadmap` → "Block file not found"). A `RoadmapSpec` carries `roadmaps[].phases[]` where each phase is a `PhaseSpec` `{id, name, lens, milestone?, exit_criteria?}` (`roadmap-plan.ts:149-156`). A roadmap-layer phase aggregates items through a **named lens**, not through `task_positioned_in_phase` edges. Its status rollup runs over the lens's items (`roadmap-plan.ts:317-339`).

`phase_depends_on` is consumed by the roadmap layer over `roadmap.json` phases (`roadmap-plan.ts:329, 505, 528`), not over `phase`-block items. The roadmap layer never reads the `phase` block.

### Invariants

Nine invariants ship in the catalog; ten are live in `.context/config.json` (the live set adds `decision-shows-derivation`, and `decision/feature/task-articulates-convention` are at severity `error` live vs `warning` in the catalog). Classes: `requires-edge` and `status-consistency`. The cited analog `task-completed-feature-complete` exists (status-consistency, block `tasks`, relation `task_addresses_feature`, `when_bucket: complete`, `require_target_bucket: complete`, severity `warning`). No phase invariant exists in either catalog or live config.

### gather-execution-context

`gatherExecutionContext` (`execution-context.ts:143`) is contract-driven: it reads a `context-contracts` entry keyed by `unit_kind` and walks each relation_type the contract declares, per declared direction (`in`/`out`/`both`) and depth, resolving reached ids to full items. It walks whatever relation_types a contract names — `task_positioned_in_phase`, `task_addresses_feature`, `task_addresses_gap`, `item_governed_by_convention` are all registered and walkable. The `context-contracts` block is installed but EMPTY (`read-block --block context-contracts` → `[]`). With zero contracts filed, gatherExecutionContext returns `{error: "no context-contract for kind: …"}`. The one-call vertical trace is real, gated on a filed contract declaring those relation_types.

### context-current-state

`currentState` (`context-sdk.ts:703`, op `context-current-state` at `ops-registry.ts:1155`) buckets tasks into `inFlight` / `blocked` / `nextActions`, and lists open framework-gaps under `nextActions`, ranked P0>P1>P2>P3 then id (`:811-831`). Task readiness honors `task_depends_on_task` and `task_gated_by_item` (FGAP-061 NOW slice, TASK-065 completed). It reads the `phase` block for ONE thing: the `focus` string fallback — when no task is in-flight, it reports an `in-progress` phase as `focus: phase: PHASE-X (name)` (`:864-876`). It does NOT read `task_positioned_in_phase`; it does not group tasks under phases; it does not derive the current phase from task positioning. `focus` is `"no active focus."` only when no task is in-flight AND no phase is in-progress.

## The control plane, element by element

1. **Phase ordering → execution sequence.** `context-roadmap-load` reads `phase_depends_on` edges for topo order over `roadmap.json` phases (`roadmap-plan.ts:329`); `context-roadmap-validate` checks references resolve and statuses are known. This operates on the `roadmap` block, which is not installed in `.context`, and on `phase_depends_on`, which is unregistered (see dependencies). Once TASK-066 registers `phase_depends_on` and `roadmap.json` is installed and authored, roadmap topo ordering is derivable.

2. **Task grouping → scope visibility.** `task_positioned_in_phase` edges make "what's in this phase" a closure-table query today. A lens over the `phase` block by status groups phases; tasks-under-phase is the inbound `task_positioned_in_phase` walk.

3. **Phase completion → derived.** A phase is complete when every `task_positioned_in_phase` task buckets to complete. No invariant enforces this today. The `task-completed-feature-complete` status-consistency invariant is the structural template. A phase-completion invariant is net-new (see dependencies).

4. **Sub-phase specs → decomposition within a phase.** The `specs` nested array is the in-phase sub-phase construct: `{number, name, intent, status, acceptance_criteria}`. Each sub-phase maps to a task by convention; no relation_type connects a spec to a task — the decomposition is visible inside the phase item, not edged.

5. **Phase → feature → gap traceability.** With phases and positioning edges filed, the path FGAP →(task_addresses_gap)→ TASK →(task_positioned_in_phase)→ PHASE, plus TASK →(task_addresses_feature)→ FEAT and TASK →(item_governed_by_convention)→ convention, is walkable through `relations.json`. All four relation_types are registered. One `gather-execution-context` call walks the chain once a `context-contracts` entry declares those relation_types for the unit_kind (the block is empty today).

6. **Roadmap → user-facing projection.** `roadmap.json` (opt-in, `context-roadmap-*` ops) declares phases in order with milestones and exit criteria; `context-roadmap-render` produces text with per-phase **Depends on:** lines sourced strictly from `phase_depends_on` edges scoped to in-roadmap phases (`roadmap-plan.ts:579+`); `context-roadmap-validate` checks every referenced phase/milestone/lens resolves. Gated on installing the `roadmap` block and registering `phase_depends_on`.

7. **context-current-state → "where are we" from phases.** Today `focus` already reflects an in-progress phase as a fallback. Deriving the current phase and its in-progress tasks FROM `task_positioned_in_phase` positioning is TASK-020's territory — but read TASK-020's actual scope (see dependencies): it rewires `currentState` to read a config registry instead of hardcoded kinds, and the shipped conception declares only `framework-gaps` + `tasks`. Phase-positioning-driven focus is a config declaration TASK-020 makes possible, not a behavior TASK-020 itself ships against `.context`.

## Shipped-and-usable today vs gated on named code

Usable now, zero code — pure substrate writes:

- File `PHASE-*` items in the `phase` block.
- Edge tasks to phases with `task_positioned_in_phase`.
- Walk the FGAP→TASK→PHASE→FEAT→convention chain via the registered relation_types (closure-table queries; `gather-execution-context` once a `context-contracts` entry is filed — itself a substrate write).
- `context-current-state` already reports an in-progress phase as `focus`.

Gated on named code or unshipped substrate:

- **Roadmap topo ordering / render / validate over `phase_depends_on`** — `phase_depends_on` is registered in NEITHER the catalog nor live `.context/config.json` (`read-config … --id phase_depends_on` → "entry not found"). An unregistered relation_type does not pass write-time edge validation, so the edges cannot be authored and the topo order is non-derivable today. **TASK-066** back-ports `phase_depends_on` (and `task_gated_by_item`) to the catalog and adds `phase_depends_on` to live config via `amend-config`. **TASK-066 also requires confirming `roadmap-plan.ts` is reachable, not dead, before registering.** The `roadmap` block is additionally not installed in `.context` — authoring `roadmap.json` is a further substrate step.
- **Phase-completion enforcement** — net-new invariant. No phase invariant exists. A `status-consistency` invariant on the `phase` block (when_bucket complete, require positioned tasks complete) is a config + possibly engine addition. The existing `status-consistency` class compares a source item's bucket to its edge-targets' buckets; a phase-completion check needs the inverse (all inbound `task_positioned_in_phase` children complete), which is closer to TASK-047's net-new `advancer-completion` class than to any shipped invariant. This is code, not a config-only declaration, unless the shipped class already covers the inbound-aggregate shape.
- **Phase-positioning-driven current-state focus** — **TASK-020** (FGAP-017, FEAT-004, planned). TASK-020's filed scope is a config-driven state-derivation registry rewiring `currentState` (`context-sdk.ts` ~682-825) off hardcoded kinds; the shipped conception declares `framework-gaps` + `tasks` so stock `.context` behavior is byte-preserved. Phase-positioning-driven focus is enabled by TASK-020's registry, declared per-substrate; it is not behavior TASK-020 ships against `.context`.

## Verdict on "zero code, discipline-closable"

PARTIAL. Filing phases and `task_positioned_in_phase` edges, and walking the traceability chain through registered relation_types, is genuinely zero-code substrate discipline — the tool works and the project has filed zero phases. Three of the seven control-plane elements depend on unshipped code or unshipped substrate:

- Roadmap ordering/render (element 1, 6) is gated on **TASK-066** (register `phase_depends_on`) plus authoring an uninstalled `roadmap` block, and the roadmap layer operates on `roadmap.json` phases, not the `phase` block.
- Phase-completion enforcement (element 3) is a **net-new invariant** (no phase invariant exists).
- Phase-positioning-driven current-state (element 7) is gated on **TASK-020**'s config registry.

The thesis holds for the substrate-write core; the roadmap projection, completion enforcement, and phase-aware focus are gated on named, filed, planned work.

## Illustrative backlog decomposition

The named tasks exist with the cited bindings:

- TASK-020 — config-driven state-derivation registry; addresses FGAP-017, advances FEAT-004; planned.
- TASK-066 — back-port `task_gated_by_item` + `phase_depends_on` to the catalog; addresses FGAP-094; depends on nothing upstream; planned.
- TASK-067 — build-time catalog⊇consumed-vocabulary parity gate; addresses FGAP-094; `task_depends_on_task` → TASK-066; planned.
- TASK-041 — backfill decision-derivation edges then raise `decision-shows-derivation` warning→error; planned. (`decision-shows-derivation` is live at severity WARNING in `.context/config.json`; the raise-to-error is this task's deliverable, not yet done.)
- TASK-044 — broaden the rhetorical-register guard + clean violating block bodies; addresses FGAP-074; planned.
- TASK-047 — net-new `advancer-completion` invariant class; addresses FGAP-082; planned. The structural precedent for a phase-completion invariant.

A PHASE-* decomposition of the backlog is a valid substrate write today (governance / config / operator / infra / arch groupings, each a `phase` item with positioned tasks). It carries no derived ordering until `phase_depends_on` is registered (TASK-066) and authored.
