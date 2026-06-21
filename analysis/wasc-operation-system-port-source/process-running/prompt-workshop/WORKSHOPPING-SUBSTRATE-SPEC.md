# `.workshopping` substrate — structure spec

The structural definition of the `.workshopping` substrate: two custom block
kinds, their schemas, the fragment factoring, and the two edge relation types.
Extracted from `prompt-workshop/PI-CONTEXT-MIGRATION-TRACE.md`. The substrate
described here is now materialized and parity-gated: `.workshopping/` is built
and populated (181 fragments / 14 specs / 266 edges, both block kinds + the two
relation types registered in `config.json`; the AJV schema files
`schemas/prompt-fragment.schema.json` and `schemas/prompt-spec.schema.json`
present), and the §4 byte-equivalence gate passes 14/14 (commits `5a8242c`
populate, `c076050` parity-gate via `verify-render-parity.py`).

---

## 1. The fragment factoring (the dedup design, grounded in the real bodies)

Goal: every renderable piece of prompt text becomes ONE `prompt-fragment`
item; a `prompt-spec` references an **ordered list** of fragments to compose
its body. The duplicated grounding blocks collapse to one fragment each.

Fragment-text fidelity rule: each fragment's `body` is the **exact Django
template substring** lifted from the snippet (byte-preserved, including the
`{% if %}…{% endif %}` wrapper and inner `{% for %}` loops). Composition
assembles fragment bodies **as text** (joined with `\n`, preserving the inter-
block blank-line spacing the snippets use); the assembled body is then
Django-rendered once — a single render pass over the joined text.

Whitespace-absorption rule (the composition fidelity mechanism): each
fragment's stored `body` carries the surrounding blank lines exactly as the
snippet had them around that segment (trace §5 step 3 / §6.1). The decomposition
records, per segment, its exact substring **including** the leading/trailing
blank lines that separated it from its neighbours, so a bare
`"\n".join(fragments[fid].body for fid in fragment_refs)` reconstructs the
original snippet body byte-for-byte — no re-spacing pass is applied at compose
time. This makes the dedup **unit for composition** the whitespace-inclusive
segment: two `{% if %}` blocks whose block content is byte-identical but whose
surrounding blank-line spacing differs are **distinct fragments at composition
time** (they would reconstruct different bytes). The §1.2 grounding-block
identity below is keyed by **block content** (leading/trailing blank lines
trimmed before comparison); the §4 byte-equivalence gate is what proves the
whitespace-inclusive composition still reproduces the original bytes once the
content-identical fragments carry whatever surrounding spacing each ref site
needs.

### 1.1 The shared / cross-cutting fragments

**FRAG-preamble** — the entire body between the BEGIN/END markers of
`shared/preamble.md` (the solution-architect framing, the grounding-is-the-
universe / no-fabrication clause, the 5 success criteria, the LLM-antipattern
list, the verbatim-labels clause, the what-success-looks-like close). One
fragment; referenced first by **all 14** specs. This is the existing
`{% include %}` target, lifted intact.

The preamble stays ONE `prompt-fragment` (FRAG-preamble) to preserve
byte-equivalence and the existing edit ergonomics ("one edit → 14 prompts").
The no-fabrication and voice clauses live **inside** the preamble body;
splitting them into separate fragments would change rendered bytes (the join
spacing), so the preamble is kept whole and the duplicated **grounding blocks**
(the real 7-file-duplication pain) are what get factored.

**FRAG-output-contract-header** — the OUTPUT CONTRACT preamble line(s): "Return
ONE JSON object and nothing else. Do not wrap it in markdown code fences. Do not
write any prose before or after the JSON." Some specs add "Write all values in
English only." Two fragments model this — `FRAG-output-contract-header` and
`FRAG-output-contract-header-en` — each a verbatim lift with no added template
logic; specs reference whichever they currently use. The byte-diff over the 14
snippets partitions the header line exactly two ways:
`FRAG-output-contract-header-en` (with the English-only sentence) is contained
by snippets **01, 03, 04, 05, 11**; `FRAG-output-contract-header` (without it)
is contained by snippets **02, 06, 07, 08, 09, 10, 12, 13, 14**.

### 1.2 The grounding render-block fragments (the dedup core)

One fragment per distinct grounding render-block. The block is keyed by its
`{% if <section> %}` section name AND its rendering shape (some sections render
differently in different specs — those are distinct fragments, see variants).

This table is the output of the byte-diff decomposition (§5 of the trace, the
deterministic decomposition script): each row is one distinct block-content
string; the snippet list is exactly the snippets whose block string is
byte-identical to that row, never an eyeballed grouping. The decomposition
derives the table; the §4 byte-equivalence gate validates it. The byte-diff
splits the previous hand-authored table into **more** rows: cycle splits 3 ways
on actual membership (not the earlier A/B/C memberships), the SLO/AFI/standards
"choose by EXACT label" variant for snippet 02 separates from the SLO/AFI
variant for 07/13, stakeholder_groups splits 5 ways, divisions 6 ways,
draft_state 10 ways, and a **seed** grounding-block class (the per-spec
`{% if seed %}` steer line present in snippets 02–14, absent from 01 which
carries seed as bare intro prose) surfaces that the earlier table omitted
entirely.

| Fragment id | Render block | Snippets that contain this exact block |
|-------------|--------------|-----------------------------------------|
| FRAG-gb-school | `{% if school %}School: {{ school.name }}.{% endif %}` | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14 |
| FRAG-gb-cycle | cycle block, plain "Accreditation cycle: …" | 01, 04, 05, 11, 14 |
| FRAG-gb-cycle-milestone | cycle block + "Every milestone's target date must fall within this window." | 03 |
| FRAG-gb-cycle-window | cycle block "The active improvement cycle runs from … Propose dates within this window where sensible." | 08 |
| FRAG-gb-seed-select | `{% if seed %}Author refinement (an optional steer for which rows to select): …{% endif %}` | 02 |
| FRAG-gb-seed-milestones | `{% if seed %}Author refinement (an optional steer for the milestones): …{% endif %}` | 03 |
| FRAG-gb-seed-criteria | `{% if seed %}Author refinement (an optional steer for the criteria): …{% endif %}` | 04 |
| FRAG-gb-seed-steps | `{% if seed %}Author refinement (an optional steer for the steps): …{% endif %}` | 05 |
| FRAG-gb-seed-assignments | `{% if seed %}Author refinement (an optional steer for the assignments): …{% endif %}` | 06 |
| FRAG-gb-seed-mapping | `{% if seed %}Author refinement (an optional steer for the mapping): …{% endif %}` | 07 |
| FRAG-gb-seed-timelines | `{% if seed %}Author refinement (an optional steer for the timelines): …{% endif %}` | 08 |
| FRAG-gb-seed-resources | `{% if seed %}Author refinement (an optional steer for the resources & sub-steps): …{% endif %}` | 09 |
| FRAG-gb-seed-evidence | `{% if seed %}Author refinement (an optional steer for the evidence): …{% endif %}` | 10 |
| FRAG-gb-seed-channels | `{% if seed %}Author refinement (an optional steer for the channels): …{% endif %}` | 11 |
| FRAG-gb-seed-bindings | `{% if seed %}Author refinement (an optional steer for the bindings): …{% endif %}` | 12 |
| FRAG-gb-seed-standards | `{% if seed %}Author refinement (an optional steer for which standards to propose): …{% endif %}` | 13 |
| FRAG-gb-seed-review | `{% if seed %}Author refinement (an optional steer for the review loop): …{% endif %}` | 14 |
| FRAG-gb-framing-vocabularies | `{% if framing_vocabularies %}…{% endfor %}{% endif %}` | 01 |
| FRAG-gb-priority-tiers | priority_tiers loop | 01 |
| FRAG-gb-areas-for-improvement | areas_for_improvement loop (plain "Areas for improvement:") | 01, 03, 04, 05 |
| FRAG-gb-areas-for-improvement-choose | areas_for_improvement ("choose by EXACT label") | 02 |
| FRAG-gb-areas-for-improvement-afi | areas_for_improvement ("the school's enumerated AFIs…") | 07, 13 |
| FRAG-gb-learner-outcomes | learner_outcomes loop ("Schoolwide learner outcomes:") | 01, 03, 04, 05 |
| FRAG-gb-learner-outcomes-choose | learner_outcomes ("Learner outcomes (choose by EXACT label)") | 02 |
| FRAG-gb-learner-outcomes-slo | learner_outcomes ("the school's enumerated SLOs…") | 07, 13 |
| FRAG-gb-stakeholder-groups | stakeholder_groups loop (plain "Stakeholder groups:") | 01 |
| FRAG-gb-stakeholder-groups-choose | stakeholder_groups ("Stakeholder groups (choose by EXACT label)") | 02 |
| FRAG-gb-stakeholder-groups-enumerated | stakeholder_groups ("the school's enumerated audiences…") | 05 |
| FRAG-gb-stakeholder-groups-label | stakeholder_groups ("CHOOSE each channel's stakeholder by its LABEL", quoted labels) | 11 |
| FRAG-gb-stakeholder-groups-audience | stakeholder_groups ("choose a communication's audience by EXACT label") | 14 |
| FRAG-gb-accreditation-standards | accreditation_standards loop ("WASC accreditation standards:") | 01 |
| FRAG-gb-accreditation-standards-cite | accreditation_standards ("the global standards catalogue; cite standards only by code") | 07, 10, 14 |
| FRAG-gb-accreditation-standards-choose | accreditation_standards ("choose each standard by its EXACT code") | 13 |
| FRAG-gb-prior-plans | prior_plans loop | 01 |
| FRAG-gb-year-groups | year_groups loop ("name year groups only from this list") | 01 |
| FRAG-gb-guiding-statements | guiding_statements items loop ("name guiding clauses only from this list") | 01, 07, 10, 13 |
| FRAG-gb-policies | policies loop ("name policies only from this list") | 01, 04, 05, 10, 13 |
| FRAG-gb-policies-choose | policies ("choose by EXACT label"; uses `: {{ p.notes }}`) | 02 |
| FRAG-gb-divisions-full | divisions w/ positions + responsibility atoms ("complete organizational roster; name actors only from this list") | 01, 04, 05, 09, 13 |
| FRAG-gb-divisions-labels-only | divisions label-only ("use ONLY these labels for responsible_division") | 06 |
| FRAG-gb-divisions-inventory | divisions responsibility-inventory shape (Division "x" / Positions under this division) | 07 |
| FRAG-gb-divisions-owner | divisions ("choose each artifact's owner_division by its exact label", label + scope only) | 10 |
| FRAG-gb-divisions-channel-owner | divisions ("CHOOSE each channel's owner_division by its LABEL", quoted labels + `({{ scope }})`) | 11 |
| FRAG-gb-divisions-unit | divisions ("choose an owner / responsible unit by EXACT label"; uses `: {{ scope }}`) | 14 |
| FRAG-gb-improvement-types | improvement_types loop ("CHOOSE … by its CODE", requires-planning-method note) | 03 |
| FRAG-gb-improvement-types-inplay | improvement_types loop ("in play at this school", code+label) | 05 |
| FRAG-gb-planning-methods | planning_methods loop (NAME + applies-to) | 03 |
| FRAG-gb-planning-methods-recipes | planning_methods loop w/ rationale + ordered step templates | 05 |
| FRAG-gb-frequencies | frequencies loop ("name frequencies only from this list") | 08 |
| FRAG-gb-frequencies-choose | frequencies ("CHOOSE … by its CODE") | 11 |
| FRAG-gb-frequencies-code | frequencies ("choose a periodic cadence by EXACT code") | 14 |
| FRAG-gb-draft-state-full | draft_state items loop (full key:value dump, "The author's in-progress draft so far:") | 01 |
| FRAG-gb-draft-state-milestones-target | draft_state full dump ("the desired state + success criteria to set milestones toward") | 03 |
| FRAG-gb-draft-state-criteria-source | draft_state full dump ("the desired state + rationale to draw criteria from") | 04 |
| FRAG-gb-draft-state-method | draft_state full dump ("the shape to fit a method to") | 05 |
| FRAG-gb-draft-state-channels-source | draft_state full dump ("the engaged stakeholders to source feedback from, and the milestones a milestone-anchored channel may reference") | 11 |
| FRAG-gb-draft-state-review | draft_state full dump, `=`-joined ("the milestones and feedback channels you may reference BY INDEX, plus context prose") | 14 |
| FRAG-gb-draft-state-prose | draft_state filtered to current/desired/rationale | 02, 13 |
| FRAG-gb-draft-state-steps | draft_state filtered to `steps-*-description` step lines | 06, 07, 09, 10 |
| FRAG-gb-draft-state-steps-milestones | step lines + milestone target-date lines | 08 |
| FRAG-gb-draft-state-criteria-channels | criteria text lines + feedback label lines | 12 |

**Fidelity caveat:** two snippets share a fragment only when their blocks are
**byte-identical**. Where two snippets' blocks differ by even one character
(heading word, "VERBATIM" vs "verbatim", a trailing clause), they are
**distinct fragments**. The table above is the **output of the byte-diff**, not
a hand-authored grouping: the decomposition derives each row by exact-string
equality of block content, and the §4 byte-equivalence gate validates that the
factoring still reproduces every snippet's original bytes.

### 1.3 The per-spec fragments (unique text)

For each spec, one or more unique fragments:

- **FRAG-intro-<spec_key>** — the spec-specific system-intro paragraph ("You
  help a school…") plus any spec-specific mid-body instruction prose and the
  spec-specific OUTPUT CONTRACT key-shape body (everything that is NOT a shared
  grounding block and NOT the shared output-contract header). Lifted verbatim.
- Where a snippet interleaves unique prose between grounding blocks, the
  per-spec unique text is an ordered run of 1–N such fragments (see 1.4).

### 1.4 Composition order is interleaved, not "preamble then blocks then intro"

The snippets interleave: intro paragraph → some grounding blocks → a mid-body
instruction → more grounding blocks → task instruction → output contract. So a
spec's `fragment_refs` is an **ordered list that interleaves shared grounding
fragments with per-spec unique-prose fragments**. Per snippet, the ordered
decomposition looks like:

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

The exact per-spec ordered list is derived **mechanically from the snippet
body**: cut the body at block boundaries; each cut is a fragment; record the
order.

Each cut segment carries its surrounding blank lines as the snippet had them
(the whitespace-absorption rule from §1.1): the body is reconstructed by
`"\n".join(fragments[fid].body for fid in fragment_refs)` with no re-spacing,
so the join reproduces the original snippet body byte-for-byte. The §1.2
grounding-block fragments are deduplicated by **block content** (blank lines
around the block trimmed before comparison); composition still requires the
whitespace-inclusive bytes, so the §4 byte-equivalence gate is what confirms a
content-identical fragment reused across specs reconstructs each ref site's
original bytes.

---

## 2. The two schemas

Both schemas follow the established pi-context block-kind shape (see
`session-notes.schema.json`): top-level `{ "<array_key>": [ {items} ] }`,
`additionalProperties: false`, an id `pattern`. Each item **requires its
substantive fields** — the ones marked `(required)` in the per-schema field
lists below, which are what make a fragment or spec usable (a fragment with no
`body` composes nothing; a spec with no `fragment_refs`/`parser` cannot render
or dispatch), so the substrate catches an incomplete item as a validation
failure rather than passing it silently. Only the three identity fields
(`oid`, `content_hash`, `content_parent`) are optional, so pre-stamp items
validate and get stamped on next write.

### 2.1 `prompt-fragment` schema (`schemas/prompt-fragment.schema.json`)

- `array_key`: `fragments`; `data_path`: `prompt-fragment.json`; `prefix`: `FRAG-`.
- Item fields:
  - `id` (string, required) — pattern `^FRAG-[a-z0-9-]+$`. Slug ids (e.g.
    `FRAG-gb-divisions-full`), supplied explicitly.
  - `kind` (string, required, enum) — `preamble` | `grounding-block` |
    `output-contract-header` | `spec-intro` | `spec-contract`. Lets queries
    group fragments by role.
  - `section` (string, optional) — for `grounding-block` fragments, the
    grounding-section name it renders (`divisions`, `policies`, …). Enables
    "find the divisions block" queries and the cross-check that a spec's
    `grounding_sections` set matches the union of its grounding-block
    fragments' `section`s.
  - `body` (string, required) — the verbatim Django-template text of this
    fragment (byte-preserved).
  - `notes` (string, optional) — human note (e.g. "variant: SLO heading").
  - `oid`, `content_hash`, `content_parent` (optional identity fields).

### 2.2 `prompt-spec` schema (`schemas/prompt-spec.schema.json`)

- `array_key`: `specs`; `data_path`: `prompt-spec.json`; `prefix`: `SPEC-`.
- Item fields (mirroring the snippet frontmatter 1:1 + the composition list):
  - `id` (string, required) — pattern `^SPEC-[a-z0-9-]+$`; the canonical id is
    `SPEC-<spec_key>` (e.g. `SPEC-narrative-draft`).
  - `spec_key` (string, required) — the production identity used by the parse
    registry + merge rules (`narrative-draft`, …). Pattern `^[a-z0-9-]+$`.
  - `order` (integer, required) — the dispatch-order index (1–14).
  - `target_step` (string, required).
  - `preview_mode` (string, required).
  - `grounding_sections` (array of string, required) — the section list passed
    to `build_grounding(include=…)`.
  - `deps` (array of string, required, may be empty) — spec_keys this spec
    depends on (the frontmatter `deps`).
  - `fragment_refs` (array of string, required) — the **ordered** list of
    `FRAG-…` ids composing the body (§1.4). Order is significant; this is the
    composition spec.
  - `parser` (string, required) — the production parse-function name
    (`parse_narrative`, …).
  - `source_migration` (string, optional) — the `ai/migrations/00NN_…` path the
    snippet recorded (provenance; the workshop→production bridge anchor).
  - `output_schema` (string, optional) — the human-pointer the frontmatter
    carried (not loaded).
  - `oid`, `content_hash`, `content_parent` (optional identity fields).

## 3. Edge relation_types

Two custom relation types registered in `.workshopping/config.json`
`relation_types[]` (category enum is `ordering | data_flow | membership`):

- `spec_composes_fragment` — `display_name` "composes fragment", category
  `membership`, `source_kinds: ["prompt-spec"]`, `target_kinds: ["prompt-fragment"]`.
  One edge per (spec, fragment) composition pair.
  - **Ordering caveat:** `append-relation` does accept an optional `ordinal`
    on an edge, but pi-context provides **no sibling-ordering guarantee on
    read** — there is no defined order in which a node's edges come back. By
    design choice the **ordered** composition is therefore kept authoritatively
    in the `prompt-spec.fragment_refs` array (which is ordered); the
    `spec_composes_fragment` edges remain the **unordered** queryable/graph
    projection. Render reads order from `fragment_refs`, never from edges.
- `spec_depends_on_spec` — `display_name` "depends on spec", category
  `ordering`, `source_kinds: ["prompt-spec"]`, `target_kinds: ["prompt-spec"]`.
  One edge per (spec, dep) pair, mirroring `deps`. Dispatch order may be derived
  topologically from these edges, or read directly from the spec `order` field.

## 4. Byte-equivalence gate

The factoring's correctness predicate: the fragment decomposition is correct
only if reassembling each spec's `fragment_refs` renders to the same bytes the
current snippet pipeline renders. The gate (trace §7) is a one-shot
`verify-render-parity` harness run after the decomposition emit, before any
cutover.

For each of the 14 specs, with a **fixed draft + fixed seed** held identical
across both runs (the same `build_grounding` output — the grounding must be the
same bytes both runs):

1. **OLD render** — the current snippet pipeline (`load_snippet` +
   `preamble_substitute` + the existing `Template().render()` pass) →
   `rendered_old`.
2. **NEW render** — the substrate pipeline (`load_prompt_spec` +
   `assemble_spec_body` over `fragment_refs` + the same `Template().render()`
   pass) → `rendered_new`.
3. Assert `rendered_old == rendered_new` by **exact string equality**. On any
   mismatch, emit the spec_key and a unified diff and fail the whole gate.

Predicate: **14/14 identical → the factoring is correct (GO)**; **any diff →
the factoring is wrong and must be re-cut (NO-GO)**. Because both sides feed the
same grounding through the same render pass, an exact-equality pass proves the
only thing that changed is where the template **text** came from.

Two cross-checks accompany the per-spec diff:

- **(a)** each spec's `grounding_sections` equals the snippet frontmatter's
  `grounding_sections` for all 14 (the `include=` arg passed to
  `build_grounding` must not drift).
- **(b)** each spec's grounding-block fragments' `section` values are a
  **subset** of that spec's `grounding_sections` ∪ `{seed}` (no orphan block —
  a block whose section the spec does not ground; no missing block). The
  `seed`-conditioned blocks (`FRAG-gb-seed-*`) carry `section: "seed"` — a
  render-context conditional (the `{% if seed %}` steer line, grounded through
  the context `seed` value) rather than a `build_grounding` include section — so
  `seed` is admitted to the subset target even though it is never a member of
  `grounding_sections`.
