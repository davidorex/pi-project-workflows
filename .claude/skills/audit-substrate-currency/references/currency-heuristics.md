# Currency-audit judgment heuristics

Worked rules from the executed 2026-07-05 audit. Load when classifying findings (SKILL.md steps 2–6).

<truth_classes>
Four classes with different ceilings — classify every finding into one:

1. **Mechanically derivable stored state** (milestone status; any `state_derivation.rollups` kind). The derived value is the truth; the stored field is at best a cache. NEVER author it (milestone schema: "authored status is rejected by canon"). A divergence is reported as a finding against the class gap (FGAP-116) — the correction is the phase/member statuses feeding the rollup, or nothing.
2. **Authored lifecycle state** (feature/gap/issue/task statuses, priorities). The engine detects lag; whether the bucket is truly wrong is judgment against acceptance criteria / filed legs. Corrections are sanctioned `update-block-item` writes under grant.
3. **Declared-baseline currency** (research `stale_conditions`, `grounding`, citations). A condition is FIRED only when its subject verifiably shipped/changed — read the cited item or code in this run; a fired condition means `status: stale` (the correction), never deletion of the item.
4. **Free prose** (titles, descriptions, evidence anchors). Only flag text that a shipped change made false; the correction rewrites to current truth preserving every load-bearing fact, criterion, id, file:line reference, and the block's terse register.
</truth_classes>

<honest_partial_vs_stale>
A completed task addressing a non-closed gap / non-complete feature is **honest-partial — not a finding** — when the task's own filed text declares the split. Verified instances: TASK-064 ("Partial addressing of FGAP-091 … the forcing-function invariant is FGAP-091's separate residual"), TASK-065 ("NOW slice of FGAP-061"), TASK-075 ("the NOW leg only; the forward forcing-function remains open"). The signal is IN the filed text — read it; do not infer from statuses alone.

It IS a finding when the addressed item's own criteria/legs shipped without the bucket moving. Verified instances: FEAT-010 at `proposed` with 4/6 criteria shipped → `in-progress`; FEAT-004 at `proposed` with its two shipped tasks → `in-progress`; FGAP-102 at P0 after its acute leg completed → P1 (priority is judgment — flag it as such in the provenance table).
</honest_partial_vs_stale>

<known_baseline>
The healthy steady state of this substrate's `context-validate` is `warnings` consisting of: the `decision-shows-derivation` advisory backlog for pre-invariant decisions (DEC-0001..DEC-0017), the honest-partial `task-completed-*` trio (TASK-064/065/075) plus feature-lag entries until their features complete, the two `layer-plans` `nested_id_bearing_array` structural warnings (issue-002), and — since the `derived-status` invariant class landed (TASK-085) — `milestone-status-converges` warnings for any milestone whose stored status lags its derivation, EXPECTED until the reconcile op (TASK-086) and converge-on-write (TASK-087) ship the repair path (the warning is the detector working, not a defect; never author the stored milestone status to silence it). Anything OUTSIDE this set — any ERROR, any new code, any new item id — is a finding. Update this baseline paragraph when granted corrections change it.
</known_baseline>

<known_frictions>
- **FGAP-117**: no field projection on read ops — bulk enumeration of one field across a populated block exceeds the 50KB cap. Page small (`--limit 4`) and do targeted `read-block-item` reads; do not pipe or post-process `pi-context` output (the direct-drive hook blocks it).
- **Shell hook rejects `|` inside `--value`** — write regex payloads to a file and pass `--value @/tmp/pattern.json`.
- **FGAP-116** (open): gate satisfaction reads STORED milestone status, so `blocked[].blockedBy` can contradict `milestones[]` in the same payload until the in-engine fix lands. Report instances against FGAP-116; do not refile the class.
- **FGAP-103 / issue-010** (open): the stale `focus` from the paused WASC arc is tracked; report recurrence against them.
</known_frictions>

<prior_art_discipline>
Every candidate NEW filing requires a substrate prior-art search first (title/description regex via `filter-block-items`), reported as id + status + coverage. If tracked: relate/inform the existing item, never refile. New-filing payloads carry full evidence (file:line anchors from THIS run's reads) and a `proposed_resolution`; provenance-gated — the user grants before any write.
</prior_art_discipline>
