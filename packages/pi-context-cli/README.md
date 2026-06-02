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
```

## Global flags

- `--cwd <dir>` — substrate root (default: current working directory; relative paths resolve against it)
- `--json` — emit a `{ ok, op, output }` envelope on success (`{ ok: false, op, error }` on failure) instead of raw output
- `--yes`, `--force` — pre-authorize an auth-gated op in a non-interactive context
- `--writer <json>` — override the auto-resolved writer identity
- `--help`, `-h` — top-level help, or per-op help after an op name

## Writer identity

Ops that declare a `writer` parameter (e.g. `promote-item`, `write-schema-migration`) get it injected automatically when not passed via `--writer`. The identity is resolved by cascade: `git config user.email`, then `$USER`, then the literal `"operator"`. Pass `--writer '{"kind":"human","user":"you@example.com"}'` to override.

## Auth-gated ops

Ops marked `authGated` (writes that mutate config / schemas / migrations) require authorization, mirroring the in-pi dispatch gate:

- `--yes` / `--force` proceeds immediately
- on an interactive terminal you are prompted (`Authorize <op>? [y/N]`)
- in a non-interactive context without `--yes` the op refuses

## Exit codes

- `0` — success
- `1` — op/runtime error, or declined authorization
- `2` — usage error (unknown op, unknown flag, missing required field)
