# Prompt-workshop → `.workshopping` pi-context substrate: migration trace

A precise, ordered, executable trace for migrating the prompt-workshop from
its current MD-snippet design (`snippets/*.md` + `shared/preamble.md`) to a
dedicated pi-context substrate named `.workshopping` holding two custom block
kinds (`prompt-fragment`, `prompt-spec`) plus composition/dependency edges,
with **no MD snippet or preamble files at the end**.

This is a planning artifact. It changes nothing. Read it; a future IMPL slice
executes it. Every step is grounded in the artifacts actually present today
(read, not assumed). Where a real decision must be made before execution, it is
named in Section 9 — **decided, not deferred** where the artifacts settle it;
**surfaced** where the human must choose.

Scope boundary: this trace migrates the **prompt-text composition surface**
(the 14 snippet bodies + the shared preamble) into queryable atoms. It does
**not** migrate the dispatch runtime substrate (`outputs/current-draft.json`,
the per-run capture dirs) — Section 9 records that as a settled keep-as-files
decision with its rationale, and Section 6 keeps `apply.py` / `sequence.py`
essentially unchanged.

---

## 0. Naming + grounding facts this trace relies on

Grounded reads performed to produce this trace:

- `prompt-workshop/README.md`, `prompt-workshop/WORK-PLAN.md` — working model + status.
- All 14 `prompt-workshop/snippets/*.md` — frontmatter + body anatomy.
- `prompt-workshop/shared/preamble.md` — the shared preamble body + BEGIN/END markers.
- `prompt-workshop/dispatch/{render.py,apply.py,sequence.py,_workshop.py}` — exact runtime behavior.
- `.context/config.json`, `.context/schemas/session-notes.schema.json` — custom-block precedent.
- `.context/session-notes.json` item `SESSION-002` — the 5-step custom-block-creation record.
- `.idea-drafts/config.json` + `.pi-context-registry.json` + `.pi-context.json` — the **sibling-substrate** precedent (a second substrate coexisting with `.context`).
- `docs/2026-05-30-pi-context-claude-code-howto.md` — orchestrator-script surface, bootstrap/switch family, custom-block-kind + custom-relation-type workflow, dir-targeted-write capability.

Invocation invariant for every orchestrator-script call below (Python-primary
repo, no project-root `package.json`):

```
NODE_PATH=/Users/david/Projects/workflowsPiExtension/node_modules \
  npx tsx scripts/orchestrator/<name>.ts [args]
```

For ESM-mode inline loaders (`npx tsx -e '...'` doing `*ForDir` block-api
calls) `NODE_PATH` does NOT apply — import via absolute `file://` URL into
`/Users/david/Projects/workflowsPiExtension/packages/pi-context/dist/block-api.js`.

The substrate root dir is `.workshopping` (sibling of `.context` and
`.idea-drafts`, at repo root). Its `substrate_id` is minted at bootstrap.

---

## 1. Current-state inventory

### 1.1 Snippet anatomy (the 14 `snippets/<NN>-<spec-key>.md`)

Each snippet is **YAML frontmatter + Django-template body**. The frontmatter
fields actually present (parsed by `_workshop.parse_frontmatter`, which supports
only this tiny YAML subset):

- Scalar keys (`_FRONTMATTER_SCALAR_KEYS`): `spec_key`, `target_step`,
  `preview_mode`, `output_schema`, `source_migration`.
- List keys (`_FRONTMATTER_LIST_KEYS`): `deps` (inline `[a, b]` or empty `[]`),
  `grounding_sections` (indented dash list).

The 14 specs, with their frontmatter (read verbatim):

| NN | spec_key | target_step | preview_mode | deps | grounding_sections |
|----|----------|-------------|--------------|------|--------------------|
| 01 | narrative-draft | basics | fields | [] | school, cycle, framing_vocabularies, priority_tiers, year_groups, learner_outcomes, areas_for_improvement, stakeholder_groups, divisions, guiding_statements, policies, accreditation_standards, prior_plans, draft_state |
| 02 | propose-domain-alignment | basics | alignment-formsets | [narrative-draft] | school, learner_outcomes, areas_for_improvement, stakeholder_groups, policies, draft_state |
| 03 | propose-milestones | milestones | fields | [narrative-draft] | school, cycle, improvement_types, planning_methods, learner_outcomes, areas_for_improvement, draft_state |
| 04 | draft-success-criteria | criteria | fields | [narrative-draft] | school, cycle, learner_outcomes, areas_for_improvement, divisions, policies, draft_state |
| 05 | decompose-action-steps | steps | fields | [propose-milestones] | school, cycle, improvement_types, planning_methods, areas_for_improvement, learner_outcomes, stakeholder_groups, divisions, policies, draft_state |
| 06 | propose-assignments | steps | assignments | [decompose-action-steps] | school, divisions, draft_state |
| 07 | propose-responsibilities | steps | responsibilities | [propose-assignments] | school, learner_outcomes, guiding_statements, areas_for_improvement, divisions, accreditation_standards, draft_state |
| 08 | propose-timelines | steps | timelines | [decompose-action-steps, propose-milestones] | school, cycle, frequencies, draft_state |
| 09 | propose-step-resources | steps | resources-substeps | [decompose-action-steps] | school, divisions, draft_state |
| 10 | propose-evidence | steps | evidence | [decompose-action-steps, propose-assignments] | school, divisions, guiding_statements, policies, accreditation_standards, draft_state |
| 11 | suggest-feedback-channels | feedback | fields | [narrative-draft, propose-milestones] | school, cycle, stakeholder_groups, divisions, frequencies, draft_state |
| 12 | bind-measurement-channels | criteria | bindings | [draft-success-criteria, suggest-feedback-channels] | school, draft_state |
| 13 | propose-accreditation-standards | standards | fields | [narrative-draft] | school, learner_outcomes, guiding_statements, areas_for_improvement, divisions, policies, accreditation_standards, draft_state |
| 14 | propose-review-loop | review | review-loop | [propose-milestones, suggest-feedback-channels] | school, cycle, divisions, stakeholder_groups, frequencies, accreditation_standards, draft_state |

Each body has a fixed three-zone shape:

1. **Preamble include** — the literal line `{% include "shared/preamble.md" %}`
   as the first body line (all 14).
2. **A spec-specific system intro** — one prose paragraph ("You help a
   school…") unique per spec.
3. **Grounding render blocks** — a sequence of `{% if <section> %}…{% endif %}`
   blocks, one per grounding section the spec carries. These are the
   **duplicated** text: e.g. the divisions-with-positions-and-responsibilities
   block appears verbatim (or in a small number of variants) across snippets
   01, 04, 05, 09, 13; the policies block across 01, 04, 05, 10, 13; etc.
4. **A per-spec task instruction** + **OUTPUT CONTRACT** block (the "Return ONE
   JSON object…" boilerplate header is near-identical across all 14; the
   key-shape body below it is spec-specific).

### 1.2 The shared fragments hiding in the duplication

The whole point of `{% include "shared/preamble.md" %}` was DEC-45/46's
"7-file fix" lesson: a corpus-wide edit shouldn't touch N snippets. The
preamble is already factored. **The grounding render-blocks are not** — they
are copy-pasted. The substrate makes each a single atom (Section 2 enumerates
them precisely).

### 1.3 The dispatch-script contract (exact current behavior)

`render.py SPEC_KEY [--seed] [--draft]`:
1. `setup_django()` (adds `school-improvement-plans/` to `sys.path`, sets
   `DJANGO_SETTINGS_MODULE=config.settings.local`, `django.setup()`).
2. `load_snippet(spec_key)` → globs `snippets/*-<spec_key>.md`, parses
   frontmatter + body.
3. `body = preamble_substitute(body)` → reads `shared/preamble.md`, extracts
   the text between `<!-- BEGIN PREAMBLE BODY` (prefix-matched, line consumed)
   and `<!-- END PREAMBLE BODY -->`, and string-replaces the literal include
   token in the body. **Pure text substitution — the preamble's own content is
   inserted as text, then the whole assembled body is Django-rendered once.**
4. `get_tenant_school()` → `School.objects.get(slug="chiway-repton-xiamen")`.
5. `load_draft()` → reads `outputs/current-draft.json` (structured shape) or an
   empty shell.
6. `flatten_draft_for_grounding(draft)` → projects structured draft to the flat
   `{form-field-name: value}` shape production's `collectDraftState()` emits.
7. `build_grounding(school, draft_state=flat, include=frontmatter["grounding_sections"])`
   — production emitter, imported from `ai.services.grounding`.
8. `PromptSanitizer.sanitize_data_dict(grounding)`.
9. `Template(body).render(Context({**grounding, "seed": seed}))` — Django
   template engine renders the assembled body against the grounding dict.
10. Writes `outputs/last-render.json` (`spec_key`, `rendered_prompt`,
    `grounding_dict_used`, `seed`, `timestamp`); prints `rendered` to stdout.

`apply.py SPEC_KEY` (response on stdin):
1. `load_snippet(spec_key)` → only reads `frontmatter` (for `target_step` /
   `preview_mode` capture) and ignores the body.
2. `get_parse_function(spec_key)` → `planner.specs.parse_<key>` via the
   `_PARSE_FN_NAMES` registry in `_workshop.py`.
3. `_load_grounding_for_parse()` → builds grounding the same way render does.
4. `parse_fn(response_text, school=…, grounding=…)` → production validation.
5. Looks up `MERGE_RULES[spec_key]` (14 entries) → mutates `current-draft.json`.
6. Writes a capture at `outputs/<timestamp>/<NN>-<spec-key>.json`, folding in
   `last-render.json` when its `spec_key` matches.

`sequence.py`:
- `--start-fresh --mode --seed` → resets `current-draft.json`; `_ordered_spec_keys()`
  derives the dispatch order from **`sorted(snippets/*.md)` filename order** (the
  `NN-` numeric prefix), and prints the per-step recipe.
- `--render-whole-draft` → pretty-prints `current-draft.json`. (No snippet reads.)

`_workshop.py` helpers: `setup_django`, `parse_frontmatter`, `load_snippet`,
`preamble_substitute`, `load_draft` / `save_draft` / `empty_draft_shell`,
`timestamp_dir`, `last_render_path`, `draft_path`, `get_tenant_school`,
`get_parse_function` (+ `_PARSE_FN_NAMES`), `flatten_draft_for_grounding`
(+ the formset-prefix mapping comment block).

### 1.4 Production-code reuse points (the one-system invariant, DEC-41)

Three import seams from the workshop into production Django that **must remain
byte-for-byte unchanged** by this migration (they are production fixes
surfaced at workshop time):

- `render.py` / `apply.py` → `ai.services.grounding.build_grounding`.
- `render.py` → `ai.services.prompt_sanitizer.PromptSanitizer`.
- `apply.py` → `planner.specs.parse_<key>` (via `_PARSE_FN_NAMES`).

The Django template **engine** (`django.template.Template/Context`) is also a
production-parity dependency: production `PromptTemplate.template` bodies are
Django templates rendered against the grounding dict. The workshop renders the
same syntax with the same engine. The migration must preserve that the final
render stays Django.

### 1.5 Runtime state artifacts (NOT prompt text — see Section 9)

- `outputs/current-draft.json` — the structured running draft (Plan aggregate
  shape); read/written by all three scripts.
- `outputs/last-render.json` — render→apply handoff pointer.
- `outputs/<timestamp>/*.json|*.rendering.md|*.evaluation.md` — per-experiment
  captures (`.gitignore`'d per the dir listing).

These are **dispatch runtime substrate**, not the composition surface this
migration targets.

---

## 2. The fragment factoring (the dedup design, grounded in the real bodies)

Goal: every renderable piece of prompt text becomes ONE `prompt-fragment`
item; a `prompt-spec` references an **ordered list** of fragments to compose
its body. The duplicated grounding blocks collapse to one fragment each.

Fragment-text fidelity rule: each fragment's `body` is the **exact Django
template substring** lifted from the snippet (byte-preserved, including the
`{% if %}…{% endif %}` wrapper and inner `{% for %}` loops). Composition
assembles fragment bodies **as text** (joined with `\n`, preserving the inter-
block blank-line spacing the snippets use); the assembled body is then Django-
rendered once — exactly as `preamble_substitute` + `Template().render()` does
today (Section 6 addresses this seam explicitly).

### 2.1 The shared / cross-cutting fragments

**FRAG-preamble** — the entire body between the BEGIN/END markers of
`shared/preamble.md` (the solution-architect framing, the grounding-is-the-
universe / no-fabrication clause, the 5 success criteria, the LLM-antipattern
list, the verbatim-labels clause, the what-success-looks-like close). One
fragment; referenced first by **all 14** specs. This is the existing
`{% include %}` target, lifted intact.

Note on granularity: the preamble is currently ONE include, edited as a unit
("one edit → 14 prompts"). This trace keeps it as ONE `prompt-fragment`
(FRAG-preamble) to preserve byte-equivalence and the existing edit ergonomics.
The task brief lists "the voice clause, the no-fabrication clause, the
output-contract boilerplate, each spec's system-prompt intro" as candidate
atoms. The no-fabrication and voice clauses live **inside** the preamble body;
splitting them into separate fragments would change rendered bytes (the join
spacing) and is therefore **deferred to a follow-up** (Section 9, decision D2) —
the byte-equivalence gate (Section 7) is the constraint that forbids doing it
in the same slice. The first-cut factoring keeps the preamble whole and
factors the duplicated **grounding blocks** (the real 7-file-duplication pain).

**FRAG-output-contract-header** — the near-identical OUTPUT CONTRACT preamble
line(s): "Return ONE JSON object and nothing else. Do not wrap it in markdown
code fences. Do not write any prose before or after the JSON." (some specs add
"Write all values in English only."). Two variants exist in the corpus (with
and without the English-only sentence). **Decision D3 (Section 9):** model as
either one fragment with a `{% if %}`-guarded English-only line, OR two
fragments (`FRAG-output-contract-header` / `FRAG-output-contract-header-en`).
First cut: **two fragments**, to keep each fragment a verbatim lift and avoid
introducing new template logic. Specs reference whichever they currently use.

### 2.2 The grounding render-block fragments (the dedup core)

One fragment per distinct grounding render-block. The block is keyed by its
`{% if <section> %}` section name AND its rendering shape (some sections render
differently in different specs — those are distinct fragments, see variants).

| Fragment id | Render block | Snippets that contain this exact block (candidates to dedup) |
|-------------|--------------|-------------------------------------------------------------|
| FRAG-gb-school | `{% if school %}School: {{ school.name }}.{% endif %}` | all 14 |
| FRAG-gb-cycle | `{% if cycle %}Accreditation cycle: …{% endif %}` (label + window) | 01, 04 (variant A) |
| FRAG-gb-cycle-milestone | cycle block w/ "Every milestone's target date must fall within this window." | 03 (variant B) |
| FRAG-gb-cycle-window | cycle block w/ "Propose dates within this window where sensible." | 08, 11 (variant C); 05, 14 use variant A |
| FRAG-gb-framing-vocabularies | `{% if framing_vocabularies %}…{% endfor %}{% endif %}` | 01 |
| FRAG-gb-priority-tiers | priority_tiers loop | 01 |
| FRAG-gb-year-groups | year_groups loop ("name year groups only from this list") | 01 |
| FRAG-gb-learner-outcomes | learner_outcomes loop ("Schoolwide learner outcomes:") | 01, 03, 04, 05 |
| FRAG-gb-learner-outcomes-slo | learner_outcomes loop ("the school's enumerated SLOs…") | 02, 07, 13 |
| FRAG-gb-areas-for-improvement | areas_for_improvement loop (plain heading) | 01, 03, 04, 05 |
| FRAG-gb-areas-for-improvement-afi | areas_for_improvement loop ("the school's enumerated AFIs…") | 02, 07, 13 |
| FRAG-gb-stakeholder-groups | stakeholder_groups loop (plain "Stakeholder groups:") | 01 |
| FRAG-gb-stakeholder-groups-enumerated | stakeholder_groups ("the school's enumerated audiences…") | 05 |
| FRAG-gb-stakeholder-groups-choose | stakeholder_groups ("CHOOSE … by its LABEL") | 02, 11, 14 |
| FRAG-gb-accreditation-standards | accreditation_standards loop ("WASC accreditation standards:") | 01 |
| FRAG-gb-accreditation-standards-cite | accreditation_standards ("cite standards only by code") | 07, 10, 13, 14 |
| FRAG-gb-accreditation-standards-choose | accreditation_standards ("choose each standard by its EXACT code") | 13 (selection-target variant) |
| FRAG-gb-prior-plans | prior_plans loop | 01 |
| FRAG-gb-guiding-statements | guiding_statements items loop ("name guiding clauses only from this list") | 01, 07, 10, 13 |
| FRAG-gb-policies | policies loop ("name policies only from this list") | 01, 04, 05, 10, 13 |
| FRAG-gb-policies-choose | policies ("choose by EXACT label") | 02 |
| FRAG-gb-divisions-full | divisions w/ positions + responsibility atoms ("complete organizational roster; name actors only from this list") | 01, 04, 05, 09, 13 |
| FRAG-gb-divisions-inventory | divisions responsibility-inventory shape (Division "x" / Positions under this division) | 07 |
| FRAG-gb-divisions-labels-only | divisions label-only ("use ONLY these labels for responsible_division") | 06 |
| FRAG-gb-divisions-owner | divisions ("choose owner_division by exact label", label + scope only) | 10, 11, 14 |
| FRAG-gb-improvement-types | improvement_types loop ("CHOOSE … by its CODE", requires-planning-method note) | 03 |
| FRAG-gb-improvement-types-inplay | improvement_types loop ("in play at this school", code+label) | 05 |
| FRAG-gb-planning-methods | planning_methods loop (NAME + applies-to) | 03 |
| FRAG-gb-planning-methods-recipes | planning_methods loop w/ rationale + ordered step templates | 05 |
| FRAG-gb-frequencies | frequencies loop ("name frequencies only from this list") | 08 |
| FRAG-gb-frequencies-choose | frequencies ("CHOOSE … by its CODE") | 11 |
| FRAG-gb-frequencies-code | frequencies ("choose a periodic cadence by EXACT code") | 14 |
| FRAG-gb-draft-state-full | draft_state items loop (full key:value dump) | 01, 03, 04, 05, 11, 14 |
| FRAG-gb-draft-state-prose | draft_state filtered to current/desired/rationale | 02, 13 |
| FRAG-gb-draft-state-steps | draft_state filtered to `steps-*-description` step lines | 06, 07, 09, 10 |
| FRAG-gb-draft-state-steps-milestones | step lines + milestone target-date lines | 08 |
| FRAG-gb-draft-state-criteria-channels | criteria text lines + feedback label lines | 12 |

**Important fidelity caveat (decided, not deferred):** the table above is the
**design intent**. The IMPL slice MUST NOT assume two snippets share a block
until it has **diffed the exact substrings**. Where two snippets' blocks differ
by even one character (heading word, "VERBATIM" vs "verbatim", a trailing
clause), they are **distinct fragments** (the variant rows above are the
already-spotted divergences from reading the bodies; more may surface on
byte-diff). The byte-equivalence gate (Section 7) is what forces this honesty:
if a fragment is shared where the snippets actually diverged, the per-spec
re-render diff fails and the slice stops.

### 2.3 The per-spec fragments (unique text)

For each spec, two unique fragments:

- **FRAG-intro-<spec_key>** — the spec-specific system-intro paragraph ("You
  help a school…") plus any spec-specific mid-body instruction prose and the
  spec-specific OUTPUT CONTRACT key-shape body (everything that is NOT a shared
  grounding block and NOT the shared output-contract header). Lifted verbatim.
- (Optionally split further later; first cut keeps per-spec unique text as one
  ordered run of 1–N fragments where the snippet interleaves unique prose
  between grounding blocks — see 2.4.)

### 2.4 Composition order is interleaved, not "preamble then blocks then intro"

The snippets interleave: intro paragraph → some grounding blocks → a mid-body
instruction → more grounding blocks → task instruction → output contract. So a
spec's `fragment_refs` is an **ordered list that interleaves shared grounding
fragments with per-spec unique-prose fragments**. The IMPL slice produces, per
snippet, an ordered decomposition like:

```
narrative-draft.fragment_refs = [
  FRAG-preamble,
  FRAG-intro-narrative-draft-a,         # "You help a school author draft…"
  FRAG-gb-school, FRAG-gb-cycle,
  FRAG-intro-narrative-draft-seed,      # "Author seed (a one-line intent…): {{ seed }}"
  FRAG-gb-framing-vocabularies, FRAG-gb-priority-tiers,
  FRAG-gb-areas-for-improvement, FRAG-gb-learner-outcomes,
  FRAG-gb-stakeholder-groups, FRAG-gb-accreditation-standards,
  FRAG-gb-prior-plans, FRAG-gb-year-groups, FRAG-gb-guiding-statements,
  FRAG-gb-policies, FRAG-gb-divisions-full, FRAG-gb-draft-state-full,
  FRAG-intro-narrative-draft-rules,     # the "Every name…MUST be drawn verbatim…" para
  FRAG-output-contract-header-en,
  FRAG-contract-narrative-draft,        # the five-key shape
]
```

The exact per-spec ordered list is produced **mechanically from the snippet
body** at migration time (Section 5), not invented here. The decomposition is
"cut the body at block boundaries; each cut is a fragment; record the order."

---

## 3. The two schemas

Both schemas follow the established pi-context block-kind shape (see
`session-notes.schema.json`): top-level `{ "<array_key>": [ {items} ] }`, each
item `required: ["id"]`, `additionalProperties: false`, an id `pattern`, and
the three identity fields (`oid`, `content_hash`, `content_parent`) optional so
pre-stamp items validate and get stamped on next write.

### 3.1 `prompt-fragment` schema (`schemas/prompt-fragment.schema.json`)

- `array_key`: `fragments`; `data_path`: `prompt-fragment.json`; `prefix`: `FRAG-`.
- Item fields:
  - `id` (string, required) — pattern `^FRAG-[a-z0-9-]+$` (slug ids, not
    zero-padded numbers, so `FRAG-gb-divisions-full` reads well; **decision
    D4**: slug vs `FRAG-\d{3}` — first cut slug for readability; the
    `file-block-item --auto-id` next-id helper assumes a numeric-suffix pattern,
    so slug ids are supplied explicitly, not auto-allocated).
  - `kind` (string, required, enum) — `preamble` | `grounding-block` |
    `output-contract-header` | `spec-intro` | `spec-contract`. Lets queries
    group fragments by role.
  - `section` (string, optional) — for `grounding-block` fragments, the
    grounding-section name it renders (`divisions`, `policies`, …). Enables
    "find the divisions block" queries and the Section-7 cross-check that a
    spec's `grounding_sections` set matches the union of its grounding-block
    fragments' `section`s.
  - `body` (string, required) — the verbatim Django-template text of this
    fragment (byte-preserved).
  - `notes` (string, optional) — human note (e.g. "variant: SLO heading").
  - `oid`, `content_hash`, `content_parent` (optional identity fields).

### 3.2 `prompt-spec` schema (`schemas/prompt-spec.schema.json`)

- `array_key`: `specs`; `data_path`: `prompt-spec.json`; `prefix`: `SPEC-`.
- Item fields (mirroring the snippet frontmatter 1:1 + the composition list):
  - `id` (string, required) — pattern `^SPEC-[a-z0-9-]+$`; the canonical id is
    `SPEC-<spec_key>` (e.g. `SPEC-narrative-draft`).
  - `spec_key` (string, required) — the production identity used by the parse
    registry + merge rules (`narrative-draft`, …). Pattern `^[a-z0-9-]+$`.
  - `order` (integer, required) — the `NN` dispatch-order index (1–14) that the
    `NN-` filename prefix carried. Replaces filename-sort ordering in
    `sequence.py` (Section 6.4).
  - `target_step` (string, required).
  - `preview_mode` (string, required).
  - `grounding_sections` (array of string, required) — the section list passed
    to `build_grounding(include=…)`.
  - `deps` (array of string, required, may be empty) — spec_keys this spec
    depends on (the frontmatter `deps`).
  - `fragment_refs` (array of string, required) — the **ordered** list of
    `FRAG-…` ids composing the body (Section 2.4). Order is significant; this
    is the composition spec.
  - `parser` (string, required) — the production parse-function name
    (`parse_narrative`, …), mirroring `_PARSE_FN_NAMES`. Lets the substrate be
    the single source of the spec→parser map (Section 6.3 notes apply.py can
    keep its own registry or read this; first cut keeps apply.py's registry to
    avoid a substrate read on the hot path).
  - `source_migration` (string, optional) — the `ai/migrations/00NN_…` path the
    snippet recorded (provenance; the workshop→production bridge anchor).
  - `output_schema` (string, optional) — retained as the human-pointer the
    frontmatter carried (already non-loaded today; WORK-PLAN Step 2 superseded).
  - `oid`, `content_hash`, `content_parent` (optional identity fields).

### 3.3 Edge relation_types

Two custom relation types registered in `.workshopping/config.json`
`relation_types[]` (category enum is `ordering | data_flow | membership`):

- `spec_composes_fragment` — `display_name` "composes fragment", category
  `membership`, `source_kinds: ["prompt-spec"]`, `target_kinds: ["prompt-fragment"]`.
  One edge per (spec, fragment) composition pair.
  - **Ordering caveat (decision D5, Section 9):** pi-context edges in
    `relations.json` are `{parent, child, relation_type}` triples; the
    block-api does not guarantee a stored ordinal on an edge. The **ordered**
    composition therefore lives authoritatively in the `prompt-spec.fragment_refs`
    array (which is ordered); the `spec_composes_fragment` edges are the
    queryable/graph projection (find-references, build-html-views) and are
    **unordered**. Render reads order from `fragment_refs`, never from edges.
- `spec_depends_on_spec` — `display_name` "depends on spec", category
  `ordering`, `source_kinds: ["prompt-spec"]`, `target_kinds: ["prompt-spec"]`.
  One edge per (spec, dep) pair, mirroring `deps`. `sequence.py` can derive the
  dispatch order from these edges (topological) instead of filename sort
  (Section 6.4); first cut keeps the simpler `order` integer.

---

## 4. Substrate bootstrap + block authoring steps

`.workshopping` is a **sibling substrate** to `.context` (the `.idea-drafts`
precedent: a second substrate registered in `.pi-context-registry.json`, with
its own `config.json` carrying `root: ".workshopping"` + its own
`substrate_id`, while `.pi-context.json` keeps pointing at `.context`).

**The bootstrap seam (decision D1, Section 9):** the orchestrator wrapper
scripts (`write-schema.ts`, `amend-config.ts`, `file-block-item.ts`) resolve
the substrate via the **active pointer** (`resolveContextDir(cwd)`); they take
`--cwd` but no `--substrate-dir`. To author into `.workshopping` while
`.context` stays active there are two grounded paths:

- **Path A — flip the pointer (matches howto "Use this for cutover"):**
  `/context switch -c .workshopping` bootstraps the dir + flips the pointer in
  one op; do all schema/config/block authoring with the wrappers; then
  `/context switch -` (or `/context switch .context`) to flip back. The
  registry + `previous_contextDir` make the flip-back clean. Auth-gate fires on
  each switch (operator confirms).
- **Path B — dir-targeted writes (matches `.idea-drafts` precedent + the
  `*ForDir` block-api):** keep `.context` active; author every write via inline
  tsx loaders using `appendToBlockForDir` / `writeBlockForDir` /
  `nextIdForDir` / `readBlockForDir` and the schema/config primitives, each
  given the literal `.workshopping` dir. The `runtime-demo-dir-targeted-write.ts`
  proves a non-active substrate can be written without moving the pointer.

First-cut recommendation: **Path A** for the one-time bootstrap + block-kind
registration (the wrappers give schema-aware validation, `--show-schema`,
`--dry-run`, id auto-allocation), then flip back. Section 9 leaves the final
A-vs-B call to the human; both are grounded.

Ordered bootstrap steps (Path A shown; Path B substitutes `*ForDir` loaders):

1. **Bootstrap the dir + pointer.** `/context switch -c .workshopping`
   (creates `.workshopping/`, `.workshopping/schemas/`, a `config.json`
   shell + a minted `substrate_id`, registers it in `.pi-context-registry.json`,
   flips the pointer). Auth-gate fires.
2. **Start config minimal, not "accept-all".** `/context accept-all` adopts the
   full 16-kind canonical vocabulary; the workshop needs only the two custom
   kinds. Either (a) accept-all then leave the unused kinds (harmless, larger
   config), or (b) hand-author a minimal `config.json` (decision D6). First
   cut: **minimal config** — only the two custom block_kinds + two relation
   types + the identity registries (`installed_schemas`, `installed_blocks`).
3. **Write the two schemas** (the SESSION-002 step 1):
   ```
   NODE_PATH=… npx tsx scripts/orchestrator/write-schema.ts \
     --operation create --name prompt-fragment \
     --schema @/tmp/prompt-fragment.schema.json
   NODE_PATH=… npx tsx scripts/orchestrator/write-schema.ts \
     --operation create --name prompt-spec \
     --schema @/tmp/prompt-spec.schema.json
   ```
   (AJV meta-validates; atomic write into `.workshopping/schemas/`.)
4. **Register both block kinds in `config.block_kinds[]`** (SESSION-002 step 2):
   ```
   NODE_PATH=… npx tsx scripts/orchestrator/amend-config.ts \
     --registry block_kinds --operation add --key prompt-fragment \
     --entry '{"canonical_id":"prompt-fragment","display_name":"Prompt Fragment","prefix":"FRAG-","array_key":"fragments","data_path":"prompt-fragment.json","schema_path":"schemas/prompt-fragment.schema.json"}'
   NODE_PATH=… npx tsx scripts/orchestrator/amend-config.ts \
     --registry block_kinds --operation add --key prompt-spec \
     --entry '{"canonical_id":"prompt-spec","display_name":"Prompt Spec","prefix":"SPEC-","array_key":"specs","data_path":"prompt-spec.json","schema_path":"schemas/prompt-spec.schema.json"}'
   ```
5. **Register both relation types in `config.relation_types[]`** (SESSION-002 step 3):
   ```
   NODE_PATH=… npx tsx scripts/orchestrator/amend-config.ts \
     --registry relation_types --operation add --key spec_composes_fragment \
     --entry '{"canonical_id":"spec_composes_fragment","display_name":"composes fragment","category":"membership","source_kinds":["prompt-spec"],"target_kinds":["prompt-fragment"]}'
   NODE_PATH=… npx tsx scripts/orchestrator/amend-config.ts \
     --registry relation_types --operation add --key spec_depends_on_spec \
     --entry '{"canonical_id":"spec_depends_on_spec","display_name":"depends on spec","category":"ordering","source_kinds":["prompt-spec"],"target_kinds":["prompt-spec"]}'
   ```
6. **Register identity manifests.** `amend-config --registry installed_schemas`
   (add `prompt-fragment`, `prompt-spec`) and `--registry installed_blocks`
   (same) — SESSION-002 discovery: these are separate from `block_kinds[]` and
   needed for context-install survival.
7. **Create the two empty block files** (SESSION-002 step 4):
   ```
   npx tsx -e 'import fs from "node:fs"; fs.writeFileSync(".workshopping/prompt-fragment.json", JSON.stringify({schema_version:"1.0.0",fragments:[]},null,2)+"\n");'
   npx tsx -e 'import fs from "node:fs"; fs.writeFileSync(".workshopping/prompt-spec.json", JSON.stringify({schema_version:"1.0.0",specs:[]},null,2)+"\n");'
   ```
   (Also create `.workshopping/relations.json` as `[]` if the bootstrap didn't.)
8. **Validate** (SESSION-002 step 5): `/context validate` (config-shape +
   schema-validity + referential integrity over the two kinds + two relations).

---

## 5. Data migration: 14 snippets + preamble → fragments + specs + edges

Do this with a **deterministic decomposition script** (a one-shot Python helper
under `prompt-workshop/dispatch/` or `/tmp`, run once), not by hand — hand
transcription risks breaking the byte-preserve invariant the Section-7 gate
checks. The script reads the live snippets + preamble and emits the fragment +
spec JSON + edge list. Ordered:

1. **Extract FRAG-preamble.** Read `shared/preamble.md`; take exactly the bytes
   `preamble_substitute` would extract (between BEGIN-marker-line-end and the
   END marker, `.strip("\n")`). Write as the `preamble`-kind fragment.

2. **Per snippet, parse frontmatter + body** (reuse `_workshop.parse_frontmatter`).

3. **Cut each body into ordered fragment segments.** Algorithm: the body is a
   sequence of `{% if %}…{% endif %}` grounding blocks interleaved with
   non-block prose runs. Walk the body; each top-level `{% if <section> %}…
   {% endif %}` block is one candidate grounding-block segment; each maximal
   run of text between blocks is a prose segment (intro / mid-instruction /
   task / output-contract). The leading `{% include "shared/preamble.md" %}`
   maps to FRAG-preamble (not re-emitted as text). Preserve inter-segment
   whitespace by recording, per segment, its exact substring **including** the
   surrounding blank lines as the snippet had them (so the join reconstructs
   byte-for-byte).

4. **Deduplicate grounding-block segments by exact-string equality.** Two
   snippets' segments collapse to one FRAG only when their substrings are
   byte-identical. Non-identical → distinct FRAG (the Section 2.2 variants).
   Assign each unique grounding-block segment a `FRAG-gb-<section>[-variant]`
   id and `kind: grounding-block`, `section: <section>`.

5. **Deduplicate the output-contract header** the same way → FRAG-output-
   contract-header[-en].

6. **Assign per-spec unique prose segments** `FRAG-intro-<spec_key>-<n>` /
   `FRAG-contract-<spec_key>` ids (kind `spec-intro` / `spec-contract`).

7. **Build each spec's `fragment_refs`** = the ordered list of FRAG ids the
   walk produced for that snippet (preamble first, then the interleaved order).

8. **Emit fragments** via `file-block-item --block prompt-fragment` (one per
   unique fragment; supply explicit slug `id`; `--dry-run` first). The body
   field carries the verbatim segment text.

9. **Emit specs** via `file-block-item --block prompt-spec` (one per snippet),
   carrying `spec_key`, `order` (the NN), `target_step`, `preview_mode`,
   `grounding_sections`, `deps`, `fragment_refs`, `parser` (from
   `_PARSE_FN_NAMES`), `source_migration`, `output_schema`.

10. **Emit edges** to `.workshopping/relations.json` via `append-relation.ts`
    (or a batch `fs` append): for each spec, one `spec_composes_fragment`
    `{parent: SPEC-…, child: FRAG-…, relation_type: spec_composes_fragment}`
    per fragment in `fragment_refs`; one `spec_depends_on_spec` per dep.

11. **Validate** `/context validate` again (now with data present).

(All emit steps run under Path A active-pointer or Path B `*ForDir`, per
decision D1.)

---

## 6. Dispatch-script rewrite

The principle: **only the body-assembly source changes**; the
grounding/render/parse/merge machinery stays byte-identical to preserve
production parity (Section 1.4). The migration replaces "read snippet file +
`preamble_substitute`" with "read prompt-spec from `.workshopping` + assemble
fragment bodies", then renders the assembled body through Django exactly as now.

### 6.1 New `_workshop.py` substrate-read helpers

Add helpers that read `.workshopping` (read-only, no auth) — via the
orchestrator read scripts as subprocesses, OR (cleaner) via a small tsx reader
invoked from Python, OR by direct `json.load` of `.workshopping/prompt-spec.json`
+ `prompt-fragment.json` (the data files are plain JSON; reads need no library).
First cut: **direct `json.load`** of the two block files (lowest coupling, no
Node round-trip on the render hot path; the substrate write path still uses the
orchestrator scripts).

- `load_prompt_spec(spec_key) -> dict` — read `.workshopping/prompt-spec.json`;
  find the item with `spec_key == …` (or `id == SPEC-<spec_key>`). Replaces
  `load_snippet`'s frontmatter role. Returns the spec dict (has
  `grounding_sections`, `target_step`, `preview_mode`, `fragment_refs`, etc.).
- `load_fragments() -> dict[str, dict]` — read `.workshopping/prompt-fragment.json`
  into an id→item map.
- `assemble_spec_body(spec, fragments) -> str` — **the new composition core**:
  `"\n".join(fragments[fid]["body"] for fid in spec["fragment_refs"])` (the
  join string + per-fragment trailing/leading whitespace are what the Section-5
  byte-preserve step calibrates so the assembled body equals the old
  `preamble_substitute(snippet_body)` output). This **does NOT interpret the
  Django `{% %}` tags** — it concatenates template *text*. The seam is
  identical to today: `preamble_substitute` already string-substitutes the
  preamble text into the body and lets the single downstream
  `Template(body).render()` do all the `{% %}` evaluation. Assembly is the same
  text-only operation, just sourced from N fragments instead of file + include.

### 6.2 `render.py` changes (the only substantive script rewrite)

Replace lines that currently do:
```
frontmatter, body = load_snippet(args.spec_key)
body = preamble_substitute(body)
```
with:
```
spec = load_prompt_spec(args.spec_key)
fragments = load_fragments()
body = assemble_spec_body(spec, fragments)
```
Then **everything downstream is unchanged**:
- `grounding = build_grounding(school, draft_state=flat, include=spec["grounding_sections"])`
  (was `frontmatter.get("grounding_sections")` — now `spec["grounding_sections"]`).
- `PromptSanitizer.sanitize_data_dict`, `Template(body).render(Context(...))`,
  `last-render.json` write, stdout — identical.

The render-engine seam is explicitly preserved: **fragment bodies are Django-
template text; composition assembles them as text; Django renders the assembled
body once** (Section 1.3 step 9). No fragment is rendered in isolation; the
`{% if section %}` guards still see the full grounding dict because the join
produces the same single template the snippet did.

### 6.3 `apply.py` changes (minimal)

`apply.py` only reads frontmatter for `target_step` / `preview_mode` capture
and never reads the body. Replace `load_snippet(spec_key)` →
`load_prompt_spec(spec_key)` and read `spec["target_step"]` /
`spec["preview_mode"]` for the capture. The capture's NN-prefix filename
(currently derived from the snippet filename) derives from `spec["order"]`
instead (zero-padded). **`parse_<key>` resolution, `MERGE_RULES`, grounding-
for-parse, draft merge, capture write are all unchanged** — `_PARSE_FN_NAMES`
and `MERGE_RULES` stay as Python dicts keyed by `spec_key` (decision D7: keep
them in code rather than reading `spec["parser"]`, so the production-parity
import path is untouched; the substrate's `parser` field is then a documented
mirror, not a runtime source).

### 6.4 `sequence.py` changes (minimal)

`_ordered_spec_keys()` currently sorts snippet filenames. Replace with: read
`.workshopping/prompt-spec.json`, sort items by `spec["order"]`, return their
`spec_key`s. (Or topologically sort by `spec_depends_on_spec` edges /
`deps` — decision D5/D8; first cut: the `order` integer, which is exactly what
the `NN-` prefix encoded.) `--render-whole-draft` reads only
`current-draft.json` and is **unchanged**.

### 6.5 What is deleted from `_workshop.py`

`load_snippet`, `parse_frontmatter`, `preamble_substitute`, and the
frontmatter scalar/list-key constants become dead once nothing reads MD. Remove
them in the **cutover** step (Section 8), not before the gate passes — they stay
available as the fallback comparator the gate diffs against.

---

## 7. Production-parity verification gate (the cutover go/no-go)

The migration is byte-equivalence-gated: **the substrate pipeline must render
each spec to a prompt byte-identical to what the current MD-snippet pipeline
renders against the same grounding** (modulo the intended cleanup — i.e. no
intended change other than source-of-truth). If any spec diverges, the slice
stops (mandate-008 STOP) and the fragment factoring is corrected.

Exact check (a one-shot `verify-render-parity.py` harness, run after Section 5,
before Section 8):

1. For each of the 14 spec_keys, with a **fixed draft + fixed seed** (use the
   committed `outputs/current-draft.json`, or a frozen fixture, identically for
   both sides — the grounding must be the same bytes both runs):
   a. **OLD render:** `load_snippet` + `preamble_substitute` + the existing
      render pipeline → `rendered_old`.
   b. **NEW render:** `load_prompt_spec` + `assemble_spec_body` + the same
      render pipeline → `rendered_new`.
   c. Assert `rendered_old == rendered_new` (exact string equality). On mismatch,
      print a unified diff and the spec_key; **fail the whole gate**.
2. Cross-check `spec["grounding_sections"]` equals the snippet frontmatter's
   `grounding_sections` for all 14 (the `include=` arg must not drift).
3. Cross-check each spec's grounding-block fragments' `section` values are a
   subset of `spec["grounding_sections"]` (no orphan block; no missing block).

Because both sides feed the SAME `build_grounding` + `PromptSanitizer` +
`Template().render()`, a passing exact-equality diff proves the only thing that
changed is where the template **text** came from. That is the cutover
predicate: **14/14 byte-identical → GO; any diff → NO-GO**.

(Run the existing static gate too — `manage.py check`, `ruff`, `mypy`,
`pytest` for the Django side; the dispatch scripts are workshop-side Python and
are exercised by the parity harness itself.)

---

## 8. Cutover + teardown

Once the Section-7 gate is 14/14 green:

1. **Flip `render.py` / `apply.py` / `sequence.py`** to the substrate path
   (Section 6) as the committed default. (If developed behind a flag, remove the
   flag and the OLD path.)
2. **Delete `prompt-workshop/snippets/` (all 14 + its README)** and
   `prompt-workshop/shared/preamble.md` (+ `shared/README.md` if it only
   described the preamble). This is the "no MD snippet/preamble files at the
   end" end-state.
3. **Remove the now-dead `_workshop.py` helpers** (`load_snippet`,
   `parse_frontmatter`, `preamble_substitute`, frontmatter key constants).
4. **Update the docs that describe the file layout:** `prompt-workshop/README.md`
   ("Snippets are MD files…"), `WORK-PLAN.md`, `dispatch/README.md`,
   `snippets/README.md` (delete), and the root `CLAUDE.md` Mode-C section
   ("edit snippet at `prompt-workshop/snippets/…`" → "edit fragment/spec in the
   `.workshopping` substrate"). Re-point the iteration loop description at the
   substrate edit surface (`upsert-block-item --block prompt-fragment` to edit a
   shared block once → all referencing specs uplifted, the DEC-45/46 win made
   structural).
5. **Verify working tree clean + the parity harness still 14/14** after the
   deletions (the harness's OLD side is gone post-delete; keep a captured
   golden set of the 14 OLD renders from the pre-delete run as the regression
   fixture the NEW renders are diffed against going forward).

### 8.1 The workshop→production bridge is UNAFFECTED

The bridge is: a validated spec body → an `ai/00NN_…` migration that mirrors
the body byte-for-byte into `PromptTemplate.template` (the `ai/0016` guarded
byte-match pattern; DEC-41 consequence 3). Today the migration author copies the
snippet body. Post-migration, the migration author obtains the **same body** by
running `assemble_spec_body(load_prompt_spec(key), load_fragments())` (or
`render.py`'s assembly step) and pasting the assembled template text — the
identical string the byte-equivalence gate proved equals the old snippet body.
So the production landing path produces the same `PromptTemplate.template` bytes;
only the source the author reads changed (substrate instead of MD file). The
`source_migration` field on each `prompt-spec` preserves the provenance anchor
the snippet frontmatter carried. **No `ai/` migration, no `planner.specs`
parser, no `ai.services.grounding` emitter changes.**

---

## 9. Risks / decisions to surface (named, not deferred where the artifacts settle them)

**D1 — Bootstrap seam (active-pointer wrappers vs dir-targeted writes).**
The wrapper scripts resolve via the active pointer; `.workshopping` is non-
active. Two grounded paths: Path A (`/context switch -c .workshopping` →
author → switch back; auth-gate per switch) or Path B (`*ForDir` block-api via
inline tsx loaders, pointer never moves — the `.idea-drafts` precedent). First
cut: Path A for bootstrap (wrapper validation ergonomics), then flip back.
**Human picks A or B before execution.** This is the single biggest mechanical
fork; both are proven (`.idea-drafts` exists via the same family).

**D2 — Preamble granularity.** First cut keeps the whole preamble as ONE
`FRAG-preamble` (byte-equivalence + existing "one edit → 14" ergonomics). The
brief's finer atoms (voice clause, no-fabrication clause as separate fragments)
live inside the preamble body; splitting them changes join-spacing bytes and
would fail the Section-7 gate in the same slice → **deferred to a follow-up
slice** that re-runs the gate after re-cutting. Decided: whole preamble now.

**D3 — Output-contract header: one guarded fragment vs two variants.** Two
fragments (`-en` variant) keeps every fragment a verbatim lift and avoids new
template logic. Decided: two fragments first cut.

**D4 — Fragment id scheme: slug vs `FRAG-\d{3}`.** Slug ids
(`FRAG-gb-divisions-full`) read far better and make the composition lists self-
documenting; cost is no `--auto-id` (ids supplied explicitly). Decided: slug.
(If the human prefers numeric for `file-block-item --auto-id`, that's a clean
swap — the schema `pattern` is the only change.)

**D5 — Edge ordering.** pi-context edges are unordered `{parent, child, type}`
triples; the **ordered** composition lives in `prompt-spec.fragment_refs` (an
ordered array). Edges are the queryable graph projection (unordered). Render
reads order from `fragment_refs`, never from edges. Decided.

**D6 — Minimal config vs accept-all.** Minimal config (two kinds + two
relations + identity manifests) keeps `.workshopping` purpose-built. Decided:
minimal.

**D7 — `parser` / `MERGE_RULES` stay in `apply.py` code.** Keep `_PARSE_FN_NAMES`
+ `MERGE_RULES` as Python dicts keyed by `spec_key` (production-parity import
path untouched, no substrate read on the apply path). The `prompt-spec.parser`
field mirrors `_PARSE_FN_NAMES` as documentation, not a runtime source.
Decided. (Drift risk: two copies of the spec→parser map. Mitigation: a tiny
test asserting `prompt-spec.parser` == `_PARSE_FN_NAMES[spec_key]` for all 14.)

**D8 — `sequence.py` ordering source.** First cut: `prompt-spec.order` integer
(exactly the `NN-` prefix). Topological-from-`deps`/edges is a later option.
Decided: `order` integer.

**D9 — Runtime state stays files (NOT blocks).** `outputs/current-draft.json`,
`last-render.json`, and the per-run captures are **dispatch runtime substrate**,
not the prompt-composition surface this migration targets. They are mutated
mid-dispatch by `save_draft` (atomic tempfile+rename) and read by all three
scripts on the hot path; they are NOT queryable-knowledge atoms; the captures
are `.gitignore`'d. Making them blocks would add a Node round-trip + auth-surface
to every render/apply with no query benefit. **Decided: keep as files.** The
brief's "no MD snippet/preamble files at the end" is satisfied — those are
`.json`, not MD, and are not part of the snippet/preamble corpus being migrated.

**D10 — Fragment-sharing fidelity (the real correctness risk).** The Section
2.2 dedup table is design intent; the IMPL slice MUST byte-diff before sharing.
The Section-7 gate is the backstop: a wrong share → a per-spec render diff →
NO-GO. The variant rows (cycle ×3, learner-outcomes ×2, areas ×2, stakeholder
×3, accreditation ×3, policies ×2, divisions ×4, draft_state ×5) are the
already-spotted divergences from reading the bodies; the diff may surface more.
This is why Section 5 mandates a deterministic extraction script, not hand
transcription.

**D11 — Coupling: scripts assume the MD file layout.** Current couplings to
remove: `load_snippet`'s `snippets/*-<key>.md` glob (render + apply +
`sequence._ordered_spec_keys`); `apply.py`'s NN-prefix filename derivation;
`preamble_substitute`'s `shared/preamble.md` read + BEGIN/END marker parse;
`parse_frontmatter`'s YAML-subset assumptions. All four are replaced by
substrate reads (Section 6). None reach into production code, so the blast
radius is the three dispatch scripts + `_workshop.py` only.

**D12 — NODE_PATH invariant.** Every `scripts/orchestrator/*.ts` call (bootstrap,
schema, config, file-block-item, append-relation) needs
`NODE_PATH=/Users/david/Projects/workflowsPiExtension/node_modules`; every
ESM-mode `*ForDir` inline loader needs absolute `file://` import of
`…/packages/pi-context/dist/block-api.js` instead. The Python dispatch scripts'
**read** path (direct `json.load` of the `.workshopping/*.json` files, D6.1)
needs neither — it touches no Node — which is a reason to prefer direct JSON
reads for the render hot path.

---

## 10. End-state summary

- `.workshopping/` substrate: `config.json` (minimal: 2 block kinds + 2
  relation types + identity manifests + minted `substrate_id`),
  `schemas/prompt-fragment.schema.json`, `schemas/prompt-spec.schema.json`,
  `prompt-fragment.json` (the deduped fragment atoms — ~1 preamble + ~35
  grounding-block fragments + ~2 output-contract headers + per-spec intro/
  contract fragments), `prompt-spec.json` (14 spec items), `relations.json`
  (`spec_composes_fragment` + `spec_depends_on_spec` edges); registered in
  `.pi-context-registry.json` alongside `.context` + `.idea-drafts`.
- `prompt-workshop/dispatch/`: `render.py` assembles from the substrate;
  `apply.py` reads the spec for capture metadata; `sequence.py` orders by
  `spec.order`; `_workshop.py` gains substrate readers + loses the MD helpers.
  All production imports (`build_grounding`, `PromptSanitizer`, `parse_*`) and
  the Django render seam unchanged.
- `prompt-workshop/snippets/` and `prompt-workshop/shared/preamble.md`:
  **deleted**. No MD snippet/preamble files remain.
- `outputs/` runtime files: unchanged (kept as files, D9).
- Workshop→production bridge (`ai/00NN` migration mirroring the assembled body
  into `PromptTemplate.template`): unchanged in mechanism; the author reads the
  assembled body from the substrate instead of an MD file.
