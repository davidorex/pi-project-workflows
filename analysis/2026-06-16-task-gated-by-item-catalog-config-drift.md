# `task_gated_by_item` — catalog↔config relation_type drift (experience-gap investigation)

Date: 2026-06-16
Investigator: explore/analysis subagent (read-only; no substrate filings, no fixes)
Trigger: dogfooding — a fresh `/tmp` accept-all substrate lacked `task_gated_by_item`; had to `amend-config` it in by hand.
Active substrate at investigation time: `.context` (the live PM substrate).

## Verdict (one line)

`task_gated_by_item` was hand-added to the LIVE `.context/config.json` on 2026-06-07 (commit `669890c`, the FGAP-060/TASK-033 stretch) and **never back-ported to the packaged catalog** `packages/pi-context/samples/conception.json`. It is one of **six** relation_types present in the live config but absent from the catalog — a recurring catalog⊉live-config drift CLASS with no forcing-function, not an atomic one-relation omission. The substrate does NOT yet track this class directly (closest items address adjacent surfaces; see prior-art table).

---

## 1. ROOT CAUSE (git evidence)

### The catalog never had it
- `packages/pi-context/samples/conception.json` `relation_types[]` ships **34** entries. The three sibling gating relations `feature_gated_by_item` (line 198), `story_gated_by_item` (line 226), `decision_gated_by_item` (line 359) are present; `task_gated_by_item` is **absent** (confirmed: zero matches in the file).
- The catalog file was authored once at commit `b8a9d7e` ("feat(pi-context/samples): B0 — author samples/conception.json (DEC-0037 packaged-conception manifest)"). `feature_gated_by_item` has been in the catalog since that authoring commit.
- `git log -S '"task_gated_by_item"' -- packages/pi-context/samples/conception.json` → **no commits**. The string has never existed in the catalog.

### The live config got it by hand-amend, never back-ported
- `git log -S '"task_gated_by_item"' -- .context/config.json` → single commit **`669890c`** (2026-06-07, "substrate(.context): establish TASK-033 gated on FEAT-006 (catalog release needs the propagating update)").
- The commit body states verbatim: *"Registered relation_type task_gated_by_item (ordering; tasks -> *) completing the gated_by pattern (alongside feature_gated_by_item / story_gated_by_item)."* The diff adds the entry to `.context/config.json` `relation_types[]` only.
- It was added to author the edge `TASK-033 -[task_gated_by_item]-> FEAT-006`. It was an amend-config to the LIVE substrate; the same change was never made to the catalog source file.

### Why the later catalog back-port missed it
- The three FGAP-090 siblings (`decision_raises_gap`, `decision_gated_by_item`, `gap_relates_to_gap`) WERE back-ported to the catalog, at commit **`a582939`** ("TASK-061: ship the three FGAP-090 relation_types in the packaged catalog"). That back-port was scoped explicitly to FGAP-090's three new relations.
- `task_gated_by_item` predated FGAP-090 (added 2026-06-07; FGAP-090 was filed/closed 2026-06-14) and was not part of that batch. It fell between the cracks: added to live config for an edge, never independently back-ported, and not in scope of the one back-port batch that did touch the catalog's gating relations.

**Evidence shows (not speculation):** hand-add to live config via amend-config (commit `669890c`), never back-ported to the catalog; the catalog's only gating-relation back-port (`a582939`) was scoped to the three FGAP-090 relations and did not include this pre-existing sibling.

---

## 2. SHAPE

### Affected vs not
- **NOT affected:** the live `.context` substrate — it has `task_gated_by_item` (hand-added). Any substrate that hand-amended it in.
- **Affected:** every substrate built from the catalog via the install ceremony (`context-init` → `context-accept-all` → `context-install`) after the catalog was authored. Reproduced below: a fresh `/tmp` accept-all+install substrate carries **34** relation_types with `task_gated_by_item` absent (and the three siblings present).

### What breaks for an affected substrate
1. **Gate-aware task readiness is inert AND the gate is unwritable.** FGAP-061's proposed_resolution for gate-aware `currentState` consumes `task_gated_by_item` (fold its parents into `depParentsOf`). On a fresh substrate the relation does not exist, so:
   - a `task_gated_by_item` edge cannot be present to be derived from (inert), AND
   - **it is rejected at write time** (unwritable). The write-time edge validator `validateEdgeAgainstRegistry` (context-sdk.ts:1487) looks the relation_type up by `canonical_id` (line 1496); on a miss it pushes `Edge relation_type '…' is not registered in config.relation_types` and **short-circuits** (lines 1497–1502, before any endpoint-kind check). `assertEdgeValidForWrite` (context-sdk.ts:1548) THROWS `Edge rejected at write time (invalid relation_type / endpoint kind): …` on a non-empty error list. `appendRelationByRef` (context-sdk.ts:1569, the path the `append-relation` CLI op uses) calls that gate. So a fresh-substrate user trying to express a task gate gets a hard write rejection.
2. **Asymmetric capability.** A fresh-substrate user CAN gate a feature/story/decision (`feature_/story_/decision_gated_by_item` all ship) but CANNOT gate a task — the single most common gating altitude. The gated_by pattern is incomplete exactly where day-to-day task ordering lives.

### Confirmation of the unwritable claim
The validator is registration-first: it returns the "not registered" error and short-circuits before resolving endpoints, and the write-time gate throws on any error. So the relation on a fresh substrate is **not merely inert to derivation — it is unwritable** via the canonical relation-append surface. (Source-confirmed at context-sdk.ts:1487–1555 + 1569–1581; the FGAP-060/TASK-062 write-time hoist is the mechanism.)

---

## 3. REPRODUCIBLE CONDITIONS

Minimal exact steps (run against a throwaway dir; real global `pi-context` CLI):

```
mkdir -p /tmp/tgbi && git -C /tmp/tgbi init -q
pi-context context-init       --cwd /tmp/tgbi --contextDir .ctx --yes --writer '{"kind":"human","user":"…"}' --json
pi-context context-accept-all --cwd /tmp/tgbi --yes --writer '…' --json
pi-context context-install    --cwd /tmp/tgbi --yes --writer '…' --json
pi-context read-config        --cwd /tmp/tgbi --registry relation_types --writer '…' --json
```

Observed (this investigation): the fresh config carries **34** relation_types; `feature_gated_by_item`, `story_gated_by_item`, `decision_gated_by_item` present; **`task_gated_by_item` absent**.

Write-rejection demonstration (the unwritable property): attempting `append-relation --relation_type task_gated_by_item` (parent a task, child any item) on that fresh substrate routes through `appendRelationByRef` → `assertEdgeValidForWrite` → `validateEdgeAgainstRegistry`, which returns `Edge relation_type 'task_gated_by_item' is not registered in config.relation_types`, and the gate throws `Edge rejected at write time`. (Source-traced; a live edge-write demo on the throwaway substrate was not completed because the planning-block provenance guard fires on the prerequisite item-append regardless of cwd — a separate guard-scoping issue in the FGAP-089 family, not routed around.)

---

## 4. PRIOR-ART SEARCH (precondition of any future filing)

Searched `framework-gaps` by title regex `catalog|parity|propagat|back-port|drift|conception` and read the specifically-named items. Coverage table:

| Item | Status | What it covers | Does it track THIS gap? |
|------|--------|----------------|--------------------------|
| **FGAP-090** | closed | relation_type registry coverage incompleteness (decision_raises_gap / decision_gated_by_item / gap_relates_to_gap) + write-time edge validator. Its closure added the 3 relations "to active config + the packaged catalog (TASK-061)". | **No.** Scoped to its three relations; does not address `task_gated_by_item`, nor catalog⊉config parity as a class. Its own evidence even references `task_gated_by_item` as an existing sibling — yet that sibling was not in the catalog. |
| **FGAP-061** | identified (OPEN) | gate-aware ready/blocked derivation; `currentState` ignores `*_gated_by_item`. Proposed resolution CONSUMES `task_gated_by_item`. | **No** (it is the consumer that the missing catalog relation would break on a fresh substrate; it does not track the catalog omission). NB: substrate shows `identified`, contradicting the CLAUDE.md tracker's "TASK-065 shipped gate-aware currentState" — FGAP-061 is not closed in `.context`. |
| **FGAP-060** | closed | install --update does not PROPAGATE catalog config-registry additions to an existing substrate (catalog→substrate delivery mechanism). | **No.** Opposite direction: it presumes the catalog HAS the entry and asks whether update delivers it. It does not catch the catalog MISSING an entry the live config has. |
| **FGAP-067** | identified (OPEN) | config-registry 3-way merge for a DIVERGENT-BODY entry of the same id (additive-merge limitation). | **No.** Body-reconciliation of present entries, not catalog-absence of an entry. |
| **FGAP-010** | closed | parity across library / op-registry / orchestrator-script surfaces (dual-surface principle), enforced by `scripts/parity-check.ts`. | **No** — but it is the closest STRUCTURAL precedent: a build-time parity forcing-function. It polices the code-surface trio, not catalog⊇config vocabulary. |
| **FGAP-071** | identified (OPEN) | gap-arc-binding invariant (governance: every gap feature-bound or standalone). | **No.** Unrelated direction. |
| **FGAP-092** | identified (OPEN) | update's transactional boundary between schema loop and registry propagation. | **No.** |

**Conclusion:** the substrate does NOT already track "the packaged catalog is missing relation_types the live config has / no forcing-function guarantees catalog ⊇ the vocabulary shipped derivations consume." FGAP-060 (propagation) and FGAP-010 (surface-parity forcing-function) are the nearest neighbors; a new filing should RELATE to both (and cite FGAP-090's incomplete back-port + FGAP-061 as the consumer that exposes the omission) rather than refile their content.

---

## 5. CLASS

This is **not atomic.** `task_gated_by_item` is the triggering INSTANCE of a class: **the packaged catalog has drifted from the live `.context` config's `relation_types` — the catalog is a strict subset, missing vocabulary that was hand-added to live config and never back-ported, and there is no forcing-function (build gate / parity check) ensuring catalog ⊇ the relation_types the shipped derivations consume.**

### Full live-config-minus-catalog relation_type diff (systematic)
Live `.context/config.json` ships **40** relation_types; the catalog ships **34**. The catalog set is a STRICT SUBSET of the live set (reverse check: every catalog relation_type is present in live — zero catalog-only entries). The **6** live-only relations, each a sibling instance of the same drift class, with the commit that added it to live config:

| relation_type | category | source→target | added to live config (commit) | provenance |
|---------------|----------|----------------|-------------------------------|------------|
| `task_gated_by_item` | ordering | tasks → * | `669890c` (2026-06-07) | the triggering instance |
| `session_touches_item` | membership | session-notes → * | `5cfae69` (DEC-0036 cutover, session-notes populated) | hand-amend |
| `task_advances_story` | data_flow | tasks → story | `f2b8f91` (story-advancers lens) | hand-amend |
| `feature_advances_story` | data_flow | features → story | `a7831ae` (story-advancers-features lens) | hand-amend |
| `decision_derived_from_item` | data_flow | decisions → * | `051575e` (decision-shows-derivation invariant) | hand-amend |
| `decision_escalates_underdetermined` | data_flow | decisions → framework-gaps | `051575e` (decision-shows-derivation invariant) | hand-amend |

All six share the same provenance shape: added to the LIVE config during substrate work (for an edge, a lens, or an invariant) and never back-ported to `samples/conception.json`. `task_gated_by_item` is the most consequential because a shipped (or about-to-ship) derivation, FGAP-061's gate-aware `currentState`, consumes it — the others are mostly substrate-organizational (lenses, session-notes, derivation-citation invariants) and so are latent rather than actively breaking, but they are the same drift.

### Characterization + filing altitude
- The narrow symptom: `task_gated_by_item` missing from the catalog.
- The class: **catalog⊉live-config relation_type drift with no forcing-function**, evidenced by 6 live-only relations. Filing only the symptom would leave the other 5 as latent debt and invite duplicate sibling filings as each surfaces.
- **Recommended altitude: a CLASS-level gap** — "the packaged catalog has silently drifted to a strict subset of the live config's relation_types vocabulary; there is no build-time parity check that the catalog ⊇ the vocabulary the shipped library/derivations consume" — with `task_gated_by_item` as the triggering instance (it is the one a shipped derivation consumes) and the other 5 enumerated as the same class. This mirrors FGAP-010's structural answer (a build-time parity forcing-function) but for the catalog↔config vocabulary surface rather than the code-surface trio. The 6-entry backfill (bring the catalog to parity with the live config's non-bespoke relations) is the symptom-level remediation that the class-level forcing-function would then keep closed.

Note on bespoke-vs-shippable: some live-only relations may be deliberately project-bespoke (e.g. lens-specific `*_advances_story`) rather than catalog-worthy. The class gap is the ABSENCE of any check distinguishing "intentionally substrate-local" from "should be in the catalog" — today the distinction is unrecorded and drift is silent either way. Deciding which of the 6 are catalog-worthy is itself part of the remediation, not a reason to treat the omission as atomic.
