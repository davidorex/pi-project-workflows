## Phase 12 — Plan promotion service

**Verification at end:** admin action `advance_plan_status` moves a Plan from `proposed` → `active` only when every gate predicate below holds; `active` → `under-revision`, `under-revision` → `active` (re-gated), `active` → `closed`, `under-revision` → `closed`, and `proposed` → `closed` execute freely; `closed` is terminal.
**Enables:** US-22 — the final step of the create-plan user story (the author advances the plan from proposed to active).


### Dev steps

1. `plans/services.py::advance_plan_status(plan, target_status, by_user)`:

   ```python
   from django.core.exceptions import ValidationError
   from .models import PlanStatusTransition

   def advance_plan_status(plan, target_status, by_user):
       _check_transition_allowed(plan.lifecycle, target_status)
       if target_status == Lifecycle.ACTIVE:
           _check_promotion_gates(plan)
       PlanStatusTransition.objects.create(
           plan=plan, from_status=plan.lifecycle,
           to_status=target_status, by_user=by_user,
       )
       plan.lifecycle = target_status
       plan.save(update_fields=["lifecycle"])
   ```

2. State-transition matrix (the only paths `_check_transition_allowed` permits):

   | From | To | Gated |
   |---|---|---|
   | `proposed` | `active` | yes — full promotion gates |
   | `proposed` | `closed` | no — abandonment |
   | `active` | `under-revision` | no |
   | `active` | `closed` | no — cycle ends |
   | `under-revision` | `active` | yes — full promotion gates re-run |
   | `under-revision` | `closed` | no |

   Any other transition raises `ValidationError`. `closed` is terminal — no transitions out. Reopening a `closed` plan = create a new `Plan` row with `predecessors=[closed_plan]`.

3. Promotion gates (`_check_promotion_gates`) — derived from the user story chain. The gate evaluates each predicate; on failure, raises `ValidationError` listing all failures (not just the first).

   **Plan-level fields:**
    - `Plan.title`, `Plan.cycle`, `Plan.current_state`, `Plan.desired_state`, `Plan.rationale` non-empty.

   **Domain alignment (every alignment named in the user story is required; only policies may be empty):**
    - `learner_outcomes_targeted.exists()` (the `slos_targeted_all` flag satisfies this).
    - `mission_areas_targeted.exists()` (the `mission_areas_targeted_all` flag satisfies this).
    - `stakeholder_impact.exists()`.
    - `areas_for_improvement.exists()`.
    - `accreditation_standards.exists()`.

   **Success criteria + verification (the user story pairs them):**
    - `successcriterion_set.exists()`.
    - Every `SuccessCriterion` has at least one `Measurement` bound via `MeasurementChannel` to at least one `FeedbackChannel`.

   **Action steps (each step's required sub-structure per the user story; sub-steps and dependencies are explicitly "optionally"):**
    - `actionstep_set.exists()`.
    - Every `ActionStep` has ≥1 `Assignment` with `kind=responsible`.
    - Every `ActionStep` has ≥1 `Timeline` row.
    - Every `ActionStep` has ≥1 `RequiredResource` row.
    - Every `ActionStep` has ≥1 `Evidence` linked via the M2M.

   **Communications, reviews, revisions:**
    - `communication_set.exists()`.
    - `reviewevent_set.exists()`. Every `ReviewEvent` has ≥1 `ReviewEventInput`.
    - `revisionrule_set.exists()`.

   **Deferred to Phase 14 (do NOT implement in Phase 12 — the fields do not exist on `Plan` until Phase 14):**

   The following three gate predicates reference `Plan` fields introduced in Phase 14 (`student_impact_framing`, `subject_kind` + `planning_method`, `framing_focus` + `priority_tier` + `priority_rationale`). They are appended to `_check_promotion_gates` by Phase 14, not Phase 12. Phase 12's `_check_promotion_gates` implements only the predicates above, whose fields exist as of Phase 12.

    - `Plan.student_impact_framing` non-empty.
    - If `Plan.subject_kind.requires_planning_method` is true, `Plan.planning_method` is set.
    - `Plan.clean()` (run during admin save and by the gate) enforces: if `Plan.framing_focus.default_priority_tier` is set and differs from `Plan.priority_tier`, then `Plan.priority_rationale` is non-empty.

4. `plans/models/plan.py` add `PlanStatusTransition`:

   ```python
   class PlanStatusTransition(models.Model):
       plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="status_transitions")
       from_status = models.CharField(max_length=32, choices=Lifecycle.choices)
       to_status = models.CharField(max_length=32, choices=Lifecycle.choices)
       by_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
       at = models.DateTimeField(auto_now_add=True)
   ```

   Update `plans/models/__init__.py` to re-export.

5. Stub `plans/services.py::promote_proposal_to_plan` — proposal flow is out of the create-plan user story; declare signature, raise `NotImplementedError`.

6. `plans/admin/actions.py`:

   ```python
   @admin.action(description=_("Advance plan status"))
   def advance_plan_status_action(modeladmin, request, queryset):
       for plan in queryset:
           # target_status comes from a form field on the action; single-row action
           advance_plan_status(plan, target_status, request.user)
   ```

   Wired into `PlanAdmin.actions`.

7. `plans/selectors.py` stubs (file-decomposition spec listed examples; not consumed in the create-plan user story — raise `NotImplementedError`):

   ```python
   def plans_for_department(department_id, cycle_id): raise NotImplementedError
   def action_steps_for_department(department_id, cycle_id): raise NotImplementedError
   def evidence_for_cycle(cycle_id): raise NotImplementedError
   ```

8. `uv run python manage.py makemigrations plans` (for the new `PlanStatusTransition` model), then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with Phase-12 plans perms

9. Data migration `plans/migrations/00NN_extend_permission_groups_phase_12.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 1 new model introduced in this phase (`PlanStatusTransition`). Use the `_ensure_plans_permissions` + content-type iteration pattern from `plans/migrations/0013_extend_permission_groups_phase_11.py` (commit `c7649e8`) — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms (per DISC-03-0519-A, commit `5be0231`).

    Grant set per group — `view_*` only for all three groups:
    - `school_curator` — `view_planstatustransition`.
    - `plan_author` — `view_planstatustransition`.
    - `read_only` — `view_planstatustransition`.

    `PlanStatusTransition` is an append-only audit record written server-side by `advance_plan_status`, not hand-authored in admin. View-only across all three groups preserves the audit history (no `add`/`change`/`delete` grants that would let an author rewrite lifecycle history). This is a deliberate, audit-semantics-justified deviation from the uniform "plan_author full CRUD" Layer-A grant used for author-editable models. Migration is idempotent + reversible. Declares dependencies on the auto-generated Phase-12 model-introducing migration (`plans/00NN_*`) and on `school/0002_seed_permission_groups`.

### Tests (extend `plans/tests/`)

Add `plans/tests/test_planstatustransition.py` (creation + FK PROTECT on `by_user`) and `plans/tests/test_services_advance_plan_status.py` (full coverage of the state-transition matrix: every allowed transition succeeds; every disallowed transition raises ValidationError; every Phase-12 promotion-gate predicate is exercised — plan-level non-empty fields, domain alignment, criteria+measurements pairing, per-ActionStep required sub-structure, communications/reviews/revisions presence; the gate aggregates failures rather than failing on first; `PlanStatusTransition` rows are written for each successful transition). The three Phase-14 conditional predicates are NOT exercised here — Phase 14 extends this test file with those cases when it lands the fields.

### Unresolved (no source in repo)

(none)
