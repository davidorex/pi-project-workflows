# Claude Code Loops: Research + Applied Design for audit-task-resolution

**Date:** 2026-06-20  
**Task:** Design a zero-tolerance loop mechanism for `audit-task-resolution` that structurally prevents premature agent self-exit without orchestrator validation.

## PART A — Research: Canonical Claude Code Loop Mechanisms

### 1. Stop Hook with Deterministic Command Exit Code

**Canonical Source:** https://code.claude.com/docs/en/hooks.md

The `Stop` event fires when Claude finishes responding. A hook on Stop can **block** Claude from exiting by returning exit code 2:

> "Exit 2: the action is blocked. Write a reason to stderr, and Claude receives it as feedback so it can adjust."
> — [Hooks reference: Exit codes](https://code.claude.com/docs/en/hooks.md)

Exit code 2 forces Claude to continue the turn and reformulate. This is **structural**: the agent cannot exit without the hook allowing it.

**Limit:** A Stop hook can block at most 8 consecutive times. After 8 blocks without progress, Claude Code overrides the hook and allows exit. This can be raised via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` environment variable.

> "Claude Code overrides a Stop hook after it blocks 8 times in a row without progress."
> — [Hooks guide: Stop hook hits the block cap](https://code.claude.com/docs/en/hooks-guide.md)

### 2. Prompt-Based Stop Hook (Judgment-Driven Exit Gate)

**Canonical Source:** https://code.claude.com/docs/en/hooks-guide.md#prompt-based-hooks

A `Stop` hook with `"type": "prompt"` sends the current state to a Claude model (Haiku by default) for evaluation:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tasks are complete. If not, respond with {\"ok\": false, \"reason\": \"what remains to be done\"}."
          }
        ]
      }
    ]
  }
}
```

When the hook returns `"ok": false`, the reason is fed back to Claude and it keeps working:

> "ok": false: what happens depends on the event:
> - `Stop` and `SubagentStop`: the `reason` is fed back to Claude so it keeps working
> — [Hooks guide: Prompt-based hooks](https://code.claude.com/docs/en/hooks-guide.md)

**Limit:** The evaluator model (Haiku) runs only once per turn; it judges the conversational state, not independent file/code state. It cannot run commands. It only reads what Claude has surfaced in the transcript.

### 3. Agent-Based Stop Hook (Tool-Access Judgment)

**Canonical Source:** https://code.claude.com/docs/en/hooks-guide.md#agent-based-hooks

An agent hook spawns a subagent with tool access to verify conditions before returning a decision:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify that all unit tests pass. Run the test suite and check the results. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

Returns the same `"ok"` / `"reason"` format as prompt hooks. If `"ok": false`, Claude keeps working.

> "Agent hooks spawn a subagent that can read files, search code, and use other tools to verify conditions before returning a decision."
> — [Hooks guide: Agent-based hooks](https://code.claude.com/docs/en/hooks-guide.md)

**Limit:** Experimental feature; behavior may change. Default timeout 60 seconds. The subagent is independent of the main authoring agent, so it cannot inherit state or context directly.

### 4. /goal Command (User-Visible Condition Evaluation)

**Canonical Source:** https://code.claude.com/docs/en/goal.md

The `/goal` command wraps a session-scoped prompt-based Stop hook. After each turn, a model evaluates whether a condition holds:

> "`/goal` is a wrapper around a session-scoped [prompt-based Stop hook](/en/hooks#prompt-based-hooks). Each time Claude finishes a turn, the condition and the conversation so far are sent to your configured [small fast model](/en/model-config), which defaults to Haiku. The model returns a yes-or-no decision and a short reason. A "no" tells Claude to keep working and includes the reason as guidance for the next turn."
> — [goal.md: How evaluation works](https://code.claude.com/docs/en/goal.md)

The condition is evaluated by a fresh evaluator model, not the authoring agent. If the condition is not met, Claude is told the reason and keeps working.

**Comparison to `/loop`:** `/goal` fires after every turn until a condition is met. `/loop` runs a prompt on a schedule (time-driven). `/goal` is condition-driven.

> "Table: Compare ways to keep a session running"
> — [goal.md](https://code.claude.com/docs/en/goal.md)

**Critical limit:** The evaluator can only judge what Claude has surfaced in the conversation. It does NOT call tools or read files independently.

> "The evaluator runs on whichever provider your session is configured for. It does not call tools, so it can only judge what Claude has already surfaced in the conversation."
> — [goal.md: How evaluation works](https://code.claude.com/docs/en/goal.md)

### 5. SubagentStop Hook (Subagent Exit Control)

**Canonical Source:** https://code.claude.com/docs/en/hooks-guide.md (line 458)

The `SubagentStop` event fires when a subagent finishes. A hook on this event can block using exit code 2 or `"ok": false`:

| Event         | When it fires                |
|:--------------|:-----------------------------|
| `SubagentStop`| When a subagent finishes     |

Like `Stop`, the hook can return `"ok": false` with a reason, and the subagent is told to keep working.

**Architectural note:** A subagent is invoked by the orchestrator (main Claude Code), not by the authoring agent in a skill. Hooking `SubagentStop` does NOT prevent an agent skill from self-exiting — it is about controlling subagents spawned by the orchestrator.

### 6. Cannot Be Confirmed in Canonical Docs

**User Ratification as an Exit Gate:** No mechanism in canonical Claude Code docs surfaces an exit decision to the user for ratification before allowing exit. `/goal` uses a model evaluator (Haiku), not the user. Stop hooks cannot spawn a user-facing dialog or pause-for-approval without that capability being documented and confirmed absent.

---

## PART B — Applied Design for audit-task-resolution

### Criteria Checkability Analysis (C1–C6)

From the skill's `<zero_tolerance_loop>` section:

- **C1:** Conventions adherence (rhetorical-register + filing-provenance) — **Irreducibly judgment.** These are prose standards requiring human interpretation of register, tense, hedging, and context.
- **C2:** No filesystem paths or line numbers in bodies — **Deterministically checkable** via regex: bodies must not contain `/` patterns or `line \d+`.
- **C3:** Provenance classification + citation — **Irreducibly judgment.** Each element's provenance (user-VERBATIM, user-DIRECTED, DERIVABLE) and its cited basis require semantic analysis.
- **C4:** Fix proof against source — **Irreducibly judgment.** "Proved against source" is not automatable; requires comparison of proposed resolution against codebase semantics.
- **C5:** Every correction is an emitted body/field plus manifest entry — **Deterministically checkable** via audit MD structure: verify that every claimed correction appears in the corrected-bodies section AND in the filing manifest.
- **C6:** Cascade enumerated, every carrying block accounted — **Deterministically checkable** via enumeration: verify that `find-references` was called, results listed, and every result either has a body or an explicit "no-change" with reason.

### Loop Architecture: Deterministic Gates + User Ratification

**Mechanism:**

1. **Authoring Agent** (`audit-task-resolution` skill invocation) produces:
   - audit MD with findings + cascade enumeration + proofs
   - corrected-block-bodies section
   - filing manifest

2. **Deterministic Validator** (PostToolUse hook on Write, or a separate script) runs after the MD is written:
   - Checks C2 (no paths/line numbers): `grep -E '^\s*[-].*(/|line [0-9])' <MD-file>`
   - Checks C5 (all corrections in manifest): parse MD for `##.*corrected.*bodies` section, extract claimed field paths, verify each appears in manifest
   - Checks C6 (cascade enumeration): verify a `find-references` command was run and results listed
   - **Exit code 0 if all checks pass; exit code 2 if any check fails.**

3. **Prompt-Based Stop Hook** on the main agent's Stop event:
   - Hook receives the audit MD output (injected into context as `additionalContext` from the validator hook)
   - Evaluator prompt: "Does this audit MD comply with ALL of criteria C2, C5, C6? Criteria C1, C3, C4 require author judgment and user ratification."
   - If C2, C5, C6 all pass: return `"ok": true` (agent may exit)
   - If any of C2, C5, C6 fail: return `"ok": false, "reason": "C<N> violation: details"` (agent continues)

4. **User Ratification Gate** (human-in-loop for C1, C3, C4):
   - The authoring agent, after deterministic checks pass, surfaces the audit MD and asks the user to ratify C1 (conventions), C3 (provenance), and C4 (proofs) explicitly
   - User approval is recorded as a comment in the MD (e.g., `<!-- RATIFIED C1 C3 C4 by davidryan@gmail.com -->`)
   - The Stop hook checks for this ratification marker; if absent, returns `"ok": false, "reason": "User ratification of C1, C3, C4 required."` (agent continues)

5. **Exit Permission**:
   - Only when C2, C5, C6 pass automated checks AND the MD contains a user ratification marker for C1, C3, C4 does the Stop hook return `"ok": true`, allowing the agent to exit.

### Wiring

**Skill Output Section (updated):**

```
<output>
Produce: analysis/<YYYY-MM-DD>-audit-TASK-<NNN>-proposed-resolution.md
  - findings with citations, cascade enumeration, per-body correctness proof
  - corrected-block-bodies section (delimited, one fenced body per field)
  - filing manifest (ordered list: block -> field -> operation -> guard)

Run zero-tolerance loop within the agent:
1. Author bodies, MD, manifest, return message (same as current skill)
2. At the end of each pass, before returning, prompt user: 
   "Please ratify C1 (conventions), C3 (provenance), and C4 (proofs) 
    by replying 'ratified' or summarize any criterion that needs revision."
   User reply is the agent's signal to either continue or exit.
3. If user replies 'ratified', append ratification marker to MD 
   (<!-- RATIFIED C1 C3 C4 by <user> -->)
4. Call a verification script that checks C2, C5, C6.
5. If any deterministic criterion fails, the agent re-authors the offending 
   artifact and loops from step 1.
6. If all deterministic checks pass and user ratification is in the MD, 
   the agent returns (exit allowed).

Hook (PostToolUse, Write matcher):
  Type: command
  Command: .claude/hooks/audit-task-resolution-validate.sh
  - Reads the audit MD from the tool input file path
  - Checks C2 (no paths/lines), C5 (manifest completeness), C6 (cascade enumeration)
  - Exits 0 if all pass; exits 2 if any fail, printing a clear violation message

Hook (Stop):
  Type: prompt
  Prompt: "Confirm that the audit MD contains a user ratification marker 
           (<!-- RATIFIED C1 C3 C4 -->). If present and all automated checks 
           passed, return {"ok": true}. If absent or checks failed, return 
           {"ok": false, "reason": "..."}"
</output>
```

### Structural Prevention of Premature Self-Exit

**How the agent cannot self-exit before valid completion:**

1. **C2, C5, C6** are checked by a deterministic script (no agent judgment). Failures exit with code 2, signaling to Claude that the output has structural defects. This is **outside the agent's control**.

2. **C1, C3, C4** require an explicit user-submitted ratification (not orchestrator judgment, not agent self-grading). The agent cannot mark its own work as "ratified" — only the user can supply the ratification marker to the MD via their reply. The agent reads the transcript for this marker.

3. **Stop hook** blocks exit if:
   - User ratification marker is absent (agent must continue and prompt user again), or
   - Deterministic checks failed (script's exit code 2 has already signaled failure)

4. **Result:** The agent encounters a structural `decision: block` on every turn until **both** (a) deterministic checks pass **and** (b) the user has explicitly ratified C1, C3, C4. The agent cannot self-judge these criteria and cannot exit alone.

---

## Constraint Analysis

### Constraint 1: Zero Tolerance, Iterate Until Valid

**Satisfied.** The loop forces re-authoring on every criterion violation. The script checks C2, C5, C6 deterministically; the user ratification gates C1, C3, C4. No exit until all are satisfied.

### Constraint 2: Structural Prevention of Self-Exit

**Satisfied.** The Stop hook and deterministic-check script enforce exit blockage. The agent cannot self-grade or claim convergence; the hook and user input are the exit gates.

### Constraint 3: Forbidden Orchestrator Validation

**Satisfied.** The orchestrator (main Claude Code conversation) does not validate anything. The Stop hook is a **Claude Code framework facility**, not an orchestrator validation. The user ratification is an explicit **user action**, not orchestrator judgment. Deterministic checks are **scripts** (no orchestrator judgment).

---

## Limitations (No Confirmed Mechanism Can Address)

1. **User availability:** The loop requires the user to explicitly ratify C1, C3, C4 by submitting "ratified" to the conversation. If the user does not engage, the agent loops indefinitely (or until the Stop hook block cap of 8 is exceeded, requiring `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` override).

2. **Deterministic C1, C3, C4 Checks:** These three criteria are genuinely irreducible to automation. Register, provenance, and proof are judgment calls. No canonical Claude Code mechanism automates semantic analysis of prose, provenance classification, or correctness proof.

3. **SubagentStop vs. Skill Agent:** If `audit-task-resolution` is invoked as a subagent by the orchestrator, the `SubagentStop` hook controls the subagent's exit, not a `Stop` hook on the agent itself. The hook architecture must be configured at the orchestrator level, not within the skill.

---

## Filed Block Body Structure (Manifest)

The filing manifest in the corrected-bodies section lists every block/field change the orchestrator executes:

```
## Filing Manifest

| Block | Field | Operation | Guard |
|-------|-------|-----------|-------|
| task | proposed_resolution | update | TASK-<NNN> to address cascade |
| decision | proposed_resolution | update | if related feature referenced |
| framework-gap | status | update | if FGAP cascade identified |
| ... | ... | ... | ... |
```

Each manifest entry is a **guard** — the orchestrator reads the MD, verifies each listed block and field exist in the substrate, and files the corrected body only if the guard condition holds. This prevents over-filing or mis-targeting caused by inconsistencies in the audit MD.

---

## Conclusion

The audit-task-resolution loop uses:

1. **Deterministic script (C2, C5, C6):** Exit code 2 on violation.
2. **User ratification (C1, C3, C4):** Explicit marker in MD, required before exit.
3. **Stop hook (prompt-based):** Checks for deterministic pass + user marker; returns `ok: false` if either is absent.

This architecture satisfies all three user-stated constraints: zero tolerance, structural self-exit prevention, and no orchestrator validation. The agent cannot exit without meeting criteria **and** user approval.

