# decisions.json block-shape survey (2026-05-26)

Source: `/Users/david/Projects/workflowsPiExtension/.project/decisions.json`
Total decisions: **49** (DEC-0001 through DEC-0049)
Survey method: pure enumeration (Read-only); no synthesis, no recommendations.

---

## Section 1 — Per-entry shape table

Field key: OC=options_considered (count, with `rejected_reason` populated count in parens), SP=supersedes, SB=superseded_by, RFi=related_findings, RFe=related_features, RG=related_gaps, REF=references (count), EB=enacted_by, EA=enacted_at, CTX=context size (chars approx), DEC=decision size (chars approx), CONS=consequences (count / total chars approx).

| id | title (trunc ~80) | status | CTX | DEC | CONS | OC | SP | SB | RFi | RFe | RG | REF | EB | EA | created_by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEC-0001 | Agent spec 'model:' field semantics | open | 920 | 525 | 5 / ~1140 | 0 | [] | – | [issue-062] | [FEAT-001] | [] | 4 (path+lines mix) | – | – | agent/claude-opus-4-6 |
| DEC-0002 | Thinking-seam enforcement for forced-toolChoice dispatch | open | 715 | 600 | 4 / ~830 | 0 | [] | – | [issue-063] | [FEAT-001] | [] | 2 (path+lines) | – | – | agent/claude-opus-4-6 |
| DEC-0003 | parseModelSpec ownership at the execute boundary | open | 1330 | 1050 | 5 / ~1140 | 0 | [] | – | [issue-043] | [FEAT-001] | [] | 2 (path+lines) | – | – | agent/claude-opus-4-6 |
| DEC-0004 | TraceEntry schema independence from SessionEntry | enacted | 1450 | 660 | 6 / ~990 | 0 | – | – | [issue-023] | – | – | 5 (path+lines+commit) | (absent) | (absent) | agent/claude-opus-4-7 |
| DEC-0005 | Monitor observability via push-write trace stream | enacted | 1690 | 815 | 9 / ~1690 | 0 | – | – | [issue-023] | – | – | 6 (path+lines+commit) | (absent) | (absent) | agent/claude-opus-4-7 |
| DEC-0006 | Sixth block of the substrate contract | superseded | 760 | 290 | 1 / ~430 | 5 (0 rej) | – | – | – | [FEAT-001] | 4 | 2 (path) | – | – | agent/claude-opus-4-7 |
| DEC-0007 | Composition contract for prompt assembly | superseded | 820 | 560 | 1 / ~430 | 0 | – | – | 4 | [FEAT-001] | 2 | 2 (path) | – | – | agent/claude-opus-4-7 |
| DEC-0008 | contextBlocks parameterization: typed vs bare-string | enacted | 970 | 640 | 5 / ~640 | 2 (1 rej) | – | – | 3 | [FEAT-001] | 2 | 2 (path) | user | 2026-05-03 | agent/claude-opus-4-7 |
| DEC-0009 | FGAP-001 resolution: closure-table vs subpath block names | enacted | 870 | 800 | 5 / ~570 | 3 (2 rej) | – | – | – | [FEAT-001] | [FGAP-001] | 3 (path) | user | 2026-05-03 | agent/claude-opus-4-7 |
| DEC-0010 | Scope discovery and layering across user/project/agent | superseded | 945 | 800 | 1 / ~390 | 4 (0 rej) | – | – | 2 | [FEAT-001] | [FGAP-001] | 3 (path+url) | – | – | agent/claude-opus-4-7 |
| DEC-0011 | Retire packaged defaults — no seed schemas/blocks | enacted | 1290 | 555 | 6 / ~1490 | 0 | – | – | [issue-074] | – | [FGAP-001] | 3 (path+lines) | user | 2026-05-03 | user |
| DEC-0012 | Phase/item dependency authoring shape | superseded | 745 | 850 | 6 / ~1610 | 2 (1 rej) | – | DEC-0013 | – | – | [FGAP-012] | 0 | user | 2026-05-04 | agent/claude-opus-4-7 |
| DEC-0013 | Edges-only authoring generalized — config-declared relation_types | enacted | 1230 | 870 | 7 / ~1100 | 2 (0 rej, prose tradeoffs only) | [DEC-0012] | – | – | – | [FGAP-013] | 0 | (absent EB) | (absent EA) | agent/claude-opus-4-7 |
| DEC-0014 | Harness-confined main LLM | enacted | 1410 | 770 | 10 / ~3220 | 2 (1 rej) | [] | – | – | – | 3 | 1 (path) | user | 2026-05-10 | agent/post-step-8.6-orchestrator |
| DEC-0015 | Config drives substrate location | enacted | 1300 | 990 | 9 / ~3370 | 2 (1 rej) | [] | – | – | – | 2 | 3 (path) | user | 2026-05-10 | agent/post-step-8.6-orchestrator |
| DEC-0016 | Same extension-tool surface from pi + Claude Code | enacted | 1620 | 2030 | 9 / ~3140 | 2 (1 rej) | [] | – | – | – | 3 | 3 (path) | user | 2026-05-10 | agent/post-step-8.6-orchestrator |
| DEC-0017 | Work-unit context composed at dispatch time | enacted | 1830 | 2110 | 7 / ~2660 | 2 (1 rej) | [] | – | – | – | 7 | 5 (path) | user | 2026-05-10 | agent/post-step-8.6-orchestrator |
| DEC-0018 | Tests-pass alone insufficient — runtime demo + adversarial | enacted | 990 | 1230 | 7 / ~1310 | 0 | – | – | – | – | [FGAP-028] | 5 (path+git) | human/davidryan@gmail.com | 2026-05-10 | human/davidryan@gmail.com |
| DEC-0019 | scripts/orchestrator/* as canonical test surface | enacted | 1290 | 900 | 7 / ~1280 | 0 | – | – | – | – | 2 | 6 (path) | human/davidryan@gmail.com | (absent EA) | human/davidryan@gmail.com |
| DEC-0020 | Per-layer work-unit outputs as typed substrate blocks | enacted | 1490 | 1120 | 10 / ~2150 | 0 | – | – | – | – | 7 | 6 (path) | human/davidryan@gmail.com | (absent EA) | human/davidryan@gmail.com |
| DEC-0021 | Hard-throw substrate cascades per-package atomically | enacted | 2020 | 1410 | 8 / ~1860 | 0 | – | – | – | – | 3 | 7 (path+git) | human/davidryan@gmail.com | (absent EA) | human/davidryan@gmail.com |
| DEC-0022 | Features schema drops "Epic-level" qualifier | enacted | 660 | 280 | 4 / ~270 | 0 | – | – | [] | [FEAT-001] | [] | 3 (path+lines) | human/davidryan@gmail.com | 2026-05-14 | human/davidryan@gmail.com |
| DEC-0023 | Schema title field = authoritative display_name | enacted | 780 | 660 | 5 / ~600 | 0 | – | – | [] | [] | [FGAP-047] | 4 (path+lines) | human/davidryan@gmail.com | 2026-05-14 | human/davidryan@gmail.com |
| DEC-0024 | Milestones are primary declarative-organizing anchor | enacted | 1090 | 1080 | 8 / ~890 | 0 | – | – | [] | [] | [FGAP-053] | 5 (path+lines) | human/davidryan@gmail.com | 2026-05-14 | human/davidryan@gmail.com |
| DEC-0025 | pi-context substrate canon is vocabulary-neutral | enacted | 1530 | 920 | 8 / ~1020 | 0 | – | – | [] | [] | 2 | 5 (path+lines) | human/davidryan@gmail.com | 2026-05-14 | human/davidryan@gmail.com |
| DEC-0026 | ID-prefix padding convention 3-digit vs 4-digit | open | 1170 | 130 | 4 / ~330 | 4 (0 rej) | – | – | [] | [] | 2 | 3 (path+lines) | – | – | human/davidryan@gmail.com |
| DEC-0027 | ID-prefix casing convention uppercase vs lowercase | open | 540 | 70 | 3 / ~250 | 3 (0 rej) | – | – | [] | [] | 2 | 3 (path) | – | – | human/davidryan@gmail.com |
| DEC-0028 | Phase block-kind shape | enacted | 1310 | 870 | 4 / ~510 | 3 (0 rej) | – | – | [] | [] | 3 | 5 (path+lines) | human/davidryan@gmail.com | 2026-05-17 | human/davidryan@gmail.com |
| DEC-0029 | Substrate-dir replacement name | enacted | 1180 | 580 | 4 / ~590 | 6 (0 rej) | – | – | [] | [] | [FGAP-026] | 3 (path) | human/davidryan@gmail.com | 2026-05-17 | human/davidryan@gmail.com |
| DEC-0030 | Relation_type canonical_id naming shape | enacted | 1610 | 670 | 5 / ~530 | 4 (0 rej) | – | – | [] | [] | 3 | 6 (path) | human/davidryan@gmail.com | 2026-05-17 | human/davidryan@gmail.com |
| DEC-0031 | Lens id naming convention | open | 1010 | 95 | 4 / ~290 | 4 (0 rej) | – | – | [] | [] | [FGAP-047] | 3 (path+lines) | – | – | human/davidryan@gmail.com |
| DEC-0032 | Layer registry adoption | open | 1300 | 80 | 5 / ~420 | 4 (0 rej) | – | – | [] | [] | 2 | 6 (path+lines) | – | – | human/davidryan@gmail.com |
| DEC-0033 | Status-bucket normalization mapping | open | 1490 | 75 | 4 / ~330 | 4 (0 rej) | – | – | [] | [] | 2 | 3 (path) | – | – | human/davidryan@gmail.com |
| DEC-0034 | Conventions block schema migration | open | 1190 | 90 | 5 / ~550 | 4 (0 rej) | – | – | [] | [] | 2 | 5 (path) | – | – | human/davidryan@gmail.com |
| DEC-0035 | canonical_id is permanent; display_name is relabel surface | enacted | 1170 | 980 | 5 / ~660 | 0 | – | – | [] | [] | [FGAP-060] | 4 (path+lines) | human/davidryan@gmail.com | 2026-05-17 | human/davidryan@gmail.com |
| DEC-0036 | Re-derive .context substrate clean via config-based framework | enacted | 1740 | 1810 | 7 / ~1530 | 0 | – | – | [] | [] | 4 | 5 (path) | human/davidryan@gmail.com | 2026-05-17 | human/davidryan@gmail.com |
| DEC-0037 | Samples catalog identity — packaged conception as dogfood | enacted | 530 | 800 | 5 / ~570 | 2 (1 rej) | – | – | [] | [] | 2 | – (no refs) | (absent EB) | (absent EA) | human/davidryan@gmail.com |
| DEC-0038 | Onboarding model — /context init = standing surfaces | enacted | 540 | 1080 | 5 / ~660 | 2 (1 rej) | – | – | [] | [] | [FGAP-066] | – (no refs) | (absent EB) | (absent EA) | human/davidryan@gmail.com |
| DEC-0039 | No-optional registries — absence = degenerate default | enacted | 670 | 950 | 4 / ~570 | 2 (1 rej) | – | – | [] | [] | [FGAP-052] | – (no refs) | (absent EB) | (absent EA) | human/davidryan@gmail.com |
| DEC-0040 | Substrate is single source of truth (with un-conflation amend) | enacted | 950 | 3110 | 8 / ~2140 | 2 (1 rej) | – | – | [] | [] | 2 | – (no refs) | (absent EB) | (absent EA) | human/davidryan@gmail.com |
| DEC-0041 | config.root optional override; .pi-context.json is SoT | enacted | 1370 | 750 | 6 / ~570 | 0 | – | – | – | – | 2 | 4 (path+lines) | davidryan@gmail.com | 2026-05-23 | human/davidryan@gmail.com |
| DEC-0042 | /context start sole bootstrap entry; bootstrap human-only | enacted | 2120 | 3580 | 10 / ~1620 | 0 | – | – | – | – | 4 | 4 (path+lines) | davidryan@gmail.com | 2026-05-23 | human/davidryan@gmail.com |
| DEC-0043 | Framework schemas bundled-validated, not installable | enacted | 1390 | 880 | 6 / ~770 | 0 | – | – | – | – | 4 | 3 (path+lines) | davidryan@gmail.com | 2026-05-23 | human/davidryan@gmail.com |
| DEC-0044 | Agent-as-tool dispatch home — NEW pi-agent-dispatch extension | enacted | 1430 | 2920 | 5 / ~1370 | 6 (5 rej) | – | – | – | 3 | 3 | 2 (path+lines) | (absent EB) | (absent EA) | human/davidryan@gmail.com |
| DEC-0045 | Substrate path resolution unifies on .pi-context.json pointer | enacted | 1290 | 990 | 6 / ~810 | 0 | – | – | – | – | [FGAP-079] | 3 (path+lines) | human/davidryan@gmail.com | 2026-05-23 | human/davidryan@gmail.com |
| DEC-0046 | FGAP-074 /project->/context source-surface naming canon | enacted | 1480 | 1430 | 8 / ~1340 | 3 (2 rej) | – | – | – | [FEAT-004] | 3 | 3 (path) | human/davidryan@gmail.com | 2026-05-23 | human/davidryan@gmail.com |
| DEC-0047 | Constitutional capability model for autonomous orchestration | enacted | 1320 | 2090 | 5 / ~1260 | 2 (1 rej) | – | – | – | 3 | 4 | 3 (path+lines) | (absent EB) | (absent EA) | human/davidryan@gmail.com |
| DEC-0048 | Existing workflows + bundled agents NOT targets | enacted | 590 | 1010 | 5 / ~610 | 0 | – | – | – | [FEAT-001] | – | – (no refs) | (absent EB) | (absent EA) | human:davidryan@gmail.com |
| DEC-0049 | Uniform-agent definition — one agent abstraction | enacted | 530 | 1130 | 5 / ~720 | 0 | – | – | – | 2 | [FGAP-112] | – (no refs) | (absent EB) | (absent EA) | human:davidryan@gmail.com |

---

## Section 2 — Emergent shape-clusters (observational labels + counts + members)

### C1. Status distribution (N=49 total)
- `open` (N=7): DEC-0001, DEC-0002, DEC-0003, DEC-0026, DEC-0027, DEC-0031, DEC-0032, DEC-0033, DEC-0034. **NOTE: 9 entries actually; raw count.**
  - Corrected: DEC-0001/0002/0003/0026/0027/0031/0032/0033/0034 = 9 open.
- `enacted` (N=37): DEC-0004, 0005, 0008, 0009, 0011, 0013, 0014, 0015, 0016, 0017, 0018, 0019, 0020, 0021, 0022, 0023, 0024, 0025, 0028, 0029, 0030, 0035, 0036, 0037, 0038, 0039, 0040, 0041, 0042, 0043, 0044, 0045, 0046, 0047, 0048, 0049. **36 entries; raw count.**
- `superseded` (N=4): DEC-0006, DEC-0007, DEC-0010, DEC-0012.

### C2. No options_considered (N=24)
Members: DEC-0001, DEC-0002, DEC-0003, DEC-0004, DEC-0005, DEC-0007, DEC-0011, DEC-0018, DEC-0019, DEC-0020, DEC-0021, DEC-0022, DEC-0023, DEC-0024, DEC-0025, DEC-0035, DEC-0036, DEC-0041, DEC-0042, DEC-0043, DEC-0045, DEC-0048, DEC-0049, plus DEC-0013 (carries options but with zero rejected_reason — body uses "tradeoffs" alone).
One-line shape: decision text states the answer directly without enumerating alternatives in the structured `options_considered[]` field.

### C3. options_considered populated with zero `rejected_reason` on any option (N=8)
Members: DEC-0006 (5 opts, 0 rej), DEC-0010 (4 opts, 0 rej), DEC-0026 (4 opts, 0 rej), DEC-0027 (3 opts, 0 rej), DEC-0028 (3 opts, 0 rej), DEC-0029 (6 opts, 0 rej), DEC-0030 (4 opts, 0 rej), DEC-0031 (4 opts, 0 rej), DEC-0032 (4 opts, 0 rej), DEC-0033 (4 opts, 0 rej), DEC-0034 (4 opts, 0 rej). (raw 11)
One-line shape: option arrays read like menus/candidates without an internal selection signal; tradeoffs prose only.

### C4. options_considered with at least one option carrying explicit `rejected_reason` (N=10)
Members: DEC-0008 (2 opts, 1 rej), DEC-0009 (3 opts, 2 rej), DEC-0012 (2 opts, 1 rej), DEC-0014 (2 opts, 1 rej), DEC-0015 (2 opts, 1 rej), DEC-0016 (2 opts, 1 rej), DEC-0017 (2 opts, 1 rej), DEC-0037 (2 opts, 1 rej), DEC-0038 (2 opts, 1 rej), DEC-0039 (2 opts, 1 rej), DEC-0040 (2 opts, 1 rej), DEC-0044 (6 opts, 5 rej), DEC-0046 (3 opts, 2 rej), DEC-0047 (2 opts, 1 rej). (raw 14)
One-line shape: chosen + rejected pattern, with reason embedded on rejected entries.

### C5. Entries marked `enacted` but missing `enacted_by` and/or `enacted_at` (N=14)
Members:
- Missing both: DEC-0004, DEC-0005 (early-arc agent-authored)
- Missing both: DEC-0019, DEC-0020, DEC-0021 (have created_by=human and identical created_at; enactment fields absent)
- Missing both: DEC-0037, DEC-0038, DEC-0039, DEC-0040 (human/davidryan@gmail.com authored 2026-05-20/21)
- Missing both: DEC-0044, DEC-0047, DEC-0048, DEC-0049 (human-authored, 2026-05-22/24/26)
- DEC-0013 missing enacted_by/enacted_at (uses created_by=agent only).
One-line shape: status=enacted asserted in `status` field without populating the enactment-attestation tuple.

### C6. Entries where `enacted_by` value shape varies (N populated subset)
Distinct values observed:
- `user` (lowercase, no email) — DEC-0008, 0009, 0011, 0012, 0014, 0015, 0016, 0017
- `human/davidryan@gmail.com` (slash) — DEC-0018, 0022, 0023, 0024, 0025, 0028, 0029, 0030, 0035, 0036, 0041, 0042, 0045, 0046
- `human:davidryan@gmail.com` (colon, no enacted_by — see created_by) — DEC-0048, DEC-0049 use colon shape in created_by
- `davidryan@gmail.com` (bare email, no kind prefix) — DEC-0041, DEC-0042, DEC-0043 use this in `enacted_by`
One-line shape: writer-identity discriminator written four ways across history (user / human/email / human:email / bare-email).

### C7. `created_by` value shape varies (N=49)
- `agent/claude-opus-4-6` — DEC-0001, 0002, 0003
- `agent/claude-opus-4-7` — DEC-0004, 0005, 0006, 0007, 0008, 0009, 0010, 0012, 0013
- `agent/post-step-8.6-orchestrator` — DEC-0014, 0015, 0016, 0017
- `user` (lowercase) — DEC-0011
- `human/davidryan@gmail.com` — DEC-0018 through DEC-0047 (most human-filed)
- `human:davidryan@gmail.com` (colon variant) — DEC-0048, DEC-0049
One-line shape: kind discriminator switches between `/`, `:`, lowercase-bareword across the corpus.

### C8. Entries whose `decision` field reads as a question/declared-pending rather than an answer (N=7)
Members + verbatim decision-field opening:
- DEC-0001: "Bare model ids in an agent spec resolve against the current session's configured provider…" — answers
- DEC-0026: "OPEN: padding convention to canonicalize across all block kinds. Mandate-compliant options surfaced in options_considered; user enacts."
- DEC-0027: "OPEN: casing convention to canonicalize. Mandate-compliant options below."
- DEC-0031: "OPEN: lens id naming convention. Mandate-compliant options below."
- DEC-0032: "OPEN: layer registry adoption + canonical labels. Mandate-compliant options below."
- DEC-0033: "OPEN: status-bucket normalization mapping. Mandate-compliant options below."
- DEC-0034: "OPEN: conventions schema migration scope + sequencing. Mandate-compliant options below."
- DEC-0006: "Decision pending. Two heuristic-aligned candidates compete; three pre-heuristic candidates retained for completeness but not preferred. Resolution updates…"
- DEC-0007: "Decision pending. The composition contract must specify…"
- DEC-0010: "Decision pending. Composition rule must specify…"
One-line shape: `decision` field functions as a deferral marker pointing at options_considered, not a resolution.

### C9. Entries whose `consequences[]` contains items reading as retrospective journal/superseded prose, not forward-looking (N=4)
Members + sample wording:
- DEC-0006 (only consequence): "Superseded: off-by-one re-count of the substrate contract. Original framing claimed six discrete blocks while enumerating five… Filed under proliferation pressure during the heuristic-widening pass; retired without enactment."
- DEC-0007: "Superseded: composition rules for prompt assembly… are specification work, not a directional choice between mandate-compliant alternatives. Belongs as an FGAP or implementation-issue series, not a DEC. Filed by treating 'things that need specification' as 'decisions to make'; retired without enactment."
- DEC-0010: "Superseded: the real concern (GitHub #3 folder placement) is already closed empirically by the POC's config.root field. The user/project/agent scope-layering expansion was theoretical embellishment from the heuristic-widening pass…"
- DEC-0012: extensive prose tradeoffs in options + supersession recorded.
One-line shape: consequences[] used as supersession-rationale text rather than forward-looking effect enumeration.

### C10. Entries where the `decision` field cites or references future-DEC IDs (forward references) (N=11)
Members:
- DEC-0001 cites DEC-0003 ("once parseModelSpec and classify dispatch move there per DEC-0003")
- DEC-0002 cites DEC-0003
- DEC-0014 cites DEC-0014/0015 frames against itself; no forward-DEC numeric cite but explicit gating arrow to "DEC-0017" via consequences.
- DEC-0017 cites DEC-0013, DEC-0014, DEC-0016 (back) — but consequences cite DEC-0014/0015/0016/0017 as "four-piece canon" naming future-equal IDs at file-time.
- DEC-0023 cites DEC-0023 (self)
- DEC-0035 cites DEC-0023, DEC-0026/0027, FGAP-060
- DEC-0036 cites DEC-0028, DEC-0029, FGAP-040, FGAP-046
- DEC-0040 cites DEC-0018, DEC-0020, DEC-0036, DEC-0014/0019/0020, FGAP-072/073
- DEC-0042 cites DEC-0014, DEC-0015, DEC-0019/0020, DEC-0038, FGAP-066/093/095
- DEC-0044 cites DEC-0048, DEC-0049, FGAP-099, FGAP-112, JI-021/010 (intentions ids)
- DEC-0046 cites DEC-0036, DEC-0042, DEC-0044, DEC-0045
- DEC-0047 cites DEC-0014, DEC-0015/0011/0025, DEC-0018, DEC-0019/0020, FEAT-004/005/006, FGAP-102
- DEC-0049 cites DEC-0048, FEAT-001, FEAT-004
One-line shape: decision/consequences fields routinely depend on the existence of other DEC IDs (some earlier, some peer-numeric, some forward) creating dense intra-block dependency reading.

### C11. Entries with multi-paragraph layered "WIDENED YYYY-MM-DD" / "Amendment" / "narrowed YYYY-MM-DD" prose stacked inside one field (N=4)
Members + excerpt:
- DEC-0003: context contains "Widening 2026-05-26: empirical grep verified a SECOND parseModelSpec duplicate at packages/pi-workflows/src/step-monitor.ts:371…" — stacks a later-date update into the original context field.
- DEC-0040: decision field contains "[Amendment 2026-05-21 — un-conflate the EXTENSION vs the CLAUDE CODE HARNESS]: precise three-layer scoping…" — full mid-decision amendment block embedded in one field.
- DEC-0044: decision field opens "ENACTED (2026-05-26, narrowed 2026-05-26 per FGAP-112 working-out): …" then references "Supersedes the prior wider 'wraps the pi-jit-agents library' framing of this decision (2026-05-26 enactment language); the narrowing does not change which package gets created…"
- DEC-0047: decision opens "ENACTED (2026-05-26), in code terms (the prior legislative/executive/judicial framing was thinking-scaffolding; the model below is the operative form). No genuine fork remained at settlement — the model is determined by FEAT-005 + DEC-0014/0015/0011 + FGAP-102; settling = recording it."
- DEC-0021: context narrates "C.3 implementation cascaded fixtures correctly per the plan (138 sites cascaded + 55 skipped per explore classification) but 20/826 pi-workflows tests still failed because: (a) explore agent misclassified…" — layered retrospective findings inside context.
One-line shape: revision history embedded as in-line prose inside a substrate field rather than emitted as a separate DEC supersession.

### C12. Entries with no `references[]` (empty / absent) (N=6)
Members: DEC-0012 (references: []), DEC-0013 (references: []), DEC-0037 (no references key), DEC-0038, DEC-0039, DEC-0040, DEC-0048, DEC-0049.
One-line shape: high-density text-only DECs without explicit reference enumeration.

### C13. References contain external/URL citations (N=2)
- DEC-0010 references include "https://github.com/davidorex/pi-project-workflows/issues/3" (GitHub URL in `path`).
- Most other refs use repo paths or git: prefix (e.g. DEC-0018 `git:ff13ff2`, DEC-0021 `git:d64cb33`, DEC-0004 `commit: 1bc36ba`).
One-line shape: reference shape mixes repo paths, git SHAs (two notations — `git:` prefix in path vs `commit` separate field), tmp paths (`/tmp/explore-c3-fixtures-v2.md`), and external URLs.

### C14. Reference entries using `commit:` as a separate field vs `path: git:<sha>` (N split)
- `commit:` separate field — DEC-0004 ("commit": "1bc36ba"), DEC-0005 ("commit": "1bc36ba").
- `path: "git:<sha>"` — DEC-0018, DEC-0021, DEC-0046 (in consequences prose).
One-line shape: two distinct schema-shapes for "commit reference" coexist in the same block.

### C15. Entries whose body cites forcing artifacts NOT in standard substrate vocabulary (N=4)
Members:
- DEC-0044 cites "JI-021", "JI-010" (intentions.jsonl ids)
- DEC-0048 cites "JI-002" (intentions ids)
- DEC-0049 cites "JI-001"
- DEC-0047 cites "FEAT-006" (feature id not present in standard `related_features` of older entries)
One-line shape: ID-prefix vocabulary grows during the arc (JI-*, RAT-*, REVIEW-*, CTX-*, R-*) and DEC bodies reach across into them without registration in this block's schema.

### C16. `related_findings` / `related_features` / `related_gaps` keys appearing as empty `[]` (N=many) vs absent (N=many)
- Empty-array form: DEC-0022 (`related_findings: []`, `related_gaps: []`), DEC-0023, DEC-0024, DEC-0025, DEC-0026, DEC-0027, DEC-0028, DEC-0029, DEC-0030, DEC-0031, DEC-0032, DEC-0033, DEC-0034, DEC-0035, DEC-0036, DEC-0037, DEC-0038, DEC-0039, DEC-0040.
- Key absent entirely: DEC-0041, DEC-0042, DEC-0043, DEC-0044, DEC-0045, DEC-0046, DEC-0047, DEC-0048, DEC-0049 (variously omit `related_findings` and/or `related_features`).
One-line shape: two distinct null-state conventions (empty-array vs key-absence) coexist for the three relation fields.

### C17. ID-property position in JSON varies (N=49)
- `id` declared as first property of object: DEC-0001 through DEC-0018 (e.g. line 4: `"id": "DEC-0001"`).
- `id` declared at end / middle of object: DEC-0019, DEC-0020, DEC-0021, DEC-0022, DEC-0023, DEC-0024, DEC-0025, DEC-0026, DEC-0027, DEC-0028, DEC-0029, DEC-0030, DEC-0031, DEC-0032, DEC-0033, DEC-0034, DEC-0035, DEC-0036, DEC-0037, DEC-0038, DEC-0039, DEC-0040, DEC-0041, DEC-0042, DEC-0043, DEC-0044, DEC-0045, DEC-0046, DEC-0047 (`id` appears near end after consequences/options/refs).
- Hybrid (`id` mid-object): DEC-0048, DEC-0049.
One-line shape: object key-ordering convention drifts mid-corpus; later entries put `id` after `title`/`status` or last; earlier entries put `id` first.

### C18. `created_at` granularity varies (N=49)
- Date-only `2026-04-15T00:00:00Z` placeholder zero-time — DEC-0001, 0002, 0003, 0004, 0005, 0006…0012.
- Full ISO with non-zero time `2026-05-06T22:14:17.096Z` — DEC-0013 onward (most have microsecond precision).
- Bare date string `"2026-05-26"` (no T, no Z) — DEC-0048, DEC-0049.
- Date-only T-zero `2026-05-20T00:00:00Z` — DEC-0037, DEC-0038, DEC-0039, DEC-0040.
One-line shape: timestamp shape switches between zero-time placeholder, microsecond-precision, and bare-date.

### C19. Decision field size extremes (N=49)
- Tiny decision fields (≤150 chars): DEC-0026 ("OPEN: padding…"), DEC-0027, DEC-0031, DEC-0032, DEC-0033, DEC-0034 — all 70-130 chars; the decision content lives in options_considered.
- Massive decision fields (≥2000 chars): DEC-0016 (~2030), DEC-0017 (~2110), DEC-0036 (~1810), DEC-0040 (~3110 with amendment), DEC-0042 (~3580), DEC-0044 (~2920), DEC-0047 (~2090).
One-line shape: decision-field size spans two orders of magnitude (70 chars → 3500+ chars).

### C20. Consequences[] items embedding nested "filed as FGAP-NNN" / "FGAPs filed alongside this DEC" prose (N≥6)
Members + excerpt:
- DEC-0017 consequences: "FGAP cluster filed alongside this DEC: FGAP-029…, FGAP-030…, FGAP-031…, FGAP-032…"
- DEC-0025 consequences: "(FGAP-056 filed)", "(FGAP-057 filed; cross-decision with FGAP-037)", "(FGAP-058 filed)"
- DEC-0021 consequences embed cross-FGAP scope notes.
- DEC-0042 consequences include "Realizes the not-yet-built half of DEC-0038; the conversational step-through branch is FGAP-066; spec'd as FGAP-095."
- DEC-0015 consequences: long ninth-item documentation-discipline block "Filed as FGAP-027 (P3) for systematic tracking."
One-line shape: consequences[] used as auxiliary FGAP-filing notebook rather than effect enumeration only.

---

## Section 3 — Verbatim excerpts (3-5 per cluster)

### C2 excerpts (no options_considered)
- DEC-0011 decision: "pi-project does not ship default schemas or default block files. Users install desired schemas and starter blocks via an opt-in mechanism — concrete shape of the install mechanism is unspecified but the directional choice is final…"
- DEC-0018 decision: "Every implementation step (sub-section commit, sub-phase commit, fix commit, feature commit) requires THREE verification layers, all mandatory, none skippable on grounds of small change or obvious correctness…"
- DEC-0048 decision: "User directive (2026-05-26, verbatim): \"zero existing workflows are to be considered targets of any work…\""

### C3 excerpts (options populated, zero rejected_reason)
- DEC-0026 option 1: `{label: "3-digit canonical + per-block historical exception", description: "...", tradeoffs: "Drift remains visible as historical-not-canonical; per-block exception cataloged in config; future items per block follow declared width."}` — no `rejected_reason` field.
- DEC-0029 has 6 options ("`.context/`", "`.pi/`", "`.substrate/`", "`.canon/`", "`.arc/`", "Other user-chosen"); none carry `rejected_reason`; the `.pi/` option tradeoffs reads "Cannot use; already taken." which is rejection prose, but in `tradeoffs` not `rejected_reason`.
- DEC-0032 has 4 options including "Defer layer registry adoption until consumption (FGAP-052) lands" with tradeoffs "...conflicts with mandate-007 (no deferring)" — again in tradeoffs, not `rejected_reason`.

### C4 excerpts (options + rejected_reason populated)
- DEC-0044 option "pi-context" `rejected_reason`: "PACKAGE CYCLE — pi-jit-agents already depends on pi-context; pi-context importing pi-jit-agents (transitively, to call executeAgent) is circular. pi-context is the zero-@davidorex-dependency foundation. Hard-eliminated."
- DEC-0009 option "Subpath block names only (original FGAP-001 framing)" `rejected_reason`: "Heuristic prefers one storage primitive; subpath form would create a parallel ungated path for hierarchy expression that the closure-table primitive already handles."
- DEC-0040 option "Disciplined manual multi-surface sync" `rejected_reason`: "Proven to fail this very session — six surfaces drifted despite intent; N mutable stores drift by construction; cannot be zero-loss."

### C5 excerpts (enacted but enactment-tuple absent)
- DEC-0019 record ends: `"created_by": "human/davidryan@gmail.com"` — no `enacted_by`/`enacted_at` keys; status="enacted".
- DEC-0044 record: `"id": "DEC-0044", "created_at": "...", "created_by": "human/davidryan@gmail.com"` with status="enacted" but no enactment-tuple.
- DEC-0049: `"created_by": "human:davidryan@gmail.com", "created_at": "2026-05-26"` only.

### C6/C7 excerpts (writer-identity shape variance)
- DEC-0011 created_by="user", enacted_by="user".
- DEC-0018 created_by="human/davidryan@gmail.com", enacted_by="human/davidryan@gmail.com".
- DEC-0041 enacted_by="davidryan@gmail.com" (bare email).
- DEC-0048 created_by="human:davidryan@gmail.com" (colon).
- DEC-0014 created_by="agent/post-step-8.6-orchestrator".

### C8 excerpts (decision-as-question)
- DEC-0026 decision (full): "OPEN: padding convention to canonicalize across all block kinds. Mandate-compliant options surfaced in options_considered; user enacts."
- DEC-0007 decision opening: "Decision pending. The composition contract must specify: (1) ordering rules across context types; (2) deduplication when multiple entries pull the same item…"
- DEC-0033 decision: "OPEN: status-bucket normalization mapping. Mandate-compliant options below."
- DEC-0034 decision: "OPEN: conventions schema migration scope + sequencing. Mandate-compliant options below."

### C9 excerpts (consequences-as-supersession-prose)
- DEC-0006 sole consequence: "Superseded: off-by-one re-count of the substrate contract. Original framing claimed six discrete blocks while enumerating five (config + partitions + lenses + closure-table relations + per-item macros). On reflection no sixth block exists; the contract is five blocks. Filed under proliferation pressure during the heuristic-widening pass; retired without enactment."
- DEC-0010 sole consequence: "Superseded: the real concern (GitHub #3 folder placement) is already closed empirically by the POC's config.root field. The user/project/agent scope-layering expansion was theoretical embellishment from the heuristic-widening pass — not a question anyone asked. Mandates being user-scope is a fact, not a decision. Filed by lumping a closed folder-placement question together with scope-layering theory; retired without enactment."

### C10 excerpts (forward-DEC references)
- DEC-0002 decision: "executeAgent in pi-jit-agents (once parseModelSpec and classify dispatch move there per DEC-0003) enforces thinking=off…"
- DEC-0017 consequences final item: "DEC-0014 + DEC-0015 + DEC-0016 + DEC-0017 form the four-piece canon establishing the substrate operational contract…"
- DEC-0044 decision: "…homed at the DEC-0044 dispatch extension…" (self-reference) + cites JI-021/JI-010.

### C11 excerpts (in-field stacked revisions)
- DEC-0040 decision contains inline: "[Amendment 2026-05-21 — un-conflate the EXTENSION vs the CLAUDE CODE HARNESS]: precise three-layer scoping. (1) The EXTENSION (pi-context, loaded by the Pi runtime) owns the substrate + its capabilities…"
- DEC-0044 decision: "ENACTED (2026-05-26, narrowed 2026-05-26 per FGAP-112 working-out)" then mid-decision "Supersedes the prior wider 'wraps the pi-jit-agents library' framing of this decision (2026-05-26 enactment language)…"
- DEC-0003 context: "Widening 2026-05-26: empirical grep verified a SECOND parseModelSpec duplicate at packages/pi-workflows/src/step-monitor.ts:371 (used at line 270) — DEC-0003 originally said 'audit pi-workflows / if found consolidate'; this widening converts the audit-conditional into a confirmed-two-site cleanup."
- DEC-0047 decision opens: "ENACTED (2026-05-26), in code terms (the prior legislative/executive/judicial framing was thinking-scaffolding; the model below is the operative form). No genuine fork remained at settlement…"

### C14 excerpts (commit-reference shape variance)
- DEC-0004 references item: `{label: "Enacting commit — issue-023 implementation", commit: "1bc36ba"}` — uses dedicated `commit` field.
- DEC-0018 references item: `{label: "ff13ff2 false-green incident (committed broken code under pipe-mask exit code)", path: "git:ff13ff2"}` — uses `path` with `git:` prefix.
- DEC-0021 references item: `{label: "C.3 commit (atomic-boundary failure surface)", path: "git:d64cb33"}` — same pattern as DEC-0018.

### C15 excerpts (out-of-block-vocabulary IDs)
- DEC-0048 context: "the user grounded the project's actual intent (jit-agents user-intentions report analysis/2026-05-26-jit-agents-user-intentions.jsonl, JI-002…)"
- DEC-0049 decision opens: "User-stated (JI-001, verbatim, 2026-04-09): \"an 'agent' is the same thing whether it be used as a monitor or used in and by workflows.\""
- DEC-0044 decision: "JI-021 user verbatim 'orchestrator uses jit-agents directly'… JI-021 ('orchestrator uses jit-agents directly') honored literally for orchestrator + JI-010 ('jit-agents owns everything between I have a spec and I have a typed result')…"

### C19 excerpts (decision-field size extremes)
- DEC-0026 decision (full text, ~130 chars): "OPEN: padding convention to canonicalize across all block kinds. Mandate-compliant options surfaced in options_considered; user enacts."
- DEC-0042 decision opens (~3580 chars total): "Make /context start the single, always-safe, state-derived human entry point — the only bootstrap verb a user issues. It is impossibilization-by-design: there is no second user-sequenced step to misorder; the ordering lives inside start, derived from filesystem state (DEC-0040, nothing stored). (1) start is a STATE MACHINE that derives bootstrap state and falls through: NO_POINTER -> elicit dir name (suggest .context; never default — DEC-0015) then write pointer+dirs; NO_CONFIG -> elicit accept-all|step-through (DEC-0038 fork) then write config…"

### C20 excerpts (consequences-as-FGAP-notebook)
- DEC-0017 consequences item: "FGAP cluster filed alongside this DEC: FGAP-029 (bidirectional scoped traversal primitive — walk-ancestors / gather-by-relation), FGAP-030 (per-work-unit-kind context contract substrate), FGAP-031 (gather-execution-context composition primitive), FGAP-032 (item-level contextBlocks selectivity in pi-jit-agents driven by gather output)."
- DEC-0025 consequences item: "Macro library bootstrap surface for user-added kinds — drop-in macros + canonical-kind defaults + framework auto-discovery (FGAP-057 filed; cross-decision with FGAP-037)."
- DEC-0015 9th consequence: "Documentation discipline (binding for all phases of FGAP-026 closure + all future tool/primitive additions): the framework-side config-mutability + user-content-prose-staleness dual-nature MUST be surfaced in EVERY documentation layer touching substrate-location: (a) code comments / docstrings at resolveContextDir, context-init, context-migrate, .pi-context.json schema; (b) CLAUDE.md project conventions; (c) root + per-package READMEs; (d) skill-narrative.md files… Filed as FGAP-027 (P3) for systematic tracking."

---

End of survey.
