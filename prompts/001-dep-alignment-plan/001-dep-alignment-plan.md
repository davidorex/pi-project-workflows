<objective>
Create a complete implementation plan for aligning the monorepo dependency model with pi-mono patterns. This plan will be executed by a subagent — every task must be specific, every file must be named, every change must be concrete. Zero open questions. Zero alternatives. Zero decisions deferred.
</objective>

<constraints>
These are resolved. Do not revisit, question, or offer alternatives to any of these:

- Version ranges: `"^0.63.1"` for all @mariozechner/* packages, `"^0.34.48"` for @sinclair/typebox, `"^0.8.0"` for @davidorex/pi-project inter-package refs
- Dependencies only. No peerDependencies anywhere. No dual peer+dep pattern. pi-mono pattern.
- Named subpath exports replace the wildcard. Remove the wildcard. No backward compat shim.
- Replace wildcard tsconfig paths with per-subpath mappings. No TypeScript project references.
- Fix the undeclared pi-ai dependency in pi-workflows.
- Minor version bump. No external consumers of unlisted subpaths.
- Remove peer freshness gate entirely (script, check command ref, all CLAUDE.md refs).
- Migrate pi-behavior-monitors raw fs.readFileSync('.project/...') to readBlock.
</constraints>

<context>
Read these files to understand current state:
- packages/pi-project/package.json (exports map, deps, peers)
- packages/pi-workflows/package.json (deps, peers)
- packages/pi-behavior-monitors/package.json (deps, peers)
- packages/pi-project-workflows/package.json (meta-package deps)
- tsconfig.json (paths)
- package.json (root — check script)
- scripts/check-peer-freshness.js (to be deleted)
- CLAUDE.md (freshness gate refs to remove)

Find all cross-package import sites:
- grep for `from "@davidorex/pi-project/` in packages/pi-workflows/src/
- grep for `.project/` reads in packages/pi-behavior-monitors/index.ts
- grep for `@mariozechner/pi-ai` in packages/pi-workflows/src/ (undeclared dep)
</context>

<output_structure>
Save to: `./prompts/001-dep-alignment-plan/dep-alignment-plan.md`
Save summary to: `./prompts/001-dep-alignment-plan/SUMMARY.md`

Structure as phases, each executable by a single subagent session. Every task names the file, the line range, the exact before/after change. No prose alternatives. No "consider" or "recommend" language.

SUMMARY.md has: one-liner, phase table, blockers, next step. No decisions section. No open questions section.
</output_structure>

<verification>
After plan execution:
- `npm run build` passes
- `npm run check` passes (no freshness gate)
- `npm test` — 589+ tests, 0 failures
- `grep -rn 'peerDependencies' packages/*/package.json` returns 0 matches
- `grep -rn 'check-peer-freshness' .` returns 0 matches
- `grep -rn 'from "@davidorex/pi-project/src/' packages/pi-workflows/src/` returns 0 matches
- `grep -rn 'fs.readFileSync.*\.project' packages/pi-behavior-monitors/` returns 0 matches
</verification>
