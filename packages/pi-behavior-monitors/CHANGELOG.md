# Changelog

All notable changes to `@davidorex/pi-behavior-monitors` are documented here, per published npm version (newest first). Format follows [Keep a Changelog](https://keepachangelog.com/). Entries are grounded in the git commits that touched the package's published surface (`index.ts`, `examples/`, `agents/`, `schemas/`, `skills/`); substrate-only, test-only, and tooling-only commits are excluded. Commits made at tags that were never published to npm are rolled forward into the next published version.

## [Unreleased]

## [0.29.0] - 2026-06-04

## [0.28.1] - 2026-06-03

## [0.28.0] - 2026-06-03

### Changed
- Agent-reachable code strings (`index.ts`) no longer reference the legacy `.project` substrate directory name; references neutralized so monitor code does not surface that name to agents (`5024158`).
- Regenerated `skills/.../SKILL.md` to reflect the source neutralization above (`b4bbef9`).
- `schemas/monitor.schema.json` `action.write.block` description no longer cites an internal tracking ID (`7351735`).

## [0.26.0] - 2026-05-25

### Changed
- Monitor write-action routes through the pi-context block-api: a new `upsertItemInBlock` primitive replaces the prior direct write path, and bundled monitors were migrated to emit through it (`523fa96`).
- Block-api validated write surface generalized to `(filePath, schemaPath)` pairs; monitor side-car state writes route through the new typed-file primitives (`2160c63`).
- Cross-block ID resolver lifted out of project validation, affecting the resolution path monitors rely on (`b3734aa`).

### Fixed
- Peer dependencies migrated from `@mariozechner/*` to `@earendil-works/*` at `^0.74.0`, tracking the upstream pi-coding-agent namespace rename (`e5ab8ad`).
- Internal package rename pi-project → pi-context applied in lockstep at 0.25.0; monitor imports updated accordingly (`6eb5e8b`).

## [0.14.6] - 2026-04-28

### Changed
- Monitor discovery uses a three-tier multi-location loader (project `.pi/monitors/` > global `~/.pi/agent/monitors/` > bundled `<package>/examples/`) instead of the prior copy-on-first-run `seedExamples()` pattern. Bundled monitor changes now propagate to all installations automatically because the bundled tier reads the package examples directly. First match by `monitor.name` wins; same-name shadowing across tiers logs a one-line warning at session_start so drift is visible (`f10e8bb`).
- Existing files in `.pi/monitors/` continue to work as project-level overrides under the new model. To receive bundled-monitor updates, delete the per-monitor files in `.pi/monitors/`. The override warning at session_start identifies which monitors are currently shadowed and where the bundled version lives (`f10e8bb`).
- `fragility` and `hedge` classifiers route through the `agent_end` event (`affe992`).
- `collectAssistantText` walks back to the user-message boundary, aggregating all assistant text in the turn (`0b50241`).
- Classifier agents route through OpenRouter to resolve auth-failure spam emitted on every pi turn (`7edf3a2`).
- pi-mono bumped 0.63.1 → 0.70.2; TypeBox migrated v0.34 → v1.x via a hybrid import strategy (`11a4069`).

### Added
- Monitor classify trace capture, aligned with canonical pi (`1bc36ba`).
- Provider-aware `toolChoice` normalization applied at the agent-execute boundary (`ce37772`).

### Removed
- `seedExamples()` and the seeded-count notification — bundled monitors are no longer copied into user `.pi/monitors/` directories at first run (`f10e8bb`).
- `resolveProjectMonitorsDir` export — replaced internally by a private `findProjectMonitorsDir(): string | null` helper that returns null instead of synthesizing a cwd-rooted fallback path (`f10e8bb`).
- Internal `copyDirRecursive` helper — `scripts/generate-skills.js` retains its own private copy (`f10e8bb`).

## [0.14.4] - 2026-04-07

### Fixed
- Thinking disabled on classify calls — the Anthropic API rejects thinking combined with forced `toolChoice` (`e9d9457`).
- `errorMessage` included in classify diagnostics — API errors were previously invisible (`5dba094`).

## [0.14.2] - 2026-04-06

### Fixed
- Classify `maxTokens` increased to 1024 and diagnostic info added to tool-call failures (`bd82bae`).

## [0.14.1] - 2026-04-06

### Added
- Structured output for monitor classify enforced via tool-use (`2f846d3`).
- Monitor classify unified with the agent-spec infrastructure (`bff9c5a`).

### Fixed
- Classifier agent model IDs updated to `claude-sonnet-4-6` for adaptive-thinking + tool-use compatibility (`fa45bf6`).
- `extractResponseText` reads `ThinkingContent.thinking` rather than `.text`, which had always returned empty (`fd02c15`).
- Verdict schema enforced, classify infrastructure cached, legacy path removed, and the discovery walk fixed (`76c5a02`).

## [0.13.0] - 2026-04-06

### Added
- `conversation_history` collector with an adaptive window (`8aa7b4a`).

### Fixed
- Thinking re-enabled on classify and an error verdict emitted on parse failures (`e23daee`).

## [0.12.0] - 2026-04-06

### Changed
- Lockstep version bump; no published-surface change in this package for this release.

## [0.11.3] - 2026-04-04

### Changed
- Lockstep version bump; no published-surface change in this package for this release.

## [0.11.0] - 2026-04-04

### Changed
- Lockstep version bump; no published-surface change in this package for this release.

## [0.10.5] - 2026-04-02

### Fixed
- `EXAMPLES_DIR` path resolution corrected — `dist/examples/` does not exist; examples sit as a sibling of `dist/` (`cab2674`).

## [0.10.3] - 2026-04-02

### Fixed
- Fragility monitor adds `user_text` context and issue-logging-intent recognition (`cd6e6b2`).

## [0.10.2] - 2026-04-02

### Fixed
- Fragility removed from the hedge monitor's excludes — orthogonal monitors should not suppress each other (`5591004`).

## [0.10.1] - 2026-04-02

### Removed
- Redundant `syncSkillsToUser` skill seeding removed to eliminate pi skill collisions (`a6925c6`).

## [0.10.0] - 2026-04-02

### Added
- Tool-call blocking, explicit template syntax, and workflow-YAML alignment (`86ab934`).

### Changed
- `gaps` block renamed to `issues` with a new schema carrying `title`/`body`/`location`/`package` fields (`982f638`); SKILL.md regenerated after the rename (`0fdc250`).

### Fixed
- Three catalogued gaps addressed — monitor post-hoc note, stale project block, `readBlock` filter (`4b290bf`).
- 17 issues resolved across batches 1A/2A/3B/4A — template alignment, monitor safety, executor guards, test coverage (`14eb7c2`).

## [0.9.2] - 2026-03-31

### Changed
- Bundled steer messages updated to use Nunjucks template syntax (`c6da122`); steer messages template-rendered through Nunjucks before injection (`e7774ea`).
- Fragility and commit-hygiene classify templates gain `user_text` context and a shared partial; inline prompts removed (`7e2a813`, `6c2c386`).
- A shared iteration-grace Nunjucks partial created for monitor templates (`aeae6f4`); duplicated iteration-grace blocks replaced across hedge, work-quality, and unauthorized-action (`b7d345d`).

### Removed
- Inline prompt fallback removed from hedge and work-quality monitors (`6d156b8`).

## [0.9.1] - 2026-03-31

### Fixed
- `steeredThisTurn.add()` moved inside the scope gate so excludes fire on delivery (`4380f9d`).
- Classification-failure backoff added to prevent rapid retry loops (`83b0dbd`).
- Warning logged once when `.project/` is not found in collector functions (`331a3ff`).
- Dead `monitors:abort` event subscription and `AbortController` removed (`8c959f7`).
- `seedExamples` copies template subdirectories alongside JSON files (`6d3b322`).
- Severity passed through to `learnPattern` at both call sites (`3f17a6e`); learned patterns deduped by ID with a severity parameter accepted (`7f58dea`).
- Warning logged when `parseVerdict` encounters unrecognized LLM output (`2dc1c7f`).
- `whileCount` reset to 0 on a CLEAN verdict instead of decrementing (`3d69cda`).
- Pattern severity used in `executeWriteAction` instead of a hardcoded `warning` (`46a610d`).
- Warning logged when `evaluateWhen` encounters an unrecognized condition (`bee2091`).
- Monitor system rationalized — five interconnected bug fixes (`7ba2cf1`).

### Changed
- `scope.filter` fields documented as spec-only, not runtime-enforced (`9616397`).

## [0.9.0] - 2026-03-29

### Changed
- Dependency alignment to the pi-mono pattern (`3502a54`).

## [0.6.1] - 2026-03-28

### Changed
- Lockstep version bump; no published-surface change in this package for this release.

## [0.5.0] - 2026-03-28

### Changed
- Lockstep version bump; no published-surface change in this package for this release.

## [0.4.1] - 2026-03-27

### Changed
- CI workflow and husky pre-commit added; biome upgraded to v2.4.9 (`b79ef3a`).

## [0.4.0] - 2026-03-27

### Added
- Extension skills synced to `~/.pi/agent/skills/` on activation (`f828049`).

### Fixed
- `getApiKey(model)` migrated to `getApiKeyAndHeaders(model)` for pi 0.63.1 (`9c2024d`).

## [0.3.4] - 2026-03-27

### Fixed
- Five conformance audit findings addressed across the extension packages (`9e9a4fb`); SKILL.md regenerated afterward (`98b9f87`).

## [0.3.2] - 2026-03-26

### Fixed
- Relative source imports in workflow command steps replaced with package specifiers (`453276b`).

## [0.3.1] - 2026-03-25

### Added
- `invokeMonitor()` export for programmatic monitor classification (`174c572`).
- `unauthorized-action` bundled monitor (`50a4eee`).

### Changed
- Command registration refactored to dispatch tables with dynamic completions and help (`c315006`).
- pi-behavior-monitors integrated as a monorepo subtree (`c44d441`).

### Fixed
- Command-invoked monitors no longer produce no visible output on a CLEAN verdict (`0f9573a`).
- `monitors:abort` no longer kills `agent_end` monitor classifications (`d9f8fdd`).
- Skill generator rewritten for pi-compliant SKILL.md output with YAML frontmatter and XML tags (`77e24e1`).

## [0.3.0] - 2026-03-18

### Added
- Build system with tsc and a tsx test runner; type errors fixed (`1d52c68`).
- Build-time SKILL.md generation from source introspection (`c7257c6`).
- All commands exposed as tools — 14 new tools across three packages (`1f53a28`).
- `commit-hygiene` bundled monitor for uncommitted file changes (`b131ccc`).
- Monitor vocabulary extracted into exported registries for code-derived skill generation (`2c1d63c`).

### Changed
- Monitors brought to declarative parity with workflows and agents (`3299256`).
- Cross-package patterns normalized — error signaling, atomic writes, conventions (`4fe6af5`).
- Biome linting added with initial formatting applied (`58b5ae3`).
- Skill narrative updated with the template system, new collectors, and guided creation workflow (`e950f69`).

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
