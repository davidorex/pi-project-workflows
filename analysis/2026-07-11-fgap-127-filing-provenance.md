# FGAP-127 proposed_resolution fork — filing provenance audit

Date: 2026-07-11. Investigating agent: fresh-context executing agent (claude-history + substrate CLI reads + code reads; no substrate writes made). Scope: provenance of the exact clause in FGAP-127's `proposed_resolution`:

> seed the agents tier in the install ceremony (an installed_agents[] manifest beside schemas/blocks) and/or wire a bundled builtinDir into the dispatch loaders

## 0. Current text (fresh read, 2026-07-11)

`pi-context read-block-item --block framework-gaps --id FGAP-127 --json` returns `proposed_resolution` byte-identical to the audited quote, wrapped as:

> "Under FEAT-014, per the dispatch-architecture decision: seed the agents tier in the install ceremony (an installed_agents[] manifest beside schemas/blocks) and/or wire a bundled builtinDir into the dispatch loaders; align the loader docblock's stale tier wording."

Status `closed`, `closed_at` 2026-07-08. The clause is unchanged since filing (§1 confirms the filed payload).

## 1. Filing event

- **Session**: `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e`. Filed 2026-07-07T00:29:05.575Z via a single Bash call: heredoc `cat > /tmp/fgap-agents-tier.json` followed by `pi-context append-block-item --block framework-gaps --arrayKey gaps --autoId true --item @/tmp/fgap-agents-tier.json --relations '[{"relation_type":"gap_addressed_by_feature","direction":"as_parent","other":"FEAT-014"}]' --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json # provenance-reviewed`. Result: `Appended item 'FGAP-127' to framework-gaps.gaps with 1 birth relation(s)`.
- The filed payload's `proposed_resolution` is byte-identical to the current field text (only `priority` changed post-filing: filed P3, corrected to P1 per user messages below).
- **Commit**: `1201881c` 2026-07-07 08:31:03 +0800 — "substrate(.context): work-order dogfood findings filed — FEAT-014 + FGAP-124..128 + issue-012 + R-0029 (granted)".
- Confirmed NOT shared with any earlier FGAP-127: a `Write` containing an id "FGAP-127" at 2026-05-28T11:32Z (session `b62c055d…`) is a different, `.project`-era item ("work-orders block kind under-surfaced…"), unrelated to this filing.

## 2. User messages, investigation-dispatch → filing (session ac1621b3, verbatim, complete)

1. 2026-07-06T23:57:50.995Z — "because we have 2 operational contexts -- claude code v. within pi - the harness for claude code is warranted. try to use the work-order functionality and let's see where it breaks, if it breaks." *(the investigation dispatch)*
2. 2026-07-07T00:20:29.894Z — `/model` local command (sets model; no content bearing on the clause).
3. 2026-07-07T00:22:54.577Z — "merge this branch to main. then delete the branch and push main."
4. 2026-07-07T00:25:42.364Z — "i want all findings from 2026-07-07-work-order-dispatch-dogfood-breaks.md. validly and canonically filed" *(the filing directive)*
5. *(filing at 00:29:05)*; post-filing corrections: 00:32:28.052Z — "you don't set priority." and 00:34:56.338Z — "all are priority 1" *(source of the P3→P1 change; unrelated to the clause)*.

**Finding**: no user message proposes, discusses, or approves the clause or either of its branches. The user's instructions were (a) run the dogfood probe, (b) file all findings from the resulting report. No user message exists between the filing directive (00:25:42) and the filing (00:29:05) — the `# provenance-reviewed` sentinel on the filing command was not preceded by a per-payload user grant for this item's text; the filing proceeded on the blanket directive (commit message says "(granted)").

## 3. What the cited investigation recommends (analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md, Break 4 — confirmed by content: "Break 4 — the agents tier didn't exist (target_agent unresolvable on the live substrate)", lines 79–92)

**Recommendation count for this defect: NONE.** Break 4 states root cause, deliberate-vs-gap, repro, and class; it recommends no fix. The report's only recommendation-shaped passage (§Cross-cutting, line 115, the (a)/(b)/(c) architectural fork) concerns Break 2 (tool execution), explicitly deferring: "That choice is the user's, not this report's."

What Break 4 does state (verbatim), from which each branch is derivable:

- Ceremony branch basis: "**Root cause is consumer wiring + install ceremony, not the loader.**" … "`context-init` / `accept-all` / `install` materialize the substrate dir, config, schemas, and starter blocks only (`packages/pi-context/src/context.ts:976, 1062`; install copies `installed_schemas[]`/`installed_blocks[]`). No `agents/` concept exists in the install ceremony or the samples catalog." Class: "install ceremony seeds a subset of the surfaces the runtime resolves from".
- builtinDir branch basis: "The work-order loop and call-agent both construct the loader as `createAgentLoader({ cwd })` (work-order-loop.ts:116, call-agent-tool.ts:73) — no `builtinDir` — so tier 3 is skipped entirely." … "pi-agent-dispatch ships no packaged agents and points at no bundle."
- Composition: "The gap is the composition: a work-order engine whose target agents can only live in a tier that no ceremony seeds and whose sanctioned author is unreachable non-interactively."

The string "installed_agents" appears nowhere in the report; the parenthetical "(an installed_agents[] manifest beside schemas/blocks)" is an LLM mechanism-extension by direct analogy with the report's cited fact "install copies `installed_schemas[]`/`installed_blocks[]`". The "and/or" fork appears nowhere in the report.

## 4. Precedent citations in the clause (fresh read)

`proposed_resolution` cites no gap/decision ID as precedent for the fork. It cites FEAT-014 (feature, birth edge) and "the dispatch-architecture decision" — which, at filing time, DID NOT EXIST: DEC-0022's own `context` states "Implementation shipped option (a) on main (merge 8e2e764e …) without this decision being filed — surfaced by the 2026-07-07 currency audit; filed retroactively under user grant." So at filing the phrase deferred to a future decision (FEAT-014's description names it as "First decomposition step"). DEC-0022, once filed, does not pick a Break-4 branch; its consequence only says "FGAP-127 (agents-tier seeding) and FGAP-126 (non-interactive gating) proceed against subprocess dispatch."

The same fork does appear in FEAT-014's acceptance criterion 4 (fresh read): "the agents tier is seeded by ceremony or a bundled tier is wired" — supporting a two-option fork. But FEAT-014 was filed in the same batch (same session, same blanket directive, commit 1201881c), so this is the same authorship event, not independent precedent. `description` cites FGAP-126 as a compounding gap, not as precedent for the clause.

## 5. Code currency per branch (fresh reads)

**Bundled-builtinDir branch — SHIPPED and verified.** `packages/pi-agent-dispatch/src/dispatch-loader.ts:31-33`:

```ts
export function dispatchLoadContext(cwd: string): LoadContext {
	return { cwd, builtinDir: bundledDir("agents") };
}
```

with `import { bundledDir } from "@davidorex/pi-workflows/bundled-dirs"` (line 29); consumed at `call-agent-tool.ts:81` (`createAgentLoader(dispatchLoadContext(ctx.cwd))`) and `work-order-loop.ts:175` (`createAgentLoader(dispatchLoadContext(cwd))`). This matches FGAP-127's `closed_by` (TASK-103 / VER-081, runtime-demonstrated). TASK-103 (fresh read, status `completed`) says "Fix per FGAP-127's proposed_resolution second disjunct" and its description records "user-approved plan 2026-07-08". No contradiction with shipped state.

**Ceremony-seeding branch — NOT built, and its absence is deliberate per the closure record.** `grep -rn "installed_agents" packages` (ts+json): zero hits. Install ceremony still materializes only schemas + blocks — `packages/pi-context/src/context.ts:701-704`:

```ts
const schemas = (config.installed_schemas ?? []).filter(
	...
const blocks = (config.installed_blocks ?? []).filter((name) => !fs.existsSync(installedBlockDestPath(root, name)));
```

`ConfigRegistryKey` (context.ts:242-243) lists only `"installed_schemas" | "installed_blocks"`. The branch does not contradict shipped state — it simply was never built. FGAP-127's `closed_by` (verbatim): "This takes the proposed_resolution's bundled-builtinDir disjunct; the OTHER disjunct — seeding the agents tier in the install ceremony (an installed_agents[] manifest) — was NOT built and remains an open FEAT-014 design option, deliberately not required for this gap's headline defect". TASK-103 acceptance criterion 6 (user-approved plan) mandated exactly this closure shape: "FGAP-127 closed with the ceremony-seeding disjunct explicitly recorded as an open FEAT-014 design option."

**Does the closure record settle the fork?** Yes, at the gap level: the headline defect (fresh substrate cannot resolve a target_agent) is closed via the bundled disjunct, and the record explicitly declassifies the ceremony disjunct from "required for this gap" to "open FEAT-014 design option." The second branch is genuinely still open — but as a FEAT-014 design question already tracked there (FEAT-014 is `in-progress`; its criterion 4's "seeded by ceremony or a bundled tier is wired" is currently satisfied on the bundled leg). The still-open branch therefore does not lack a tracking home; whether it warrants its own task under FEAT-014 is a user scope call, not a defect in FGAP-127's text.

## 6. Verdict per branch

- **"wire a bundled builtinDir into the dispatch loaders"** — DERIVABLE-from-a-source-that-supports-it. Directly derivable from the cited Break-4 root cause ("no builtinDir — so tier 3 is skipped entirely"; "points at no bundle"); subsequently user-approved at fix time (TASK-103 plan, 2026-07-08) and shipped/verified (dispatch-loader.ts, VER-081).
- **"seed the agents tier in the install ceremony (an installed_agents[] manifest beside schemas/blocks)"** — DERIVABLE-from-a-source-that-supports-it as a remedy direction: the direction is the direct negation of the cited Break-4 root cause ("nothing creates or seeds `<contextDir>/agents/`"; "No `agents/` concept exists in the install ceremony") and its stated class. The parenthetical mechanism (`installed_agents[]` manifest) is LLM-composed detail, but by direct analogy with the report's cited fact ("install copies `installed_schemas[]`/`installed_blocks[]`") — anchored, not free-floating.
- **The "and/or" fork framing** — LLM-composed under filing authority; no source proposes the fork and no user message discusses it. However it asserts nothing unsupported: the cited report names TWO compounding causes and makes ZERO recommendations for Break 4, so a non-committal both-branches resolution faithfully represents an underdetermined source; the same-batch FEAT-014 criterion 4 carries the same "or"; and the fork was later adjudicated by a user-approved plan (TASK-103) whose closure record documents which disjunct was taken and the other's open status.

**Overall: NOT LLM-augmentation-with-no-basis.** Both branches trace to the cited investigation's root-cause statements; the fork was subsequently settled through the user-approved TASK-103 arc and is documented in `closed_by`.

## 7. Correction

**None made.** Per the audit's gating rule, correction applies only on an augmentation-with-no-basis verdict. Additionally, rewriting the closed gap's `proposed_resolution` to a single branch would orphan the `closed_by` record's explicit references to "the proposed_resolution's bundled-builtinDir disjunct" and "the OTHER disjunct", damaging a coherent, user-approved closure narrative. The still-open ceremony-seeding question is already tracked inside FEAT-014 (in-progress, acceptance criterion 4) per the closure record; no new item was filed (filing is outside this audit's mandate).

## Residual observations (for the orchestrator, not acted on)

- The filing carried `# provenance-reviewed` with no user message between the filing directive (00:25:42Z) and the write (00:29:05Z); the grant was the blanket "i want all findings … validly and canonically filed", not a per-element provenance table review. The clause's content survives on derivability, not on the sentinel.
- At filing time, "per the dispatch-architecture decision" referenced a decision that did not yet exist (DEC-0022 was filed retroactively later on 2026-07-07 after implementation shipped). The reference is forward-looking-at-filing and now resolves cleanly to DEC-0022.
