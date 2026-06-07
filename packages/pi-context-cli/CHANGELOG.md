# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). First published to npm at `0.28.0` (lockstep with the monorepo); `[Unreleased]` holds changes since the last publish.

## [Unreleased]

### Added
- `pi-context update` now routes the irreconcilable 3-way-merge conflicts it surfaces (`UpdateResult.conflicts`) to a resolver. On an interactive TTY (and without `--json`), it dispatches a bounded `pi-bound` mergetool session per conflicting schema — composing a reconcile prompt that embeds the schema name, the typed conflict set, and the BASE/OURS/THEIRS bodies, and instructs the agent to write a reconciled draft-07 schema via `write-schema` (the substrate's own auth-gate confirms the live write); after each session it compares the installed schema's on-disk hash from before vs after to decide whether the agent reconciled it. Non-interactively (piped / `--json`) it instead renders a read-only conflict report to stdout and dispatches nothing. The `update` op's own output is unchanged and still printed first; an `update` run with no conflicts, or any other op, is unaffected. New `resolveConflicts(conflicts, deps)` (`resolve-conflicts`).
- `pi-context pi-bound [--grant <id>]... [...pi flags]` — a CLI process mode that launches an interactive `pi` coding-agent session whose tool surface is constrained to the canonical bounded set: the static tools derived from the installed packages' generated `SKILL.md` files, plus pi's built-in read-only tools (`read`/`ls`/`grep`/`find`), plus the active substrate's declared bounded composites (`config.tool_operations[]`). Repeated `--grant <canonical_id>` scopes the composite surface to a subset (default: all declared); every other token passes through to `pi`. Runs from the target dir; re-derives the full allowlist and runs `pi install -l` on every launch, including `--continue`/`-c` resumes. Replaces the `scripts/launch-constrained-pi.sh` entrypoint.
- `pi-context update [--dryRun]` — a reflected op that brings the installed substrate model toward the current catalog: it consults the per-schema drift classification, resyncs `in-sync`/`catalog-ahead` schemas, and **refuses to overwrite** a `locally-modified`/`both-diverged` schema, reporting it instead (a user's schema edits are never silently clobbered). `--dryRun` previews the per-schema action plan and writes nothing.

### Fixed
- The `update` conflict resolver decides resolved/unresolved by comparing the installed schema's on-disk hash before vs after the mergetool session, not against the recorded baseline. A `both-diverged` schema already differs from its baseline before the session, so the prior baseline comparison reported every schema `resolved` regardless of whether the agent wrote — a no-op session (agent declines / no credentials / errors / operator aborts) silently re-stamped the local edit as the new baseline and swallowed the conflict. Now an unchanged on-disk body is recorded `unresolved` with the baseline left untouched, so the schema stays `both-diverged` for later reconciliation.
- `pi-bound` pre-launch setup-step failures now abort before the `pi` launch with an attributed `pi-context pi-bound: …` stderr line and a deterministic exit code, restoring the `set -e` parity of the `scripts/launch-constrained-pi.sh` entrypoint it ports: a non-resolvable package returns 1 (was a raw `Cannot find module` throw surfaced as a generic error); a non-zero `pi install -l` exit propagates the install's own code and aborts (was discarded, proceeding to a broken launch); a `pi install`/launch spawn failure (pi un-runnable) returns 1 (was a bare reject). The success path still returns the launch's exit code unchanged.

## [0.30.0] - 2026-06-04

### Added
- The `--json` envelope `output` is now bounded at the 50KB read cap via pi-context's `boundedJsonOutput`: an over-cap `{json}` (or prose) op result fails closed (`{ data: null, truncated: true, totalBytes, complete: false }`, mirroring a `{read}` over-cap) instead of leaking substrate content past the cap; the default text surface is likewise bounded (no-payload REFUSAL). `resolve-item-by-id` now emits a structured `{read}` value under `--json`. Closes the `{json}` channel's cap-bypass.
- The cli builds a `DispatchContext` from the resolved operator identity (or an explicit, now-validated `--writer`) and threads it to every op, so cli writes stamp `created_by`/`created_at` — substrate filing through the cli no longer fails on schemas that require author fields. New exported `buildCliDispatchContext`.

### Fixed
- A malformed `--writer` (well-formed-`WriterIdentity` validation: `kind` + the kind's identifier field) now errors instead of silently stamping a garbage identity such as `human/undefined`
- `--json` envelope no longer double-encodes data-op output: `output` is now emitted as a real JSON value (a data op's raw value, or a read op's structured `ReadStructured` with `data`/`truncated`/`hasMore`/`total`/`complete`) parseable in a single `JSON.parse`, instead of a stringified JSON string. Riding pi-context's new structured `OpResult`; the default (non-`--json`) text surface is byte-identical, routed through the shared `renderOpResultText`. Prose ops' `output` remains a string.

## [0.29.0] - 2026-06-04

## [0.28.1] - 2026-06-03

### Fixed
- CLI bin now runs unconditionally from a dedicated `bin.js`; the prior `import.meta.url === argv[1]` entrypoint guard silently no-op'd under symlinked invocation (npm `.bin`, `npx`, global install, macOS `/tmp`). `cli.ts` is now an importable library; the bin is the canonical unconditional ESM entrypoint.

## [0.28.0] - 2026-06-03

### Added
- Runtime-reflecting CLI over pi-context's op-registry: the command surface is derived from the registered operations rather than hand-maintained (`b0a831e`)

### Fixed
- String-enum union flags derive as strings rather than JSON (DEFECT-1) (`37f3f31`)
