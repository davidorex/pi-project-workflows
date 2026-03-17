# Changelog

## [Unreleased]

## [0.2.0] - 2026-03-17

### Changed
- Version aligned to 0.2.0 for monorepo lockstep versioning
- Integrated into pi-project-workflows monorepo

### Fixed
- `pendingAgentEndSteers` scoping bug: variable was declared inside export function but referenced in module-level `activate` — added as parameter
- `extractText` parameter type widened for upstream `ThinkingContent` addition to message content arrays
- `MessageEndEvent` import removed (no longer exported from pi-coding-agent main entry)

## [0.1.4] - 2026-03-16

### Added
- UI select menus for `/monitors` command for TUI discoverability

### Changed
- Updated SKILL.md with buffered steer delivery and TUI autocomplete

## [0.1.3] - 2026-03-15

### Fixed
- Buffer steer delivery at agent_end to work around pi async event queue

### Changed
- Scoped package name to `@davidorex/pi-behavior-monitors`

## [0.1.2] - 2026-03-14

### Added
- Unified monitor management under `/monitors` command with subcommand routing
- Vitest test suite for pure functions in index.ts

### Fixed
- Conformance audit findings: unused param, session_switch, headless escalate

## [0.1.1] - 2026-03-13

### Changed
- Expanded SKILL.md to cover full runtime behavior and bundled monitors
- Added npm publish metadata, files whitelist, normalized repository URL

## [0.1.0] - 2026-03-12

### Added
- Monitor extension with event-driven classification (message_end, turn_end, agent_end, command)
- JSON-based monitor definitions (.monitor.json), pattern libraries (.patterns.json), instructions (.instructions.json)
- Side-channel LLM classification with CLEAN/FLAG/NEW verdict protocol
- Auto-learning of new patterns from runtime detection
- Write action for structured JSON findings output
- Scope targeting (main, subagent, all, workflow)
- Bundled monitors: fragility, hedge, work-quality
- Slash commands: /monitors, /<name>, /<name> <instruction>
- Status bar integration showing engaged/dismissed monitors
- Escalation with ceiling + ask/dismiss
- SKILL.md for LLM-assisted monitor creation
- JSON schemas for monitor definitions and patterns
