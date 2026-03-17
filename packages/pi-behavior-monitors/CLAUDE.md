# CLAUDE.md

## Project

Pi extension that adds behavior monitors — autonomous watchdogs that classify agent activity against JSON pattern libraries and steer corrections or write structured findings.

## Structure

- `index.ts` — extension entry point (single file)
- `examples/` — bundled monitor JSON files (seeded into `.pi/monitors/` on first run)
- `schemas/` — JSON schemas for monitor definitions and patterns
- `skills/` — SKILL.md for LLM-assisted monitor creation
- `CHANGELOG.md` — maintained via changelogen

## Commits

Use conventional commits. Prefix determines version bump:

- `feat:` → minor (0.1.0 → 0.2.0)
- `fix:` → patch (0.1.0 → 0.1.1)
- `feat!:` or `BREAKING CHANGE:` → major (0.1.0 → 1.0.0)
- `docs:`, `chore:`, `refactor:`, `test:`, `perf:` → patch (no behavior change)

## Releasing

```bash
npm run release          # auto-detect bump from commits
npm run release:patch    # force patch
npm run release:minor    # force minor
npm run release:major    # force major
npm run release:push     # git push --follow-tags
```

## Publishing to npm

Requires interactive CLI auth — cannot be automated by agents.

```bash
npm login                # authenticate (interactive, one-time per machine)
npm publish              # publish current version
npm pack --dry-run       # preview what would be published (check files whitelist)
```

The `files` field in package.json controls what's included: `index.ts`, `examples/`, `schemas/`, `skills/`, `README.md`, `CHANGELOG.md`. Everything else (`docs/`, `test/`, `.claude/`, etc.) is excluded.

## Dependencies

No runtime dependencies. Peer dependencies on pi's bundled packages (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`).
