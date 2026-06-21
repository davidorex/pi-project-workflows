# `.workshopping` → pi-workflows execution spec (candidate, for evaluation)

**Status:** candidate design, for consideration. Not approved to build. A
four-lens independent evaluation (pi-workflows API doability; ecosystem fit;
architecture soundness; build-readiness) has run; this revision closes that
evaluation's six blocking/major conditions and its should-do items (see the
"Evaluation-closure record" at the foot of this file). It remains a candidate
for build approval, not an approved build plan.

**Provenance.** Derived from an actionable proposal to run the WASC
draft-generation sequence as a pi-workflow over the `.workshopping` substrate,
then corrected against a doability audit that checked every concrete form
against the real pi-workflows source (`packages/pi-workflows` —
`src/types.ts`, `workflow-spec.ts`, `step-command.ts`, `step-agent.ts`,
`expression.ts`, `checkpoint.ts`, bundled `do-gap.yaml`) and the workshop /
substrate / production code. The corrected forms below replace three forms in
the original proposal that would have failed or silently misbehaved (flagged
inline as **[audit]**). Items the audit identified as judgment calls are listed
under "Open questions." A subsequent four-lens independent evaluation then
revised the spec further — descoping the retry mechanism, replacing the inline
`draft_state` threading with shared-file path-threading, and correcting several
overstatements; those revisions are recorded in §10 ("Evaluation-closure
record") and carry their own **[audit]** notes inline. A further empirical pass
then **ran** pi-workflows (rather than reading its source) — recorded in the
companion `WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md`; it corrected one form
the source-only audit had blessed but that does not actually run (the agent
step's `input` must be an object, not a whole-value string) and confirmed the
remaining load-bearing primitives by execution. Those corrections carry
**[runtime-verification]** notes inline.

This is the **execution** spec; `WORKSHOPPING-SUBSTRATE-SPEC.md` is the **data**
spec it consumes.

---

## 1. Recommendation

Use `.workshopping` as the **prompt registry** for a new pi-workflow that runs
the WASC draft-generation sequence. `.workshopping` remains the source of truth
for prompt content; pi-workflows would serve as the resumable execution harness.

**What is built and what is not.** The data layer is materialized and
parity-gated: `.workshopping/` holds 14 specs / 181 fragments / 266 edges, and
the §4 byte-equivalence gate passes 14/14 (`verify-render-parity.py`, commits
`5a8242c` / `c076050`). The execution layer is **unbuilt**: the workflow YAML
and the two bridge scripts named below do not yet exist. The YAML is the thin
part; the two bridge scripts (`render_from_substrate.py`,
`apply_from_substrate.py`, §5) are the real work — and they are net-new code
(§8 lists them as build items), not orchestration of something already running.
This spec uses the conditional/future tense for the execution layer for that
reason.

**Run surface — no turnkey CLI (verified by execution).** pi-workflows has no
`bin`; a workflow runs only inside a live `pi` session (`/workflow run <name>`,
via the `pi.extensions` `workflow-execute` tool) or by a hand-written
programmatic harness calling `executeWorkflow` from `dist/` (the export set +
the `ctx`/`pi` handles it needs are documented in the companion
`WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md`). The default test suite does
**not** cover the end-to-end executor (it is `RUN_INTEGRATION`-gated, "pi not
available"); the orchestration-loop guarantee rests on the gated 36-test
executor suite plus the A1–A7 runs recorded in that companion (all pass). So
"run as a pi-workflow" means drive it in a pi session or via that harness —
there is no shell command to point at a `.workflow.yaml`.

**Build precondition (DEC-0040).** Treat the substrate as prompt source of
truth only behind a green 14/14 `verify-render-parity` run — that
byte-equivalence predicate is what justifies routing rendering through
`.workshopping` rather than the snippets at all. Re-run it before building (and
after any fragment/spec edit) so the registry the workflow consumes is the
proven-equivalent one.

**Runtime precondition (DB/env).** The grounding build (`build_grounding`) needs
the running Chiway dev Postgres reachable and `DATABASE_URL` present in the pi
process environment. Absent either, the first `render` step fails as an opaque
non-zero command exit (the Django error surfaces only on the command's stderr),
not as a workflow-level diagnostic. The `call` (agent) step additionally needs a
reachable model backend in the pi process (verified reachable here: openrouter
via `pi`); absent it, only the command/transform/gate legs run.

- Do **not** use the existing sample workflows.
- Do **not** use the bundled generic pi agents as the WASC drafting agents.
- Do **not** write generated draft outputs back into `.workshopping` — generated
  outputs live in the workflow run state / artifacts.

Division of responsibility:

```
.workshopping            = what to ask
Django / workshop scripts = how to render and validate
pi-workflows             = when to run, resume, retry, and summarize
```

pi-workflows supplies what the current manual loop lacks: checkpoint/resume
after each spec, durable run state, repeatable sequence execution, parser-gated
failure with a clear failure location, a final completion object, and artifacts
for rendered prompts and raw responses. `.workshopping` supplies what
pi-workflows must not own: prompt text, prompt decomposition, grounding
sections, output contracts, production parser bindings, migration provenance.

Caveat on "clear failure location" (**FGAP-165**): an empty / zero-token agent
dispatch is reported by the harness as a *success*, so an empty LLM response
does not fail at the `call` step — it surfaces one step later as an
`apply`-step parse failure, misattributing the failure to the parser rather
than to the empty generation. The failure-location benefit holds for genuine
parser/catalogue rejections; this one case is an exception to keep in mind when
reading a failed run.

Command steps run unrestricted shell, which bypasses DEC-0014's
agent-tool-authorization model (where LLM action is confined to declared
tools). That is a **deliberate** fit here, not an oversight: the render and
apply legs are a deterministic Django pipeline, not LLM-driven action, and the
bundled `do-gap.workflow.yaml` uses command steps the same way (its run-checks
leg). Only the `call` leg is an agent step.

The flow per spec:

```
.workshopping prompt-spec/fragments
        ↓  render prompt for one spec (Django + production grounding), reading
           the prior step's immutable draft version by path
        ↓  LLM returns strict JSON
        ↓  production parser validates it (rejects on parse/catalogue failure)
        ↓  parsed output is merged and written as a NEW immutable draft version
        ↓  that version's path is emitted; the next spec's render reads it
```

The draft is threaded **by path** (a versioned file), not as an inline JSON
blob on argv — see §4/§5 for the rationale (ARG_MAX, idempotent resume,
single-writer).

## 2. `.workshopping` fields the workflow consumes

| field | use |
|---|---|
| `prompt-spec.order` | execution order |
| `prompt-spec.spec_key` | step identity |
| `prompt-spec.fragment_refs` | ordered prompt-assembly list |
| `prompt-spec.grounding_sections` | runtime grounding to build |
| `prompt-spec.parser` | production parser to validate against |
| `prompt-spec.output_schema` | (optional) JSON Schema for the agent step's typed-flow gate |
| `prompt-spec.deps` | sanity check against `order` |
| `prompt-fragment.body` | actual prompt text |
| `prompt-fragment.kind` | rendering role |

**[audit F9]** `prompt-fragment` has no `section` field; section/grounding
binding is encoded in the fragment `id` (e.g. `FRAG-gb-school`) + `kind` + the
spec's `grounding_sections`.

## 3. Sequential execution

Run the 14 specs in `order`; do not start with DAG parallelism (later prompts
consume the evolving draft, and `order` is the safest contract):

```
narrative-draft · propose-domain-alignment · propose-milestones ·
draft-success-criteria · decompose-action-steps · propose-assignments ·
propose-responsibilities · propose-timelines · propose-step-resources ·
propose-evidence · suggest-feedback-channels · bind-measurement-channels ·
propose-accreditation-standards · propose-review-loop
```

**[audit] How the sequence is actually produced.** The runtime does **not** use
the pure DAG planner to order steps. It uses `buildConservativePlan`
(`workflow-executor.ts`), which sequences steps in **declaration order**;
`dag.ts` documents that the pure DAG is not used at runtime. So: declaration
order in the YAML sequences the 14 specs, and the `draft_path` expression
threading (each render reads the prior apply's emitted draft version, §4)
carries the **data flow**, not the ordering. This is more robust than
DAG-inference would be — a dropped or mistyped data reference still runs in
declaration order, surfacing only as a downstream data error rather than a
reordering. Declare the specs in `order`; thread `draft_path` for data.

## 4. The per-spec workflow shape (corrected canonical form)

Each spec is a render → call → apply group, mirroring the canonical bundled
`do-gap.workflow.yaml` (the template this form follows: `input` as JSON Schema
directly, `output: { format: json }` on command steps, `| shell` for JSON in a
shell arg, an agent step between two command steps). The draft is threaded **by
path** — each `apply` writes a NEW immutable versioned draft file and emits its
path; the next render reads that path. The verified form:

```yaml
input:                              # [audit F1] input IS the JSON Schema; no nested `schema:`
  type: object
  required: [seed]
  properties:
    seed: { type: string }
    draft_path: { type: string }    # optional: path to an initial draft version;
                                    # the first render falls back to the empty
                                    # draft when absent

steps:
  render_narrative_draft:
    command: >
      python prompt-workshop/dispatch/render_from_substrate.py
      --spec-key narrative-draft
      --seed "${{ input.seed }}"
      --draft-path "${{ input.draft_path }}"
    output: { format: json }       # [audit F2] required, else .output.prompt is undefined

  call_narrative_draft:
    agent: workshop-json-responder
    input: { prompt: "${{ steps.render_narrative_draft.output.prompt }}" }   # object form REQUIRED — a bare string input is rejected at parse ("step input must be an object"); the agent's task template renders {{ prompt }} (§6; runtime-verification A6)
    output: { format: json, schema: <prompt-spec.output_schema path> }

  apply_narrative_draft:
    command: >
      python prompt-workshop/dispatch/apply_from_substrate.py
      --spec-key narrative-draft
      --raw-json '${{ steps.call_narrative_draft.output | shell }}'
      --draft-path "${{ input.draft_path }}"
    output: { format: json }        # emits { ..., "draft_path": "<run-dir>/draft-after-narrative-draft.json" }
```

The next spec threads the **prior apply's** emitted draft path, not the original
input:

```yaml
  render_propose_domain_alignment:
    command: >
      python prompt-workshop/dispatch/render_from_substrate.py
      --spec-key propose-domain-alignment
      --seed "${{ input.seed }}"
      --draft-path "${{ steps.apply_narrative_draft.output.draft_path }}"
    output: { format: json }
  # … call_ … then apply_propose_domain_alignment reads the same prior path and
  #   emits draft-after-propose-domain-alignment.json; spec 3 reads THAT, etc.
```

**[audit] Why path-threading, not inline `draft_state` JSON.** An earlier form
threaded the whole accumulating draft as an inline `--draft-state '${{ … | shell }}'`
argv string on every step. That is replaced because:
- **ARG_MAX.** The draft grows across all 14 steps; passed twice per step on a
  single `sh -c` argv (`step-command.ts` spawns `sh -c` with no stdin —
  `stdio ['ignore','pipe','pipe']`), the accumulated draft risks `E2BIG`. There
  is no stdin channel to fall back to, so argv is forced; path-threading keeps
  the draft off argv entirely.
- **Reuse of parity-validated code.** The bridge scripts load/save the draft
  with the same file-based `load_draft`/`save_draft` the parity-gated
  `render.py`/`apply.py` already use, rather than a new inline-string ingestion
  path that would diverge from the proven contract.
- **Idempotent resume.** Each apply writes a NEW immutable version
  (`draft-after-<spec_key>.json`); on resume the re-run of a failed step reads
  the prior step's immutable version, so the append-style `MERGE_RULES` cannot
  duplicate rows (re-running against the same input produces the same output).
  `apply_from_substrate.py` is the **single writer** and must NOT mutate a
  shared `current-draft.json` in place — mutating a shared file would make
  resume diverge (disk = last run, run-state = checkpoint) and make append
  merges accumulate.

Three corrections (carried from the audit) that make this run:
- **[audit F1]** `input` is the JSON Schema directly (no `input.schema:` nesting).
- **[audit F2]** every `command` step that exposes `.output.<field>` must declare
  `output: { format: json }` and print one JSON object to stdout; the default
  output is `{text: stdout}`, so a missing `format: json` makes
  `${{ ...output.prompt }}` resolve to `undefined` silently. (Stdout purity is a
  build contract on the bridge scripts: all diagnostics go to stderr; the
  command executor falls back to `{text:…}` on non-JSON stdout without failing,
  so a stray stdout print silently breaks `.output.<field>`.)
- **[audit F3]** JSON passed inside a single-quoted shell arg uses `| shell`
  (compact, sh-escaped), never `| json` (pretty-printed, unescaped — the first
  apostrophe in draft prose breaks the command). This applies to the
  `--raw-json` payload; `--draft-path` is a plain path, not JSON.
- **[runtime-verification] YAML authoring rule.** A `command:` value containing
  literal `{` / `"` (inline JSON) fails YAML parsing ("nested mappings not
  allowed in compact mappings"). Write any such command as a single-quoted or
  block (`|`) scalar. Path-threading keeps most JSON off the command line (only
  `--raw-json` carries JSON, via `| shell`), but any inline-JSON command must
  obey this.

**[audit] Inputs dropped: `school_slug`, `cycle_id`.** This is a single-tenant
dev run. `get_tenant_school()` is hardcoded to `chiway-repton-xiamen` (it takes
no parameter), and `cycle_id` is consumed nowhere in the pipeline. Declaring
them as required inputs would demand values the scripts ignore (`cycle_id`) or
cannot honor (`school_slug`). They are removed; `seed` stays, and the optional
initial `draft_path` replaces the former `initial_draft_state`. Parameterizing
the tenant (a `get_tenant_school(slug)` argument) and threading `cycle_id` into
`build_grounding` is future work if multi-tenant dev runs arrive.

## 5. Support scripts (the workflow holds no rendering logic)

**Both scripts are net-new** (they do not exist yet; `dispatch/` currently holds
`render.py`, `apply.py`, `sequence.py`, `_workshop.py`, `decompose.py`,
`verify-render-parity.py`). They are a thin re-parameterization of the existing
`render.py` / `apply.py` — reusing `build_grounding`, `PromptSanitizer`,
Django's `Template`, the per-`spec_key` `MERGE_RULES`, `get_parse_function`, and
`parse_fn(school=…, grounding=…)` — re-shaped to read the substrate (not the
snippets) and to thread the draft by path. The reuse is real and the helpers are
all wired; the **scripts themselves are the build work**, not the YAML.

### `prompt-workshop/dispatch/render_from_substrate.py`
1. Read the `.workshopping` substrate by **direct JSON read** of
   `prompt-spec.json` / `prompt-fragment.json` (see §7 for why a direct read
   over a native `block` step).
2. Load the `prompt-spec` by `spec_key`; resolve `fragment_refs` **in array
   order** (the array is authoritative for composition order — DEC-0005 /
   FGAP-005, §7); load the referenced `prompt-fragment` bodies.
3. Build runtime grounding with the existing production code (`build_grounding`
   + `PromptSanitizer`), reusing `_workshop.setup_django` / `get_tenant_school`
   / `load_draft` / `flatten_draft_for_grounding`. The draft it grounds against
   is read from `--draft-path` (the prior step's immutable version), or the
   empty draft when no path is given.
4. Assemble the body as `"\n".join(fragment.body for id in fragment_refs)` and
   render once through Django's `Template` — the substrate path is proven
   byte-equivalent to the snippet path by the 14/14 `verify-render-parity` gate.
5. Print one JSON object on stdout (diagnostics to stderr):
   `{ "spec_key", "prompt", "fragment_refs", "grounding_sections", "prompt_hash" }`.

### `prompt-workshop/dispatch/apply_from_substrate.py`
1. Read the substrate; load `prompt-spec.parser`.
2. **[audit F8]** Rebuild grounding (as render does, against the same
   `--draft-path`) and pass it to the parser — the production parsers do
   catalogue checks via `audit_prefill_flags(build_catalogue_union(grounding))`, so a
   bare `parse(text)` fails. Reuse `_workshop.get_parse_function` (or resolve
   `parser` from the spec) + the per-`spec_key` merge-rule registry in
   `apply.py`.
3. Reject invalid JSON / invalid catalogue references / parser failures
   (non-zero exit → the workflow halts at this step, resumable — see §5a).
4. Merge parsed output into the draft, then **write a NEW immutable versioned
   draft file** for this spec (e.g. `<run-dir>/draft-after-<spec_key>.json`).
   This script is the **single writer**; it must NOT mutate a shared
   `current-draft.json` in place (that would break resume idempotency, §4).
5. Print one JSON object on stdout (diagnostics to stderr):
   `{ "spec_key", "parsed", "draft_path", "parser", "status" }` — where
   `draft_path` is the version just written, which the next render reads.

The parser remains the authority; JSON Schema (§6) is an earlier, secondary gate.

## 5a. Parser-rejection recovery contract

Parser rejection is the **expected** failure mode — parser-gated drafting is the
whole point — so its recovery path is defined here rather than left implicit.

- **On rejection:** `apply_from_substrate.py` exits non-zero → the step's
  `state.status` becomes `failed` and the workflow halts at that step
  (`workflow-executor.ts`). No new draft version is written by the rejecting
  apply (it rejects before the write in step 4), so the prior immutable version
  remains the latest good draft.
- **Resume** re-runs the failed step from that prior immutable version. Because
  the failed apply committed no new version and each apply reads an immutable
  input, the re-run is **idempotent** — there is no rollback to perform (the
  shared-file mutation that would otherwise need rollback does not happen, by
  the single-writer / versioned-file rule in §4).
- **Operator correction before resume:** the human edits the offending substrate
  prompt (fragment/spec body), or re-seeds, or skips the spec — then resumes (or
  re-dispatches). The rejected response is not silently retried in-harness
  (in-harness parser-gated retry is unbuildable today — §7).

## 6. The agent: `workshop-json-responder`

Minimal and WASC-agnostic — the intelligence lives in `.workshopping`, not the
agent. System role: *"Given a fully rendered prompt, return the requested JSON
object and nothing else."*

**[audit F4 — corrected by runtime verification]** The agent step's `input` must
be a key/value **object** (`input: { prompt: "${{ … }}" }`); a bare whole-value
string input is **rejected at parse** with "step input must be an object" — the
source-only audit's "pass a whole-value string" option does not run
(runtime-verification A6). So the agent carries a one-line task template that
renders the field — `{{ prompt }}` — and the step passes `input: { prompt: … }`.
Declare `output: { format: json }` (plus a `schema` when available) so the step
parses and validates the response and the "raw JSON only" instruction is
appended; JSON auto-parse into typed output is execution-verified (A6). The
`schema` validation runs **after** the generation completes (FGAP-142) — see §7
for what that gate does and does not buy.

## 7. Use of pi-workflows primitives (buildable items; exact syntax to confirm at build)

These primitives exist and fit; their literal YAML is to be confirmed against
the cited source during build. The retry primitive that an earlier draft
recommended here is **not** buildable today and has been removed (see "Retry:
unbuildable" below).

- **Typed-flow gate (FGAP-142 — accurately scoped).** Binding each spec's
  `prompt-spec.output_schema` as the agent step's `output.schema` does validate
  the LLM JSON against the schema, but **after** the generation runs
  (`step-agent.ts` validates POST-execution — after the tokens are spent), not
  before. It is one step earlier than the parser (it rejects at `call`, before
  the `apply` subprocess spawns), which is useful — but it is **not** "for free"
  and it cannot prevent a schema-violating generation, nor is it
  StructuredOutput-tool-forcing. Keep it as a slightly-earlier secondary gate;
  the parser remains authoritative.
- **Built-in run state alongside the tracked captures (see §7a).** pi-workflows
  persists each step's output to the run dir and supports declarative
  `artifacts:` (create-handoff.workflow.yaml is the live example) + a
  `completion:` block (do-gap.workflow.yaml is the live example). Use these for
  transient run state and checkpoints; for the **forensic record**, see the
  artifact-home rule in §7a — the existing tracked `outputs/<timestamp>/`
  captures are not replaced.
- **Input picker.** A substrate-sourced `input.<field>.source` picker is
  buildable (do-gap.workflow.yaml uses one) for live selection — but pickers
  require **interactive mode** (they return null with a warning under `!hasUI`),
  so a headless / CI dispatch cannot rely on one. (Note this harness no longer
  declares a `cycle_id` input — §4 — so there is no picker for it; the picker
  primitive is recorded here for any future substrate-sourced input such as a
  seed selector.)

**Retry: unbuildable in-harness today (resolves the §9 open question to
fail-and-resume).** An earlier draft recommended wrapping render→call→apply in a
`loop` step with `maxAttempts` to "retry per prompt until the parser passes."
That does not work and is removed:
- In `step-loop.ts`, loop sub-steps execute only `gate` / `transform` / `agent`
  types; a `command` sub-step hits the final `else { continue }` and is
  **silently skipped**. A loop-wrapped render→call→apply would therefore re-run
  only the agent `call` leg — re-calling the LLM with **no re-render and no
  re-validate** — a silent no-op retry, the same silent-misbehavior class as the
  F2 trap. This is **confirmed by execution** (runtime-verification A7: a loop
  with a `command` sub-step ran to `completed`, but the sub-step's sentinel file
  was never written), not merely inferred from source.
- `LoopSpec` has **no condition-based termination** (ecosystem gap **FGAP-140**):
  it terminates by count (`maxAttempts`) or by a `gate` sub-step with
  `onPass:break`, not by an until-predicate. "Retry until the parser passes" is
  exactly the not-yet-built pattern the harness owner has already filed.

So the real failure model is **fail-and-resume**: a parser rejection makes the
`apply` command exit non-zero → the step fails → the workflow halts there;
**resume** re-runs that step (§5a). In-harness parser-gated retry is **blocked
pending an ecosystem change** — command-in-loop execution and/or a loop
until-predicate (FGAP-140). The do-gap precedent's agent-step native
`retry: {maxAttempts, onExhausted}` self-corrects the agent leg only; it does
not re-run the render/apply command legs, so it does not express the
parser-gated triad retry either.

**Ordering authority (DEC-0005 / FGAP-005).** This harness relies on
`prompt-spec.fragment_refs` (an ordered ref-array) being authoritative for
composition order. That matches the ecosystem's enacted stance: FGAP-005 names
`fragment_refs` verbatim as the canonical "ordered ref-array, authoritative by
design" case, backed by DEC-0005 (the convergent-sequence field-kind under
merge). One caveat FGAP-005 also records: concurrent reorder of `fragment_refs`
does not converge — acceptable here because the workshop is single-writer, worth
noting if that ever changes.

**[audit F11 — re-cut] Substrate reads live in the Python scripts by direct JSON
read — pointer-independent by design.** The scripts read `.workshopping/*.json`
directly, which works regardless of which substrate the `.pi-context.json` active
pointer names. This is deliberate: the steady-state pointer is `.context` (the
project's own substrate), and `.workshopping` is a build artifact, not the
default-active root — so the bridge must not depend on the pointer being flipped
to `.workshopping`. A native in-process `block: read` of the registry would
resolve only while the pointer targets `.workshopping`, which is not the steady
state; the direct file read avoids that coupling entirely and is also the
simplest path. The deeper reason substrate work belongs in the Python scripts
holds regardless of the pointer: grounding-build + Django render + production
parse must run as **in-process subprocesses** (they need the Django process and
the production code — DEC-0041), and the registry read rides along in those same
scripts. (This supersedes both the original wording — which justified script-side
reads by claiming block steps could never reach `.workshopping` — and a transient
observation that the pointer was on `.workshopping`: neither the pointer's
momentary value nor a block-read's conditional availability is a sound basis;
pointer-independence is.)

## 7a. Artifact home (the tracked `outputs/` convention is preserved)

The existing git-tracked `outputs/<timestamp>/` capture dirs are the **forensic
record** and stay that way: the scripts keep writing tracked per-spec captures
there (the gitignored `current-draft.json` / `last-render.json` remain
gitignored scratch). The pi-workflows run dir holds **transient** run state +
checkpoints + the versioned `draft-after-<spec_key>.json` files (§4). The
forensic record must **not** migrate silently into pi-workflows `artifacts:`. If
`artifacts:` is used at all, it points at — or copies — the tracked captures; it
does not replace them.

## 8. Build sequence

0. **Gate first (DEC-0040):** run `verify-render-parity.py` and confirm 14/14
   before treating the substrate as prompt source of truth. Confirm the runtime
   precondition too (Chiway dev Postgres up + `DATABASE_URL` in env).
1. `workshop-json-responder` agent (minimal).
2. `render_from_substrate.py` (reads substrate by direct JSON; threads
   `--draft-path`).
3. `apply_from_substrate.py` (with the F8 grounding-to-parser path; single
   writer of the versioned `draft-after-<spec_key>.json`).
4. `workshop-run-one-spec.workflow.yaml` — render → call → apply → return parsed
   output + the emitted `draft_path`. Validate. This proves the bridge.
5. Expand to `workshop-run-plan-sequence.workflow.yaml` — all 14 specs declared
   in `order`, each render consuming the prior apply's emitted `draft_path`.

## 9. Open questions

Resolved by this revision (recorded here so the closure is explicit):
- **Retry vs. fail-and-resume — resolved to fail-and-resume.** In-harness
  parser-gated re-prompt-until-pass is unbuildable today (loop silently skips
  `command` sub-steps; no loop until-predicate — FGAP-140). The model is
  fail-and-resume (§5a / §7); automatic re-prompt belongs to a future ecosystem
  change, and operator correction-then-resume is the current path.
- **Artifact home — resolved.** The tracked `outputs/<timestamp>/` captures stay
  the forensic record; the pi-workflows run dir holds transient state +
  versioned drafts; `artifacts:` does not replace the tracked captures (§7a).

Still open:
- Whether to author a per-spec `output_schema` to enable the typed-flow gate
  (§7), or rely on the parser alone (the parser is authoritative either way; the
  schema gate is POST-execution and one step earlier than the parser, FGAP-142).
- The exact `artifacts:` / `completion:` / `input.source` YAML against the
  current pi-workflows source (the buildable items in §7; literal syntax pinned
  to do-gap / create-handoff examples, to confirm at build).
- How this execution harness relates to the DEC-29 orchestration trio
  (US-LLM-23/24/25): whether `workshop-run-plan-sequence` is a development-time
  stand-in for that production service or a step toward it.

## 10. Evaluation-closure record

This revision closes the four-lens evaluation's conditions:

**Blocking / major:**
1. Retry descoped to fail-and-resume (§7 "Retry: unbuildable", §5a, §9). The
   `loop`-for-retry recommendation is removed; FGAP-140 cited.
2. `draft_state` inline-JSON threading replaced by shared-file path/version
   threading (§4, §5); the §4 example now threads the prior apply's
   `draft_path`, not `input.initial_draft_state`.
3. Bridge scripts acknowledged as net-new throughout §1 / §5 / §7; present-tense
   "already running" framing dropped.
4. `school_slug` / `cycle_id` dropped from required inputs (§4); `seed` kept,
   optional initial `draft_path` added.
5. Parser-rejection recovery contract defined (§5a).
6. Artifact home named (§7a): tracked `outputs/` preserved as forensic record.

**Should-do:**
7. §7/F11 re-cut to pointer-independence: scripts read `.workshopping/*.json`
   directly, which works regardless of the active pointer (steady state is
   `.context`, the project substrate; `.workshopping` is a build artifact). Both
   the original stale justification and a transient "`.workshopping` active"
   observation are superseded — neither the pointer's momentary value nor a
   conditional block-read is a sound basis.
8. "The DAG gives the sequence" corrected to declaration-order +
   `draft_path` data-flow (§3).
9. Typed-flow gate corrected to POST-execution / not-for-free (§6, §7; FGAP-142).
10. FGAP-165 empty-dispatch caveat noted against "clear failure location" (§1).
11. DEC-0040 parity-gate precondition added (§1, §8).
12. DEC-0005 / FGAP-005 cited for `fragment_refs` ordering authority + the
    single-writer concurrency caveat (§5, §7).
13. DB/env precondition stated (§1, §8).
14. Command-steps-bypass-DEC-0014 flagged as a deliberate choice (§1).
15. `do-gap.workflow.yaml` cited as the canonical template (§4); §7 buildable
    items pinned to real examples (`artifacts:` → create-handoff; `completion:` /
    `input.source` picker → do-gap), with the interactive-mode caveat on pickers.

Companion: `WORKSHOPPING-SUBSTRATE-SPEC.md` header corrected from "not yet
materialized" to materialized + 14/14 parity-gated.

**Runtime-verification closure (empirical pass — companion
`WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md`, which RAN pi-workflows rather
than reading it):**
16. Agent step `input` corrected to the object form `{ prompt: … }` (§4, §6) —
    a whole-value string input is rejected at parse ("step input must be an
    object"); the source-only audit's F4 string option does not run (A6).
17. Run surface stated (§1): no turnkey CLI — run via a live pi session
    (`/workflow run`) or a programmatic `executeWorkflow` harness; the default
    test suite does not cover the end-to-end executor (RUN_INTEGRATION-gated;
    gated executor suite 36/36) — A0 + suite result.
18. A7 (a `command` sub-step inside a `loop` is silently skipped) upgraded from
    source-inferred to **execution-confirmed** (§7; A7).
19. Model-backend runtime precondition for the agent step added (§1; A6).
20. YAML inline-JSON-in-`command` authoring rule added (§4; incidental finding).

The load-bearing linear primitives — input validation, command
`output:{format:json}` typed interpolation, `| shell`, fail-fast halt,
resume-skips-completed, and real agent dispatch — are confirmed to **HOLD by
execution** (A1–A6).
