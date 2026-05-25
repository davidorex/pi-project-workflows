# FGAP-090 runtime demo + adversarial isolation (2026-05-25)

DEC-0018 gate for TASK-074 (wire `before_agent_start` + `resources_discover`). Verified the eager orientation block reaches a live credentialed in-pi agent. pi 0.75.4; model openrouter/anthropic/claude-haiku-4.5; extension loaded via `--no-extensions --extension packages/pi-context/dist/index.js` (only our built extension; no `.pi/` touched).

## Static gates
- `npm run build && npm run check && npm test` — all exit 0; 4 packages 0-fail.
- Unit (index.test.ts "FGAP-090: guidance hooks"): before_agent_start appends (startsWith base + contains the topic→tool-call routing + grounding); resources_discover returns the absolute `skills/pi-context` dir (SKILL.md exists). Both pass.

## Runtime demo (behavioral)
Prompt: "How would you add a new block kind to this project's substrate? Name the exact tools in the exact order, and say where you'd look up the vocabulary."
Result: the agent answered "Look Up Vocabulary First → `read-samples-catalog` … then `write-schema` … `amend-config`" — the exact tool routing from the orientation block. Tool-name signal counts in the response: read-samples-catalog, read-config, write-schema, amend-config, read-schema, list-tools all present. (/tmp/fgap090-demo.log)

## Adversarial isolation (the decisive check — is it the block or inference?)
Direct presence test — "Quote verbatim the section headed 'how to operate this project substrate', else reply ABSENT":
- **WITH our extension** (/tmp/fgap090-present.log): agent reproduces the block's distinctive phrases verbatim — "typed substrate you operate via tools", "Query before you assert", "never invent canonical names", "do not confabulate". The block IS in the system prompt.
- **CONTROL — base pi, no extension** (/tmp/fgap090-control.log): replies only "ABSENT"; zero block phrases.

Block present WITH extension, absent WITHOUT → the guidance reaches the agent from our `before_agent_start` hook specifically (not base pi, not tool-description inference, not model knowledge). Append-not-replace confirmed in code (index.ts:466-468: `event.systemPrompt + block`) and by the runtime base-prompt preservation.

## Verdict
PASS. The in-pi agent now receives eager framework guidance (topic→tool-call orientation), exact adherence to pi's own before_agent_start mechanism. resources_discover surfaces the skill dir as `<available_skills>` metadata (bodies remain read-gated for the constrained harness → skill-content-via-element-read-tool is FEAT-007, out of scope). FGAP-090 core resolved: guidance reaches the agent.
