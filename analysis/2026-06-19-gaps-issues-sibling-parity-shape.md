# framework-gaps ↔ issues sibling-class parity — current-state asymmetry map + required-change shape

**Date:** 2026-06-19
**Active substrate:** `.context` (confirmed via `.pi-context.json` `contextDir`)
**Requirement (verbatim user direction):** "we need gaps and issues to be sibling class items throughout the substrate. a task can and must be able to focus as they can with gaps on issues."
**Scope:** investigation + findings only. Nothing filed, nothing mutated.

## Summary verdict

The asymmetry is real and spans five axes, but it is shallow at the mechanism level: **almost all of it is config/vocabulary, not code.** The two state-derivation/lens engines (`currentState`, `lens-view`) are already fully config-driven and kind-agnostic; making issues a sibling open-work kind a task can focus on is purely a `state_derivation.next_ranked` registry addition plus a `task_addresses_issue` relation_type. The only schema-level work is a deliberate lifecycle decision (issues lack a `closed`/closure-citation lifecycle parity that gaps have, and priority is required-vs-optional). The closure-direction relation (`issue_resolved_by_*` / `task_addresses_issue`) is the load-bearing missing edge for "a task addresses an issue as it addresses a gap." All of this is one coherent gap, not several.

---

## Axis 1 — relation_types (`read-config --registry relation_types`, live config: 40 entries)

Full gap-side vs issue-side parity table. Source endpoints (`source_kinds`→`target_kinds`) cited from the live registry.

| Semantic role | gap-side relation | issue-side counterpart | parity? |
|---|---|---|---|
| **task addresses the work item** | `task_addresses_gap` (tasks→framework-gaps) | **ABSENT** — no `task_addresses_issue` | **MISSING — the core gap** |
| decision addresses | `decision_addresses_gap` (decisions→framework-gaps) | `decision_addresses_issue` (decisions→issues) | present both |
| feature addresses/resolves | `gap_addressed_by_feature` (framework-gaps→features) | `feature_resolves_issue` (features→issues) | present both (opposite direction, see note) |
| addressed-by-decision (reverse) | `gap_addressed_by_decision` (framework-gaps→decisions) | **ABSENT** — no `issue_addressed_by_decision` reverse | divergent, but see note |
| relates to same kind | `gap_relates_to_gap` (framework-gaps→framework-gaps) | **ABSENT** — no `issue_relates_to_issue` | **MISSING** |
| cross-kind relate | `gap_relates_to_issue` (framework-gaps→issues) | (same edge, gap-anchored) | present (gap is the source) |
| decision raises | `decision_raises_gap` (decisions→framework-gaps) | **ABSENT** — no `decision_raises_issue` | divergent (acceptable, see note) |
| decision escalates underdetermined | `decision_escalates_underdetermined` (decisions→framework-gaps) | **ABSENT** (issue analog) | acceptable divergence (gaps are the escalation sink by design) |
| acknowledges missing convention | `item_acknowledges_missing_convention` (decisions/features/tasks→framework-gaps) | **ABSENT** (target is framework-gaps only) | acceptable divergence (missing-convention IS a gap, not an issue — see note) |

### Findings
- **`task_addresses_gap` EXISTS, `task_addresses_issue` does NOT.** This is the literal user requirement. A task cannot edge to an issue the way it edges to a gap. **Required.**
- **Closure direction is absent on the issue side.** Gaps have BOTH directions of the decision/feature linkage (`decision_addresses_gap` AND `gap_addressed_by_decision`/`gap_addressed_by_feature`). Issues only have the source-anchored `decision_addresses_issue`/`feature_resolves_issue`. There is no issue-anchored "addressed by" reverse and — more importantly — **no issue analog of `task_addresses_gap` that lets a task be the closing artifact.** The minimal sibling set is `task_addresses_issue` (tasks→issues), mirroring `task_addresses_gap` exactly. **Required.**
- **`issue_relates_to_issue` is ABSENT** while `gap_relates_to_gap` exists. For true sibling parity (issue↔issue clustering, the way FGAP siblings cross-reference), this is a genuine parity gap. **Required for "throughout."**
- **`item_acknowledges_missing_convention` targets framework-gaps only** (line: live registry `source_kinds:["decisions","features","tasks"], target_kinds:["framework-gaps"]`). This is *correct kind-specific divergence*: a missing convention is by definition a framework-capability gap, not a bug/issue. Do NOT add an issue twin. **Acceptable divergence — justify and leave.**
- **`decision_escalates_underdetermined` / `decision_raises_gap` target framework-gaps only.** Also correct divergence: a gap is the substrate's "what the framework can't yet express" sink; an underdetermined escalation is a gap by construction, not an issue. **Acceptable divergence.**

**Required issue-side relation_types to add (a):** `task_addresses_issue` (tasks→issues), `issue_relates_to_issue` (issues→issues). Optionally `issue_addressed_by_decision`/`issue_addressed_by_feature` reverse edges only if the project wants symmetric bidirectional linkage — but the existing `decision_addresses_issue`/`feature_resolves_issue` already cover the decision/feature→issue direction, so the reverse pair is **NOT required** for sibling parity (gaps' reverse edges are a historical artifact, not a parity requirement). The decisive missing pair is `task_addresses_issue` + `issue_relates_to_issue`.

---

## Axis 2 — invariants (`read-config --registry invariants`)

Gap-scoped invariants and their issue analog:

| invariant id | class | scope | issue analog? |
|---|---|---|---|
| `task-completed-gap-closed` | status-consistency | tasks via `task_addresses_gap`, when_bucket complete → require target bucket complete, **severity warning** | **ABSENT** — no `task-completed-issue-resolved` |
| `decision-cites-forcing-artifact` | requires-edge | decisions, relation set includes `decision_addresses_gap` AND `decision_addresses_issue` AND `decision_addresses_feature` | **already kind-symmetric** (issues already an accepted forcing artifact) |
| `task-completed-feature-complete` | status-consistency | tasks via `task_addresses_feature` | (feature analog of the gap one; an issue analog would mirror it) |

### Findings
- **`task-completed-gap-closed` has NO issue counterpart.** Once `task_addresses_issue` exists, the sibling invariant `task-completed-issue-resolved` (class status-consistency, block tasks, relation_types `["task_addresses_issue"]`, direction as_parent, when_bucket complete, require_target_bucket complete, severity warning) is the parity element — a completed task addressing an unresolved issue should warn exactly as it does for a gap. **Required for "throughout" (b).** This invariant is *only meaningful once `task_addresses_issue` exists*, so it is downstream of axis 1.
- **`decision-cites-forcing-artifact` is already symmetric** — `decision_addresses_issue` is already an accepted forcing artifact alongside `decision_addresses_gap`. No change. (Evidence that issue↔gap parity was *partially* intended already.)

**Required invariants to add (b):** `task-completed-issue-resolved` (mirror of `task-completed-gap-closed`, severity warning to match). `issues.status` already buckets correctly for this: `resolved`→complete, so `require_target_bucket: complete` works with zero status-vocab change (see axis 4).

---

## Axis 3 — state_derivation / currentState (THE CORE OF THE REQUIREMENT)

**Live `state_derivation` (`read-config --registry state_derivation`):**
- `next_ranked`: `[{kind: framework-gaps, label: framework-gap, bucket: todo, rank_field: priority, rank_order: [P0..P3], reason_template: "open gap (priority {rank_value})"}, {kind: tasks, label: task, bucket: todo, reason_template: "unblocked planned task"}]`
- `blocked_by.relation_types`: `["task_depends_on_task", "task_gated_by_item"]`
- `in_flight.kinds`: `["tasks"]`; `focus_fallback`: `{kind: phase, bucket: in_progress}`; `head_size: 15`.

**`currentState` deriver (`packages/pi-context/src/context-sdk.ts:733-961`) — fully config-driven (TASK-020/FGAP-017):**
- `context-sdk.ts:758-761` — resolves `sd = resolveStateDerivation(cwd)`; returns "not configured" if absent. **No hardcoded kind names.**
- `context-sdk.ts:859-905` — `nextActions` iterates `sd.next_ranked` IN ARRAY ORDER. A field-ranked entry (line 860-889) selects `loc.block === entry.kind` at `bucket(item) === entry.bucket`, ranks by `entry.rank_field` against `entry.rank_order`. A topo entry (line 890-903) is the tasks set.
- `context-sdk.ts:870-872` — the selection loop matches **any `entry.kind`**; there is nothing gap-specific in the code path. framework-gaps appears in `nextActions` *only because the config `next_ranked` array lists it*.

### Finding (load-bearing)
**Issues are NOT a `next_ranked` open-work kind**, so they are: not in `nextActions` (not focus-eligible / not ranked), not in `blocked` (only the topo-tasks set is blocked-checked, line 819-853), and not reachable by "what's next." This is exactly "a task cannot focus on an issue as on a gap" at the derivation layer.

**The fix is config-only — NO deriver code change** (the deriver is already kind-general; this is precisely the FEAT-004/TASK-020 capability already landed). Add to `state_derivation.next_ranked` an issues entry, ranked by `priority`:
```
{ kind: "issues", label: "issue", bucket: "todo",
  rank_field: "priority", rank_order: ["critical","high","medium","low"],
  reason_template: "open issue (priority {rank_value})" }
```
`issues.status: open` already buckets to `todo` (axis 4 / status-vocab.ts:84), so issues at `open` are selected with zero status-vocab change. Array position (before/after the gaps entry and the tasks topo entry) IS the cross-kind push order — a decision to make (issues vs gaps precedence), derivable from the project's intent, default after gaps.

**Deriver coupling — one genuine code-or-design point for "task focuses on / addresses an issue as a blocker":** the deriver's `blocked` computation (line 819-853) only iterates the `topoEntry` (the no-rank_field `next_ranked` entry = tasks). Adding issues as a *ranked* entry surfaces them in `nextActions` but does NOT make them blocked-checked or make a `task_addresses_issue` edge participate in task readiness. If "a task focuses on an issue" means the same gate/dependency semantics tasks have, that is satisfied by `task_addresses_issue` being a *data_flow* edge (like `task_addresses_gap`, which also does NOT gate readiness — gaps aren't blockers either). So **no additional deriver coupling is required for parity with how gaps behave** — `task_addresses_gap` is itself a non-blocking data_flow edge. The blocked set is task-topo-only for both kinds equally. **Confirmed: gaps and issues reach identical deriver treatment via the single `next_ranked` entry addition.**

**Interaction with in-progress FGAP-017/TASK-020:** TASK-020 is the work that MADE the deriver config-driven (it is `in_progress` per the task tracker; the live config already carries `state_derivation`, and `context.ts:110-163` defines the `StateDerivation`/`NextRankedEntry` types). The issues `next_ranked` entry is a pure consumer of that capability — it requires TASK-020's config-driven deriver to be landed (it is, in `.context`'s live config). **No conflict; this rides on FEAT-004's mechanism.** Adding the entry is the same shape as FEAT-004's acceptance criterion "a custom substrate declares its own state-bearing vocabulary."

**Required state_derivation change (c):** one `next_ranked` issues entry (above). Also back-port the same entry to the catalog (`samples/conception.json` `state_derivation.next_ranked`) so fresh substrates get sibling treatment — see axis 5 / FGAP-094 interaction.

---

## Axis 4 — schemas (`read-schema framework-gaps` v1.1.1 vs `read-schema issues` v1.0.1)

| dimension | framework-gaps | issues | parity assessment |
|---|---|---|---|
| status enum | `identified, accepted, in-progress, closed, wontfix, superseded_by` | `open, resolved, deferred` | **divergent vocabulary, both bucket correctly** — `closed`→complete, `resolved`→complete; `wontfix`/`superseded_by`/`deferred`→unknown (status-vocab.ts:84,100,104,102). Acceptable kind-specific divergence: both have an open→complete→terminal-not-complete lifecycle; the labels differ but the *buckets* are parallel. NOT a parity gap for derivation. |
| closure-citation field | `closed_by` + `closed_at` (both optional) | `resolved_by` only (optional); **no `resolved_at`** | **genuine parity gap (minor).** Gaps carry both who-and-when of closure (and `block-api.ts:99-117` treats `closed_by`/`closed_at` as the canonical lifecycle-closure author fields a schema MAY declare). issues has `resolved_by` (a commit ref) but no timestamp and is outside the AUTHOR_FIELDS/closure-field stamping set. For sibling closure treatment, issues should carry a `resolved_at` (and ideally route `resolved_by`/`resolved_at` through the same closure-field stamping). **Required-minor (d).** |
| priority | `priority` enum `P0..P3`, **OPTIONAL** | `priority` enum `low..critical`, **REQUIRED** | **divergent + matters for ranking.** Different scale (P-scale vs severity words) is acceptable kind divergence, but the `next_ranked` issues entry must use the issues scale (`["critical","high","medium","low"]`, axis 3). The required-vs-optional difference is acceptable (issues being GitHub-issue-shaped reasonably requires a severity); it does not block sibling derivation since required only makes ranking *more* reliable. **Acceptable divergence — but the rank_order must use the issue scale, not P0-P3.** |
| category | (none) | `category` enum `primitive/issue/cleanup/capability/composition` | issue-specific facet; gaps have `layer`/`package`/`canonical_vocabulary` instead. **Acceptable kind divergence** (each kind has its own facets). |
| lifecycle transitions (`x-lifecycle`) | framework-gaps declares `x-lifecycle` with states + authority-gated transitions | issues declares **none** | **genuine parity gap (minor).** Gaps have a declared lifecycle state-machine with `required_authority` per transition; issues has a bare status enum with no transition declaration. For sibling lifecycle governance, issues should declare an `x-lifecycle` (open→resolved→deferred with authority). **Required-minor (d)** if "throughout" includes lifecycle governance parity; if scoped to focus/addressing only, deferrable — but flagged. |

### Findings
- Genuine schema parity gaps: (1) issues has no `resolved_at` and its closure fields aren't in the closure-field stamping set; (2) issues declares no `x-lifecycle`. Both are minor and schema-only (issues has live items, so closure-field additions are additive-optional = safe; `x-lifecycle` is metadata, no migration).
- Acceptable divergences (justified, do NOT force-symmetrize): status *labels* (buckets are parallel), priority *scale* (P vs severity), `category` vs `layer`/`canonical_vocabulary` facets. Forcing identical enums would be over-reach — the user said sibling-class, not identical schema.

**Required schema changes (d):** add `resolved_at` to issues + route `resolved_by`/`resolved_at` through closure-field stamping (mirror gaps' `closed_by`/`closed_at`); add an `x-lifecycle` to issues mirroring gaps' transition-authority declaration. Both additive/metadata, no data migration.

---

## Axis 5 — ops / lenses / catalog

- **Lenses (`read-config --registry lenses`):** live has `gaps-by-status`, `gaps-by-priority` (target framework-gaps), `tasks-by-status`, plus story advancers + features. **No `issues-by-status` / `issues-by-priority`.** `lens-view.ts` is fully config-lens-generic (lines 130-180; no kind-specific code — bins come from `lens.bins`, target from `lens.target`). **Genuine parity gap (e):** add `issues-by-status` (bins `open/resolved/deferred`) and `issues-by-priority` (bins `critical/high/medium/low`) lenses to mirror the gap pair. Pure config; no code.
- **Ops:** the only kind-specific closure helper is `completeTask` (`context-sdk.ts:2483`), which is **task-specific** (reads the tasks block, asserts a `verification_verifies_item` edge, sets task status). There is NO gap-specific closure op — gap closure is done via generic `update-block-item` (the 4-field FGAP-closure pattern). So **issues lack no op twin that gaps have**; both close via `update-block-item`. No op work required. (Minor doc note: `read-block-item` takes `--id`, not the `--arrayKey`/`--match` shown for `update-block-item` in CLAUDE.md's filing patterns — a read-op signature, not a parity item.)
- **Catalog (`samples/conception.json`):** `relation_types` (35) is a strict subset of live (40) — the **FGAP-094 catalog↔config drift** directly governs this work: every issue-side relation_type added to live config (axis 1) MUST also be added to the catalog, or a fresh `accept-all` substrate will reject the edge at write (same failure mode FGAP-094 documents for `task_gated_by_item`). The catalog's `state_derivation.next_ranked` (verified: gaps + tasks only) and lenses (`tasks-by-status`, `gaps-by-status` only) also need the issues entries (axis 3, axis 5). The catalog has the issues *schema* already (`samples/schemas/issues.schema.json`, v1.0.1, identical to live) — so schema additions (axis 4) must land in BOTH. **The catalog back-port is a required leg of "throughout" and is exactly the class FGAP-094 + TASK-066/TASK-067 address (back-port + build-time parity gate).** This work should ride that gate or be covered by it.

**Required ops/lenses/catalog (e):** `issues-by-status` + `issues-by-priority` lenses (config); catalog back-port of every issue-side relation_type/lens/state_derivation/schema change (config + catalog; interacts with FGAP-094/TASK-066/TASK-067). No new op code.

---

## Consolidated required-change set for sibling parity "throughout"

| group | element | required / acceptable-divergence | depends on |
|---|---|---|---|
| **(a) relation_types** | `task_addresses_issue` (tasks→issues) | **REQUIRED** (the literal requirement) | — |
| (a) | `issue_relates_to_issue` (issues→issues) | **REQUIRED** (mirror `gap_relates_to_gap`) | — |
| (a) | `issue_addressed_by_decision/_feature` reverse | NOT required (existing decision/feature→issue edges suffice; gaps' reverse is artifact) | — |
| (a) | `decision_raises_issue`, issue-targeted `item_acknowledges_missing_convention`, `decision_escalates_underdetermined` issue analog | **acceptable divergence — do NOT add** (gaps are the escalation/missing-capability sink by design) | — |
| **(b) invariants** | `task-completed-issue-resolved` (mirror `task-completed-gap-closed`, status-consistency, severity warning) | **REQUIRED for "throughout"** | (a) `task_addresses_issue` |
| **(c) state_derivation** | `next_ranked` issues entry (bucket todo, rank_field priority, rank_order critical→low) | **REQUIRED — the core "task can focus on issues"** | TASK-020 (landed in live config) |
| (c) | deriver code change | **NONE** — deriver already kind-general; `task_addresses_gap` is itself non-blocking, so issues reach identical treatment | — |
| **(d) schemas** | issues `resolved_at` + closure-field stamping; issues `x-lifecycle` | **REQUIRED-minor** (closure/lifecycle parity); additive, no migration | — |
| (d) | status labels / priority scale / category-vs-layer facets | **acceptable divergence — justified, do NOT force-symmetrize** | — |
| **(e) lenses** | `issues-by-status` + `issues-by-priority` | **REQUIRED** (mirror gap lens pair); pure config | — |
| (e) | catalog back-port of (a)/(c)/(d)/(e) into `samples/conception.json` + `samples/schemas/issues.schema.json` | **REQUIRED leg of "throughout"** | interacts with FGAP-094 / TASK-066 / TASK-067 |
| (e) | ops | **NONE** — no gap-specific closure op exists; both kinds close via generic `update-block-item` | — |

**Mechanism reality:** of the required set, only (d) touches a schema file; everything else is config registry + catalog. **Zero deriver/lens/op source code changes** — the engines are already config-driven (FEAT-004/TASK-020 landed). This is overwhelmingly a vocabulary/config completeness gap, not a code gap.

---

## One gap or several? (independence test: distinct mechanism + distinct fix + non-subsumption)

**ONE framework-gap.** Class: **"issues are not a gap-sibling first-class open-work kind — the substrate's gap-touching vocabulary (task-addressing relation, same-kind relation, completion invariant, ranked-open-work derivation entry, status/priority lens pair, lifecycle/closure schema fields) has no issue counterpart, so a task cannot address/focus-on an issue as it can a gap."**

Independence reasoning:
- All five axes share **one mechanism**: the substrate's per-kind vocabulary completeness (relation_types + invariants + state_derivation + lenses + schema lifecycle fields are the *same* configuration surface, and the engines consuming them are already kind-general).
- All five share **one fix shape**: declare the issue-side twin of each gap-side vocabulary element (plus catalog back-port). No axis needs a distinct *mechanism* fix — they are the facets of a single "make issues a sibling kind" change, decomposable into tasks but not into independent gaps.
- **Non-subsumption check vs existing items:** this is NOT subsumed by FEAT-004 (which is the *deriver-is-config-driven mechanism*; this gap *consumes* that mechanism by adding the issues `next_ranked` entry — FEAT-004 doesn't itself declare issues as open work). NOT subsumed by FGAP-094 (catalog↔config *drift detection*; the catalog back-port leg INTERACTS with FGAP-094/TASK-066/067 — the new issue-side relations must ride the same back-port + parity gate — but FGAP-094 is about *drift of whatever vocabulary exists*, not about *issues lacking the gap-sibling vocabulary in the first place*). NOT subsumed by FGAP-061/FEAT-004's gate-aware readiness (that is task gating; issue addressing is non-blocking data_flow, like gap addressing).
- Axis (e)'s catalog leg is the one cross-cutting dependency: it is *governed by* FGAP-094's class (any new live relation_type must be back-ported + parity-gated), so the gap should **edge to FGAP-094** (`gap_relates_to_gap`) rather than absorb it — the back-port mechanism is FGAP-094's, the *content* (which relations) is this gap's.

**Count: 1 framework-gap, with the five axes as its shape (the decomposing tasks).** Filing the narrow `task_addresses_issue` symptom alone would leave the invariant/derivation/lens/schema/catalog siblings as latent debt and invite duplicate filings — the class is the gap.

---

## Prior-art coverage verdict

Searched framework-gaps (description regex `issue.{0,25}sibling|task_addresses_issue|issue.{0,20}first-class|sibling.class|issue.{0,20}open.work|issue.{0,20}ranked`, and title regex `issue|sibling|parity|relation`), issues, decisions (title `issue|sibling|parity|gap.{0,15}issue|open.work`), research (title `issue|sibling|parity|gap|leverage`), and features.

- **framework-gaps:** zero hits for issue-sibling / task_addresses_issue / issue-as-open-work. The title-`issue` hits are about *the issues block being used for bug tracking* (e.g. the relations.json edge-removal gap, issue-089), not about gaps↔issues parity. **No item tracks this asymmetry.**
- **FGAP-094 (read in full):** catalog↔config relation_type *drift* (catalog ⊆ config). RELATED (the catalog back-port of new issue-side relations rides its back-port + parity-gate class) but does NOT cover the issue-sibling vocabulary deficit itself. Edge to it, don't refile under it.
- **decisions:** only DEC-0006 (op-registry parity) — unrelated (CLI/library surface parity, not block-kind sibling parity).
- **research:** R-0003 (CLI↔ops↔scripts parity) and R-0015 (leverage audit, per CLAUDE.md notes the substrate under-uses ~13/40 relation_types) — R-0015 is thematically adjacent (vocabulary under-use) but does not identify the gaps↔issues sibling asymmetry specifically.
- **features:** FEAT-004 (config-driven derivation) is the *enabling mechanism* this gap consumes, not coverage of the deficit.

**Verdict: genuinely UNFILED.** The single framework-gap (class above) is a justified new filing; it should edge `gap_relates_to_gap`→FGAP-094 (shared back-port/parity-gate mechanism) and reference FEAT-004 as the enabling mechanism. No duplicate exists.

---

## Evidence index (cited, all read this investigation)

- `.pi-context.json` — active substrate `.context`.
- `read-config --registry relation_types` (live, 40) — axis 1 table; `task_addresses_gap` present, `task_addresses_issue`/`issue_relates_to_issue` absent.
- `read-config --registry invariants` — `task-completed-gap-closed` (warning) present, no issue analog; `decision-cites-forcing-artifact` already includes `decision_addresses_issue`.
- `read-config --registry state_derivation` — `next_ranked` = framework-gaps (priority) + tasks (topo); no issues entry.
- `packages/pi-context/src/context-sdk.ts:733-961` (esp. 758-761, 819-853, 859-905) — deriver is fully config-driven, kind-general; `nextActions` matches any `entry.kind`; `blocked` is topo-tasks-only for both kinds equally.
- `packages/pi-context/src/context.ts:110-176` — `StateDerivation`/`NextRankedEntry`/`RollupDecl` types (config-declared derivation contract, FEAT-004/TASK-020).
- `packages/pi-context/src/status-vocab.ts:56-107` — `open`→todo, `resolved`→complete, `deferred`→unknown (issues already bucket correctly; no status-vocab change needed for the next_ranked entry or the resolved-invariant).
- `read-schema framework-gaps` (v1.1.1) vs `read-schema issues` (v1.0.1) — closure fields `closed_by`/`closed_at` vs `resolved_by` only (no `resolved_at`); framework-gaps has `x-lifecycle`, issues none; priority optional (P0-P3) vs required (low-critical).
- `packages/pi-context/src/block-api.ts:99-117` — `closed_by`/`closed_at` are the canonical lifecycle-closure author fields a schema MAY declare/stamp; issues' `resolved_by` is outside this set.
- `packages/pi-context/src/lens-view.ts:130-180` — lens rendering is fully config-bin-generic, no kind-specific code.
- `read-config --registry lenses` — `gaps-by-status`, `gaps-by-priority`; no issues lens pair.
- `packages/pi-context/src/context-sdk.ts:2483-2542` — `completeTask` is task-specific; NO gap-specific closure op exists (both gaps and issues close via generic `update-block-item`).
- `samples/conception.json` (state_derivation, lenses [tasks-by-status, gaps-by-status], invariants, relation_types=35) + `samples/schemas/issues.schema.json` (v1.0.1, identical to live) — catalog lacks the issue-side derivation/lens entries; back-port required, interacts with FGAP-094.
- `read-block-item framework-gaps FGAP-094` — catalog↔config drift class (related-not-covering).
- Prior-art searches (framework-gaps/issues/decisions/research/features) — no item tracks the gaps↔issues sibling asymmetry.
