# Simulation-process arc — iterating the planning PROCESS before encoding it into the workshopping

**Status: CURRENT FOCUS (2026-06-09).** This is the active arc. It survives session compaction via the
pending-actions focus item (`priority:next`) + ORCHESTRATOR-LOG; this MD is its durable charter.

## Why now
The workshopping is **proven to work** end-to-end: the 14-spec pi-workflow runs headless 42/42 against the
Chiway dev DB and produces a complete, parser-clean, promotion-gated draft (FEAT-001–004; the FGAP-018/019/022/
023 fixes). That removes the question "does the machinery run." The open question is now **process quality**:
the draft it produces is structurally shallow — flat, single-method, ownership-concentrated, SLOs named not
operationalized, mission/vision not ideation vectors (DEC-50, DEC-51, DEC-52; FGAP-028/029/030). Fixing that by
editing snippets blind is slow and we keep discovering the real root is architectural, upstream of any one spec.

## What this arc is
We **simulate the planning process** — me (orchestrator) + sub-agents standing in for the workshopping's spec
steps — to iterate the *process design itself* fast and cheaply, BEFORE encoding the validated process back into
the workshopping. The simulation is a **process laboratory**: each act is explicit, runnable, and revisable in a
conversation turn instead of a snippet+fragment+parser+migration cycle.

The process being modeled is the **real-world school planning process** (DEC-52 framing): humans own the
decision acts; the system assists specific acts. The LLM does NOT author the durable frame or the year focus
skeleton — those are human inputs. The arc model:
1. (human) durable frame — vision, mission, SLOs
2. (human) year focus skeleton — the monthly/term foci
3. (human/division) baselines
4. (system-assist) per-division SLO arc drafts — baseline→adjust→measure, the per-department spec
5. (system-assist) synthesis → one coherent canonical draft
6. (human + system) the measurement/review loop → durable, measurable progress

## The loop (how we iterate)
```
human inputs (acts 1–3, via prompt-workshop/sim-intake.md)
   → orchestrator assembles exact per-division context bundles
   → sub-agents draft per-division arcs (act 4)            ← SIMULATION
   → orchestrator synthesizes the canonical draft (act 5)
   → READOUT: did distribution hold? are arcs measurable? where did the process lack an input?
              what would a coherence check catch?
   → the readout FRAMES new filings: FGAP / DEC / heuristic (R-0009) / route decisions
   → refine the process; re-simulate
   → when the process is sound → ENCODE it into the workshopping (spec rewrites/reorder, model links,
     grounding reach) via the canonical pipeline
```
The simulation's **output is two things**: a simulated draft (to read/judge) AND a process-iteration readout
(the real deliverable). The readout is what drives revisions.

## How simulation results become workshopping revisions
The simulation is the cheap front-end; the workshopping is the durable back-end. Findings flow one way:
- A process gap the sim surfaces → filed as a `framework-gaps` item (the investigated finding, current-source
  grounded) and/or a `DEC` (a settled process decision) and/or an R-0009 heuristic.
- Those filings are the **framing for workshopping revisions** — the spec/model/grounding changes that encode the
  validated process, each run through the canonical pipeline (plan → explore → verify → IMPL → adversarial audit
  → cascade, iterate to zero).
- So: **simulate cheaply → settle the process in filings → encode into the workshopping deliberately.** We do not
  edit the workshopping from an un-simulated guess.

## Already-settled process decisions this arc operates under
- `DEC-48` — HRT/YGL/Dormitory Teacher are pure SAO out-of-lesson roles (seeded).
- `DEC-50` / `FGAP-028` — action generation must be responsibility-map-driven, not single-method-template (the
  distribution root). Spec-05 prompt rewrite landed but was insufficient alone (the root is upstream).
- `DEC-51` / `FGAP-029` — the plan must OPERATIONALIZE SLOs per-actor as baseline→adjust→measure arcs; blocked
  by empty SLO descriptions + missing model links (criterion/step ↔ SLO + actor) + no spec directing it.
- `DEC-52` / `FGAP-030` — mission + vision + SLOs are ideation-input vectors; the plan must be visibly
  advancing-vision / vivifying-mission / fostering-SLO-progress-over-time. guiding_statements doesn't reach the
  ideation specs (03/04/05).
- The route landscape (this turn's ideation): per-department fan-out → synthesis, optionally nested under a
  human-authored year focus skeleton (the monthly-focus calendar). The per-department spec = system-assist at
  act 4, bounded by human inputs above and human finalization below.

## The current step
Drive the first simulated pass from `prompt-workshop/sim-intake.md` once the human fills acts 1–3 (+ the B5–B7
scope decisions). The minimum to run is A1 (seed) + A2 (skeleton, real or provisional) + B5–B7; A3 (SLO
descriptions) makes it substantive; A4 (baselines) may be placeholder for a first pass. Output: the simulated
draft + the process readout → the next round of filings.

## Pointers
- Intake / driver: `prompt-workshop/sim-intake.md`
- The proven workshopping (the encode target): `prompt-workshop/README.md`, the 14 snippets, the pi-workflow.
- Governing option space: `docs/prompt-workflow-refinement-governing-options-2026-06-08.md` (R-0011) +
  `docs/plan-generation-heuristics.md` (R-0009, living).
- Decisions: `seed-round-plan.json` (DEC-48/50/51/52); gaps: `.context` framework-gaps (FGAP-028/029/030).
