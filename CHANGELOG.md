# Changelog

All notable changes to this project will be documented in this file.

## v0.1.4

[compare changes](https://github.com/davidorex/pi-behavior-monitors/compare/v0.1.3...v0.1.4)

### 🚀 Enhancements

- Add ui.select menus to /monitors command for TUI discoverability ([4391ca3](https://github.com/davidorex/pi-behavior-monitors/commit/4391ca3))

### 📖 Documentation

- Update SKILL.md with buffered steer delivery and TUI autocomplete ([94aee6e](https://github.com/davidorex/pi-behavior-monitors/commit/94aee6e))

### ❤️ Contributors

- David Ryan <davidryan@gmail.com>

## v0.1.3

[compare changes](https://github.com/davidorex/pi-behavior-monitors/compare/v0.1.2...v0.1.3)

### 🩹 Fixes

- Buffer steer delivery at agent_end to work around pi async event queue ([c899fa5](https://github.com/davidorex/pi-behavior-monitors/commit/c899fa5))

### 📖 Documentation

- Add npm publish commands to CLAUDE.md ([91dbe87](https://github.com/davidorex/pi-behavior-monitors/commit/91dbe87))

### 🏡 Chore

- Scope package name to @davidorex/pi-behavior-monitors ([e9a9882](https://github.com/davidorex/pi-behavior-monitors/commit/e9a9882))

### ❤️ Contributors

- David Ryan <davidryan@gmail.com>

## v0.1.2

[compare changes](https://github.com/davidorex/pi-behavior-monitors/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- Unify monitor management under /monitors command with subcommand routing ([dbffaa0](https://github.com/davidorex/pi-behavior-monitors/commit/dbffaa0))
- Add vitest test suite for pure functions in index.ts ([fed0d75](https://github.com/davidorex/pi-behavior-monitors/commit/fed0d75))

### 🩹 Fixes

- Address conformance audit findings — unused param, session_switch, headless escalate ([f2d3baa](https://github.com/davidorex/pi-behavior-monitors/commit/f2d3baa))

### 🏡 Chore

- Add .claude/ to gitignore, version conformance audit in docs/ ([d6a8395](https://github.com/davidorex/pi-behavior-monitors/commit/d6a8395))

### ❤️ Contributors

- David Ryan <davidryan@gmail.com>

## v0.1.1

[compare changes](https://github.com/davidorex/pi-behavior-monitors/compare/v0.1.0...v0.1.1)

### 📖 Documentation

- Add CLAUDE.md with project conventions ([5f5b427](https://github.com/davidorex/pi-behavior-monitors/commit/5f5b427))
- Expand SKILL.md to cover full runtime behavior and bundled monitors ([5c9980d](https://github.com/davidorex/pi-behavior-monitors/commit/5c9980d))

### 🏡 Chore

- Add npm publish metadata, files whitelist, and normalize repository URL ([4b3f1f4](https://github.com/davidorex/pi-behavior-monitors/commit/4b3f1f4))
- Add .gitignore, remove runtime .workflow/ from tracking ([c1d4ae5](https://github.com/davidorex/pi-behavior-monitors/commit/c1d4ae5))

### ❤️ Contributors

- David Ryan <davidryan@gmail.com>

## v0.1.0

Initial release.

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
