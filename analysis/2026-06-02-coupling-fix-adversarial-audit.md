# Adversarial audit — substrate-coupling fix (range e2f2d92..51ad8cd)

Fresh-context adversarial verification of the coupling-fix arc on branch `context-jit-spec-v2`.
All evidence below is first-hand (git/grep/tsx/test runs), not relayed from commit messages.

## Per-claim verdicts

### Claim 1 — schema-id-patterns.test.ts decoupled + right-reason — CONFIRMED
- Read path: `SCHEMAS_DIR = path.resolve(__dirname, "..", "samples", "schemas")` (schema-id-patterns.test.ts:31, after e40544a). The prior `REPO_ROOT`/`.project/schemas` lines are gone (`grep "REPO_ROOT" schema-id-patterns.test.ts` → no match).
- Run: `npx tsx --test packages/pi-context/src/schema-id-patterns.test.ts` → 22 pass / 0 fail.
- Right-reason on positives: each `accepts <ID>` test validates a `makeItem(validId)` against the real samples schema via `validateFromFile`; it passes because the fixture conforms (samples schemas declare `additionalProperties:false`, and e40544a trimmed `stories`/`findings` so only required fields remain).
- Right-reason on negatives: the `rejects <ID>` assertion (lines 188-197) requires the thrown `ValidationError` to contain an error with `keyword === "pattern"` AND `instancePath` ending in `/id`. A failure from a missing required field (keyword `required`) would NOT satisfy this — the assertion would fail. So the negative cases reject specifically on the id pattern, not vacuously.
- conformance-reference drop loses no canonical coverage: `ls packages/pi-context/samples/schemas/` + per-kind existence check → `project`, `domain`, `architecture`, `conformance-reference` are all ABSENT from samples/schemas. Keeping their cases would crash on a missing schema file. All kinds that exist in samples and carry id-patterns remain in the `CASES` list (tasks/requirements/verification/rationale/spec-reviews/features/layer-plans/issues/research).
- No vacuous pass found.

### Claim 2 — macros.test.ts decoupled — CONFIRMED (with a LOW cosmetic finding, see findings table)
- Read path: `PROJECT_DIR = path.resolve(__dirname, "..", "test-fixtures", "blocks")` (macros.test.ts:43). No repo-root `.project` read (`grep "REPO_ROOT\|process.cwd\|../../../project" macros.test.ts` → none).
- Run: `npx tsx --test packages/pi-jit-agents/src/macros.test.ts` → 6 pass / 0 fail.
- Fixtures present: `ls test-fixtures/blocks/` → decisions/features/framework-gaps/layer-plans/research/spec-reviews .json (6 files).
- Non-vacuous: `assertLens4` checks (a) non-empty, (b) display-name header present, (c) first-item id present, (d) no `[object Object]`, (e) no Nunjucks-emitted-undefined signatures. Each test also asserts the array is non-empty before rendering. Inspected fixtures (decisions/layer-plans/spec-reviews) carry the fields the delegators render (title/status/context/decision; nested layers+migration_phases; target/status) — no `[object Object]`/`undefined`.

### Claim 3 — scanner exemption minimal + NOT over-broad — CONFIRMED
- Diff (51ad8cd): `isItemsFile` adds exactly one OR clause `norm.includes("/test-fixtures/blocks/")` (citation-rot-scanner.ts:303). Nothing else in the function changed.
- The exemption is doubly-gated. In `visitJsonNode` (line 323): `if (parentKey === "id" && isItemsFile(file)) return;`. The path-match alone does NOT exempt — the value must also be a top-level `id` field.
- Independent runtime probe (not the project's own test): a `test-fixtures/blocks/decisions.json` with `{id:"DEC-0001", description:"This supersedes DEC-0099 and closes FGAP-042"}` → `id` DEC-0001 carved out; `DEC-0099` and `FGAP-042` in the `description` field STILL flagged (surface `json-string-value`, path `decisions[0].description`). The exemption does not leak to citation-bearing fields even inside an exempted path.
- Run: `npx tsx --test citation-rot-scanner.test.ts` → 18 pass / 0 fail; the two new assertions (item-id-under-test-fixtures not flagged; citation-in-non-item-data still flagged) pass.
- Over-broad path reasoning: `/test-fixtures/blocks/` is a path-precise substring requiring both the `test-fixtures` and `blocks` segments adjacent. It could match any package's `test-fixtures/blocks/` — which is the intent (per-package fixture block-data). It cannot match a prose/source path that lacks that exact two-segment sequence. No leak found.

### Claim 4 — dodge fully removed — CONFIRMED
- `find packages -path '*test-fixtures/samples*'` → no results; `test -d test-fixtures/samples` → GONE.
- `grep -rn "test-fixtures/samples/blocks"` repo-wide (excluding node_modules/.project/.context) → zero hits.
- macros.test.ts comment (lines 34-41) now truthfully states fixtures live at `test-fixtures/blocks/` and the scanner exempts them via `isItemsFile`, "not a path-name trick." The dodge-admitting text is gone.
- Note: `git show --stat e2f2d92..HEAD` lists both `test-fixtures/samples/blocks/*` (created in 42cc4f4) and `test-fixtures/blocks/*` (final) because the range spans creation+relocation; the NET working-tree state has only `test-fixtures/blocks/`.

### Claim 5 — wire-active-substrate.ts repoint — CONFIRMED
- `grep "project-migrate" wire-active-substrate.ts` → zero matches. All reads (config.json path line 159, three exit-3 error strings, registerSubstrate arg line 188, docstrings) name `.project`. Reasoned from code (not run, per instruction); it is idempotent registry tooling.

### Claim 6 — smuggled lint-fix reverted cleanly — CONFIRMED
- `git diff 42cc4f4~1 HEAD -- scripts/orchestrator/runtime-demo-context-switch.ts` → EMPTY. The file is byte-identical to its pre-42cc4f4 state (the `tryResolveContextDir` unused import restored).
- The revert touched only that one file; macros.test.ts + the 6 fixtures live in pi-jit-agents and are untouched by 24c2fa2 (the commit's `--stat` shows exactly one file, 7 insertions).

### Claim 7 — class closure re-enumeration to zero — CONFIRMED
Enumerated all repo-root-resolving reads in framework tests + scripts:
- `grep "REPO_ROOT\s*=" packages/*/src/*.test.ts` → only `structured-endpoints.test.ts:49`.
- `grep 'resolve(__dirname,"..","..","..")'`-style → only `samples-catalog.test.ts:185`.
- `grep "process.cwd()" *.test.ts | project` → none.
- schema-id-patterns + macros no longer resolve to repo root (confirmed in claims 1-2).

The two remaining repo-root reads are intentional-robust, NOT the closed coupling class:
1. `structured-endpoints.test.ts:329` reads `REPO_ROOT/.context-jit-spec-v2/relations.json` (the ACTIVE per-arc substrate, not `.project`) and is graceful: `if (!fs.existsSync(p)) return;` (line 330). Tolerates absence.
2. `samples-catalog.test.ts:185` is the citation-rot regression scanning the real monorepo `packages/*` SOURCE (not a substrate). This is the load-bearing cross-check for claim 3: the real `packages/pi-jit-agents` now contains the 6 fixtures with `DEC-0001`/`FEAT-001`/etc ids under `test-fixtures/blocks/`. Run → `citation-rot regression ... pass`, zero hits. Had the scanner exemption been wrong, this real-path scan would FAIL. It demonstrates the fix in the production scan path, not just a synthetic test.

All `.project` references in other tests are `join(tmpDir, ".project")` tmpDir-factory creations (composite-loader / block-tools / substrate-index etc.) — each test creates its own substrate; none reads a repo-root live substrate. No missed coupling found.

### Claim 8 — no framework runtime regression + rename intact — CONFIRMED
- Touched-file set across the range (net): citation-rot-scanner.ts (+test), schema-id-patterns.test.ts, macros.test.ts, 6 test-fixtures/blocks/*.json, wire-active-substrate.ts, runtime-demo-context-switch.ts.
- `citation-rot-scanner.ts` is NOT runtime extension surface: not exported from `index.ts`, not in package.json exports, not a `registerTool`, referenced only by itself + tests. Pi does not load it. The 6-char change carries no runtime regression risk.
- Full suites: pi-context 980 pass / 0 fail; pi-jit-agents 167 pass / 1 skipped / 0 fail.
- Rename intact + uncommitted: `.project/config.json` `substrate_id: sub-0c813fd84348d4c2`; `.project-archived/` present; registry maps `sub-0c813fd84348d4c2 → .project` (alias `project`); `git status` shows `.project-migrate/*` deleted + `.project/*` untracked.
- No leak: `git show --stat e2f2d92..HEAD --name-only | grep '^.project|^.pi-context|project-migrate|project-archived'` → EMPTY. No rename/substrate file in any coupling-fix commit.

## Findings

| Severity | Description | Evidence |
|---|---|---|
| LOW | macros.test.ts test names + header docstring still describe reading the live substrate ("real `.project/decisions.json`", "real substrate", header lines 4-5 "real `.project/<file>.json` data for this repo"), contradicting the actual fixture read (line 43 `test-fixtures/blocks/`) and the corrected comment at lines 21-24/34-41 of the same file. Test names/docstring are stale; the code is correct. No behavioral impact — assertions run against the fixture — but the names misrepresent what the test reads and the docstring internally contradicts itself. | macros.test.ts lines 4-5, 21-24, 86-132 vs line 43 |

No CRITICAL, HIGH, or MEDIUM findings. No vacuous pass, no over-broad scanner exemption, no remaining fragile live-substrate coupling, no leaked rename file.

## Overall verdict

CONFIRMED. The coupling class (framework tests/scripts reading the live repo-root `.project` as a stable source) is closed: schema-id-patterns reads `samples/schemas`, macros reads `test-fixtures/blocks`, wire-active-substrate reads `.project` (no `.project-migrate`). The scanner exemption is minimal and double-gated (`parentKey==="id"` AND path), independently verified non-over-broad by runtime probe AND by the real monorepo citation-rot regression passing. The dodge path is fully removed. The smuggled lint-fix revert is byte-clean. The rename is intact and uncommitted; no coupling-fix commit leaked a substrate/rename file. The only finding is a LOW cosmetic stale-naming/docstring contradiction in macros.test.ts with no behavioral impact.
