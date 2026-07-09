# Operator-surface remedy-guidance — the class `renderCheckStatus` instantiates

Date: 2026-07-09. Read-only forensic investigation. No substrate write; no commit.

## Triggering instance (verified)

`renderCheckStatus` (`packages/pi-context/src/index.ts:1814-1848`) renders a header, one line per non-empty drift state (`  <state> (<n>): <name> (<from> -> <to>) …`), and a `Total:` line. It names NO op/command for any actionable state. The actionable states `catalog-ahead` / `both-diverged` / `no-baseline` all transition toward clean via `/context update` (the `update` op) — check-status is, by its own op description, "the front of the check-status -> update --dryRun -> update sequence" (`ops-registry.ts:1198`). That transition op is unnamed in the render. Invoked at the `/context check-status` handler `index.ts:3765`; on the CLI the `context-check-status` op returns `{ json: checkStatus(cwd) }` (`ops-registry.ts:1204`) — raw JSON, `renderCheckStatus` is not used there, so BOTH surfaces omit the remedy.

## Enumeration — every surface that can report an actionable / non-terminal / non-clean state

Two operator surfaces exist: the Pi slash-command handlers (`ctx.ui.notify(render…)` in `index.ts` `CONTEXT_SUBCOMMANDS`) and the reflecting CLI (`pi-context <op>`, which text-renders `{ json }` ops as raw JSON via `renderOpResultText` and hand-renders update sub-reports in `cli.ts`).

| Surface / renderer | Reports actionable state? | Names its remedy/transition op? | Evidence (file:line) |
|---|---|---|---|
| `renderCheckStatus` (`/context check-status` + `context-check-status` op) | YES — `catalog-ahead`/`both-diverged`/`no-baseline` → `/context update` | **NO** | `index.ts:1814-1848`; handler `:3765`; op `ops-registry.ts:1195-1206` (`{ json }`, render unused on CLI) |
| `renderConflicts` (update conflicts) | YES — both-diverged merge conflict → resolve-conflict | YES — trailing line names `resolve-conflict --schemaName <name> --schema <reconciled>` | `index.ts:3093-3113` (line `:3109-3111`); CLI `cli.ts:1184` |
| `renderBlocked` (update blocked resync) | YES — blocked schema → resolve-blocked / fix items | YES — trailing lines name `resolve-blocked --schemaName <name> --yes` + the fix-items flow; `write-failed` names "address the precondition, re-run update" | `index.ts:3141-3195` (`:3163`, `:3182`, `:3191`); CLI `cli.ts:1192` |
| `/context validate` handler | YES — integrity issues | handler adds NONE; delegates to `issue.message` → **MIXED** (see below) | `index.ts:3861-3883` |
| `/context roadmap-validate` handler | YES — endpoint-missing / milestone-missing / cycle / isolated | **NO** — handler prints `[code] where: message`; messages describe the defect, name no fixing op/edit | `index.ts:3831-3846`; messages `roadmap-plan.ts:436-518` (via `diagMessage`) |
| `install` handler | YES — install outcomes | **PARTIAL** — `skipped` names "pass --update to overwrite"; `blocked` ("no safe migration — left unchanged") and `notFound` name NO remedy | `index.ts:3710-3761` (`:3736`, `:3747`, `:3750`) |
| `context-validate-relations` op | YES — edge integrity | raw JSON; remedy per-message only | `ops-registry.ts:2170-2181` (`{ json }`) |
| `context-bootstrap-state` op | YES — `no-pointer`/`no-config`/`skeleton`/`not-installed` | output is bare-state JSON; the remedy (init→accept-all→install) lives in the OP DESCRIPTION, not the render | `ops-registry.ts:1418-1431` |
| `context-status` / `context-current-state` ops | status reads (not drift) | raw JSON; `current-state` `nextActions` names WHICH ITEMS, not which op resolves a drift state (different axis) | `ops-registry.ts:1182-1192`, `1403-1415` |

### `validateContext` message level (MIXED — the `/context validate` remedy is per-message, inconsistent)

`context-sdk.ts` `validateContext`:
- EMBEDS remedy: staleness-candidate message names `context-reconcile` (`:2765-2767`); substrate-registration message names `registerSubstrate` (`:2577`); config-declared invariant messages carry author-written remedy (`evaluateConfigInvariants`, `inv.message`, `:2318-2404`) — the DEC-0001 "add a `decision_derived_from_item` edge …" counter-example is a config.json invariant message, data-driven from `config.invariants[]`, not hardcoded in the renderer.
- OMITS remedy: dangling edge parent/child "does not resolve to any item" (`:2629`, `:2637`, `:2646`, `:2654`); unknown-status-vocabulary "silently buckets to 'unknown'" (`:2748-2750`).

## The class (derived from the enumeration)

**Class name:** actionable-state renders must name their transition op.

**Precise boundary:** any operator-facing render (a `ctx.ui.notify` command output, or a text-rendered op result) that enumerates a REMEDIABLE state — a non-terminal, non-clean, actionable drift/integrity/lifecycle state whose resolution is a KNOWN op/command — must, per reported state, name the op/command that transitions that state toward clean. The defect is a renderer that emits bare state (a state name, a defect description) without naming its transition op. Out of boundary: terminal/clean states (`in-sync`, `✓ passed`), pure status reads (`context-status`), and item-level "what to work on next" guidance (`current-state.nextActions`) — a different axis.

**Full instance set (report actionable state, do NOT name the transition op):**
1. `renderCheckStatus` — the triggering instance (both Pi + CLI surfaces).
2. `/context roadmap-validate` render — reports roadmap-integrity states; names no fixing op/edit.
3. `/context validate` — the dangling-edge and unknown-status-vocabulary messages (`validateContext` `:2629/2637/2646/2654`, `:2748-2750`).
4. `install` handler — the `blocked` and `notFound` lines.

**Counter-examples (embed the remedy):**
- `renderConflicts` names `resolve-conflict`; `renderBlocked` names `resolve-blocked` + the fix flow.
- `validateContext` staleness message (→ `context-reconcile`), substrate-registration message (→ `registerSubstrate`), and config-declared invariant messages (author-written remedy).

**Instance vs atomic — verdict: INSTANCE, not atomic.** Evidence: `renderCheckStatus`'s own two sibling renderers, authored to "Mirror `renderCheckStatus`'s grouping style" (`index.ts:3087` comment on `renderConflicts`; `renderBlocked` follows the same shape), BOTH name their transition op. FGAP-069's closure records this as deliberate design — "The conflict report's guidance names it" (proposed_resolution). So the "name the transition op" expectation demonstrably already holds for 2 of the 3 renderers in the update lifecycle; `renderCheckStatus` — the FRONT of the check-status → update → resolve-conflict/resolve-blocked sequence it heads — is the lone omission in its own family. The class also has instances outside that family (roadmap-validate, validate's two message kinds, install), confirming it is not a one-off.

## Fix-level determination

**No shared mechanism exists.** Grep for `remedy` across `packages/pi-context/src/*.ts` (non-test): zero hits. Each remedy-bearing renderer hand-writes a literal trailing-guidance string constant (`index.ts:3110`, `:3182`, `:3191`). `validate`/`roadmap-validate` delegate remedy to per-issue message strings (`validateContext` hardcoded strings + `config.display_strings`/`config.invariants[].message` via `diagMessage`, `roadmap-plan.ts:114-117`). There is NO status-vocabulary → remedy-op map and NO shared render helper guaranteeing a transition op is named.

- **Narrow (per-surface) fix:** add a remedy line to `renderCheckStatus` (e.g. "Resolve actionable drift (`catalog-ahead`/`both-diverged`/`no-baseline`): run `/context update` (or `pi-context update`).") — the minimal close of the triggering instance.
- **Class (shared-contract) fix:** a convention/mechanism guaranteeing every actionable-state render names its transition op, ideally backed by a state/code → remedy-op map. The inputs already exist enumerated: the drift-state vocabulary (`renderCheckStatus` `order` array `index.ts:1817-1825`; `CheckStatusAsset["state"]` union) and the validate issue codes. A map keyed on them is the DRY affordance; the narrow renderCheckStatus edit is its first consumer. The class fix is warranted because the informal pattern already exists (renderConflicts/renderBlocked) but is unenforced — a convention-shaped gap, not an atomic one-off.

## Prior-art coverage (active substrate `.context`)

Searched framework-gaps (`description matches`), features, issues, conventions; walked MILE-008 / PHASE-M8-OPERATOR-SURFACE membership.

- **FGAP-078** (CLOSED, VER-043/TASK-049) — "check-status reports no version gap". About surfacing WHICH schemas are behind + the version delta; closed by adding the inline `(from -> to)` annotation. NOT the remedy-guidance gap.
- **FGAP-030** (CLOSED, VER-043/TASK-049) — "check-status drift report is command-only — no `context-check-status` op". About CLI reachability. NOT this.
- **STORY-007** (complete) — "As an operator, I want check-status to report which installed schemas are behind the catalog, and by what version gap." About the drift FACTS, not the remedy. Satisfied.
- **FGAP-069** (CLOSED) — establishes that the conflict report's guidance NAMES `resolve-conflict`; evidence the class-expectation already exists for siblings.
- **MILE-008** (planned) — "Operator-surface truthfulness — CLI, ops, docs, and generation coherent with enforcement." The milestone this class belongs under. Its one phase **PHASE-M8-OPERATOR-SURFACE** has members TASK-022 (read-cap measurement), TASK-057 (schema version-history audit), TASK-058 (migration-chain walk), TASK-054 (raw-write helper refactor) — NONE about renderer remedy-guidance.
- **Convention `gap-explore-surfaces-class`** exists (mandates surfacing a gap's class). NO convention exists mandating "actionable-state renders name their transition op."

**Coverage verdict: GENUINELY UNFILED.** Neither the specific `renderCheckStatus` remedy gap nor its general class ("actionable-state renders must name their transition op") is tracked. The two check-status gaps on file (FGAP-078, FGAP-030) address different facets and are closed. The class belongs under MILE-008; no member task covers it.
