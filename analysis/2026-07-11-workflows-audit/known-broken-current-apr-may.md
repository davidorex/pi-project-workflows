---
audit_group: known-broken-current
description: workflows known-broken, Apr-May window
source_agent: ac7825473f04a59b4
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/ac7825473f04a59b4.output
verbatim: true
---

I have complete evidence. Here is my report.

---

## 1. COVERAGE

**Method.** Smart-search from the two directed anchors, not keyword-hunting:
- **David's statements:** filtered his genuine typed text (`type=user`, `block_type=text`, tool_results excluded) across the full window — 3,064 human text blocks over all 21 sessions. Read the ~200 assertion-/reaction-bearing ones spanning 2026-04-04 → 2026-05-31 (the full 1,332-line dump plus targeted queries).
- **Verified reproductions:** grouped all 1,120 `is_error=1` tool executions in the window; inspected the top ~40 distinct failure classes by frequency.
- **Fix-status:** cross-checked every surviving candidate against live source (`packages/*`), the `.context/` substrate (issues.json, framework-gaps.json — 12 issues, 141 gaps), and `git log` commit dates.

**Sampling / not covered.** 96,550 messages / 21 sessions. I did not read every message or every long instruction block, nor all 1,120 individual errors — I sampled the assertion + reproduction anchors as directed. One 58k-message session (b62c055d, May 3–31) dominates; I sampled its David-voice statements densely but not exhaustively. Harness-noise errors (file-not-read, string-not-found, rejected edits, model-unavailable) were treated as non-findings.

**Structural fact that governs the result:** the window is the *pre-substrate, pre-rename* era. The package `pi-project` was renamed to `pi-context` (bin is now `pi-context`), the substrate moved `.project` → `.context`, and the `.context/` framework-gaps + issues abstraction did not exist until **2026-06-03** — every one of the 60 currently-open gaps and all 3 open issues were **created after the window**. So the current substrate's open-list cannot supply window-established breaks; they had to be found in the conversation and re-verified in code.

## 2. KNOWN-BROKEN-NOT-FIXED (surviving from the window)

**None.** Every established break I could anchor in the April–May window has since been fixed or superseded. This is a genuine finding, not a coverage gap: the clearest window breaks carried verified reproductions, and their fixes are dated inside or just after the window.

Notable early breaks CONFIRMED FIXED (id + one line):

- **Monitor classify 400 — thinking + forced toolChoice.** David pasted the live reproduction 2026-04-06T11:38 (`"Thinking may not be enabled when tool_choice forces tool use", request_id req_011CZnTA8XSEHuaev1wqKchR`). Fixed in-window: commit `e9d9457` (2026-04-07) "disable thinking on classify calls"; CHANGELOG confirms.
- **Monitor "Unrecognized verdict format" / "No tool call in response (stopReason: error, content: [])."** Reproduced 2026-04-06. Fixed: error-verdict-on-parse-failure (`e23daee`), model IDs updated for tool-use compat (`fa45bf6`).
- **Stale `.pi/monitors` files — `seedExamples()` never overwrites.** David 2026-04-26T04:08 ("why are the files in .pi/monitors not being overwritten upon reinstalling"), 04-06 ("we had stale monitor files causing us problems"); agent-confirmed "affe992 didn't propagate because seedExamples() never overwrites already-seeded files." Fixed in-window: `f10e8bb` (2026-04-28) three-tier loader replacing `seedExamples()`; bundled changes now propagate.
- **OpenRouter classify auth — "Could not resolve authentication method."** Reproduced 2026-04-13T22:14. Superseded by provider-aware toolChoice normalization (`ce37772`, 2026-04-25) and the auth-required gating architecture (`auth-required.ts`).
- **Hardcoded `PROJECT_DIR = .project/` bootstrap.** David's verbatim assertion 2026-05-10T01:18 ("This was never a user decision and directly contradicts the whole purpose of the config work"). Landed: bootstrap is now config-driven via a bootstrap pointer / `contextDir` override (`context-dir.ts`, `writeBootstrapPointer`; accept-all.test.ts documents the hardcoded root being overridden).
- **Credentialed gates never run** (David 2026-05-03T01:47, "Credentialed gates have never run. Both Gate A and Gate B scaffolded but unexercised"). Exercised since: `docs/reports/v0.26.0-step12-scoped-credentialed-smoke-2026-05-25.md`.
- **`pi-project`/`pi-mono` biome+tsc `npm run check` failures, `Cannot find module 'ajv'`, `verification-gate-demo.ts` missing** — all in the `pi-project` tree, renamed to `pi-context`; superseded.

**Disqualified (currently open, but NOT window-established):** layer-plans nested id-bearing-array schema flaw. The schema still nests (`.context/schemas/layer-plans.schema.json` and `packages/pi-context/samples/schemas/layer-plans.schema.json` both retain `plans.layers` / `migration_phases`; issue-002 status `open`). David touched the migration-model conceptually on 2026-05-31T13:07, and a guardrail against *new* nested arrays landed 2026-05-31 (`72a55966`). But the defect was formally established as **issue-002 on 2026-06-06** (`fb05b0f6`) — after the window. It fails the window-establishment bar, so it is not a finding here even though it is live-open now.

## 3. EMERGENT CATEGORIES

Because nothing survives, the categories describe *why the window produced no durable breakage*:

- **Reproduced product breaks were fixed fast, in-window** (monitor classify/auth/seeding cluster — the only verified in-session reproductions of real functionality — all fixed April 7–28).
- **Superseded by rename/restructure** (`pi-project` → `pi-context`, `.project` → `.context`): the code carrying April–May breaks no longer exists under those paths.
- **Process/architecture complaints, not code breaks:** the large majority of David's critical statements in the window were about agent behavior, planning, vocabulary, scope-adherence, and hedging — not assertions that shipped code was broken — so they leave no code-level residue to persist.
- **Current open-work is post-window:** the live known-broken set (issue-002/010/011, 60 open FGAPs) was authored 2026-06-03 onward against the rebuilt substrate; it is a separate lineage from the window.
