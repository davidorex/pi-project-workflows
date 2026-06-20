# pi-context arc — history archaeology (work-trajectory truth)

Date: 2026-06-20
Method: `claude-history` (session FTS + SQL + git-log) cross-validated against the live `.context` substrate via the `pi-context` CLI (whole-node reads) and `git`. Active substrate confirmed `.context` (`.pi-context.json` `contextDir`). Every load-bearing claim below carries BOTH a history/git citation AND a substrate/git state read. Where only one side exists, it is marked "no corroborating evidence."

Note on session attribution: nearly all recent pi-context work runs inside one long-lived session **`8490e49a`** (2026-05-31 → 2026-06-20). Timestamps disambiguate the arcs within it. Unrelated same-ID reuse in older substrate namespaces (sessions `b62c055d`, `a70928f1`, `702e0298`) is excluded.

---

## 1. Arc trajectory (recent pi-context work)

| Arc | When (sessions / commits) | Filed state | Truth |
|---|---|---|---|
| **Milestone block** (FGAP-037/039/041) | 2026-06-16 ~06:39→23:15Z, session `8490e49a`; commits `0b37659` (file FGAP-037, 06-06) → `038c2dc`/`f38c06f`/`d161e52` (06-16) → `96d37ee` (direction fix) → merge `18cca3d` + closure `e324d2a` (06-17) | FGAP-037/039/041 **closed**; VER-052 **passed** | Machinery shipped + merged. **Data never materialized** (§2). Inert. |
| **TASK-020** config-driven state-derivation + reorder | 2026-06-17 00:06Z onward (session `8490e49a`); commit `99f45de` (rewire currentState, 06-17); earlier bricking incident 06-18 | **completed** | Landed; but the iterate produced the **live-substrate brick** incident (§4 A1) — a 1.8.0 config-schema bump with no load-time migration (exit-5 on every config op until git-restored). Genuinely complete after remediation. |
| **TASK-069** promote-cli operator binary | 2026-06-19 (file `6431309`) → 2026-06-20 (`fd518d6` complete); ~30 commits, **5 iterate cycles** | **completed**, issue-004 **resolved** | Genuinely done + verified on the real global (VER-055, `409a71d`). The single highest-friction arc in the record (§4 A3–A7). |
| **TASK-068** issues-as-gap-sibling | 2026-06-19; file `b247e83`, merge `3f6a9a7`, live-config apply `c18d4ff` | **in-progress** | Vocabulary landed (relation_types `task_addresses_issue` + `issue_relates_to_issue` present in live config, verified). Status honestly still in-progress — criterion-8 cross-substrate demo + probe not yet closed. Reverse-discrepancy: real work done, status not over-claimed. |

Supporting reads:
- relation_types live config (CLI `read-config --registry relation_types`): `decision_addresses_issue, gap_relates_to_issue, feature_resolves_issue, task_addresses_issue, issue_relates_to_issue` — TASK-068 vocabulary present.
- issue-004 (CLI `read-block-item --block issues --id issue-004`): `status: resolved`, `resolved_by: TASK-069 … final fix 409a71d; verified VER-055 against the real global /opt/homebrew`.

---

## 2. Milestone-activation history (the focus) — why milestones are inert

**Verdict (one line): the milestone *machinery* shipped and verified on throwaway /tmp fixtures, the gaps were closed as "block built," and the named data/activation follow-up was displaced by a substrate switch and the TASK-020 arc and never returned to — a pivot that dropped a named step, not a deliberate "defer the data" decision and not abandonment-on-purpose.**

### Substrate/git state (the inertness, proven)
- Live `.context` directory listing: `phase.json` (18 bytes — empty `{"phases":[]}`, mtime **Jun 14**, untouched by the milestone arc), **no `milestone.json` at all**.
- CLI `read-block --block phase` → `total: 0` (zero phases filed).
- CLI `read-block --block milestone` → `Block file not found: …/.context/milestone.json` (the block file was never created in live `.context`).
- Catalog starter `packages/pi-context/samples/blocks/milestone.json` @ `18cca3d` → `{ "milestones": [] }` (3-line empty stub).
- **No MILE- item exists in any live substrate.** No phase is positioned in any milestone (no `phase_positioned_in_milestone` edge possible — zero phases).

### The false-pass in the closure record (a filed-vs-truth defect)
VER-052 (CLI read) criterion: *"FGAP-037 … fresh install materializes `.context/milestone.json`; currentState derives `milestones[].status`."* The live active `.context` was **never** install-materialized for the milestone block — `milestone.json` is absent there. The verification was satisfied entirely by **/tmp throwaway fixtures** (MILE-001 + two phases), per the arc's runtime demos (history below). VER-052's own evidence string concedes this: *"Real validated-write demo (block-api appendRelationByRef via tsx … a phase_positioned_in_milestone edge …)"* — synthetic edges, not a live filing. The closure was honest about the *mechanism* but the "fresh install materializes `.context/milestone.json`" claim was never exercised against the active substrate, and the live substrate carries no milestone file.

### Conversational record (session `8490e49a`, milestone-mining agent, all verbatim)
- **2026-06-16T06:39:54Z (user):** "what is our draft spec, if any, for a milestones block" — arc opens as a question about the **block-kind spec**, not data.
- **2026-06-16T11:16:36Z (asst):** "There are two drafts, both unbuilt … `reached` is derived — true when the milestone's placed phases are done." — lean derived-status block.
- **2026-06-16T11:43:30Z (user):** "the agent's task is: what are the requisite steps in total for the filed gap for a new milestone block, and how exactly is it to interrelate with all other elements of .context blocks" — **scope is the block + its relations**, framed around schema/edge interrelation; no data population.
- **2026-06-16T13:43–13:44Z (asst):** "Demo part 1 — milestone with two placed phases … `MILE-001` derived `status: planned` … Both phases → `completed` → … `status: reached`." — runtime demo on **/tmp fixtures**.
- **2026-06-16T23:04:06Z (asst):** "The milestone block arc is complete … Merged (`18cca3d`) + closed (`e324d2a`): VER-052 …" — machinery merged, gaps closed, no MILE- item filed.
- **2026-06-16T23:15:19Z (user):** **"next we have to plan out making milestones part of the canonical sample."** — the activation/data follow-up, stated as the next step.
- **2026-06-17T00:06:25Z (user):** "i switched us back to context-jit-spec-v2. what are our options now for next steps, ordered by 'doing x unlocks y'" — **substrate switch + pivot**; the canonical-sample plan is never picked up. Session then runs entirely into TASK-020.
- After 2026-06-16T23:15 a 200-result milestone search yields one later hit (a code comment during TASK-020). No conversational hits for "make milestones active / populate milestone / file a milestone", nor for "no phases / empty phase".

### What activating milestones was meant to involve (per the record)
1. File a `MILE-NNN` item (`name`, optional `release`; `status` **derived** `planned|reached`, never authored) — 2026-06-16T11:16:36Z.
2. Position phases into it via the `phase_positioned_in_milestone` edge written through the validated path in **`parent=phase / child=milestone`** orientation (the only direction the validator accepts; VER-052) — `reached` derives when every placed parent-phase is `completed`.
3. Attach stories via `story_includes_item` (`story_contains_task` retired) — 2026-06-16T23:04:06Z.
4. Optionally use `release` to roll gaps/issues/tasks/phases into a release — 2026-06-16T11:23:22Z.
5. **The named-but-unexecuted step:** add milestones to the canonical samples catalog ("part of the canonical sample") — 2026-06-16T23:15:19Z. The catalog ships only an empty `{ "milestones": [] }` stub; no sample MILE- item.

**No evidence found** for: any explicit "build machinery, defer the data" decision; any discussion of why `phase.json` was left empty; any return to milestone activation after 2026-06-16T23:15.

---

## 3. Filed-vs-truth discrepancies

| # | Item (filed state) | History/git truth | Class |
|---|---|---|---|
| D1 | **VER-052** asserts "fresh install materializes `.context/milestone.json`; currentState derives `milestones[].status`" (criterion **passed**) | Live `.context` has **no `milestone.json`**; verification ran on /tmp fixtures only; `currentState.milestones[]` is empty for lack of data. The machinery works; the *substrate-materialization* claim was never exercised against the active substrate. | Verification claims more (live materialization) than was run (fixture demo). |
| D2 | **FGAP-037/039/041 closed** "milestone block kind shipped … fresh install materializes" | True at the *machinery* level (block kind, schema, relation, deriver, invariant all in live config + merged `18cca3d`). But "milestones cannot be represented in the substrate" — the gap's stated impact — is only half-resolved: representable, but **zero are represented**; no MILE- item, no positioned phase. The gap closed on capability, not on the modeled state it was meant to enable. | Gap closed on machinery; the modeled-state intent left unrealized (inert). |
| D3 | **TASK-068 in-progress** | Vocabulary genuinely landed in live config (relation_types verified) + merged `3f6a9a7`/`c18d4ff`. Status correctly NOT claimed complete — criterion-8 cross-substrate demo + probe outstanding. | Reverse: real work done, status honestly conservative (no over-claim). |
| D4 | TASK-020 **completed** | Complete, but the path to completion **bricked the live substrate** (1.8.0 config-schema bump, no load-time migration, exit-5 until git-restored — session `8490e49a` 2026-06-19T03:29Z compaction record). Remediation done; the brick spawned **FGAP-095/096** (filed `bfe22f7`/`70ec91b`, 2026-06-18). | Completion accurate; the incident on the way is captured in sibling gaps, not in TASK-020. |

**Real work done but not (yet) filed-as-closed:** TASK-068 (D3) — landed code, in-progress status. No instance found of work done with NO substrate record.

---

## 4. Operational pain (using the tooling)

Ranked recurring classes (operational-pain mining agent, all verbatim, session `8490e49a` unless noted), each cross-checked to a filed id where one exists.

| Rank | Class | Recurrence | Filed? |
|---|---|---|---|
| 1 | **Direct-drive / glue guard (`block-pi-context-glue.sh`) self-blocks the agent** (A8/A10) | Highest — dozens of `exit=2` blocks across 06-06…06-19; the agent tallied "115 hook self-blocks on pi-context glue" (2026-06-14T04:45Z); a standing hook caveat is baked into nearly every probe brief | The **discipline** is filed (CLAUDE.md rule); the **agent-friction cost itself is not separately filed**. (I hit this class myself this session — `--arrayKey`/echo-narration blocks before I conformed.) |
| 2 | **promote-cli safety defects** (A3–A7) | 5 iterate cycles in one day; one root + four sub-defects + one over-correction (the iterate-2 refuse-on-inherited guard broke the legitimate `npm run` path; proven-broken code sat at HEAD until re-run) | **Fully filed + closed:** issue-004 (parent) + issue-006/007/008/009; VER-053/054/055; TASK-069 criterion corrections. |
| 3 | **Hooks fire on non-active / throwaway `--cwd` substrates** (A9) | Recurs every /tmp probe; blocked the TASK-033 runtime-demo seed | **Filed: FGAP-089** (`status: identified`, P3, unsolved — confirmed via CLI read). TASK-060 against it was cancelled with no live replacement task. |
| 4 | **Schema/config evolution bricks live substrate; no migration on load or read** (A1/A2) | 2 instances (config-side actually bricked live; block-side sibling: `schema_version` always absent so read-time AJV + version-mismatch migration never fire) | **Filed: FGAP-095 + FGAP-096** (config-side, `bfe22f7`/`70ec91b`); block-side sibling filed. |
| 5 | **Validation-noise friction in normal write flow** | Low — `context-validate-relations` reports `invalid` on pre-existing `edge_parent_not_in_bins` warnings during unrelated writes (2026-06-19T14:17Z) | Tolerated as baseline noise; not separately filed. |

**USER-voiced operational pain (verbatim):**
- A2 (block `schema_version` absent → inert safety): "this is the gap to file: with schema_version always absent from block data, two safety mechanisms are inert for all blocks …" (2026-06-19T00:40Z).
- A4 (poisonable prefix, destructive op before guard): "The script … runs npm rm -g before the guard … A real safety defect." (2026-06-19T14:00Z).
- A9 (hooks over-fire): "FGAP-089 — this project's Claude Code PreToolUse hooks over-fire on throwaway --cwd substrates; not a pi-context behavior." (2026-06-19T00:23Z).
- A3 (operator binary coupling): issue-004 brief, 2026-06-19T02:08Z.

**Process/trust pain the user voiced** (operational backdrop, distinct from tooling defects): repeated zero-trust statements (2026-06-19T04:06Z "100% zero trust"; 2026-06-09T11:34Z tying distrust directly to the agent bypassing the direct-drive discipline with ancillary calls; recurring signal-vs-noise complaints 06-13/06-14/06-16).

**Method caveat:** the claude-history FTS5 index rejects multi-token `OR` queries containing hyphenated/`:`-bearing terms (`"Blocked:"`, `issue-006 OR issue-007`) — those were recovered via single quoted-phrase searches + direct SQL, so the "no evidence" items are confirmed by positive-query exhaustion, not failed compound queries.

---

## Citations index
- Sessions: `8490e49a` (controlling), `b62c055d`/`a70928f1`/`702e0298` (excluded same-ID reuse).
- Commits: `0b37659`, `038c2dc`, `f38c06f`, `d161e52`, `96d37ee`, `18cca3d`, `e324d2a`, `99f45de` (milestone/TASK-020); `6431309`→`fd518d6`, `409a71d` (TASK-069); `b247e83`, `3f6a9a7`, `c18d4ff` (TASK-068); `bfe22f7`, `70ec91b` (FGAP-095/096).
- Substrate reads (CLI): TASK-068/069/020, FGAP-037/039/041/089, VER-052, issue-004, `read-block milestone|phase`, `read-config relation_types|block_kinds`.
