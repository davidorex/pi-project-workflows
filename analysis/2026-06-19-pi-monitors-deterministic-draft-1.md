## Unified monitor architecture: deterministic → LLM spectrum

*essentially trying to have a single .ts file or set of files that provide foundational biz logic that monitor yaml specs or whatever can declaratively invoke make use of. a kernel as it were.*

The current schema has a hard boundary: `classify` is `required`, every activation goes through `classifyViaAgent` → side-channel LLM → verdict parse. The architecture I'm proposing collapses that boundary by letting a monitor declare where it sits on the spectrum.

### The spectrum

```
deterministic ──────────────────────────────────────────────→ LLM-classified
     │                              │                              │
  declarative                  scripted                       classify
  (when=FLAG)             (.ts state machine)              (LLM agent spec)
     │                              │                              │
     └──────── hybrid: check pre-filters → classify ──────────────┘
```

### Schema change: `check` block, `classify` becomes optional

A monitor must have at least one of `check` or `classify`. Having both = hybrid mode.

```json
{
  "required": ["name", "event", "actions"],
  "anyOf": [
    { "required": ["classify"] },
    { "required": ["check"] }
  ],
  "properties": {
    "check": {
      "type": "object",
      "required": ["mode"],
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["declarative", "script"]
        },
        "script": {
          "type": "string",
          "description": "Path to .ts file relative to monitor dir. Required when mode=script."
        }
      },
      "allOf": [
        { "if": { "properties": { "mode": { "const": "script" } } },
          "then": { "required": ["script"] } }
      ]
    },
    "classify": { /* existing shape, unchanged */ },
    "patterns": { /* required only when classify present */ }
  },
  "if": { "required": ["classify"] },
  "then": { "required": ["patterns"] }
}
```

### Runtime: a single activation path with a branch

The `activate` function currently has one path: `evaluateWhen` → `classifyViaAgent` → handle verdict. The unified version adds a branch BEFORE the LLM call:

```
activate(monitor):
  if !evaluateWhen(monitor, branch) → return        // unchanged gate

  if monitor.check:
    result = runCheck(monitor, ctx, event, branch)  // deterministic
    if result.verdict == "clean":
      handleClean(monitor, result)                  // reset whileCount
      return
    if !monitor.classify:
      handleFlag(monitor, result)                   // fire steer/write directly
      return
    // hybrid: check flagged → inject result.message as extraContext
    // for the LLM classifier, then fall through

  // existing LLM path (unchanged)
  result = await classifyViaAgent(ctx, monitor, branch, extraContext)
  handleVerdict(monitor, result)
```

### Mode 1: `"declarative"` — zero-code deterministic

No `.ts` file. No state. `when` truth = FLAG verdict. The monitor author just omits `classify`:

```json
{
  "name": "read-empty-file",
  "description": "Read returned an empty file — agent may not realize the file exists but is empty",
  "event": "turn_end",
  "when": "has_tool_results",
  "scope": { "target": "main" },
  "check": { "mode": "declarative" },
  "actions": {
    "on_flag": {
      "steer": "Warning: you read a file that exists but returned empty content. Verify the file path is correct before proceeding."
    }
  },
  "ceiling": 3,
  "escalate": "dismiss"
}
```

`runCheck` for declarative mode is a one-liner: `return { verdict: "flag" }`. The `when` condition already determined that something worth flagging happened (tool results present). The steer message is static. Ceiling and escalation still apply — the monitor won't nag forever.

This handles the simple cases from pi-system-reminders that don't need state tracking: `model-changed`, `session-resumed`, `post-compaction`, `file-empty`.

### Mode 2: `"script"` — stateful deterministic

References a `.ts` file with full `ExtensionAPI` access. The file exports a function that tracks state via `pi.on()` and returns an `evaluate` function called at activation time:

```json
{
  "name": "truncated-follow-up",
  "description": "Agent read truncated file content and did not follow up with offset reads",
  "event": "turn_end",
  "when": "has_tool_results",
  "scope": { "target": "main" },
  "check": {
    "mode": "script",
    "script": "truncated-follow-up.ts"
  },
  "actions": {
    "on_flag": {
      "steer": "{{ steer_message }}",
      "write": {
        "block": "issues",
        "merge": "append",
        "array_field": "issues",
        "template": {
          "id": "monitor-{{ finding_id }}",
          "description": "{{ description }}",
          "status": "open",
          "category": "truncation",
          "source": "monitor"
        }
      }
    }
  },
  "ceiling": 5,
  "escalate": "ask"
}
```

The script at `.pi/monitors/truncated-follow-up.ts`:

```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface PendingTruncation {
  path: string;
  lastOffset: number;
  lastLines: number;
}

export default function (pi: ExtensionAPI) {
  const pending = new Map<string, PendingTruncation>();

  pi.on("tool_result", (event: any) => {
    // Track read truncations
    if (event.toolName === "read" && !event.isError) {
      const path = event.input?.path || "unknown";
      const details = event.details;
      if (details?.truncation?.truncated) {
        pending.set(path, {
          path,
          lastOffset: event.input?.offset || 0,
          lastLines: details.truncation?.lines || 0,
        });
      } else {
        // Non-truncated read — if it covers past previous truncation, clear
        const prev = pending.get(path);
        if (prev) {
          const thisOffset = event.input?.offset || 0;
          if (thisOffset === 0 || thisOffset >= prev.lastOffset + prev.lastLines) {
            pending.delete(path);
          }
        }
      }
    }

    // Track bash truncations
    if (event.toolName === "bash" && !event.isError) {
      const details = event.details;
      if (details?.truncation?.truncated) {
        const cmd = (event.input?.command || "unknown").slice(0, 60);
        pending.set(`bash:${cmd}`, { path: `bash:${cmd}`, lastOffset: 0, lastLines: details.truncation?.lines || 0 });
      }
    }
  });

  return {
    evaluate: (_ctx: ExtensionContext, _event: any, _branch: any[]) => {
      if (pending.size === 0) return { verdict: "clean" as const };

      const files = [...pending.values()].map((p) => `\`${p.path}\``);
      return {
        verdict: "flag" as const,
        description: `${pending.size} truncated file(s) not fully read: ${files.join(", ")}`,
        steer_message: [
          `CRITICAL: ${pending.size} file(s) had truncated output and you have NOT read the full content.`,
          `Truncated: ${files.join(", ")}.`,
          `You are operating on INCOMPLETE DATA. Read the remaining content with \`read\` + \`offset\` before any edits or decisions.`,
        ].join("\n"),
      };
    },
  };
}
```

The script runs at extension init time (same lifecycle as pi-system-reminders), registers its `pi.on()` handlers, and returns the `evaluate` function. The monitor runtime calls `evaluate()` at activation time and routes the returned `{ verdict, description, ...extraFields }` through the same actions pipeline that LLM-classified monitors use — same steer rendering, same write actions, same ceiling/escalation.

### Mode 3: Hybrid — deterministic pre-filter → LLM classify

Both `check` and `classify` present. The deterministic check runs first. If it returns CLEAN, the LLM never fires — saving cost and latency. If it returns FLAG, the LLM classify runs with the check's message injected as extra context, giving the classifier more targeted information:

```json
{
  "name": "work-quality",
  "event": "command",
  "when": "always",
  "check": {
    "mode": "script",
    "script": "work-quality-pre-filter.ts"
  },
  "classify": {
    "agent": "work-quality-classifier",
    "context": ["tool_results", "assistant_text", "user_text"]
  },
  "patterns": { "path": "work-quality.patterns.json", "learn": true },
  "actions": { ... }
}
```

The pre-filter script checks cheap deterministic signals (more than N tool calls? files written? bash errors?) and returns CLEAN for simple turns, saving the LLM call:

```typescript
export default function (_pi: ExtensionAPI) {
  return {
    evaluate: (_ctx: ExtensionContext, _event: any, branch: any[]) => {
      const toolCount = countToolCalls(branch);
      const hasWrites = branch.some(e => e.role === "tool" && ["write", "edit"].includes(e.name));
      if (toolCount < 3 && !hasWrites) {
        return { verdict: "clean" as const };
      }
      return {
        verdict: "flag" as const,
        description: `${toolCount} tool calls, hasWrites=${hasWrites} — classify for quality`,
      };
    },
  };
}
```

### What this changes in the codebase

The surface area is small:

| File | Change |
|---|---|
| `schemas/monitor.schema.json` | Add `check` property, remove `classify` from `required`, add `anyOf` gate, conditional `patterns` requirement |
| `index.ts` `MonitorSpec` type | Add `check?: { mode, script? }` field |
| `index.ts` `activate()` | Branch before `classifyViaAgent`: if `check` present, run `runCheck()`, short-circuit on clean or on flag-without-classify |
| `index.ts` new `runCheck()` | ~30 lines: declarative = `{ verdict: "flag" }`, script = load `.ts` + call `evaluate()` |
| `index.ts` new `loadCheckScript()` | jiti-load the `.ts` file, cache the `evaluate` function per monitor |
| New: `examples/truncated-follow-up.ts` | The script for the truncated-follow-up monitor |

Everything else — `handleClean`, `handleFlag`, `executeWriteAction`, steer buffering, ceiling, escalation, dedup, exclusion, scope filtering — is **reused unchanged**. The deterministic path converges into the same post-verdict pipeline the LLM path uses.

### Migration — zero breakage

Existing monitors have `classify` blocks and no `check` block. They continue to work identically — the `anyOf` gate is satisfied by `classify`, the `check` branch in `activate` is never taken, `classifyViaAgent` runs as before.

A monitor author converting from LLM to deterministic:
1. Remove `classify` block
2. Remove `patterns` block  
3. Add `check: { mode: "declarative" }` (or `"script"` + `.ts` file)
4. Keep `actions`, `ceiling`, `escalate`, `when`, `event`, `scope` — all unchanged

### The gap this closes

The pi-system-reminders examples that make no sense as LLM calls all become native monitors:

| pi-system-reminder | Monitor equivalent |
|---|---|
| `bash-spiral.ts` | `check: { mode: "script", script: "bash-spiral.ts" }` — counter in closure |
| `file-churn.ts` | `check: { mode: "script", script: "file-churn.ts" }` — Map in closure |
| `file-truncated.ts` | `check: { mode: "script", script: "truncated-follow-up.ts" }` — Map + follow-up tracking |
| `file-empty.ts` | `check: { mode: "declarative" }` — no state needed |
| `model-changed.ts` | `check: { mode: "declarative" }` |
| `session-resumed.ts` | `check: { mode: "declarative" }` |
| `post-compaction.ts` | `check: { mode: "declarative" }` |
| `context-large.ts` | `check: { mode: "script", script: "context-large.ts" }` — reads `ctx.getContextUsage()` |
| `prefer-edit.ts` | `check: { mode: "script", script: "prefer-edit.ts" }` |
| `read-before-edit.ts` | `check: { mode: "script", script: "read-before-edit.ts" }` |
| `token-usage.ts` | `check: { mode: "script", script: "token-usage.ts" }` |

All of them gain ceiling/escalation, scope filtering, exclusion, and write-to-JSON for free — because they converge into the same actions pipeline. A `bash-spiral` monitor that hits ceiling 5 times auto-dismisses for the session instead of nagging forever. A `file-churn` monitor can write findings to `issues.json` when the agent churns a file 10+ times.

The truncated-follow-up monitor in particular is the one the user cares about — and in this design, it's a single `.ts` script + a `.monitor.json` that inherits the full monitors infrastructure. Zero LLM calls, zero latency, exact file-path + offset tracking.