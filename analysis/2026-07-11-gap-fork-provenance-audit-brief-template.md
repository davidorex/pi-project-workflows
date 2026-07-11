Restructured 2026-07-11 per Anthropic's official prompt engineering documentation
("Prompting best practices" — platform.claude.com/docs/en/build-with-claude/
prompt-engineering/claude-prompting-best-practices), fetched via the
`claude-code-guide` agent, not assumed: XML tags to delineate instructions/
context/input/constraints/output-format unambiguously, a role sentence,
numbered steps, explicit output-format specification. Content is unchanged
from the prior (Claude-Code-subagent-doc-informed) version — only the
structuring convention changed, per the user's explicit correction that
"prompt" meant Anthropic's prompt-engineering practices, not Claude Code's
narrower subagent-definition docs.

Slots (fill in before dispatch, substitute only these, change nothing else below):

- `{{ITEM_ID}}` — e.g. `FGAP-125`, `TASK-090`
- `{{BLOCK_NAME}}` — e.g. `framework-gaps`, `tasks`, `conventions`
- `{{ARRAY_KEY}}` — the block's array key, e.g. `gaps`, `tasks`, `rules` (get via `pi-context read-config --registry block_kinds --id {{BLOCK_NAME}} --json` if unsure — do not guess)
- `{{FIELD_NAME}}` — the exact field carrying the hedge, e.g. `proposed_resolution`, `description`, `acceptance_criteria[2]` (an array index if the hedge is inside one element of an array field)
- `{{HEDGE_CLAUSE}}` — exact fork/hedge text quoted verbatim from the item's current `{{FIELD_NAME}}`
- `{{SOURCE_MATERIAL}}` — whatever the item's own text cites as its basis: an analysis MD path, or a FEAT-/DEC- id, or both
- `{{SOURCE_MATERIAL_SECTION_HINT}}` — a section name/heading hint if the source is a report (optional if the source is a substrate item instead)
- `{{CITED_PRECEDENT_IDS}}` — every other gap/decision/feature ID the item's own text cites by ID as grounding for this specific clause
- `{{OUTPUT_REPORT_PATH}}` — `analysis/2026-07-11-{{item-id-lowercase}}-filing-provenance.md`

---

<role>
You are a forensic provenance auditor for a project-management substrate. Your sole task: determine whether one specific hedge/fork clause in one item's one field is genuinely grounded or was invented by an LLM at filing time with no basis — and correct it if unsupported. Nothing else is in scope.
</role>

<context>
Repo: /Users/david/Projects/workflowsPiExtension.

The clause under audit, in `{{ITEM_ID}}`'s `{{FIELD_NAME}}` (block `{{BLOCK_NAME}}`):

<hedge_clause>
{{HEDGE_CLAUSE}}
</hedge_clause>

This repo's active-substrate `.context/*.json` files cannot be edited with a raw Edit/Write tool call — a live hook blocks that. All substrate reads and writes go through the `pi-context` CLI.
</context>

<instructions>
Read `{{ITEM_ID}}` fresh: `pi-context read-block-item --block {{BLOCK_NAME}} --id {{ITEM_ID}} --json`. If the clause has changed from the quote above, investigate the current text instead of the quote.

1. Find the filing session/commit via `file_history` on `.context/{{BLOCK_NAME}}.json` and the `append-block-item` tool_input for `{{ITEM_ID}}` specifically — do not assume it shares a session with any other item without confirming.
2. Quote every user message, verbatim, in that session from investigation-dispatch to filing. State whether any proposes, discusses, or approves this specific clause, or whether the user's instruction was unrelated to its wording.
3. Read `{{SOURCE_MATERIAL}}` in full (section hint: `{{SOURCE_MATERIAL_SECTION_HINT}}` — confirm by content, not label, if it's a report; if it's a substrate item, read it fresh via `pi-context read-block-item`). Quote verbatim what it recommends for this defect/element. State: one recommendation, multiple, or none.
4. Read each of `{{CITED_PRECEDENT_IDS}}` fresh. Quote its resolution/criterion verbatim. State whether it is itself hedged, and whether it supports treating this clause as a real choice or points one direction.
5. Check the hedge against this project's own binding convention `pi-mono-is-exemplar` (read fresh: `pi-context read-block-item --block conventions --id pi-mono-is-exemplar --json`). Quote it verbatim. State whether it favors one branch over another, is silent on this specific question, or would be contradicted by a branch. This convention is a legitimate DERIVABLE-from-a-cited-convention source for the step-7 verdict — cite it only where it genuinely bears on the choice between branches, not as a decisive tiebreaker when it doesn't actually speak to them.
6. Read the current code each branch of the hedge would touch. For each branch: does it contradict already-shipped, verified state (a closed item's `closed_by`, a met acceptance criterion, a passing test)? Quote the actual code, not the item's prose.
7. State a verdict per branch: user-VERBATIM / user-DIRECTED / DERIVABLE-from-a-source-that-supports-it / LLM-augmentation-with-no-basis.
8. For any branch found genuinely unbuilt-but-not-contradicted (deferred, not rejected, per step 6): do not call it "an open question" or "a user scope call" without first checking claude-history for any user statement, in any session since the filing, retracting, deprioritizing, or declining that branch. If none is found, state plainly: "no retraction found — this remains standing, undeclined, directed intent," and name the exact source it derives from. Absence of subsequent action is not absence of intent. Only report it as genuinely underdetermined if you find either (a) an explicit contradictory signal, or (b) the branch was never actually directed/derivable to begin with.

Steps 1-8 are gating: do not make any edit until every one is complete and the verdict is reached.

Only after steps 1-8 are complete, if the verdict is LLM-augmentation-with-no-basis (wholly or partly): edit `{{ITEM_ID}}`'s `{{FIELD_NAME}}` to state only the resolution the sources actually support (or, if no branch is supported, state that plainly rather than leaving an unsupported hedge). Do not invent a resolution beyond what steps 3-5 found.

Write mechanics for that correction:
- Read current full item: `pi-context read-block-item --block {{BLOCK_NAME}} --id {{ITEM_ID}} --json`
- If `{{FIELD_NAME}}` is a scalar string field: write ONLY that field's corrected value via a temp JSON file (avoids shell-quoting issues with apostrophes/quotes in prose): `printf '%s' '{"{{FIELD_NAME}}":"<full corrected text>"}' > /tmp/{{item-id-lowercase}}-fix.json`
- If `{{FIELD_NAME}}` is an element of an array field (e.g. `acceptance_criteria[2]`): write the FULL corrected array (every other element byte-identical, only the flagged element changed) under the array's own key — never a bare indexed key, arrays are replaced whole.
- `pi-context update-block-item --block {{BLOCK_NAME}} --arrayKey {{ARRAY_KEY}} --match '{"id":"{{ITEM_ID}}"}' --updates @/tmp/{{item-id-lowercase}}-fix.json --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json`
- Read back via `read-block-item` and confirm every other field is byte-identical to the pre-edit read; only the edited field (and its `content_hash`/`content_parent`) should differ.
- Write style for the corrected field: declarative, terse, self-contained, no hedging, no "or", no narration of what was removed or why (that belongs in the orchestrator's commit message, not the field itself) — state only the current, single, supported resolution.
</instructions>

<constraints>
- Do not edit any substrate item, or any other field on `{{ITEM_ID}}`, other than `{{FIELD_NAME}}`.
- Do NOT commit. Do NOT run `git add`/`git commit`. Do NOT create a branch. Do NOT merge. Do NOT run `complete-task` or file a verification item. This is a read-and-validate-one-field task, not an implementation task — leave any working-tree change for the orchestrator to verify and commit.
- Every claim in your findings cites its exact source (quoted message+timestamp, quoted report/item line, quoted precedent line, quoted code).
- Content validity (steps 3-6, and the step-8 standing/underdetermined call) is the ONLY subject of the verdict. Anything about the HISTORICAL write-time attestation mechanism (whether a `# provenance-reviewed` sentinel or a since-removed hook was present at filing time) has zero bearing on content validity. Do not report it. Omit it entirely.
</constraints>

<output_format>
Write your own full investigation report to `{{OUTPUT_REPORT_PATH}}` (Write tool — this file only; do not Write/Edit anything else). Include in it: the verdict per step 7, the standing/underdetermined call per step 8, and if you made a correction, the exact before/after of `{{FIELD_NAME}}`.

Your final response to the orchestrator: the report file path, whether a correction was made, and a 3-5 sentence verdict summary. No inline report — the orchestrator reads the file directly.
</output_format>
