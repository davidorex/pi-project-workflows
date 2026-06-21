## Phase 15 — Final validation

**Verification at end:** all static checks pass clean and an author can run the full user story end-to-end via admin.


### Dev steps

1. Static checks from `school-improvement-plans/`:

   ```
   uv run python manage.py check
   uv run python manage.py check --deploy
   uv run python manage.py makemigrations --dry-run --check
   uv run ruff check
   uv run ruff format --check
   uv run mypy
   uv run pytest
   uv run pip-audit
   ```

   `check --deploy` deploy-only warnings are informational at this stage (deployment is out of current scope per CLAUDE.md and `00-preamble.md` Layer C framing). `makemigrations --dry-run --check` confirms no pending migrations beyond those committed.

2. End-to-end user-story walkthrough via `/admin/`. The author performs every step from `00-preamble.md` US-1…US-22 plus US-ext, creating one complete `Plan` and advancing it from `proposed` to `active`. Concretely:

    - **US-1** Log into `/admin/` (Phase 1 verified).
    - **US-2** Create a new `Plan` row; set `title`. Lifecycle defaults to `proposed`.
    - **US-3** Set `cycle` FK to a `school.Cycle` row.
    - **US-4** Set `current_state`.
    - **US-5** Set `desired_state`.
    - **US-6** Set `rationale`.
    - **US-7** Add `learner_outcomes_targeted` (M2M).
    - **US-8** Add `mission_areas_targeted` (M2M).
    - **US-9** Add `stakeholder_impact` (M2M).
    - **US-10** Add `policies_established` and/or `policies_revised` (M2Ms).
    - **US-11** Add `areas_for_improvement` (M2M).
    - **US-12** Add `accreditation_standards` rows via the `PlanAccreditationStandard` through inline (per-row rationale).
    - **US-13** Add `SuccessCriterion` rows under the Plan.
    - **US-14** For each criterion, set `verification_kind`; for `target` kind, set `target_value`/`target_unit`/`baseline`; bind to `FeedbackChannel`s via the `Measurement` inline.
    - **US-15** Add `ActionStep` rows under the Plan.
    - **US-16a–h** For each action step: set `description`; add `Assignment` rows (`responsible`, `participant`); add `Timeline` row of appropriate kind; add `RequiredResource` rows; link `Evidence` artifacts; add `SubStep` rows; add `ActionStepDependency` rows.
    - **US-17** Group action steps into `Phase` rows (set `ActionStep.phase`).
    - **US-18** Add `Communication` rows (audience/channel/frequency/owner).
    - **US-19** Add `FeedbackChannel` rows (already exercised in US-14 binding).
    - **US-20** Add `ReviewEvent` rows with `scheduled`, `responsible`, `inputs`.
    - **US-21** Add `RevisionRule` rows linked to a `ReviewEvent`.
    - **US-ext** Set `theme`, `framing_focus`, `secondary_framings`, `priority_tier`, `priority_rationale` (if priority deviates from framing default), `student_impact_framing`, `subject_kind`, `provenance`, `planning_method`.
    - **US-22** Run the `Advance plan status` admin action; observe lifecycle transition `proposed → active` and that all gate validators pass.

3. Language switch verification: switch the admin language picker between English and Simplified Chinese; observe translated fields render in their per-language tab; observe choice labels and `Meta.verbose_name` strings change.

4. The user performs steps 1–3 manually and gives feedback. No automated end-to-end tests (Playwright, Selenium, etc.). Service-layer unit tests on `advance_plan_status` gate predicates and on model constraints (`Assignment` exactly-one, `Timeline` per-kind, `ActionStepDependency` exactly-one + no-self-loop, `SuccessCriterion` target-fields-when-applicable, `Plan.clean()` priority-rationale-on-override) are the test surface. The user-story walkthrough is human-performed.

### Unresolved (no source in repo)

(none)
