# NORTH STAR — the end result this project must produce

This is the single statement of the end result. It is a **consolidation of already-settled decisions** — it invents nothing; each section cites its source. Every downstream decision (the orchestration trio, the per-element assists, the promotion gate, the data model, the prompts) **derives from and is checked against this**. If a proposed piece of work does not serve this end, it is out of scope (the human decides scope).

Sources consolidated: DEC-29 (north star + crystallized thesis), DEC-20 (model-is-contract), DEC-30 / DEC-33 (draft review + staged runner), DEC-41 (workshop = dev-time mode), DEC-57 (production architecture), DISC-22 (responsibility atoms), the US-DRAFT frame (`phases/00-preamble.md:148`).

---

## The end result — the user's own words (DEC-29 crystallized thesis, 2026-05-26)

> "Given your vision, given the WASC criteria, given divisions and positions and their stated responsibilities (which also functions as a job description), given your school-wide learning outcomes, and given your stakeholders — what is the best route (using deep knowledge of learning and pastoral and teaching etc. best practices) through the modeled framework to the desired state, through a series of steps and milestones."

## What the school admin gets (DEC-29 end-state; DEC-20)

The admin writes ONLY the **current state** and the **desired end state**. The system proposes EVERY remaining element of the plan — framing/priority, WASC-standard alignment, milestones (+ improvement type + method), phases, action steps (+ assignments, timeline, resources, evidence), success criteria (+ measurement), feedback channels, communications, review events, revision rules. The result is a **fully-completed proposed draft** (`lifecycle=proposed`) the admin evaluates and fine-tunes; the admin **alone** activates it (draft → active). The AI never persists and never flips — it produces editable prefills, and every model `clean()` / CheckConstraint is the backstop (DEC-20).

## The givens map to the model (DEC-29; DISC-22)

- vision / mission → `GuidingStatement` + clauses
- WASC criteria → `AccreditationStandard` + `PlanAccreditationStandard.rationale`
- divisions + positions + their responsibilities (= the role's standing **job description**, single source of truth) → `DivisionResponsibility` + `PositionResponsibility`
- school-wide learning outcomes → `LearnerOutcome`
- stakeholders → `StakeholderGroup`
- best-practice knowledge (learning / pastoral / teaching) → the LLM's own reasoning
- the route → steps + milestones over the `Plan` graph

## The route must carry two WASC loops (DEC-29; gate-enforced by `_check_promotion_gates`)

The "best route" is not task sequencing alone. A promotion-ready draft cannot omit either loop:

1. **Incorporate stakeholder feedback** — in formulation (DEC-30 draft-review commenting + DEC-33 per-stage review) and going-forward (`FeedbackChannel` per stakeholder / `Communication` / `ReviewEvent` inputs).
2. **Measure progress with evidence and re-evaluate success** — `SuccessCriterion` (typed verification + target) with a `Measurement` bound to a feedback channel; `Evidence` per step; `ReviewEvent` + `RevisionRule` as the re-evaluation process; over `Milestone` checkpoints.

## Done means (the acceptance test)

A **proposed draft that passes `_check_promotion_gates`** — every gate predicate holds — produced from the admin's current + desired input, which the admin then activates. Nothing less is done; nothing more is required of the end result itself.

## Explicitly NOT the end result (DEC-29 exclusions; standing KPI exclusion)

Not on the critical path: KPIs, notifications, hooks; per-step dependencies (US-UI-4); the named-person roster (D7) and `Assignment.position`; RRULE; evidence-artifact file payloads. **KPIs are a standing project exclusion** — measurement tools are instruments/methods; numbers appear only inside a target criterion.

## The means serve the end (DEC-57; DEC-41)

The production realization is the orchestration trio (US-LLM-23/24/25), built lean in the Django app, reusing the existing validators / grounding / promotion gate (DEC-57). The prompt-workshop is the development-time mode of that same implementation, not a separate system (DEC-41). **The means are chosen because they serve this end; when a means stops serving it, the means is wrong — not the end.**

## How to use this

Before any plan, task, or design decision: state how it serves this end. If it does not, it is out of scope. Decisions **derive from** this artifact; they do not invent past it. When this artifact and a downstream document disagree, the disagreement is a defect to resolve — surface it, do not paper over it.
