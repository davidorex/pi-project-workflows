# FGAP-043 `proposed_resolution` hedge-clause provenance audit — 2026-07-11

Audited clause (verbatim, fresh CLI read `pi-context read-block-item --block framework-gaps --id FGAP-043 --json`, 2026-07-11):

> Resolution not yet determined; to be filed as a separate decision.

Clause unchanged from the audit brief's quote. Verdict up front: **user-VERBATIM + user-DIRECTED. Not LLM augmentation. No correction made; the field was not edited.**

All timestamps below are UTC ISO 8601 (Asia/Shanghai local = +8h).

## 1. Filing session and commit for the clause

The clause was not part of the original filing. Three distinct writes produced the field's history, all in Claude Code session `8490e49a-7509-477f-9cb5-92f16552090a` (project workflowsPiExtension):

1. **Original filing — 2026-06-06T11:51** (Write of `/tmp/fgap-043.json` at 11:51:39.295Z, then Bash `append-block-item --block framework-gaps --arrayKey gaps --autoId false --item @/tmp/fgap-043.json` at 11:51:48.876Z; tool result 11:51:51.296Z: `"Appended item 'FGAP-043' to framework-gaps.gaps"`). Filed `proposed_resolution` (verbatim from the tool_input):
   > "Add explicit per-block rhetorical criteria to each block schema (in the description or a dedicated criteria field), machine-checkable. Add a Claude Code PreToolUse hook that intercepts block-item writes (append-block-item / update-block-item via the CLI) and validates the item against the target block's criteria, blocking non-conforming writes."
2. **First update — 2026-06-07T04:41** (Write of `/tmp/fgap-043-update.json` at 04:41:29.505Z; Bash at 04:41:36.416Z filing the `rhetorical-register` convention + `update-block-item --match '{"id":"FGAP-043"}' --updates @/tmp/fgap-043-update.json`; commit `3026ec8` "substrate(.context): file the rhetorical-register convention; FGAP-043 sources it"). Set `proposed_resolution` to the register-convention text: "Validate block-item writes against the rhetorical-register convention (the single canon source) at write time: … The rhetorical-register convention is the canon; do not duplicate criteria per-schema. …"
3. **The audited clause — 2026-06-19T01:08** (update applied between the user grant at 01:07:33.646Z and the read-back tool_result at 01:08:10.859Z showing `"proposed_resolution":"Resolution not yet determined; to be filed as a separate decision."`; assistant at 01:09:00.894Z: "FGAP-043 committed (`0bc9a3e`), husky green. Solution removed; `proposed_resolution` is the register-clean stand-in.").

Cross-session check performed: a 2026-06-14 `append-block-item` for an "FGAP-043" in session `8c933c8b-770a-4c3b-b6b7-7be63588f244` is a **different project** (`cd /Users/david/Projects/wasc-school-wide-improvement-plan`, a seed/theme gap) — unrelated; excluded.

## 2. User messages, verbatim, from dispatch to the clause's filing (session 8490e49a, 2026-06-19)

- 00:58:34.711Z — "now a new gap: block schema property object for rhetorical requirements for each block type"
- 01:00:27.750Z — "update FGAP-043 with the property-object refinement and don't ignore the exact name i gave you"
- 01:00:53.662Z — "update FGAP-043 with the property-object refinement and don't ignore the exact name i gave you. and i did not say this: \"The global rhetorical-register convention remains the canon for shared rules;\n  ▎ the per-block object carries block-type-specific requirements beyond it\""
- 01:04:29.217Z — "and the resulting block will be rhetorically compliant?"
- 01:05:39.259Z — "let's remove the solution from the gap"
- 01:06:53.027Z — "can't we say \"tbd\"?"
- 01:07:33.646Z — "yes. Resolution\n  not yet determined; to be filed as a separate decision.\""

The user **proposed and approved this specific clause**: the assistant (01:07:20.587Z) offered "A register-clean way to say the same thing without a placeholder is to state it as current truth — e.g. \"Resolution not yet determined; to be filed as a separate decision.\"" and the user typed the text back verbatim with "yes." The write executed immediately after. Two later user messages in the same session confirm awareness without objection to the clause itself (01:31:19.665Z ff. object to the assistant's *report noise* mentioning "the FGAP-043 edit", not to the edit). At 01:10:24.429Z the user probed "what is this: the separate decision capturing the property-object solution (named in FGAP-043's stand-in)"; the assistant's pinning (01:10:46.619Z) — "FGAP-043's `proposed_resolution` now reads (your verbatim words) … Whether that future decision adopts the property-object — or something else — is not decided." — drew no user contradiction.

## 3. Source material (fresh reads)

**FGAP-043 `description`** (fresh CLI read): "Each block schema's description states the block's purpose but omits the block's specific rhetorical demands/criteria for its entries (terseness, signal-density, self-containment, appropriateness to block type and downstream use, no narration or git/live-source restatement). The criteria must be embedded per-block and machine-checkable so a Claude Code hook can validate a block-item write against them at write time."

**FGAP-043 `evidence`** (fresh CLI read): two entries — `CLAUDE.md`: "the 'Rhetorical situation for every block write' rule lives only as operating-doc prose — not encoded per-schema, not enforced on write"; `packages/pi-context/samples/schemas/issues.schema.json`: "item descriptions state field purpose but carry no per-block rhetorical criteria; nothing validates an entry against them on write".

**CLAUDE.md §"Rhetorical situation for every block write"** (line 163, fresh read): "Write every block for its consumers and its purpose, no more and no less. Write terse, signal-dense, self-contained entries exactingly appropriate for the block type and for its use downstream. Blocks are state and context atoms designed to be consumed downstream, not prose addressed to a general audience."

**issues.schema.json** (fresh read): descriptions state field purpose only — e.g. block description "Known bugs, missing capabilities, design debt, and open work items. Tracked with title/body (GitHub issue pattern)…"; `title`: "Scannable one-liner (GitHub issue title pattern)"; `body`: "Full detail and context for downstream composition". No rhetorical criteria anywhere (`grep -rn "rhetorical"` over `samples/schemas/`: zero hits). This confirms the evidence claim; the sources evidence the *defect*, they do not state a resolution.

**No external analysis MD or FEAT-/DEC- id is cited by the item's own text** — confirmed true on the fresh read.

**Recommendation count**: the cited evidence sources themselves recommend **none** (they document the absence). The item's own `description` states **one** candidate direction (per-block embedded + machine-checkable + hook-validated at write time). Historically, three competing resolution *shapes* were composed across the field's history (per-schema criteria in descriptions → convention-as-single-canon, "do not duplicate criteria per-schema" → per-block-type structured property object) — i.e. a genuine unresolved design choice existed at the moment the hedge was filed.

## 4. IDs cited by FGAP-043's own text

None. Fresh read: no FGAP-/DEC-/TASK-/FEAT- id appears in any field of FGAP-043. Confirmed no cited-item chain to follow.

## 5. Convention check — `pi-mono-is-exemplar` (fresh CLI read, verbatim)

> "pi-mono (/Users/david/Projects/pi-mono, this project's own upstream platform) is the gold-standard exemplar for how this monorepo designs, installs, and populates anything and everything. Binding on every design decision:
> 1. Population is declarative, not imperative -- resources install from a checked-in manifest reconciled at install/startup time, never a one-shot imperative script.
> 2. Installed/materialized resources are ordinary, locally editable files once installed -- never a read-only pointer to a shared/bundled location as the only option.
> 3. Configuration is two-tier, project-overrides-global, deep-merged.
> 4. Defaults are never hardcoded inline -- always a named, exported constant."

Bearing: rules 1 and 4 are *consonant with* a declarative, machine-readable per-block declaration (the property-object shape) over prose-only criteria, but the convention is **silent on the specific question the hedge defers** — whether a gap's resolution field carries the solution or defers it to a decision, and which of the competing criteria-encoding shapes to adopt. No branch contradicts it. It is not a tiebreaker here and is not used as one.

## 6. Current code/config state per candidate

- No per-block rhetorical criteria mechanism exists anywhere: `grep -rl "rhetorical"` over `packages/pi-context/samples/schemas/`, `packages/pi-context/src/`, and `.claude/hooks/` returns zero hits. The live hooks are `block-substrate-write.sh`, `block-pi-context-glue.sh`, `block-pathspec-commit.sh`, `block-control-chars.sh` (+ tests) — none validates register.
- `rhetorical-register` exists only as a conventions item (fresh CLI read; `enforcement: "review"`, `severity: "error"` — its 6 rules quoted in the session transcript above are byte-identical to the current item).
- No decision covering FGAP-043's resolution exists: `filter-block-items --block decisions --field title --op matches --value '"[Rr]hetor|[Pp]roperty object|[Rr]egister"'` returned only DEC-0003/DEC-0005/DEC-0020 (registry/CRDT-register senses, unrelated); `--field decision --op matches --value '"[Rr]hetorical"'` returned zero. `find-references --itemId FGAP-043 --direction both` returns **zero edges**.
- Consequently: every candidate resolution (per-schema criteria, convention-canon validation, property-object) is **unbuilt**; none contradicts any shipped, verified state; and the hedge's second half ("to be filed as a separate decision") remains literally true — the decision does not yet exist.

## 7. Verdict

**The clause is user-VERBATIM (and user-DIRECTED), not LLM-augmentation.**

- "let's remove the solution from the gap" (user, 2026-06-19T01:05:39Z) — user-DIRECTED removal of the solution from `proposed_resolution`.
- "yes. Resolution not yet determined; to be filed as a separate decision.\"" (user, 2026-06-19T01:07:33Z) — the exact clause text, typed by the user, adopting the assistant's offered register-clean phrasing over the user's own "tbd" candidate.

On the specific question posed — is the hedge a punt given the `description` already states a candidate direction? **No.** The field could not "simply restate the description's own direction" because (a) a genuine unresolved design choice existed (three composed shapes competed: per-schema description prose, convention-as-single-canon with "do not duplicate criteria per-schema", and the user's per-block-type property object — the second and third are mutually exclusive with the first's location choice), and (b) the user was presented the fully composed property-object resolution twice (assistant drafts at 01:01:50Z and 01:05:00Z, each ending "On your `# provenance-reviewed` grant…"), **declined to grant it**, and instead directed removing the solution from the gap. Under the `filing-provenance` convention a deferral "is never derivable — it is a cited user decision or absent"; here it IS the cited user decision. The clause replaced an LLM-composed resolution with the user's own deferral — the opposite of augmentation.

## 8. Standing / underdetermined call

The deferred branch — the resolution content for the future separate decision — is **unbuilt but not contradicted**. Post-filing retraction search across claude-history (FTS `"block schema property object"`, and user-text SQL sweep for `FGAP-043` / `property object` after 2026-06-19T01:08Z): **no retraction found — this remains standing, undeclined, directed intent.** Its exact sources: user messages 2026-06-19T00:58:34Z ("now a new gap: block schema property object for rhetorical requirements for each block type") and 2026-06-19T01:00:27Z ("update FGAP-043 with the property-object refinement and don't ignore the exact name i gave you"). The property-object shape is the resolution direction the user gave and never withdrew; the user's only subsequent scoping act was moving it out of the gap into a to-be-filed decision (which, per §6, remains unfiled — FGAP-043 has zero edges and no matching decision exists). One boundary stands from the uncontradicted 01:10:46Z pinning: whether the future decision adopts the property-object or something else was expressly left undecided, so the *decision's content* awaits the user; the *direction* itself is standing.

## Correction

None. The clause is grounded (user-VERBATIM, 2026-06-19T01:07:33Z), current (no decision has since been filed; the mechanism is unbuilt), and register-compliant by the user's own adoption. `proposed_resolution` was not edited; no substrate write was made.
