# Hedge-audit shard: tasks — consolidated report (2026-07-11)

Procedure: `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, applied per item.
Block `tasks` (array key `tasks`). All 9 items read fresh at audit time; **all 9 are status `planned` (unbuilt)** — a material fact: for an unbuilt task, modal/fork language about implementation mechanism is presumptively genuine remaining design ambiguity, not invented augmentation, unless a cited source actually determined one answer and the filing forked it anyway.

Binding convention checked once for the whole shard: `pi-mono-is-exemplar` (declarative-population / locally-editable-installed / two-tier-config / named-default-constants). It is silent on every flagged clause below — none of the flagged forks is a population/config/default question — so it is not a tiebreaker for any item and is not cited as one.

**Shard verdict: 0 corrections.** Every flagged clause is one of: (a) verbatim/near-verbatim from the source the item cites, (b) a naming placeholder for an as-yet-unnamed op (not a resolution fork), or (c) a source-grounded deferral of an unbuilt design point. No item carries an LLM-augmentation-with-no-basis fork.

---

## TASK-057 — schema version-history audit op

**Flagged clause:** `a read-only command (e.g. \`read-schema-history --schemaName <name>\`)` (description + `acceptance_criteria[0]`); and notes `so DEC-0004 does not speak to them`.
**Nature:** The `e.g.` is a naming placeholder for the not-yet-named read op — not a resolution fork. The notes are a *determined* scope decision ("applied-at + baseline lineage are in-scope recording fixes … event metadata, not git refs/DAG machinery, so DEC-0004 does not speak to them"), stated declaratively, no "or".
**Verdict:** DERIVABLE / determined. Not a fork. No hedge presenting two unchosen branches.
**Disposition:** UNTOUCHED.

## TASK-068 — issues as gap-sibling first-class open-work kind

**Flagged clause:** none substantive on inspection. Description and all 8 acceptance criteria are declarative (registered relation_types, an invariant, a next_ranked entry, additive schema fields, lenses, cross-substrate parity, an explicit "Unchanged:" divergence list). No modal/fork language.
**Verdict:** Fully determined; grounded in FGAP-098 (cited). No fork to adjudicate.
**Disposition:** UNTOUCHED.

## TASK-071 — sanctioned config-repair path

**Flagged clause:** `a \`force\`/\`repair\` opt on amend-config` (description + `acceptance_criteria[3]` + notes).
**Nature:** `force`/`repair` is a naming placeholder for the opt's eventual flag name, not a resolution fork. The *mechanism* is fully determined and explicitly derived in the notes: "config-repair is a validation-skip mode of amend-config — an opt on the existing op, not a separate recover op … derive-decisions 1b (an existing surface/convention)."
**Grounding check (code):** derivation cites real code surfaces — `block-api.ts:~892` is the write-path validation/migration boundary; `context.ts:~1229/1249` is the amend-config opt/merge region. Anchors are real, derivation is not fabricated.
**Verdict:** DERIVABLE-from-existing-op-surface-that-supports-it. Explicitly "No DEC"; the notes carry the full derivation. Not an invented fork.
**Disposition:** UNTOUCHED.

## TASK-074 — materialize declared-but-absent block data files

**Flagged clause:** `a standalone materialize/repair op` (description + `acceptance_criteria[1]`).
**Nature:** `materialize`/`repair` is a naming placeholder. The mechanism is fully determined: materialize the `findUnmaterializedAssets` `missing.blocks[]` set via the install starter-copy path, routed through the FGAP-029 preservation guard (installContext index.ts:1313-1336), with three named invocation points (standalone / update / install) each with a code anchor.
**Verdict:** Determined; not a resolution fork.
**Disposition:** UNTOUCHED.

## TASK-096 — phase-state layer (FEAT-013 pillar 2, keystone)

**Flagged clause:** `.claude/state/pipeline.json or a substrate-native work-order`; and `session-local fields … are not substrate-native (requirements report R14 … defers that)`; and `PostToolUse(Agent) — one of the unverified hook events; verify-first`.
**Source check:** cited source `analysis/2026-07-06-harness-requirements.md`. **R11 reads VERBATIM:** "A machine-readable per-work-unit pipeline state (`.claude/state/pipeline.json` or a substrate-native work-order item)." The location fork is the source's own fork, reproduced faithfully — not an LLM invention. R14 in the report discusses making the invariant "substrate-native" as a longer-term/deferred item, consistent with the task's deferral citation. The "unverified hook events; verify-first" is honest engineering caution about a genuinely-unconfirmed hook event, not a resolution hedge.
**Step-8 standing call:** the "substrate-native work-order" branch is genuinely unbuilt-but-not-contradicted; the FEAT-013 milestone is active and the task is current (`created 2026-07-06`, still `planned`). No retraction signal — it remains standing, source-directed, deliberately open per R11. Genuinely underdetermined *by the source's own design*, not by LLM invention.
**Verdict:** DERIVABLE-from-source / genuinely-open-per-source. Not an invented fork.
**Disposition:** UNTOUCHED.

## TASK-097 — source-edit gate (FEAT-013 pillar 1)

**Flagged clause:** conditional/gate language ("block on … or without a plan-approval stamp"; "user-sentinel escape").
**Source check:** VERBATIM-traceable to harness-requirements **R5** ("no source edit on the integration branch; no source edit without an approved plan … Escape: user sentinel"), **R15** (orchestrator-implements gate, delegation scoping), **R16** (investigation-delegation nudge). The "or" in the block condition is a conjunctive gate predicate (block if branch=integration OR no-plan-stamp), not an unresolved resolution fork.
**Verdict:** DERIVABLE-from-source (near-verbatim R5/R15/R16). Not a fork.
**Disposition:** UNTOUCHED.

## TASK-098 — Stop-hook ask gate (FEAT-013 pillar 3)

**Flagged clause:** `Regex first; invokeMonitor classification if regex is too blunt`; and `fails OPEN (nudge, not block)`.
**Source check:** harness-requirements **R12 reads VERBATIM:** "Regex first; `invokeMonitor` classification if regex proves too blunt." This is a *staged implementation strategy* (regex baseline, escalate only if insufficient), not an unchosen A-or-B fork — and it is the source's own wording. "Fails open on uncertainty" is a determined design decision per the block-vs-nudge principle (a false positive would block a legitimate stop), not a hedge.
**Verdict:** DERIVABLE-from-source (verbatim R12). Not an invented fork.
**Disposition:** UNTOUCHED.

## TASK-100 — guard extensions + nudges (FEAT-013 pillar 5)

**Flagged clause:** none substantive; description enumerates determined guard behaviors. Lexical-scan marker list and nudge/block severities are declarative.
**Source check:** traceable to harness-requirements **R7/R8/R10/R19** (cited). R10 verbatim carries the subagent-relay verification-checklist wording.
**Verdict:** Determined; grounded. No fork to adjudicate.
**Disposition:** UNTOUCHED.

## TASK-118 — implement FGAP-126's corrected resolution (filed this session)

**Flagged clause (per orchestrator's specific call-out):** conditional language `the interactive orchestrator performs any of these when needed, not the headless dispatch`.
**Source check:** cited source **FGAP-126** `proposed_resolution` reads VERBATIM: "apply the FGAP-068 caller-as-reconciler shape (the interactive orchestrator authors; non-interactive steps never need the gated ceremony); close the coverage inconsistency by routing run-work-order-loop's commit through the gated commit-attested tool path instead of the ungated attestedCommit library call." TASK-118's two-part description is a faithful, near-verbatim restatement. The "when needed" conditional IS the caller-as-reconciler shape (FGAP-068), a source-determined behavior — not an invented ambiguity.
**Grounding check (code):** `work-order-loop.ts:254` confirmed = `commit = await _internals.attestedCommit(cwd, {…})` — exact match to the cited ungated call the task targets.
**Adjudication of the orchestrator's question:** the flagged language is NEITHER a genuine-remaining-ambiguity hedge NOR an invented hedge about something already knowable — it is a *determined* design directive lifted verbatim from FGAP-126's corrected resolution. Nothing in it is TBD or forked.
**Verdict:** DERIVABLE-from-FGAP-126-that-supports-it (near-verbatim). Not a hedge.
**Disposition:** UNTOUCHED.

---

**No substrate writes made.** Working tree unchanged by this audit.
