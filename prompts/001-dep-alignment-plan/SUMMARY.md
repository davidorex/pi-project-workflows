# Dependency Alignment Plan: Summary

Migrate from peerDependencies to direct dependencies across all packages, replace wildcard subpath exports with named entries, declare the undeclared pi-ai dep, remove the peer freshness gate, and migrate raw .project/ reads to readBlock.

## Phases

| Phase | Description | Files |
|-------|-------------|-------|
| 1 | Package.json dependency model — peers to deps, declare pi-ai | 3 package.json files |
| 2 | Named subpath exports — replace wildcard in pi-project exports and tsconfig paths | pi-project/package.json, tsconfig.json |
| 3 | Remove peer freshness gate — delete script, update check command, strip all refs | scripts/check-peer-freshness.js, package.json, CLAUDE.md, README.md |
| 4 | Migrate pi-behavior-monitors .project/ reads to readBlock | pi-behavior-monitors/index.ts |
| 5 | Update documentation references | pi-behavior-monitors/CLAUDE.md, README.md |
| 6 | Build, check, test, skills, commit, release (0.8.0 -> 0.9.0 minor) | all |

## Blockers

None. All decisions are resolved in constraints. All version numbers are known. All import sites are enumerated.

## Next Step

Execute this plan. A single subagent session can run all six phases sequentially.
