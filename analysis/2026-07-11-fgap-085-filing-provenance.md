# FGAP-085 proposed_resolution — filing-provenance audit (2026-07-11)

Subject clause (FGAP-085, block `framework-gaps`, field `proposed_resolution`):

> To be determined by the investigation (Experience-Gap Handling): root cause in the update merge semantics, the class across the update/merge ops, and the canonical deletion affordance.

Fresh read 2026-07-11 (`pi-context read-block-item --block framework-gaps --id FGAP-085 --json`) confirms the clause is byte-identical to the audited quote. `created_at: 2026-06-10T11:13:56.098Z`, `created_by: human/davidryan@gmail.com`, `content_hash: 61f851ce…`.

## Verdict

**user-DIRECTED.** No correction made; no edit to any substrate item. The clause is the direct, honest execution of a verbatim user directive to file the gap raw and pre-investigation, and every enumerated element of the clause is derivable from the item's own description text plus the project's binding Experience-Gap Handling and `gap-explore-surfaces-class` conventions. It is a correctly-derivable placeholder for an intentionally-pre-investigation filing, not an invented fork or hedge masking a known answer.

## 1. Filing event

Disambiguation first: an earlier, unrelated FGAP-085 existed in the retired `.project` substrate (filed 2026-05-21, session `b62c055d-3d2e-45fd-ab2b-3829067b41bd`, "Audit all registered Pi tool description strings…"). The current `.context` FGAP-085 is a different item; the ID number was reused across substrates.

The current item's filing, session `8490e49a-7509-477f-9cb5-92f16552090a`:

- **2026-06-10T11:13:35.671Z** — Write tool creates `/tmp/g-nulldelete.json` containing the exact filed payload, including verbatim the audited proposed_resolution clause.
- **2026-06-10T11:13:54.023Z** — Bash: `pi-context append-block-item --block framework-gaps --arrayKey gaps --autoId true --item @/tmp/g-nulldelete.json --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json` (description: "File the field-deletion gap").
- Item `created_at` 2026-06-10T11:13:56.098Z matches.

## 2. User messages, dispatch-to-filing (session 8490e49a, 2026-06-10, all verbatim)

- 10:53:57 — "let's send 2 agents after those and produce reports that can be cited in the gaps to be filed. i'm currently partial to the general process of de-ephmeralization. capturing intel and context when it happens and not having it exist in an ephemeral purgatory state requiring then the main context agent to render agents' transient output to file - possible signal loss." (About FGAP-083/084 — not this gap.)
- 11:07:17 — "yes do file. and then let's persist that de-epheralize at the source in both claude.md and conventions. i'd like us to get to the point where an agent exploring a gap before filing writes the file and then writes a rhetorical-register-compliant research finding."
- 11:13:17 — **"file that as a gap but don't pre-agent investigate the gap. just the raw gap description that'll drive an investigation later"** — the immediate, direct filing directive for FGAP-085.

The referent of "that": during the 11:07-directed work, the assistant hit the defect live. Assistant at 11:10:12: "`--updates null` left the key rather than deleting it — replacing the whole item via upsert to drop it cleanly." Assistant at 11:12:13: "One friction from this pass, noted in the commit but not filed: `update-block-item` can't delete a key (`{\"status\":null}` set null instead of removing; resolved via upsert full-replace) — candidate for investigation on your word."

**Investigation dispatch: none.** The gap was filed directly from a live in-session experience (the filing agent itself hit the bug at 11:10 while removing a stray `status` field from the `de-ephemeralize-at-source` convention rule), with the investigation explicitly deferred BY THE USER. The user did not author the clause's wording, but the user's instruction determines its entire content: file raw now, description drives an investigation later. "To be determined by the investigation" is therefore honest — there genuinely was no investigation, by explicit user order — not evasive.

## 3. Description as source material

The description (fresh read) ends: "Uninvestigated — root cause, shape, class (is field-deletion missing across the whole update/merge surface?), and prior-art are for the investigating agent." This reads unambiguously as "root cause genuinely not yet determined, an uninvestigated raw filing" — not as a punt on a known answer. Each element of the clause maps to filed text or binding convention:

- "root cause in the update merge semantics" — the symptom is located in the merge-update surface by the description's own first sentence ("update-block-item --updates '{\"field\":null}' sets the field to null … no op surface deletes a field"); root-cause determination is assigned to the investigating agent by the description's closing sentence and by the Experience-Gap Handling convention.
- "the class across the update/merge ops" — verbatim restatement of the description's own parenthetical class question "(is field-deletion missing across the whole update/merge surface?)", and mandated by the `gap-explore-surfaces-class` convention (fresh read, conventions block): "the investigation MUST identify and surface whether the specific gap is an INSTANCE of a more general class."
- "the canonical deletion affordance" — derivable from "no op surface deletes a field from an item": any resolution must name the deletion affordance; which one is investigation output.

Governing convention: no `experience-gap-handling` item exists in the conventions block (`read-block-item` returns `data: null`; full `read-block --block conventions` scan confirms — 19 rules, none covering experience-gap filing). The convention the clause cites by name lives in project CLAUDE.md, "Experience-Gap Handling (mandatory)": "An experience gap … must be tasked to an agent to determine root cause and shape, provide intel, and establish reproducible conditions. The agent's root-cause + shape + reproducible conditions are the basis for filing the gap (FGAP)." That convention's default ordering is investigate-then-file; the user's 11:13:17 directive explicitly varied the ordering for this filing (file raw now, investigate later). The clause acknowledges the convention by name and defers exactly the convention's investigation deliverables (root cause / shape / class) to the later investigation — convention-consistent under a user-directed ordering variance.

## 4. Precedent IDs cited in FGAP-085

Fresh read confirms: no FGAP-/DEC-/TASK-/FEAT- ID is cited anywhere in FGAP-085's text. The description references the `de-ephemeralize-at-source` conventions rule (as the object being edited when the bug was hit) and "Experience-Gap Handling" (the CLAUDE.md convention, by name). Evidence cites `.context/conventions.json`. No precedent item this brief missed.

## 5. pi-mono-is-exemplar check

Fresh read (conventions block, id `pi-mono-is-exemplar`), verbatim:

> pi-mono (/Users/david/Projects/pi-mono, this project's own upstream platform) is the gold-standard exemplar for how this monorepo designs, installs, and populates anything and everything. Binding on every design decision:
> 1. Population is declarative, not imperative -- resources install from a checked-in manifest reconciled at install/startup time, never a one-shot imperative script.
> 2. Installed/materialized resources are ordinary, locally editable files once installed -- never a read-only pointer to a shared/bundled location as the only option.
> 3. Configuration is two-tier, project-overrides-global, deep-merged.
> 4. Defaults are never hardcoded inline -- always a named, exported constant.

**Silent on this question.** It governs population/install/config/defaults design; it neither names field-deletion semantics nor speaks to whether a freshly-filed gap may defer its resolution. Neither branch (placeholder vs. stated resolution) contradicts it. At most it will inform the eventual deletion-affordance design — which is exactly investigation-stage territory, consistent with the deferral.

## 6. Current code

`packages/pi-context/src/block-api.ts:1486` (in `updateItemInTypedFile`, the function `update-block-item` routes through; same pattern at :1770 for the nested variant):

```ts
const merged: Record<string, unknown> = { ...prior, ...updates };
```

Shallow spread: an `updates` value of `null` is spread onto the key, producing `"field": null` on the merged item; no code path removes a key. `ops-registry.ts` contains no field-deletion op (the only `delete` is a schema-migration TransformSpec operation, a different surface). **The described defect is current and unchanged since filing**; the gap and its "to be determined" resolution remain live and accurate.

## 7. Verdict (full statement)

**user-DIRECTED**, with every enumerated element additionally **DERIVABLE** from the item's own description and the cited conventions. The user's verbatim instruction — "file that as a gap but don't pre-agent investigate the gap. just the raw gap description that'll drive an investigation later" (2026-06-10T11:13:17) — is the direct authority for a resolution field that defers to a later investigation. The clause names the governing convention (Experience-Gap Handling), enumerates precisely the investigation deliverables that convention and `gap-explore-surfaces-class` require, and invents no qualifier, mode, or fork beyond them. This is the correctly-derivable placeholder for an intentionally-pre-investigation filing — categorically different from a resolution hedge that punts on an answer available at filing time. The description's "Uninvestigated —" framing, the absence of any investigation dispatch before filing, and the live-hit provenance at 11:10 all corroborate that no answer existed to punt on.

## 8. Correction

**None made, none warranted.** No substrate write performed; FGAP-085 is untouched. The proposed_resolution stands as filed.
