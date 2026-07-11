Slots (fill in before dispatch, substitute only these, change nothing else below):

- `{{GAP_ID}}`
- `{{HEDGE_CLAUSE}}` — exact fork text quoted verbatim from the gap's current `proposed_resolution`
- `{{SOURCE_REPORT_PATH}}`
- `{{SOURCE_REPORT_SECTION_HINT}}`
- `{{CITED_PRECEDENT_IDS}}`
- `{{OUTPUT_REPORT_PATH}}` — `analysis/2026-07-11-{{gap-id-lowercase}}-filing-provenance.md`

---

Repo: /Users/david/Projects/workflowsPiExtension.

Determine the provenance of this exact clause in `{{GAP_ID}}`'s `proposed_resolution`:

> {{HEDGE_CLAUSE}}

Read `{{GAP_ID}}` fresh: `pi-context read-block-item --block framework-gaps --id {{GAP_ID}} --json`. If the clause has changed from the quote above, investigate the current text.

1. Find the filing session/commit via `file_history` on `.context/framework-gaps.json` and the `append-block-item` tool_input for `{{GAP_ID}}` specifically — do not assume it shares a session with any other gap without confirming.
2. Quote every user message, verbatim, in that session from investigation-dispatch to filing. State whether any proposes, discusses, or approves this specific clause, or whether the user's instruction was unrelated to its wording.
3. Read `{{SOURCE_REPORT_PATH}}` in full (section hint: `{{SOURCE_REPORT_SECTION_HINT}}` — confirm by content, not label). Quote verbatim what it recommends for this defect. State: one recommendation, multiple, or none.
4. Read each of `{{CITED_PRECEDENT_IDS}}` fresh. Quote its resolution/criterion verbatim. State whether it is itself hedged, and whether it supports treating this clause as a real choice or points one direction.
5. Check the hedge against this project's own binding convention `pi-mono-is-exemplar` (read fresh: `pi-context read-block-item --block conventions --id pi-mono-is-exemplar --json`). Quote it verbatim. State whether it favors one branch over another, is silent on this specific question, or would be contradicted by a branch. This convention is a legitimate DERIVABLE-from-a-cited-convention source for the step-7 verdict — cite it only where it genuinely bears on the choice between branches, not as a decisive tiebreaker when it doesn't actually speak to them.
6. Read the current code each branch of the hedge would touch. For each branch: does it contradict already-shipped, verified state (a closed gap's `closed_by`, a met acceptance criterion, a passing test)? Quote the actual code, not the gap's prose.
7. Verdict per branch: user-VERBATIM / user-DIRECTED / DERIVABLE-from-a-source-that-supports-it / LLM-augmentation-with-no-basis.
8. For any branch found genuinely unbuilt-but-not-contradicted (deferred, not rejected, per step 6): do not call it "an open question" or "a user scope call" without first checking claude-history for any user statement, in any session since the filing, retracting, deprioritizing, or declining that branch. If none is found, state plainly: "no retraction found — this remains standing, undeclined, directed intent," and name the exact source it derives from (the acceptance criterion / decision / gap text that directed it). Absence of subsequent action is not absence of intent. Only report it as genuinely underdetermined if you find either (a) an explicit contradictory signal, or (b) the branch was never actually directed/derivable to begin with.

Steps 1-8 are gating: do not make any edit until every one is complete and the verdict is reached. No edit before provenance (claude-history) and code-currency checks are both done.

## Only after steps 1-8 are complete: if the verdict is LLM-augmentation-with-no-basis (wholly or partly), correct it yourself

Edit `{{GAP_ID}}`'s `proposed_resolution` field to state only the resolution the sources actually support (or, if no branch is supported, state that plainly in the field rather than leaving an unsupported hedge). Do not touch any other field on the item. Do not invent a resolution beyond what steps 3-5 found.

Substrate write mechanics (this repo's active-substrate `.context/*.json` files cannot be edited with a raw Edit/Write tool call — a live hook blocks that; use the CLI):

- Read current full item: `pi-context read-block-item --block framework-gaps --id {{GAP_ID}} --json`
- Write ONLY the changed field via a temp JSON file (avoids shell-quoting issues with apostrophes/quotes in prose):
  `printf '%s' '{"proposed_resolution":"<full corrected text>"}' > /tmp/{{gap-id-lowercase}}-fix.json`
  `pi-context update-block-item --block framework-gaps --arrayKey gaps --match '{"id":"{{GAP_ID}}"}' --updates @/tmp/{{gap-id-lowercase}}-fix.json --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json`
- Read back via `read-block-item` and confirm every other field is byte-identical to the pre-edit read; only `proposed_resolution` (and its `content_hash`/`content_parent`) should differ.
- Do NOT commit. Do NOT run `git add`/`git commit`. Leave the working tree changes for the orchestrator to verify and commit.
- Write style for the corrected field: declarative, terse, self-contained, no hedging, no "or", no narration of what was removed or why (that belongs in the orchestrator's commit message, not the field itself) — state only the current, single, supported resolution.

Constraints:
- Do not edit any substrate item other than `{{GAP_ID}}`'s `proposed_resolution`.
- Every claim in your findings cites its exact source (quoted message+timestamp, quoted report line, quoted precedent line, quoted code).
- Write your own full investigation report to `{{OUTPUT_REPORT_PATH}}` (Write tool — this file only; do not Write/Edit anything else). Include in it: the verdict per step 7, the standing/underdetermined call per step 8, and if you made a correction, the exact before/after of `proposed_resolution`.
- Final response to the orchestrator: report file path, whether a correction was made, and a 3-5 sentence verdict summary. No inline report.
- Content validity (steps 3-6, and the step-8 standing/underdetermined call) is the ONLY subject of the verdict. Anything about the HISTORICAL write-time attestation mechanism (whether a `# provenance-reviewed` sentinel or a since-removed hook was present at filing time) has zero bearing on content validity. Do not report it. Omit it entirely from the report and from the final response — it is not evidence toward any verdict this audit produces.
