## Phase 11 — `plans/` — Review loop

**Verification at end:** admin can create `ReviewEvent` rows on a Plan with scheduled date, responsible party, and input `FeedbackChannel`s; admin can create `RevisionRule` rows linked to a `ReviewEvent` with condition + action.
**Enables:** US-20, US-21.


### Dev steps

1. `plans/models/review.py` → `ReviewEvent`, `ReviewEventInput`, `RevisionRule`.

   **`ReviewEvent`** (per noun list):
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `label` — translated CharField.
    - `scheduled_date` — `DateField`.
    - `scheduled_note` — translated TextField, blank=True.
    - `responsible` — polymorphic two-nullable-FK to `school.Department` or `school.Role` + exactly-one `CheckConstraint` per preamble pattern.
    - `inputs` — `ManyToManyField(FeedbackChannel, through="ReviewEventInput")`.

   **`ReviewEventInput`** — through-model for `ReviewEvent.inputs`:
    - `review_event` — `ForeignKey(ReviewEvent, on_delete=CASCADE)`.
    - `feedback_channel` — `ForeignKey(FeedbackChannel, on_delete=CASCADE)`.

   **`RevisionRule`** (per noun list):
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `trigger` — `ForeignKey(ReviewEvent, on_delete=PROTECT)`.
    - `condition` — translated TextField (free prose; human-read at review time).
    - `action` — translated TextField (free prose).

2. Update `plans/models/__init__.py`:

   ```python
   from .review import ReviewEvent, ReviewEventInput, RevisionRule
   ```

3. Extend `plans/translation.py`:

   ```python
   @register(ReviewEvent)
   class ReviewEventT(TranslationOptions):
       fields = ("label", "scheduled_note")

   @register(RevisionRule)
   class RevisionRuleT(TranslationOptions):
       fields = ("condition", "action")
   ```

4. `plans/admin/review.py` → `ReviewEventAdmin` (with `ReviewEventInput` as inline if exposed, else managed via M2M widget) and `RevisionRuleInline` inlined under `ReviewEventAdmin`. `@admin.register(ReviewEvent)`. Admin defaults per the admin-package spec.

5. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with Phase-11 plans perms

6. Data migration `plans/migrations/0013_extend_permission_groups_phase_11.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 3 new models introduced in this phase (`ReviewEvent`, `ReviewEventInput`, `RevisionRule`). Use the `_ensure_plans_permissions` + content-type iteration pattern from `plans/migrations/0011_extend_permission_groups_phase_10.py` (commit `b07218f`) — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms (per DISC-03-0519-A, commit `5be0231`).

    Grant set per group:
    - `school_curator` — `view_*` on `ReviewEvent`, `ReviewEventInput`, `RevisionRule` (curators see but author as `plan_author`).
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on `ReviewEvent`, `ReviewEventInput`, `RevisionRule` (full CRUD).
    - `read_only` — `view_*` on `ReviewEvent`, `ReviewEventInput`, `RevisionRule`.

    Migration is idempotent + reversible. Declares dependencies on the auto-generated Phase-11 model-introducing migration (`plans/0012_*`) and on `school/0002_seed_permission_groups`.

### Tests (extend `plans/tests/`)

Add `plans/tests/test_reviewevent.py`, `test_revieweventinput.py`, `test_revisionrule.py`. Each exercises creation, Owner polymorphism on `ReviewEvent.responsible`, `ReviewEventInput` through-model wiring, `RevisionRule.trigger` FK PROTECT semantics.

### Unresolved (no source in repo)

(none)
