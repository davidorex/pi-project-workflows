# TASK-113 meaning-gathering: pi-jit-agents internal-tracker-ID comment citations

Scope: packages/pi-jit-agents source (from /tmp/scan-pi-jit-agents.json, 28 raw instances / 11
unique IDs) plus a separate grep of packages/pi-jit-agents/src/*.test.ts for comment-only hits of
the same ID-shape patterns (added 1 unique ID, FEAT-001, plus repeat sites of FGAP-074, FGAP-081,
DEC-0047 already present in source). Total: 12 unique IDs.

Method: each ID was looked up live via `pi-context resolve-item-by-id --id <ID> --json`. Where the
live item's substance was topically disjoint from what the comment claims (or the ID resolved to
nothing at all), the ID was looked up in `.project-archived/*.json` (the frozen predecessor
substrate) instead, and that meaning was used if it matched. No meaning was fabricated; every
replacement is grounded in one lookup or the other. This mirrors TASK-108 (pi-agent-dispatch,
merged) and reuses that session's already-recovered meaning for DEC-0047 (constitutional
capability model: default-empty grants, operation-granular composition, human-only capability
widening) after re-verifying it against this package's own comment sites.

## Replacement-text table

| ID | Status | Plain-English replacement (the substantive engineering point) |
|---|---|---|
| FGAP-074 | unresolvable | No substrate item (live or archived) matches this comment's claim. The comment's own point stands on its own without the ID: the loader's project-tier search path is simply omitted when no substrate bootstrap pointer resolves for the given cwd — the loader still searches the user and builtin tiers and, if nothing is found there either, throws its normal "agent not found" error rather than a "no bootstrap" error. See Notes below for why this ID could not be grounded. |
| issue-023 | stale-archived | This is the trace-capture subsystem: when an agent (in particular a monitor's classify call) runs, nothing about that run — the rendered prompt, the raw LLM response, the resolved context values, the verdict decision — was inspectable when something went wrong. This subsystem exists to fix that: it writes a JSONL trace record of each run so misfires can be inspected after the fact instead of being a black box. |
| DEC-0004 | stale-archived | The trace-entry shape intentionally copies the *conceptual* structure of pi-coding-agent's own session-entry format (a discriminated union keyed by `type`, plus `id`/`parentId`/`timestamp`) so trace data feels familiar and supports the same tree-traversal style of query — but it is NOT literally inherited from pi-coding-agent's type. It is defined independently in this package's own schema, so a future change to pi-coding-agent's session format cannot silently break trace files. |
| DEC-0005 | stale-archived | Trace writing is a one-way "push" — each event is written to the JSONL trace file the instant it happens, inside the agent-execution call itself — rather than the "pull/replay" model pi-coding-agent's own session manager uses (where extensions can only read back session state, never write to it). This divergence is deliberate: monitor/agent trace records are a side-channel audit trail, not part of the main conversation, and pi-coding-agent gives extensions no write access to sessions at all, so an independent push-write mechanism was the only way to capture this data as it happens. Trace failures are intentionally isolated (wrapped in try/catch) so a trace-write problem can never abort the actual agent dispatch. |
| FGAP-081 | stale-archived | The XML-style `<context_block name="..." role="data">...</context_block>` wrapping (with `&`, `<`, `>` escaped in the body) exists to align with pi's own house-style convention for marking injected context as data-not-instructions, matching how pi itself demarcates injected content elsewhere in the system prompt. Quotes are deliberately left un-escaped: they can't break out of this tag-based boundary the way a literal `<` or `>` could, and escaping them would make injected JSON bodies harder to read for no added safety. |
| DEC-0001 | not a substantive citation (illustrative example only) | This citation is not making a claim about a real decision's content — the comment is illustrating, with an arbitrary example ID, that calling the `resolve(...)` template helper with any id string triggers on-demand construction of the id-lookup index. The specific example ID carries no meaning here and could be swapped for any placeholder without changing what the comment teaches (e.g. "so a template that calls `resolve()` with any item id triggers index construction"). |
| DEC-0015 | stale-archived | Substrate location (the project's `.context`/`.project` directory) is looked up exclusively through a small pointer file resolver — there is no hardcoded substrate-directory name anywhere in this package's source. When that resolver finds no pointer file at all (i.e., the calling directory simply has no substrate set up), that specific case is treated as "no substrate here, degrade gracefully" (skip context-block injection / skip the project template tier) rather than raised as an error. Only the missing-pointer case degrades this way — a malformed pointer file, or any other failure inside the resolver itself, still throws normally. |
| DEC-0021 | stale-archived | This is the follow-on rule to the "no hardcoded substrate paths, resolve via pointer file" policy above: when a production code path used to gracefully skip a missing substrate directory (returning null/empty rather than throwing), and the underlying resolver was later changed to throw instead, that graceful-skip *behavior* had to be explicitly preserved by catching the new thrown error at that same call site — not just left to break. This comment marks exactly such a preserved catch: the missing-substrate case is caught and still degrades gracefully (empty lookup index), while any other kind of resolver failure is allowed to propagate as a real error. |
| DEC-0047 | stale-archived (recovered meaning reused from TASK-108 session, re-verified against this package) | A dispatched (child) agent can never end up with more tool/capability access than the agent that dispatched it. Every agent's tool grant defaults to nothing at all — capability is never implicitly inherited, it must be explicitly declared — and at the moment of dispatch, the framework checks that the child's declared tools are a subset of the parent's own grant; if not, dispatch is refused before any LLM call is made (so a disallowed agent can't even incur token cost). This is this project's capability-governance model: default-empty grants, checked and clamped at every dispatch boundary. |
| DEC-0049 | stale-archived | There is exactly one shared "agent" abstraction in this project (the jit-agent: spec + loader + compile/templates/macros + capability composition + execute) used uniformly everywhere an agent is needed — behavior monitors, workflow steps, and agent-as-tool dispatch all go through this same abstraction rather than each having their own agent-like machinery. As a direct consequence, agent-prompt template assets (the bundled `templates/` tree, per-item macros, whole-block delegators) live in this one package, and every consumer package imports this package's template-resolution helpers instead of keeping its own copy. |
| STORY-001 | not a substantive citation (illustrative example only) | This citation is not making a claim about the real STORY-001 item — it's a doc-comment example showing the *shape* of the `focus` field (`{ story: "STORY-001" }`), illustrating that `focus` carries kind-specific scope hints, not asserting anything about that specific story. The example ID could be swapped for any placeholder id without changing what the comment teaches. |
| FEAT-001 | stale-archived (test file only) | This is one phase of the larger "consolidate all agent infrastructure into this one package" migration: relocating the agent-prompt template tree (per-item macros + whole-block delegators) out of a consumer package and into this package, as a direct consequence of adopting the single shared "agent" abstraction (see DEC-0049 above). |

## File:line sites

**FGAP-074** (4 sites: 2 source, 2 test)
- packages/pi-jit-agents/src/agent-spec.ts:287 (line comment)
- packages/pi-jit-agents/src/template.ts:64 (line comment)
- packages/pi-jit-agents/src/agent-spec.test.ts:441 (test-name string)
- packages/pi-jit-agents/src/template.test.ts:44 (test-name string)

**issue-023** (7 sites, all source)
- packages/pi-jit-agents/src/agent-trace-sdk.ts:2 (jsdoc)
- packages/pi-jit-agents/src/compile.ts:229 (line comment)
- packages/pi-jit-agents/src/index.ts:26 (line comment)
- packages/pi-jit-agents/src/trace-redactor.ts:3 (line comment)
- packages/pi-jit-agents/src/trace-writer.ts:1 (line comment)
- packages/pi-jit-agents/src/types.ts:162 (jsdoc)
- packages/pi-jit-agents/src/types.ts:209 (jsdoc)

**DEC-0004** (1 site, source)
- packages/pi-jit-agents/src/agent-trace-sdk.ts:8 (jsdoc)

**DEC-0005** (5 sites, all source)
- packages/pi-jit-agents/src/agent-trace-sdk.ts:10 (jsdoc)
- packages/pi-jit-agents/src/jit-runtime.ts:200 (jsdoc)
- packages/pi-jit-agents/src/trace-redactor.ts:3 (line comment)
- packages/pi-jit-agents/src/trace-writer.ts:6 (line comment)
- packages/pi-jit-agents/src/types.ts:214 (jsdoc)

**FGAP-081** (2 sites: 1 source, 1 test)
- packages/pi-jit-agents/src/compile.ts:146 (jsdoc)
- packages/pi-jit-agents/src/compile.test.ts:115 (line comment)

**DEC-0001** (1 site, source)
- packages/pi-jit-agents/src/compile.ts:241 (line comment, illustrative example only)

**DEC-0015** (2 sites, source, both packages/pi-jit-agents/src/compile.ts)
- compile.ts:259 (line comment)
- compile.ts:273 (line comment)

**DEC-0021** (2 sites, source, both packages/pi-jit-agents/src/compile.ts)
- compile.ts:259 (line comment)
- compile.ts:274 (line comment)

**DEC-0047** (7 sites: 5 source, 2 test)
- packages/pi-jit-agents/src/jit-runtime.ts:69 (jsdoc)
- packages/pi-jit-agents/src/jit-runtime.ts:88 (jsdoc)
- packages/pi-jit-agents/src/jit-runtime.ts:483 (section-header line comment)
- packages/pi-jit-agents/src/types.ts:190 (jsdoc field comment)
- packages/pi-jit-agents/src/types.ts:202 (jsdoc field comment)
- packages/pi-jit-agents/src/jit-runtime.test.ts:230 (line comment)
- packages/pi-jit-agents/src/jit-runtime.test.ts:231 (line comment)

**DEC-0049** (1 site, source)
- packages/pi-jit-agents/src/template.ts:29 (jsdoc)

**STORY-001** (1 site, source)
- packages/pi-jit-agents/src/types.ts:86 (jsdoc field comment, illustrative example only)

**FEAT-001** (1 site, test only)
- packages/pi-jit-agents/src/renderer-registry.test.ts:177 (describe-block title)

## Unresolvable IDs

**FGAP-074** — could not be grounded in either substrate. Live `FGAP-074` is "Past-filed context
atoms violate rhetorical-register at scale..." (a substrate-hygiene gap about comment tone in
`.context` block bodies) — completely unrelated to the comment's claim about pointer-less repos
degrading agent/template tier resolution. Archived `FGAP-074` is "Residual pi-project-era 'project'
naming debt..." (a source-identifier renaming gap, `pi-project` → `pi-context`) — also unrelated.
Neither the live nor the archived framework-gaps.json entry named `FGAP-074` has any content about
tier resolution, bootstrap pointers, or agent-spec/template loading. A broad grep of `.context/`
and `.project-archived/` for "pointer-less" and "FGAP-074" turned up no other candidate gap that
matches. Reported as unresolvable rather than guessed; the replacement text above states the
comment's actual engineering point without attribution to any substrate item.

## Notes on the live/archived divergence

Nine of the twelve IDs (issue-023, DEC-0004, DEC-0005, FGAP-081, DEC-0015, DEC-0021, DEC-0047,
DEC-0049, FEAT-001) show the same pattern already seen in the TASK-111 (pi-workflows) and TASK-108
(pi-agent-dispatch) passes: the ID *shape* either resolves live to a **different, unrelated item
that has since reused the same ID slot** (DEC-0004, DEC-0005, FGAP-081, DEC-0015, DEC-0021,
FEAT-001 all resolve live to topically disjoint items), or resolves to **nothing at all**
(issue-023, DEC-0047, DEC-0049 all return `null` live — the lowercase `issue-NNN` id scheme and
these two decision numbers no longer exist in the live substrate). In every one of these nine
cases the comment's claim matches the corresponding `.project-archived/*.json` entry closely or
verbatim, confirming the citations were accurate against the substrate that existed when the
comments were written and have simply gone stale as the live substrate moved on — exactly the
staleness-independent opacity TASK-113 targets (the citation is jargon to an outside reader
regardless of whether it still resolves).

Two IDs (DEC-0001 at compile.ts:241, STORY-001 at types.ts:86) are a different case: the comment
is not making any claim about that specific decision/story's content at all. It uses the ID purely
as an illustrative example string (e.g. "a template that calls `resolve(\"DEC-0001\")`", or a field
doc-comment example `{ story: "STORY-001" }`). These still count as opaque-jargon citations under
TASK-113's rule (presence is the defect, independent of resolution), but the correct fix is simply
to swap the example for a non-ID-shaped placeholder rather than to explain a substrate item's
substance, since no substantive claim was ever being made about that ID.

Excluded from this analysis as non-defects, per the task's own guidance: `compile.ts.test.ts`
contains dozens of `DEC-0001` / `DEC-0002` / `DEC-0003` / `DEC-9999` / `FEAT-001` / `STORY-001` /
`S-1` strings used as literal seeded test-fixture data (e.g. `seedDecisionsBlock(cwd, [{ id:
"DEC-0001", ... }])`), including one in-test comment (compile.test.ts:475, "the real DEC-0001
location's item content") that refers only to the test's own locally-seeded fixture row, not to
the real substrate item. None of these are citations to real substrate items and none were
counted.
