# Hedge-audit shard — verification block (25 items)

Audit date: 2026-07-11. Procedure: `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`, applied per item.
Block: `verification`, array key: `verifications`. Writer identity for any correction: `davidryan@gmail.com`.

## Cross-cutting finding (governs the whole shard)

Every item in this shard is a RETROSPECTIVE verification record: a completed check's own account of
what was observed at verification time (commits, test names, runtime demos, adversarial-probe verdicts,
deferrals). This record type is governed by rhetorical-register rule 5 ("no prior-state narration") in the
sense the brief names: a verification's `evidence` legitimately DESCRIBES what was actually observed. The
only correctable target for this record type is a genuine INVENTED epistemic hedge — a verifier writing
"this probably passes" / "presumably verified" / "should be fine" INSTEAD of stating an observation.

The tokens that caused these items to flag (fork "or", deferral "deferred", modal "should"/"may") are, in
every case in this shard, one of:
- a factual description of a REAL code branch ("renders a report OR dispatches a mergetool");
- a deferral that cites a specific, tracked successor item;
- an honest limitation caveat scoping precisely what a non-interactive/uncredentialed harness could NOT
  observe (the OPPOSITE of an invented hedge — it narrows the claim rather than inflating it).

No epistemic hedge about a verification's own conclusion appears anywhere in the 25 items.

Grounding checks performed:
- `pi-mono-is-exemplar` (read fresh): its four clauses (declarative population, editable installed files,
  two-tier config, named-constant defaults) are SILENT on every clause in this shard — it bears on no
  branch choice here and is not invoked as a tiebreaker.
- Cited deferral successors verified to EXIST (deferrals are real pointers, not fabricated): FGAP-033
  (closed by TASK-082/VER-070, exactly as VER-070 records), TASK-036 (completed), FGAP-136 (closed).

Verdict for the flagged clause in every item below: **DERIVABLE-from-a-source-that-supports-it** — the
source being the verification run / commits / tests / operator-confirmation the record itself cites, of
which the record is the primary account. **No corrections made. No substrate writes.**

Per step 8: no clause in this shard is an unbuilt "open question" branch requiring a standing/underdetermined
call — the deferrals are records of decisions already made and tracked to named successors, and no retraction
is at issue because there is no fork to retract.

---

## VER-014 — passed, TASK-026/FGAP-029 safe schema re-sync
Flagged clause: "the pre-identity re-sync case is deferred to FGAP-033."
Deferral citing a real successor (FGAP-033 confirmed present; itself later closed by TASK-082/VER-070).
Factual record. GROUNDED. No change.

## VER-017 — passed, TASK-028 CLI exec bit
Flagged clause: "POSIX-chmod an accepted scope decision"; "published path inherits via prepublishOnly."
Records the probe's scope decision and a factual inheritance mechanism; skipped criterion 5 honestly
marked "deferred, release-gated." GROUNDED. No change.

## VER-018 — passed, TASK-029 meta-package dep
Flagged clause: "Honest caveat: in-repo the resolve succeeds via the workspace symlink regardless of the
declaration — the declaration's effect is only provable at a registry install (deferred, release-gated)."
This is a precise limitation caveat (narrows the claim), not a hedge. GROUNDED. No change.

## VER-019 — passed, TASK-030 pi-bound
Flagged clause: "the real interactive pi session from a registry/global install ... is credentialed +
release-gated, deferred." Honest scoping of the uncredentialed harness boundary; the deferred live piece
is exactly what VER-024 later records as operator-confirmed. GROUNDED. No change.

## VER-020 — passed, TASK-034 update op
Flagged clause: "The merged-of-locally-modified is deferred to TASK-036." Deferral citing a real successor
(TASK-036 confirmed present, completed). GROUNDED. No change.

## VER-021 — passed, TASK-035 base-stamping
Flagged clause: "The merge consuming this base is TASK-036." Factual forward pointer to a real successor.
GROUNDED. No change.

## VER-023 — passed, TASK-037 conflict resolver
Flagged clauses: "... or renders a {path,base,ours,theirs} report when non-interactive" (a real code
branch); "not a live pi session in this non-interactive harness" (honest harness-boundary caveat).
Both factual. GROUNDED. No change.

## VER-024 — passed, FEAT-005 operator real-session smoke
Flagged token: none epistemic. Record of an operator-confirmed live run ("Recorded at the operator's
direction 'done'; the orchestrator did not itself run the interactive session") — factual provenance
statement, not a hedge. GROUNDED. No change.

## VER-029 — passed, TASK-015 CLI pre-call input layer
Flagged clauses describe real behavior branches (kebab/camel normalization, --id aliasing, arrayKey
derivation, shorthands) and a probe-found defect FIXED at f1aef2b. All factual. GROUNDED. No change.

## VER-031 — passed, TASK-017 CLI ergonomics
Flagged clauses enumerate real exit-code branches and two probe-found defects, both fixed and re-audited.
Factual record. GROUNDED. No change.

## VER-034 — passed, TASK-040 top-level dispatch
Flagged clauses describe the grouped-help classifier and --version branch factually, with the probe's
zero-defect verdict. GROUNDED. No change.

## VER-035 — passed, TASK-042 per-op help
Flagged clauses record four iterate-to-zero findings and their fixes factually. GROUNDED. No change.

## VER-036 — passed, TASK-045 check-changelog exemption
Flagged clause: "The monitor test mutating the shipped hedge.patterns.json on each run is a separate
test-hygiene matter, noted not fixed." Honest scoping of an out-of-scope observation. GROUNDED. No change.

## VER-037 — passed, TASK-043 context-lens-view op
Flagged clauses describe real op behavior and a probe-found composition-coverage finding, fixed. Factual.
GROUNDED. No change.

## VER-039 — passed, TASK-048 blocked-outcome diagnostic
Strongest hedge-candidate in the shard: "Dry/live detail divergence reasoned impossible (...) and asserted
by deepEqual parity tests on both arms." The "reasoned impossible" epistemic claim is immediately grounded
by "asserted by deepEqual parity tests on both arms" — proven by passing tests, not "probably." GROUNDED.
No change.

## VER-043 — passed, TASK-049 context-check-status op
Flagged clauses describe real reporting fields and adversarial fixtures factually. GROUNDED. No change.

## VER-044 — passed, TASK-050 read-catalog-schema op
Flagged clauses describe verbatim-emit behavior and a probe-found trailing-newline defect, fixed. Factual.
GROUNDED. No change.

## VER-051 — passed, TASK-065 gate-aware readiness
Flagged clauses: real both-directions runtime demo; probe finding resolved as "no code change warranted"
because the falsifying input is "not producible via the dedup-on-write API" — a grounded resolution, not a
hedge. GROUNDED. No change.

## VER-070 — passed, TASK-082 ceremony-entry identity
Flagged clauses record the establishment mechanism and re-greened S4 tests factually; consistent with
FGAP-033's own closed_by (cross-checked). GROUNDED. No change.

## VER-073 — passed, derived-status invariant class
Flagged clauses describe the dual-surface registration and the live MILE-003 divergence firing, factually.
GROUNDED. No change.

## VER-081 — passed, bundled-spec resolution
Flagged clauses record tier precedence and a first-probe refutation that "re-entered the pipeline as the
follow-on task" — factual iterate-to-zero account. GROUNDED. No change.

## VER-082 — passed, bundled-spec compile + model precedence
Flagged clauses record four adversarial probes' findings and fixes factually. GROUNDED. No change.

## VER-094 — passed, FGAP-136 pi-context citation sweep
Flagged clauses record table/site mismatches "handled by dropping the bare ID and keeping ... accurate
prose ... and reported rather than silently reconciled" — factual account of handling. GROUNDED. No change.

## VER-096 — passed, TASK-117 remove revision-moved
Flagged clause: "One residual item found and left OPEN ... a corrective edit is drafted and pending user
provenance grant." Honest scoping of an out-of-scope residual. GROUNDED. No change.

## VER-097 — passed, scan-substrate-hedges.ts
Flagged clauses record the live runtime demo (496 items, 142 candidates) and the FGAP-125 pin factually.
GROUNDED. No change.
