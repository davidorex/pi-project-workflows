"""TASK-023 — responsibility-atom importer.

Reads a CSV of responsibility atoms (one statement per row, plus a
`scope` cell naming the owner set the statement materializes onto) and,
for the named school, (1) creates any `is_new` owners — Divisions and
Positions — then (2) attaches each non-blank `responsibility_statement`
as a particularized responsibility atom to every owner the row's `scope`
resolves to, at the owner's grain (Division → `DivisionResponsibility`,
Position → `PositionResponsibility`).

Two passes over the CSV (the file is read once into a row list, then
walked twice): PASS 1 provisions owners flagged `is_new == "yes"` so that
PASS 2's owner-resolution sees them; PASS 2 materializes the atoms.

Idempotent: atom attach is `get_or_create` keyed on
`(owner, statement_en=statement)`, so a re-run — and a materialized
default that equals an owner-specific atom already present on the same
owner — creates nothing new (counted as a dedupe). On create the base
field is set (`statement=value`, which modeltranslation routes to
`statement_en`; `statement_zh_hans` is left blank) and `order` is the
owner's current atom count (append to the tail).

Per-row atomic posture mirrors `users/.../import_staff_roster.py`: each
row is processed inside its own `transaction.atomic()` savepoint and a
`_RowError` aborts just that row (rolled back, logged, continue). All
rows run inside ONE outer `transaction.atomic()` so a committed earlier
row is visible to a later one within the same run (PASS-1 creates the IT
division; the later Director-of-IT row reuses it rather than re-creating
it). `--dry-run` calls `transaction.set_rollback(True)` on that outer
block once at the end, so the full resolution runs but no DB writes
persist and the tally equals what a real run would create. Strict-fail
(`_RowError`) on: an unknown `scope` verb; an `owner` / `positions-under:`
row naming a Division or Position that does not exist (and is not being
created `is_new`); a malformed row (missing the columns a scope needs).

Uses the production `School.objects.get(slug=...)` (NOT the workshop
`get_tenant_school`).

CLI:

    python manage.py import_responsibility_atoms <csv_path> \\
        [--school-slug chiway-repton-xiamen] [--dry-run]
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, cast

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from school.choices import PositionKind
from school.models import (
    Division,
    DivisionResponsibility,
    Position,
    PositionResponsibility,
    School,
    YearGroup,
)

DEFAULT_SCHOOL_SLUG = "chiway-repton-xiamen"


def _infer_kind(label: str) -> str:
    """Infer a new Position's `kind` from its label.

    A label that starts with "Director " or "Head " or ends with
    " Leader" is a leadership seat (`PositionKind.LEADER`); everything
    else is ordinary `PositionKind.STAFF`. The distinction is structural
    so PASS-2's `leader-positions` scope can target seats without
    re-matching label substrings at attach time.

    Returns the stored choice value (`"leader"` / `"staff"`). The
    `PositionKind` members are typed as `(value, label)` tuples under
    django-stubs (so a member-`.value` access is rejected), but the
    member is a valid value wherever the field is assigned; the cast
    narrows it to `str` for the annotated return without changing the
    runtime value.
    """

    if label.startswith("Director ") or label.startswith("Head ") or label.endswith(" Leader"):
        return cast("str", PositionKind.LEADER)
    return cast("str", PositionKind.STAFF)


class Command(BaseCommand):
    help = (
        "Import responsibility atoms from a CSV (TASK-023): create is_new "
        "owners, then materialize each statement onto every owner its scope "
        "resolves to. Idempotent; per-row atomic; --dry-run rolls back."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "csv_path",
            type=str,
            help="Path to the responsibility-atoms CSV file.",
        )
        parser.add_argument(
            "--school-slug",
            type=str,
            default=DEFAULT_SCHOOL_SLUG,
            help="Slug of the School the atoms belong to (default: %(default)s).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Process every row but roll each transaction back (no DB writes).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        csv_path = Path(options["csv_path"])
        school_slug = options["school_slug"]
        dry_run = options["dry_run"]

        try:
            school = School.objects.get(slug=school_slug)
        except School.DoesNotExist as exc:
            raise CommandError(f"No School with slug {school_slug!r} exists.") from exc

        with csv_path.open(encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))

        owners_created = 0
        atoms_created = 0
        atoms_deduped = 0
        errors: list[str] = []

        # The whole run is wrapped in ONE outer atomic block, with each
        # row's work nested in its own `transaction.atomic()` savepoint.
        # The savepoint nesting keeps per-row failure isolation (a row's
        # `_RowError` rolls back only that row, others continue) while
        # letting a committed earlier row be visible to a later one within
        # the run — PASS-1 creates the IT division so the later
        # Director-of-IT row reuses it (one owner, not a re-create). Under
        # --dry-run the OUTER block is rolled back once at the end, so the
        # run writes nothing yet the tally reports what a real run WOULD
        # create (matching the real-run counts exactly).
        with transaction.atomic():
            # PASS 1 — provision is_new owners.
            for row_number, row in enumerate(rows, start=2):
                if (row.get("is_new") or "").strip().lower() != "yes":
                    continue
                try:
                    with transaction.atomic():
                        created_n = self._create_owner(row=row, school=school)
                    owners_created += created_n
                    if created_n:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"row {row_number}: created is_new owner ({self._owner_label(row)})"
                            )
                        )
                except _RowError as exc:
                    errors.append(f"row {row_number} (pass 1): {exc}")
                    self.stdout.write(self.style.ERROR(f"row {row_number}: FAILED — {exc}"))

            # PASS 2 — materialize atoms onto the owners each scope resolves to.
            for row_number, row in enumerate(rows, start=2):
                statement = (row.get("responsibility_statement") or "").strip()
                if not statement:
                    continue
                try:
                    with transaction.atomic():
                        created_n, deduped_n = self._attach_atom(
                            row=row,
                            row_number=row_number,
                            statement=statement,
                            school=school,
                        )
                    atoms_created += created_n
                    atoms_deduped += deduped_n
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"row {row_number}: ok — scope {row.get('scope')!r} "
                            f"→ {created_n} created, {deduped_n} deduped"
                        )
                    )
                except _RowError as exc:
                    errors.append(f"row {row_number} (pass 2): {exc}")
                    self.stdout.write(self.style.ERROR(f"row {row_number}: FAILED — {exc}"))

            if dry_run:
                transaction.set_rollback(True)

        suffix = " (DRY RUN — rolled back)" if dry_run else ""
        self.stdout.write(
            self.style.WARNING(
                f"Tally{suffix}: "
                f"owners_created={owners_created}, "
                f"atoms_created={atoms_created}, "
                f"atoms_deduped={atoms_deduped}, "
                f"errors={len(errors)}"
            )
        )
        if errors:
            self.stdout.write(self.style.ERROR("Errors:"))
            for line in errors:
                self.stdout.write(self.style.ERROR(f"  {line}"))

    # -- PASS 1 helpers ---------------------------------------------------

    def _owner_label(self, row: dict[str, str]) -> str:
        division = (row.get("division") or "").strip()
        position = (row.get("position") or "").strip()
        return f"{division} / {position}" if position else division

    def _create_owner(self, *, row: dict[str, str], school: School) -> int:
        """Provision the is_new Division (and optionally Position) of a row.

        Returns the count of owners newly created by this row (0, 1, or 2;
        2 when both the Division and a Position under it are created in the
        same row). `get_or_create` makes the call idempotent: an owner
        already present is reused, not re-created.

        An optional non-blank `year_group_code` binds the created Position
        to the school's `YearGroup` of that code (set in the create
        `defaults`, and backfilled onto an existing seat that lacks it on a
        re-run). An unknown or blank-after-resolution code is a `_RowError`
        (fail-loud, tallied per the importer's row-error pattern). The
        `(division, label)` get_or_create key is unchanged; `kind` stays
        inferred.
        """

        division_label = (row.get("division") or "").strip()
        position_label = (row.get("position") or "").strip()
        scope_summary = (row.get("scope_summary_reference") or "").strip()
        year_group_code = (row.get("year_group_code") or "").strip()
        if not division_label:
            raise _RowError("is_new row has a blank division")

        year_group: YearGroup | None = None
        if year_group_code:
            year_group = YearGroup.objects.filter(school=school, code=year_group_code).first()
            if year_group is None:
                raise _RowError(
                    f"year_group_code {year_group_code!r} matches no YearGroup for this school"
                )

        created = 0
        division, div_created = Division.objects.get_or_create(
            school=school,
            label=division_label,
            defaults={"scope_summary": scope_summary if not position_label else ""},
        )
        if div_created:
            created += 1

        if position_label:
            position, pos_created = Position.objects.get_or_create(
                division=division,
                label=position_label,
                defaults={
                    "scope_summary": scope_summary,
                    "kind": _infer_kind(position_label),
                    "year_group": year_group,
                },
            )
            if pos_created:
                created += 1
            elif year_group is not None and position.year_group_id is None:
                position.year_group = year_group
                position.save(update_fields=["year_group"])

        return created

    # -- PASS 2 helpers ---------------------------------------------------

    def _attach_atom(
        self,
        *,
        row: dict[str, str],
        row_number: int,
        statement: str,
        school: School,
    ) -> tuple[int, int]:
        """Resolve the row's owner set by `scope` and attach the atom to each.

        Returns `(created, deduped)`. Raises `_RowError` on an unknown
        scope verb or an `owner`/`positions-under:` row naming an absent
        Division/Position.
        """

        scope_raw = (row.get("scope") or "").strip()
        if not scope_raw:
            raise _RowError("missing scope")

        divisions, positions = self._resolve_owners(
            scope_raw=scope_raw,
            row=row,
            school=school,
        )

        created = 0
        deduped = 0
        for division in divisions:
            if self._attach_division_atom(division, statement):
                created += 1
            else:
                deduped += 1
        for position in positions:
            if self._attach_position_atom(position, statement):
                created += 1
            else:
                deduped += 1
        return created, deduped

    def _resolve_owners(
        self,
        *,
        scope_raw: str,
        row: dict[str, str],
        school: School,
    ) -> tuple[list[Division], list[Position]]:
        """Map a `scope` cell to its (divisions, positions) owner set.

        Each returned owner receives the row's atom at its own grain.
        `positions-under:<label>` is split on the FIRST colon only, so a
        division label carrying its own colon/spaces/parens survives
        intact.
        """

        if scope_raw == "all":
            return (
                list(Division.objects.filter(school=school)),
                list(Position.objects.filter(division__school=school)),
            )
        if scope_raw == "all-divisions":
            return list(Division.objects.filter(school=school)), []
        if scope_raw == "all-positions":
            return [], list(Position.objects.filter(division__school=school))
        if scope_raw == "leader-positions":
            return [], list(
                Position.objects.filter(division__school=school, kind=PositionKind.LEADER)
            )
        if scope_raw.startswith("positions-under:"):
            _, _, division_label = scope_raw.partition(":")
            division_label = division_label.strip()
            if not Division.objects.filter(school=school, label=division_label).exists():
                raise _RowError(
                    f"positions-under names Division {division_label!r}, "
                    f"which does not exist for this school"
                )
            return [], list(
                Position.objects.filter(division__school=school, division__label=division_label)
            )
        if scope_raw == "owner":
            return self._resolve_owner_scope(row=row, school=school)
        raise _RowError(f"unknown scope {scope_raw!r}")

    def _resolve_owner_scope(
        self, *, row: dict[str, str], school: School
    ) -> tuple[list[Division], list[Position]]:
        """Resolve a single named owner for `scope == owner`.

        A blank `position` names the Division (division grain); a non-blank
        `position` names the Position `(division, label)` under that
        division (position grain). Either absence is a `_RowError`.
        """

        division_label = (row.get("division") or "").strip()
        position_label = (row.get("position") or "").strip()
        if not division_label:
            raise _RowError("owner scope with a blank division")

        division = Division.objects.filter(school=school, label=division_label).first()
        if division is None:
            raise _RowError(
                f"owner names Division {division_label!r}, which does not exist for this school"
            )

        if not position_label:
            return [division], []

        position = Position.objects.filter(division=division, label=position_label).first()
        if position is None:
            raise _RowError(
                f"owner names Position {(division_label, position_label)!r}, "
                f"which does not exist for this school"
            )
        return [], [position]

    def _attach_division_atom(self, division: Division, statement: str) -> bool:
        """Idempotently attach a division-grain atom; True iff newly created.

        Keyed on `(division, statement_en=statement)`; on create the base
        `statement` field is set (routed to `statement_en` by
        modeltranslation) and `order` is the division's current atom count.
        """

        _atom, created = DivisionResponsibility.objects.get_or_create(
            division=division,
            statement_en=statement,
            defaults={
                "statement": statement,
                "order": DivisionResponsibility.objects.filter(division=division).count(),
            },
        )
        return created

    def _attach_position_atom(self, position: Position, statement: str) -> bool:
        """Idempotently attach a position-grain atom; True iff newly created."""

        _atom, created = PositionResponsibility.objects.get_or_create(
            position=position,
            statement_en=statement,
            defaults={
                "statement": statement,
                "order": PositionResponsibility.objects.filter(position=position).count(),
            },
        )
        return created


class _RowError(Exception):
    """Raised inside a row's processing to abort just that row's atomic block.

    Carrying its own type lets `handle` distinguish row-level failures
    (caught, logged, counted, continue) from an unexpected exception
    (uncaught, aborts the whole import).
    """
