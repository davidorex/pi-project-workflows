# MILE-003 member-set validation — filed text vs code as of main @ 82d9563 (2026-07-03)

Strict-validation gate before MILE-003 (versioned-data convergence) work begins. Every member
element's filed text read verbatim via `pi-context read-block-item`; every file:line anchor and
mechanism claim checked against today's `packages/**` + `scripts/**` source via Read/Grep; live
substrate facts checked via CLI ops only (`read-schema`, `read-catalog-schema`, `filter-block-items`,
`find-references`). No file was changed, nothing filed. Validation dimensions: (A) reference
accuracy, (B) mechanism truth, (C) internal + cross-member consistency, (D) testability,
(E) provenance red flags.

Member set: PHASE-M3-DATA-CONVERGENCE, TASK-073, TASK-072, FGAP-105, FGAP-107, FGAP-092,
FGAP-076, issue-005, issue-003; cross-read: FEAT-010, FGAP-099, FGAP-097, FGAP-109, TASK-070,
TASK-057, DEC-0018, MILE-003.

---

## Verdict table

| Element | Verdict | Core finding |
|---|---|---|
| PHASE-M3-DATA-CONVERGENCE | VALID (1 wording caution) | Intent/goal claims check out incl. the TASK-057 gate; goal's word "transactional" must be read per DEC-0018 (per-component, explicitly NOT atomic) |
| TASK-073 | VALID (1 anchor misattribution in criterion 4) | All line anchors survived TASK-070 exactly; the "no registered migration → throw" citation names the wrong throw branch |
| TASK-072 | VALID (1 unstated parameter) | Mechanism + files real; the diff BASELINE (diff against what) is unspecified in both TASK-072 and FGAP-097 |
| FGAP-105 | VALID | Every anchor, quote, and version fact verified exact; one trivially imprecise range endpoint |
| FGAP-107 | VALID | :26 exact; context-sdk anchor off by one line; map_each/state_derivation consumer claim verified in design docs |
| FGAP-092 | DEFECTIVE + STALE | Presents as open a determination DEC-0018 (enacted, `decision_addresses_gap` → FGAP-092) already made; both line anchors drifted |
| FGAP-076 | VALID mechanism, STALE anchors | Gap still real in today's UpdateResult; both cited line ranges drifted |
| issue-005 | VALID | Fully re-reproduced against today's code + live substrate + catalog; anchor :1066 exact; agrees with FEAT-010 criterion 6 |
| issue-003 | STALE | Location drifted; the diagnostic its confirmation was "gated on" has since shipped, as has dry/live parity |
| FEAT-010 (cross-check) | VALID | Criteria 3/4/6 map to TASK-072/TASK-073/issue-005 exactly as the phase goal claims; texts of c6 and issue-005 agree |

Cross-member coherence: **one true contradiction (FGAP-092 vs DEC-0018)**; the fold-locus texts
(TASK-073 / FGAP-105 / phase) are coherent; the issue-005 / TASK-072 / FGAP-109 triangle is
coherent and complementary with one named coverage nuance.

---

## Per-element detail

### PHASE-M3-DATA-CONVERGENCE — VALID with one wording caution

- **Member list vs relations**: only TASK-073 and TASK-072 carry `task_positioned_in_phase` edges
  (find-references, total 3 incl. `phase_positioned_in_milestone` → MILE-003). The gap/issue members
  are named in intent text only — deliberate per the filing commit 1b426f9 ("member gaps/issues
  without tasks are named verbatim in each phase's intent (no gap-to-phase relation type is
  registered; vocabulary not invented)"). Not a defect; M3 planners must know the intent TEXT is the
  membership authority for the 6 non-task members.
- **"FEAT-010 criteria 3, 4, and 6 met"**: verified mapping against FEAT-010's filed criteria —
  c3 (build-time non-additive config-schema gate) = TASK-072/FGAP-097; c4 (block schema_version +
  active read hook/migration branch) = TASK-073/FGAP-099; c6 (same-version resync re-validates) =
  issue-005. Exact.
- **"FGAP-105 fold-locus (writeConfigForDir vs generic writeTypedFile) is decided at this phase plan
  step, before TASK-057 dispatches"**: coherent, and the TASK-057 mention is deliberate, not a typo
  for TASK-073. TASK-057 (read-schema-history + applied-at stamp + baseline lineage) sits in
  PHASE-M8-OPERATOR-SURFACE and is a lane-C PARALLEL start per the filing commit ("nextActions
  surfaces exactly the three lane starts — M3 spine: TASK-073/072; … lane C: TASK-022/057/058/054").
  TASK-057's `files[]` includes `migrations-store.ts`; FGAP-105's fold alternative ("stamp lands
  generically in writeTypedFile") would change the migrations.json write funnel
  (`writeMigrationsFileForDir` → `writeTypedFile`) that TASK-057 also touches. Deciding the locus
  before the parallel lane task dispatches is a real serialization constraint.
- **Wording caution — goal says "update outcomes are legible and transactional"**: DEC-0018
  (enacted) decides "pi-context update applies PER-COMPONENT, not whole-run-atomic … update is NOT
  made atomic." A brief reading "transactional" naively could re-derive atomicity. The goal is
  satisfiable only as "the per-component transactional CONTRACT is explicit/documented" (DEC-0018
  consequence 3) + legibility (FGAP-076). Proposal below.

### TASK-073 — VALID; one anchor misattribution (criterion 4)

Every code anchor re-verified against today's source — none drifted despite the TASK-070 commits:

- Read hook `block-api.ts:785-789`: exact (`existingBlockSchemaPathForDir` gate at 785, envelope
  `schema_version` string check at 787, `validateBlockWithMigrationForDir` at 789).
- Per-item out-of-scope comment `block-api.ts:782-784`: exact ("per-array-item migration is out of
  scope today (the block envelope is what carries schema_version, not each item)").
- Write path `block-api.ts:870-938`: `writeTypedFile` spans exactly 870-938; it stamps author fields
  only — no schema_version stamping exists today (the task's premise).
- Write gate `block-api.ts:1758-1767`: exact (`toWrite` guard 1759-1764, ForDir registry 1765,
  validate 1766); the throw fires before `writeTypedFile` at 1769 → criterion 4's "write-gate throw
  … leaving the block file byte-unchanged" is true by construction.
- Migration branch `schema-validator.ts:225-239` / migrate `:232-238`: exact.
- Criterion 5's install/update delivery mechanism exists (resyncSchema arm A verbatim-overwrites a
  same-version catalog schema body into installed substrates, `index.ts:1071-1073`; version-bump arm
  B forward-migrates). 

**The defect — criterion 4, branch (ii)**: "with NO registered migration the gate throws
(schema-validator.ts:234-236)". The throw at :234-236 is the **no-MigrationRegistry-supplied**
branch. Both gates ALWAYS supply a registry (`getProjectMigrationRegistryForDir`, block-api.ts:788
and :1765), so that throw is unreachable from the gates. The actual no-registered-migration throw is
`registry.resolve`'s no-migrations/no-path throw (schema-migrations.ts:100-104 and :121-125)
propagated through `runMigrations` (called at schema-validator.ts:238; doc: "Throws when no
migration path exists (registry.resolve propagates)"). The BEHAVIOR the criterion demands is real
and testable; the citation names the wrong throw site. Composed verbatim into a test-writing brief,
it would direct the agent to assert on the wrong error message/branch.

**Load-bearing derived fact for the fold-locus decision** (not a text defect): every block write
funnels through `writeTypedFile` — the append/update/upsert/remove writers call it DIRECTLY
(block-api.ts:1054, 1077, 1144, 1179, 1349, 1453, 1489, 1556, 1640, 1702), bypassing
`writeBlockForDir` (:1769). Criterion 2's "on every block write" therefore CANNOT be satisfied by a
stamp inside `writeBlockForDir` alone; the stamp must land at the `writeTypedFile` level (or in each
typed-file writer). This narrows the M3 plan-step fold-locus decision to: writeTypedFile-generic
(which then also reaches config.json and migrations.json — FGAP-105's fold) vs per-writer stamping
that excludes non-block files. It does not contradict any filed text.

Provenance (E): criteria map to FGAP-099's proposed_resolution near-verbatim (envelope stamp, named
one-property relaxation, per-item out of scope, hooks activate, migrate-or-throw). Criterion 5
(reaches already-installed substrates) is not in FGAP-099 but is derivable from FEAT-010's scope
("already-installed substrate" is the feature's subject). No filing augmentation found.

### TASK-072 — VALID; one unstated parameter

- `scripts/parity-check.ts` + `scripts/parity-check.test.ts` exist; wired in `.husky/pre-commit:4`
  and `.github/workflows/ci.yml:26`. Its structure is an extensible exit-1 multi-category gate (5
  categories today); no config-schema diff gate exists yet (grep for `config.schema` in
  parity-check.ts: zero hits) — the task is not stale.
- Criteria trace to FGAP-097's proposed_resolution near-verbatim ("new fields land optional;
  existing fields are not removed/renamed until a later contract release — enforced by a build-time
  breaking-diff gate … absent a paired migration"). The "under the root additionalProperties:false"
  qualifier is grounded in FGAP-097's evidence (config.schema.json root; verified today:
  `"version": "1.7.0"`, root additionalProperties:false per FGAP-097's cited lines). No augmentation.
- **Unstated parameter (D)**: neither TASK-072 nor FGAP-097 says what the "diff" is computed
  AGAINST (git HEAD? last tag? the recorded install baseline? the object-store base?). Criterion 1
  is not independently executable until the comparison base is fixed. This is a plan-step decision
  to make explicit, flagged so it is decided rather than improvised by the implementing agent.

### FGAP-105 — VALID (all anchors and quotes exact)

- `context.ts:872-874`: exact — `writeConfigForDir` delegates the caller's object verbatim to
  `writeTypedFile`; nothing sets schema_version (writeTypedFile stamps author fields only).
- `context.ts:948`: exact — `schema_version: "1.0.0"` literal in `writeSkeletonConfig`.
- `samples/conception.json` line 2 `"schema_version": "1.0.0"` vs bundled
  `schemas/config.schema.json` `"version": "1.7.0"` (line 4): both verified today.
- `migrations-store.ts:208-219`: exact — `appendMigrationDeclForDir` loads, clones, pushes, writes;
  the envelope version rides through verbatim. `loadMigrationsFileForDir` (:108-125) raw-validates
  against the bundled migrations schema with NO migration path — the latent-sibling claim is true.
- `schema-migrations.ts:144-159`: exact — `runMigrations` applies chain fns only; an identity decl
  returns data unchanged; `loadConfigForDir` (context.ts:599-602) consults the registry on every
  mismatch — "chain resolved on every load, permanently" is true.
- Post-TASK-070 currency: the ceremony seeding is live (`writeSkeletonConfig` calls
  `seedCatalogConfigMigrationDecls` at context.ts:941; `installContext` at index.ts:1239) and
  FGAP-105 correctly treats it as the machinery its stamp would relieve ("becomes load-bearing
  steady state"). The funnel invalidation (`writeMigrationsFileForDir` →
  `invalidateMigrationRegistryForDir`, migrations-store.ts:158) does not touch any FGAP-105 claim.
- Quotes verified verbatim: TASK-070 criterion 3 "carried forward in memory"; TASK-073 criterion 2
  "the whole-block object … on every block write". Negative claim verified: none of FEAT-010's six
  criteria states persisted config version convergence.
- "declarative set of schema_version (mechanically supported today)": verified — the `set` transform
  op exists (migration-registry-loader.ts, `case "set"` at :151).
- Trivial imprecision: evidence range "context.ts:1261-1420" for `amendConfigEntryForDir` — the
  function starts at 1261 but runs to ~1450 (next top-level declaration at 1452). The claim it
  anchors is an observed-behavior fact (scratch-copy write persisted 1.0.0), unaffected.

### FGAP-107 — VALID

- `capability-composer.ts:26`: exact — `JSON.parse(fs.readFileSync(configPath…))` inside try/catch,
  active substrate, fail-safe, no migration-aware loader.
- `context-sdk.ts:1443`: off by one — `loadConfigForDirBestEffort` declares at :1444 (:1443 is its
  doc comment's closing). Behavior claim exact: raw parse of a foreign/non-active substrate's
  config.json, no AJV, no migration.
- Split-brain mechanism verified: `loadConfigForDir` migrates-then-validates (context.ts:599-603);
  these two paths never migrate → divergent shapes the day a shape-changing `config` migration ships.
- "(map_each's declared consumer: the state_derivation delta)": verified — the config-migration
  design docs (analysis/2026-06-18-config-migration-design-feasibility.md:6;
  -corrected-implementation-steps.md:140-158) define map_each precisely for the
  `state_derivation` 1.7.0→1.8.0 shape delta.

### FGAP-092 — DEFECTIVE + STALE (the cross-member contradiction)

- **The substrate already decided what this gap asks to decide.** DEC-0018 (status `enacted`,
  edge `decision_addresses_gap` DEC-0018 → FGAP-092 present in relations) decides: "pi-context
  update applies PER-COMPONENT, not whole-run-atomic … update is NOT made atomic … affirms the
  current registry-propagation-on-blocked behavior as intended — not a defect to remove," and
  spins the legibility consequence off to its own gap (= FGAP-076). FGAP-092's filed description
  ("update has no specified transactional boundary") and proposed_resolution ("Specify update's
  transactional boundary … atomic … vs per-component …") present that determination as OPEN.
  Composed verbatim into an M3 brief, FGAP-092 instructs an agent to re-decide an enacted decision.
  The residual true work under FGAP-092 is DEC-0018 consequence 3: "the transactional contract is
  per-component and must be documented on the update surface."
- **Stale anchors** (mechanism claims still true in code, lines drifted):
  - "index.ts:1391-1421" (registry propagation ungated on schema-loop outcome) → now
    index.ts:2150-2169; verified still ungated — the `writeConfig(cwd, merged)` at :2163 is guarded
    only by `!dryRun` + non-empty additions, never by `result.blocked`.
  - "index.ts:599-641" (resyncSchema byte-exact rollback) → resyncSchema now spans
    index.ts:1023-1203; rollback at :1171-1201 (schema bytes restored :1177, migrations.json bytes
    restored/removed :1181-1185, registry cache invalidated :1186). Verified: the rollback bounds
    only the blocked schema's file + migrations.json, exactly as claimed.

### FGAP-076 — VALID mechanism, STALE anchors

- Gap still real today: `UpdateResult` (index.ts:~1725-1780) carries `blocked`/`blockedDetail` and
  `registryAdditions` as independent channels; no field ties a blocked outcome to the config
  mutation that still occurred. The DEC-0018 premise ("per-component affirmed") is verified enacted.
- Stale anchors: "index.ts:1391-1421" → 2150-2169 (same drift as FGAP-092); "index.ts:1282-1293"
  (schema-loop result buckets) → result initialization now index.ts:1836-1849, per-schema bucket
  pushes ~1908-1960. Mechanism claim ("reported independently of registryAdditions") re-verified at
  the new locations.
- Note of partial overtaking: the "why" half of its proposed reporting (the blocked schema + its
  AJV error) HAS shipped as `blockedDetail` (TASK-048; STORY-001/STORY-009 complete). The
  unshipped half — one place tying what-applied to what-blocked so a blocked run never reads as a
  no-op — is the gap's remaining substance. The filed text does not claim blockedDetail is missing,
  so this is context for scoping, not a text defect.

### issue-005 — VALID (fully re-reproduced today) 

Every element of the concrete instance re-verified live:

- Anchor `index.ts:1066` exact: arm (A) same-version verbatim-overwrite spans :1066-1074
  (`fs.copyFileSync(sourceFile, destFile)` at :1072, no item re-validation, "Items are unaffected"
  comment states the flawed premise the issue attacks).
- Asymmetry claim exact: arm (B) version-bump forward-migrates + re-validates + refuses
  (blocked, byte-unchanged) at :1148-1201.
- Concrete instance: catalog `samples/schemas/story.schema.json` is version 1.0.1 with
  `additionalProperties:false` at envelope (:11) and items (:17) and NO `user_kind` (grep: zero
  hits); installed story schema is ALSO 1.0.1 (`read-schema --path version`) and DECLARES
  `user_kind`; `filter-block-items --block story --field user_kind --op matches` returns total 14
  of 14 story items carrying `user_kind`. Same-version + narrowing + live items = exactly the filed
  bricking condition.
- dryRun claim exact TODAY: `simulateResyncOutcome` arm 1 (index.ts:810-812) mirrors the live arm —
  same version → predicts `resynced`, no re-validation. So even post-STORY-008 dry-run parity, the
  narrowing same-version resync is classified resync, as filed.
- Cross-text agreement with FEAT-010 criterion 6: the criterion states precisely the remedy
  (re-validate + refuse blocked byte-unchanged, symmetric with the version-bump path) for the defect
  issue-005 describes; issue-005's characterization of the version-bump path matches the code. No
  divergence between the two texts.

### issue-003 — STALE

- Location "packages/pi-context/src/index.ts:599" — resyncSchema moved; it now starts at
  index.ts:1023. Stale anchor.
- "Confirmation is gated on the per-item schema-validation diagnostic that would name the failing
  item/field" — that diagnostic has since SHIPPED: `blockedDetail.failures` with per-item
  instancePath/field mapping (index.ts:1192-1200, `mapValidationFailures`; TASK-048; STORY-001 and
  STORY-009 complete). The gating condition is satisfied by current code; the filed text still
  presents it as absent.
- "dry-run predicted resynced; the live forward-migrate + re-validate refused" — this dry/live
  divergence class was subsequently closed by `simulateResyncOutcome` (FGAP-066/TASK-046;
  STORY-008 complete: "never predicts resynced when the live run will hit blocked"). The recorded
  observation is historical fact (not invalidated), but the filed text gives no signal that the
  machinery has changed under it.
- The refusal itself remains unverifiable here, as the filing honestly states (operator substrate;
  this repo's conventions verified in-sync: installed 1.0.1 = catalog 1.0.1).
- Verdict: not defective — every claim was true at filing — but composed verbatim into an M3 brief
  it would direct an agent to build a diagnostic that exists. Needs a current-truth refresh (per the
  substrate-blocks-not-changelogs convention: edit to current truth, journey stays in git).

---

## Cross-member coherence verdict

1. **Fold-locus (phase × TASK-073 × FGAP-105): COHERENT.** All three texts leave the same single
   decision open and assign it to the same point (M3 phase plan step, before lane-C TASK-057
   dispatches). TASK-073's notes correctly mark the ENVELOPE-vs-per-item question as derived/closed
   (hooks key on envelope.schema_version — verified) while the writeConfigForDir-vs-writeTypedFile
   fold stays open in FGAP-105 ("Determination at task time") and is scheduled by the phase. One
   derived constraint narrows it (see TASK-073 section): append-path writers bypass writeBlockForDir,
   so criterion 2's "every block write" forces the stamp to the writeTypedFile level or into every
   typed-file writer — which makes FGAP-105's "generic writeTypedFile" fold the naturally-converging
   option and makes a writeBlockForDir-only stamp a criterion-2 violation. No filed text contradicts
   another.
2. **issue-005 × TASK-072 × FGAP-109: COHERENT, complementary, no gap between them unclaimed.**
   Apply-time re-validation (issue-005 / FEAT-010 c6) + build-time config-schema gate (TASK-072) +
   the block-schema build-time hole (FGAP-109, explicitly mapping the other two and deferring
   extend-vs-sibling "positioned with MILE-003's convergence work"). FGAP-109's factual claim about
   TASK-072's files[] verified (config.schema.json only). One coverage nuance for the M3 plan:
   issue-005's narrowing set includes ENUM-NARROWING; both build gates as filed name only
   removed/renamed key + new required field. Apply-time re-validation catches all narrowing kinds;
   the build gates as filed catch a subset. Not a contradiction — a scoping fact to carry into the
   TASK-072/FGAP-109 plan step.
3. **FGAP-092 × DEC-0018 × FGAP-076 × phase goal: INCOHERENT as filed — the one contradiction.**
   DEC-0018 (enacted, addressing FGAP-092 by edge) decided per-component; FGAP-092 still asks the
   atomic-vs-per-component question; the phase goal's "transactional" is satisfiable only under the
   DEC-0018 reading. FGAP-076 alone is coherent with DEC-0018 (cites it as premise). Corrections
   below.
4. **issue-003**: stale, not contradictory.

## Testability (D) summary

- TASK-073: all five criteria independently verifiable as written (schema inspection, write
  inspection, real-read demo, both-branch gate tests with post-state, installed-substrate update
  check). Criterion 4's misattributed throw anchor would misdirect the test's error assertion.
- TASK-072: criteria 2-3 verifiable; criterion 1 not executable until the diff baseline is decided.
- FGAP-105/107: evidence reproducible (105's write-path fact was already demonstrated on a scratch
  copy; the raw-reader split-brain is demonstrable with any non-identity config decl on a fixture).
- issue-005: reproducible today (this repo's own story block is a live fixture).
- issue-003: not independently verifiable here (operator substrate) — filed text says so.
- Phase goal: each clause maps to a verifiable member outcome once the FGAP-092 wording is fixed.

## Provenance red flags (E)

No filing augmentation found in the member set. TASK-073's criteria map to FGAP-099's
proposed_resolution near-verbatim; criterion 5 is derivable from FEAT-010's already-installed-
substrate scope; TASK-072 maps to FGAP-097 near-verbatim. The phase filing commit records
user-validated provenance-reviewed filing. The defects found are staleness/precision, not
smuggled requirements.

---

## Corrections needed before M3 work starts (proposals only — provenance-gated user grants)

1. **FGAP-092 (required — the contradiction).** Rewrite to current-truth:
   - description: replace "update has no specified transactional boundary … the registry write is
     ungated on the schema-loop outcome" framing with: the boundary IS specified — DEC-0018
     (enacted) decides per-component application and affirms the ungated additive registry write as
     intended; what remains unspecified is the SURFACE: the per-component contract is not documented
     on the update surface (op description/promptSnippet/README), so callers still cannot learn that
     a blocked run may have mutated config.json except by reading the decision.
   - proposed_resolution: "Document the per-component transactional contract (DEC-0018) on the
     update surface — op `description`/`promptSnippet`, package README — stating that a `blocked`
     schema does not withhold sibling resyncs or the additive registry propagation, and that the
     safety boundary is the per-schema byte-exact rollback. Result-reporting legibility is FGAP-076,
     not this gap."
   - evidence anchors: index.ts:1391-1421 → index.ts:2150-2169; index.ts:599-641 →
     index.ts:1023-1203 (rollback :1171-1201).
   - Alternatively (user's call): close FGAP-092 against DEC-0018 as its resolving decision and let
     the documentation remainder ride DEC-0018 consequence 3 + FGAP-076 — either way the filed text
     must stop asking the decided question.
2. **issue-003 (required before composition).** Refresh to current-truth: location
   index.ts:599 → index.ts:1023 (resyncSchema); state that the per-item diagnostic
   (`blockedDetail.failures`, TASK-048/STORY-009) and dry/live parity (`simulateResyncOutcome`,
   TASK-046/STORY-008) have shipped since the observation; the open residue is re-driving the
   operator-substrate reproduction WITH the now-available diagnostic to name the failing item/field
   or close as unreproducible.
3. **TASK-073 criterion 4 (required — test-directing text).** Correct the branch-(ii) citation:
   "with NO registered migration the gate throws" should cite `registry.resolve`'s no-path throw
   propagated via `runMigrations` (schema-validator.ts:238; schema-migrations.ts:100-104, 121-125) —
   the :234-236 throw is the no-registry-supplied branch, unreachable from the gates (both supply a
   registry: block-api.ts:788, :1765).
4. **TASK-072 (plan-step decision, before implementation).** Specify the diff baseline for the
   build-time gate (what old shape the current config.schema.json is compared against). Not filed
   text to change necessarily — but the M3 plan step must decide it explicitly.
5. **FGAP-076 (anchor refresh).** index.ts:1391-1421 → 2150-2169; index.ts:1282-1293 →
   1836-1849 (result init) / ~1908-1960 (bucket pushes).
6. **Phase goal (optional wording).** Align "update outcomes are legible and transactional" with
   DEC-0018: e.g. "update outcomes are legible and the per-component transactional contract
   (DEC-0018) is explicit on the update surface."
7. **FGAP-107 (trivial, optional).** context-sdk.ts:1443 → :1444.

No corrections needed for: FGAP-105 (clean), issue-005 (clean), FEAT-010 c6 (clean), the phase's
member list and TASK-057 gate (verified deliberate).
