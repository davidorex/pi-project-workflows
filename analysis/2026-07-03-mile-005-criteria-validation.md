# MILE-005 member-set validation — filed text vs code as of main @ 1b678b7 (2026-07-03)

Strict-validation gate before MILE-005 (write-path integrity) work begins. Every member element's
filed text read verbatim via `pi-context read-block-item`; every file:line anchor and mechanism
claim checked against today's `packages/**` source via Read/Grep; live substrate facts checked via
CLI ops only (`read-config`, `find-references`, `context-current-state`, `context-validate`,
`context-validate-relations`, `join-blocks`); revert-history recovered via `git log`/`git show` and
`claude-history` (session 8490e49a, 2026-06-06). No file was changed, nothing filed. Validation
dimensions: (A) reference accuracy, (B) mechanism truth, (C) internal + cross-member consistency,
(D) testability, (E) provenance red flags.

Member set: MILE-005, PHASE-M5-WRITE-INTEGRITY, TASK-027 (sole `task_positioned_in_phase` member),
and the phase-intent-named non-task members FGAP-093, FGAP-091, FGAP-085. Cross-read: FGAP-007
(TASK-027's `task_addresses_gap` target), the relation_types registry, the invariants registry, the
state_derivation registry, filing commit 1b426f9, and the TASK-027 implement/close/revert commit
chain (f276cac, 1912031, 3d7d897, a08e586, 7968580, 98b6413, b80eea7, fe676a5).

---

## Verdict table

| Element | Verdict | Core finding |
|---|---|---|
| MILE-005 | VALID | Name/status/edges all verified (phase positioned; precedes MILE-007/009; three tasks gated on it, gate-direction consumed correctly live) |
| PHASE-M5-WRITE-INTEGRITY | VALID (2 wording cautions) | Members real + characterized accurately; the goal sentence omits FGAP-091's outcome entirely and compresses FGAP-093's class to "dangling" |
| TASK-027 | DEFECTIVE (criterion 8) + provenance re-anchor REQUIRED | Premises verified against today's code, but: criterion 8 enumerates a relation_type that does not exist (`phase_depends_on`) and mis-scopes the sibling class; `files[]` names 1 of the ≥5 files the mechanism demonstrably requires; and the ENTIRE task was already implemented, audited 10/10 clean, closed, and REVERTED by user directive ("a failure implementation wise") — none of which the filed text surfaces |
| FGAP-007 (cross-check) | VALID, mild anchor drift + same provenance note | Every mechanism claim re-verified today; its proposed_resolution IS the reverted design |
| FGAP-093 | VALID mechanism, STALE anchors | Gap fully real in today's code (dangling/unregistered/cycle accepted at write, caught only at validate); every context-sdk.ts line anchor drifted ~+110–140; the test anchor held exactly |
| FGAP-091 | VALID class, STALE triggering evidence | The no-forcing-function asymmetry is real and re-verified in today's invariants registry, but ALL FIVE "missing" edges its evidence cites now EXIST (backfilled since filing) |
| FGAP-085 | VALID | Mechanism verified at block-api.ts:1339 (`{...prior, ...updates}` shallow merge — null lands as a key); honestly self-marked uninvestigated |

Cross-member coherence: **no true contradiction inside the member set**. TASK-027 and FGAP-093 are
complementary write-gate axes (direction vs existence/cycle) targeting the SAME code region
(`appendRelationByRef` / `validateEdgeAgainstRegistry`, context-sdk.ts ~1568–1818) — an
intra-phase serialization fact, not a conflict. The one incoherence is between the member set and
the REPO HISTORY: TASK-027 + FGAP-007 both present as untried a design that was implemented,
verified, closed, and user-reverted on 2026-06-06.

---

## Per-element detail

### MILE-005 — VALID

- Item read: name "Write-path integrity — no silently-wrong edge or unwritable correction",
  status `planned`, created 2026-07-02 by human/davidryan@gmail.com. No description field beyond
  name — the phase carries the substance (the outline's pattern).
- Edges (find-references, total 6): PHASE-M5-WRITE-INTEGRITY →`phase_positioned_in_milestone`→
  MILE-005; MILE-005 →`milestone_precedes_milestone`→ MILE-007 and MILE-009; TASK-047, TASK-004,
  TASK-003 each →`task_gated_by_item`→ MILE-005. Live `context-current-state` confirms the gate
  edges are consumed in the gate direction: TASK-003/TASK-004/TASK-047 all appear in `blocked`
  with MILE-005 in `blockedBy`. Rollup: MILE-005 status planned, phaseCount 1. All coherent.
- Filing commit 1b426f9 records the outline as user-validated, provenance-reviewed ("user granted
  'file as delineated'").

### PHASE-M5-WRITE-INTEGRITY — VALID with two wording cautions

- **Member list**: TASK-027 is the only `task_positioned_in_phase` member (find-references,
  total 2). FGAP-093/FGAP-091/FGAP-085 are named in intent text only — the deliberate
  membership-authority pattern per 1b426f9 ("member gaps/issues without tasks are named verbatim
  in each phase's intent (no gap-to-phase relation type is registered; vocabulary not invented)").
  All three exist and are open: FGAP-093 `identified` P2, FGAP-091 `identified` P2, FGAP-085
  `identified` P3.
- **Intent characterizations verified**: "FGAP-093 (dangling/unregistered endpoint guard)" —
  matches, though FGAP-093's own class is threefold (dangling + unregistered-alias + CYCLE);
  "FGAP-091 (warranted-edge forcing function — mechanism fork open)" — exact (FGAP-091's
  proposed_resolution genuinely leaves the invariant-vs-text-entailment mechanism and the FGAP-082
  engine question open); "FGAP-085 (field deletion through update-block-item)" — exact.
- **"Lane B: parallel with the Lane A spine from the start (edge-write region of context-sdk;
  soft-only overlap)"**: verified against 1b426f9 ("lane B: TASK-027"; the spine there is called
  "M3 spine: TASK-073/072") and against file footprints — TASK-027's region is context-sdk.ts,
  the M3 spine's is block-api.ts/index.ts/schema-validator.ts/scripts. Distinct files; claim holds.
  Live derivation confirms TASK-027 is currently an unblocked `nextActions` entry (the lane-B
  start, exactly as the filing commit recorded).
- **Caution 1 — the goal sentence under-covers the member set.** "append-relation rejects
  mis-directed and dangling edges at write time; field deletion has a sanctioned path" maps to
  TASK-027 + (part of) FGAP-093 + FGAP-085. FGAP-091's outcome (a forcing function for warranted
  non-invariant edges) is absent from the goal entirely, and FGAP-093's unregistered-alias +
  cycle rejections are compressed into "dangling". A brief reading the goal as the phase's
  done-condition would under-scope the phase relative to its own intent.
- **Caution 2 — intra-phase file contention.** TASK-027 (direction) and FGAP-093's eventual
  closing task (existence/cycle) both rewrite the same `appendRelationByRef` /
  `validateEdgeAgainstRegistry` region. "Soft-only overlap" is a Lane A/B claim and is true; it is
  silent about the WITHIN-phase hard overlap, which the M5 plan step must serialize.

### TASK-027 — DEFECTIVE (criterion 8) + provenance re-anchor REQUIRED

**Dimension A/B — premises verified against today's code (all hold):**

- Deriver contract `{parent=prerequisite, child=dependent}`: exact — contract JSDoc
  context-sdk.ts:683–690 ("a task_depends_on_task edge {parent: D, child: T} means task T DEPENDS
  ON task D"), direction comment :787–788, `dependencyPredsOf` :801–804 (parents of edges whose
  child is the item). Empirically live: the stored edge is `{parent: TASK-004, child: TASK-005}`
  (find-references) and `context-current-state` derives TASK-005 blockedBy TASK-004. The 5621c2a
  correction commit FGAP-007 cites exists.
- append-relation does NO direction check today: exact — the TASK-062 write gate
  (`validateEdgeAgainstRegistry`, context-sdk.ts:1568–1601) checks relation_type registration +
  presence-gated source/target-kind membership ONLY; `assertEdgeValidForWrite` :1629–1636;
  `appendRelationByRef` :1650–1681; `appendRelationsByRef` :1792–1818. No endpoint-role or
  orientation logic exists anywhere in today's src (grep for
  `endpoint_roles|orientOrderingEdge|endpointRolesFor`: zero hits repo-wide).
- Registry entry (read-config): `task_depends_on_task`, display_name "depends on task", category
  `ordering`, source_kinds ["tasks"], target_kinds ["tasks"], NO endpoint-role metadata. Since
  source and target kinds are identical, the existing kind check can never catch an inversion —
  the task's premise.
- `rename-canonical-id` exists as a CLI op (the "reconcile relation_type name" option has
  machinery).

**Defect 1 — criterion 8's sibling enumeration (A + C + E).** The criterion names
`story_depends_on_story, feature_depends_on_item, feature_gated_by_item, phase_depends_on`.
Verified against the live registry (read-config, 44 relation_types):

- **`phase_depends_on` does not exist and never has**: not in today's registry; `git log -S
  "phase_depends_on" -- .context/config.json` returns zero commits; repo-wide it appears only in
  test fixtures (read-element.test.ts:229–232, index.test.ts:258–309) and a usage-comment in
  `scripts/orchestrator/read-config.ts:21`. Provenance trace: FGAP-007's impact uses it as a
  HYPOTHETICAL ("e.g. phase_depends_on"); the criterion elevated the example into an enumerated
  requirement. The criterion's own exemption clause ("demonstrably exempt because its
  name/derivation are already consistent") cannot be satisfied for a type with no registration,
  no name entry, and no derivation. As written, the criterion is not executable for this member.
- **The enumerated set matches neither the registry-derived class nor the prior implementation's
  audited set.** Today's ordering-category types: decision_supersedes_decision,
  feature_depends_on_item, feature_gated_by_item, story_depends_on_story, story_gated_by_item,
  task_depends_on_task, requirement_depends_on_requirement, research_supersedes_research,
  task_gated_by_item, decision_gated_by_item, milestone_precedes_milestone. The reverted
  implementation (a08e586) covered SIX inverted-name types — the criterion's three real ones PLUS
  `story_gated_by_item` and `requirement_depends_on_requirement` — and documented exemptions for
  the `*_supersedes_*` pair (lineage, no deriver consumes them as deps). The criterion omits
  story_gated_by_item and requirement_depends_on_requirement with no exemption basis stated.
  Note the latent-inversion mechanics for the gated_by family: the deriver's default rule
  (context-sdk.ts:791–800) reads every configured blocking relation EXCEPT `task_gated_by_item`
  in the DEPENDENCY direction, so any `*_gated_by_*` type added to `blocked_by.relation_types`
  would be consumed inverted relative to its name — the class is real, the enumeration is wrong.
- None of the four named siblings has any non-test code consumer today (grep: zero hits outside
  tests for all of story_depends_on_story / feature_depends_on_item / feature_gated_by_item), and
  the active `state_derivation.blocked_by.relation_types` is exactly
  `["task_depends_on_task", "task_gated_by_item"]` (read-config) — so sibling "derivation
  consistency" is today only decidable against convention/latent rules, not live consumption.

**Defect 2 — `files[]` materially understated (A).** `files: ["packages/pi-context/src/context-sdk.ts"]`.
Criterion 2's mechanism (endpoint-role metadata "extending the existing source_kinds/target_kinds
metadata") demonstrably requires more: the bundled `schemas/config.schema.json` declares
relation_types items `additionalProperties: false` with no role property (schemas/config.schema.json:151–163
verified today), so the metadata REQUIRES a config-schema change; `RelationTypeDecl` lives in
`context.ts`; the catalog entries live in `samples/conception.json`; the active substrate's
registry entries need `amend-config`; tests need a file. The reverted implementation's actual
code footprint (recovered from the session record, message 43858bc1): context.ts (+27),
context-sdk.ts (+84), schemas/config.schema.json (+14), samples/conception.json (+18),
edge-orientation.test.ts (+310, new) — plus docs. A brief composed from files[] as filed scopes
the agent to one file of five-plus. Also note: today's config.schema.json is version 1.7.0 and
the reverted change also stamped 1.7.0 — a re-implementation must mind the version-reuse
collision (the MILE-003 additive-gate work, TASK-072/FGAP-097, governs this same file).

**Defect 3 — the reverted prior implementation is unsurfaced (E — the load-bearing finding).**
The commit chain on main: f276cac (file TASK-027) → 1912031 (tighten description) → 3d7d897
(endpoint_roles into the active config) → a08e586 (full implementation: endpoint_roles metadata +
`orientOrderingEdge` auto-orientation in the append porcelain, six sibling types, migration audit,
tests, docs) → 7968580 (close TASK-027 + FGAP-007, VER-015 10/10) → **98b6413 + b80eea7 + fe676a5
(all three reverted)** — all on 2026-06-06, all ancestors of today's main. The revert commits
carry no rationale. The session record (claude-history, session 8490e49a) recovers it verbatim:
the adversarial audit had verified the fix "clean on all 10 acceptance criteria" with two
findings (DEFECT-1: the append-relation op success message rendered the authored pre-orientation
selectors while storing the oriented edge, ops-registry.ts:362–369 then; residual: unregistered
phase_depends_on uncoverable by the metadata mechanism), after which the user directed:
**"i think we'll consider the experiment worth running but a failure implementation wise"** and
authorized `git revert` + rebuild. The filed TASK-027 text — unchanged since 1912031 except by the
close/revert cycle — still specifies the SAME design (criteria 2–3 = endpoint-role metadata +
validate-or-normalize = the reverted endpoint_roles/auto-orientation mechanism). Composed verbatim
into a plan-mode brief, it directs an agent to rebuild, unmodified, the exact implementation the
user judged a failure, with no signal that the judgment exists. What "failure implementation wise"
means (the auto-orientation choice? reject-vs-normalize? the metadata shape? something else) is
recorded nowhere on disk (grep of analysis/ finds no revert record) and is NOT derivable — it is a
user re-anchor point that must be resolved before this task enters plan mode. The prior
implementation also settles several questions the criteria leave open (migration: the then-nine
task_depends_on_task edges were all already prerequisite-at-parent, so criterion 5's migration was
a no-op; DEFECT-1 is a known defect class of the normalize option that criterion texts do not
mention).

**Dimension D — testability**: criteria 1–4 and 6–10 independently verifiable as written
(criterion 9's asserted behaviors match the reverted edge-orientation.test.ts shape; write-path
test files edge-write.test.ts / ops-edge-write.test.ts exist as homes). Criterion 5 ("every
existing task_depends_on_task edge … none orphaned, dropped, or left inverted") is verifiable in
library/test code; NOTE the CLI-side enumeration surface truncates on this substrate —
`join-blocks --leftBlock tasks --rightBlock tasks --relationType task_depends_on_task --json`
returned `{data: null, total: 77, truncated: true, complete: false}` (139,833 bytes, over the
output cap, no pagination flag on the op) — an experience-gap-shaped observation for the user
(the op cannot answer its own one-question contract at this substrate's scale). Baselines
recorded this session for criterion 6: `context-validate` status `warnings` (24 pre-existing
warnings: 17× decision-shows-derivation, 3× task-completed-gap-closed, 2×
task-completed-feature-complete, 2× nested_id_bearing_array), zero errors;
`context-validate-relations` clean.

### FGAP-007 (cross-check) — VALID, mild anchor drift; same provenance note

- Every claim re-verified today: the deriver contract (anchor "context-sdk.ts:667-722" — the
  contract JSDoc now sits at :678–712, inside-but-offset from the cited range; mild drift);
  the config evidence (display_name "depends on task", category ordering — exact per read-config);
  the corrected-edge evidence (5621c2a exists; today's stored edge parent=TASK-004/child=TASK-005
  confirmed).
- Status `accepted` with no content_parent — the text has never been updated, so like TASK-027 it
  presents its proposed_resolution ("carry explicit endpoint-role metadata … validate or normalize
  … auto-oriented") as untried, when it was implemented and user-reverted. Its impact's
  "e.g. phase_depends_on" is the hypothetical criterion 8 later reified.

### FGAP-093 — VALID mechanism, STALE anchors

- The gap is fully real in today's code: `validateEdgeAgainstRegistry` checks registration
  (:1577–1583) + presence-gated kinds (:1586–1599) only; the kind check is gated on
  `parentLoc`/`childLoc` truthiness, so a dangling or unregistered-alias endpoint skips it and the
  edge persists; cycle is not checked at write (appendRelationsByRef JSDoc :1788–1790 names
  registration/endpoint-resolution/cycle as validate-deferred — n.b. the JSDoc's registration
  mention is itself slightly stale, since the TASK-062 gate now runs at :1808–1818);
  validateContext emits `edge_endpoint_unregistered` (~:2196/:2213), `edge_endpoint_dangling`
  (~:2204/:2221), and merges `edge_cycle_detected` (~:2279) post-hoc.
- Every context-sdk.ts line anchor drifted ~+110–140: 1430-1463→1568–1601, 1421-1424→~1555–1562,
  1491-1498→1629–1636, 1528→1650/1666, 1474-1483→1612–1621, 1649-1652→1788–1790,
  2060-2085/2052-2076→~2196–2221, 2131-2150→~2279.
- The test evidence held exactly: structured-endpoints.test.ts:288–310 appends
  FGAP-1→FGAP-2 with both endpoints dangling and asserts `appended === true` (read verbatim).
- Its pairing claim ("Pairs with FGAP-007/TASK-027 (sibling write-time edge-direction guard)")
  is coherent with the member set.

### FGAP-091 — VALID class, STALE triggering evidence

- Class re-verified in today's config: the invariants registry (read-config) carries exactly six
  `requires-edge` invariants (completed-task-has-verification, decision-cites-forcing-artifact,
  decision/feature/task-articulates-convention, decision-shows-derivation) — none for
  task_governed_by_decision / task_addresses_gap / research_informs_item, exactly as claimed.
  The "17 decision-shows-derivation warnings" evidence still reproduces exactly (today's
  context-validate: DEC-0001..DEC-0017, 17 warnings). The requires-edge loop anchor
  (context-sdk.ts:2055-2078) drifted — the class-gated loop now sits at ~:2296–2300+.
- **All three find-references evidence entries are now FALSE**: TASK-010 today carries
  task_governed_by_decision→DEC-0008 AND task_addresses_gap→FGAP-012 (total 5 edges); TASK-012
  carries task_governed_by_decision→DEC-0009 AND task_addresses_gap→FGAP-015 (total 5); TASK-014
  carries task_addresses_gap→FGAP-014 (total 3). The five missing edges named as the triggering
  instance have been backfilled since filing. The backfill happening MANUALLY, with no invariant
  added, is itself consistent with the gap's thesis (nothing forces the next omission to be
  caught) — but composed verbatim, the evidence directs an agent to observe absences that no
  longer exist. Needs a current-truth refresh before composition (per
  substrate-blocks-not-changelogs).

### FGAP-085 — VALID

- Mechanism verified: `updateItemInBlock`'s merge is `{ ...prior, ...updates }`
  (block-api.ts:1339; nested twin :1623) — a JSON `null` in updates lands as `key: null` on the
  merged item and survives serialization; no field-deletion affordance exists on the update
  surface (grep of block-api.ts update paths: no key-delete branch). The upsert full-replace
  workaround claim is consistent with `upsert-block-item`'s documented replace-not-merge contract
  (CLI help).
- The filing honestly self-scopes as uninvestigated ("root cause, shape, class … are for the
  investigating agent") per Experience-Gap Handling — the phase naming it as a member makes that
  investigation M5 work. Reproducible as filed. No defect.

---

## Cross-member coherence verdict

1. **TASK-027 × FGAP-093 × FGAP-007: COHERENT, complementary.** Direction enforcement and
   existence/cycle enforcement are disjoint axes on the same write gate; each text names the
   other as sibling; neither claims the other's scope. The shared code region
   (appendRelationByRef / validateEdgeAgainstRegistry) is an intra-phase serialization fact the
   M5 plan step must handle (the phase's "soft-only overlap" speaks only to Lane A/B).
2. **Phase goal × member set: UNDER-COVERING (caution, not contradiction).** Goal omits FGAP-091
   and compresses FGAP-093's threefold class to "dangling".
3. **TASK-027 + FGAP-007 × repo history: THE INCOHERENCE.** Both texts present the
   endpoint_roles/orientation design as undone; main's history shows it implemented, audited
   clean, closed, and reverted under the user's verbatim "failure implementation wise" judgment.
   No member text, and nothing on disk, records what the failure was. This is the gate's blocking
   finding: the milestone's first task cannot honestly enter plan mode until the user re-anchors
   what the revert rejected (design? normalize-vs-reject? metadata shape? process?) and the task
   text is corrected to carry it.
4. **FGAP-091 evidence vs live substrate: STALE, not contradictory** — the class survives its
   instance's backfill.

## Testability (D) summary

- TASK-027: 9 of 10 criteria executable as written; criterion 8 not executable for
  `phase_depends_on` (nonexistent member, exemption clause unsatisfiable). Criterion 6's baseline
  recorded this session (validate: 24 warnings/0 errors; validate-relations: clean). Criterion 5
  enumerable in library code; the CLI join-blocks route truncates at this substrate's scale
  (observed and documented above).
- FGAP-093: fully reproducible (the dangling-append test at structured-endpoints.test.ts:288–310
  encodes the current behavior; a fix must reconcile that test — as its own text already states).
- FGAP-091: the invariant-asymmetry reproduces exactly (17 warnings vs zero for non-invariant
  types); the instance evidence no longer reproduces.
- FGAP-085: reproducible as filed.
- Phase goal: each clause maps to a verifiable member outcome once the FGAP-091 omission is
  corrected.

## Provenance red flags (E)

- **TASK-027 criterion 8's `phase_depends_on`**: an FGAP-007 "e.g." hypothetical reified into an
  enumerated requirement — neither user-verbatim nor correctly derivable (the registry-derived
  sibling set differs). Filing defect to surface, not a requirement to implement.
- **TASK-027 criteria 2–3 + FGAP-007 proposed_resolution vs the revert**: the texts specify the
  user-reverted design without carrying the user's judgment. The revert directive and its verbatim
  rationale ARE user-decided facts; their absence from the filed texts is the provenance gap. Any
  brief composed from these texts as-is launders a rejected design back in as a requirement.
- The phase + milestone filings carry recorded user validation (1b426f9: "user-validated …
  provenance-reviewed; user granted 'file as delineated'"). No augmentation found in the phase
  intent, FGAP-093, FGAP-091, or FGAP-085.

---

## Corrections needed before M5 work starts (proposals only — provenance-gated user grants)

1. **TASK-027 + FGAP-007 revert re-anchor (REQUIRED — blocking).** Before the task enters plan
   mode, the user states what "a failure implementation wise" (2026-06-06, session 8490e49a)
   rejected about the reverted endpoint_roles/auto-orientation implementation (a08e586), and the
   task's criteria 2–3 + FGAP-007's proposed_resolution are corrected to reflect it — either
   re-affirming the design (with the revert and its known DEFECT-1 surfaced as constraints) or
   redirecting the mechanism. Not derivable; user decision.
2. **TASK-027 criterion 8 (REQUIRED).** Replace the enumerated sibling list with the
   registry-derived class: drop nonexistent `phase_depends_on`; add `story_gated_by_item` +
   `requirement_depends_on_requirement` (the reverted implementation's audited six) or state each
   omission's exemption basis; optionally name the latent gated_by-family inversion rule
   (deriver default direction, context-sdk.ts:791–800) as the class mechanism.
3. **TASK-027 files[] (REQUIRED).** Extend to the demonstrated footprint: context.ts,
   context-sdk.ts, schemas/config.schema.json (additionalProperties:false forces the schema
   change; mind 1.7.0 version reuse vs the reverted change), samples/conception.json, a test
   file, plus the active-config amendment step.
4. **FGAP-091 evidence (required before composition).** Refresh the three find-references
   evidence entries to current truth (edges now exist; the manual backfill itself demonstrates
   the forcing-function absence); refresh the requires-edge loop anchor (2055-2078 → ~2296+).
5. **FGAP-093 anchors (refresh).** All context-sdk.ts anchors per the mapping in its section;
   the mechanism text needs no change.
6. **Phase goal (wording).** Extend to cover all four members: e.g. add FGAP-091's
   forcing-function outcome and widen "dangling" to FGAP-093's dangling/unregistered/cycle class.
7. **FGAP-007 anchor (trivial, optional).** context-sdk.ts:667-722 → :678–712.

No corrections needed for: MILE-005 (clean), FGAP-085 (clean), the phase's member-naming pattern
(verified deliberate per the filing commit).
