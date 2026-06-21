## Phase 14 — Extension fields for WASC-consultant primitives

**Verification at end:** admin can set `Plan.theme`, `Plan.framing_focus`, `Plan.secondary_framings`, `Plan.priority_tier`, `Plan.priority_rationale`, `Plan.student_impact_framing`, `Plan.subject_kind`, `Plan.provenance`, `Plan.planning_method`. Promotion gate (Phase 12) enforces `Plan.student_impact_framing` non-empty, `Plan.planning_method` set when `Plan.subject_kind.requires_planning_method` is true, and `Plan.priority_rationale` non-empty when `Plan.priority_tier` deviates from `Plan.framing_focus.default_priority_tier`.
**Enables:** US-ext.

> **Superseded in part (post-Phase-15, commit `057f5ed`):** `subject_kind` and `planning_method`
> were relocated from `Plan` to `ActionStep` (per-step classification; the plan is a bundle of
> differently-kinded steps). The kind→method promotion-gate predicate is now evaluated per step.
> The Plan-level field declarations and the plan-level gate wording below (steps 1, 3,
> Verification) describe Phase 14's as-shipped state and are kept as historical record; the
> live model carries these two FKs on `ActionStep`. See `phases/discoveries.md` DISC-14-0521-A.


All Phase 14 fields point at the curator-managed tables introduced in Phase 4. The "table-route vs. enum-route" question is resolved: table-route, uniformly. Members of every vocabulary live as rows the school's curator (working with its WASC consultant) enters. No `TextChoices` for framing / priority / subject kind in `plans/choices.py`.

### Dev steps

1. Add fields to `Plan` in `plans/models/plan.py`:

    - `theme` (translated, `CharField(blank=True, default="")`).
    - `framing_focus` — `ForeignKey(school.FramingVocabulary, null=True, blank=True, on_delete=PROTECT, related_name="plans_primary")`.
    - `secondary_framings` — `ManyToManyField(school.FramingVocabulary, blank=True, related_name="plans_secondary")`.
    - `priority_tier` — `ForeignKey(school.PriorityTier, null=True, blank=True, on_delete=PROTECT)`.
    - `priority_rationale` (translated, `TextField(blank=True, default="")`). Required by `Plan.clean()` when the priority deviates from the framing default.
    - `student_impact_framing` (translated, `TextField(blank=True, default="")`). Required by the promotion gate (non-empty checked at promotion, not at every save — so a draft Plan saves with it empty, matching `current_state`/`desired_state`/`rationale`).
    - `subject_kind` — `ForeignKey(school.SubjectKind, null=True, blank=True, on_delete=PROTECT)`.
    - `provenance` (translated, `TextField(blank=True, default="")`).
    - `planning_method` — `ForeignKey(school.PlanningMethod, null=True, blank=True, on_delete=PROTECT)`. Required by the promotion gate when `subject_kind.requires_planning_method`.

   The four new translated text fields (`theme`, `priority_rationale`, `student_impact_framing`, `provenance`) carry `blank=True, default=""`. The `default=""` is required for migration safety: Phase 14 is the first phase to ADD fields to the already-existing `plans_plan` table, and a NOT-NULL text field without a default makes `makemigrations` prompt interactively for a one-off default (`blank=True` does not suppress that prompt) — which would break the non-interactive IMPL shell. `default=""` makes `makemigrations` non-interactive and matches the gate-enforced-prose semantics (DB-permissive, non-empty enforced only at the promotion gate).

   Extend `plans/translation.py`:

   ```python
   @register(Plan)
   class PlanT(TranslationOptions):
       fields = ("title", "current_state", "desired_state", "rationale",
                 "theme", "priority_rationale", "student_impact_framing", "provenance")
   ```

2. `Plan.clean()`:

   ```python
   def clean(self):
       super().clean()
       if self.framing_focus and self.framing_focus.default_priority_tier_id \
          and self.priority_tier_id \
          and self.priority_tier_id != self.framing_focus.default_priority_tier_id \
          and not self.priority_rationale:
           raise ValidationError({
               "priority_rationale": _("Required when priority deviates from framing default."),
           })
   ```

   The mapping is data, not code: `FramingVocabulary.default_priority_tier` is a column the curator sets per framing row. When the curator wants no default for a framing, that row's `default_priority_tier` is null and the rationale gate does not fire for any deviation from that framing.

3. Promotion-gate additions: append the three deferred conditional predicates to `_check_promotion_gates` in `plans/services.py`, now that the Phase 14 fields exist on `Plan`. (Phase 12 implemented the gate for only the predicates whose fields existed at Phase 12 and explicitly deferred these three — see Phase 12 step 3 "Deferred to Phase 14".) The three predicates to add:

    - `Plan.student_impact_framing` non-empty.
    - If `Plan.subject_kind.requires_planning_method` is true, `Plan.planning_method` is set.
    - The priority-rationale-on-deviation rule, enforced via `Plan.clean()` (defined in step 2): if `Plan.framing_focus.default_priority_tier` is set and differs from `Plan.priority_tier`, then `Plan.priority_rationale` is non-empty. The gate calls `plan.clean()` and surfaces its `ValidationError` into the aggregated gate-failure list.

   These additions preserve the Phase 12 gate's aggregate-all-failures behavior (do not short-circuit on first failure).

4. Extend `plans/admin/plan.py` fieldsets:

   ```python
   fieldsets = (
       (_("Identity"), {"fields": ("title", "author", "cycle")}),
       (_("Problem statement"), {"fields": ("current_state", "desired_state", "rationale", "provenance")}),
       (_("Framing"), {"fields": ("theme", "framing_focus", "secondary_framings",
                                   "student_impact_framing", "subject_kind", "planning_method")}),
       (_("Priority"), {"fields": ("priority_tier", "priority_rationale")}),
       (_("Lifecycle"), {"fields": ("lifecycle",)}),
       (_("Domain alignment"), {"fields": (
           "areas_for_improvement", "learner_outcomes_targeted",
           "mission_areas_targeted", "stakeholder_impact",
           "policies_established", "policies_revised",
       )}),
   )
   ```

   `autocomplete_fields` adds `framing_focus`, `subject_kind`, `priority_tier`, `planning_method`. `filter_horizontal` adds `secondary_framings`.

   Declare `fieldsets`, `autocomplete_fields`, and `filter_horizontal` as **list literals** (not tuples). `PlanAdmin` is `modeltranslation.admin.TranslationAdmin` as of Phase 13; under the project's mypy config a tuple-valued `list_display`/`list_filter`/`fieldsets`/etc. trips `[assignment]` against Django's `list[Any]` annotation resolved through the modeltranslation base. The existing `PlanAdmin` attributes are already list literals; extend them in the same form.

5. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Tests (extend `plans/tests/test_plan.py` and `plans/tests/test_services_advance_plan_status.py`)

Extend `plans/tests/test_plan.py` with cases for each new field (creation with each FK target; M2M membership; translated-field surface). Add a `test_plan_clean.py` covering the priority-rationale-on-override predicate: when `framing_focus.default_priority_tier` is set and `priority_tier` differs, `priority_rationale` is required (ValidationError raised when missing); when `default_priority_tier` is null, no rationale requirement fires. Extend `test_services_advance_plan_status.py` with the Phase 14 conditional gates: `student_impact_framing` required, `planning_method` required when `subject_kind.requires_planning_method` is true.

### Unresolved (no source in repo)

(none)
