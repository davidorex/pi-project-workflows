# Hedge-audit shard — framework-gaps (2026-07-11)

Shard of 20 items audited against `analysis/2026-07-11-gap-fork-provenance-audit-brief-template.md`.
Block `framework-gaps`, array key `gaps`. Convention `pi-mono-is-exemplar` read once (declarative-install / locally-editable / two-tier-config / named-defaults) and applied where it bears.

Verdict vocabulary: user-VERBATIM / user-DIRECTED / DERIVABLE-from-supporting-source / LLM-augmentation-with-no-basis. Correction made ONLY for the last.

---

## FGAP-002 — no substrate clone/import; substrate identity carries no provenance

- **Flagged category**: fork/modal ("minted-here vs derived-from"; impact "would silently absorb a foreign or colliding id").
- **Filing session**: `8490e49a` (spans 2026-05-31→06-03). FGAP-002 created 2026-06-03T22:15:05Z; DEC-0002 created 15s later at 22:15:20Z.
- **User direction (verbatim, 2026-05-31, same session)**: "do have in .project context a known gap for cross-substrate issues"; "we borrowed the very valuable idea of /context switch from git. are there other conceptual moves from git we can consider for resolution of this class and other classes of inter-substrate communication/referenceing"; "i like the hash idea though. i want foundational solutions. and the .project focus is only for this project but represents a general need." — the user directed the cross-substrate gap, the git-borrow framing (clone/fork), the hash (content-addressed) idea, and "foundational solutions."
- **Cited source DEC-0002 (enacted)**: decides a SINGLE resolution — "Clone uses FORK semantics, not mirror… MINTS A FRESH substrate_id… recording a substrate_derived_from_substrate edge… registry entry gains origin/provenance… pi-context clone <source> <dest> is the dual-surface command (library + Pi tool + CLI + orchestrator script). Mirror semantics… are rejected." The one alternative (mirror) is explicitly rejected, not left open.
- **Precedent**: item_derived_from_item / promoteItem cited as the item-level parallel — a shipped mechanism, supports the design.
- **pi-mono-is-exemplar**: consistent (dual-surface, declarative). Not decisive; not contradicted.
- **Code check**: the resolution is unbuilt (no cloneSubstrate op), but nothing in it is *contradicted* by shipped state; DEC-0002 is enacted and unretracted.
- **Standing**: no retraction found — DEC-0002 enacted, gap accepted, undeclined directed intent.
- **Verdict**: user-DIRECTED + DERIVABLE-from-enacted-DEC-0002. The "vs"/"or"/"would" phrasing describes the decided single design, not a live unresolved fork. **No correction.**

---

## FGAP-005 — ordered ref-collections need a convergent sequence field-kind

- **Flagged category**: deferral ("capability is latent until… FGAP-004 exists") + and/or ("insert, delete, and/or move").
- **Filing session**: `8490e49a`; FGAP-005 created 2026-06-03T22:42:55Z, DEC-0005 17s later at 22:43:12Z.
- **User direction**: same 2026-05-31 git-borrow/foundational-inter-substrate thread as FGAP-002; the CRDT-sequence gap is a derivation under FGAP-004 (structure-aware git merge driver), itself flowing from the user's "moves from git" / "foundational solutions" direction.
- **Cited source DEC-0005 (enacted)**: decides a SINGLE design 1:1 with the item's proposed_resolution — Fugue-class non-interleaving sequence CRDT over item-refs, Kleppmann move-CRDT position register, HLC total order, field-aware merge driver, sort-on-read array projection, CRDT state in owning block.json. No alternative left open.
- **Deferral is decided, not hedged**: DEC-0005 consequence states verbatim "Latent until the structure-aware git merge driver (FGAP-004) exists; until then it degrades to the current single-writer array behavior." The "latent until FGAP-004" clause in the gap is this decided dependency.
- **Code check**: unbuilt but uncontradicted; degrades to current single-writer array (which the evidence confirms is what ships today).
- **Standing**: no retraction found — DEC-0005 enacted, gap accepted.
- **Verdict**: user-DIRECTED + DERIVABLE-from-enacted-DEC-0005. The deferral is a decided dependency; "and/or" enumerates the concurrent-edit cases the CRDT must cover, not a choice. **No correction.**

---

## FGAP-011 — no release/version vocabulary  ***[CORRECTED]***

- **Flagged category**: optional/deferral qualifier ("+ optionally a milestone/roadmap instantiation") + naming fork ("e.g. release_contains_item / task_shipped_in_release / gap_closed_in_release").
- **Filing session**: `8490e49a`; created 2026-06-04T01:47:12Z. No cited DEC (status accepted, open).
- **User direction (verbatim, same session, minutes before filing)**: "does our current .context allow for planning in advance when we'll do a release/changelog stuff; not programmatically but rather after decision" (2026-06-04T01:42:34Z); "file the release-vocab gap. and then i want us to articulate in something that persists so we don't find ourselves in \"oh we haven't kept track of changelogs / release based on organized dev items done\"" (2026-06-04T01:45:51Z). The user directed: a release-vocab gap, plan-in-advance, binding to organized dev-items-done + changelog. The user said NOTHING about milestone/roadmap.
- **`e.g.` relation-name alternatives**: legitimate illustration of a directed-but-undecided relation for an open gap — NOT a correction target (open-gap sketch under filing authority).
- **`+ optionally a milestone/roadmap instantiation`**: LLM-augmentation-with-no-basis. No user mention, no cited source. `filing-provenance` (binding): "A qualifier that narrows what the user said (a mode, an opt-in, a flag, a tier, a deferral) is never derivable — it is a cited user decision or absent." An "optionally X" adding unrequested optional scope is precisely this class.
- **Standing**: n/a — this is unsupported augmentation, not a directed-but-unbuilt branch.
- **Verdict**: proposed_resolution partly LLM-augmentation-with-no-basis. **CORRECTED** — stripped only the "+ optionally a milestone/roadmap instantiation" clause; left the user-directed release-vocab + relation-binding (with illustrative names) + changelog-linkage + dual-surface intact.
  - **Before**: "…a relation binding closed dev-items to a release (e.g. release_contains_item / task_shipped_in_release / gap_closed_in_release) + optionally a milestone/roadmap instantiation; the release item carries or references the changelog lines…"
  - **After**: "…a relation binding closed dev-items to a release (e.g. release_contains_item / task_shipped_in_release / gap_closed_in_release); the release item carries or references the changelog lines…"

---

## FGAP-067 — config-registry 3-way merge (registry analog of FGAP-046)

- **Flagged category**: likely the illustrative "(e.g. a relation_type display_name/category, an invariant severity, a lens body)" list, or modal phrasing in description. No genuine fork in proposed_resolution.
- **Filing session**: created 2026-06-08T00:00:00Z (round/backfilled timestamp). Status identified, P3. No cited DEC; cites FGAP-046 + FGAP-060/TASK-038 as basis.
- **Cited precedent FGAP-046 (CLOSED/shipped)**: closed_by VER-023/TASK-037 — FEAT-006 hybrid: "refuse T1 -> base-stamp T2 -> 3-way merge T3 -> resolver T4: pi-context update merges a locally-edited schema with the catalog preserving non-conflicting edits, and routes conflicts to an interactive pi-bound mergetool or a conflict report." The deterministic 3-way merge is shipped reality.
- **Key finding**: FGAP-046 originally carried a real fork ("Two candidate routes"), but resolved to the deterministic 3-way merge (which shipped). FGAP-067 states ONLY that winning route (base=as-installed / ours=substrate / theirs=catalog, + per-entry base-stamping) — no residual fork, correctly derived from the shipped pattern.
- **pi-mono-is-exemplar**: consistent (declarative reconciliation, locally-editable entries preserved). Not decisive.
- **Standing**: gap open/unbuilt but uncontradicted; derives from a shipped sibling pattern.
- **Verdict**: DERIVABLE-from-supporting-source (shipped FGAP-046). No unsupported hedge. **No correction.**

---

## FGAP-086 — AJV validator cache keyed by unversioned $id (stale-compile risk)

- **Flagged category**: fork/deferral — "Key the compile cache by content (the schema's content hash or $id+version) or compile uncached when a body is supplied explicitly — determined by the investigating/implementing pass."
- **Filing**: created 2026-06-10T22:20:41Z. Status identified, P3. No cited DEC. Origin: "Surfaced by the TASK-051 adversarial probe; pre-existing." A probe-surfaced technical gap, not user-worded.
- **Nature of the fork**: three legitimate technical cache-keying approaches (content-hash / $id+version / uncached-when-body-supplied), with the choice EXPLICITLY deferred: "determined by the investigating/implementing pass." Verification criterion is concrete (one process, two same-$id bodies, body-correct verdicts each).
- **Assessment**: this is the honest open-fork pattern (cf. FGAP-093/DEC-0024) — the item does not fabricate a decision; it names candidate mechanisms and honestly hands the choice to the closing task. Not LLM invention of a fake choice.
- **Standing (step 8)**: the fork is underdetermined BY the item's own design (explicit deferral to implementer); the gap is P3, unbuilt, uncontradicted by shipped code. Genuinely open until its closing task.
- **Verdict**: genuinely-open-and-undetermined (deferred by design). **No correction.**

---

## FGAP-087 — non-array block content takes no-items resync path unvalidated

- **Flagged category**: deferral — "To be determined by the investigation (Experience-Gap Handling)…"
- **Filing**: created 2026-06-11T12:10:45Z. Status identified, P3. No cited DEC.
- **Nature**: description explicitly self-labels "Uninvestigated — root cause confirmation, the class across the resync/validate surface, and prior-art are for the investigating agent." proposed_resolution honestly states TBD pending the Experience-Gap Handling investigation.
- **Assessment**: this is exactly the correct filing discipline for a freshly-surfaced, uninvestigated experience gap under the binding Experience-Gap Handling convention (root cause + class + repro are the investigating agent's deliverable, not fabricated at filing). The deferral is convention-mandated, not an LLM hedge dodging a decision it should have made.
- **Standing**: genuinely open; unbuilt, uncontradicted.
- **Verdict**: genuinely-open-and-undetermined (convention-mandated deferral to investigation). **No correction.**

---

## FGAP-089 — enforcement hooks scope on op-shape, never target substrate

- **Flagged category**: fork/deferral — "Determined by the implementing pass (Experience-Gap Handling): scope the hooks to the active substrate — parse --cwd… ; or a coarser approximation (guard only when --cwd is absent or names a .context* dir)."
- **Filing**: created 2026-06-13T05:14:18Z. Status identified, P3. Grounding cited: analysis/2026-06-13-install-surface-and-guard-scope-gaps.md.
- **Corroboration**: CLAUDE.md itself references this as "FGAP-089, unsolved" — a known, real, open gap.
- **Nature of the fork**: primary approach (parse --cwd, resolve .pi-context.json contextDir, guard active-substrate-only) vs a coarser approximation (guard only when --cwd absent or names .context*), explicitly deferred to the implementing pass per Experience-Gap Handling; the not-installed block-substrate-cli-bypass.sh spec is named as the available resource-scoped pattern.
- **Assessment**: cited-investigation-grounded, candidate approaches named, choice honestly deferred to the closing pass per binding convention. Legitimate open fork, not LLM invention.
- **Standing**: open, unbuilt, uncontradicted, and explicitly acknowledged unsolved in CLAUDE.md — standing directed intent to solve.
- **Verdict**: genuinely-open-and-undetermined (cited-grounded, convention-deferred). **No correction.**

---

## FGAP-098 — issues are not a gap-sibling first-class open-work kind

- **Flagged category**: scoping determinations reading as hedges — "the reverse … analogs are NOT required … an acceptable divergence"; "acceptable kind-specific differences and are NOT force-symmetrized."
- **Filing**: created 2026-06-19. Status identified, P2. Grounding cited: analysis/2026-06-19-gaps-issues-sibling-parity-shape.md.
- **User direction (quoted verbatim in the item)**: "we need gaps and issues to be sibling class items throughout the substrate. a task can and must be able to focus as they can with gaps on issues." — a directed requirement, not LLM-composed.
- **Nature of the flagged phrases**: these are the investigation's required-vs-acceptable-divergence findings ("Per the investigation, group the required set…"), i.e. deliberate scope boundaries (what parity is NOT required because gaps are the escalation sink by design), not unresolved forks. The proposed_resolution is a single concrete set (a)-(e), no "either/or" on the actual build.
- **pi-mono-is-exemplar**: consistent (catalog back-port leg keeps population declarative). Not decisive.
- **Standing**: open, unbuilt, uncontradicted; derives from user-verbatim requirement + cited investigation.
- **Verdict**: user-DIRECTED + DERIVABLE-from-cited-investigation. The "NOT required / acceptable divergence" phrases are grounded scope determinations, not augmentation. **No correction.**

---

## FGAP-103 — no deliberate-suspension status; paused arc unrepresentable

- **Flagged category**: fork/deferral — "Per-kind extent (phase only vs the class set — …) is a user scope determination at task time, … not decided here."
- **Filing**: created 2026-07-02. Status identified, P1. Grounding cited: analysis/2026-07-02-paused-arc-status-vocabulary-gap.md; triggering instance PHASE-PORT-OPS paused by the user 2026-07-02.
- **Nature**: the CORE fix is decided and concrete (add `paused` to phase status enum, dual-surface per FGAP-102, version 2.0.1->2.1.0, no deriver change — paused already buckets to blocked). Only the EXTENT (phase-only vs all 13 status-bearing kinds) is left open, and explicitly labeled "a user scope determination at task time … not decided here," surfaced via the findings-document class table.
- **Assessment**: this is correct discipline — a genuine scope/value judgment (how far to extend the change) is surfaced for the user, NOT laundered as derived (cf. feedback: never launder genuine scope judgments as derived; never fabricate the decision). Not a hedge to strip.
- **Standing**: core fix is directed by the 2026-07-02 paused PHASE-PORT-OPS need; extent is a genuine open user scope call, filed 9 days ago, P1, unbuilt.
- **Verdict**: user-DIRECTED (core) + genuinely-open scope call properly surfaced (extent). **No correction.**

---

## FGAP-106 — partial config migration chain bricks ceremony; recovery undocumented

- **Flagged category**: modal/deferral — "so the fix may fold into that work"; proposed_resolution "Requires determination: … a remediation hint … and/or documenting the recovery; interacts with TASK-071 … and FGAP-105."
- **Filing**: created 2026-07-02. Status identified, P2. Origin: adversarial-probe reproduction (TASK-070 verification round). Concrete repro documented in evidence.
- **Nature**: honest open gap — states "Requires determination," names candidate remediations (error-message hint and/or docs), and flags dependency on FGAP-105's write-time convergence (which would shrink the pocket) and TASK-071's recover path. Not a decided design being hedged; an unbuilt P2 with genuinely-open remediation shape.
- **Assessment**: probe-surfaced technical gap, honestly deferred with named interactions — the legitimate open-fork pattern. The "may fold into" is an honest dependency acknowledgment, not augmentation.
- **Standing**: open, unbuilt, uncontradicted; deferral is by design pending FGAP-105 interaction.
- **Verdict**: genuinely-open-and-undetermined (probe-surfaced, honest deferral). **No correction.**

---

## FGAP-109 — no build-time gate for a narrowing catalog block-schema diff

- **Flagged category**: fork/deferral — "Requires determination: extend TASK-072's gate to walk all catalog block schemas … or file a sibling gate. Positioned with MILE-003's convergence work."
- **Filing**: created 2026-07-02. Status identified, P2. Origin: "Surfaced as a coverage hole by the critical-focus outline derivation (dimension B)."
- **Nature**: the DEFECT is concrete and grounded (config.schema.json is gated by TASK-072/FGAP-097; the 18 catalog block schemas have no build-time additive gate — apply-time detection only). Only the IMPLEMENTATION SHAPE (extend TASK-072's gate vs a sibling gate) is open, honestly labeled "Requires determination" and positioned under MILE-003.
- **Assessment**: honest deferral of an implementation-shape choice on a real, derivation-surfaced coverage hole; both routes are legitimate. Not LLM invention.
- **Standing**: open, unbuilt, uncontradicted; positioned with MILE-003 convergence work.
- **Verdict**: genuinely-open-and-undetermined (honest implementation-shape deferral). **No correction.**

---

## FGAP-110 — raw-reader bypass class beyond config unverified

- **Flagged category**: deferral — "Requires determination after enumeration: grep-enumerate … verdict each … and file or close the class on the evidence. Positioned with MILE-003."
- **Filing**: created 2026-07-02. Status identified, P2. Origin: critical-focus outline derivation (dimension C).
- **Nature**: an investigation-first gap by construction — the item's whole point is that the block-data raw-reader class is UNVERIFIED and the resolution is to enumerate then file-or-close on evidence. "file or close the class on the evidence" is not a fork; it is the honest statement that the outcome is evidence-dependent (Experience-Gap Handling + gap-explore-surfaces-class).
- **Assessment**: correct discipline for an unverified coverage hole; not LLM invention of a fake choice.
- **Standing**: open, unbuilt; deferral is the point (enumeration is the missing precondition).
- **Verdict**: genuinely-open-and-undetermined (investigation-first, convention-correct). **No correction.**

---

## FGAP-111 — review-enforced conventions have no structural forcing function as a class

- **Flagged category**: deferral — "Requires determination: per-convention triage of which are structurally enforceable … vs genuinely review-only … Positioned with MILE-007."
- **Filing**: created 2026-07-02. Status identified, P3. Origin: critical-focus outline derivation (dimension E).
- **Nature**: the "structurally enforceable vs genuinely review-only" split is the triage WORK the gap exists to do, not a decision being dodged — honest "Requires determination" for a class-level coverage hole. Impact claim ("deviations this project has repeatedly experienced") is grounded in observed reality (the audit's own premise).
- **Assessment**: honest open triage gap; not LLM invention.
- **Standing**: open, unbuilt; deferral is the triage scope, positioned under MILE-007.
- **Verdict**: genuinely-open-and-undetermined (honest triage deferral). **No correction.**

---

## FGAP-117 — read surface has no field projection

- **Flagged category**: likely "primary … secondary" op groupings reading as optionality, or modal phrasing. No genuine fork.
- **Filing**: created 2026-07-05. Status identified, P2. Grounding: analysis/2026-07-05-currency-foreclosure-shape.md + analysis/2026-07-06-block-query-projection-gap.md, with reproduced over-cap envelopes quoted in the item.
- **Nature**: proposed_resolution is a SINGLE concrete design — a shared projectFields primitive beside pageArray in read-element.ts, projecting item bodies before structureForRead, surfaced as an optional `fields: string[]` (→ --fields) on the item-returning query ops; id always retained; omitted fields = whole-item (additive, backward-compatible). The "primary (filter-block-items/read-block-page/lens-view) / secondary (join-blocks/resolve-items-by-id)" split is build/scope ordering, not an undecided fork. Parameter-shape precedents cited from actual code (resolve-items-by-id ids array, join-blocks where* trio).
- **Assessment**: heavily grounded in cited investigations with reproduced evidence; single decided design. No unsupported hedge.
- **Standing**: open, unbuilt, uncontradicted.
- **Verdict**: DERIVABLE-from-cited-investigations (single concrete design). **No correction.**

---

## FGAP-119 — message-less assert under tsx spins node:assert forever

- **Flagged category**: deferral — "Determination at task time whether a biome/lint rule can enforce leg 1 structurally."
- **Filing**: created 2026-07-06. Status identified, P2. Grounding: analysis/2026-07-05-converge-hook-hang-rootcause.md (V8-inspector stack, twin-file timing, --test-timeout measurement).
- **Nature**: the class fix is DECIDED and concrete (two legs: messaged-assert sweep across ~958 occurrences; CI wall-clock SIGKILL wrapper). Mitigation (--test-timeout=120000) already shipped and cited. Only ONE sub-detail — whether a biome/lint rule can structurally enforce leg 1 — is honestly deferred to task time.
- **Assessment**: heavily root-cause-grounded; the single deferral is an implementation sub-detail, not a fabricated fork. Not augmentation.
- **Standing**: open, unbuilt (residual class beyond the shipped mitigation); uncontradicted.
- **Verdict**: DERIVABLE-from-root-cause-investigation (core) + honest sub-detail deferral (lint enforceability). **No correction.**

---

## FGAP-122 — derivation is foreign-blind (cross-substrate endpoints silently dropped/mis-resolved)

- **Flagged category**: fork — "The foreign-resolution SEMANTICS — live cross-substrate status read vs derive-as-blocked-until-resolved vs flagged-exclusion — is a genuine design choice … and lands as a DECISION first."
- **Filing**: created 2026-07-06. Status identified, P1. Grounding: analysis/2026-07-06-foreign-status-derivation-blindness.md (mechanism trace + two-substrate empirical reproduction with pasted outputs). Addressed by FEAT-012; relates FGAP-061/FGAP-002.
- **Nature**: the CORE fix is directed/derivable and concrete (route every edge-consuming join through registry-aware resolveRef/resolveEndpointLoc; eliminate silent dropping; split dangling-vs-foreign; kill refname-collision aliasing; implement spec §J3 compare-if-readable/warn-if-unreadable). Only the foreign-resolution SEMANTICS is a genuine three-way design choice with real freshness/cost/offline trade-offs, explicitly routed to "a DECISION first."
- **Assessment**: correct discipline — a genuine design/value choice is surfaced and routed to a decision, NOT laundered as derived and NOT fabricated (cf. feedback). The three branches are real engineering alternatives, not LLM padding.
- **Standing**: P1, open, addressed by FEAT-012; the semantics decision is genuinely open and undetermined.
- **Verdict**: DERIVABLE (core, from cited empirical investigation) + genuinely-open design decision properly surfaced (semantics). **No correction.**

---

## FGAP-125 — work-order schema v1 contract vs demo-subset engine  (re-audit of a partially-fixed item)

- **Brief's special instruction**: determine whether the currently-flagged hedge is NEW vs residual of the already-fixed fork.
- **Filing**: created 2026-07-07. Status identified, P1. content_parent chain shows a prior edit (the earlier partial audit). Grounding: analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md + enacted DEC-0022.
- **Cited source DEC-0022 (ENACTED)**: its context names the ORIGINAL three-way fork verbatim — "(a) dispatch target agents as pi subprocesses; (b) grow executeAgent a bound tool-execution loop; (c) re-scope work-orders to output-only agents" — and DECIDES option (a). Consequence (verbatim): "The scope clamp leg of FGAP-125 is satisfied via the --tools allowlist; the remaining FGAP-125 legs (context_blocks injection, output_contract validation) must cross the process boundary under this shape."
- **Finding**: FGAP-125's current proposed_resolution states ONLY the single decided path (inject context_blocks + validate output_contract across the process boundary, under FEAT-014 per enacted DEC-0022) — the fork arm was already corrected earlier this session; no live fork remains. The residual scanner match is syntactic: the factual status narrative ("two are now honored (fixed) … two remain unconsumed") and "Class: schema-contract ahead of engine (sibling … documents its deferral)" — descriptions of settled state, not an unsupported live fork.
- **Standing**: P1, open; two legs directed under enacted DEC-0022 + FEAT-014; genuine standing intent, no fork.
- **Verdict**: residual syntactic match of an already-resolved fork; current text is DERIVABLE-from-enacted-DEC-0022, single-path. **No correction** (nothing new to fix).

---

## FGAP-131 — pi-workflows docs advertise ~30 filters; registry defines 10

- **Flagged category**: likely modal ("cannot drift") or "latent because" phrasing. No genuine fork.
- **Filing**: created 2026-07-08. Status identified, P2. Grounding: analysis/2026-07-08-pi-workflows-filter-and-spec-validation-eval.md (registered-vs-advertised diff, phantom-name derivation, runtime-throw proof).
- **Nature**: proposed_resolution is a SINGLE concrete fix — derive the documented list from filterNames() (single source of truth), add the 4 omitted registered names, remove the 20 phantom names. No "or", no deferral, no undecided branch.
- **pi-mono-is-exemplar**: consistent (generated-from-registry SoT, not hand-authored — mirrors the declarative/named-constant principles). Reinforces, not decisive.
- **Standing**: open, unbuilt, uncontradicted.
- **Verdict**: DERIVABLE-from-cited-investigation (single concrete resolution). **No correction.**

---

## FGAP-132 — 8 of 15 bundled pi-workflows specs invalid; no propagation path from evolving targets

- **Flagged category**: enumerated "or" in the resolution ("inputSchema-required keys, template variable references, or block: targets diverge") reading as a fork. No genuine decision fork.
- **Filing**: created 2026-07-08. Status identified, P2. Grounding: analysis/2026-07-08-pi-workflows-filter-and-spec-validation-eval.md (per-spec status table 8 invalid/7 warnings, three class characterizations).
- **Nature**: proposed_resolution is a SINGLE concrete plan — establish a lockstep drift check (fails when a bundled spec's required keys / template refs / block: targets diverge from current agent specs / schemas / catalog) + reconcile the 8 invalid specs to current contracts. The "or" enumerates the drift conditions one check must catch, not alternative resolutions. Related to FGAP-065 as the pi-context-side sibling of the same family.
- **Standing**: open, unbuilt, uncontradicted.
- **Verdict**: DERIVABLE-from-cited-investigation (single concrete resolution; the "or" is a condition enumeration). **No correction.**

---

## FGAP-134 — operator renders report actionable states without naming the resolving op

- **Flagged category**: "(or render helper)" parenthetical reading as a fork. No substantive decision fork.
- **Filing**: created 2026-07-09T02:48:57Z. Status identified, P2. Grounding: analysis/2026-07-09-operator-surface-remedy-guidance-class.md; governed by the actionable-state-renders-name-remedy convention (both filed in the same recent arc per git log).
- **Nature**: single concrete resolution — a shared state->op remedy map consumed by every actionable-state render, with per-state remedies concretely named (both-diverged/catalog-ahead -> /context update; missing-installed -> /context install; no-baseline -> baseline op), renderCheckStatus first, then the other bare-state renders onto the same contract. "(or render helper)" is a map-vs-helper framing of ONE concept (shared remedy contract), not alternative resolutions.
- **Standing**: open, unbuilt, uncontradicted; governed by a named convention, owned by MILE-008.
- **Verdict**: DERIVABLE-from-cited-investigation + convention-governed (single concrete resolution). **No correction.**

---

## Shard summary

20 items audited. 1 correction (FGAP-011 — stripped an unsupported "+ optionally a milestone/roadmap instantiation" optional-scope qualifier). 19 left untouched: 6 grounded in enacted decisions or shipped/closed sibling patterns (FGAP-002, FGAP-005, FGAP-067, FGAP-117, FGAP-125, FGAP-131), 4 grounded in cited investigations with single concrete resolutions (FGAP-098, FGAP-119, FGAP-132, FGAP-134), and 8 genuinely-open forks/deferrals correctly surfaced or convention-deferred (FGAP-086, FGAP-087, FGAP-089, FGAP-103, FGAP-106, FGAP-109, FGAP-110, FGAP-111, FGAP-122 — the last two categories overlap; FGAP-103 and FGAP-122 pair a directed core with a properly-surfaced genuine design/scope decision). No self-audit; every verdict rests on read source material (enacted DECs, cited analysis MDs, current code references, user-message archaeology for FGAP-002/011).
