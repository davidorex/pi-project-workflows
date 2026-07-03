# MILE-008 member-set validation — filed text vs code as of main @ 1b678b7 (2026-07-03)

Strict-validation gate before MILE-008 (operator-surface truthfulness) work begins. Every member
element's filed text read verbatim via `pi-context read-block-item`; every file:line anchor and
mechanism claim checked against today's `packages/**` + `scripts/**` source via Read/Grep; live
substrate facts checked via CLI ops only (`read-config`, `read-schema`, `filter-block-items`,
`find-references`, `context-roadmap-load`, `context-current-state`); provenance checked against git
filing commits and the `claude-history` record. No file was changed, nothing filed. Validation
dimensions: (A) reference accuracy, (B) mechanism truth, (C) internal + cross-member consistency,
(D) testability, (E) provenance red flags.

Member set: MILE-008, PHASE-M8-OPERATOR-SURFACE, TASK-022, TASK-057, TASK-058, TASK-054, and the
four non-task members the phase intent names verbatim: FGAP-104, FGAP-108, FGAP-044, FGAP-045
(the intent TEXT is the membership authority for non-task members — no gap-to-phase relation type
exists, per filing commit 1b426f9). Cross-reads: FGAP-016, FGAP-105, DEC-0004, PHASE-M3 members
(via the MILE-003 gate analysis), conventions `cli-command-form` + `docs-surface-sync`, filing
commits 1b426f9 / 0e8574e / ed19776 / 92ec96b, session 8490e49a (operator-story think-out).

---

## Verdict table

| Element | Verdict | Core finding |
|---|---|---|
| MILE-008 | VALID | Schema-complete (id/name/status required — all present); no `milestone_precedes_milestone` edge touches it, coherent with "Lane C parallel from the start" |
| PHASE-M8-OPERATOR-SURFACE | VALID with caution | All intent claims check out; TWO ordering constraints (FGAP-104-first; TASK-057's fold-locus wait) live in intent text ONLY and are invisible to the ready/blocked derivation (verified live); goal text has no clause covering FGAP-044/045/TASK-054 |
| TASK-022 | VALID; one locus defect | Mechanism fully re-verified today; but `boundedJsonOutput` (and the refusal-text composer) is DEFINED in ops-registry.ts, not cli.ts — files[] omits ops-registry.ts, where the fix's primary edit loci live; misattribution present at filing, not drift |
| TASK-057 | VALID | Every recording-gap claim verified exact (decl carries authoring time only; baseline overwrite with no parent pointer); provenance user-verbatim (G2) + user-directed scope correction, both recovered from the record; one plan-step semantics caution (applied-at on read-time config migration) |
| TASK-058 | VALID with caution | All named machinery exists as claimed (fresh registry, pinned pending-blocked chain, catalog chain walker, per-item failure mapping); criterion 3's first-failure attribution under final-target validation can indict a healthy mid-chain step — a consequence the filed limitation does not state |
| TASK-054 | VALID | Anchors self-declared pre-TASK-053 with relocate-by-content instruction; both sites relocated and verified (index.ts:2101-2103, :2497-2499), exactly two in scope; writeTypedFile at block-api.ts:870 confirmed validating |
| FGAP-104 | VALID | All five evidence anchors exact; both cited commits exist; dormant-latent condition live-verified (`tool_operations` = []); footnote: truncate.ts carries a FOREIGN-substrate "(FGAP-104)" code comment that collides with this gap's ID |
| FGAP-108 | VALID mechanism, one drifted anchor | Contradiction real today: target_dir schema-required + "ignored for to_previous" description + CLI required-check all verified; ops-registry anchor :1565-1645 → op actually spans :1538-1616 (cli.ts:440-443 exact) |
| FGAP-044 | VALID mechanism, STALE anchor | write-schema still whole-document create\|replace; no field-granular schema op in the enumerated 58-op registry; anchor :1183-1227 → write-schema now :1282-1330 |
| FGAP-045 | VALID | rename-canonical-id description states verbatim "block_kind renames are unsupported (filesystem cascade)"; kind enum item\|relation_type\|lens\|layer exactly as filed |
| FGAP-016 (cross-check) | VALID | Whole mechanism re-verified end-to-end today (pretty-measured vs compact-emitted; bytes-only refusal wording while the line dimension can fire); shares TASK-022's cli.ts/ops-registry locus misattribution |

Cross-member coherence: **no contradiction in the member set.** The fold-locus serialization
(phase M8 × phase M3 × TASK-057 × FGAP-105) is coherent and turns out to be SEMANTIC, not just
file-collision avoidance (see TASK-057 detail). The one systemic caution is a class: ordering
constraints carried only in intent prose while the derivation surfaces all four tasks as unblocked.

---

## Per-element detail

### MILE-008 — VALID

- Filed fields: id / name ("Operator-surface truthfulness — CLI, ops, docs, and generation coherent
  with enforcement") / status `planned` — exactly the milestone schema's required set
  (`read-schema --schemaName milestone --path properties.milestones.items.required` →
  `["id","name","status"]`). The milestone schema carries no intent/goal fields; those live on the
  phase, which `phase_positioned_in_milestone` binds (find-references: 1 edge, PHASE-M8 → MILE-008).
- `context-roadmap-load`: none of the 8 `milestone_precedes_milestone` edges touches MILE-008 —
  MILE-008 has no predecessor gate. Coherent with the phase intent's "Lane C: parallel with Lanes A
  and B from the start" and with filing commit 1b426f9's lane design ("lane C: TASK-022/057/058/054"
  among the surfaced lane starts).

### PHASE-M8-OPERATOR-SURFACE — VALID with caution

Every checkable intent/goal claim verified:

- **Member parentheticals accurate**: "FGAP-016 cap measures emitted form" matches TASK-022's
  description; "schema-history audit op" / "migration-chain walk op" match TASK-057/058;
  "context-switch target_dir contradiction" matches FGAP-108; "field-granular schema edit" matches
  FGAP-044; "block-kind rename cascade" matches FGAP-045; "refinement" matches TASK-054.
- **"every other lane ceremonially runs the generator"**: true — the Completion Sequence's
  docs-surface-sync step (`npm run skills`) runs the generator after any surface change, so
  FGAP-104's silent-truncation mode is exposure for every lane. The lands-FIRST rationale is sound.
- **"TASK-057 waits for the MILE-003 plan step to decide the FGAP-105 fold-locus if it touches
  migrations-store"**: the conditional FIRES — TASK-057's files[] includes
  `packages/pi-context/src/migrations-store.ts`. TASK-058's files[] does NOT include
  migrations-store.ts (index.ts / ops-registry.ts / cli.ts only), so TASK-058 correctly sits outside
  the conditional — the phase's per-task discrimination is exact.
- **Caution 1 — intent-text-only ordering (the systemic finding)**: verified live via
  `context-current-state`: TASK-022, TASK-054, TASK-057, TASK-058 ALL surface in nextActions as
  "unblocked planned task"; no `task_gated_by_item` edge encodes TASK-057's wait (find-references
  TASK-057: 3 edges — two convention bindings + the phase edge, no gate), and FGAP-104 (no task)
  cannot surface in the derivation at all. This is deliberate per 1b426f9 (a plan-STEP gate is not
  a milestone-completion gate; over-gating with task_gated_by_item → MILE-003 would block TASK-057
  until all of MILE-003 completes — stronger than the filed constraint). Not a text defect — but M8
  briefs composed from ready/blocked derivation alone would dispatch TASK-057 before the fold-locus
  decision and start TASK-022 before FGAP-104. The intent TEXT is the ordering authority; every M8
  dispatch decision must read it.
- **Caution 2 — goal under-coverage**: the goal's four clauses map to FGAP-104 (hermetic fail-loud
  SKILL.md), FGAP-108 (op contracts match enforcement), TASK-022/FGAP-016 (caps measure what is
  emitted), TASK-057/058 (schema history + migration chains auditable through ops). FGAP-044,
  FGAP-045, and TASK-054 have NO goal clause — the goal as written is satisfiable with three named
  members unaddressed. (FGAP-044/045 arguably ride "op contracts match enforcement" only under a
  generous reading; the filed clause is about contract/enforcement AGREEMENT, not missing ops.)
- Provenance: filing commit 1b426f9 records the user-validated, provenance-reviewed outline
  ("user granted 'file as delineated'"); the lane-C member set in the commit matches the four
  task_positioned_in_phase edges exactly. The intent's deferrals ("locus undetermined, resolved at
  its plan step" for FGAP-045) defer determinations rather than narrow scope — no augmentation.

### TASK-022 — VALID; one files[]/locus defect

Mechanism re-verified end-to-end in today's code:

- The cap primitive `truncateHead` (truncate.ts:37-105) trips on EITHER `DEFAULT_MAX_BYTES` (50KB)
  or `DEFAULT_MAX_LINES` (2000) and returns `truncatedBy: "lines" | "bytes"` — so the firing
  dimension is ALREADY computed; the refusal path simply discards it.
- `overReadCap` (ops-registry.ts:152-155) returns only `{over, totalBytes}` — `truncatedBy` dropped.
- `boundedJsonOutput` (ops-registry.ts:198-207) measures `JSON.stringify(r.json, null, 2)` — the
  PRETTY form — at :204, while the CLI `--json` envelope emits COMPACT
  `JSON.stringify({ok, op, output})` (pi-context-cli/src/cli.ts:1136). Measurement form ≠ emission
  form: the over-refusal premise is true by construction today.
- All refusal texts state bytes only: `overCapRefusalText` (ops-registry.ts:163-168, "…is
  ${totalBytes} bytes, over the 50KB read cap"), read-element.ts:359 (READ REFUSED) and :366
  (PARTIAL READ) — even when the 2000-line dimension fired. Criterion 2's premise verified.
- Criterion 1 is independently testable (construct a value whose compact form < 50KB and pretty
  form > 50KB — deep nesting does this trivially); criterion 3 (fails closed) testable against the
  same paths; criterion 4 standard.

**The defect — definition-site misattribution + files[] omission.** The description's cross-channel
enumeration reads "the truncate.ts cap primitive + cli.ts boundedJsonOutput + read-element.ts
structureForRead/renderReadText". `boundedJsonOutput` is DEFINED in
`packages/pi-context/src/ops-registry.ts:198` (cli.ts only imports it at :37 and calls it at
:1135); the refusal-text composer `overCapRefusalText` (:163) and the text-channel collapser
`renderOpResultText` (:177) — two of the three likely edit loci for BOTH halves of the fix — also
live in ops-registry.ts. files[] lists truncate.ts, cli.ts, read-element.ts and OMITS
ops-registry.ts. Not drift: `git log -S "function boundedJsonOutput"` shows one commit only
(75f2611, 2026-06-04 — TASK-013/FGAP-015), i.e. it has lived in ops-registry.ts since introduction,
one day BEFORE TASK-022 was filed (created_at 2026-06-05). Composed verbatim into an implementation
brief, files[] misdirects the agent away from the file the fix edits. FGAP-016's evidence carries
the same misattribution ("packages/pi-context-cli/src/cli.ts — … boundedJsonOutput measures the
pretty form" — the measurement happens inside the ops-registry.ts function).

Provenance (E): description + criteria map to FGAP-016's proposed_resolution near-verbatim
(per-surface measurement basis, emitted-compact for --json, pretty kept for text/Pi-tool, firing
dimension in the refusal). `task_addresses_gap` TASK-022 → FGAP-016 edge present. No augmentation.

### TASK-057 — VALID

Every mechanism/premise claim verified against today's source:

- **"the only timestamp on a migration decl is its authoring time"**: exact — `MigrationDecl`
  (migrations-store.ts:82-90) carries `created_by`/`created_at` only; grep for
  `applied_at|appliedAt|applied-at` across `packages/pi-context/src/*.ts`: zero hits.
- **"each baseline advance overwrites the prior {content_hash, version} with no parent pointer"**:
  exact — `stampBaselineFromBody` (index.ts:2190-2212) sets
  `assets[name] = { content_hash: hash, version }` (:2207), replacing the prior pair wholesale; the
  only timestamp is the whole-record `installed_from.at` refresh (:2204), not per-advance lineage.
- **"the replaced bodies sit unreferenced in the object store"**: exact — `putObject` (:2201)
  persists each new baseline body content-addressed; nothing removes prior bodies, and after the
  overwrite no config field references the old hash.
- **No `read-schema-history` op exists**: verified against the full enumerated op registry (58
  `name:` entries in ops-registry.ts) — absent.
- **"The command composes what the substrate records"**: the three named sources exist — decls
  (migrations.json via `loadMigrationsFileForDir`), baseline (`installed_from.assets`),
  installed/catalog versions (`read-schema`/`read-catalog-schema` paths). Criterion 4 ("complete
  from substrate data alone") is testable on a fixture substrate once the two recording fixes land.
- **DEC-0004 coherence (notes' claim "DEC-0004 does not speak to them")**: defensible and verified
  against DEC-0004's filed text — its "No native version DAG, snapshot roots, branch refs, or
  merge-base finder" consequence is scoped to MERGE machinery (git supplies base-finding; the
  decision's context is the merge driver). A per-advance parent pointer used for audit display, not
  base-finding, is event metadata. No contradiction as long as the pointer never becomes a
  merge-base input — worth one sentence in the implementation plan.
- **Load-bearing derived interaction (not a text defect)**: stamping `applied_at` onto
  `MigrationDecl` requires the FIRST version bump of `migrations.schema.json`
  (`MIGRATIONS_FILE_VERSION` = "1.0.0", migrations-store.ts:101) — which is EXACTLY the event
  FGAP-105 defers its latent migrations.json envelope sibling to ("addressed when its schema first
  bumps or folded into TASK-073's implementation locus if the stamp lands generically in
  writeTypedFile"). The phase's fold-locus wait is therefore semantic, not just file-collision
  serialization: if the MILE-003 fold lands generically in `writeTypedFile`, migrations.json's
  envelope converges for free and TASK-057's schema bump needs no own convergence handling;
  per-writer stamping leaves it to TASK-057. The wait constraint is exactly right as filed.
- **Caution (plan-step semantics, not a filing defect)**: criterion 2 says "an applied-at time is
  stamped when a migration runs against the substrate." Pre-MILE-003, the CONFIG chain runs in
  memory on EVERY load (FGAP-105's core fact) — stamping on "runs" would either mutate on a read
  path or need a persisted-run-only definition. Coherent applied-at semantics presuppose MILE-003's
  write-time convergence — one more reason the serialization holds. The plan step must pin
  "runs" = a run that persists migrated data (resync arm B / first converging write), not an
  in-memory read walk.

Provenance (E): the G2 statement quoted in notes is USER-VERBATIM — recovered from the record
(session 8490e49a, user text 2026-06-12 06:51:47: "…As an operator, after a migration has been
applied, I want to see the version history of a schema — which migrations ran, when, and from what
base…"). The scope decision (applied-at + baseline lineage in-scope) is the user's status-quo
challenge (assistant 2026-06-13 09:17: "the corrected scope from your status-quo challenge"), and
the filing commit is 0e8574e "…(user-granted G2 filing)". No augmentation found.

### TASK-058 — VALID with caution

All presupposed machinery verified:

- **"fresh in-memory registry"**: `buildFreshRegistryWithChain(substrateDir, chain)`
  (migration-registry-loader.ts:287-303) — doc states it exists precisely for "the read-only
  update / diagnostic paths (resync simulation, catalog validation, blocked resolution)" and never
  warms the project cache. `createRegistry` (schema-migrations.ts:76-134) is per-call isolated.
- **"step-ordered application"**: `resolve` walks forward one edge per (schemaName, fromVersion)
  returning the ordered chain (:96-131); `runMigrations` applies in order (:144-159). A per-step
  walk can call the resolved decls one at a time — the decls themselves (from→to, kind) come from
  migrations.json / the pinned chain, satisfying criterion 2's reporting shape.
- **"per-item failure mapping"**: `mapValidationFailures` (index.ts:442) used at every
  blocked-validation site (index.ts:886, :982, :1194, :2466).
- **"pinned pending-blocked chain"**: `PendingBlockedEntry` (pending-blocked-store.ts:60-77)
  carries `chain: MigrationDecl[]` + `target_hash` pinning the target catalog body into the object
  store — exactly the criterion-4 source.
- **"the catalog chain"**: a real named mechanism — `findCatalogMigrationChain` (index.ts:673-710
  region) walks the shipped catalog chain (samples/migrations.json).
- **"the catalog ships only the latest schema body per kind"**: verified —
  `packages/pi-context/samples/schemas/` holds exactly one file per kind (18 files), no versioned
  copies. The "intermediate body that happens to be pinned in the object store" escape hatch is
  real machinery (putObject baselines).
- No `walk-migration-chain` op exists (registry enumeration). `cli-command-form` +
  `docs-surface-sync` convention bindings present and coherent with the bare-verb read-only form.

**The caution — criterion 3's attribution semantics.** "Cumulative-prefix validation against the
target schema, attributing the first failure to the step whose application introduced it": for a
chain whose intermediate shapes legitimately fail the FINAL target schema (e.g. step 1 renames a
field, step 2 sets the new-required field — the step-1 prefix fails the target through no defect),
first-failure attribution indicts a healthy step. The filed limitation honestly states that
per-step validation cannot run against intermediate schema versions, but NOT this consequence
(spurious first-failure attribution on legitimately shape-changing chains). Per-step validation
itself is user-verbatim (G4: "apply migration 1, validate, apply migration 2, validate"), so this
is NOT augmentation to strip — it is a design determination the plan step must make explicit
(e.g. report per-step validation deltas + per-step content changes and let the operator attribute,
or attribute only NEW failures a step introduces relative to the prior prefix — the criterion's
"introduced it" wording already gestures at delta semantics). Flagged so it is decided, not
improvised.

Provenance (E): the G4 statement quoted in notes is USER-VERBATIM (session 8490e49a, user text
2026-06-12: "…I want to walk the chain incrementally — apply migration 1, validate, apply migration
2, validate — to isolate which step breaks…"); filing commit 5b820e7 "…(user-granted G4 filing)".
"Reuses the existing chain machinery … no new parallel machinery" is derivable (verified above).
No augmentation.

### TASK-054 — VALID

- The filed text SELF-DECLARES its line numbers stale ("as evaluated pre-TASK-053; relocate by
  content") — the relocate-by-content instruction resolves cleanly today: grep for
  `process.pid}.tmp` in index.ts finds exactly the two sites, index.ts:2101-2103
  (`.markers-${process.pid}.tmp`, the mark arm) and :2497-2499 (`.unmark-${process.pid}.tmp`, the
  unmark arm), each the identical three-line tmp-write + rename shape the task describes.
- "writeTypedFile atomic writer at block-api.ts:870 cannot be reused (it validates)": exact —
  `writeTypedFile` declares at block-api.ts:870 and is the AJV-validating writer (its own tmp
  scheme at :925); the marker/stripped text is deliberately non-schema-valid content.
- Exactly two sites in the task's scope (index.ts): verified by exhaustive grep. Class context for
  the plan step (not a filing defect — the task is the code-simplifier's finding #2 filed verbatim
  on user direction, commit ed19776): the raw pid-tmp+rename shape also appears in OTHER modules
  with different semantics (context-dir.ts:235/:327 bootstrap pointer, object-store.ts:84,
  schema-write.ts:378, block-validation.ts:205 rollback restore, pi-workflows step-block.ts:192).
  Those are per-module writers, not the duplicated raw BLOCK-file bypass the helper names; the
  task's index.ts-only scope is correct as filed, and block-validation.ts:205 (best-effort raw
  restore of changed files) is the nearest sibling should anyone later generalize.
- Criteria testable as written: helper-with-comment inspectable; behavior-preserving pinned by
  "full test suite passes UNCHANGED (zero test edits)"; the named runtime loop
  (blocked → markers → fix → resolve-blocked → in-sync) is the existing TASK-052 demo path.

### FGAP-104 — VALID (all anchors exact)

- `scripts/generate-skills.js:801-808`: exact — `await import(entryPoint)` + `factory(mockPi)`
  (:801-805), catch normalizes to the verbatim-quoted warning (:806-808, "expected for extensions
  needing runtime context"), no rethrow, registrations kept, exit 0.
- `scripts/generate-skills.js:461-483`: exact — `<tools_reference>` iterates
  `registrations.tools` with no package-vs-environment origin distinction.
- `packages/pi-agent-dispatch/src/index.ts:45-89`: exact — six `registerTool` calls (:45-50), then
  `loadComposites(process.cwd(), pi)` (:65, live substrate config read), then the two event
  registrations (registerAuthGate :78 → `pi.on('tool_call')`; registerReadTruncationGate :89 →
  `pi.on('tool_result')`). A factory throw at the read still truncates the events surface.
- `packages/pi-agent-dispatch/src/composite-loader.ts:144-197`: exact — `loadComposites` at :144
  reads `config?.tool_operations ?? []` (:164) and registers a tool per entry (:181).
- Commits verified: 08f00f9 (the events-truncated SKILL.md shipped as complete) and 6d91cb0
  (restore) both exist with matching subjects.
- Dormant-latent condition verified LIVE: `read-config --registry tool_operations` → `[]` (and
  `tool_operations_forbidden` → total 0 per context-status).
- proposed_resolution's pi-behavior-monitors check is real (the three-tier template discovery is a
  documented mechanism); "Determination at task time" defers, not narrows.
- **Footnote (reference-noise hazard, not a filed-text defect)**: `truncate.ts:7`'s header comment
  cites "(FGAP-104)" — that is a FOREIGN-substrate FGAP id (vendoring commit cdae473 dated
  2026-05-25, five weeks BEFORE this FGAP-104 was created 2026-07-02). Likewise pi-agent-dispatch
  source comments cite FGAP-121/134/135/138, none of which exist in this substrate (FGAP-121 read
  back `null`; the gaps block tops out at FGAP-112). Any M8 brief that greps code for "FGAP-104"
  will hit the colliding truncate.ts comment; brief-writers should name the substrate item + its
  content, not bare grep hits.

### FGAP-108 — VALID mechanism, one drifted anchor

- Contradiction verified in full today: `target_dir` is a bare `Type.String` (NOT
  Type.Optional) in the context-switch parameter schema (ops-registry.ts:1547-1550) — its own
  param description says "ignored for to_previous mode" (:1549), the op description says
  "(target_dir ignored)" (:1541), and the run body's to_previous branch never touches it
  (:1601-1604). The CLI enforces `schema.required` pre-dispatch (pi-context-cli/src/cli.ts:440-443,
  `throw new UsageError('missing required: …')`; `target_dir` is not in AUTO_SUPPLIED — that set is
  writer + arrayKey per :429-432). So `context-switch --to_previous true` without `--target_dir` is
  refused exactly as filed. (Verified statically; not run — context-switch is a mutating, auth-gated
  op, and the required-check's pre-dispatch position is unambiguous in the parse function.)
- Anchor drift: "ops-registry.ts:1565-1645" → the context-switch op actually spans :1538-1616
  (name at :1538, run ends :1615; context-list follows at :1618). The cited range overlaps the
  schema but misses the description line (:1541) it quotes. cli.ts:440-443 is exact — no drift.
- proposed_resolution correctly frames the fork (conditional requirement vs corrected description)
  as "Requires determination" — deferral, not augmentation.

### FGAP-044 — VALID mechanism, STALE anchor

- Still true today: `write-schema` (ops-registry.ts:1282-1330) takes `operation` "create | replace"
  (:1295) with the whole schema object (:1297-1299); the full op-name enumeration (58 ops) contains
  no field-granular schema-edit op; `update-block-item` (:284) remains the match+updates analogue
  the gap contrasts against.
- Stale anchor: "ops-registry.ts:1183-1227" → write-schema now sits at :1282-1330 (:1183 is inside
  amend-config today). Mechanism claim unaffected.

### FGAP-045 — VALID

- Evidence verified verbatim: the rename-canonical-id op description (ops-registry.ts:1160-1161)
  states "kind: item | relation_type | lens | layer … block_kind renames are unsupported
  (filesystem cascade)"; the kind param enumerates exactly those four (:1165). No block-kind rename
  op exists in the registry enumeration.
- The motivating instance is still live: `story` remains a registered block_kind (read-config
  block_kinds), so the described multi-op manual cascade is still what a rename would take.
- The phase's "locus undetermined, resolved at its plan step" annotation defers the implementation
  locus; FGAP-045's proposed_resolution (one transactional cascade op) is the filed proposal it
  will resolve against. No conflict.

---

## Cross-member coherence verdict

1. **Fold-locus serialization (PHASE-M8 × PHASE-M3 × TASK-057 × FGAP-105): COHERENT and
   SEMANTIC.** The M3 phase (per the MILE-003 gate, corrected at 1b678b7) schedules the FGAP-105
   fold-locus decision before TASK-057 dispatches; PHASE-M8 mirrors the same constraint from the
   consuming side, conditioned on migrations-store contact; TASK-057's files[] fires the condition,
   TASK-058's files[] correctly does not. The validation adds a derived strengthening: TASK-057's
   applied-at field forces migrations.schema.json's FIRST version bump — the precise trigger
   FGAP-105 names for its latent migrations.json envelope sibling — so the fold-locus choice
   (generic writeTypedFile stamp vs per-writer) determines whether TASK-057 inherits envelope
   convergence for free. No filed text contradicts another.
2. **Intent-text-only ordering (FGAP-104-first × TASK-057-wait × the live derivation): COHERENT AS
   FILED, a composition hazard.** context-current-state (run today) surfaces TASK-022/054/057/058
   all as unblocked nextActions; no edge encodes either constraint, and none could without either
   inventing vocabulary (gap-to-phase) or over-gating (task_gated_by_item → MILE-003 blocks until
   milestone completion, not the plan step). The filing commit records this as deliberate. The
   phase intent TEXT is the ordering authority for lane C — every M8 dispatch decision must consult
   it, not the derivation alone. Same finding class as MILE-003's "intent TEXT is the membership
   authority" note, extended from membership to ORDERING.
3. **Goal text × member set: one under-coverage.** FGAP-044, FGAP-045, TASK-054 have no goal
   clause; the goal as written can read satisfied while three named members stand open. Wording
   proposal below.
4. **TASK-022 × FGAP-016: COHERENT** (near-verbatim derivation), sharing one definition-site
   misattribution (the fix locus lives in ops-registry.ts).
5. **TASK-057 × DEC-0004: COHERENT** under the notes' explicitly-argued reading (audit event
   metadata vs merge machinery); the plan step should state the pointer is never a merge-base
   input.
6. **Foreign-substrate FGAP ids in code comments** (truncate.ts "(FGAP-104)"; pi-agent-dispatch's
   FGAP-121/134/135/138): not member-text defects, but live collision/dangle noise for any brief
   that resolves gap ids by grepping source.

## Testability (D) summary

- TASK-022: all four criteria independently verifiable (compact-fits/pretty-exceeds fixture value;
  line-dimension refusal message inspection; fail-closed re-probe; pipeline). The files[] omission
  would misdirect WHERE the fix lands, not whether criteria are checkable.
- TASK-057: criteria 1-4 verifiable on a fixture migrated substrate (read-only check, stamp
  presence, pointer presence, git-free completeness); criterion 2's "when a migration runs" needs
  the persisted-run definition pinned at plan time (pre-convergence config chains run on every
  read).
- TASK-058: criteria 1-2, 4-6 verifiable as written (seeded breaking step per its own pipeline
  clause); criterion 3 verifiable only after the attribution semantics (delta vs cumulative
  first-failure) are pinned — as written it can "pass" while misattributing on shape-changing
  chains.
- TASK-054: sharp — zero-test-edit suite pass + named runtime loop + helper/comment inspection.
- FGAP-104/108/044/045: evidence reproducible (FGAP-104's dormant condition re-checked live;
  FGAP-108's refusal is demonstrable but was verified statically here since the op mutates;
  FGAP-044/045 verified against the op registry enumeration).
- Phase goal: each of its four clauses maps to a verifiable member outcome; the three uncovered
  members need the wording fix for the goal to certify the phase.

## Provenance red flags (E)

No filing augmentation found in the member set. TASK-057/TASK-058 rest on USER-VERBATIM G2/G4
statements (recovered from session 8490e49a, 2026-06-12) with user-granted filings (0e8574e,
5b820e7) and a user-directed scope correction (the status-quo challenge, 2026-06-13); TASK-058's
per-step-validation shape — the source of its one caution — is itself the user's verbatim wording,
so the caution is a plan-step determination, not augmentation to strip. TASK-022 maps to FGAP-016's
proposed_resolution near-verbatim. TASK-054 is the code-simplifier finding filed verbatim on user
direction (ed19776). The phase/milestone outline is the user-validated, provenance-reviewed filing
(1b426f9). All deferrals ("Determination at task time", "locus undetermined, resolved at its plan
step", "Requires determination") defer decisions rather than smuggle them.

---

## Corrections needed before M8 work starts (proposals only — provenance-gated user grants)

1. **TASK-022 (required — brief-directing).** Add `packages/pi-context/src/ops-registry.ts` to
   files[] and correct the description's locus phrase: `boundedJsonOutput` is defined at
   ops-registry.ts:198 (cli.ts imports at :37, calls at :1135); the refusal-text composer
   `overCapRefusalText` (:163) and text-channel `renderOpResultText` (:177) — primary edit loci for
   both halves of the fix — live there too. Present at filing (the function has lived in
   ops-registry.ts since 75f2611, 2026-06-04), so this is correction, not refresh.
2. **FGAP-016 (optional, same class as 1).** Evidence entry "packages/pi-context-cli/src/cli.ts —
   boundedJsonOutput measures the pretty form" → name ops-registry.ts:198 as the measuring
   function's home, cli.ts:1135-1136 as the compact-emitting call site.
3. **FGAP-108 (anchor refresh).** ops-registry.ts:1565-1645 → :1538-1616.
4. **FGAP-044 (anchor refresh).** ops-registry.ts:1183-1227 → :1282-1330.
5. **Phase goal (optional wording).** Extend to cover the three unrepresented members, e.g. append
   "schema evolution has field-granular and block-kind-rename surfaces; the marker write path is
   DRYed" — or accept the goal as intentionally partial and note that phase completion is judged on
   the member set, not the goal sentence.
6. **Plan-step decisions to make explicit (no text change required, decided not improvised).**
   (a) TASK-057: "a migration runs" = a run that persists migrated data (resync/converging write),
   never the in-memory read walk; the baseline parent pointer is audit metadata, never a merge-base
   input (DEC-0004 boundary). (b) TASK-058 criterion 3: pin attribution semantics (per-step NEW
   failures relative to the prior prefix vs raw cumulative first-failure) given that intermediate
   shapes legitimately fail the final target schema.
7. **Brief-composition note (no filing change).** M8 briefs must carry the phase intent's two
   ordering constraints verbatim (FGAP-104 lands first; TASK-057 waits for the MILE-003 fold-locus
   plan step) — the ready/blocked derivation does not and cannot surface them; and gap-id grep hits
   in source comments (truncate.ts "(FGAP-104)"; pi-agent-dispatch FGAP-121/134/135/138) are
   foreign-substrate ids, not this substrate's items.

No corrections needed for: MILE-008 (clean), TASK-057 (clean), TASK-058 text (caution is a
plan-step determination), TASK-054 (clean — anchors self-declared with a working relocation
instruction), FGAP-104 (clean), FGAP-045 (clean).
