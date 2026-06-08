# @davidorex/pi-context-cli

A command-line interface over the [`@davidorex/pi-context`](https://github.com/davidorex/pi-project-workflows/tree/main/packages/pi-context) substrate operations.

The command set is **auto-tracking**: every operation in pi-context's op-registry whose `surface` is `"use"` surfaces as a CLI command by reflection. There is no hardcoded command list — adding an op to pi-context makes a new CLI command appear with zero changes to this package. Operations that depend on a pi runtime handle (e.g. `list-tools`) carry `surface: "process"` and are not surfaced here.

## Install

```bash
npm i -g @davidorex/pi-context-cli
```

This provides a `pi-context` binary.

## Usage

```bash
pi-context --help                 # list every surfaced op + global flags
pi-context <op> --help            # per-op help: declared flags with TYPE tags
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

`--dryRun` previews the per-schema action plan (resync / merge / conflict) and the config-registry entries that would be added, and writes nothing.

```bash
pi-context update --dryRun                   # preview the per-schema action plan + config-registry additions
pi-context update                            # apply: resync + auto-merge; conflicts → surfaced (op output + report) for the caller to reconcile + commit via resolve-conflict
```

## Global flags

- `--cwd <dir>` — substrate root (default: current working directory; relative paths resolve against it)
- `--json` — emit a `{ ok, op, output }` envelope on success (`{ ok: false, op, error }` on failure) instead of raw output
- `--yes`, `--force` — pre-authorize an auth-gated op in a non-interactive context
- `--writer <json>` — override the auto-resolved writer identity
- `--help`, `-h` — top-level help, or per-op help after an op name

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

- `0` — success
- `1` — op/runtime error, or declined authorization
- `2` — usage error (unknown op, unknown flag, missing required field)
