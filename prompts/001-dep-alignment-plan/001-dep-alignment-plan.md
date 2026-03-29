<objective>
Create an implementation plan for aligning the pi-project-workflows monorepo dependency model with the pi-mono pattern.

Purpose: Eliminate peer dependency fragility, enable pi-behavior-monitors to import the block API, and replace wildcard subpath exports with named exports for a stable API contract.
Input: pi-mono pattern analysis, current package.json files, existing cross-package imports
Output: dep-alignment-plan.md with actionable tasks per package
</objective>

<context>
Current monorepo structure: @packages/pi-project/package.json @packages/pi-workflows/package.json @packages/pi-behavior-monitors/package.json @packages/pi-project-workflows/package.json

pi-mono pattern (established best practice):
- Inter-package references use `dependencies`, NOT `peerDependencies`
- Named subpath exports for public API surfaces (e.g. `@mariozechner/pi-ai/oauth`)
- Root exports for primary interface
- Lockstep versioning with sync-versions.js

Current divergences:
- pi-workflows peer-depends on pi-project, pi-coding-agent, pi-tui, typebox
- pi-behavior-monitors peer-depends on pi-ai, pi-coding-agent, pi-tui, typebox — and has NO dependency on pi-project at all
- pi-project has wildcard subpath export `"./src/*.js"` remapping to `"./dist/*.js"` — allows arbitrary deep imports, fragile API contract
- pi-workflows imports 5 different pi-project subpaths: block-api.js, schema-validator.js, block-validation.js, project-dir.js, sync-skills.js
- A peer freshness gate (scripts/check-peer-freshness.js) exists solely to catch version drift from peer deps — would be unnecessary with direct deps

Block API bypass context (why this matters):
- pi-behavior-monitors reads .project/ with raw fs.readFileSync because it can't import block-api.ts
- 56 block API bypass instances across 6 workflows and 2 source files
- This plan is the prerequisite for Plan 2 (block step type) and Plan 3 (judgment step restructuring)
</context>

<planning_requirements>
Thoroughly analyze the dependency graph and produce a plan that:

1. Moves pi SDK packages (@mariozechner/pi-coding-agent, pi-tui, pi-ai, @sinclair/typebox) from peerDependencies to dependencies in all three packages
2. Adds @davidorex/pi-project as a direct dependency of pi-behavior-monitors
3. Replaces the wildcard subpath export in pi-project with named exports covering the actual public API surface:
   - `/block-api` — readBlock, writeBlock, appendToBlock, updateItemInBlock
   - `/schema-validator` — validate, validateFromFile, ValidationError
   - `/block-validation` — snapshotBlockFiles, validateChangedBlocks, rollbackBlockFiles
   - `/project-dir` — PROJECT_DIR, SCHEMAS_DIR
   - `/project-sdk` — projectState, validateProject, schemaVocabulary, etc.
   - `/sync-skills` — syncSkillsToUser
4. Updates all import paths in pi-workflows and pi-behavior-monitors to use named exports
5. Removes the peer freshness gate (scripts/check-peer-freshness.js) and its reference in npm run check
6. Updates CLAUDE.md to remove peer freshness gate documentation
7. Migrates pi-behavior-monitors' raw fs.readFileSync('.project/...') calls to use readBlock from the new dependency

Constraints:
- All existing tests (589) must continue passing
- npm run build, npm run check, npm test must all pass
- The meta-package (pi-project-workflows) dependency structure must remain correct
- Lockstep versioning must continue to work
- pi install -l loading must continue to work

Consider:
- Whether pi-project needs to remain a peer dep of pi-workflows IN ADDITION to being a direct dep (for workspace resolution during development vs npm install resolution for consumers)
- Whether the meta-package's dependency declarations need to change
- Whether biome import sorting will be affected by import path changes
</planning_requirements>

<output_structure>
Save to: `./prompts/001-dep-alignment-plan/dep-alignment-plan.md`

Structure the plan using XML format with phases, tasks, deliverables, and metadata including confidence, dependencies, open questions, and assumptions.

Each phase should be executable by a single subagent in a single session — scope accordingly.
</output_structure>

<summary_requirements>
Create `./prompts/001-dep-alignment-plan/SUMMARY.md`

Include:
- One-liner describing the approach
- Phase breakdown with objectives
- Key decisions needed from human
- Blockers
- Next step (Plan 2: block step type)
</summary_requirements>

<verification>
1. Plan addresses all 7 requirements above
2. Phases are sequential and independently testable
3. Tasks reference specific files with line numbers where possible
4. Migration path for pi-behavior-monitors block API adoption is concrete
5. Metadata captures assumptions about npm resolution behavior
6. Ready for a subagent to execute each phase
</verification>

<efficiency>
For maximum efficiency, read all package.json files and cross-package import sites simultaneously rather than sequentially. The dependency graph is small enough to hold in context.
</efficiency>
