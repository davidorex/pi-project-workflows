"""Shared pytest fixtures for two-school admin-scoping tests.

These back `users/tests/test_school_scoped_admin.py` (Slice 4): they build
School A + School B with a representative set of rows in each, a superuser, a
non-superuser school admin bound to School A, and helpers to drive admin hooks
with a `RequestFactory` request that carries an authenticated user (and the
session + messages a changeform request would have).

Placed at the Django project root so pytest-django discovers it for the whole
suite; the fixtures are opt-in by name, so unrelated tests are unaffected.
"""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import pytest
from django.contrib import admin as django_admin
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory

from school.models import Cycle, Division, Holding, Person, Position, School
from users.auth import SCHOOL_ADMIN_GROUP

# Make the repo-root `prompt-workshop/` importable as a PEP 420 namespace
# package (so `import dispatch._workshop` resolves) for the tests that pin the
# workshop draft `flags` channel (planner/tests/test_workshop_flags.py,
# FGAP-005). Done at conftest import — before test collection — so the import
# is available when the test module is collected.
_WORKSHOP_ROOT = Path(__file__).resolve().parent.parent / "prompt-workshop"
if str(_WORKSHOP_ROOT) not in sys.path:
    sys.path.insert(0, str(_WORKSHOP_ROOT))

User = get_user_model()


@pytest.fixture
def two_schools(db):
    """School A and School B, each with a representative set of rows.

    Returns a dict keyed for direct access in tests. Rows cover one
    direct-`school` model (Cycle, Division), one indirect via
    `division__school` (Position), and one indirect via `person__school`
    (Holding, plus the active/inactive Person/User mix the PersonAdmin
    composition test needs).
    """
    school_a = School.objects.create(name="Alpha Academy", slug="alpha")
    school_b = School.objects.create(name="Beta Bilingual", slug="beta")

    cycle_a = Cycle.objects.create(
        school=school_a,
        label="A Cycle",
        code="A1",
        starts_on=datetime.date(2025, 8, 1),
        ends_on=datetime.date(2026, 6, 30),
    )
    cycle_b = Cycle.objects.create(
        school=school_b,
        label="B Cycle",
        code="B1",
        starts_on=datetime.date(2025, 8, 1),
        ends_on=datetime.date(2026, 6, 30),
    )

    division_a = Division.objects.create(school=school_a, label="A Division")
    division_b = Division.objects.create(school=school_b, label="B Division")

    position_a = Position.objects.create(division=division_a, label="A Lead")
    position_b = Position.objects.create(division=division_b, label="B Lead")

    # Active + inactive users per school, for the PersonAdmin compose test.
    # Users carry their own `school` FK; the Person.user picker scopes on it.
    user_a_active = User.objects.create_user(
        email="a.active@alpha.test", password="pw-a-act-123", school=school_a
    )
    user_a_inactive = User.objects.create_user(
        email="a.inactive@alpha.test", password="pw-a-in-123", school=school_a
    )
    user_a_inactive.is_active = False
    user_a_inactive.save(update_fields=["is_active"])
    user_b_active = User.objects.create_user(
        email="b.active@beta.test", password="pw-b-act-123", school=school_b
    )

    person_a = Person.objects.create(
        school=school_a, family_name="Alpha", given_name="Ada", user=user_a_active
    )
    person_a_inactive = Person.objects.create(
        school=school_a, family_name="Inactive", given_name="Ivo", user=user_a_inactive
    )
    person_b = Person.objects.create(
        school=school_b, family_name="Beta", given_name="Bo", user=user_b_active
    )

    holding_a = Holding.objects.create(person=person_a, position=position_a)
    holding_b = Holding.objects.create(person=person_b, position=position_b)

    return {
        "school_a": school_a,
        "school_b": school_b,
        "cycle_a": cycle_a,
        "cycle_b": cycle_b,
        "division_a": division_a,
        "division_b": division_b,
        "position_a": position_a,
        "position_b": position_b,
        "user_a_active": user_a_active,
        "user_a_inactive": user_a_inactive,
        "user_b_active": user_b_active,
        "person_a": person_a,
        "person_a_inactive": person_a_inactive,
        "person_b": person_b,
        "holding_a": holding_a,
        "holding_b": holding_b,
    }


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(email="root@example.test", password="pw-root-123")


@pytest.fixture
def school_admin_a(db, two_schools):
    """A non-superuser staff user in the `school_admin` group, bound to A."""
    user = User.objects.create_user(
        email="admin.a@alpha.test",
        password="pw-admin-a-123",
        is_staff=True,
        school=two_schools["school_a"],
    )
    user.groups.add(Group.objects.get(name=SCHOOL_ADMIN_GROUP))
    return user


@pytest.fixture
def school_admin_no_school(db):
    """A school admin with `school=None` — the fail-closed case."""
    user = User.objects.create_user(
        email="admin.none@example.test",
        password="pw-admin-none-123",
        is_staff=True,
    )
    user.groups.add(Group.objects.get(name=SCHOOL_ADMIN_GROUP))
    return user


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def req_as(rf):
    """Build a GET request bound to `user`, with session + messages.

    Mirrors what a real admin changeform/changelist request carries so the
    admin hooks under test (`get_queryset`, `formfield_for_*`, `has_*`) have a
    fully-formed request to read `request.user` from.
    """

    def _build(user, path="/admin/"):
        request = rf.get(path)
        request.user = user
        request.session = {}
        request._messages = FallbackStorage(request)
        return request

    return _build


@pytest.fixture
def admin_for():
    """Resolve a registered `ModelAdmin` instance from the admin site."""

    def _get(model):
        return django_admin.site._registry[model]

    return _get
