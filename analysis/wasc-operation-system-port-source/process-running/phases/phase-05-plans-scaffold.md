## Phase 5 — `plans/` app scaffold + `plans/choices.py`

**Verification at end:** `plans` app installed; admin shows empty Plans section; `manage.py check` clean.


### Dev steps

1. `uv run python manage.py startapp plans`. Replace `models.py`/`admin.py` with packages. Create the full app scaffold:

   ```
   plans/
   ├── apps.py
   ├── choices.py
   ├── constraints.py           # reusable Q-expressions
   ├── querysets.py             # PlanQuerySet, ActionStepQuerySet
   ├── managers.py              # custom managers
   ├── signals.py               # plan lifecycle hooks; registered in apps.py::ready()
   ├── services.py              # create_plan, promote_proposal, advance_status (stubs)
   ├── selectors.py             # plans_for_department, plan_evidence_summary (stubs)
   ├── validators.py            # cross-field validators
   ├── translation.py           # modeltranslation declarations (extended in later phases)
   ├── models/
   │   └── __init__.py          # empty re-export list at this phase
   ├── admin/
   │   ├── __init__.py
   │   ├── inlines.py
   │   ├── filters.py
   │   ├── actions.py
   │   ├── forms.py
   │   └── widgets.py
   ├── tests/
   │   ├── __init__.py
   │   └── test_choices.py       # exercises the TextChoices declarations
   ├── locale/
   │   ├── en/LC_MESSAGES/.gitkeep
   │   └── zh_Hans/LC_MESSAGES/.gitkeep
   └── migrations/
   ```

   `tests/test_choices.py` exercises each `TextChoices` class in `choices.py`: enumerate values, confirm labels resolve under `gettext_lazy`, confirm membership of declared values.

   `apps.py::PlansConfig.verbose_name = _("Plans")`. Add `plans` to `INSTALLED_APPS`. Register signals in `apps.py::ready()`.

2. Populate `plans/choices.py` with `TextChoices` (labels wrapped in `gettext_lazy`):

   ```python
   from django.db import models
   from django.utils.translation import gettext_lazy as _

   class Lifecycle(models.TextChoices):
       PROPOSED = "proposed", _("Proposed")
       ACTIVE = "active", _("Active")
       UNDER_REVISION = "under-revision", _("Under revision")
       CLOSED = "closed", _("Closed")

   class EvidenceStatus(models.TextChoices):
       PLANNED = "planned", _("Planned")
       IN_PROGRESS = "in-progress", _("In progress")
       PRODUCED = "produced", _("Produced")
       VERIFIED = "verified", _("Verified")
       ARCHIVED = "archived", _("Archived")

   class AssignmentKind(models.TextChoices):
       RESPONSIBLE = "responsible", _("Responsible")
       PARTICIPANT = "participant", _("Participant")

   class TimelineKind(models.TextChoices):
       SINGLE = "single", _("Single date")
       RANGE = "range", _("Date range")
       RECURRENCE = "recurrence", _("Recurrence")
       INDEFINITE = "indefinite", _("Indefinite")

   class ResourceKind(models.TextChoices):
       TIME = "time", _("Time")
       FINANCIAL = "financial", _("Financial")
       HUMAN = "human", _("Human")
       EXTERNAL = "external", _("External")
       PLATFORM = "platform", _("Platform")

   class VerificationKind(models.TextChoices):
       INSPECTION = "inspection", _("Inspection")
       JUDGMENT = "judgment", _("Judgment")
       TARGET = "target", _("Target")
   ```

   `Frequency` is a curator-managed table in `school/` (Phase 4), not a `TextChoices` here. `DependencyKind` is dropped — the user story does not differentiate dependency kinds; `ActionStepDependency` carries no `kind` field.

3. Stubs for `plans/constraints.py`, `plans/querysets.py`, `plans/managers.py`, `plans/signals.py`, `plans/services.py`, `plans/selectors.py`, `plans/validators.py`, `plans/translation.py` (translation declarations extended in Phases 6–14).

### Unresolved (no source in repo)

(none)
