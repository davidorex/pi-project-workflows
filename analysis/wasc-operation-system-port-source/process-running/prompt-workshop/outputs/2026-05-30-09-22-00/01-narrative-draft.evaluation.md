# Experiment evaluation — A1 narrative-draft, post-ai/0021 re-dispatch

**Response capture**: `01-narrative-draft.response.json`
**Spec**: `narrative-draft` (A1)
**Corpus state**: post-`7bac2e3` (DEC-39 + DEC-40 + DEC-41 + ai/0018/0019/0020/0021 + DISC-30/31 closures + VERBATIM-label preamble strengthening + F1 type-method directive mirror)
**Dispatch sub-agent**: general-purpose, opus
**Pre-dispatch draft state**: A1 prose fields cleared; rest of draft retained
**Dispatched at**: 2026-05-30T09:22:00

## Disposition

**PARSER FALSE-POSITIVE REJECTION — 6th extraction defect class (colon-boundary) surfaced as DISC-32.** LLM produced clean fabrication-free output. Parser rejected on a single span where the extractor crossed a colon `:` between two semantically-distinct token runs.

## What the parser rejected (1 span, 1 defect class)

```
['Schoolwide Learner Outcomes: Bilingual Communicators']
```

Source prose in `current_state` field:
> "The school operates with seven Schoolwide Learner Outcomes: Bilingual Communicators, Compassionate, Confident, Engaged, Innovative, Reflective, and Responsible."

The extractor's behavior:
- "Schoolwide Learner Outcomes" is in `KNOWN_GENERIC_TERMS` per DISC-31's closure (class-noun-not-entity addition)
- Following text: `: Bilingual Communicators, ...` (colon + space + first SLO)
- Extractor did NOT treat `:` as a span-terminator
- "Bilingual Communicators" (a real SLO) attached to "Schoolwide Learner Outcomes" via the colon → joined span "Schoolwide Learner Outcomes: Bilingual Communicators"
- All-tokens-generic shortcut failed (Bilingual Communicators isn't generic)
- Catalogue admit failed (no entry matches the joined span)
- → ValueError

**Sibling defect class to DISC-31.** DISC-31's closure (commit `141f8f4`) added comma + Oxford "and" + semicolon + sentence-terminator + paren-balance + sentence-initial-qualifier + class-noun denylist. Colon was not in scope. The class of fix is identical (terminate the span at the punctuation boundary, treat what follows as a separate candidate).

## Cross-check against catalogue (manual; the LLM's actual output)

Every named entity in the 5 prose fields is verbatim catalogue:
- **SLOs**: all 7 (Bilingual Communicators, Compassionate, Confident, Engaged, Innovative, Reflective, Responsible)
- **Divisions**: 12 (AAO - Academic Affairs Office, Art Department, Business and Economics, College Counseling Department, Curriculum and Teaching, English, Future Scholar Innovation Center, Humanities, Library, Math, Music and Sports Department, Sciences, SAO - Student Affairs Office (Pastoral and Well-Being)) — full forms with parens, no paraphrasing
- **Positions**: Director of Teaching and Curriculum Center, Director of AAO, Director of Student Affairs Office, IHS Principal, Senior Teaching Coordinator, PD Leader, Heads of Department (class noun used as plural) — all real
- **Year groups**: IG1, IG2, AS, A2 — all 4
- **Mission areas**: Academic excellence, Caring and safe community, Global citizenship — all 3
- **Mission clauses**: GROUNDED, ROUNDED, UNBOUNDED — verbatim
- **WASC standards**: A1, A4, B1, B2, B3, C1 — verbatim codes
- **AFIs**: all 7
- **Stakeholder groups**: all 5

**Fabricated names: 0.**

The VERBATIM directive (added in `ai/0021`) worked: LLM used `Math` not "Mathematics Department"; `Music and Sports Department` (catalogue form); `SAO - Student Affairs Office (Pastoral and Well-Being)` (full hyphenated form with parens); `AAO - Academic Affairs Office` (full hyphenated form). Variant-form vector closed empirically. The numeric-token vector also passed cleanly ("Term 2", "2025-2026 cycle", "90 percent" all admitted).

The ONE defect was the colon-boundary, a sibling class to DISC-31 not previously identified.

## Comparison to prior A1 dispatches

| Dispatch | Result |
|---|---|
| Original A1 (post-DEC-39, pre-DEC-40, `outputs/2026-05-29-15-23-28/05-decompose-action-steps.*`) | F1 only |
| First post-DEC-40 A1 (`outputs/2026-05-30-07-00-44/`) | 10 false-positive spans across 5 defect classes (DISC-31) |
| Post-DISC-31 A1 (this dispatch, `outputs/2026-05-30-09-22-00/`) | 1 false-positive span, 1 new defect class (DISC-32 — colon-boundary) |

The DISC-31 closure cleaned up 5 of 5 known defect classes (regression-tested). One new defect class surfaced that wasn't in scope. Pattern: each empirical re-dispatch shrinks the false-positive surface; the remaining surface is the long-tail of punctuation boundary classes the prior fixtures didn't cover.

## Voice-constraint observations

Holding cleanly: short declarative sentences, no em-dash chains, no rhetorical tetrads, no "across all four X" sweeps, no hedged transitions, no summative meta-claims. The strengthened voice constraint continues to translate empirically.

## Signal for next iteration

A1 re-dispatch is blocked on DISC-32 closure (the colon-boundary fix). Same fix surface as DISC-31 — `_freetext_audit.py::extract_proper_name_spans`. Same closure direction — add `:` (and likely `;` if not already covered, en-dash, em-dash) to the span-terminator set. Regression fixture: the actual A1 response above is the test input.

DISC-32 closure should also audit other prose-punctuation boundaries that might surface as defect-class-N in subsequent re-dispatches: en-dash `–`, em-dash `—`, slash `/`, ellipsis `…`. The simplest closure tightens span-extraction to ONLY consume capitalized-token-runs separated by spaces; any other punctuation terminates the span.

The single-token DISC-29 + DISC-32 colon-boundary together imply the audit module needs a more comprehensive tokenization+boundary pass than the current incremental patches. A future closure direction: replace `_WORD_TOKEN_RE` + ad-hoc punctuation handling with a small grammar (or NLP-library noun-phrase extraction) that handles boundary cases systematically. NOT in scope of DISC-32's immediate fix; recorded for future hardening.

## Forensic artifacts persisted

- `01-narrative-draft.response.json` — raw LLM output (the would-be capture; parser rejected at one colon-boundary span)
- `01-narrative-draft.evaluation.md` — this file
