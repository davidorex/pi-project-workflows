# Confirmed: pi-mono session JSONL is already the substrate

Source: `pi-mono/packages/coding-agent/docs/session.md` and `json.md`.

## What pi-mono actually emits

Every session is persisted to `~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl`. Each line is a JSON object with `type` field; tree-structured via `id` / `parentId` (v2+); auto-migrating header version (currently v3).

### Atomic — each content block is a typed unit

```ts
TextContent     { type, text }
ThinkingContent { type, thinking }
ImageContent    { type, data, mimeType }
ToolCall        { type, id, name, arguments }    // typed structured invocation
```

Assistant content is `(TextContent | ThinkingContent | ToolCall)[]` — the typed-unit array IS the response. Tool calls are first-class content blocks adjacent to text/thinking, not wrappers around prose.

### Scored — every assistant turn carries provenance + cost

```ts
AssistantMessage {
  api, provider, model,
  usage  { input, output, cacheRead, cacheWrite, totalTokens },
  cost   { input, output, cacheRead, cacheWrite, total },
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted",
  errorMessage?, timestamp
}
```

Compute-cost, provider attribution, stop-shape, error-state — all baked into every unit. **`stopReason: "toolUse"` is the thesis-compliant terminator.** Sessions ending in `"stop"` (free-text terminal) are the anti-pattern.

### Addressable — tree-linked, ID-stable

- 8-char hex `id` per entry
- `parentId` links to predecessor (enables branching without copy)
- `toolCallId` cross-refs results to calls
- `parentSession` reference chains forks to origin
- ISO/Unix timestamps on every entry

### Composable — branching, summarization, custom extension hooks

- `branchSummary { summary, fromId }` — fork-point markers
- `compactionSummary { summary, tokensBefore }` — preserves history while reducing tokens
- `CustomMessage { customType, content, display, details }` — extensions write their own typed entries; the canonical extension-output channel
- `/fork` creates new session referencing parent — adversarial-replay substrate is built in

### Persisted — durable, user-owned, file-format

JSONL on disk under user-controlled `~/.pi/agent/sessions/`. Plain text. Inspectable. No SaaS lock-in.

## So: the thesis is not aspirational — it's already enacted

Pi-mono already emits atomic-scored-addressable-composable-persisted typed units for the conversation layer. **The thesis describes what the runtime already does.** Our `.project/*.json` blocks do the same for the project-state layer. We have **two substrates** aligned with the thesis:

| Substrate                      | Scope                | Granularity       | Score fields                                                    | Curation model                        |
| ------------------------------ | -------------------- | ----------------- | --------------------------------------------------------------- | ------------------------------------- |
| `~/.pi/agent/sessions/*.jsonl` | conversation history | per content-block | usage, cost, stopReason, model, provider                        | append-only, tree-linked              |
| `.project/*.json`              | project state        | per block-item    | varies (decisions have status, fragilities have severity, etc.) | curated, schema-validated, typed CRUD |

## The user's caveat — "provided they are parsed" — names the live gap

The substrate is rich. Our consumption is thin.

### What we already do

- `pi --mode json` event stream consumed by workflow executor (subprocess dispatch)
- Behavior monitors consume specific lifecycle events (now `agent_end` post `affe992`)
- Schema validation on block writes via `block-api.ts`

### What we don't do (latent gaps)

1. **No session-JSONL indexer for pi sessions.** `claude-history` exists for Claude sessions; pi sessions have no equivalent in our project. The substrate sits on disk unqueried. `feedback_agent_briefs_require_empirical_cross_validation` requires this — and the substrate exists for it; we just don't read it.

2. **No session → block bridge.** A decision discussed in conversation should land as a typed `decisions.json` item with `parentId` provenance back to the session entry. Today, decisions are hand-authored; the conversation-record they came from is severed.

3. **CustomMessage as our extension-output channel is underused.** Pi-mono provides `CustomMessage { customType, content, details }` as the canonical typed-extension-write to session JSONL. Our diagnostics, monitor verdicts, validation results, and trace entries should write here. This sharpens `feedback_no_stderr_diagnostics`: stderr isn't merely a parallel ungated path — it's anti-thesis specifically because the thesis-compliant alternative (`CustomMessage` → session JSONL) is built into the runtime and we're not using it.

4. **Score fields not used as triage signal.** `usage`, `cost`, `stopReason` per turn — we don't surface these for decision-grade prioritization. Workflow steps don't track per-step cost; agent dispatch doesn't propagate budget; pre-publish smoke tests don't validate `stopReason: "toolUse"` patterns.

5. **Fork / replay infrastructure unused for adversarial audit.** `/fork` + `parentSession` reference enables session branching as audit substrate. The fresh-context auditor (`feedback_adversarial_audits_not_self_audits`) could fork the session at the audit point, replay with adjusted inputs, see what changes. We don't enact this.

6. **The `stopReason: "toolUse"` invariant.** Thesis-compliant turns end in tool calls; thesis-violating turns end in free-text `"stop"`. We could enforce this at validation time — "no agent step accepts an assistant turn with `stopReason: "stop"` and no tool calls in `content`" — making the thesis machine-checkable, not merely aspirational.

## What this confirms about the architecture

**The thesis is the runtime's own model, generalized.** Pi-mono emits the substrate. Our framework adds a curated layer (`.project/`) on top. The two layers are the same shape: typed atomic units with score fields, addressable, composable, persisted. The framework's discipline is:

- Layer 1 (session JSONL) — append-only conversation record; runtime's responsibility
- Layer 2 (`.project/` blocks) — curated project state; framework's responsibility
- Layer 3 (analysis docs, derivations) — compiled views; should regenerate from Layers 1+2

Today Layer 3 is hand-authored (drift risk per Nate lensing). Layer 2 is curated but doesn't ingest from Layer 1 (provenance gap per FGAP-004). Layer 1 sits unindexed.

## Latent operations the confirmation surfaces

1. **Pi-session indexer** — `claude-history`-equivalent for `~/.pi/agent/sessions/*.jsonl`. Same schema reachable, same FTS pattern.
2. **Session → block ingestion bridge** — when a decision/issue/fragility is discussed in conversation, the framework writes a typed item with `parentId` back to the session entry that produced it. Provenance preserved.
3. **`CustomMessage` as canonical diagnostic channel** — replace any remaining `console.log`/stderr usage with `CustomMessage` writes. The runtime gives us the channel; use it.
4. **`stopReason: "toolUse"` as machine-checkable thesis invariant** — fragility check / lint rule that flags assistant turns terminating in `"stop"` with no tool calls.
5. **Per-step cost propagation** — workflow steps record `usage` / `cost` per dispatched subprocess; budget enforcement at workflow boundary (RLM lensing also surfaced this).
6. **Session-fork as adversarial-audit substrate** — `parentSession` reference + `/fork` semantics enable replay-with-modification. Bind to audit workflows.
7. **Layer-3 regeneration recipes** — analysis docs compiled from Layer 1 (session events) + Layer 2 (blocks). Both Nate and RLM lenses pointed here; the substrate confirmation grounds the surface.

The thesis is verified. The substrate is in place at both layers. The work remaining is consumption: parsers, bridges, score-aware triage, regeneration recipes.