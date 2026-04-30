# Changelog

## [1.0.0] - 2026-04-30

### Changed (BREAKING)
- Replaced `initProject` copy-seeder with a two-tier discovery loader, mirroring the post-v0.14.6 monitor loader pattern in pi-behavior-monitors. Bundled schemas and block scaffolds now load directly from `<package>/defaults/` on demand; `.project/*.json` files act as the project-tier override and lazy-materialize on first write. Aligns pi-project with pi-mono's canonical "discovery, not duplication" architecture.
- `readBlock(cwd, name)` falls through: project tier (`<projectRoot>/.project/<name>.json`, walk-up to `.git`) first, bundled tier second. Missing-block error names both attempted paths.
- `appendToBlock` and `updateItemInBlock` lazy-materialize the bundled scaffold into the project tier on first write, preserving non-array sibling fields (e.g. `conformance-reference.json`'s `name`/`scope` siblings of `principles`).
- `writeBlock` always writes to the project tier; the bundled tier is read-only from this package's API.
- Schemas resolve from the bundled tier only. Hand-edits to `.project/schemas/*.schema.json` are silently ignored after this migration. The duplicated `.project/schemas/` directory copied by prior versions of `initProject` is vestigial.
- `availableBlocks(cwd)` returns the union of project and bundled tiers (deduped by name, project tier wins). New `discoverBlocks(cwd)` returns `{ blocks, overrides }` where `overrides` audits same-name shadowing across tiers (parallel to `MonitorOverride`).
- `availableSchemas(cwd)`, `findAppendableBlocks(cwd)`, `schemaInfo(cwd, name)`, `schemaVocabulary(cwd)` all enumerate from the bundled tier only.

### Removed (BREAKING)
- `/project init` slash subcommand — no longer needed; bundled defaults serve transparently on first read. Existing `.project/` directories continue to work as the project tier.
- `project-init` tool — same.
- `initProject(cwd)` internal function (was not part of the public API).

### Fixed
- Concurrent first-append race in `withBlockLock`. Prior behavior: the file-existence guard skipped locking when the target didn't exist, so two concurrent appends on a fresh project both read tier-2's empty array and wrote tier-1, with the second write clobbering the first. New behavior: the parent directory is created eagerly and `proper-lockfile` acquires a placeholder lock with `realpath: false`, serializing the read-modify-write sequence regardless of file existence.

### Added
- New `BlockOverride` type and `discoverBlocks(cwd)` SDK function for tier-aware enumeration.
- Six new tests covering tier-2 fall-through, tier-1 wins, missing-both-tier error, lazy materialization, project-tier-only writes, and the concurrency fix.

## [0.3.0] - 2026-03-18

## [0.2.0] - 2026-03-17

### Added
- `/project init` command to scaffold `.project/` directory with default schemas and empty block files
- Update check on session start for `@davidorex/pi-project-workflows` meta-package
- Monorepo integration as workspace package

## [0.1.0] - 2026-03-14

### Added
- Block CRUD: `readBlock`, `writeBlock`, `appendToBlock`, `updateItemInBlock` with atomic writes (tmp + rename)
- Write-time schema validation via AJV against `.project/schemas/*.schema.json`
- `ValidationError` class with structured error reporting
- Post-step block validation: `snapshotBlockFiles`, `validateChangedBlocks`, `rollbackBlockFiles`
- Derived project state: `projectState(cwd)` computes all metrics dynamically (source files, tests, phases, block summaries, agents, workflows, schemas, templates, recent commits)
- Block discovery: `availableBlocks(cwd)`, `availableSchemas(cwd)`, `findAppendableBlocks(cwd)`
- Generic block tools: `append-block-item` and `update-block-item` (work with any user-defined block type)
- `/project` command with `status` and `add-work` subcommands
- `PROJECT_DIR` and `SCHEMAS_DIR` constants as single source of truth for `.project/` path
