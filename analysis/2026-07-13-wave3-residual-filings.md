# Wave-3 residual filing candidates — prior-art search, class characterization, verdicts

Explore-before-file investigation for the four candidate filings surfaced by the wave-3 adversarial audits.
All substrate reads via bare `pi-context` ops against the active substrate; all code claims re-verified against
current main at read time (file:line anchors below are main, not the audit worktrees). Empirical claims marked
[re-run] were re-executed by this investigation; claims marked [audit] are the wave-3 audits' demonstrations
(scratchpad `wave3/audit-135.md`, `audit-135-fix2.md`, `audit-135-fix4.md`, `audit-138.md`), each anchored to
code mechanisms independently verified here.

## Verdict summary

| # | Candidate | Verdict | Payload |
|---|---|---|---|
| 1 | dryRun preview-optimism residual set (3 instances) | **file-new** (one class-level gap) | `filings/dryrun-preview-covered-checks-residuals.json` |
| 2 | Op-layer silent unknown-param acceptance | **file-new** | `filings/op-param-silent-acceptance.json` |
| 3 | Glue-guard shell-grammar under-block R1+R2 | **file-new** (one gap, two instances; relate to FGAP-120/151/147/149/089) | `filings/glue-guard-shell-grammar-under-block.json` |
| 4 | Prompt-field spec-dialect divergence (shifted from the remembered `inline:` form) | **file-new** (instance of the FGAP-129 dual-parser class) | `filings/prompt-field-dialect-divergence.json` |

Payload dir: `/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/d3030496-e4e1-4bfa-8df1-1df86bac518a/scratchpad/filings/`

---

## 1. dryRun preview-optimism residual set

### Prior art (searched: title/description matches `dryRun|dry-run|preview`, `invariant gate|CONVERGE_AFTER_OPS|write-pipeline`)

- **FGAP-066** (closed) — the class precedent: update `--dryRun` over-reported the catalog-ahead outcome; fixed by computing the precise outcome read-only. `canonical_vocabulary: exact dry-run outcome preview`.
- **FGAP-148** (closed by TASK-135) — birth-relations preview counter-endpoint/cycle coverage. Its description states verbatim: "Known residual instances of the class (new-item endpoint-kind self-skip; the write-pipeline delta-scoped invariant gate running live-only; the upsert item-arm's narrower item-level coverage) are **tracked as their own filing**, not by this gap" — i.e. the residuals are anticipated as a filing that does not yet exist. Sweep confirms: no other framework-gaps / tasks / issues item covers any of the three instances.
- Adjacent closed: FGAP-012 (dryRun param asymmetry), FGAP-022/024 (CLI preview absence), FGAP-064 (flag casing) — different aspects, none covers preview-vs-live coverage.

**Not already tracked → file-new.**

### Code verification (main)

- **(a) new-item endpoint-kind self-skip**: `packages/pi-context/src/context-sdk.ts:1815-1827` — kind checks are loc-gated (`if (parentLoc && rt.source_kinds …)` :1819, `if (childLoc && …)` :1824); the unwritten item resolves to no loc at preview, so the check self-skips. [audit] audit-135 P8: filing a task as TARGET of a `target_kinds [issues]` relation — preview exit 0 `would append…`, live exit 1 kind-reject.
- **(b) write-pipeline invariant gate live-only**: `packages/pi-context/src/ops-registry.ts:2922-2935` (`CONVERGE_AFTER_OPS`, 12 mutation ops) and :3033-3059 — the wrapper sets `pre = isDryRun ? null : invariantSnapshot(cwd)` (:3037-3038) and `finish` returns immediately under dryRun (:3041), so the delta-scoped error-severity refusal (:3048-3055) runs on live writes only. [audit] audit-135-fix2 §3, STOCK catalog: `append-relation --dryRun` (VER passed → non-completed task, `verification-passed-task-complete`) exit 0 would-append; identical live call exit 1 refused, byte-restored; same pair for `append-relations`. audit-135 P13: same mechanism for a bare filing.
- **(c) upsert item-arm narrower coverage**: `packages/pi-context/src/block-api.ts:1644-1656` — upsert's dryRun branch validates the stamped prospective whole file but returns before `writeTypedFile` (:1658); the diff-scoped rhetorical-criteria enforcement (:1054-1075) and the envelope `schema_version` stamp (:1023-1047) sit ABOVE writeTypedFile's own dry-run boundary (:1077-1083), so the append preview (which rides writeTypedFile) runs them and the upsert preview does not. On a schema declaring `x-rhetorical-criteria`, live upsert refuses what `upsert --dryRun` accepts while `append --dryRun` refuses it. Code-read finding (audit-135 M1), mechanism re-verified here line-by-line.

All three divergences are disclosed on the shipped covered-checks doc surfaces (wave-3 text-fix rounds; audit-135-fix4 §3 found zero remaining accept-direction equivalence claims).

### Class characterization

All three are instances of the established **exact dry-run outcome preview** class (FGAP-066 → FGAP-148 lineage): a preview that runs a covered subset of the live gate reports would-write for a write the live run refuses. Instance (b) is the WIDEST instance — a property of the ops-wrapper layer spanning all 12 `CONVERGE_AFTER_OPS` ops (pure edge ops included), not only filing previews — and its fix locus (the wrapper) differs from (a)'s (the preview gate) and (c)'s (the upsert arm). Considered filing (b) separately; decided against: the three share one class vocabulary, one acceptance shape (preview reports the live outcome, or the divergence is disclosed), and FGAP-148 anticipates a single residual filing. The payload characterizes (b)'s wider span explicitly so an implementing task can split if the mechanism warrants.

**Verdict: file-new — one class-level gap carrying the three instances.**

---

## 2. Op-layer silent unknown-param acceptance

### Prior art (searched: `additionalProperties|unknown param|unknown flag|param validation`, `unknown parameter|silently ignored|undeclared param|op layer`)

- **FGAP-064** (closed) / **FGAP-032** (closed) — CLI **parse-layer** flag handling (kebab-case aliasing, id-flag aliasing). The CLI layer REJECTS unknown flags (`cli.ts:332`, UsageError exit 2); these gaps are about flag-name mapping, not op-layer acceptance. Distinct layer.
- **FGAP-014/097/099** — `additionalProperties` on block/config schemas, not op parameter schemas. Distinct surface.
- **FGAP-144** (closed by TASK-131) — the forcing context: the validator block-axis work had to add explicit run()-gate rejections because the op layer would otherwise silently always-empty-filter. The generic gap itself is unfiled.
- Second sweep (`unknown parameter|silently ignored|undeclared param|op layer`): zero hits.

**Not already tracked → file-new.**

### Code verification (main)

- The gap is self-documented: `packages/pi-context/src/ops-registry.ts:550-558` — "the op layer itself performs NO schema validation on params (registerAll passes them straight into run(), and TypeBox Type.Object does not set additionalProperties:false), so a caller reaching run() directly or through a permissive tool dispatch would otherwise get a silently-always-empty filter instead of an error."
- `rejectBlockNarrowing` (:560-566), called at :2476 (`context-validate-relations`) and :2677 (`context-roadmap-validate`) — the TASK-131 hand-added spot rejection, one param on two ops.
- `registerAll` (:3089-3118) — `op.run(ctx.cwd, params as never, dctx)` (:3111): params pass straight through, no check.
- CLI contrast: `packages/pi-context-cli/src/cli.ts:202` (contract comment) + :332 (`throw new UsageError('unknown flag: ' + tok)`) — parse-time rejection covers the CLI surface only.

### Class characterization

The specific symptom (an undeclared param silently ignored) is an instance of the general class: **the op run() boundary has no input-contract enforcement** — per-op hand-rolled guards (rejectBlockNarrowing) patch single param×op combinations while every other combination inherits silent acceptance. Sharpest consequence: a misspelled optional param flips semantics silently — `dryrun` for `dryRun` on any mutation op runs the LIVE write the caller meant to preview (the wrapper reads `params.dryRun === true`, ops-registry.ts:3037); a stray filter param yields unfiltered results read as filtered. Exposure: in-pi LLM tool dispatch (the primary caller; hallucinated/misspelled keys are the normal failure mode) and programmatic run() callers; the CLI is covered at parse. Filed at the class level (op-boundary validation), with unknown-param acceptance as the triggering instance.

**Verdict: file-new.**

---

## 3. Glue-guard shell-grammar under-block residuals R1+R2

### Prior art (read: FGAP-120, FGAP-151, FGAP-147, FGAP-149, FGAP-089; searched: `backslash|continuation|command substitution|backtick|line-oriented` → zero hits)

- **FGAP-120** (closed) — glue guard quote-blindness (intra-line), over-block. **FGAP-151** (closed by TASK-138) — glue guard multi-line quote facet, over-block.
- **FGAP-147** (closed) — commit guard redirect/heredoc facet; names the class: "shell-command classification by token inspection without shell-grammar awareness". **FGAP-149** (identified, open) — commit guard multi-line-quote facet.
- **FGAP-089** (identified, open) — target-substrate scope axis, orthogonal (fires on the WRONG substrate, not on the wrong command shape).

Every filed facet of the class is an OVER-block (fail-closed, false-positive) dimension, or the commit guard's artifact. No item covers the glue guard's UNDER-block (fail-open) dimension. **Not already tracked → file-new** (relate to the family, not refile it: R1/R2 are a new facet on the glue artifact, the same granularity at which FGAP-120/151/147/149 were each filed).

### Code verification (main) + re-run

Live guard read in full: recognizer boundary class `(^|[;&|]| )pi-context ` at `.claude/hooks/block-pi-context-glue.sh:42` — omits `(` and backtick (R2). Four branches are `grep -Eq` (line-oriented) at :50/:55/:66/:71 — each needs the anchor AND the metacharacter on one physical line (R1). The :39 slurp quote-strip is not implicated (R1 cases carry no quotes; R2 evasion holds unquoted).

[re-run] Verified against a COPY of the live main guard (token-rehydrated runner, `scratchpad/glue-verify/`):

```
PASS exit=0 want=0  R1 continuation pipe (fail-open if exit 0)      # pi-context read-block --json \<newline>| jq .
PASS exit=2 want=2  R1 control one-line pipe (true positive)
PASS exit=2 want=2  R1 sibling pipe-before-backslash
PASS exit=0 want=0  R2 $() substitution with pipe (fail-open if exit 0)   # echo $(pi-context read-block --json | jq .)
PASS exit=0 want=0  R2 backtick substitution with pipe (fail-open if exit 0)
PASS exit=2 want=2  R2 control bare op pipe (true positive)
```

(`want=0` on the R1/R2 rows encodes "the fail-open reproduces": a genuine glue command exits 0 where the discipline requires exit 2.) Matches audit-138 Leg 1d + Leg 3 exactly.

### Class characterization

Both instances are the glue guard's expression of the FGAP-147-named class, in the fail-open direction: the recognizer and branches see physical lines and a fixed boundary set, not logical commands. Filed as ONE gap: same artifact, same failure direction, one fix locus (logical-command normalization ahead of the branch regexes + boundary-class widening). Severity bounded by the enforcement posture (lazy cooperative agent, not adversary; continuations and substitution-wrapped ops are rare emissions) → P3 recommended.

**Verdict: file-new (one filing, two instances).**

---

## 4. Prompt-field spec-dialect divergence

### Prior art (searched: `inline|resolvePromptField|prompt`, `spec dialect|two spec pipelines|dual-parser|agent.yaml`, decisions block, tasks block)

- **FGAP-129** (closed by TASK-104) — "Template-resolution divergence between the two spec pipelines": the established dual-parser divergence class, on the template-REF-resolution axis. Closed by converging that axis only; prompt-field semantics untouched.
- No item covers prompt-field handling. **Not already tracked → file-new** (instance of the FGAP-129 class on a different axis).

### Code verification (main) + re-run — the candidate's remembered shape has SHIFTED

The remembered claim ("one honors an `inline:` prefix form the other does not") does not match current main at the resolvePromptField level: both implementations are now logic-identical for the object `{template}` form and the string path-heuristic (`pi-jit-agents/src/agent-spec.ts:26-37`; `pi-workflows/src/agent-spec.ts:28-50`). The REAL current divergences sit downstream and in the object dialect:

1. **Inline task STRING — jit honors, workflows throws.** jit keeps it as `taskPrompt` (agent-spec.ts:258) and renders it as a string (`compile.ts:574-575`, renderTemplate/renderString). workflows conflates it into `taskTemplate` (`agent-spec.ts:125`, `task.template ?? task.inline`) and `compileAgentSpec` renders `taskTemplate` via `renderTemplateFile` = `env.render(name)` (`step-shared.ts:212-214`; `template.ts:94-100`) — the inline text is treated as a template FILE NAME; the executor always supplies a real env (`workflow-executor.ts:777/:786`).
2. **Object `{ inline: "…" }` — silently dropped by BOTH** (only the `template` key is handled; the object falls through to `{}`), yet pi-workflows' own integration test authors exactly that dialect (`integration.test.ts:543`) — the declared task prompt vanishes from the compiled dispatch with no error (the step falls back to serialized input + output instructions).
3. System-side is asymmetric: workflows renders `system.inline` correctly as a string (`step-shared.ts:206-208`) — the conflation is task-side only.

[re-run] tsx probe (`scratchpad/glue-verify/prompt-divergence.ts`), same spec text through both parsers on current main:

```
A-inline-string wf:  taskTemplate="Analyze the input and report your verdict as prose." systemPrompt=undefined
A-inline-string jit: taskPrompt="Analyze the input and report your verdict as prose." taskPromptTemplate=undefined
B-inline-object wf:  taskTemplate=undefined systemPrompt=undefined
B-inline-object jit: taskPrompt=undefined taskPromptTemplate=undefined
A compile (wf): THROWS — template not found: Analyze the input and report your verdict as prose.
```

### Class characterization

Instance of the dual-parser spec-dialect class FGAP-129 instantiated for the template axis; this is the prompt-field axis. A spec author cannot write one `.agent.yaml` that means the same thing on both dispatch surfaces: inline-task specs hard-throw as workflow steps while compiling on jit dispatch, and the object inline dialect dispatches an under-briefed agent silently on both. The silent-drop leg is the sharper defect (invisible; a shipped test carries it). P2 recommended.

**Verdict: file-new.**

---

## Method notes

- Substrate ops used: `read-block-item` (FGAP-066/089/120/144/147/148/149/150/151/152-absence), `filter-block-items` (7 sweeps across framework-gaps/tasks/issues/decisions), `read-schema` (framework-gaps item shape).
- FGAP-151 is the highest existing gap id (FGAP-152 read returns null).
- Payloads follow the FGAP-144/148 register: terse, evidence-cited, class-characterized; status `identified`; no prohibited retrospective-narration patterns.
- The wave-3 audit reports live in the session scratchpad (ephemeral); the load-bearing empirical demonstrations they carry are either re-run here (R1/R2, prompt divergence) or reproduced above with their code mechanisms independently verified on main (dryRun instances), so this report is the durable grounding the payloads cite.
