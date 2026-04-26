# Fragilities surfaced during the pi-bypass investigation arc — 2026-04-25

**Status.** Captured here because the canonical block-write surface (`pi -p "call the append-block-item tool ..."`) cannot be relied on in this session: an attempt to register one of these (the tsx-resolver flake) hung the pi process for 15+ minutes due to compounding factors documented as F-009 below. This file is the temporary holding place until the write surface is unblocked, at which point each entry should be reified into the appropriate `.project/` block (`issues.json` or `framework-gaps.json`) via the framework's validate-on-write path.

**Provenance.** Aggregated from three nested investigations during this session: (1) the FGAP-007 add attempt, where an Edit-tool bypass was caught and reverted; (2) the subsequent diagnosis of why the pi write surface hung; (3) two subagent reports (`a3a99a192857a61fa` for monitor-auth, follow-up for upstream pi-mono comparison).

---

## F-001 — tsx -e import resolution against ./packages/*/src/*.js is non-deterministic on Node 23.7

- **Target block:** issues.json (category `issue`, priority `medium`, package `pi-project`)
- **Source:** FGAP-007 add attempt, 2026-04-25.
- **Symptom:** `npx tsx -e "import {x} from './packages/<pkg>/src/<file>.js'"` intermittently returns `MODULE_NOT_FOUND: Cannot find module './packages/<pkg>/src/<file>.js'` despite the source file existing and tsx's documented `.js` → `.ts` extension mapping. Reproduced this session: the import succeeded once for `block-api.js`, then failed three consecutive times for `project-sdk.js`, then succeeded on retry without environment changes. Both spaced and no-space import forms fail identically; error path matches input verbatim — no path rewriting.
- **Resolver chain implicated:** `tsx/dist/register-D46fvsV_.cjs:3` → `:4` → `m._resolveFilename` in CJS-eval mode under Node 23.7.0.
- **Impact:** The CLAUDE.md derive-state example uses this exact surface (`npx tsx -e "import{projectState}from'./packages/pi-project/src/project-sdk.js';..."`). A flake makes the documented command appear broken to a fresh agent reading the docs and triggers bypass behavior — witnessed in this session, where a single MODULE_NOT_FOUND prompted the agent toward a parallel AJV validator before the bypass was caught and reverted.
- **Candidate paths (tracking, not deciding):** pin tsx and Node majors via `engines` field; switch CLAUDE.md derive-state examples to pi CLI tools (`pi -p 'call the project-status tool' --mode json --tools read --no-skills`) since those are the canonical surface anyway; investigate tsx 4.x resolver behavior under monorepo workspaces + CJS-eval for known-bug status.
- **Location:** CLAUDE.md (commands section) and `packages/pi-project/src/project-sdk.ts` (representative target).

---

## F-002 — Five monitor classifier YAMLs use `model: claude-sonnet-4-6` with no provider field; default-to-anthropic logic requires auth that single-openrouter setups lack

- **Status:** Resolved on `main` by commit `7edf3a2` (2026-04-25), which routed all five YAMLs to `model: openrouter/anthropic/claude-sonnet-4.6` with the dash/dot-form rationale comment from F-009. The auth-resolution failure pattern is gone; the downstream provider-translation failure surfaced after this fix is captured separately as F-011 (also resolved, by `ce37772`).
- **Target block:** issues.json (category `issue`, priority `high`, package `pi-behavior-monitors`) — this is the active failure on every pi turn in this repo.
- **Source:** subagent `a3a99a192857a61fa` investigation of `[hedge]/[fragility] classify failed: ... Could not resolve authentication method` errors.
- **Affected files:**
  - `packages/pi-behavior-monitors/agents/hedge-classifier.agent.yaml:4`
  - `packages/pi-behavior-monitors/agents/fragility-classifier.agent.yaml:4`
  - `packages/pi-behavior-monitors/agents/commit-hygiene-classifier.agent.yaml:4`
  - `packages/pi-behavior-monitors/agents/work-quality-classifier.agent.yaml:4`
  - `packages/pi-behavior-monitors/agents/unauthorized-action-classifier.agent.yaml:4`
- **Resolution chain:** `pi-behavior-monitors/index.ts:1224` → `parseModelSpec` (`index.ts:1091-1097`, defaults provider to `anthropic` for unprefixed strings) → `ctx.modelRegistry.getApiKeyAndHeaders` (`pi-coding-agent/dist/core/model-registry.js:418-449`) → `authStorage.getApiKey("anthropic", { includeFallback: false })` returns undefined when `~/.pi/agent/auth.json` has only `openrouter`. Anthropic SDK `client.js:117` throws `"Could not resolve authentication method"`.
- **Established fix (per subagent):** change line 4 of each of the five YAMLs from `model: claude-sonnet-4-6` to `model: openrouter/anthropic/claude-sonnet-4.6` (note: dot, not dash — verified against pi-ai's `models.generated.js:6858`).
- **Forced-tool-use compatibility:** `anthropic/claude-sonnet-4.6` on openrouter is registered with `api: "openai-completions"` (`models.generated.js:6861`); forced `tool_choice: {type: "function", name}` is supported and translated upstream. The CLAUDE.md note about pinning `claude-sonnet-4-6` "for adaptive thinking compatibility with forced tool-use" is moot for monitors — `index.ts:1231-1234` already force-disables thinking for classify. Residual unknown: openrouter's openai→anthropic translation for edge-case schema features. Warrants smoke test post-fix.

---

## F-003 — `thinking: "on"` is dead config in all five monitor classifier YAMLs

- **Target block:** issues.json (category `cleanup`, priority `low`, package `pi-behavior-monitors`)
- **Source:** subagent `a3a99a192857a61fa`.
- **Symptom:** All five classifier YAMLs declare `thinking: "on"` but `pi-behavior-monitors/index.ts:1231-1234` documents that thinking is force-disabled for classify (Anthropic rejects thinking + forced toolChoice). The YAML field is misleading.
- **Candidate paths:** remove the field from each of the five YAMLs, or document its inertness inline.

---

## F-004 — `parseModelSpec` silent default to `anthropic` for unprefixed model strings is a footgun

- **Target block:** framework-gaps.json (priority `P2`, package `pi-behavior-monitors`) — this is a structural divergence from pi-mono's resolution philosophy, not just a bug.
- **Source:** subagent investigations (initial + upstream comparison).
- **Symptom:** `pi-behavior-monitors/index.ts:1091-1097` reimplements model parsing with a hardcoded `"anthropic"` fallback. Any user installing pi with only openrouter auth hits this on first monitor turn — F-002 above is the symptom. Upstream pi-mono's `model-resolver.ts` uses `resolveCliModel` with no hardcoded provider default — it searches the registry for matches.
- **Impact:** silent provider defaulting is an entire class of footguns; F-002 is one instance, but every unprefixed model string in any agent YAML or monitor YAML has the same exposure.
- **Candidate paths (per subagent):** raise at parse time when the resolved provider has no auth; or replace our `parseModelSpec` with a call to pi-coding-agent's `resolveCliModel`, eliminating the silent-default behavior entirely.

---

## F-005 — `includeFallback: false` blocks env-var fallback for monitor classify

- **Target block:** issues.json (category `issue`, priority `medium`, package `pi-behavior-monitors`)
- **Source:** subagent investigation; verified against upstream HEAD.
- **Symptom:** `pi-coding-agent/dist/core/model-registry.js:421` explicitly opts out of env-var fallback via `{ includeFallback: false }` when resolving auth for monitor classify. If the user has `ANTHROPIC_API_KEY` set in environment, it is ignored. Behavior is unchanged 0.63.1 → 0.70.2 (latest upstream).
- **Impact:** R-0001 in `.project/research.json` documented the four-tier pi-ai auth fallback (CLI flag → auth.json → env var → models.json apiKey), but the monitor path skips tier 3. The research entry is incomplete on this point.
- **Candidate paths:** confirm whether `includeFallback: false` is intentional (auth.json as canonical) or a bug; document either way; addendum to R-0001 noting the monitor-path override.

---

## F-006 — Default openrouter model `openai/gpt-5.1-codex` is agentic; tool-call loops compound prompt size into runaway runtime

- **Target block:** issues.json (category `issue`, priority `medium`, package — meta/repo-level; closest fit `pi-project` since the affected commands target pi-project tools)
- **Source:** root-cause investigation of the 15-minute pi hang, 2026-04-25.
- **Symptom:** `pi -p "call the append-block-item tool ..." --no-skills` (no `--tools` restriction) gives the model access to all four default tools (`read`, `bash`, `edit`, `write`). With `openai/gpt-5.1-codex` as the default openrouter model, the agentic tool-chaining loop runs for many sequential calls. A controlled re-run with a 1.6KB prompt and `--tools read` produced 28 `read-block` calls / 660KB output / 55s. The original 6KB prompt + write-tool authorization scaled past 15m.
- **Impact:** Documented pi invocation patterns in CLAUDE.md (`pi -p "..." --mode json --no-skills`) silently incur agentic-loop runtime costs that look indistinguishable from a hang. New users hitting this will conclude the tool is broken or the prompt is malformed — both wrong.
- **Candidate paths:** update CLAUDE.md write examples to pin a fast model (`--model openrouter/anthropic/claude-haiku-4.5`); restrict tool surface explicitly via `--tools` rather than relying on default-all under `--no-skills`; document the agentic-loop cost as part of the CLI Access section; add a `gtimeout 120 pi -p ...` wrapper recommendation.

---

## F-007 — `~/.pi/agent/models.json` declares `kimi-k2.6:cloud` on ollama; model not present locally

- **Target block:** issues.json (category `cleanup`, priority `low`, package — user config, no clear package fit; closest `pi-behavior-monitors` since monitor classify is what would dispatch)
- **Source:** subagent investigation while diagnosing pi hang.
- **Symptom:** `~/.pi/agent/models.json` declares `kimi-k2.6:cloud` on the ollama provider; `curl http://127.0.0.1:11434/v1/models` shows ollama hosts only `minimax-m2.1`, `mxbai-embed-large`, `nomic-embed-text`. Latent until something tries to dispatch to `kimi-k2.6:cloud`, then will fail at request time.
- **Candidate paths:** remove the stale entry from models.json, or pull/install the kimi model on local ollama.

---

## F-008 — pi-ai and pi-coding-agent installed at 0.63.1; latest npm is 0.70.2 (~7 minor versions, ~1 month behind)

- **Status:** Resolved on `main` by commit `11a4069` (2026-04-25). All four workspace packages now declare `^0.70.2`. TypeBox v0.34 → v1.x migrated via hybrid import strategy (Path β for three packages importing Type from pi-ai's re-export; Path α for pi-project declaring `typebox: ^1.1.24` directly because pi-coding-agent does not re-export Type). Zero source changes needed beyond the four import statements; 28 consumed pi-mono symbols verified stable across 0.63.1 → 0.70.2. R-0001 grounding (cited 0.63.1) is now stale.
- **Target block:** issues.json (category `cleanup`, priority `medium`, package — repo-level, no single package fit; affects all extensions because pi-ai is the dispatch substrate)
- **Source:** upstream-comparison subagent task.
- **Symptom:** `package-lock.json` pins `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent` at `0.63.1` (released 2026-03-20/27). npm latest is `0.70.2` (released 2026-04-24). Upstream HEAD `0b271a2`.
- **Notable upstream changes since 0.63.1:** TypeBox 1.x migration in 0.69.0 (affects tool argument validation); OpenRouterRouting field support in 0.67.0 (enables fallback chains); `findEnvKeys()` helper in 0.70.0; `getApiKey` → `getApiKeyAndHeaders` rename stabilized in 0.68.0 (already present in 0.63.1, naming change only).
- **Impact:** independent of monitor-auth and the bypass arc; bumping may resolve other latent issues we have not yet surfaced and unlock OpenRouterRouting fallback-chain support.
- **Candidate paths:** scheduled dependency bump arc; verify TypeBox 1.x migration does not break pi-jit-agents' phantom-tool TypeBox shapes; smoke-test forced-tool-use post-bump.

---

## F-009 — Model-id format dash/dot inconsistency between provider-direct and openrouter-prefixed forms

- **Target block:** issues.json (category `cleanup`, priority `low`, package `pi-behavior-monitors`)
- **Source:** subagent upstream-comparison task.
- **Symptom:** Anthropic provider uses `claude-sonnet-4-6` (dash); openrouter prefix uses `anthropic/claude-sonnet-4.6` (dot). Source is `models.dev` upstream-of-upstream, not pi-mono.
- **Impact:** the F-002 fix must use the dot form. A reader copying the dash form from the openrouter list will get a registry miss and another auth failure.
- **Candidate paths:** add a one-line YAML comment noting the dash/dot rule next to the model line in each of the five fixed YAMLs; or contribute a normalization helper to pi-mono.

---

## F-010 — Project's own write-surface bootstrapping is fragile within the framework being built

- **Target block:** framework-gaps.json (priority `P1`, package `pi-project`) — this is a meta-fragility about the project's own self-application.
- **Source:** the entire bypass-and-recovery arc this session.
- **Symptom:** during this session, the framework's canonical write path (`pi -p "call the append-block-item tool ..."` → `block-api.appendToBlock` → schema-validate-on-write) was effectively unavailable due to the F-006 agentic-loop runtime. The fallback choices observed: (a) Edit-tool direct write to JSON files (bypass), (b) parallel AJV validator (bypass), (c) suspend the work indefinitely. The user's response was a feedback-memory addition (`feedback_process_is_success_metric.md`) and subsequent serial investigation of why the documented surface was unusable.
- **Impact:** the framework cannot be reliably used to author its own state during sessions where the dispatch substrate has degraded. Future agents reading CLAUDE.md and following the documented commands will hit the same trap if they do not also have access to the diagnostic path the user took.
- **Candidate paths:** ship the project with a known-fast model pinned for write tools; document the agentic-loop trap explicitly in CLAUDE.md's CLI Access section; consider a non-LLM direct-block-write surface (e.g., `pi --write-block name=X --key=Y --item-file=...`) that bypasses model dispatch entirely for the schema-validate-on-write case; treat F-006 as a P1 because it gates self-application.

---

## F-011 — Forced-toolChoice protocol divergence: Anthropic-format hardcoded at two dispatch sites; fails on openai-completions providers (OpenRouter)

- **Target block:** issues.json (category `bug`, priority `P0` while monitors are routed through openrouter; package `pi-jit-agents` and `pi-behavior-monitors`) and decisions.json (DEC-0001..0003 already track the deeper migration). Resolved on this branch by `normalizeToolChoice`; this entry is the post-mortem record.
- **Source:** post-7edf3a2 monitor-classify runtime failures observed by the user; root-cause investigation against pi-ai 0.70.2 driver source.
- **Symptom:** after F-002 fix routed the five classifier YAMLs through `openrouter/anthropic/claude-sonnet-4.6`, classify dispatch began failing with `"Tool '' not found in provided tools"` 400 from the OpenRouter validator. The error message has no obvious reference to tool_choice format. `stopReason: "error"`, no tool call in response.
- **Established root cause:**
  - `pi-jit-agents/src/jit-runtime.ts:195` set `options.toolChoice = { type: "tool", name: phantomTool.name }` — Anthropic-native format — for every dispatch regardless of resolved api.
  - `pi-behavior-monitors/index.ts:1245` set the same Anthropic-native format for its independent classify dispatch path.
  - pi-ai 0.70.2's `openai-completions` driver passes `tool_choice` through unchanged (line 396-397 of dist) — no provider-aware normalization at the pi-ai layer.
  - OpenRouter (registered with `api: "openai-completions"`) validates as OpenAI-compatible: looks for `tool_choice.function.name`, finds nothing, rejects with the empty-tool-name error. F-002's "translated upstream" assumption did not hold for the `claude-sonnet-4.6` route.
- **Architecturally correct fix:** per ADR-0003, normalize at the pi-jit-agents execute boundary, not at consumer call sites. Landed as `normalizeToolChoice(api, toolName)` exported from `@davidorex/pi-jit-agents`. Adopted at executeAgent line 195 and at classifyViaAgent line 1245. Coverage map per pi-ai 0.70.2: anthropic-messages and bedrock-converse-stream → `{type:"tool", name}`; openai-completions and mistral-conversations → `{type:"function", function:{name}}`; google-* → string `"any"`; unknown api strings → Anthropic-format default.
- **Independence from FEAT-001 STORY-005 / decision arc:** the helper requires only `model.api` (already on the resolved `Model<Api>` object), not parseModelSpec semantics or the thinking-seam ownership decisions. The full classifyViaAgent → executeAgent migration remains gated on DEC-0001/DEC-0002/DEC-0003 / REVIEW-001; this work establishes the architectural normalization point without enacting full migration.
- **Verification:** 12 unit tests in `jit-runtime.test.ts` cover every `KnownApi` value plus unknown-string fallback; smoke test `jit-runtime.smoke.test.ts` round-trips a real classify dispatch through openrouter (api `openai-completions`) and produces a valid CLEAN/FLAG/NEW verdict; pi end-to-end run in this worktree shows clean stderr (no `[fragility] classify failed` or `Tool '' not found` noise).

---

## F-012 — pi-ai 0.70.2 drivers `openai-responses`, `openai-codex-responses`, and `azure-openai-responses` do not honor `options.toolChoice`; forced-tool-use is unenforceable on these routes

- **Target block:** issues.json (category `cleanup`, priority `medium`, package — repo-level since pi-ai is upstream; the issue is "track until pi-ai upstream addresses it"). Surfaced while implementing F-011 fix.
- **Source:** driver inventory grep against `node_modules/@mariozechner/pi-ai/dist/providers/*.js` during F-011 work.
- **Symptom:** `openai-responses.js` does not reference `options.toolChoice` at all; `openai-codex-responses.js` hardcodes `tool_choice: "auto"` at line 219 and ignores caller input; `azure-openai-responses.js` likewise drops the option. Compare with `openai-completions.js:396-397` which forwards toolChoice to `params.tool_choice` for the request, and `anthropic.js:712-717` which forwards to `params.tool_choice` after string-wrapping.
- **Impact:** any agent or monitor that depends on forced-tool-use for structured output (the phantom-tool pattern) cannot rely on it when dispatched through these three drivers. The model is free to ignore the tool. `normalizeToolChoice` emits the canonical OpenAI-compatible function form for these api kinds — the value is correct shape, but the drivers do not currently forward it.
- **Candidate paths:** file an upstream issue against `@mariozechner/pi-ai` for `tool_choice` forwarding parity across openai-* drivers; in the meantime, the framework should warn at dispatch time when a phantom-tool agent resolves to one of these api kinds (visible degradation rather than silent failure). Explicit warning seam not yet implemented; tracked here so it is not lost.

---

## F-013 — Smoke test `jit-runtime.smoke.test.ts` constructed `Model<Api>` inline without `api` field; pre-existing latent failure exposed by F-011 fix

- **Target block:** issues.json (category `bug`, priority `P1`, package `pi-jit-agents`). Resolved on this branch as part of the F-011 work.
- **Source:** uncovered when running the smoke test against `OPENROUTER_API_KEY` after the F-011 fix landed; the dispatcher rejected with `No API provider registered for api: undefined`.
- **Symptom:** the smoke test (added in commit `11a4069`) constructed `const model = { provider, id: modelId } as unknown as Model<Api>` per a comment claiming `getModel` was not exported from pi-ai. The cast was a lie — the resulting object lacked the `api` field that pi-ai's `resolveApiProvider` requires to dispatch to a driver. The test would have failed with `OPENROUTER_API_KEY` set at any time post-11a4069.
- **Impact:** the test exists as the canonical verification of the phantom-tool round-trip but was non-functional. Whoever ran it locally with credentials would see an unrelated `undefined` error rather than a real classify result.
- **Resolution:** rewritten to use pi-ai's exported `getModel(provider, modelId)` (verified present in pi-ai 0.70.2 `dist/models.d.ts:6`). The returned Model<Api> carries the correct `api` value (`"openai-completions"` for openrouter), unblocking both the dispatcher and `normalizeToolChoice`. The earlier comment in the test file has been updated to record the corrected understanding.

---

## F-014 — `collectAssistantText` backward-walk + `extractText` text-only filter can return empty under realistic message shapes

- **Target block:** issues.json (category `issue`, priority `high`, package `pi-behavior-monitors`).
- **Source:** Surface-mapping subagent A on 2026-04-26, after the F-002+F-011 chain landed and live monitor turns produced false-positive verdicts. Cross-references the user's hypothesis-side perspective synthesized the same day: H1 "branch data — collectAssistantText returns empty/stale" — note that issue-018 added a prompt-level workaround for a related symptom but the data-layer mechanism was never investigated.
- **Symptom:** `pi-behavior-monitors/index.ts:495-503` `collectAssistantText` walks the branch backward and returns text from the FIRST assistant message it encounters. `pi-behavior-monitors/index.ts:457-462` `extractText` filters content blocks to `b.type === "text"` only, dropping `ThinkingContent` and `ToolCall` blocks per pi-ai's `AssistantMessage.content: (TextContent | ThinkingContent | ToolCall)[]`. The combination produces empty `assistant_text` whenever the most-recent assistant message is tool-call-only or thinking-only — the classifier's prompt then literally renders "the assistant's response: ''" and the LLM reasonably concludes "no response."
- **Distinct from issue-018:** issue-018 was a prompt-level fix ("empty assistant_text with successful tool results is not empty output" guard). The data-layer question — whether `assistant_text` is structurally guaranteed to carry the user-visible response text — was never investigated. F-014 names that data-layer question.
- **Impact:** every classifier that consumes `assistant_text` (hedge, fragility, work-quality, commit-hygiene, unauthorized-action) is exposed. False positives on `[hedge] classify failed: ... no visible response text` and the equivalent fragility flag observed live on 2026-04-26. The F-002+F-011 chain restored auth and shape correctness; the data-layer empty-string surface remains.
- **Candidate paths:** (a) `extractText` falls back to thinking content / tool-result content / serialized tool-call shape when no text blocks present (parallel to the `extractResponseText` fix in the verdict-extract path; resolved-by note on the verdict-side issue cited a similar fallback as the canonical pattern); (b) `collectAssistantText` aggregates text across the latest contiguous run of assistant messages rather than returning the first match; (c) prompt template gains an explicit empty-guard that surfaces the empty case to the LLM as "no text was captured by the collector — judge based on tool work alone" instead of rendering an empty quote. Resolution priority depends on F-018 multi-message semantics decision.

---

## F-015 — Prompt-level guards (issue-018 pattern) are advisory; LLM may reason past them and flag anyway

- **Target block:** issues.json (category `issue`, priority `medium`, package `pi-behavior-monitors`).
- **Source:** User-side synthesis on 2026-04-26 (H2 "semantic — model reasons past guard"). Net new — not previously filed.
- **Symptom:** issue-018 added text guards to classifier prompts of the shape "empty `assistant_text` with successful tool results is not empty output." The guard is a sentence the LLM reads and weighs against the rest of the prompt; it is not a structural constraint on the verdict. When the rendered prompt strongly emphasizes the empty `assistant_text` quote and the guard is one sentence among many, the LLM may flag anyway and the verdict carries through to side-effects.
- **Impact:** prompt-level workarounds for data-layer bugs (per F-014) carry residual false-positive risk. The guard reduces but does not eliminate misclassification. Combined with the auto-write path under issue-065, false positives still mutate `.project/issues.json`.
- **Candidate paths:** (a) move the constraint from advisory text to structured prompt — explicit "if `assistant_text` is empty AND `tool_results` is non-empty, the verdict MUST be CLEAN" with the LLM forced to acknowledge the conditional via a sub-tool or a chain-of-thought field; (b) shift the empty-detection to deterministic code BEFORE the LLM call — short-circuit to CLEAN if collectors signal substantive tool work and no semantic claim to evaluate; (c) treat F-015 as fully blocked on F-014 — fix the data layer, the prompt-level guard becomes unnecessary.

---

## F-016 — Branch state at session resume / mid-session restart unspecified for monitor classify

- **Target block:** issues.json (category `issue`, priority `medium`, package `pi-behavior-monitors`).
- **Source:** User-side synthesis on 2026-04-26 (H4 "restart state"). Net new — not previously filed.
- **Symptom:** `getBranch()` returns the current session branch from leaf to root, but the contents of that branch when pi resumes from a checkpoint, restarts mid-conversation, or is invoked fresh against an existing session are not specified in the monitor classify contract. `turn_end` and `message_end` events fire on certain session-state transitions; whether they fire on resume-replay is undocumented. A misfire pattern would be: monitor fires at resume, sees a partially-rehydrated branch, classifier reasons about a stale or missing turn.
- **Impact:** unobserved by the surface-mapping pass. Hypothesis-only at this point; the classify-debug instrumentation under issue-023 would expose whether resume-replay produces malformed branches in classifier inputs.
- **Candidate paths:** investigation gated on issue-023 (no diagnostic visibility into classify-time branch state today). Mitigation pre-investigation: explicit branch-state assertion at classify-call entry — refuse to dispatch if the branch is empty or malformed, surface as a non-fatal warning instead of running the classifier on degenerate input.

---

## F-017 — Classifier prompt templates inject `{{ assistant_text }}` with no empty-guard and no positional emphasis

- **Target block:** issues.json (category `cleanup`, priority `medium`, package `pi-behavior-monitors`).
- **Source:** Surface-mapping subagent A on 2026-04-26 (prompt-template surface). Cross-references the user's H5 "prompt weight — assistant_text buried."
- **Symptom:** `examples/hedge/classify.md:16-17` renders `The assistant's latest response: "{{ assistant_text }}"`; `examples/fragility/classify.md:25-26` renders `The agent then said: "{{ assistant_text }}"`. Neither template guards against the empty-string case. When the collector returns `""` (per F-014 mechanism), the rendered prompt is literally `The assistant's latest response: ""` — semantically identical to "the assistant said nothing."
- **Impact:** even after F-014 fixes the data layer, the prompt templates remain fragile against any future collector regression that reintroduces empty strings. No defensive coding at the prompt-render boundary.
- **Candidate paths:** (a) Nunjucks-conditional rendering — `{% if assistant_text %}The assistant's latest response: "{{ assistant_text }}"{% else %}The collector did not capture any assistant text — judge based on tool_calls and tool_results.{% endif %}`; (b) the empty-detection happens in code before render (per F-015 candidate b); (c) hold pending DEC entry on prompt-template authoring conventions across all classifiers.

---

## F-018 — Multi-message turn "latest response" semantics undefined for tool→text→tool→text patterns

- **Target block:** framework-gaps.json (priority `P2`, package `pi-behavior-monitors`) — this is a structural ambiguity in the classify-input contract, not a single-line bug.
- **Source:** Surface-mapping subagent A on 2026-04-26. Net new — not previously filed.
- **Symptom:** A turn that the user perceives as one assistant action may comprise multiple `SessionMessageEntry` records: tool-call message → tool-result → text response → second tool-call → second text response. `collectAssistantText` returns the FIRST assistant message's text walking backward; if the literal final assistant message is tool-call-only, it falls through to the prior text message, which may be the wrong "latest response" semantically. There is no canonical specification of which message constitutes "the response the classifier should evaluate" for multi-message turns.
- **Impact:** structural — even with F-014's data-layer fixes (e.g., extractText fallback to thinking blocks), the question of WHICH message to extract from in a multi-message turn remains undecided. Classifier verdicts are sensitive to this choice and currently arbitrary.
- **Candidate paths:** (a) define "the response" as the union of all assistant messages from the most recent user message to the current turn boundary (concatenated) — captures the full agent reasoning chain; (b) define "the response" as the final assistant message only — narrow scope but may miss substantive earlier work; (c) add a per-classifier configuration knob — hedge wants the full chain to verify intent-following, fragility wants only the final claim. Decision should be recorded as a DEC entry in `.project/decisions.json` because it touches the classify-input contract that all monitors share.

---

## Reification plan when the write surface is restored

Each fragility above should land in its target block via:

```
pi -p "call the append-block-item tool with name issues and key issues and item {...}" --mode json --tools read --no-skills --model openrouter/anthropic/claude-haiku-4.5
```

(Note the `--model` pin and `--tools read` restriction — both pulled forward from F-002 / F-006 candidate paths so the reification itself does not re-trigger F-006.)

For framework-gaps targets (F-004, F-010, F-018), use `name framework-gaps key gaps`. Each entry will need an `id` field — `FGAP-008`, `FGAP-009`, `FGAP-010` are the next free IDs (FGAP-007 is staleness engine, awaiting registration).

Authorship attestation gap (FGAP-004 in framework-gaps.json) means the entries will not be authorship-stamped at write time. The `created_by` and `created_at` fields are not currently on the issues.schema.json or framework-gaps.schema.json required lists — the schemas accept items without provenance. This is a known gap, not a regression.
