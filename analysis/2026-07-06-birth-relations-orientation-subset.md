# Birth-relations orientation subset — the filing atom cannot express a role-typed ambiguous edge

**Date:** 2026-07-06 · **Investigator:** fresh-context gap-exploration agent · **Trigger:** first live dogfooding of the `relations` filing parameter (shipped commit `244e3d43`, same day): filing a decision with a `decision_derived_from_item` birth edge was refused with an instruction (`re-issue with --primary/--counter`) that the birth-relations shape cannot follow.

## 1. Root cause

Two surfaces shipped at different times with different orientation vocabularies, and the newer one funnels into the older one's guard without affording the older one's escape:

- **FGAP-113 role-typed append (pre-existing).** `RelationAppendInput` (`packages/pi-context/src/context-sdk.ts:1738`) accepts EITHER raw `{parent, child}` OR role-typed `{primary, counter}`. `orientAppendInput` (context-sdk.ts:1778) maps `primary`/`counter` → `parent`/`child` via the relation's declared `role_direction`, and — the load-bearing guard, context-sdk.ts:1812 — **rejects a bare `{parent, child}` append of any relation that both declares `role_direction` and is orientation-ambiguous** (`relationKindsOverlap`, context-sdk.ts:1755: source/target kinds share a kind, either side lists `"*"`, or either side is undeclared). The rejection message instructs: "Re-issue with --primary/--counter".
- **Birth relations (shipped 244e3d43).** The filing ops' `relations` entries are shape-locked to `{relation_type, direction: "as_parent"|"as_child", other, ordinal?}` (`BirthRelation`, ops-registry.ts:245; enforced by `coerceBirthRelations`, ops-registry.ts:258 — any other key set is refused at coercion). `appendBirthRelations` (ops-registry.ts:300) translates each entry into a **bare `{parent, child}`** call to `appendRelationByRef` — unconditionally the raw form.

So for the 14 relation_types below, every birth-relations entry arrives at `orientAppendInput` in exactly the form the guard exists to reject, and the refusal's remedy (`--primary/--counter`) has no expression inside the `relations` parameter. The guard is correct (it is what closed FGAP-113); the birth shape is the defect — it affords only the raw half of the orientation vocabulary.

## 2. Affected relation_types (computed against the live registry)

Live registry (`pi-context read-config --registry relation_types --json`, 2026-07-06): **44 registered relation_types, 17 role-bearing** (matching the FGAP-113 catalog lock in `edge-orientation.test.ts`). Applying `relationKindsOverlap` faithfully — overlap ⇔ shared kind, `"*"` on either side, or a missing kind set — **14 of the 17 are orientation-ambiguous and therefore unfilable as birth edges**:

| relation_type | role_direction | source × target | overlap via |
|---|---|---|---|
| decision_supersedes_decision | as_parent | decisions × decisions | same-kind |
| task_depends_on_task | as_parent | tasks × tasks | same-kind |
| story_depends_on_story | as_parent | story × story | same-kind |
| requirement_depends_on_requirement | as_parent | requirements × requirements | same-kind |
| research_supersedes_research | as_parent | research × research | same-kind |
| milestone_precedes_milestone | as_parent | milestone × milestone | same-kind |
| feature_depends_on_item | as_parent | features × * | wildcard |
| story_includes_item | as_parent | story × * | wildcard |
| task_gated_by_item | as_child | tasks × * | wildcard |
| feature_gated_by_item | as_child | features × * | wildcard |
| story_gated_by_item | as_child | story × * | wildcard |
| decision_gated_by_item | as_child | decisions × * | wildcard |
| item_derived_from_item | as_child | * × * | wildcard |
| decision_derived_from_item | as_child | decisions × * | wildcard |

Not affected (role-bearing but disjoint-kind, self-orienting via the kind gate, bare form allowed): `feature_contains_story` (features × story), `task_positioned_in_phase` (tasks × phase), `phase_positioned_in_milestone` (phase × milestone). The 27 role-less relation_types are unaffected (bare form is their only and correct form).

Note the affected set contains the entire gated-by family and both derived-from relations — precisely the relation_types most natural as BIRTH edges (a new item declaring what gates it, what it derives from, what it supersedes/depends on).

## 3. Empirical reproduction (library level, built dist, scratchpad fixture)

Throwaway substrate (`.project` pointer, `decisions` block + schema, `decision_derived_from_item` registered exactly as live: source `["decisions"]`, target `["*"]`, role_direction `as_child`). Driven via `npx tsx` against `packages/pi-context/dist` (dist built 2026-07-06 08:12, after 244e3d43 at 08:11). Demo scripts: session scratchpad `birth-orientation-demo.mjs` / `birth-orientation-demo2.mjs`.

**(a) Birth append of the ambiguous role-typed relation is refused; with an invariant-declaring config (live parity) the composite is byte-restored.** Fixture config declares `decision-shows-derivation` at `warning` (as live):

```
== (a) invariant-declaring fixture (warning severity, live parity) ==
REFUSED: Relation 'decision_derived_from_item' carries a declared role_direction and is orientation-ambiguous (its source and target kinds overlap), so a bare --parent/--child append cannot be reliably oriented. Re-issue with --primary/--counter (primary = the endpoint holding the relation's semantic role, stored at edge.child).
post-refusal fixture diff vs pre-op snapshot: BYTE-IDENTICAL
decisions.json items after refusal: []
```

Snapshot-gating nuance (observed, matches the documented gate design): on a fixture whose config declares **no invariants**, the same refusal left the item behind — `invariantSnapshot` returns null on a no-invariant substrate (ops-registry.ts:2586), so no snapshot is taken and the mid-composite restore cannot fire:

```
== (a) append-block-item with ambiguous role-typed birth relation ==   [no-invariant fixture]
REFUSED: Relation 'decision_derived_from_item' carries a declared role_direction ... Re-issue with --primary/--counter ...
post-refusal fixture diff vs pre-op snapshot: [ 'CHANGED: decisions.json' ]
decisions.json items after refusal: [{"id":"DEC-002","title":"demo decision"}]
```

The live `.context` declares 13 invariants, so live filings restore byte-exact. The no-invariant partial write is the CHANGELOG-documented snapshot gating ("substrates declaring no invariants are unaffected"), reported here as an observed boundary of the all-or-nothing claim, not pursued further.

**(a′) The birth shape structurally has no role form** — an entry attempting one is refused at coercion, before any write:

```
== (a') birth entry attempting a role form (no direction) ==
REFUSED: relations[0] must be {relation_type: string, direction: "as_parent"|"as_child", other: string, ordinal?: integer}
```

**(b) The same edge succeeds as a standalone role-typed append** (the workaround used live: file the item without the ambiguous edge, then `appendRelationByRef` with primary/counter; for `role_direction: as_child` the primary — the derivation source — is stored at `edge.child`, the decision at `edge.parent`):

```
step 1 (item only): Appended item 'DEC-002' to decisions.decisions
step 2 (standalone role-typed append): appended = true
stored edge: {"parent":{"kind":"item","oid":"DEC-002","refname":"DEC-002"},"child":{"kind":"item","oid":"FGAP-001","refname":"FGAP-001"},"relation_type":"decision_derived_from_item"}
relations.json edge count: 1
bare standalone REFUSED: Relation 'decision_derived_from_item' carries a declared role_direction and is orientation-ambiguous ...
```

**(c) Severity interaction demonstrated: raise `decision-shows-derivation` to `error` and every filing path is refused — the deadlock the transition atom exists to prevent:**

```
== (c) SAME invariant at ERROR severity: every filing path refused ==
path 1 (item alone) REFUSED: append-block-item refused — the write would introduce 1 invariant violation(s) (substrate restored byte-exact): Decision 'DEC-002' shows no derivation basis
path 2 (atom with birth edge) REFUSED: Relation 'decision_derived_from_item' carries a declared role_direction and is orientation-ambiguous ... Re-issue with --primary/--counter ...
path 3 (edge before item) appended — note: porcelain does not require endpoint existence
```

Path 3 (standalone edge filed before its item exists) is observed but is not a sanctioned escape: it is impossible under `autoId` (the id is unallocated before the filing — the standard pattern), it rests on the kind gate skipping unresolvable endpoints, and a subsequent filing failure strands a dangling edge. The two-op sequence in either order is exactly the multi-op transition the error gate forbids by design.

## 4. Class characterization (gap-explore-surfaces-class)

**The class: the birth-relations entry shape affords a strict subset of the orientation/preview affordances the standalone relation-append porcelain affords, while being the only shape the transition atom accepts.** Parameter-surface comparison:

| dimension | append-relation (single) | append-relations (bulk) | birth `relations` entry |
|---|---|---|---|
| raw orientation (parent/child) | yes | yes (per edge) | yes (`direction` + `other`, new item fixed at one endpoint) |
| role-typed orientation (primary/counter) | yes | yes (per edge) | **no — inexpressible; guard's remedy unfollowable** |
| ordinal | yes | yes | yes |
| dryRun preview running the orientation guard | yes (`appendRelationByRef` orients before the dryRun branch) | yes | **no** — `append-block-item` has no dryRun; `upsert-block-item --dryRun` reports "would file N birth relation(s)" **without** endpoint/orientation validation (ops-registry.ts:818-822, documented in 244e3d43), so a preview reports would-file for an edge the live run refuses |
| both endpoints free selectors | yes | yes | no — inherent to birth semantics (one endpoint IS the new item), not a defect |

The one-symptom instance is `decision_derived_from_item`; the class is the 14-type affected set plus the preview-parity cell. Fixing only the observed relation_type (or special-casing decisions) would leave 13 sibling refusals live and invite duplicate filings — the fix belongs at the shape level.

**Severity interaction and current exposure, quantified.** The `error-invariant-transition-atom` convention (read from the live substrate) declares error severity legitimate ONLY where a single op affords the complete transition, and NAMES `append-block-item` / append-mode `upsert-block-item` with `relations` as the birth-edge atom. For the 14 affected relation_types that atom is unusable, so:

- an error-severity `requires-edge` invariant demanding one of the 14 as a birth edge deadlocks filings on that block entirely (demonstrated in (c); the skill narrative's own words — "the atomic filing form is the only path the write-time gate accepts" — become "there is no path");
- convention rule 2 ("before declaring at error, NAME the op that affords the atom") is unsatisfiable for those 14 types until the shape is fixed — every severity raise wanting such an edge is blocked at warning by rule 3.

**Live exposure today: no deadlock.** Live invariants registry (13 declared, read 2026-07-06): the six error-severity invariants demand only role-less relation_types (`verification_verifies_item`, `decision_addresses_issue|feature|gap`, `item_governed_by_convention`, `item_acknowledges_missing_convention`, `phase_positioned_in_milestone` — the latter role-bearing but disjoint, and a status-consistency check, not a birth-edge demand). Exactly **one** live invariant demands an affected type: `decision-shows-derivation` (**warning**) wanting `decision_derived_from_item` (or the role-less alternative `decision_escalates_underdetermined`). Warning severity is why today's live filing survived as a two-op sequence: the bare filing landed with a write-warning, and the standalone role-typed append cleared it. The exposure is therefore: (1) every birth-filing of any of the 14 types is refused with an unfollowable instruction, forcing non-atomic two-op sequences today; (2) the documented backfill-then-raise path for `decision-shows-derivation` — the natural next severity raise, since derive-decisions-from-facts is its stated trajectory — is blocked; any future error invariant over the gated-by/derived-from/supersedes families is likewise blocked.

## 5. Prior art (searched before proposing any filing)

Searches run against the live substrate (`filter-block-items --block framework-gaps`, single-term `matches` on `title` and `description`): `birth` (title 0, description 0), `orientation` (title 1: FGAP-113), `primary` (title 0, description 0), `role` (title 1: FGAP-061), `role_direction` (description 1: FGAP-061).

- **FGAP-113** — *Edge orientation … no surface signals a wrong-orientation guess* — **closed** (TASK-027/VER-062, merged 3bc3d7a4, 2026-07-04). It is the **origin** of both the role-typed `--primary/--counter` form and the ambiguous-bare-append reject this gap trips over. Its scope was the then-existing write/read/derive/validate surfaces; the birth-relations surface did not exist until 244e3d43 (2026-07-06), so FGAP-113 does not cover it. Relationship: the new gap is the FGAP-113 write-orientation contract left unplumbed through a surface shipped after its closure — related-to, not duplicated-by.
- **FGAP-061** — feature/story readiness derivation — **identified**, P2. Keyword coincidence only (`role_direction` in its shipped-leg description); no coverage of this gap.
- No task, gap, or decision tracks the birth-relations shape itself (the param is hours old). **A new filing is justified.**

## 6. Proposed resolution (class-correct)

Extend the birth-relations entry to afford BOTH orientation forms, mapped exactly as `orientAppendInput` maps the standalone flags — the shape gains the role vocabulary; the guard and mapping logic stay single-sourced in `orientAppendInput`:

- Entry shape: `{relation_type, other, ordinal?}` plus EITHER `direction: "as_parent"|"as_child"` (raw form, unchanged semantics: the NEW item occupies that endpoint) OR `role: "primary"|"counter"` (role form: the NEW item holds that role; `other` holds the complement). Exactly one of `direction`/`role` per entry — `coerceBirthRelations` enforces the mutual exclusion and the enum, mirroring the standalone pairs' mutual exclusion.
- `appendBirthRelations` builds the role-typed `RelationAppendInput` for role entries — `role: "primary"` → `{primary: itemId, counter: other}`, `role: "counter"` → `{primary: other, counter: itemId}` — and passes it to `appendRelationByRef` unchanged, so the SAME guard errors apply with no new logic: a role entry on a relation declaring no `role_direction` throws the existing "declares no role_direction … author with --parent/--child" error; a `direction` entry on an ambiguous role-bearing relation keeps throwing the existing re-issue error, which is now followable in-shape (re-issue the entry with `role`).
- Preview parity (the second class cell): run the orientation mapping/guard over coerced entries at `upsert-block-item --dryRun` (and any future `append-block-item` dryRun) so a preview refuses what the live run refuses — endpoint resolution may legitimately stay out (the item is unwritten); orientation needs only the registry.
- Regression locks: birth filing of each guard path (ambiguous+`direction` → refusal; ambiguous+`role` → lands with correct stored orientation per `role_direction`; role-less+`role` → refusal; mutual-exclusion violation → coercion refusal), plus the error-severity deadlock demo (c) turned into a test that passes post-fix via the role form.

**Docs surfaces the fix must sync (docs-surface-sync, binding):** the two op strings in `ops-registry.ts` (`append-block-item` + `upsert-block-item`: `description`, the `relations` param/entry descriptions, the decision-filing example — usage-only); `packages/pi-context/README.md` lines 29 + 86 (write-pipeline atom prose + Block CRUD prose, both currently describing the entry as `direction`-only); root `README.md` (audited: no birth-relations shape prose today — verify, likely no change); `packages/pi-context/skill-narrative.md` atomic-filing paragraph (line 46: names `append-block-item --relations` as the error-severity path — must state both entry forms); `npm run skills` SKILL.md regen; `CHANGELOG.md` `[Unreleased]` (the defect/fix framing lives only here).

## 7. DRAFT framework-gaps item (orchestrator presents; NOT filed)

```json
{
	"title": "Birth-relations entries afford only the raw direction form — the 14 orientation-ambiguous role-typed relation_types cannot be filed as birth edges, so the filing transition atom is unusable exactly where FGAP-113's write guard demands the role form",
	"status": "identified",
	"priority": "P1",
	"package": "pi-context",
	"canonical_vocabulary": "birth-relations role-typed orientation parity (filing-atom entry shape affords primary/counter)",
	"description": "The relations filing parameter on append-block-item / append-mode upsert-block-item (244e3d43) shape-locks each entry to {relation_type, direction: as_parent|as_child, other, ordinal?} (BirthRelation, ops-registry.ts:245; coerceBirthRelations refuses any other key set) and appendBirthRelations (ops-registry.ts:300) translates every entry into a bare {parent, child} appendRelationByRef call. orientAppendInput (context-sdk.ts:1812, the FGAP-113 guard) REJECTS a bare append of any relation that declares role_direction and is orientation-ambiguous per relationKindsOverlap (context-sdk.ts:1755 — shared kind, '*' wildcard, or undeclared kind set), instructing re-issue with --primary/--counter — an instruction the birth shape cannot express. Affected: 14 of the 17 role-bearing relation_types in the live registry (all six same-kind ordering relations: decision_supersedes_decision, task_depends_on_task, story_depends_on_story, requirement_depends_on_requirement, research_supersedes_research, milestone_precedes_milestone; all wildcard gated-by/derived-from/includes/depends: feature_depends_on_item, story_includes_item, task_gated_by_item, feature_gated_by_item, story_gated_by_item, decision_gated_by_item, item_derived_from_item, decision_derived_from_item); the 3 disjoint-kind role-bearing relations and all 27 role-less relations are unaffected. Class, not one symptom: the birth entry shape affords a strict subset of the standalone append-relation/append-relations porcelain — no role-typed pair, and no preview parity (upsert --dryRun reports would-file for birth entries without running the orientation guard, so preview passes what the live run refuses; append-block-item has no dryRun). Severity interaction: the error-invariant-transition-atom convention names filing-with-relations as the birth-edge atom; for the 14 types the atom cannot express the edge, so an error-severity requires-edge invariant demanding one deadlocks filings on that block (empirically demonstrated: at error severity the bare filing is gate-refused, the atom is orientation-refused, and the two-op sequence's first op is gate-refused), and convention rule 2 (name the atom before raising to error) is unsatisfiable for those types.",
	"evidence": [
		{ "file": "packages/pi-context/src/ops-registry.ts", "lines": "245-313", "reference": "BirthRelation shape (direction-only) + coerceBirthRelations key-set refusal + appendBirthRelations building unconditionally-bare {parent, child} appendRelationByRef calls" },
		{ "file": "packages/pi-context/src/context-sdk.ts", "lines": "1755-1820", "reference": "relationKindsOverlap overlap definition ('*' or shared kind or undeclared set) + orientAppendInput ambiguous-bare-append reject whose remedy (--primary/--counter) has no birth-shape expression" },
		{ "file": "packages/pi-context/src/ops-registry.ts", "lines": "818-822", "reference": "upsert-block-item dryRun reports a would-file birth-relation count without orientation validation — preview passes an entry the live run refuses (the second subset cell)" },
		{ "file": ".context/config.json", "reference": "read-config --registry relation_types: 44 registered, 17 role-bearing, 14 orientation-ambiguous (computed 2026-07-06); read-config --registry invariants: 13 declared — only decision-shows-derivation (warning) demands an affected type (decision_derived_from_item), no error invariant does" },
		{ "file": "analysis/2026-07-06-birth-relations-orientation-subset.md", "reference": "investigation of record: root-cause trace, affected-set computation, library-level reproduction transcripts (refusal + byte-identical restore on an invariant-declaring fixture; standalone primary/counter success; error-severity three-path deadlock demo), prior-art map (FGAP-113 closed origin, uncovered surface), class characterization" }
	],
	"impact": "Every birth filing carrying one of the 14 affected relation_types is refused with an unfollowable instruction, forcing the edge into a second standalone op — a non-atomic sequence that survives today only because the sole live invariant demanding an affected type (decision-shows-derivation) is warning severity. The affected set is the gated-by / derived-from / supersedes / depends families — the relation_types most natural as birth edges. Under any error-severity requires-edge invariant demanding one of the 14 (the documented backfill-then-raise trajectory for decision-shows-derivation is the nearest case), filings on that block deadlock: bare filing gate-refused, atom orientation-refused, two-op sequence gate-refused — the exact class the error-invariant-transition-atom convention exists to prevent, and the skill narrative's stated guarantee (the atomic filing form is the path the gate accepts) becomes no-path. The upsert dryRun preview additionally false-passes such entries.",
	"proposed_resolution": "Give the birth entry both orientation forms, single-sourcing guard + mapping in orientAppendInput: each entry carries {relation_type, other, ordinal?} plus EITHER direction: as_parent|as_child (raw, unchanged) OR role: primary|counter (the NEW item holds that role; other holds the complement), mutually exclusive per entry (coerceBirthRelations enforces). appendBirthRelations maps role entries to the role-typed RelationAppendInput (primary → {primary: itemId, counter: other}; counter → {primary: other, counter: itemId}) and delegates unchanged, so the existing orientAppendInput errors apply verbatim (role on a role-less relation → existing no-role_direction throw; direction on an ambiguous role-bearing relation → existing re-issue throw, now followable in-shape). Preview parity: run the orientation mapping/guard over coerced entries under upsert --dryRun (endpoint resolution may stay out; orientation needs only the registry). Regression locks per guard path plus the error-severity deadlock demo passing post-fix via the role form. Docs-surface-sync: both op strings in ops-registry.ts, packages/pi-context/README.md lines 29 + 86, skill-narrative.md atomic-filing paragraph, SKILL.md regen, CHANGELOG [Unreleased]."
}
```

Priority reasoning (P1): the defect disables the shipped transition atom for the 14 relation_types most natural as birth edges and blocks the convention's own severity-raise path (rule 2 unsatisfiable), while a warning-severity workaround exists today — degraded-but-not-deadlocked argues against P0; the certainty that any error-raise over derived-from/gated-by deadlocks filings argues above P2.
