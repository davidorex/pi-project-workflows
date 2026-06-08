Yes — monitors can do exactly this. The `tool_call` event + pre-execution blocking is already demonstrated by the bundled `unauthorized-action` monitor. Here's the fit:

## The mechanism already exists

| Monitor capability | What FGAP-043 needs |
|---|---|
| `event: "tool_call"` | Fires *before* the tool executes |
| `{ block: true, reason }` return | Prevents the write entirely |
| `when: "tool(name)"` | Match only `append-block-item` / `update-block-item` |
| Classify agent with Nunjucks template | LLM evaluates item prose against the convention |
| `on_flag` / `on_new` actions | Steer + optionally write finding to issues.json |
| `ceiling` + `escalate` | Don't block the agent indefinitely |

## The shape

A `.pi/monitors/rhetorical-register.monitor.json`:

- **event:** `tool_call`
- **when:** `tool(append-block-item)` or pattern-match on tool name
- **classify context:** `tool_call_context` (the pending tool name + args containing the item text)
- **template:** presents the 6 rhetorical-register rules + the item prose → CLEAN / FLAG:desc / NEW:pattern|desc
- **on_flag action:** `block: true` with a steer surfacing which rule was violated

## The one constraint

There's no context collector that dynamically composes arbitrary substrate convention text — the built-in `project_conventions` collector reads `conformance-reference.json` principle names, not `conventions.json` bodies. So the 6 register rules would be **embedded directly in the classify template** (or in the instructions file). The substrate convention remains the canon; the template is a snapshot. If the convention changes, the template updates.

That's the same relationship bundled monitors have with their patterns — the monitor is a project artifact, not a framework feature. The convention in `.context/conventions.json` is the source of truth; the monitor is its enforcement arm.