# @davidorex/pi-context-cli

A command-line interface over the [`@davidorex/pi-context`](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-context) substrate operations.

The command set is **auto-tracking**: every operation in pi-context's op-registry whose `surface` is `"use"` surfaces as a CLI command by reflection. There is no hardcoded command list — adding an op to pi-context makes a new CLI command appear with zero changes to this package. Operations that depend on a pi runtime handle (e.g. `list-tools`) carry `surface: "process"` and are not surfaced here.

## Install

The published package installs globally:

```bash
npm i -g @davidorex/pi-context-cli
```

For the operator `pi-context` binary in this monorepo, install a publish-free packed copy of the working tree from the repo root:

```bash
npm run promote:cli
```

`promote:cli` (`scripts/promote-cli.mjs`) builds the working tree, packs the `@davidorex` workspace set into tarballs, and installs the whole set into the global npm prefix as a real copy (one `npm i -g <tarball...>`). The installed binary resolves its `@davidorex/*` dependencies from the co-installed packed siblings — current working-tree code, not the registry release — and because it is a copy, a subsequent repo `npm run build` cannot touch it. It uses no `npm link`. Pass `--prefix <dir>` (or `PROMOTE_PREFIX=<dir>`) to install into a throwaway prefix instead of the real global. A release run promotes automatically: `scripts/release.mjs` ends with this step, so after any `npm run release:*` the global operator is at the released version; the manual command remains the after-edit/build refresh path.

Either path provides a `pi-context` binary.

## Usage

```bash
pi-context --help                 # grouped op index (by command class) + global flags
pi-context --version              # print the package version (alias -v)
pi-context <op> --help            # per-op help: synopsis + flags + examples + related commands
pi-context <op> --help --format json  # the same help as a machine-readable JSON model
pi-context <op> [flags]           # run an op
```

Each op's flags derive from its parameter schema:

- scalar fields take `--field value` (`string` / `number`); `boolean` fields are presence flags (`--flag`, or `--flag true|false`)
- object / array / typeless fields take a JSON argument: `--field '<inline json>'` or `--field @path/to.json`

Example:

```bash
pi-context read-block --block tasks
pi-context append-block-item --block issues --arrayKey issues --item @new-issue.json --autoId
pi-context read-block-page --block framework-gaps --offset 0 --limit 50
pi-context update --dryRun
```

## Input affordances

On top of the schema-derived flags, the CLI accepts a set of input conveniences. Each is additive — the schema-exact form (camelCase flags, explicit `--arrayKey`, a JSON `--writer`, separate `--field`/`--op`/`--value`) keeps working unchanged.

- **kebab-case flags** are accepted alongside the camelCase op-schema keys. `--dry-run` resolves to `--dryRun`; any conventional kebab form resolves when its camelCase key exists. An unrecognized flag (kebab or otherwise) is still rejected.
- **`--id` aliases the op's single id-param.** When an op declares exactly one id-shaped parameter (`itemId` / `parentId` / `taskId` / `unitId` / …), `--id <value>` resolves to it. An op that already declares a literal `id` parameter takes `--id` directly. An op with two id-params (e.g. `complete-task`, `rename-canonical-id`) rejects `--id` as ambiguous — name the explicit flag.
- **`--arrayKey` is derived from config** for the block-mutation ops (`append-block-item`, `update-block-item`, `upsert-block-item`, `remove-block-item`, and the nested variants). Pass only `--block <name>`; the array key is read from that block's `config.block_kinds[].array_key`. An explicit `--arrayKey` overrides the derivation.
- **`--writer kind:id` shorthand.** `--writer human:you@example.com` expands to `{"kind":"human","user":"you@example.com"}`; `--writer agent:claude` to `{"kind":"agent","agent_id":"claude"}` (`monitor:`→`monitor_name`, `workflow:`→`workflow_step_id`). The first colon delimits the kind; the identifier may itself contain colons.
- **`--where field:op:value` shorthand** for the filter predicate: `--where status:eq:done` sets `--field status --op eq --value done`. Split on the first two colons only, so the value may contain colons.
- **CSV `--op in`.** When the comparison operator is `in`, a comma-separated `--value a,b,c` is split into the array `["a","b","c"]`. Order-independent — `--op in --value a,b,c` and `--value a,b,c --op in` are equivalent.

```bash
pi-context append-block-item --block framework-gaps --item @gap.json        # arrayKey derived from config
pi-context find-references --id TASK-1                                       # --id → itemId
pi-context append-block-item --block tasks --item @t.json --writer human:you@example.com
pi-context filter-block-items --block tasks --where status:eq:done          # field/op/value from one token
pi-context filter-block-items --block tasks --field tag --op in --value a,b,c
```

## Contract preview + dry-run

For the block-mutation ops the CLI offers two pre-write affordances:

- **`--show-schema`** previews a block op's contract and exits before any write — the array key, the required-field set, every field with its type (and enum values when declared), and the id pattern. Pass it with the op and `--block <name>`; no `--item` is needed.
- **`append-block-item --dry-run`** (or `--dryRun`) validates the prospective whole file — `{...existing, <arrayKey>: [...items, newItem]}` against the block schema, exactly what a real append validates — and writes nothing. With `--autoId` it reports the id that would be allocated. The output is `[dry-run] PASS` (or `[dry-run] PASS — would append <id>`); a schema-invalid item surfaces the field-named validation error.

```bash
pi-context append-block-item --block framework-gaps --show-schema     # contract preview, no write
pi-context append-block-item --block tasks --item @t.json --dry-run    # validate the prospective file, no write
pi-context append-block-item --block tasks --item @t.json --dry-run --autoId   # also reports the allocated id
```

## Output rendering

`--format text|json|table` selects how an op's result is rendered. `--json` is the exact alias of `--format json`.

- **`text`** (default) — each op's human render: prose, a JSON.stringify'd value, or a read body with its paging footer.
- **`json`** — the `{ ok, op, output }` envelope (`{ ok: false, op, error }` on failure). `output` is the un-stringified value (single-parse), read-capped at 50KB.
- **`table`** — a compact markdown table of a renderable row array (a read whose body is a collection, or a data op that returns an array). The projection is best-effort terse: `id` first when present, then up to three more fields (≤4 columns), cells one-lined and capped at 80 chars. A result that is not a complete tabular collection (prose, a non-array value, or an over-cap read) renders as `text` instead — a degenerate table is never substituted for the real output.

```bash
pi-context read-block --block tasks --format table       # markdown table of the tasks
pi-context filter-block-items --block tasks --where status:eq:open --format table
pi-context read-block --block tasks --json               # ≡ --format json
```

Schema-validation failures surface **field-named guidance** — which field and what constraint (e.g. `` `/gaps/0`: missing required field `description` ``) — rather than the raw validator phrasing, on both the text and `--json` surfaces.

Addressed reads return the **whole addressed subtree** (50KB-capped): `read-schema --schemaName <name> --path <dotted.path>` and `read-config --registry <name> [--id <id>]` return the complete node at that address — including all of its children — not a paged slice of one of its arrays.

## `pi-context pi-bound` — constrained pi session

```bash
pi-context pi-bound [--grant <id>]... [...pi-args]
```

`pi-bound` is a CLI **process mode** (not a substrate op): it launches a `pi` coding-agent session restricted to the composed pi-extension tool surface. On every launch it:

1. runs `pi install -l <@davidorex/pi-project-workflows root>` to register the extensions into the target dir's `.pi/`
2. derives the static tool allowlist from the installed packages' generated `skills/*/SKILL.md` (`@davidorex/pi-context` + `@davidorex/pi-project-workflows`)
3. always adds the built-in read-only tools `read`, `ls`, `grep`, `find`
4. appends the bounded composites declared in the active substrate's `config.tool_operations[]`
5. launches `pi --tools <union> ...pi-args`

It runs from the process cwd and reads that dir's `.pi-context.json` for composites (warns, non-fatally, if absent).

**Flags:**

- `--grant <id>` (repeatable) — scope the bounded composites to only the named ids. Default: all declared composites.
- any other token — passed through verbatim to `pi` (e.g. `--continue` / `-c` to resume a session).

```bash
pi-context pi-bound                          # launch with the full composed tool surface
pi-context pi-bound --grant grep-paths       # restrict composites to a single named op
pi-context pi-bound -c                        # pass -c through to pi to resume
```

This process mode replaces the former `scripts/launch-constrained-pi.sh` launch script.

## `pi-context update` — drift-aware model update + conflict surfacing

```bash
pi-context update [--dryRun]
```

`update` brings the installed schema model current with the packaged catalog. Per installed schema it consults the drift classification and routes by state: an `in-sync` schema is a no-op; a `catalog-ahead` schema re-syncs through the migration-aware path; a `locally-modified` / `both-diverged` schema is reconciled by a deterministic 3-way merge of base (the as-installed schema body in the object store, keyed by the recorded baseline `content_hash`) × ours (the installed schema) × theirs (the catalog schema). Disjoint edits auto-merge so both the user's and the catalog's changes survive (`required` / `enum` / array-valued `type` nodes merge as sets).

A schema whose per-path edits cannot be reconciled is left unmodified, and the conflict is SURFACED to the calling agent — `update` does not spawn a subordinate resolver. The conflict set is returned in the op output (the `conflicts` array, printed under `--json`) alongside a readable per-schema report on the default text surface. The report ends with a guidance line; the calling agent reconciles each conflicting schema and commits the reconciliation with `pi-context resolve-conflict`:

```bash
pi-context read-schema --schemaName <name>     # inspect the current installed body
# resolve the conflicting paths into a reconciled draft-07 schema, then commit it:
pi-context resolve-conflict --schemaName <name> --schema '<reconciled-json>'
```

`resolve-conflict` writes the reconciled body AND advances the merge base for that schema to the catalog, so the next `update` sees the schema as `locally-modified` and its deterministic merge takes the reconciled body (base === theirs → ours) — converging with zero conflicts and preserving the resolution. A bare `write-schema` does not advance the base, so `update` would re-report the same conflict on every run. Omit `--schema` to treat the current on-disk body as already reconciled and only advance the base.

`update` also additively propagates catalog-new config-registry entries (`relation_types` / `invariants` / `block_kinds` / `lenses`) absent from the substrate config, preserving every user-authored entry and any locally-diverged body of an existing entry (additive-only — present entries are never overwritten; the added ids are reported under `registryAdditions`).

A `catalog-ahead` schema whose resync is refused (`blocked`) carries its diagnostic under `blockedDetail` (one entry per blocked schema): the refusal reason — `no-migration-chain` (no shipped chain reaches the catalog version) vs `validation-failed` (the forward-migrated items fail the catalog schema) — the installed→catalog version pair, and for a validation failure the per-item failures naming the failing item id, field, and constraint. Under `--json` the `blockedDetail` array rides in the op-result envelope; on the default text surface the CLI renders a readable per-schema report below the op output (`blocked: <name> (<from> -> <to>)` then the no-chain line or the per-item failure lines), ending with a guidance line. A live blocked `update` also persists a pending-blocked record pinning the target catalog schema, and — for a `validation-failed` block — writes git-style failure markers INTO the block file at the offending items (full-line `<<<<<<< BLOCKED …` / `>>>>>>> target: …` sentinels), pinning the pre-marker bytes (the schema and `migrations.json` stay byte-unchanged). The resolution loop is: open the block file, fix the items between the markers (or widen the local schema) → `pi-context resolve-blocked --schemaName <name>`, which strips the markers, re-validates the corrected block against the pinned target and, on pass, writes the target schema + advances the merge base so a subsequent `update` converges (in-sync) instead of re-blocking. The standalone `pi-context validate-block-items --block <name> [--basis catalog|installed]` runs a per-item check on demand (read-only, returns `{ block, from?, to?, valid, failures[], resolution }`; `resolution` always names the validated basis): the default basis `catalog` (`resolution: "catalog-forward-preview"`) runs the same catalog-forward preview as the update path, while `--basis installed` (`resolution: "installed-read-path"`) validates against the installed schema + project migration registry — the canonical read path's resolution — returning `valid:false` where a read would throw.

`--dryRun` predicts the precise per-schema outcome (resync / migrate / block / merge / conflict) by running the forward-migration and re-validation in memory, alongside the per-blocked-schema diagnostic detail and the config-registry entries that would be added, and writes nothing.

```bash
pi-context update --dryRun                   # predict the precise per-schema outcome (in-memory migrate + re-validate) + config-registry additions
pi-context update                            # apply: resync + auto-merge; conflicts → surfaced (op output + report) for the caller to reconcile + commit via resolve-conflict
```

## Global flags

- `--cwd <dir>` — substrate root (default: current working directory; relative paths resolve against it)
- `--json` — emit a `{ ok, op, output }` envelope on success (`{ ok: false, op, error }` on failure) instead of raw output (≡ `--format json`)
- `--format <text|json|table>` — select the output render (default `text`, or `json` with `--json`); see [Output rendering](#output-rendering)
- `--yes`, `--force` — pre-authorize an auth-gated op in a non-interactive context
- `--writer <json>` — override the auto-resolved writer identity
- `--show-schema` — preview a block op's contract (array key / required fields / field types / id pattern) and exit; see [Contract preview + dry-run](#contract-preview--dry-run)
- `--dry-run`, `--dryRun` — for `append-block-item`, validate the prospective file and write nothing; see [Contract preview + dry-run](#contract-preview--dry-run)
- `--version`, `-v` — print the package version and exit
- `--help`, `-h` — grouped top-level help (ops by command class + a Process modes section), or per-op help after an op name

## Writer identity

Ops that declare a `writer` parameter (e.g. `promote-item`, `write-schema-migration`) get it injected automatically when not passed via `--writer`. The identity is resolved by cascade: `git config user.email`, then `$USER`, then the literal `"operator"`. Pass `--writer '{"kind":"human","user":"you@example.com"}'` to override.

An explicit `--writer` is validated as a well-formed `WriterIdentity`: it must carry a `kind` of `human` / `agent` / `monitor` / `workflow` **and** that kind's identifier field as a non-empty string (`user` for `human`, `agent_id` for `agent`, `monitor_name` for `monitor`, `workflow_step_id` for `workflow`). A malformed `--writer` is an error — the CLI no longer silently stamps a garbage identity such as `human/undefined`.

The CLI builds a `DispatchContext` from the resolved (or explicit, validated) identity and threads it to every op, so writes stamp `created_by` / `created_at`. Filing through the CLI no longer fails on schemas that require author fields. The context builder is exported as `buildCliDispatchContext`.

## Auth-gated ops

Ops marked `authGated` (writes that mutate config / schemas / migrations) require authorization, mirroring the in-pi dispatch gate:

- `--yes` / `--force` proceeds immediately
- on an interactive terminal you are prompted (`Authorize <op>? [y/N]`)
- in a non-interactive context without `--yes` the op refuses

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | op/runtime error, or declined authorization |
| `2` | usage error (unknown op, unknown flag, missing required field) |
| `3` | schema absent (the block's schema is not installed) |
| `4` | id-allocation failure (`--autoId` could not allocate the next id) |
| `5` | schema validation failure |
