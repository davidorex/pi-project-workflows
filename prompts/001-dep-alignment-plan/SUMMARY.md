# Dependency Alignment Plan — Summary

**Approach**: Migrate all three packages from peer dependencies to direct dependencies following the pi-mono pattern, replace pi-project's wildcard subpath export with 6 named exports, and use the new dependency relationship to replace raw fs reads in pi-behavior-monitors with the block API.

## Phase Breakdown

| Phase | Objective | Files touched |
|-------|-----------|---------------|
| 1. Named subpath exports | Replace `"./src/*.js"` wildcard with 6 named exports in pi-project | `packages/pi-project/package.json`, `tsconfig.json` |
| 2. Import path migration | Update all 9 import sites in pi-workflows from `src/<mod>.js` to `<mod>` | 6 source + 3 test files in `packages/pi-workflows/src/` |
| 3. Dependency model | Move pi SDK peers to deps in all packages; add pi-project dep to pi-behavior-monitors; add missing pi-ai dep to pi-workflows | 3 package.json files |
| 4. Remove freshness gate | Delete `scripts/check-peer-freshness.js`, update `check` command and CLAUDE.md | `scripts/check-peer-freshness.js`, `package.json`, `CLAUDE.md`, `packages/pi-behavior-monitors/CLAUDE.md` |
| 5. Block API migration | Replace 2 raw fs.readFileSync calls with readBlock in pi-behavior-monitors | `packages/pi-behavior-monitors/index.ts` |
| 6. Cleanup and release | Full verification, commit, `npm run release:minor` | all |

## Blockers

None.

## Pre-existing Bug Found

pi-workflows imports `@mariozechner/pi-ai` in `step-monitor.ts` (both type and value imports: `complete`, `StringEnum`) but does not declare it in package.json at all — not even as a peer dep. This works only because npm workspace hoisting makes it available from pi-behavior-monitors' peer deps. Phase 3 fixes this.

## Next Step

Plan 2: Block step type — a new workflow step type that reads/writes `.project/` blocks, enabled by the pi-project dependency that this plan adds to pi-behavior-monitors.
