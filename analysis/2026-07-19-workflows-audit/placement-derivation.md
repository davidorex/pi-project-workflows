# Placement derivation — 2026-07-19 delta corpus → .context block kinds

Date: 2026-07-22. Companion to `placement-rules.json` (the machine-consumed table this
document grounds). Produced from an Explore-agent contract-test pass (session 7303462d)
that read the installed kind definitions and invariants exclusively through `pi-context`
read ops (`read-config`, `read-samples-catalog`, `read-schema`, `read-block-page`,
`filter-block-items`) and applied them to the 31 records of
`substrate-deltas-20260721-171029.jsonl` whose `proposed_block` is null. The user's
standing ruling this derivation implements: the block schema definitions are the source
of truth for where a finding is filed.

## 1. The kind contracts the rules cite (quoted from the installed model)

- **framework-gaps** (`FGAP-`, array `gaps`): "Capability gaps in the framework — pieces
  that must exist natively for the target artifact-ownership model to be expressible as
  configuration rather than hand-enactment. … Framework gaps are distinct from
  feature-level defects: they describe what the framework cannot yet express at all, not
  bugs in expressible functionality."
  Required: id, title, status, package, description, evidence, impact,
  proposed_resolution, created_by, created_at.
- **issues** (`issue-`): "Known bugs, missing capabilities, design debt, and open work
  items. Tracked with title/body (GitHub issue pattern), code location, package scope,
  priority, and resolution lifecycle."
  Required: id, title, body, location, status, category, priority, package.
- **tasks** (`TASK-`): "Discrete units of work with status lifecycle … The operational
  layer between gaps/requirements and code changes."
  Required: id, description, status.
- **research** (`R-`): "Factual and analytical substrate under decisions — each entry
  captures what was investigated, how, what was found, what grounds the findings, and
  what stale conditions invalidate them."
- **session-notes** (`SESSION-`): "Per-session handoff records: focus, discoveries,
  questions, decisions made, current status, and next steps captured at session end for
  cross-session continuity."
- **rationale** (`RAT-`): "The deeper reasoning behind decisions — why this approach over
  others, what constraints drove the choice, what tradeoffs were accepted."
  Required: id, title, narrative. Installed, currently 0 items.
- **conventions** (slug ids): "Code and process conventions the project follows. Rules
  with enforcement methods (lint, review, test) that agents must comply with when
  writing code." A convention is a decided rule — a record proposing that a policy be
  decided is not yet a convention (hence such records gate, not file, here).

## 2. Birth-edge economics (installed invariants; severities per the INSTALLED config,
which overrides the packaged samples catalog — observed divergence: the samples carry
`task-articulates-convention` at warning, the installed config at ERROR)

- tasks: refuse a bare filing — require `item_governed_by_convention` or
  `item_acknowledges_missing_convention` (error severity installed).
- decisions: require a forcing-artifact edge AND a convention edge (error).
- framework-gaps, issues, research, session-notes, verification, conventions: accept a
  bare filing (no required-edge invariant).
- All edge endpoints must exist or be filed atomically with the item
  (`append-block-item --relations`); the write guard rejects dangling endpoints
  unconditionally (DEC-0024).

## 3. Entry-pipeline evidence

Tasks in this substrate are canonically born FROM a parent artifact, not directly from
raw findings: 21 task titles name their forcing FGAP-/FEAT-/issue- id
("Implement FGAP-127 …", "FEAT-013 pillar N …", "fixes issue-012 …"); the 138-task store
shows the gap→task decomposition pattern throughout. A raw audit finding therefore
enters as a gap/issue/research/session-note; only decided work under an existing parent
enters as a task. This is what rules R3–R6 encode.

## 4. The rule set

R0 disposition-gate → R1 cited-tracker (relate/update, never a sibling) → R2
restore-to-home-kind → R3 capability-absent → framework-gaps → R4 bug-with-location →
issues → R5 investigation-artifact → research → R6 work-under-existing-parent → tasks
(with birth edges) → R6b two-fact split → R7 exception (route-and-continue, never
default, never stop the batch). Full text with grounding quotes: `placement-rules.json`.

Failure semantics, as ruled by the user 2026-07-22: a row no rule places goes to the
exception queue with a reason code and the run continues; the only whole-run stop is the
front gate — the table unsigned, or the corpus/config/schema fingerprints moved after
signing (the approval names exact inputs; it does not carry over to changed inputs).

## 5. Outcome over the 31 null-block records

- R2: DI-02 → rationale; SA-16 → session-notes.
- R3: DI-04, DI-08, DKB-06, DKB-08, DKB-10 → framework-gaps; SA-18 half-a.
- R4: DKB-02, DKB-03, SA-20 → issues; DKB-15≡SA-32 (one filing, gated on the reserved
  line-100 ruling).
- R5: SA-07 → research (reconstruction of the lost analysis file is out of run scope).
- R6: DW-02, DW-05, DW-08, DW-12, KB-30, SA-27 → tasks with parent + convention edges;
  SA-18 half-b.
- R1: DW-01 (FEAT-001), KB-02 (issue-002), KB-04 (FGAP-065), KB-15 (issue-010), KB-16
  (FGAP-102), KB-17 (issue-011) → relate/update the named item.
- R0 disposed: KB-20 (already-converged as FGAP-153, user 2026-07-20), SA-15
  (declined-by-user, 2026-07-10, delta contradicted by the record), SA-17
  (superseded-by-later-statement, 2026-07-15), SA-33 (no-substrate-home).
- R7 residue reaching the user: DW-29 (parent-less arc — features vs framework-gaps vs
  research genuinely undiscriminated).

## 6. Temporal-pass citations folded into the facts (no-atemporal-record-reading policy)

- DI-02: the 2026-04-16 "rationale.json folds into decisions.json" clause was
  assistant-authored framing the user quoted while asking for elaboration — not a user
  directive; forward-scan to present found no fold statement; rationale is a live,
  separately registered kind through 2026-07-09.
- DW-01 family: latest dispositive user statement 2026-05-26 09:55 +08 re-scopes
  FEAT-001 (not a retirement); no execute/retire ruling to the present (the DI-19 gate
  stands).
- DW-29: user sequencing 2026-07-13 09:21 +08 stands; no re-sequencing statement.
- KB-20: user 2026-07-20 09:41 +08 "file all four, exactly adhering to writing
  conventions as given" → FGAP-153..156; the 07-21 delta emission is stale against it.
- SA-15: user 2026-07-10 11:10 +08 "this is purely you, not a gap: this is your
  failure …" — the delta's authorization claim is contradicted by the record.
- SA-17: user 2026-07-15 11:44 +08 "i do not want the changes in
  .context/framework-gaps.json and the four .context/objects/*.json …".
- SA-33 / line-100 cluster: user 2026-07-19 01:17–01:18 +08 confirmed the defect and
  reserved the ruling ("why are you presuming to tell me what my decisions are?");
  2026-07-19 08:03 +08 "DA-01 is not language that comes from me."

## 7. Divergence from the suite's reverted stream table (for the redo in dot-claude)

The reverted `BLOCK_BY_STREAM` (dot-claude 0cba829, reverted 0d9a52c) mapped stream →
block totally (defect streams → issues; work/intent/accounting → tasks). Verified
failures against this substrate: it contradicts the user's own 2026-07-20 filing of four
known-broken-current findings as framework-gaps; it erases the
framework-gaps/issues definitional split; it emits bare tasks the installed error-severity
invariant refuses; it has no outcome for disposed/split/no-home records; it hard-aborts
mid-run. This table replaces stream-lookup with facts-lookup; the suite's redo consumes
it as an input file and never hardcodes placement policy again.
