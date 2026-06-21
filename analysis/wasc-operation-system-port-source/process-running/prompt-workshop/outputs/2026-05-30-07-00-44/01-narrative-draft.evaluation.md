# Experiment evaluation — A1 narrative-draft, post-DEC-40 re-dispatch

**Response capture**: `01-narrative-draft.response.json` (raw LLM output — apply.py rejected at parse; no merged-draft capture written).
**Spec**: `narrative-draft` (A1; production slug `plan-narrative-draft`)
**Corpus state**: post-`560bb8b` (DEC-39 + DEC-40 chains, F1 prompt-side hardening, DISC-30 recorded).
**Dispatch sub-agent**: general-purpose, opus
**Pre-dispatch draft state**: A1 prose fields cleared; rest of draft retained (milestones, criteria, alignment, etc. from prior dispatches).
**Dispatched at**: 2026-05-30T07:00:44

## Disposition

**PARSER FALSE-POSITIVE REJECTION — extraction defects in `_freetext_audit.py` over-flag valid catalogue-named entities.** The LLM did not fabricate. Every named entity in the 5 prose fields is a real Chiway catalogue member. The noun-phrase extractor misgrouped spans (comma-lists collapsed; sentence boundaries crossed; parens unbalanced) and produced 10 rejected spans that look like fabrication catches but are extraction bugs.

## What the parser rejected (10 spans, all false positives)

| Rejected span | Extraction defect class | Actual content |
|---|---|---|
| `Schoolwide Learner Outcomes` | class-noun-not-entity | Generic class noun ("the seven Schoolwide Learner Outcomes" — SLO is the class; individual SLOs are the entities). Should be in `KNOWN_GENERIC_TERMS`. |
| `Only Confident` | sentence-initial-merge | "Only" (sentence-start article) + "Confident" (real SLO). Extractor grouped them. |
| `Bilingual Communicators, Compassionate, Engaged, Innovative, Reflective, and Responsible` | comma-list-collapse | 6 real SLOs separated by commas + Oxford "and". Extractor treated the whole list as one span. Each item individually is in the catalogue. |
| `Math, English, Humanities, Sciences, Business and Economics, Art Department, and Music and Sports Department` | comma-list-collapse | 7 real Divisions separated by commas. Same defect. |
| `SLO-tagged. PLC` | sentence-boundary-cross | "SLO-tagged" ends one sentence, "PLC" starts the next. Extractor crossed the period. |
| `SAO - Student Affairs Office (Pastoral and Well-Being` | paren-unbalance | Real Division `"SAO - Student Affairs Office (Pastoral and Well-Being)"` — close paren stripped by extractor before lookup. |
| `Principal's Office (PO` | paren-unbalance | Real Division `"Principal's Office (PO)"` — same defect. |
| `SAO - Student Affairs Office (Pastoral and Well-Being` | paren-unbalance (repeat) | Same as above; second occurrence in the prose. |
| `Students in IG1, IG2, AS, and A2` | comma-list-collapse + entity-mix | "Students" (real Stakeholder group) + "in" (preposition) + 4 real Year Groups (IG1, IG2, AS, A2). Whole phrase grouped. |

## Cross-check against actual catalogue (manual, every named entity in the prose)

Walking the full 5-field output, every concrete name is a real catalogue member:
- **SLOs named**: Confident, Bilingual Communicators, Compassionate, Engaged, Innovative, Reflective, Responsible — all 7 enumerated.
- **Divisions named**: Math, English, Humanities, Sciences, Business and Economics, Art Department, Music and Sports Department, SAO - Student Affairs Office (Pastoral and Well-Being), Principal's Office (PO), Curriculum and Teaching, AAO - Academic Affairs Office, College Counseling Department, Future Scholar Innovation Center, Library, Recruitment and Admissions — full divisional roster.
- **Positions named**: IHS Principal, Director of Teaching and Curriculum Center, Director of Student Affairs Office, Director of AAO — all real.
- **Year groups named**: IG1, IG2, AS, A2 — all 4 enumerated.
- **Mission areas named**: Academic excellence, Caring and safe community, Global citizenship — all 3 enumerated.
- **Mission/vision clauses named**: GROUNDED, ROUNDED, UNBOUNDED — all real mission clauses.
- **WASC standards named**: A1, A4, B1, B2, B3, C1 — all real codes.
- **Areas for improvement named**: Bilingual Environment, Curriculum and Learning, Faculty PD and PLC, School Culture, Student Data and Well-being, Community Involvement, Resources and Tools — all 7 enumerated.
- **Stakeholder groups named**: Administration / Leadership, Staff / Faculty, Students, Parents, Parent Committee — all real.

**Fabricated names: 0.** Comparable to the post-DEC-40 F1 re-dispatch: prompt-language enforcement continues to suppress LLM fabrication; parser extractor is the bug, not the LLM output.

## Voice-constraint observations under the strengthened preamble

- No em-dash chains
- No rhetorical tetrads (the comma-lists in the prose are factual enumerations of real entities, not rhetorical sweeps)
- No "across all four X" antipatterns
- No abstract-noun stacks
- No hedged transitions
- No summative meta-claims
- Sentences are short, declarative, fact-named. Matches the school-report register.

The strengthened voice constraint is holding empirically on a second spec (F1 + now A1).

## Closure direction (recorded as DISC-31)

Fix `_freetext_audit.py::extract_proper_name_spans` extraction defects:

1. **Comma-list splitting**: a span like "Math, English, Humanities" should be split on `,` (and ` and `) into individual candidate names, each checked against the catalogue separately.
2. **Sentence-boundary respect**: don't extend a span across `.` `?` `!` followed by whitespace + capital letter.
3. **Paren balance**: when stripping outer punctuation, balance parentheses — either include the matching close-paren or skip the open-paren entirely. Catalogue entries like "SAO - Student Affairs Office (Pastoral and Well-Being)" should match the same span in prose.
4. **Class-noun denylist additions**: add "Schoolwide Learner Outcomes", "Schoolwide Learner Outcome", "SLO", "SLOs" (and similar class-noun-not-entity tokens) to `KNOWN_GENERIC_TERMS`. These are concept names, not entity names.
5. **Sentence-initial article handling**: extend the leading-article strip ("The", "A", "An") to also drop sentence-initial adverbs/qualifiers ("Only", "Even", "Just", etc.) before catalogue lookup; OR ensure the span starts at the first content noun.

The bug class is enumerable from the test fixture; the closure direction is concrete.

## Forensic artifacts persisted

- `01-narrative-draft.response.json` — raw LLM JSON response (the would-be capture; not merged because parser rejected at the noun-phrase scan)
- `01-narrative-draft.evaluation.md` — this file

The prior 14-spec test suite for parser closure (Commit 5 of DEC-40, `6d43a2a`) does not exercise the extraction defects this dispatch surfaced — the synthetic test fixtures used short, simple inputs that don't have comma-lists or paren-bearing entity names or cross-sentence boundaries. DISC-31's closure work must include unit tests covering each defect class above, using fixtures derived from this dispatch's actual LLM output.

## Signal for next iteration

A1 re-dispatch is blocked on DISC-31 (the noun-phrase extractor defects) just as F1 re-dispatch is blocked on DISC-30 (the PlanningMethod M2M coverage). Two distinct blockers; both surfaced empirically by the post-DEC-40 verification runs; both need closure before workshop iteration resumes cleanly. The user owns sequencing.

Note: DISC-31 is a parser-side defect — a bug in `_freetext_audit.py`. DISC-30 is a tenant-data gap — admin curation incomplete. Different fix surfaces.
