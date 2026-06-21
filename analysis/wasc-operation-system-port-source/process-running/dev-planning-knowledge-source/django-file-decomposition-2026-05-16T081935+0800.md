Django best-of-breed decomposition for this project:

## General pattern

**Replace `models.py` with a `models/` package.** Each app's `models/` is a Python package that contains one file per cohesive domain group, plus an `__init__.py` that explicitly re-exports every model. External code continues to write `from plans.models import Plan`; the package layout is internal.

**Adjacent files at the app root** carry non-model concerns: `choices.py` (TextChoices enums), `constraints.py` (reusable Q-expressions), `querysets.py` and `managers.py` (custom query logic), `validators.py` (field-level validation), `signals.py` (post_save / pre_delete handlers), `services.py` (multi-model write paths), `selectors.py` (multi-model read paths), `apps.py` (signal registration in `ready()`).

**Constraint and choice declarations stay close to their models** unless reused across files — then promote to `choices.py` or `constraints.py`.

## Concrete structure

```
users/
├── apps.py
├── choices.py
├── constraints.py
├── querysets.py
├── managers.py              # UserManager (email-as-username)
├── signals.py
├── services.py
├── selectors.py
├── validators.py
├── translation.py
├── models/
│   ├── __init__.py
│   └── user.py              # User (extends AbstractUser; email unique;
│                            #   USERNAME_FIELD='email'; school FK added in Phase 2)
├── admin/
│   ├── __init__.py
│   └── user.py              # UserAdmin
├── locale/
│   ├── en/LC_MESSAGES/
│   └── zh_Hans/LC_MESSAGES/
└── migrations/

plans/
├── apps.py
├── choices.py               # Lifecycle, AssignmentKind, TimelineKind,
│                            #   ResourceKind, EvidenceStatus, VerificationKind
│                            #   (Frequency is a school-level table; DependencyKind dropped)
├── constraints.py           # reusable Q-expressions
├── querysets.py             # PlanQuerySet, ActionStepQuerySet
├── managers.py
├── signals.py
├── services.py              # advance_plan_status, promote_proposal_to_plan (stub)
├── selectors.py             # plans_for_department, action_steps_for_department,
│                            #   evidence_for_cycle (stubs)
├── validators.py
├── translation.py
├── models/
│   ├── __init__.py          # explicit re-exports
│   ├── plan.py              # Plan, PlanPredecessor, PlanAccreditationStandard,
│   │                        #   PlanStatusTransition
│   ├── phase.py             # Phase
│   ├── action.py            # ActionStep, SubStep, Assignment, Timeline,
│   │                        #   RequiredResource, ActionStepDependency
│   ├── verification.py      # SuccessCriterion, Measurement, MeasurementChannel
│   ├── feedback.py          # FeedbackChannel
│   ├── review.py            # ReviewEvent, ReviewEventInput, RevisionRule
│   └── output.py            # Communication, Evidence
├── admin/
│   ├── __init__.py
│   ├── plan.py              # PlanAdmin (+ PlanAccreditationStandard, PlanPredecessor inlines)
│   ├── phase.py             # PhaseAdmin
│   ├── action.py            # ActionStepAdmin (+ SubStep, Assignment, Timeline,
│   │                        #   RequiredResource, ActionStepDependency inlines)
│   ├── verification.py      # SuccessCriterionAdmin, MeasurementAdmin
│   ├── feedback.py          # FeedbackChannelAdmin
│   ├── review.py            # ReviewEventAdmin (+ RevisionRule inline)
│   ├── output.py            # CommunicationAdmin, EvidenceAdmin
│   ├── inlines.py
│   ├── filters.py
│   ├── actions.py           # advance_plan_status_action
│   ├── forms.py
│   └── widgets.py
├── locale/
│   ├── en/LC_MESSAGES/
│   └── zh_Hans/LC_MESSAGES/
└── migrations/

school/
├── apps.py
├── choices.py
├── constraints.py
├── querysets.py
├── managers.py
├── signals.py
├── services.py
├── selectors.py
├── validators.py
├── translation.py
├── models/
│   ├── __init__.py
│   ├── school.py            # School (tenant root)
│   ├── cycle.py             # Cycle
│   ├── org.py               # Department, Role
│   ├── stakeholder.py       # StakeholderGroup
│   ├── outcomes.py          # LearnerOutcome, MissionArea, AreaForImprovement
│   ├── frequency.py         # Frequency (curator-managed cadences)
│   ├── policy.py            # Policy
│   ├── priority_tier.py     # PriorityTier (curator-managed)
│   ├── subject_kind.py      # SubjectKind (curator-managed; requires_planning_method flag)
│   ├── framing.py           # FramingVocabulary (curator-managed; default_priority_tier FK)
│   └── planning_method.py   # PlanningMethod, PlanningStep
├── admin/
│   ├── __init__.py
│   ├── school.py
│   ├── cycle.py
│   ├── org.py               # DepartmentAdmin, RoleAdmin
│   ├── stakeholder.py
│   ├── outcomes.py          # LearnerOutcomeAdmin, MissionAreaAdmin, AreaForImprovementAdmin
│   ├── frequency.py
│   ├── policy.py
│   ├── priority_tier.py
│   ├── subject_kind.py
│   ├── framing.py
│   ├── planning_method.py   # PlanningMethodAdmin (+ PlanningStep inline)
│   ├── filters.py
│   └── actions.py
├── locale/
│   ├── en/LC_MESSAGES/
│   └── zh_Hans/LC_MESSAGES/
└── migrations/

accreditation/
├── apps.py
├── choices.py
├── constraints.py
├── querysets.py
├── managers.py
├── signals.py
├── services.py
├── selectors.py
├── validators.py
├── translation.py
├── models/
│   ├── __init__.py
│   └── standard.py          # AccreditationCategory, AccreditationStandard
├── admin/
│   ├── __init__.py
│   └── standard.py
├── locale/
│   ├── en/LC_MESSAGES/
│   └── zh_Hans/LC_MESSAGES/
└── migrations/
```

## Grouping rationale per file

**`plans/models/plan.py`** — `Plan` and its through-models for self-referential M2M (`PlanPredecessor`) and any plan-level join tables that carry attributes (e.g., per-WASC-standard rationale would live here as `PlanAccreditationStandard`).

**`plans/models/action.py`** — `ActionStep` is the local root; its child tables (`SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency`) belong with it because they have no independent meaning outside an action step. Keeping them in one file makes the action-step aggregate inspectable in one place.

**`plans/models/verification.py`** — `SuccessCriterion` and `Measurement` are tightly coupled (Measurement is the through-model binding criteria to feedback channels). One file.

**`plans/models/review.py`** — `ReviewEvent` and `RevisionRule` are the loop machinery. RevisionRule has no meaning without a ReviewEvent to trigger it.

**`plans/models/output.py`** — `Communication` and `Evidence` are both plan-owned outputs with similar polymorphic-owner patterns. One file.

**`plans/models/feedback.py`** — `FeedbackChannel` is referenced from verification and review but isn't owned by either; its own file.

## `__init__.py` pattern

```python
# plans/models/__init__.py
from .plan import Plan, PlanPredecessor, PlanAccreditationStandard, PlanStatusTransition
from .phase import Phase
from .action import (
    ActionStep, SubStep, Assignment, Timeline,
    RequiredResource, ActionStepDependency,
)
from .verification import SuccessCriterion, Measurement, MeasurementChannel
from .feedback import FeedbackChannel
from .review import ReviewEvent, ReviewEventInput, RevisionRule
from .output import Communication, Evidence

__all__ = [
    "Plan", "PlanPredecessor", "PlanAccreditationStandard", "PlanStatusTransition",
    "Phase",
    "ActionStep", "SubStep", "Assignment", "Timeline",
    "RequiredResource", "ActionStepDependency",
    "SuccessCriterion", "Measurement", "MeasurementChannel",
    "FeedbackChannel",
    "ReviewEvent", "ReviewEventInput", "RevisionRule",
    "Communication", "Evidence",
]
```

```python
# school/models/__init__.py
from .school import School
from .cycle import Cycle
from .org import Department, Role
from .stakeholder import StakeholderGroup
from .outcomes import LearnerOutcome, MissionArea, AreaForImprovement
from .frequency import Frequency
from .policy import Policy
from .priority_tier import PriorityTier
from .subject_kind import SubjectKind
from .framing import FramingVocabulary
from .planning_method import PlanningMethod, PlanningStep

__all__ = [
    "School", "Cycle", "Department", "Role", "StakeholderGroup",
    "LearnerOutcome", "MissionArea", "AreaForImprovement",
    "Frequency", "Policy",
    "PriorityTier", "SubjectKind", "FramingVocabulary",
    "PlanningMethod", "PlanningStep",
]
```

```python
# accreditation/models/__init__.py
from .standard import AccreditationCategory, AccreditationStandard

__all__ = ["AccreditationCategory", "AccreditationStandard"]
```

```python
# users/models/__init__.py
from .user import User

__all__ = ["User"]
```

Explicit imports avoid `from .x import *` ambiguity and let static analyzers and IDEs trace symbols. Models declared in submodule files automatically register with Django because the `__init__.py` imports them before the app loads.

## Services and selectors instead of fat models

Multi-model operations live in `services.py` (writes) and `selectors.py` (reads), not as model methods. Examples:

- `services.promote_proposal_to_plan(proposal_id) → Plan`
- `services.advance_plan_status(plan, new_status, by)`
- `selectors.action_steps_for_department(department_id, cycle_id)`
- `selectors.evidence_for_cycle(cycle_id)`

Models stay focused on their own fields, constraints, and the minimum `clean()` / `save()` logic field-level constraints cannot express. Anything spanning models lives in services or selectors. This keeps `plan.py` from accumulating cross-cutting methods.

## Admin and signals separation

`admin.py` can become an `admin/` package mirroring `models/` (`admin/plan.py`, `admin/action.py`, etc.) once admin classes grow. `signals.py` collects post_save / pre_delete handlers connected in `apps.py::ready()` — keeps signal registration explicit and inspectable.

## What this buys

- Locating any model is one filename lookup.
- Domain groups are inspectable as cohesive units (the action-step aggregate is one file).
- Choices, constraints, querysets, services, and signals each have a single home.
- No model file exceeds a few hundred lines.
- Cross-model write logic is testable as plain functions in `services.py`, not as bound methods on a model.

---

## Apps this pattern applies to, and the phase that introduces each

| App | Phase |
|---|---|
| `users` | Phase 1 |
| `school` | Phases 2 + 4 (Phase 2 introduces the app and the school-organizational + Frequency + Policy models; Phase 4 adds the remaining curator-managed vocabularies) |
| `accreditation` | Phase 3 |
| `plans` | Phase 5 (scaffold + `choices.py`); models land in Phases 6–12 |

Each introducing phase creates: `models/` (package, `__init__.py` re-exports), `admin/` (package, `__init__.py` imports), `apps.py`, `choices.py`, `constraints.py`, `querysets.py`, `managers.py`, `signals.py` (registered in `apps.py::ready()`), `services.py`, `selectors.py`, `validators.py`, `translation.py`, `tests/` (package, `__init__.py` + one `test_<model>.py` per declared model class). Empty stubs acceptable for non-test adjacent files; tests must exercise the model they cover (creation, declared constraints, declared field defaults, polymorphic predicates where applicable). `migrations/` is auto-created by Django.

The `tests/` adjacent package is REQUIRED, not optional. Each model class introduced by a phase gets a `tests/test_<lowercase_model>.py` file in the same commit as the model. Subsequent phases that add models to an existing app extend that app's `tests/` package with new `test_<model>.py` files.

## Per-model file → introducing phase

| File | Models | Phase |
|---|---|---|
| `users/models/user.py` | `User` | 1 |
| `school/models/school.py` | `School` | 2 |
| `school/models/cycle.py` | `Cycle` | 2 |
| `school/models/org.py` | `Department`, `Role` | 2 |
| `school/models/stakeholder.py` | `StakeholderGroup` | 2 |
| `school/models/outcomes.py` | `LearnerOutcome`, `MissionArea`, `AreaForImprovement` | 2 |
| `school/models/frequency.py` | `Frequency` | 2 |
| `school/models/policy.py` | `Policy` | 2 |
| `school/models/priority_tier.py` | `PriorityTier` | 4 |
| `school/models/subject_kind.py` | `SubjectKind` | 4 |
| `school/models/framing.py` | `FramingVocabulary` | 4 |
| `school/models/planning_method.py` | `PlanningMethod`, `PlanningStep` | 4 |
| `accreditation/models/standard.py` | `AccreditationCategory`, `AccreditationStandard` | 3 |
| `plans/models/plan.py` | `Plan`, `PlanPredecessor`, `PlanAccreditationStandard` (6); `PlanStatusTransition` (12) | 6 / 12 |
| `plans/models/phase.py` | `Phase` | 8 |
| `plans/models/action.py` | `ActionStep` (8); `SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency` (9) | 8 / 9 |
| `plans/models/verification.py` | `SuccessCriterion`, `Measurement`, `MeasurementChannel` | 7 |
| `plans/models/feedback.py` | `FeedbackChannel` | 7 |
| `plans/models/review.py` | `ReviewEvent`, `ReviewEventInput`, `RevisionRule` | 11 |
| `plans/models/output.py` | `Communication`, `Evidence` | 10 |

**Phase 14** adds extension fields to `Plan` in `plans/models/plan.py` (no new model file): `theme`, `framing_focus` FK, `secondary_framings` M2M, `priority_tier` FK, `priority_rationale`, `student_impact_framing`, `subject_kind` FK, `provenance`, `planning_method` FK.