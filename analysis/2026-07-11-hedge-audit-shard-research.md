# Hedge / fork provenance audit — research-block shard (2026-07-11)

Procedure: `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, applied to the
`research` block (array key `research`). Shard: R-0001, R-0002, R-0004, R-0005, R-0007, R-0008,
R-0010, R-0011, R-0014, R-0018, R-0025, R-0028. All items read fresh via
`pi-context read-block-item --block research --id <id> --json`.

## Shard-level finding (governs every verdict below)

The audit's target defect is an LLM-invented "X or Y" fork inserted into a filed field with no
grounding. In this shard that defect does not occur. Every item is a research artifact whose field
carrying the fork-like language is `findings_summary`, and in each case the fork/open-question is one
of three non-defect forms the brief explicitly says to leave untouched:

1. **Question-directed** — the branch is present verbatim in the item's own `question` field, i.e. it
   is the filed record of what the research was commissioned to answer (user-DIRECTED). The
   `findings_summary` then resolves each branch against cited code with a determinate feasibility
   verdict. (R-0002, R-0008.)
2. **Explicitly resolved** — the item names the forks only to collapse them to a single derived
   decision, the anti-hedge posture. (R-0011; also R-0005, R-0007 which land on a recommendation
   bound to a cited DEC/TASK.)
3. **Genuine engineering route-choice** surfaced by a feasibility study for the user to decide, a
   real scope/value judgment (never a laundered-derivable one), grounded in cited tradeoffs.
   (R-0004, R-0008.)

Additionally every one of the 12 carries `status: "stale"` with populated `stale_conditions`. Per the
brief, an honest staleness marker ("this needs re-verification because the code has moved") is not an
invented fork. These items were filed 2026-06-05 → 2026-07-06 against branch `context-jit-spec-v2`
and code that has since advanced; `stale` is the correct, honest status, not a hedge to strip.

No corrections were made. All 12 left untouched.

Cross-cutting grounding checks (applied once, since the finding is structural, not per-item):
- `pi-mono-is-exemplar` (step 5): the convention favors matching the pi runtime's shipped shape. It
  bears on some items' *content* (e.g. R-0005 derives the global-install recipe FROM pi as exemplar,
  and is thereby *supported* by the convention, not contradicted) but does not speak to the
  fork/no-fork question in any item — none of the residual open choices is a "match-pi-or-not" choice.
  It is therefore not a decisive tiebreaker for any verdict and is not invoked as one.
- Standing/retraction (step 8): every residual open element is marked `stale`, i.e. explicitly
  flagged as pending re-verification against moved code — the opposite of a silently-abandoned
  branch. Each names its grounding source (question field, cited DEC/FGAP/TASK, or findings_document).
  No item presents an underdetermined branch as settled.

---

## R-0001 — Shared CLI core across monorepo packages

- Type `feasibility`, status `stale`, field `findings_summary`.
- Fork-like clause: *"The cli-core/op-io split is a PROPOSAL — six open questions (op-io boundary,
  Ctx-genericity vs a shared identity model, the workflows long-running split, an auth-policy hook,
  generalizing scripts/parity-check.ts to any cli-core adopter, package count) are recorded in the
  findings_document; pre-implementation it goes through the canonical pipeline."*
- Verdict: **grounded / genuinely-open-undetermined — untouched.** A feasibility study that proposes
  a design and enumerates its still-open questions is discharging its purpose, not hedging. The six
  questions are named, not vague, and the item states they are recorded in the cited
  `findings_document` (`analysis/2026-06-05-shared-cli-core-design.md`); the summary itself resolves
  the *load-bearing* corrective (OpDefinition is pi-context-internal, not a shared contract) to a
  single finding. The residual openness is real design work deferred to the canonical pipeline, not
  an invented "A or B."

## R-0002 — Substrate portability: export/import vs external substrate dir

- Type `feasibility`, status `stale`, field `findings_summary`.
- Fork clause: *"The prompt holds TWO non-interchangeable mechanisms. Fork 1 — export/import (file
  bundle) ... Fork 2 — external/global path/to/.substrate-dir ..."* and *"The forks are separable and
  need not land together."*
- Grounding of the fork: the item's own `question` field reads *"via a `pi-context-cli export /
  import` command ... **and/or** via a switchable-to substrate that lives at an external
  `path/to/.substrate-dir` global location — which is feasible ..."* Both branches are the filed
  research directive; "Fork 1 / Fork 2" is the study's labelling of the two mechanisms the question
  named, not augmentation.
- Verdict: **user-DIRECTED framing, determinate per-branch findings — untouched.** The summary does
  not leave the forks open: Fork 1 is "ALREADY HALF-BUILT" with the exact two-change seam named
  against cited `context.ts`/`index.ts` lines; Fork 2 is "NOT RESOLVABLE TODAY" grounded to
  `resolveContextDir` (`context-dir.ts:142`) nesting an absolute path. "Separable, need not land
  together" is a derived engineering fact (Fork 2 touches the shared resolver + needs locking/identity
  work; Fork 1 does not), not a punt.

## R-0004 — pi-bound pi-context CLI feasibility

- Type `feasibility`, status `stale`, field `findings_summary`.
- Open clause: *"Remaining design judgement (not defects): the meta-path resolution strategy
  ($REPO-relative script vs node-resolution from a published CLI) is the load-bearing open piece for
  shipping pi-bound from an installed package rather than the in-repo script."*
- Verdict: **genuine engineering judgement in a feasibility study — untouched.** Explicitly labelled
  "not defects," and it is the single genuinely-novel port piece the two cited evaluations
  (`docs/reports/2026-06-07-pi-bound-cli-evaluation.md` + `-v2.md`) flagged as least-specified. The
  two branches ($REPO-relative vs node-resolution) are concrete resolution strategies with a real
  packaging tradeoff, surfaced for decision, not an invented alternative. The rest of the summary
  reports a determinate 26-CONFIRMED/0-REFUTED verification result.

## R-0005 — Globally installable pi-context command

- Type `feasibility`, status `stale`, field `findings_summary`.
- Path-like clause: *"Concrete paths: (a) local dogfooding — add the build chmod, then `npm link` ...
  (b) registry — already available for the base command ..."* and *"Recommended publish unit:
  CLI-as-own-unit (pi-faithful, lowest delta), recorded as DEC-0013."*
- Verdict: **resolved recommendation, grounded in cited DEC — untouched.** (a)/(b) are complementary
  concrete paths (local dogfooding path AND registry path), not mutually-exclusive branches; both are
  reported as facts. The one decision that matters — publish unit — is *resolved* to CLI-as-own-unit
  and bound to DEC-0013 (and DEC-0014 for pi-bound). Grounded in pi-as-exemplar, consistent with
  `pi-mono-is-exemplar`. No unsupported hedge.

## R-0007 — CLI write-path UX (AJV errors + --show-schema)

- Type `investigative`, status `stale`, field `findings_summary`.
- Open clause: *"Open decision: the in-pi pi -p tool surface keeps raw AJV under the CLI-scoped fix;
  covering it requires the library-side option (a) at schema-validator.ts:88, which TASK-016
  deliberately avoids to keep in-pi output stable."*
- Verdict: **grounded documented decision — untouched.** This is not an open fork left dangling: it
  records that TASK-016 *already chose* the CLI-side fix (option b) and *deliberately* declined the
  library-side option (a), naming the exact reason (keep in-pi op output byte-stable). The two
  fix-locations are cited to real code (`schema-validator.ts:88`, `cli.ts:511-523`). This is a
  filed, grounded tradeoff with a stated resolution, not augmentation.

## R-0008 — FGAP-046 schema-merge across pi-context update

- Type `feasibility`, status `stale`, field `findings_summary`.
- Route clause: *"Three routes: R1 deterministic 3-way schema-merge ... R2 agent-mediated
  reconciliation in pi ... Hybrid (git-shaped) ..."* and *"Decision frame (the route is the user's):
  R1 ... ; R2 ... ; Hybrid ..."*
- Grounding: the `question` field reads *"deterministic 3-way merge, agent-mediated reconciliation in
  pi, or hybrid — and what does the code say about each route's feasibility and cost?"* All three
  routes are the filed research directive.
- Verdict: **user-DIRECTED routes + genuine engineering choice — untouched.** The summary resolves the
  decisive *fact* (the 3-way merge BASE does not exist on disk — `checkStatus` stores only a
  content_hash, `context.ts:79`) and prices each route against cited code. The residual "which route"
  is a real scope/value engineering decision (deterministic-offline-high-build vs
  semantic-lowest-build-credentialed vs hybrid), correctly framed as the user's — a legitimate stop,
  not a laundered-derivable decision. Note: the CLAUDE.md Install-ceremony text now describes
  `/context update` as *having* a 3-way merge with `base = object-store body at baseline
  content_hash`, i.e. this research's premise has since been overtaken — exactly what `stale` marks.
  Currency (stale→superseded) is outside this fork-audit's scope; the fork itself is grounded.

## R-0010 — What pi-context is (generative model)

- Type `landscape`, status `stale`, field `findings_summary`.
- No fork. The only "or" tokens are factual descriptions ("derived_from_field or hand-curated views"
  = two real lens kinds; "config-declared vocabulary vs fixed scaffolding" = the item's thesis). An
  embedded audit resolved 22 claims Verified / 3 Incorrect+2 Stale corrected in-body.
- Verdict: **descriptive, determinate — untouched.** `stale_conditions` are count-drift markers (17
  block kinds / 33 relation_types etc.), the honest staleness form.

## R-0011 — Best-of-breed CLI --help UX

- Type `landscape`, status `stale`, field `findings_summary`.
- Key clause: *"ALL SIX points once framed as open design forks are DERIVABLE from the CLI/pi-context
  facts, NOT user-calls: (a) group labels ... (b) color defaults PLAIN ... (c) ... (d) ... (e) ...
  (f) ..."*
- Verdict: **anti-hedge; forks explicitly collapsed to derived decisions — untouched.** This is the
  exemplar of the behaviour the audit *wants*: it takes six things that could have been surfaced as
  user-forks and derives each from CLI/pi-context facts, explicitly stating they are "NOT user-calls."
  Every external claim is URL+date cited; two fetch failures disclosed. Nothing to correct.

## R-0014 — install ceremony CLI-op gap + hook scope gap

- Type `investigative`, status `stale`, field `findings_summary`.
- No fork. Two experience gaps, each investigated to root cause and *filed* (FGAP-088 RESOLVED by
  TASK-059; FGAP-089 OPEN, TASK-060). Determinate throughout; code cited to file:line.
- Verdict: **determinate findings — untouched.** `stale_conditions` track the two FGAPs' resolution
  (honest staleness). No invented alternative anywhere.

## R-0018 — Phase-block dev-process control plane (validation)

- Type `audit`, status `stale`, field `findings_summary`.
- Verdict clause: *"VERDICT on 'zero code, discipline-closable': PARTIAL — filing PHASE-* items ...
  is genuinely zero-code substrate discipline ...; three of the seven control-plane elements are
  gated on named planned work — ... TASK-066 ... TASK-020 ... a net-new invariant."*
- Verdict: **determinate audit verdict (PARTIAL), not a hedge — untouched.** "PARTIAL" is a precise
  finding backed by a zero-code-vs-gated-on-named-code split, each gated element bound to a named
  TASK/invariant and cited code (`context-sdk.ts:864-876`, `roadmap-plan.ts:149-156`). An audit
  verdict of "partial, here is exactly which parts and why" is the opposite of an unsupported fork.

## R-0025 — issue-003 re-drive (pre-identity stamping throw)

- Type `empirical`, status `stale`, field `findings_summary`.
- No fork. Single-variable two-cell reproduction isolates the root cause (missing `substrate_id`
  stamping throw misclassified as validation-failed); disposition enacted (issue-003 resolved,
  FGAP-033 related, FGAP-115 filed). The design question is *resolved by derivation* from project
  precedent toward ceremony-entry identity, to be enacted per DEC-0012 — a resolution, not a hedge.
- Verdict: **empirical, determinate root cause + derived resolution — untouched.**

## R-0028 — Harness requirements (canonical process state machine)

- Type `audit`, status `stale`, field `findings_summary`.
- No fork. Derives a single-track state machine, an enforcement-surface classification
  (MECHANICAL/PARTIAL/HONOR), and a determinate twenty-requirement set (R1-R10 enforceable now,
  R11-R17 need a state layer, R18-R20 named). Options language ("R1-R10 ... R11-R17 ... R18-R20") is
  a requirements partition, not a decision-fork.
- Verdict: **determinate derivation — untouched.** `stale_conditions` include the structured
  `{item-status FEAT-013 complete}` marker — honest currency tracking.

---

## Disposition

12 items audited. 0 corrections. 0 writes to `research.json`. Every fork/open-question clause is
grounded (question-directed, explicitly-resolved, or a genuine feasibility route-choice) and every
item's `stale` status is an honest re-verification marker, not an invented hedge. Nothing in this
shard matches the LLM-augmentation-with-no-basis pattern the audit corrects.
