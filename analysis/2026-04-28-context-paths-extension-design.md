---
date: 2026-04-28
status: planning context — awaiting user evaluation
trigger: in-conversation design pass earlier today proposing a lightweight pi extension to expose claude-side context file paths to the pi main session and to monitor classifier agents
authorization: design report only; not implementation authorization
---

A pi extension that, on session bootstrap, discovers a fixed set of claude-side context paths (mandates, project memory, adjacent feedback/handoff/architecture files) and surfaces them as path-only references to (1) the main pi session via system-prompt addendum on each `before_agent_start`, and (2) monitor classifier agents via `_context_paths` template variable consumed by bundled `examples/<name>/classify.md` templates. Symmetric direction: claude-side files → pi context. Pi never writes to `~/.claude/`. Path-only injection (not content inlining) keeps payload bounded; the pi orchestrator and classifiers Read on demand.

# Verified facts

The brief asserted several pi-mono surface details that proved partially incorrect on inspection. Verified state below; refutations bolded.

1. **`session_before_tree` is NOT the right injection surface for system-prompt addendum.** It fires only during tree-navigation summarization (`AgentSession.navigateTree()`); see `/Users/david/Projects/pi-mono/packages/coding-agent/docs/tree.md:140-196` and `/Users/david/Projects/pi-mono/packages/coding-agent/src/core/extensions/types.ts:494-499`. The `customInstructions` it threads is summarizer instructions, not system prompt.

2. **The correct surface is `before_agent_start`.** Defined at `/Users/david/Projects/pi-mono/packages/coding-agent/src/core/extensions/types.ts:540-545` (event with `prompt`, `images`, `systemPrompt: string`) and `/Users/david/Projects/pi-mono/packages/coding-agent/src/core/extensions/types.ts:900-904` (result `BeforeAgentStartEventResult { systemPrompt?: string }`, comment: "Replace the system prompt for this turn. If multiple extensions return this, they are chained.").

3. **Chaining behavior is sequential, last-effective-write wins per turn.** Confirmed in `/Users/david/Projects/pi-mono/packages/coding-agent/src/core/extensions/runner.ts:779-826`: `currentSystemPrompt` is threaded through each handler; if a handler returns `{ systemPrompt }`, it becomes input to the next. To safely append we must read `event.systemPrompt` and return `event.systemPrompt + "\n\n" + addendum`.

4. **`session_start` exists but does not return systemPrompt.** `/Users/david/Projects/pi-mono/packages/coding-agent/src/core/extensions/types.ts:427-430` defines a bare `SessionStartEvent` with no `Result` interface that touches the prompt. Useful only for one-time discovery / caching at startup.

5. **`compileAgentSpec` builds its Nunjucks render context only from `resolvedInput`.** See `/Users/david/Projects/workflowsPiExtension/packages/pi-workflows/src/step-shared.ts:150-194`. The `ctx` object passed to `renderTemplateFile` / `renderTemplate` is constructed from `resolvedInput` (cast to `Record<string, unknown>`) plus auto-injected `_<blockname>` keys when `agentSpec.contextBlocks` is declared. **There is no caller-extensible third-channel context.** Consequence: classifier-side injection of `_context_paths` MUST happen by extending the `templateContext` object passed in at the call site, not by changing `compileAgentSpec`'s signature. See item 6.

6. **`classifyViaAgent` already accepts an `extraContext: Record<string, string>` parameter and spreads it into `templateContext`.** `/Users/david/Projects/workflowsPiExtension/packages/pi-behavior-monitors/index.ts:1305-1336`. Spread occurs at `index.ts:1335` (`...(extraContext ?? {})`). This is the natural and existing channel; no signature change is required to pass `_context_paths` through to classifier templates.

7. **`createMonitorAgentTemplateEnv` composes searchPaths from project / user / examples / templates dirs.** `/Users/david/Projects/workflowsPiExtension/packages/pi-behavior-monitors/index.ts:1186-1201`. Three-tier discovery; cached per-session. No filesystem touch on `~/.claude/` here, which the new extension must mirror.

8. **`createAgentLoader` (pi-jit-agents) is the canonical three-tier loader pattern.** `/Users/david/Projects/workflowsPiExtension/packages/pi-jit-agents/src/agent-spec.ts:114-132`. Project → user → builtin order, throwing on not-found. Path-only discovery in this design uses the same ordering principle (project-level overrides global) but its return shape is a list of paths, not a parser.

9. **Bundled classifier templates accept arbitrary template variables and use `{% if %}` guards.** `/Users/david/Projects/workflowsPiExtension/packages/pi-behavior-monitors/examples/fragility/classify.md:5-20` (uses `{% if user_text %}`); `/Users/david/Projects/workflowsPiExtension/packages/pi-behavior-monitors/examples/hedge/classify.md:1-3` (uses `{% if conversation_history %}`). A `{% if _context_paths %}` block fits naturally.

10. **Cwd encoding is non-trivial, NOT just `replace(/\//g, '-')`.** Empirically, `/Users/david/.claude/projects/-Users-david-Projects-digitalocean-vocab--claude-worktrees-elated-shannon` corresponds to `/Users/david/Projects/digitalocean-vocab/.claude/worktrees/elated-shannon`. The double dash means `/.claude/` collapses to `--claude-` because the leading `.` of `.claude` is replaced (becoming empty) and the surrounding slashes both become dashes. Empirically the encoding is `path.replace(/[^a-zA-Z0-9]/g, '-')` (collapses any non-alphanumeric to `-`, including `.` and `/`). The leading slash of `/Users/...` produces a leading `-Users-...`. Verified via direct `ls /Users/david/.claude/projects/`.

11. **Pi settings are layered: `~/.pi/agent/settings.json` (global) deep-merged with `.pi/settings.json` (project).** `/Users/david/Projects/pi-mono/packages/coding-agent/docs/settings.md:3-10` and `:225-246`. Nested objects merge; project wins. Extensions are not provided a built-in settings accessor on `ExtensionAPI` (no `getSettings` in the API surface — verified by grep on `types.ts`); the extension must read settings.json files directly with the same precedence rules.

12. **Mandates are already prefixed to UserPromptSubmit by an external claude-side hook.** Confirmed by inspection of `/Users/david/.claude/mandates.jsonl` (one JSONL row per mandate, e.g. `{"id":"mandate-001","title":"No Unauthorized Action",...}`) and the brief's note. Implication: the main pi session does NOT need mandate content re-injected. The classifier subprocesses, however, do not inherit the UserPromptSubmit prefix — they get a freshly compiled prompt from agent YAML + Nunjucks render — so the path to `~/.claude/mandates.jsonl` is the lever for parity.

# Surface analysis

Two distinct injection surfaces, each with verified entry points.

## Surface 1: main pi session

- **Hook:** `pi.on("before_agent_start", handler)` per `/Users/david/Projects/pi-mono/packages/coding-agent/src/core/extensions/types.ts:1006`-vicinity (event registration table).
- **Event payload:** `{ type: "before_agent_start", prompt, images?, systemPrompt }` (`types.ts:540-545`).
- **Result shape:** `{ message?, systemPrompt? }` (`types.ts:900-904`).
- **Append protocol:** read `event.systemPrompt`, append addendum string, return `{ systemPrompt: appendedValue }`. Last extension to return wins, but each sees the running mutated value, so order-independent if every extension that touches `systemPrompt` is append-only.
- **Cost characteristic:** fires per turn. Discovery should run once at session_start and cache the addendum string in module-level state; the `before_agent_start` handler returns the cached string.

## Surface 2: monitor classifier agents

- **Entry point:** `classifyViaAgent(ctx, monitor, branch, extraContext, signal)` at `/Users/david/Projects/workflowsPiExtension/packages/pi-behavior-monitors/index.ts:1305-1336`.
- **Existing channel:** `extraContext: Record<string, string>` is spread into `templateContext` at line 1335. Callers of `classifyViaAgent` are in `activate()` (line 2254-2282 area) and `invokeMonitor()` (line 1583, 1643).
- **Insertion mechanics:** the new extension must arrange for `_context_paths` to land in `extraContext`. Two viable mechanisms:
  - **Mechanism A (preferred):** extend `extraContext` at every call site by reading from a module-level cache that the new extension publishes via a small exported helper. Touches `pi-behavior-monitors/index.ts` at 3-4 call sites.
  - **Mechanism B:** add a separate event hook in pi-behavior-monitors (`monitor_before_classify`) that the new extension subscribes to. Requires emitting that event in pi-behavior-monitors. Larger change.
  - This design recommends A — minimal and uses an existing channel — but A is a touch outside the brief's stated scope (the brief permits edits only to the new extension file plus `examples/<name>/classify.md` templates plus package.json). See open design point OD-1.
- **Template consumption:** classifier templates render `{% if _context_paths %}` block (snippet in code-shape proposals).
- **Note on key naming:** existing convention prefixes injected block context with `_` (e.g. `_conventions`, `_requirements`); maintaining `_context_paths` matches that convention.

# Discovery algorithm

Inputs: `cwd: string` (process.cwd()), `home: string` (os.homedir()).
Output: `ContextPaths { mandates: string | null; memoryDir: string | null; adjacentFiles: string[] }` — all absolute paths, all read-only intent.

```
function discoverContextPaths(cwd, home):
  result = { mandates: null, memoryDir: null, adjacentFiles: [] }

  # 1. mandates.jsonl — fixed location
  m = path.join(home, ".claude", "mandates.jsonl")
  if fs.existsSync(m) and fs.statSync(m).isFile():
    result.mandates = m

  # 2. encode cwd → memory dir name
  # empirically: replace any run of non-alphanumeric chars with single '-'?
  # NOTE: actual claude-code encoding is per-character: every non-alphanumeric → '-'
  # (no collapsing). Verify by listing a known dir before relying.
  encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-')
  memDir = path.join(home, ".claude", "projects", encoded, "memory")
  if fs.existsSync(memDir) and fs.statSync(memDir).isDirectory():
    result.memoryDir = memDir

    # 3. enumerate adjacent files in memDir, .git-boundary aware
    # ".git-boundary aware" is moot here because memDir is OUTSIDE the project
    # tree (~/.claude/projects/...). The .git boundary applies only if we walk
    # UPWARD from cwd looking for project files; this design does NOT walk
    # upward. We enumerate the flat memory dir only.
    for entry in fs.readdirSync(memDir):
      full = path.join(memDir, entry)
      if fs.statSync(full).isFile() and entry.match(/\.(md|jsonl?)$/):
        result.adjacentFiles.push(full)
    result.adjacentFiles.sort()  # stable ordering

  # 4. dedupe (defensive: in case mandates somehow appeared in adjacentFiles)
  if result.mandates and result.adjacentFiles.includes(result.mandates):
    result.adjacentFiles = result.adjacentFiles.filter(p => p !== result.mandates)

  return result
```

**Encoding edge cases:**
- Root `/`: `cwd = "/"` → encoded `-` (single dash). Probe `~/.claude/projects/-/memory`. Will most likely not exist (a leading-slash empty cwd is degenerate); fall through to null.
- Paths with internal dashes: `/Users/david/claude-skills` → `-Users-david-claude-skills`. Original dashes are preserved as single dashes (indistinguishable from slashes — accepted ambiguity, not our problem to solve).
- Paths with dots: `/foo/.bar/baz` → `-foo--bar-baz` (the `.` becomes `-`, producing a double dash). This matches the observed worktree encoding.
- Paths with non-ASCII: e.g. `/Users/david/Projets/café` → `-Users-david-Projets-caf-` (every non-ASCII byte becomes `-`). Behavior matches the observed encoding rule. If the project never gets a memory dir created, we just return `memoryDir: null` and skip adjacents.
- **The brief mentioned ".git-boundary walk."** Re-read: the discovery walk does not need to traverse the project tree at all — it only enumerates the flat memory dir. The .git boundary concern is irrelevant in the actual design. Surfaced here so the user can confirm.

**File-existence probing:** all four probes (`fs.existsSync` on mandates path, `fs.existsSync` + `isDirectory` on memDir, `readdirSync` on memDir, `statSync` on each entry) wrapped in try/catch returning `null` / `[]` on any error. Discovery is best-effort and never throws.

**Deduplication:** trivial — `mandates` is a fixed path outside `memoryDir`, so the only collision risk is paranoia.

**Ordering of `adjacentFiles`:** lexicographic sort. Predictable for prompt-cache hits and for human review. `MEMORY.md`, `HANDOFF.md`, `project-architecture.md`, `feedback_*.md`, `reference_*.md` will naturally cluster.

**Filter on extension:** `.md` and `.json` / `.jsonl` only. Excludes editor swap files, OS metadata, etc. (`.DS_Store`, `*.swp`).

# Code-shape proposals

New file: `packages/pi-project-workflows/context-paths-extension.ts`.

## Public types

```typescript
/** Read-only — pi never writes to ~/.claude/ — enforced by absence of write
 *  call sites and by readonly intent on returned shape. */
export interface ContextPaths {
  readonly mandates: string | null;
  readonly memoryDir: string | null;
  readonly adjacentFiles: ReadonlyArray<string>;
}

/** settings.json shape (deep-merged from global + project). */
interface ContextPathsSettings {
  contextPaths?: {
    enabled?: boolean;        // default: true
    includeMandates?: boolean; // default: false (already in UserPromptSubmit prefix)
    extraDirs?: string[];     // optional explicit additional dirs to enumerate
  };
}
```

## Discovery functions (pure)

```typescript
/** Pure function. Reads filesystem; never mutates. */
export function discoverContextPaths(cwd: string, home?: string): ContextPaths;

/** Pure formatter. Renders the addendum string for the main session
 *  systemPrompt or the classifier _context_paths variable. */
export function formatContextPathsBlock(paths: ContextPaths): string;
```

`formatContextPathsBlock` returns a literal markdown block, e.g.:

```
## Claude-side context paths (read-only)

These files exist on the host and may inform your behavior. They are
maintained by Claude Code and visible here for reference. Pi MUST NOT
write to any path under ~/.claude/. Read on demand.

- mandates: /Users/david/.claude/mandates.jsonl
- memory:   /Users/david/.claude/projects/<encoded>/memory/
  - MEMORY.md
  - HANDOFF.md
  - project-architecture.md
  - feedback_*.md (54 files)
  - reference_*.md (2 files)
```

The "(54 files)" / "(2 files)" form keeps the addendum bounded — full enumeration only on `< N` files; otherwise grouped count by glob category. Threshold candidate: 12.

## Extension factory

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { setMonitorContextPaths } from "@davidorex/pi-behavior-monitors/context-paths"; // see OD-1

let cachedAddendum: string | null = null;
let cachedPaths: ContextPaths | null = null;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const settings = readSettings(ctx.cwd);
    if (settings.contextPaths?.enabled === false) return;

    cachedPaths = discoverContextPaths(ctx.cwd);
    cachedAddendum = formatContextPathsBlock(cachedPaths);

    // Publish to monitors-side cache so classifyViaAgent picks it up via
    // extraContext. See OD-1 for the import-edge implication.
    setMonitorContextPaths(cachedPaths);
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!cachedAddendum) return;
    return { systemPrompt: event.systemPrompt + "\n\n" + cachedAddendum };
  });
}
```

`readSettings(cwd)` reads `~/.pi/agent/settings.json` and `.pi/settings.json` (if present), deep-merges, returns the resulting object. Standard JSON.parse with try/catch returning `{}` on any error.

## Classifier-side wiring (pi-behavior-monitors)

A new exported helper `setMonitorContextPaths(paths: ContextPaths | null)` plus internal cache, with `classifyViaAgent` reading the cache and merging into `extraContext` before the existing spread at line 1335. The merge key is `_context_paths` (the underscore-prefix matches existing convention `_conventions`, `_requirements`, etc.).

The classifier template snippet (added to each `examples/<name>/classify.md`):

```
{% if _context_paths %}
Claude-side context paths available on the host (read-only references):
{{ _context_paths }}
{% endif %}
```

Where `_context_paths` is the formatted block from `formatContextPathsBlock`.

# Read-only enforcement

Three layers:

1. **Type-system intent:** `ContextPaths` declares all fields `readonly` / `ReadonlyArray`. `formatContextPathsBlock` takes `ContextPaths` and returns `string`. No writable surface area is exposed.
2. **Code-review invariant:** the new file MUST NOT contain `fs.writeFile`, `fs.appendFile`, `fs.unlink`, `fs.rename`, `fs.mkdir`, `fs.rmdir`, or any `fs/promises` write equivalent against any path containing `.claude`. Enforceable as a one-line grep added to the conformance audit (`/pi-code-conformance` skill).
3. **Behavioral invariant:** the addendum prose itself instructs the model: "Pi MUST NOT write to any path under ~/.claude/. Read on demand." Belt-and-braces — instructions plus absence-of-tools.

The brief's mandate-005 forbids "user manually edits settings.json each time" as the architectural shape. This design uses settings.json only as an opt-out toggle for behavior already discovered automatically; the default-enabled discovery is the architectural shape.

# Settings / opt-out

JSON shape (in `~/.pi/agent/settings.json` for global default, override per-project in `.pi/settings.json`):

```json
{
  "contextPaths": {
    "enabled": true,
    "includeMandates": false,
    "extraDirs": []
  }
}
```

- `enabled` — master switch. Default `true` (the extension is opt-out, not opt-in). Disabling skips both `session_start` discovery and `before_agent_start` injection.
- `includeMandates` — whether to include the `mandates.jsonl` path in the addendum. Default `false` because mandates are already prefixed to every UserPromptSubmit by an external claude-side hook (the main session would see them twice if `true`). Classifier subprocesses do NOT inherit that prefix, so the classifier-side `_context_paths` ALWAYS includes mandates regardless of `includeMandates` (asymmetric default — confirmed correct because the asymmetry mirrors the existing prefix asymmetry).
- `extraDirs` — optional explicit additional dirs to enumerate alongside the auto-discovered memoryDir. Empty by default. Each entry treated like `memoryDir` (enumerate `*.md`/`*.json{,l}`).

Project-scope override is automatic via the deep-merge precedence built into pi's settings layering (`docs/settings.md:225-246`).

# Filtered options (rejected with rationale)

## (a) Inline file content vs path-only injection

- **Path-only (chosen).** Bounded payload (~hundreds of bytes for paths + groups). Orchestrator/classifier reads on demand. Cost: extra Read tool calls when content is needed.
- **Inline content (rejected).** Unbounded — total content of `~/.claude/projects/<encoded>/memory/` for this project today is ~55 files. Could exceed 100KB. Would balloon every classifier prompt and main-session per-turn `before_agent_start` addendum. Mandate-noise (would also force aggressive truncation, which loses signal). Rejected on cost; not on correctness.

## (b) `agentsFilesOverride` SDK-level override vs `before_agent_start` hook

- **`before_agent_start` (chosen).** Hooks into a documented public extension API (`types.ts:540-545, 900-904`). Append protocol is well-defined. Per-turn cost is a string concat.
- **`agentsFilesOverride` (rejected).** Examined `types.ts` — no such field exists. Pi-mono surfaces `customInstructions` only on `session_before_compact`, `session_before_tree`, and `navigateTree()` options — none of which fire on a normal turn. There is no SDK-level "always-prepend" surface other than `before_agent_start`. Rejected because it doesn't exist.

## (c) Per-monitor opt-out vs global opt-out

- **Global opt-out (chosen).** One setting, simple semantics. Either all classifiers see `_context_paths` or none do. Aligns with the all-or-nothing nature of mandate awareness — selectively withholding mandate context from one classifier is a footgun.
- **Per-monitor opt-out (rejected).** Would require schema changes to monitor JSON specs (`fragility.monitor.json` etc.) for a flag like `excludeContextPaths: true`. Ten-line value, schema-change cost, no observed use case. Surfaced as future open-design if a use case emerges.

## (d) Discovery-only vs config-driven

- **Discovery-driven primary, config supplements (chosen).** `enabled` and `extraDirs` are config; the canonical paths (`mandates.jsonl`, encoded `memoryDir`) are auto-discovered. User does not have to encode their own cwd in settings.json — that would violate mandate-005 (manual repetition disguised as configuration).
- **Pure config-driven (rejected).** Would force every project to declare its memoryDir path in `.pi/settings.json`. The encoding rule is mechanical; making the user perform it is exactly the manual-repetition antipattern.

# Open design points

The user must decide the following before code lands.

- **OD-1: Edit pi-behavior-monitors to add `setMonitorContextPaths` export, OR live with main-session-only injection.** The brief's stated edit budget covers the new extension file, classifier `examples/*.md` templates, and package.json. It does NOT explicitly cover adding an exported helper to pi-behavior-monitors. Without that helper, classifier-side injection is unreachable from the new extension. Three options, all mandate-compliant:
  - OD-1a: extend the budget to allow ~10 lines in `pi-behavior-monitors/index.ts` (an exported `setMonitorContextPaths` plus internal cache merge). Adds a first import-edge from pi-behavior-monitors to the new extension's published shape — falls under the "first edge between previously decoupled packages is a landmark" memory note.
  - OD-1b: scope this extension to main-session injection only; classifier parity is deferred to a follow-up. Loses half the goal.
  - OD-1c: invert the dependency — pi-behavior-monitors imports `discoverContextPaths` from the new extension's published export and calls it itself in `classifyViaAgent`. Same edit footprint as OD-1a, different shape; arguably cleaner because the monitors package owns the call timing.
  - **Decision required:** which direction.

- **OD-2: addendum threshold for full enumeration vs grouped counts.** Code-shape proposal suggested `< 12 files: enumerate; ≥ 12: group by glob`. The exact threshold and grouping rule (by `feedback_*` / `reference_*` / other) is a taste call. Concrete value: 12 or 20.

- **OD-3: scope of `extraDirs` semantics.** Are entries treated as "another flat dir to enumerate," or as recursive walks bounded by `.git`? The brief mentioned `.git`-boundary walk; this design refuted that as inapplicable to `~/.claude/projects/.../memory` (no `.git` there). For `extraDirs` — which CAN point into a project tree — the question reopens. Recommend: flat enumeration only; recursive walk if explicitly requested via `extraDirs[].recursive: true`.

- **OD-4: fail-closed or fail-open if cwd encoding misses the actual memory dir.** If `discoverContextPaths` finds nothing, we silently emit no addendum. Alternative: emit a small note ("no claude-side memory dir found at <encoded path>") so the user notices misencoding. Recommend silent (don't pollute prompts with diagnostics); user-facing visibility comes from `/extension status` or similar (out of scope here).

- **OD-5: per-project settings precedence with global discovery.** If `~/.pi/agent/settings.json` says `enabled: true` and a project's `.pi/settings.json` says `enabled: false`, project wins (per pi's deep-merge). Confirmed by reading docs; included for record.

# Discovered-issue surface (mandate-007)

Found while reading source; out of scope for this PR. Named, not proposed.

- **DI-1: `ExtensionAPI` exposes no first-class settings accessor.** Each extension that wants settings reads `settings.json` directly with its own deep-merge. There are at least three extensions in this repo that read settings (verifiable via `grep -rn "settings.json" packages/`); they likely each implement their own loader. No canonical loader → drift risk. Future fragility, file as F-014 candidate when the catalog has bandwidth.

- **DI-2: Cwd encoding rule is unwritten and load-bearing.** The empirical rule (replace each non-alphanumeric with `-`) was inferred from listing `~/.claude/projects/`. If Claude Code changes the rule (e.g. switches to URL-encoding, or collapses runs of dashes), every consumer that reproduces the encoding silently breaks. The new extension would be one such consumer; `claude-history` likely is another. Suggest filing a discovered-issue requesting upstream documentation OR a small canonical helper exported from a claude-side package. Out of scope here.

- **DI-3: `compileAgentSpec` cannot be extended without a signature change.** Today, callers pass exactly `(spec, resolvedInput, env, cwd)`. The render `ctx` is built only from `resolvedInput` plus `_<blockname>` keys. If future work needs to inject ambient context that isn't a project block (this design's `_context_paths` is the first such case, threaded via `extraContext` at the classifier-specific layer), workflow-side step types have no parallel channel. Today no workflow step needs `_context_paths`; if/when one does, `compileAgentSpec` will need a fifth parameter. Surfaced as latent — not blocking this design.

- **DI-4: `before_agent_start` chained-systemPrompt protocol is read-modify-write with no merge contract.** Multiple extensions all returning `{ systemPrompt }` work only if they all read `event.systemPrompt` and append. An extension that returns a fresh string overwrites everything chained before it. This is the documented shape (`types.ts:902` says "chained" but doesn't enforce append-only). A misbehaving extension silently nukes others' addenda. The new extension is correct (read-modify-append); nothing to fix here, but the protocol is fragile by design — file as upstream pi-mono concern if the user wants to surface it.

- **DI-5: `seedExamples` short-circuit applies to monitor templates too.** Per memory note `feedback_seed_examples_does_not_overwrite.md`, edits to bundled `examples/<name>/classify.md` do not propagate to projects that have already seeded their `.pi/monitors/`. Adding the `{% if _context_paths %}` block to bundled templates leaves already-seeded projects without the new behavior unless they re-seed or hand-edit. The classifier-side feature ship is partial by construction. Out of scope to fix here; the extension still functions; user gets the feature on fresh seeds and main-session always.

# Verification plan

Once implemented, the design is verified by:

1. **Unit test (new):** `discoverContextPaths` against a temp HOME with constructed `~/.claude/projects/<encoded>/memory/` containing fixture files. Test the encoding edge cases above (root, dashed names, dotted segments, missing dir).
2. **Unit test (new):** `formatContextPathsBlock` snapshot — given a fixed `ContextPaths`, the output string is stable.
3. **Integration test (new, in pi-behavior-monitors):** with `setMonitorContextPaths` populated, `classifyViaAgent` end-to-end produces a compiled `taskTemplate` containing the `_context_paths` rendered block. Use existing test fixture monitor + offline `completeFn` injection.
4. **Manual smoke (main-session):** `pi -p "what context files are available?" --mode json --tools read --no-skills` after install. Expect the model to enumerate the discovered paths or call Read on them. With `enabled: false` in settings, expect the model to be unaware.
5. **Manual smoke (classifier):** trigger a monitor (e.g. `fragility`) on a synthetic violation and inspect the trace JSONL — confirm the compiled prompt contains the `_context_paths` block.
6. **Read-only audit:** `grep -rn "fs.writeFile\|fs.appendFile\|fs.unlink\|fs.rename\|fs.mkdir" packages/pi-project-workflows/context-paths-extension.ts` — must return zero hits. Add to `/pi-code-conformance` audit as a one-line check against any path containing `.claude`.
7. **Behavioral diff:** before-and-after for a 10-turn session. Expect: per-turn token-usage delta of ~hundreds of tokens for the addendum (path-only). If the delta is in the thousands, the addendum is leaking content (regression).
8. **Cost-control invariant:** the addendum string is computed once at `session_start` and cached. Confirm by adding a counter (test-only) on `formatContextPathsBlock` invocations across a multi-turn session — must remain `1` regardless of turn count.
