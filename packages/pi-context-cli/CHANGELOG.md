# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). First published to npm at `0.28.0` (lockstep with the monorepo); `[Unreleased]` holds changes since the last publish.

## [Unreleased]

### Added
- The cli builds a `DispatchContext` from the resolved operator identity (or an explicit, now-validated `--writer`) and threads it to every op, so cli writes stamp `created_by`/`created_at` — substrate filing through the cli no longer fails on schemas that require author fields. New exported `buildCliDispatchContext`.

### Fixed
- A malformed `--writer` (well-formed-`WriterIdentity` validation: `kind` + the kind's identifier field) now errors instead of silently stamping a garbage identity such as `human/undefined`

## [0.29.0] - 2026-06-04

## [0.28.1] - 2026-06-03

### Fixed
- CLI bin now runs unconditionally from a dedicated `bin.js`; the prior `import.meta.url === argv[1]` entrypoint guard silently no-op'd under symlinked invocation (npm `.bin`, `npx`, global install, macOS `/tmp`). `cli.ts` is now an importable library; the bin is the canonical unconditional ESM entrypoint.

## [0.28.0] - 2026-06-03

### Added
- Runtime-reflecting CLI over pi-context's op-registry: the command surface is derived from the registered operations rather than hand-maintained (`b0a831e`)

### Fixed
- String-enum union flags derive as strings rather than JSON (DEFECT-1) (`37f3f31`)
