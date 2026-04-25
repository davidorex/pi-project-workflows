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

## Reification plan when the write surface is restored

Each fragility above should land in its target block via:

```
pi -p "call the append-block-item tool with name issues and key issues and item {...}" --mode json --tools read --no-skills --model openrouter/anthropic/claude-haiku-4.5
```

(Note the `--model` pin and `--tools read` restriction — both pulled forward from F-002 / F-006 candidate paths so the reification itself does not re-trigger F-006.)

For framework-gaps targets (F-004, F-010), use `name framework-gaps key gaps`. Each entry will need an `id` field — `FGAP-008` and `FGAP-009` are the next two free IDs (FGAP-007 is staleness engine, awaiting registration).

Authorship attestation gap (FGAP-004 in framework-gaps.json) means the entries will not be authorship-stamped at write time. The `created_by` and `created_at` fields are not currently on the issues.schema.json or framework-gaps.schema.json required lists — the schemas accept items without provenance. This is a known gap, not a regression.
