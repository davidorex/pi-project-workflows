# FGAP-127 proposed_resolution fork — filing provenance audit (v2)

Date: 2026-07-11. Investigating agent: fresh-context executing agent (claude-history + pi-context CLI reads + code reads). Scope: provenance of the exact clause in FGAP-127's `proposed_resolution`:

> seed the agents tier in the install ceremony (an installed_agents[] manifest beside schemas/blocks) and/or wire a bundled builtinDir into the dispatch loaders

Correction outcome: **no correction made** — the verdict is DERIVABLE for both branches (see step 6); the "only if LLM-augmentation-with-no-basis" edit condition is not met. FGAP-127's `proposed_resolution` is byte-identical before and after this audit.

## Step 0 — fresh read

`pi-context read-block-item --block framework-gaps --id FGAP-127 --json` (2026-07-11): the clause is present verbatim inside the full field:

> "Under FEAT-014, per the dispatch-architecture decision: seed the agents tier in the install ceremony (an installed_agents[] manifest beside schemas/blocks) and/or wire a bundled builtinDir into the dispatch loaders; align the loader docblock's stale tier wording."

Item is `status: closed`, `closed_at: 2026-07-08`, `content_parent` present (one lineage step — the 02:47Z evidence re-pin, see step 1).

## Step 1 — filing session and write

- **Session**: `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e` (this project). Confirmed directly, not assumed from a sibling gap: the payload heredoc `cat > /tmp/fgap-agents-tier.json <<'EOF' … EOF` followed by `pi-context append-block-item --block framework-gaps … --item @/tmp/fgap-agents-tier.json --relations '[{"relation_type":"gap_addressed_by_feature","direction":"as_parent","other":"FEAT-014"}]' …` executed at **2026-07-07T00:29:05.575Z** (tool_executions, message uuid via `input_json LIKE '%seed the agents tier%'`).
- The clause, including the `Under FEAT-014, per the dispatch-architecture decision:` prefix and the `installed_agents[]` parenthetical, is **byte-identical in the original filed payload** — it was not introduced by a later edit. (Note: at filing time "the dispatch-architecture decision" was a forward reference — DEC-0022 was filed retroactively at 2026-07-07T10:59Z in session `53383be9`.)
- Commit: `git add .context && git commit … "substrate(.context): work-order dogfood findings filed — FEAT-014 + FGAP-124..128 + issue-012 + R-0029 (granted)"` at 00:31:03Z, same session.
- Later same-session mutations: priority→P1 (00:35:53Z, user-directed, see step 2) and an evidence-array re-pin (`update-block-item … --updates @/tmp/fgap127-repin.json`, 02:47:37Z) — neither touched `proposed_resolution` (the current field text equals the 00:29 payload text).
- A 2026-05-28 `append-block-item` hit for "FGAP-127" (session `b62c055d`) is a **different, ID-colliding item in an earlier substrate** ("work-orders block kind under-surfaced…") — excluded.

## Step 2 — every user message, investigation-dispatch → filing (session ac1621b3, verbatim)

- 2026-07-06T23:54:38Z — "how in pi-context are work-units created and what can they be used for"
- 2026-07-06T23:57:50Z — "because we have 2 operational contexts -- claude code v. within pi - the harness for claude code is warranted. try to use the work-order functionality and let's see where it breaks, if it breaks." **(the investigation dispatch)**
- 2026-07-07T00:22:54Z — "merge this branch to main. then delete the branch and push main."
- 2026-07-07T00:25:42Z — "i want all findings from 2026-07-07-work-order-dispatch-dogfood-breaks.md. validly and canonically filed" **(the filing directive)**
- 2026-07-07T00:32:28Z — "you don't set priority."
- 2026-07-07T00:34:56Z — "all are priority 1"

**No user message proposes, discusses, or approves the specific clause or either of its branches.** The user's instruction was to file the analysis MD's findings "validly and canonically"; the clause's wording is LLM-composed under that filing directive, with the MD as its source.

## Step 3 — what the analysis MD recommends for this defect

`analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md` read in full; the defect is **Break 4** ("the agents tier didn't exist (target_agent unresolvable on the live substrate)") — confirmed by content: it is the section anchoring `agent-spec.ts:219-243`, `createAgentLoader({ cwd })` at `work-order-loop.ts:116` / `call-agent-tool.ts:73`, and the install-ceremony survey.

**Recommendation count: none.** The report's own scope line: "No fixes applied; no substrate items filed." Break 4 contains no recommendation sentence. What it states instead is a two-locus root cause, verbatim:

> "**Root cause is consumer wiring + install ceremony, not the loader.** The work-order loop and call-agent both construct the loader as `createAgentLoader({ cwd })` (work-order-loop.ts:116, call-agent-tool.ts:73) — no `builtinDir` — so tier 3 is skipped entirely."

> "`context-init` / `accept-all` / `install` materialize the substrate dir, config, schemas, and starter blocks only (`packages/pi-context/src/context.ts:976, 1062`; install copies `installed_schemas[]`/`installed_blocks[]`). No `agents/` concept exists in the install ceremony or the samples catalog."

> "**Deliberate vs gap.** The three-tier design (D7) with consumer-supplied builtinDir is deliberate. The gap is the composition: a work-order engine whose target agents can only live in a tier that no ceremony seeds and whose sanctioned author is unreachable non-interactively."

> "**Class.** Instance of 'install ceremony seeds a subset of the surfaces the runtime resolves from' — schemas and blocks are seeded, agents are not…"

The clause's two branches map 1:1 onto the report's two named causal loci: "wire a bundled builtinDir into the dispatch loaders" ← the consumer-wiring locus (and the report also notes pi-workflows' own loader defaults `builtinDir ?? bundledDir("agents")`, agent-spec.ts:137 — the exact mechanism the fix later used); "seed the agents tier in the install ceremony" ← the ceremony locus and the class statement. The specific instrument name `installed_agents[]` appears **nowhere** in the report or in any user message — it is an LLM-composed analogy anchored to the report's quoted fact that install copies `installed_schemas[]`/`installed_blocks[]`.

## Step 4 — precedent citations, fresh read

Confirmed: neither `proposed_resolution` nor `description` cites another gap/decision **by ID as precedent for this clause**. The field cites FEAT-014 (the umbrella feature, filed in the same 00:25–00:31 batch under the same directive — not independent provenance) and "the dispatch-architecture decision" (then-unfiled; now **DEC-0022**, read fresh). DEC-0022's decision text picks pi-subprocess dispatch and does not decide between this clause's branches; its consequence states only:

> "FGAP-127 (agents-tier seeding) and FGAP-126 (non-interactive gating) proceed against subprocess dispatch."

So DEC-0022 neither supports a two-option fork nor points one direction on it — it constrains the context (subprocess dispatch) and is neutral on seeding-vs-bundled. `description` cites FGAP-126, but as the compounding gated-author-tool fact, not as precedent for the fork. No missed precedent citation found.

## Step 5 — code currency per branch

**Bundled-builtinDir branch — SHIPPED; the branch IS current verified state.** `packages/pi-agent-dispatch/src/dispatch-loader.ts:31-33`:

```ts
export function dispatchLoadContext(cwd: string): LoadContext {
	return { cwd, builtinDir: bundledDir("agents") };
}
```

with `import { bundledDir } from "@davidorex/pi-workflows/bundled-dirs";` (line 29). Both call sites consume it: `work-order-loop.ts:175` `createAgentLoader(dispatchLoadContext(cwd))` and `call-agent-tool.ts:81` `createAgentLoader(dispatchLoadContext(ctx.cwd))`. No contradiction — matches FGAP-127's `closed_by` (TASK-103/VER-081) and TASK-103 (status `completed`, read fresh).

**Ceremony-seeding branch — NOT BUILT, not contradicted.** `grep -rn "installed_agents" packages/` → zero hits. `packages/pi-context/src/context.ts` `findUnmaterializedAssets` (:698-706) filters only `config.installed_schemas ?? []` and `config.installed_blocks ?? []`; the `ConfigBlock` type (:82-83) and registry kinds (:1180-1181) declare only those two `installed_*` arrays. An additive `installed_agents[]` would not contradict any shipped behavior, closed gap, met criterion, or passing test — it is deferred, not rejected. FGAP-127's `closed_by`, read fresh, already records exactly this split: the bundled-builtinDir disjunct shipped (TASK-103/VER-081, runtime-demonstrated) and "the OTHER disjunct — seeding the agents tier in the install ceremony (an installed_agents[] manifest) — was NOT built and remains an open FEAT-014 design option."

## Step 6 — verdict per branch

- **"wire a bundled builtinDir into the dispatch loaders"**: **DERIVABLE-from-a-source-that-supports-it** — Break 4's consumer-wiring root cause (no `builtinDir` at :116/:73; pi-workflows' `bundledDir("agents")` default as in-repo precedent), filed under the user's verbatim directive to file the MD's findings. Subsequently implemented and verified; code confirms.
- **"seed the agents tier in the install ceremony (an installed_agents[] manifest beside schemas/blocks)"**: **DERIVABLE-from-a-source-that-supports-it** — Break 4's ceremony locus ("install copies `installed_schemas[]`/`installed_blocks[]` … No `agents/` concept exists in the install ceremony") and its class statement ("install ceremony seeds a subset of the surfaces the runtime resolves from"). The `installed_agents[]` name itself is composed, but as a parenthetical illustration anchored to the report's quoted mechanism, not a free-floating invention.
- **The "and/or" fork itself**: supported — unlike FGAP-126's corrected resolution (whose forks had no source), this fork mirrors the report's own two-locus root-cause statement, which names both loci without deciding between them, and FEAT-014's criterion #4 (below) carries the same disjunction. Neither branch is user-VERBATIM or user-DIRECTED in wording; neither is LLM-augmentation-with-no-basis.

**Consequence: no edit.** FGAP-127's `proposed_resolution` stands. Its closure record is internally coherent (closed_by documents which disjunct shipped and which remains open); rewriting the field would orphan closed_by's quoted references to both disjuncts.

## Step 7 — standing vs retracted: the ceremony-seeding branch

Searches run: FTS `"installed_agents"` (all hits are this audit's own lineage, the v1 audit, the original filings, and an unrelated Feb/Mar project); FTS phrase sweeps for "seed the agents" / "agents tier" / "ceremony-seed"; SQL sweep of all user messages in this project since 2026-07-07 matching `agents tier` / `installed_agents` / `seed` / `ceremony`; FEAT-014 edit archaeology (the only `update-block-item` against FEAT-014 in this project is the 2026-07-07T11:00:12Z `{"status":"in-progress"}` flip, session 53383be9 — acceptance criterion #4's text was never narrowed and never had the ceremony-seeding option dropped; `.context/features.json` has no Write/Edit-tool operations in the window, consistent with CLI-only writes).

The 2026-07-08 user messages containing "ceremony" ("granted. and this is too much ceremony. do it."; "i want the provenance attesting hooks etc. and from claude code removed. they've become ceremony playacting token consuming distractions…", session 22cd8f53) concern the Claude Code provenance-attestation hook apparatus, not the pi-context install ceremony or the agents tier — not a retraction of this branch.

**No retraction found — this remains standing, undeclined, directed intent.** Its exact source is FEAT-014 acceptance criterion #4, verbatim:

> "A fresh substrate can produce a resolvable target_agent from the loop's operating context: the agents tier is seeded by ceremony or a bundled tier is wired, and agent authoring has a sanctioned non-interactive path or a filed caller-as-reconciler policy (FGAP-068 shape)."

Two qualifications for the orchestrator, stated as observations distinct from the FGAP-127 correction question (out of this audit's mandate to act on):

1. Criterion #4 is itself disjunctive ("seeded by ceremony **or** a bundled tier is wired") — the shipped bundled tier satisfies the criterion's letter, so FEAT-014's acceptance does not *require* the ceremony-seeding branch; it remains an undeclined design option, exactly as FGAP-127's closed_by records.
2. **FEAT-014 decomposition gap observation**: FEAT-014 is `in-progress`, and no task anywhere covers the ceremony-seeding branch — a fresh `filter-block-items` sweep of the tasks block for seed/agents-tier/installed_agents finds only TASK-103 (the bundled disjunct, completed; its criterion #6 itself directed that the ceremony-seeding disjunct be "explicitly recorded as an open FEAT-014 design option") and TASK-096 (unrelated phase-state seeding). If the option is ever to be exercised or explicitly declined, nothing in the substrate currently carries it as work. Surfaced only; no filing made per mandate.

Not part of the verdict: the 00:29:05Z filing command carried a `# provenance-reviewed` sentinel with no intervening user grant message between the 00:25:42Z directive and the write (the user queried this on 2026-07-10: "why was the old grant ceremony sentinel present on the filing command") — a write-time attestation-mechanism matter with zero bearing on content validity.
