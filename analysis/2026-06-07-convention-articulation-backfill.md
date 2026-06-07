# Convention-articulation backfill — every decision / feature / task

Date: 2026-06-07
Substrate: `.context` (active per `.pi-context.json`)
Purpose: determine, for each of the 51 dev items (tasks=30, decisions=15, features=6), its convention articulation, so each can be backfilled with either an `item_governed_by_convention` edge (to a convention) OR an `item_acknowledges_missing_convention` edge (to a "no convention governs X" framework-gap) before the validator invariant that requires one is turned on.

This is a complete, exact re-determination from the substrate. A prior pass under-counted tasks and under-applied one convention; it is not trusted.

## The two conventions and their scope (load-bearing lines, verbatim)

### `feature-branch-workflow`
> "Feature implementation happens on a branch off the active integration branch and merges back to it. ... CODE goes on the feature branch (packages/\*\*; ...). The .context SUBSTRATE stays single-writer on the integration branch — file the gap/task/criteria there BEFORE branching ... Pure substrate/planning work (filing gaps/decisions/research) is done directly on the integration branch and needs no feature branch."

Scope rule applied: governs EVERY feature and EVERY task (every implementation/work item is branch-or-not procedure). Does NOT govern decisions — its own last line carves out "pure substrate/planning work (filing gaps/decisions/research) ... needs no feature branch"; a decision is a resolution, not a branch-executed work unit.

### `cli-command-form`
> "This governs every pi-context command form: reflected ops and `pi-context update` are bare verbs; `update --dry-run` is a verb flag; an alternate run-and-exit mode such as launching a bounded pi session is a bare verb (`pi-context pi-bound`), not a `--flag`. **Apply it when adding any pi-context command; do not decide command form ad hoc.**"

Scope rule applied: governs any decision / feature / task whose subject ADDS OR MODIFIES a pi-context command, subcommand, or flag (clone, merge-finalize, the dryRun flags, the CLI-parity shorthand/flag cluster, `--plan`, `pi-bound`, `update`, the `--writer` channel, new reflected ops surfaced as commands, etc.). Internal library/state/data-model/packaging/process changes that surface no new command or flag are NOT command-form work.

## Category definitions (each item lands in exactly one)

- **A** = `cli-command-form` only → a DECISION about command form (feature-branch-workflow doesn't govern decisions). 1 governed-by edge.
- **B** = `feature-branch-workflow` only → a feature/task that is NOT command work. 1 governed-by edge.
- **C** = both → a feature/task that IS command work. 2 governed-by edges.
- **D** = neither → a DECISION that is not command-form work → needs a missing-convention gap. 1 acknowledges-missing edge.

Consequences (consistency check): every feature/task is B or C; every decision is A or D.

## Per-item table (all 51)

### Decisions (15) — each A or D

| id | kind | cat | convention / missing-theme | why (from item text) |
|---|---|---|---|---|
| DEC-0001 | decision | D | THEME-bootstrap-identity | Skeleton-config bootstrap + isSkeletonConfig content rule; internal provisioning/state, surfaces no command or flag. |
| DEC-0002 | decision | A | cli-command-form | Decides clone is the dual-surface command `pi-context clone <source-substrate> <dest-dir>` — introduces a command + its positional form. |
| DEC-0003 | decision | D | THEME-bootstrap-identity | Switch register-if-absent reconciliation in the three switch engine fns; internal identity lifecycle, no command/flag. |
| DEC-0004 | decision | A | cli-command-form | Registers a git merge driver + a `merge-finalize` command / post-merge hook — introduces command + driver surface. |
| DEC-0005 | decision | D | THEME-data-model-merge | Convergent ordered-sequence CRDT field-kind; internal data representation + merge dispatch, no command/flag. |
| DEC-0006 | decision | A | cli-command-form | Adds the `ctx`/`--writer` channel to the op-execution contract + new write ops (reflected as CLI commands) + dryRun params — command/flag-surface shaping. |
| DEC-0007 | decision | D | THEME-release-changelog-process | Release & changelog discipline (when an [Unreleased] entry accrues; a release is a planned decision) — process practice, no command/flag. |
| DEC-0008 | decision | A | cli-command-form | Decides the `--dry-run` preview lives in the library and is threaded through the ops/CLI for the 5 dryRun-bearing commands — flag form across commands. |
| DEC-0009 | decision | D | THEME-output-safety-invariant | Places the read cap as an output-boundary invariant across emit sites; internal guarantee placement, adds no command or flag. |
| DEC-0010 | decision | A | cli-command-form | Decides `--update` re-sync semantics + the read-only `--plan` flag for install — command/flag form. |
| DEC-0011 | decision | D | THEME-surface-topology | Retire op-twin orchestrator scripts; new ops are op-only with the CLI as the reflected shell surface — surface/duplication architecture, not the form of any command. |
| DEC-0012 | decision | D | THEME-canonical-process-governance | Revert the unplanned pre-identity escape hatch; any such support must go through canonical gap→DEC→plan — process-governance reversal, no command/flag. |
| DEC-0013 | decision | D | THEME-packaging-publish-topology | The pi-context bin ships as its own publish unit (`@davidorex/pi-context-cli`) — packaging/publish-unit topology, not command form. |
| DEC-0014 | decision | A | cli-command-form | Decides `pi-bound` is a bare subcommand routed before op resolution (explicitly "per the cli-command-form convention") — command form. |
| DEC-0015 | decision | D | THEME-impl-mechanism | pi-bound composes context in-process via `loadContext` instead of the tsx+python3 pipeline — implementation-mechanism choice, no command/flag. |

### Features (6) — each B or C

| id | kind | cat | convention(s) to edge | why (from item text) |
|---|---|---|---|---|
| FEAT-001 | feature | C | feature-branch-workflow + cli-command-form | Surfaces `pi-context clone <source> <dest-dir>` across library + Pi tool + CLI — command work. |
| FEAT-002 | feature | C | feature-branch-workflow + cli-command-form | Registers a git merge driver + merge-finalize/post-merge command — command/driver surface. |
| FEAT-003 | feature | B | feature-branch-workflow | Convergent ordered-sequence field-kind plugin into the merge driver; internal data-model work, no command/flag. |
| FEAT-004 | feature | B | feature-branch-workflow | Config-drives the derivation of the EXISTING context-current-state/context-status ops; adds no command or flag. |
| FEAT-005 | feature | C | feature-branch-workflow + cli-command-form | Adds the `pi-context pi-bound` command (subsuming launch-constrained-pi.sh). |
| FEAT-006 | feature | C | feature-branch-workflow + cli-command-form | Adds the `pi-context update` command (+ `--dry-run` flag). |

### Tasks (30) — each B or C

| id | kind | cat | convention(s) to edge | why (from item text) |
|---|---|---|---|---|
| TASK-001 | task | B | feature-branch-workflow | Implements skeleton-config bootstrap (writeSkeletonConfig + isSkeletonConfig + bootstrap state); internal, no command/flag. |
| TASK-002 | task | B | feature-branch-workflow | Implements switch identity reconciliation in the switch engine fns; internal, no command/flag. |
| TASK-003 | task | C | feature-branch-workflow + cli-command-form | Implements the clone arc incl. `pi-context clone` command (library + Pi tool + CLI + script). |
| TASK-004 | task | C | feature-branch-workflow + cli-command-form | Implements the git merge driver + merge-finalize command + .gitattributes driver entry. |
| TASK-005 | task | B | feature-branch-workflow | Implements the convergent ordered-sequence CRDT field-kind in block-api; internal data-model, no command/flag. |
| TASK-006 | task | C | feature-branch-workflow + cli-command-form | Threads DispatchContext incl. building it from the CLI `--writer` flag — modifies CLI dispatch/flag surface. |
| TASK-007 | task | C | feature-branch-workflow + cli-command-form | Adds removeRelation + remove/replace-relation + upsert ops (reflected as CLI commands). |
| TASK-008 | task | B | feature-branch-workflow | Adds the library↔op↔script parity/coverage test wired into husky/CI; internal gate, no command/flag. |
| TASK-009 | task | B | feature-branch-workflow | parity-check detector hardening (scripts/parity-check.ts only); internal script. |
| TASK-010 | task | C | feature-branch-workflow + cli-command-form | Adds `--dryRun` to the 4 relation ops/CLI. |
| TASK-011 | task | C | feature-branch-workflow + cli-command-form | Adds `--dryRun` to upsert-block-item op/CLI. |
| TASK-012 | task | C | feature-branch-workflow + cli-command-form | Reworks the CLI `--json` structured-output contract (OpResult widening, CLI --json emit). |
| TASK-013 | task | C | feature-branch-workflow + cli-command-form | Enforces the read cap at the CLI --json / text / Pi-tool emit sites — modifies CLI output behavior at the flag boundary. |
| TASK-014 | task | B | feature-branch-workflow | Migrates completeTask to the verification edge gate; internal op logic, no command/flag added. |
| TASK-015 | task | C | feature-branch-workflow + cli-command-form | CLI pre-call input layer: `--block` without `--arrayKey`, `--writer kind:id`, `--where`, CSV `--op` shorthands. |
| TASK-016 | task | C | feature-branch-workflow + cli-command-form | CLI output/error layer: adds `--format text\|json\|table`. |
| TASK-017 | task | C | feature-branch-workflow + cli-command-form | CLI affordances: `--show-schema`, append `--dry-run`, granular exit codes. |
| TASK-018 | task | B | feature-branch-workflow | In-pi read-schema whole:true correction; internal op behavior, no new command/flag. |
| TASK-019 | task | B | feature-branch-workflow | Behavioral parity gate in parity-check.ts; internal regression guard. |
| TASK-020 | task | B | feature-branch-workflow | Config-driven state-derivation registry + currentState rewire; internal, no command/flag. |
| TASK-021 | task | B | feature-branch-workflow | Config-declared lifecycle metrics in contextState projection; internal. |
| TASK-022 | task | B | feature-branch-workflow | Read-cap measurement-basis per surface (compact vs pretty); internal measurement, adds no command/flag. |
| TASK-023 | task | B | feature-branch-workflow | install --update never overwrites a populated block; safety-behavior of existing install, no command/flag added. |
| TASK-024 | task | B | feature-branch-workflow | Records an install baseline (installed_from + content_hash) in config; internal write, no command/flag. |
| TASK-025 | task | C | feature-branch-workflow + cli-command-form | Adds the read-only `--plan` drift-detector flag to install. |
| TASK-026 | task | B | feature-branch-workflow | Schema re-sync via the migration registry; internal install behavior, no command/flag. |
| TASK-027 | task | B | feature-branch-workflow | Ordering-relation direction enforcement in append-relation/lib; internal, no command/flag added. |
| TASK-028 | task | B | feature-branch-workflow | Makes the bin globally installable (chmod +x dist/bin.js); packaging/build, not command form. |
| TASK-029 | task | B | feature-branch-workflow | Declares the meta-package dependency for pi-bound resolution; packaging, no command/flag. |
| TASK-030 | task | C | feature-branch-workflow + cli-command-form | Implements the `pi-context pi-bound` bare subcommand. |

## Category counts (sum to 51)

- A (decision, command-form) = 6 → DEC-0002, 0004, 0006, 0008, 0010, 0014
- B (feature/task, not command work) = 19 → tasks 17 + features 2
  - tasks (17): TASK-001, 002, 005, 008, 009, 014, 018, 019, 020, 021, 022, 023, 024, 026, 027, 028, 029
  - features (2): FEAT-003, FEAT-004
- C (feature/task, command work) = 17 → tasks 13 + features 4
  - tasks (13): TASK-003, 004, 006, 007, 010, 011, 012, 013, 015, 016, 017, 025, 030
  - features (4): FEAT-001, 002, 005, 006
- D (decision, no convention) = 9 → DEC-0001, 0003, 0005, 0007, 0009, 0011, 0012, 0013, 0015

Arithmetic: A 6 + B 19 + C 17 + D 9 = **51**. ✓
Cross-check by kind: decisions A 6 + D 9 = 15 ✓; tasks B 17 + C 13 = 30 ✓; features B 2 + C 4 = 6 ✓.

## Exact edge totals to write

- `item_governed_by_convention` edges = A·1 + B·1 + C·2 = 6 + 19 + (17×2) = 6 + 19 + 34 = **59**
- `item_acknowledges_missing_convention` edges = D·1 = **9**

## Deduped missing-convention gap themes (D items)

Each theme is one "no convention governs X" framework-gap that its member decisions edge to. The nine D decisions cluster into eight per-domain themes:

| theme | "no convention governs…" | member decision(s) |
|---|---|---|
| THEME-bootstrap-identity | substrate bootstrap-state provisioning + substrate-identity reconciliation on init/switch | DEC-0001, DEC-0003 |
| THEME-data-model-merge | the substrate data-model representation + field-kind merge semantics (CRDT sequence) | DEC-0005 |
| THEME-release-changelog-process | release cadence + changelog-accrual discipline | DEC-0007 |
| THEME-output-safety-invariant | where the read/output safety cap is enforced (which boundary owns the invariant) | DEC-0009 |
| THEME-surface-topology | op/script/CLI surface topology + duplication (which surfaces a capability lives on) | DEC-0011 |
| THEME-canonical-process-governance | the canonical-process gate against unplanned architectural surface (gap→DEC→plan before new surface) | DEC-0012 |
| THEME-packaging-publish-topology | npm publish-unit / package topology (which package hosts the bin) | DEC-0013 |
| THEME-impl-mechanism | implementation-mechanism choice (in-process composition vs subprocess pipeline) | DEC-0015 |

Only THEME-bootstrap-identity dedupes more than one decision (DEC-0001 + DEC-0003 share the bootstrap/identity-lifecycle domain). The other seven are single-member per-domain themes — each a distinct framework-gap subject. Total acknowledges-missing edges remain 9 (one per D decision), targeting 8 distinct gap nodes.
