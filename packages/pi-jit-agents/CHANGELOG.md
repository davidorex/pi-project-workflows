# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). This package has had two public npm releases (`0.14.6`, `0.26.0`); the entries below are scoped to its published surface (`src/`, `schemas/`, `templates/`), and `[Unreleased]` holds changes since `0.26.0`.

## [Unreleased]

- Existence-gated spec-path resolution now probes the spec directory's PARENT as a second location: a relative `template`/`schema` reference is absolutized against the spec's own directory first and, failing that, against the spec directory's parent (the package-root sibling `schemas/` convention the bundled `agents/`+`schemas/` layout uses), taking the first that exists on disk; a reference that resolves at neither probe is still preserved unchanged as a loader-resolvable name. This lets a bundled spec's relative `output.schema` (e.g. `schemas/investigation-findings.schema.json`, whose file lives in the package-root `schemas/` dir alongside `agents/`) resolve to an absolute on-disk path — an output schema, unlike a template, gets no downstream loader-tier search, so a bare-name schema ref previously reached the phantom-tool validation read as a relative name and failed against the current working directory. Absolute references and `block:` sentinels remain unchanged; spec-adjacent references still absolutize exactly as before.
- Agent-spec path resolution is now existence-gated: a relative `template`/`schema` reference is absolutized against the spec's directory only when a file actually exists at that adjacent location; when it does not, the reference is preserved unchanged as a loader-resolvable name so the Nunjucks `FileSystemLoader` resolves it through the three-tier template search (project → user → bundled). This lets a spec that references a template living in a bundled/builtin tier (e.g. `investigator/task.md`, `analyzers/quality.md`) compile from any working directory instead of being frozen to a nonexistent absolute adjacent path. Absolute references and `block:` sentinels are unchanged; adjacent-file references (the local/project case) still absolutize exactly as before.
- Docblock alignment only (no behavior change): the `createAgentLoader` / `LoadContext` docs now describe the loader's actual first tier — the active substrate dir resolved from the project's `.pi-context.json` pointer via `tryResolveContextDir(cwd)`, plus `/agents`, with the tier omitted when no pointer resolves — replacing the stale `{cwd}/.project/agents/` wording. The D3 statement (`.pi/agents/` is never searched) stands unchanged.

## [0.32.0] - 2026-07-05

## [0.31.0] - 2026-06-13

## [0.30.0] - 2026-06-04

## [0.29.0] - 2026-06-04

## [0.28.1] - 2026-06-03

## [0.28.0] - 2026-06-03

### Added
- Six whole-block delegator macros (`render_decisions`, `render_features`, `render_framework_gaps`, `render_layer_plans`, `render_research`, `render_spec_reviews`) in `shared/macros.md` as thin wrappers over per-item macros (`dce327d`)
- `array_key` column on the `CANONICAL_MACRO_NAMES` registry, surfacing block_kind ≠ data-key divergences (framework-gaps→gaps, layer-plans→plans, spec-reviews→reviews); reader call-sites use the `.macro_name` property (`0fb6149`)
- `TraceEntry` `extension_load_warning` entry kind (`8030c61`)
- Grant-clamp infrastructure: `CompiledAgent.tools` + `DispatchContext.parentGrant`; `spec.tools` threaded through `compileAgent`; `GrantViolationError` clamping child-tools to a subset of the parent grant at the `executeAgent` dispatch boundary (`dee01a5`, `4e9a866`, `a273ab9`)

### Changed
- Relocated the agent-template tree `packages/pi-workflows/templates/` → `packages/pi-jit-agents/templates/` and added a `bundledTemplateDir()` export; consumer call-sites rewired (`d71b48e`)
- Neutralized `.project` references in agent-reachable code strings (`5024158`)
- Stripped development-history citations from `agent-trace.schema.json` (`2f3ef47`)

## [0.26.0] - 2026-05-25

Covers `v0.14.6..v0.26.0` for the package's published surface.

### Added
- `contextBlocks` widened to `(string | ContextBlockRef)[]` for per-item injection; object-form `contextBlocks` wired through `compileAgent`; multi-entry-same-name injection (`9f7eb42`, `4d1fd1d`, `a0c6467`)
- Renderer registry mapping block kinds to per-item Nunjucks macro refs; composition-primitive surface symmetry (three tools, Nunjucks global, macro wiring) (`38fb27e`, `5341b2b`)
- `x-prompt-budget` enforcement primitive + narrative-field annotations on six newer block schemas (`be7a168`)

### Changed
- Context-block delimiters adopt the pi 0.75.x XML-tag convention (`d153877`)
- Migrated consumers to the pi-context `context` vocabulary; retired per-item-macro duplication via shared helpers + a canonical-name registry map (`187c094`, `161bf4e`, `188f351`, `80b6915`)
- Migrated pi-mono peer-deps `@mariozechner/*` → `@earendil-works/*` at `^0.74.0` (`e5ab8ad`)

### Fixed
- `compile.ts` catches `BootstrapNotFoundError` at `projectDir` + `buildIdIndex` call sites (`ba58d78`)
- Empty-prefix guard + cross-block status-vocab check + name-based error catches (`4fb4d1e`)

## [0.14.6] - 2026-04-28

Covers the package from its extraction (`239f718`, 2026-04-12) through its first public release.

### Added
- Initial extraction of `@davidorex/pi-jit-agents`: agent spec compilation (`agent-spec`), agent-trace SDK, and the verdict/agent-trace/trace-config schemas (`239f718`)
- Monitor classify trace capture aligned to canonical pi (`1bc36ba`)

### Changed
- Bumped pi-mono `0.63.1` → `0.70.2`; migrated TypeBox v0.34 → v1.x via a hybrid import strategy (`11a4069`)

### Fixed
- Provider-aware `toolChoice` normalization at the execute boundary (`ce37772`)
