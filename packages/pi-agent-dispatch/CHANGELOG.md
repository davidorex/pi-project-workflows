# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). This package has not yet been published to npm; the accumulated surface below — from its scaffold (`a1d8072`, 2026-05-28) onward — sits under `[Unreleased]` and becomes its first published version's section at first publish.

## [Unreleased]

### Changed
- The auth-gate's canonical authorization-required set now includes `resolve-blocked` (the `pi-context` blocked-resolution commit op): invoking it requires user authorization at the pi-dispatch auth-gate (interactive confirm, or `--yes`/`--force` on the CLI). Membership is derived from the op-registries' `authGated` flags, so the set picked it up automatically; the canonical-membership pin test is extended to 19 names to track the derived set.
- Extended the `AUTH_REQUIRED_TOOLS` canonical-membership pin test to 18 names, adding `resolve-conflict`. The runtime `AUTH_REQUIRED_TOOLS` set is derived from the op-registries' `authGated` flags and already carries `resolve-conflict` (the `pi-context` reconciliation-commit op); the deliberate canon-drift assertion is updated to match the derived set (the gate's purpose is to surface membership drift as a test failure, so the explicit list tracks the derived one).

## [0.30.0] - 2026-06-04

## [0.29.0] - 2026-06-04

## [0.28.1] - 2026-06-03

## [0.28.0] - 2026-06-03

### Added
- Extension scaffold: operation-vocab + capability-composer; `author-agent-spec`, `call-agent`, and `run-real-checks` Pi tools with their dispatch/enforcement wiring (`a1d8072`, `5b84aff`, `8532c44`, `d568980`, `b0f4983`, `e1a64bd`, `c2d50e1`)
- `commit-attested` Pi tool with `attested-commit` (writer.kind=agent attestation, husky-as-backup) (`d3df262`, `bbf7179`)
- Bounded composite-capability vocabulary: `read-files`, `git-log`, `grep-paths`, and `command-allowlist` composite KIND libraries; `FORBIDDEN_WHOLESALE_OPERATIONS` L1 invariant; composite-loader registering dynamic Pi tools from `config.tool_operations[]`; `author-tool-grant` Pi tool with L1∪L5 forbidden-operation enforcement and an L3 runtime guard (`e2fffc0`, `0afa1b4`, `98b382a`, `69ca081`, `e1ad57b`, `30ccfc0`, `ed9f66f`, `0256323`)
- `run-work-order-loop` Pi tool over a work-order-loop library (bounded iteration + human-OK gate at the boundary) (`494357a`, `7c94352`)
- `TraceEntry` `extension_load_warning` entry kind + composite-loader config-null observability (`8030c61`)
- Auth-gate: per-tool user-auth library invoked via `pi.on('tool_call')`, wired into the extension factory to intercept Bucket-2 tools regardless of caller-supplied `writer.kind`; verified-identity module (reads git config `user.email` with `USER` env fallback) that mutates `event.input.writer` to the confirmed terminal-operator identity; `context-switch` + `context-archive` added to the auth-required set (`7be299b`, `e6a1799`, `d872fce`, `3bbb555`, `f27aafe`)
- Read-truncation-gate: library plus `pi.on('tool_result')` handler that replaces truncated read content with a structured hard-refusal directive at the pi-dispatch layer (`38ad48e`, `7a09a27`)

### Changed
- Folded auth gating into per-package registry-derived gated-sets (`45dcf66`)
- Renamed the 'human-only' framing to the canonical 'human-authorized via auth-gate confirm' model across docstrings/error-messages; stripped redundant in-body `writer.kind=='human'` checks from three tools now that the auth-gate is the canonical identity check; routed `write-schema-migration` through the auth-gate (`fc67993`, `f939777`, `bbad988`)
- Wholesale rewrite of README + skill-narrative + scrubbed `src/*.ts` description strings (`2422bad`)

### Fixed
- Isolated child git env from inherited `GIT_DIR`/`GIT_*` (hook leak) (`8c3b4cf`)
- Corrected the read-truncation-gate directive logic for the `firstLineExceedsLimit`, `lastLinePartial`, and `truncatedBy='bytes'` `TruncationResult` variants that previously produced operationally-misguiding output (`b20ccd4`)
