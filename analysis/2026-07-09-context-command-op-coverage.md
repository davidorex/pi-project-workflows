# /context command ↔ op-registry coverage — which reflected ops have no `/context` slash-command surface

Date: 2026-07-09
Scope: read-only enumeration + mapping. No substrate write, no commit.
Question: EXACTLY which pi-context reflected ops have no `/context` pi slash-command surface, and is the drift a guarded or unguarded class.

## Method / sources (all quoted file:line)

- Op registry: `packages/pi-context/src/ops-registry.ts` — the `ops` array; each op is registered as a pi tool by `registerAll` (`ops-registry.ts:2771-2795`, `for (const op of ops) pi.registerTool({ name: op.name, … })`). **All 57 ops become pi tools** — every op is callable by an in-pi agent (via `pi -p` tool dispatch) and by the reflecting CLI (`pi-context <op>`).
- Command surface: hand-curated `CONTEXT_SUBCOMMANDS` object at `packages/pi-context/src/index.ts:3691` (15 keys: init, switch, list, archive, install, check-status, accept-all, view, lens-curate, roadmap-view, roadmap-validate, status, add-work, validate, help). Referenced ONLY inside `index.ts` (`index.ts:3888,3903,3909,3927,3929`) + its dist twin — no script/hook/guard reads it (`grep -rn CONTEXT_SUBCOMMANDS` hits only `packages/pi-context/{src,dist}/index.ts`).
- Mapping is by HANDLER BEHAVIOR (the library fn the handler actually calls), not by name.

## The 57 reflected ops (ops-registry.ts, by `name:` line)

append-block-item (391), update-block-item (471), append-relation (511), remove-relation (605), replace-relation (652), append-relations (737), upsert-block-item (786), promote-item (876), append-block-nested-item (942), update-block-nested-item (987), remove-block-item (1045), remove-block-nested-item (1072), read-block-dir (1122), read-block (1139), write-block (1162), context-status (1182), context-check-status (1195), context-validate (1208), read-config (1221), list-tools (1282), read-samples-catalog (1347), read-catalog-schema (1375), context-current-state (1403), context-bootstrap-state (1418), rename-canonical-id (1433), amend-config (1453), read-schema (1514), write-schema (1557), resolve-conflict (1607), resolve-blocked (1633), write-schema-migration (1652), context-init (1710), context-accept-all (1730), context-install (1753), update (1777), context-reconcile (1797), validate-block-items (1816), context-switch (1832), context-list (1912), context-archive (1926), filter-block-items (1952), resolve-item-by-id (1989), read-block-item (2015), read-block-page (2035), join-blocks (2056), resolve-items-by-id (2120), complete-task (2143), context-validate-relations (2170), context-edges-for-lens (2184), context-lens-view (2201), context-walk-descendants (2241), walk-ancestors (2260), find-references (2278), gather-execution-context (2301), context-roadmap-load (2330), context-roadmap-render (2347), context-roadmap-validate (2364).

## `/context` subcommand → handler → op/lib-fn (behavior mapping)

| subcommand | handler | library fn called | op reaching same behavior |
|---|---|---|---|
| status | `handleStatus` (index.ts:86-161) | `contextState(ctx.cwd)` (`:87`) | **context-status** (`ops-registry.ts:1190` `contextState`) |
| check-status | inline (index.ts:3762-3767) | `checkStatus(ctx.cwd)` + `renderCheckStatus` (`:3765`) | **context-check-status** (`:1204` `checkStatus`) |
| validate | inline (index.ts:3861-3883) | `validateContext(ctx.cwd)` (`:3864`) | **context-validate** (`:1216` `validateContext`) |
| init | `handleInit` (index.ts:3216-3258) | `initProject(ctx.cwd, contextDir)` (`:3228`) | **context-init** (`:1725` `initProject`) |
| accept-all | `handleAcceptAll` (index.ts:3268) | `adoptConception(ctx.cwd)` (`:3271`) | **context-accept-all** (`:1742` `adoptConception`) |
| install | inline (index.ts:3710-3761) | `installContext(ctx.cwd, {overwrite})` (`:3715`); `--update`→overwrite (`:3714`) | **context-install** (`:1771` `installContext`) |
| switch | `handleSwitch` (index.ts:3578-3615) | `switchAndCreate` / `switchToPrevious` / `switchToExisting` (`:3595,3604,3609`) | **context-switch** (`:1896-1903` same three) |
| list | `handleList` (index.ts:3622-3633) | `listSubstrates(ctx.cwd)` (`:3623`) | **context-list** (`:1921` `listSubstrates`) |
| archive | `handleArchive` (index.ts:3640-3653) | `archiveSubstrate(ctx.cwd, targetDir)` (`:3647`) | **context-archive** (`:1943` `archiveSubstrate`) |
| view | inline (index.ts:3772-3788) | `loadLensView(cwd, lensId)` + `renderLensView` (`:3780,3786`) | **context-lens-view** (`:2219` `loadLensView`; op returns structured bins, command renders — shared capability) |
| roadmap-view | inline (index.ts:3819-3830) | `loadRoadmap(cwd)` + `renderRoadmap` (`:3823,3828`) | **context-roadmap-load** (`:2339` `loadRoadmap`) + **context-roadmap-render** (`:2356,2360` `loadRoadmap`+`renderRoadmap`) |
| roadmap-validate | inline (index.ts:3831-3846) | `validateRoadmap(cwd)` (`:3834`) | **context-roadmap-validate** (`:2377` `validateRoadmap`) |
| lens-curate | inline (index.ts:3789-3818) | `loadLensView` + `buildCurationSuggestions` (`:3797,3809`) | **NO op** — `buildCurationSuggestions` has no OpDefinition (command-only) |
| add-work | `handleAddWork` (index.ts:168-…) | `findAppendableBlocks(ctx.cwd)` (`:188`) | **NO op** — command-only helper |
| help | inline (index.ts:3884-3893) | iterates `CONTEXT_SUBCOMMANDS` | N/A (meta) |

Commands reaching an op (13): status, check-status, validate, init, accept-all, install, switch, list, archive, view, roadmap-view, roadmap-validate (+ roadmap-render via the same handler). Commands with NO op (inverse direction, 2): **lens-curate, add-work**.

## Instance set — reflected ops with NO `/context` command reaching them

Ops NOT in the mapped-to column above. Reachability legend: **tool** = registered pi tool an in-pi agent calls (`registerAll`, all 57); **CLI** = `pi-context <op>`. A human never types these as `/context …`.

### (c) Operator ACTION ops a pi user would need but cannot reach via `/context` — the confirmed instances

| op | ops-registry | run→lib fn | why an operator needs it | reachable |
|---|---|---|---|---|
| **update** | 1777 | `updateContext(cwd,{dryRun})` (`:1791`) | Brings the installed schema model current with the catalog (3-way merge, migration-aware). The **triggering instance**: `context-check-status`'s own description (`:1198`) calls itself "the front of the **check-status -> update --dryRun -> update** sequence" — `/context check-status` exists, `/context update` does not. `/context install --update` calls `installContext({overwrite})` (`:3714-3715`), a **different** function; the `update` op (`updateContext`) has no command. | tool + CLI (`pi-context update`) |
| **context-reconcile** | 1797 | `reconcileContext(cwd,{dryRun},ctx)` (`:1810`), authGated | Converges stored substrate status with its derivation + applies declared complete→stale transitions — an operator currency/repair action referenced by the `check-context-currency` gate and the `/audit-substrate-currency` skill. No `/context` command. | tool + CLI |
| **context-validate-relations** | 2170 | `validateContextRelations(cwd)` (`:2179`) | Validates `relations.json` edges vs config lenses/hierarchy/relation_types — DISTINCT from `validateContext` (cross-block referential integrity) that `/context validate` runs (`:3864`). CLAUDE.md itself instructs "`context-validate` after relation writes"; a user running `/context validate` does NOT get relation validation. Partial-coverage instance: the validate command reaches one validator, not this sibling. | tool + CLI |
| **resolve-conflict** | 1607 | (schema-merge conflict commit), authGated | Terminal step of the check-status→update→resolve family. Per FGAP-068 (caller-as-reconciler) the calling agent drives it — so a human `/context` command is weaker-needed, but it is the body of a family whose head (check-status) has command surface. | tool + CLI |
| **resolve-blocked** | 1633 | (blocked-update commit), authGated | Same family; commits a blocked-update resolution (FGAP-080). Agent-driven within the update loop; no `/context` command. | tool + CLI |

### (b) No command, but read/data-plane — tool/CLI is the right surface (not an operator-slash need)

Notable near-instances (operator-relevant reads whose in-session surface is only the tool/CLI, NOT `/context`):
- **context-current-state** (1403, `currentState`) — the "where are we + what's next" derivation (focus / ranked next-actions / blocked / milestone rollups). `/context status` runs `contextState` (the metrics view, `index.ts:87`), NOT `currentState`. A user wanting the next-actions derivation in-session has no `/context` command for it.
- **context-bootstrap-state** (1418, `deriveBootstrapState`) — install-state derivation; CLAUDE.md points operators at `pi-context context-bootstrap-state` (CLI), not a command.

Pure data-plane reads (agent-tool / CLI by design; no `/context` expectation): read-block-dir, read-block, read-config, list-tools, read-samples-catalog, read-catalog-schema, read-schema, filter-block-items, resolve-item-by-id, read-block-item, read-block-page, join-blocks, resolve-items-by-id, context-edges-for-lens, context-walk-descendants, walk-ancestors, find-references, gather-execution-context, validate-block-items.

Substrate WRITE ops (driven via CLI / tools with writer attestation; not slash commands by design): append-block-item, update-block-item, append-relation, remove-relation, replace-relation, append-relations, upsert-block-item, promote-item, append-block-nested-item, update-block-nested-item, remove-block-item, remove-block-nested-item, write-block, write-schema, write-schema-migration, amend-config, rename-canonical-id, complete-task.

## Class statement — genuine, and UNGUARDED

This IS a genuine class. `CONTEXT_SUBCOMMANDS` is a hand-maintained literal object (`index.ts:3691`) referenced only within `index.ts`. **No mechanism keeps the `/context` command surface in parity with the op registry:**
- `scripts/parity-check.ts` guards TWO things only (its own header, `:1-55`): (1) in-pi op ↔ reflecting-CLI behavioral parity, and (2) the writer→op coverage contract (every library write fn lands in one of five classes). It observes the op registry and `cli.ts`; it **never observes `CONTEXT_SUBCOMMANDS`**.
- No husky gate, no coverage rule, no derive-commands-from-ops path exists. The command surface is purely hand-curated with no guard.

So operator command coverage drifts unguarded: adding a reflected op (e.g. `update`, `context-reconcile`) does not, by any check, require or verify a corresponding `/context` command. The `update` gap is the exact structural situation FGAP-030 / FGAP-088 flagged in the **INVERSE** direction (command-only surface with no op → add the op) — here in the **FORWARD** direction (op with no command), which no item currently files.

Relation to MILE-008 / FGAP-134: MILE-008 = "Operator-surface truthfulness — CLI, ops, docs, and generation coherent with enforcement" (`resolve-item-by-id MILE-008`). FGAP-134 (identified, under MILE-008) is the remedy-naming facet — an actionable-state render must NAME its resolving op. This command-coverage gap is a **sibling facet** of the same operator-surface-coherence concern: FGAP-134 asks "does the output name the op?"; this asks "does the operator command surface even expose the op?". Both are unguarded hand-maintained operator surfaces under MILE-008.

## Prior-art coverage (searched `.context`, active substrate)

- **FGAP-030** (status: **closed**) — "check-status drift report is command-only — no context-check-status op, unreachable from the reflecting CLI." INVERSE direction (command→no op). Closed by VER-043/TASK-049 (added the op). Related facet, opposite direction.
- **FGAP-088** (status: **closed**) — "The install ceremony has no reflected CLI op." INVERSE direction (command→no op). Closed by VER-045/TASK-059. Related facet, opposite direction.
- **FGAP-134** (status: **identified**) — remedy-guidance-naming class under MILE-008. Different facet (naming the op in output), not command coverage.
- **FGAP-068 / FGAP-070 / FGAP-080 / FGAP-115** — update / resolve-conflict / resolve-blocked MECHANICS (merge baseline, blocked resolution, refusal classification). Not the command-surface question.
- **features** block: `filter-block-items --block features --field description --op matches "subcommand|/context command|CONTEXT_SUBCOMMANDS|command surface|command parity|command coverage"` → **0 results**.
- **framework-gaps** literal token `subcommand` → **0 results**.

**No open or closed item files the FORWARD direction — a reflected op with no `/context` command — as a gap or class.** FGAP-030 and FGAP-088 are the closest prior art but both address the inverse (command with no op). A new filing of this class would not be a duplicate; it should relate to FGAP-030/FGAP-088 (same CLI/command↔op reflection-parity family, opposite direction) and sit under MILE-008 alongside FGAP-134.

## Verdict

Confirmed instance set — reflected ops a pi operator would plausibly reach for that have NO `/context` command (all remain reachable as pi tools + via the CLI; none is unreachable-in-pi entirely, since `registerAll` registers all 57 as tools):

- **update** — the triggering instance; `updateContext`; the documented check-status→update sequence has a command for its head but not `update`.
- **context-reconcile** — operator currency/repair action; no command.
- **context-validate-relations** — relation-edge integrity; `/context validate` runs the OTHER validator, so relation validation has no command.
- **resolve-conflict**, **resolve-blocked** — update-family commit actions; agent-driven (FGAP-068 caller-as-reconciler), so weaker human-command need but the family's body is command-less while its head (check-status) is not.

Near-instances (operator reads, tool/CLI-only, no command): **context-current-state** (`/context status` surfaces the metrics view, not the next-actions derivation), **context-bootstrap-state**.

Class: genuine and UNGUARDED — `CONTEXT_SUBCOMMANDS` is hand-curated; `parity-check` guards op↔CLI + writer→op coverage only, never the `/context` surface. Forward-direction (op→no command) is filed by no substrate item; FGAP-030/FGAP-088 cover the inverse. Sits under MILE-008 with FGAP-134 as a sibling operator-surface-coherence facet.
