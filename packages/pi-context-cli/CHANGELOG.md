# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). First published to npm at `0.28.0` (lockstep with the monorepo); `[Unreleased]` holds changes since the last publish.

## [Unreleased]

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
