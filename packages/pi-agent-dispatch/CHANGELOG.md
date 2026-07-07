# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). This package has not yet been published to npm; the accumulated surface below — from its scaffold (`a1d8072`, 2026-05-28) onward — sits under `[Unreleased]` and becomes its first published version's section at first publish.

## [Unreleased]

- Agent resolution for `call-agent` and `run-work-order-loop` now carries a builtin tier: both dispatch loaders supply pi-workflows' bundled `agents/` directory as the LAST search tier (via the new `dispatchLoadContext(cwd)` helper in `dispatch-loader.ts`, consuming pi-workflows' new `./bundled-dirs` subpath export), so a fresh substrate with no local specs can dispatch the bundled set (e.g. `investigator`) out of the box. Resolution order is unchanged ahead of it — the active substrate's `agents/` dir, then the user tier (`~/.pi/agent/agents/`), then the bundled specs — so a local or user spec of the same name still wins. pi-behavior-monitors' classifier specs are deliberately not on this path (monitor-scoped via that package's own loader).
- The work-order loop now clamps the dispatched agent's tool grant to the work-order's declared `scope.operations`: after composing the grant (`agentGrant ∩ spec.tools`) the loop intersects it with `scope.operations`, and that clamped set becomes the subprocess `--tools` allowlist — so the dispatched agent can never exceed the operations the work-order itself authorizes, regardless of the caller's `agent_grant` (e.g. a caller grant of `[write, bash]` under a work-order `scope.operations` of `[write]` dispatches with `--tools write`; `bash` is dropped). When `scope.operations` is absent or empty the composed grant is passed through unchanged. The loop also now validates the dispatch input (`{ work_order_id }`) against the work-order's declared `input_contract` (an inline JSON Schema, checked via pi-context's canonical AJV validator) before spawning the subprocess; a contract violation throws a descriptive error naming the work-order id, and an absent contract is a no-op pass-through.
- The work-order loop now dispatches its `target_agent` as a `pi` subprocess (`pi --mode json -p <task> --tools <grant> --model <spec>`, the same mechanism workflow steps use) instead of the in-process `executeAgent` primitive. `executeAgent` binds no executable tools — it only passes a phantom output-schema tool — so a dispatched agent granted `[write, bash]` previously received zero tools and could not act, and every work-order requiring a side-effect failed its real-check. The composed capability grant (`agentGrant ∩ spec.tools`, the dispatch-boundary capability clamp) now becomes the subprocess `--tools` allowlist (an empty grant emits `--no-tools`), so a dispatched agent has real, callable tools. Subprocess dispatch (`subprocess-dispatch.ts`, `runPiSubprocess` + testable `buildDispatchArgs`) carries a default timeout with SIGTERM→SIGKILL grace, cancellation-signal support, an `@tmpfile` prompt for long prompts, and a bounded stdout collector; a nonzero exit, timeout, or empty assistant output throws a descriptive error. Verified end to end: a work-order whose agent must write a file completes with the file written and its runtime-demo real-check passing.
- The work-order loop now reports `final_status: "aborted-non-interactive"` when a real-check fails in a non-interactive context (`ctx.hasUI === false`): it checks `ctx.hasUI` before prompting and does not call `ctx.ui.confirm`, so an environment default is no longer mislabeled as `aborted-by-human`. Interactive aborts (a human answering the confirm `false`) still report `aborted-by-human`.

## [0.32.0] - 2026-07-05

- `resolveOperationVocabulary` reads the active substrate's `config.json` through pi-context's migration-aware loader instead of a raw parse: a config whose `schema_version` lags the bundled schema is walked forward through the registered chain before its `tool_operations` overrides apply, so the vocabulary can never diverge from the shape `loadConfig` sees. The fail-safe contract is unchanged — any load failure (absent, unparsable, unresolvable version, invalid) yields `TOOL_OPERATION_DEFAULTS`.
- Removed `context-roadmap-list` from `TOOL_OPERATION_DEFAULTS` — the pi-context op is retired with the roadmap's rework as a derived view (the pi-context contribution to the vocabulary is 39 operations).
- Regenerated `SKILL.md`, restoring the `<events>` section (`tool_call`, `tool_result`) omitted by an earlier partial generation; the generated surface again matches the package's registrations.

## [0.31.0] - 2026-06-13

### Changed
- The auth-gate's canonical authorization-required set now includes `context-install` (the `pi-context` reflected install-ceremony op): invoking it requires user authorization at the pi-dispatch auth-gate (interactive confirm, or `--yes`/`--force` on the CLI). Membership is derived from the op-registries' `authGated` flags, so the set picked it up automatically from the op's `authGated: true`; the canonical-membership pin test is extended to 20 names to track the derived set.
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
