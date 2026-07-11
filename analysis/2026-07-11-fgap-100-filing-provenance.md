# FGAP-100 `proposed_resolution` filing-provenance audit

Date: 2026-07-11. Auditor: fresh-context forensic provenance agent (read-only).
Subject: the clause `"Resolution not yet determined; to be filed as a separate decision."` in FGAP-100's `proposed_resolution` (block `framework-gaps`, active substrate `.context`).

## Verdict

**user-DIRECTED.** The clause's semantic content (resolution deliberately left open) was ordered by the user in a verbatim message; the exact sentence wording was LLM-rendered, surfaced verbatim to the user in a pre-filing provenance-stop, and explicitly granted before filing. No correction is recommended.

**Standing call: no retraction found — standing, undeclined.** No user message since filing retracts, deprioritizes, or declines a resolution direction for this gap (source: claude-history full-text search over all user messages after 2026-06-19T16:00Z for `FGAP-100` / `sub-element` — the only hits are agent-brief texts and this audit's own dispatch). No decision item has yet been filed (`pi-context find-references --id FGAP-100` returns exactly 3 edges, all `gap_relates_to_gap` → FGAP-035/036/038; no DEC-, no TASK-, no VER-).

---

## 1. The filing event (independent of FGAP-043's)

FGAP-100 as it exists today was filed **2026-06-19**, session `8490e49a-7509-477f-9cb5-92f16552090a`:

- `15:47:48.812Z` — Write of the payload `/tmp/fgap-subelement-identity.json` containing, verbatim: `"proposed_resolution": "Resolution not yet determined; to be filed as a separate decision."`
- `15:47:56.185Z` — `pi-context append-block-item --block framework-gaps --arrayKey gaps --autoId true --item @/tmp/fgap-subelement-identity.json --writer '{"kind":"human","user":"davidryan@gmail.com"}' --yes --json # provenance-reviewed`
- `15:49:02.651Z` — commit: `substrate(.context): file FGAP-100 — sub-element of a substrate item has no identity (general gap, resolution TBD)`, staging `.context/framework-gaps.json`, `.context/relations.json`, the object file, and `analysis/2026-06-19-sub-element-identity-gap.md`.

This is a **genuinely separate filing event** from FGAP-043's (2026-06-06): different session, different date, different subject. Caveat found during the trace: the id `FGAP-100` was used ONCE BEFORE, in the retired `.project` substrate era — session `b62c055d-3d2e-45fd-ab2b-3829067b41bd`, 2026-05-24T22:41:38Z filed a `.project` FGAP-100 titled "Canonical credentialed verification protocol is stale post-FGAP-074". That is a different item in a different (now-inactive) substrate; it shares nothing with the current `.context` FGAP-100 but the id number. All findings below concern the 2026-06-19 `.context` item only.

## 2. Verbatim user messages leading to the filing (session `8490e49a`, 2026-06-19, UTC)

The gap emerged from a live modeling discussion about TASK-069's criteria churn:

- `15:17:01.883Z` — "what is the shape of what we are facing: in iterate to zero certain conditions change and thus the success criteria of a task change?"
- `15:18:20.986Z` — "should we have mechanism criteria at all? isn't that the point of criteria in a task?"
- `15:21:14.476Z` — "that's not clearly modeled yet. task = things to do. success criteria = what must be observably provably true binary yes no. verification is a separate thing. no?"
- `15:23:01.997Z` — "why would you even consider an ephemeral option."
- `15:25:53.806Z` — "i'm not convinced of your decision framing. you're bifurcating success criteria into 2: success criteria and verification criteria. verification is the method of establishing success criteria yes/no, no?"
- `15:26:56.585Z` — "why do you keep bringing in decision"
- `15:28:08.112Z` — "where do we hold verifications per success criteria of a task"
- `15:29:44.028Z` — "ergo what must change"
- `15:32:25.803Z` — "gap means something we cannot do but need to be able to do. in that framing, without specifying resolution, what is the gap."
- `15:32:55.989Z` — "is that the general gap or is that too specific?"
- `15:33:55.956Z` — **"file the general gap with resolution tbd"** ← the directive
- `15:47:19.352Z` — **"yes"** ← the filing grant, given AFTER the exact field text was surfaced (see §3)

The user directive at 15:32:25 ("without specifying resolution, what is the gap") and 15:33:55 ("file the general gap with resolution tbd") directly proposes the clause's substance: the gap is filed WITHOUT a resolution. This is not merely "unrelated to its wording" — it IS the instruction the clause implements.

## 3. The exact wording was shown to the user before the grant

At `15:41:24.607Z` the orchestrator presented the final audited FGAP fields "for the provenance-stop", including verbatim:

> **proposed_resolution** — Resolution not yet determined; to be filed as a separate decision.

and a per-element provenance table containing the row:

> | proposed_resolution = TBD | user-DIRECTED | "with resolution tbd" |

closing with: "On your grant I file the FGAP via the CLI, add the three edges, commit it with the analysis md, and context-validate." The user's next message (`15:47:19.352Z`) was "yes". The clause text filed is byte-identical to the text granted.

The subagent brief dispatched at `15:35:15Z` ("Prior-art + de-ephemeralize the sub-element identity gap") likewise instructed: "do NOT propose or assume a resolution (the resolution is explicitly TBD per the user)" — consistent contemporaneous treatment of the TBD as a user directive, not an LLM hedge.

Wording note: the sentence is byte-identical to FGAP-043's `proposed_resolution`, which the user personally typed on 2026-06-06 (established by the prior FGAP-043 audit this stretch). On 2026-06-19 the LLM rendered "resolution tbd" as that same sentence — i.e., the rendering reuses the user's OWN prior verbatim phrasing — and the user then approved it verbatim. The "to be filed as a separate decision" half is therefore not an unauthorized augmentation: it entered the substrate's vocabulary from the user's keyboard (FGAP-043) and was re-approved here on sight. (The user's 15:26:56 "why do you keep bringing in decision" was pushback on the LLM's criteria-model *decision-framing* during discussion, not on the eventual resolution being filed as a decision item — and it predates the user's approval of this exact sentence by ~20 minutes.)

## 4. FGAP-100's own fields (fresh read, 2026-07-11, via `pi-context read-block-item`)

- `proposed_resolution` (current, unchanged since filing): `"Resolution not yet determined; to be filed as a separate decision."`
- `description` (current): "Items carry ids; the parts inside an item — entries in a nested array — do not. Nothing can point at one such part, bind to it, or recognize it as the same part after its content changes; its only handle is array position (moves on insert/delete/reorder) or prose (changes on rewording). Acute instance: a task's acceptance_criteria is a plain string array (no per-criterion id), and verification.criteria_results[] keys each result on the criterion's text ({criterion:string,status,evidence?}), so the sole criterion-to-result join is exact prose match. Class: any meaningful nested-array part lacking identity (evidence entries, options_considered, consequences, criteria_results), not the criteria instance alone."

**The description genuinely leaves the resolution open.** Unlike FGAP-043 (whose description embedded "must be embedded per-block..." — a resolution direction sitting in the body), FGAP-100's description states the missing capability and its class only; no candidate mechanism (per-criterion ids, sub-element promotion, content-addressing, etc.) appears anywhere in the item. The TBD is real, not a hedge concealing an already-stated direction.

**No prior-item citations (step-4 check): still true.** Neither `description`, `evidence`, `impact`, nor `proposed_resolution` cites any FGAP-/DEC-/TASK- id. Evidence entries cite files only. Relations carry the item links (3 × `gap_relates_to_gap`).

Post-filing field delta observed (out of audit scope, noted for completeness): the item now carries `priority: "P3"`, which was NOT in the 15:47:48Z filing payload — added by some later write. The audited clause itself is byte-unchanged since filing.

## 5. `pi-mono-is-exemplar` check (fresh read, verbatim)

> "pi-mono (/Users/david/Projects/pi-mono, this project's own upstream platform) is the gold-standard exemplar for how this monorepo designs, installs, and populates anything and everything. Binding on every design decision:
> 1. Population is declarative, not imperative -- resources install from a checked-in manifest reconciled at install/startup time, never a one-shot imperative script.
> 2. Installed/materialized resources are ordinary, locally editable files once installed -- never a read-only pointer to a shared/bundled location as the only option.
> 3. Configuration is two-tier, project-overrides-global, deep-merged.
> 4. Defaults are never hardcoded inline -- always a named, exported constant."
> (enforcement: review, severity: error)

**Silent on this gap.** All four rules govern install/population/config design; none speaks to intra-item identity modeling. The convention neither favors a resolution direction for stable sub-element identity nor would be contradicted by any obvious candidate (per-criterion ids in schemas, sub-element promotion to entities, etc.). It does not convert the TBD into a derivable answer.

## 6. Code currency (fresh reads, 2026-07-11)

The defect the gap describes is **still current**:

- `packages/pi-context/samples/schemas/tasks.schema.json` — `acceptance_criteria.items` = `{type: "string", x-prompt-budget: {...}}`. Plain strings, no per-criterion id.
- `packages/pi-context/samples/schemas/verification.schema.json` — `criteria_results.items.properties` = `[criterion, status, evidence]`, `required: [criterion, status]`. Keyed on criterion text; no id.
- `findNestedIdBearingArrays` — still flags ONLY nested arrays whose `items` declare an `id` (`declaresId`: `properties.id` present, `required` includes `"id"`, or any composition branch does — `packages/pi-context/src/schema-write.ts:75` onward, `itemsDeclareId`/`declaresId` helpers). String-item and id-less-object-item arrays remain uncovered, exactly as the gap states.

Evidence-citation staleness (minor, not the audited clause): FGAP-100's first evidence entry cites `packages/pi-context/src/context-sdk.ts` lines `2390-2428` for `findNestedIdBearingArrays`. The function now lives in `packages/pi-context/src/schema-write.ts` (exported at line 75); `context-sdk.ts` imports it at line 44 and uses it at line 2861. The mechanism claim ("flags only nested arrays whose items already carry an id") remains true verbatim; the file/line anchor has drifted since filing. This is a candidate for a routine evidence-anchor refresh, unrelated to the provenance verdict.

## 7. Verdict detail

| Element | Provenance | Source |
|---|---|---|
| Filing the gap at all | user-DIRECTED (verbatim directive) | "file the general gap with resolution tbd" — 2026-06-19T15:33:55.956Z |
| Resolution-left-open substance | user-DIRECTED (verbatim) | same message + "without specifying resolution, what is the gap" — 15:32:25.803Z |
| Exact sentence wording | LLM-rendered, reusing the user's own FGAP-043-verbatim sentence; surfaced verbatim at the provenance-stop (15:41:24.607Z) and granted ("yes", 15:47:19.352Z) |
| "to be filed as a separate decision" half | carried in the granted verbatim text; originated from the user's keyboard in FGAP-043 (2026-06-06) |

**Not** LLM-augmentation-with-no-basis. The clause is the faithful implementation of a verbatim user directive, approved on sight before filing.

## RECOMMENDATION

**No correction to `proposed_resolution` is recommended.** The clause is user-DIRECTED, byte-stable since filing, still accurate (the resolution genuinely remains unfiled — no DEC- addresses FGAP-100), and standing-undeclined (no retraction found in claude-history since 2026-06-19).

Two out-of-scope observations for the orchestrator, explicitly NOT corrections to the audited clause:
1. Evidence anchor drift: evidence[0]'s `context-sdk.ts:2390-2428` cite should eventually point at `schema-write.ts` (`findNestedIdBearingArrays`, line 75) — mechanism claim unaffected.
2. `priority: "P3"` appears on the item but was absent from the filing payload; its own provenance was not audited here.
