"""US-ONB-4 — staff roster importer.

Reads a CSV roster (the tenant's staff list) and provisions, for each
row, a `User` (email-as-username, unusable password), a school-scoped
`Person`, and one `Holding` per Position atom the row's title cell
references. Idempotent: re-running against the same CSV yields no new
rows. Per-row atomic — each row is its own `transaction.atomic()` block,
so a single bad row does not poison the rest of the import.

Strict-fail posture: an unmapped Division cell, an unmapped title atom,
an empty email, or an email collision with a pre-existing User that has
no linked Person aborts that row (transaction rolled back) and is added
to the error list. Other rows continue.

The CSV's Division column is sparsely populated — only the first row of
each section names its Division — so the importer forward-fills the
last-seen non-empty Division value across subsequent rows. The CSV also
carries hand-entered typos in division names, title names, and
whitespace runs (including embedded newlines); the `DIVISION_MAP` and
`TITLE_TO_POSITION` module constants encode the cleanup mapping from
each observed CSV cell to the canonical seeded `Division.label` /
`(Division.label, Position.label)` pair.

The tenant's seeded inventory (15 Divisions + 46 Positions across
`school/migrations/0006…0055`) covers every CSV title atom, including
`"Director of Future Scholar Innovation Center"` (Axel Chen's row;
landed by `school/0055_seed_innovation_center`).

CLI:

    python manage.py import_staff_roster <csv_path> \
        [--school-slug chiway-repton-xiamen] [--dry-run]

`--dry-run` exercises the full row processing but rolls each row's
transaction back; the per-row stdout lines and the final tally are
identical to a real run, with a `" (DRY RUN — rolled back)"` suffix on
the tally so the operator sees no DB writes occurred.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from school.models import Division, Holding, Person, Position, School
from users.models import User

DEFAULT_SCHOOL_SLUG = "chiway-repton-xiamen"

# CSV "Division" cell (after _normalize_cell) → seeded Division.label.
# Includes typo cleanups ("Mathmatics", "Student AffairsvOffice") and the
# "IHS Principal" row where the CSV puts the role in the Division column.
DIVISION_MAP: dict[str, str] = {
    "IHS Principal": "Principal's Office (PO)",
    "IHS Principal's Office": "Principal's Office (PO)",
    "Mathmatics Subject Group": "Math",
    "Science Subject Group": "Sciences",
    "English Subject Group": "English",
    "Economics & Business Subject Group": "Business and Economics",
    "Humanities Subject Group": "Humanities",
    "Art Department": "Art Department",
    "Music and Sports Department": "Music and Sports Department",
    "College Counseling Department": "College Counseling Department",
    "Academic Affairs Office": "AAO - Academic Affairs Office",
    "Student AffairsvOffice": "SAO - Student Affairs Office (Pastoral and Well-Being)",
    "Library": "Library",
}

# CSV title atom (after _normalize_cell) →
# (seeded Division.label, seeded Position.label).
# Covers every atom observed in the tenant roster, including
# "Director of Future Scholar Innovation Center" (Axel Chen's row;
# landed by school/0055_seed_innovation_center).
TITLE_TO_POSITION: dict[str, tuple[str, str]] = {
    # Subject teachers (with typo + casing variants).
    "Mathmatics Teacher": ("Math", "Math Teacher"),
    "Math Teacher": ("Math", "Math Teacher"),
    "Physics Teacher": ("Sciences", "Physics Teacher"),
    "Chemistry Teacher": ("Sciences", "Chemistry Teacher"),
    "Biology Teacher": ("Sciences", "Biology Teacher"),
    "English Teacher": ("English", "English Teacher"),
    "English teacher": ("English", "English Teacher"),
    "Drama Teacher": ("English", "Drama Teacher"),
    "Business Teacher": ("Business and Economics", "Business Teacher"),
    "Economics Teacher": ("Business and Economics", "Economics Teacher"),
    "Economics and Business Teacher": (
        "Business and Economics",
        "Economics and Business Teacher",
    ),
    "Geography Teacher": ("Humanities", "Geography Teacher"),
    "Chinese Teacher": ("Humanities", "Chinese Teacher"),
    "Psychology Teacher": ("Humanities", "Psychology Teacher"),
    "History Teacher": ("Humanities", "History Teacher"),
    "Art Teacher": ("Art Department", "Art Teacher"),
    "PE Teacher": ("Music and Sports Department", "PE Teacher"),
    "Music Teacher": ("Music and Sports Department", "Music Teacher"),
    # HOD titles: CSV "Head of <X> Subject Group" → seeded
    # "Head of <Division.label>".
    "Head of Mathmatics Subject Group": ("Math", "Head of Math"),
    "Head of Science Subject Group": ("Sciences", "Head of Sciences"),
    "Head of English Subject Group": ("English", "Head of English"),
    # The "&" inside this compound is pre-rewritten by `_split_title_atoms`
    # to "and" so the title survives `&`-splitting as a single atom.
    "Head of Economics and Business Subject Group": (
        "Business and Economics",
        "Head of Business and Economics",
    ),
    "Head of Humanities Subject Group": ("Humanities", "Head of Humanities"),
    "Head of Art Subject Group": ("Art Department", "Head of Art Department"),
    # Director titles (with typo "Drector").
    "Director of AAO": ("AAO - Academic Affairs Office", "Director of AAO"),
    "Drector of AAO": ("AAO - Academic Affairs Office", "Director of AAO"),
    "Director of Student Affairs Office": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "Director of Student Affairs Office",
    ),
    "Director of Teaching and Curriculum Center": (
        "Curriculum and Teaching",
        "Director of Teaching and Curriculum Center",
    ),
    "IHS Principal": ("Principal's Office (PO)", "IHS Principal"),
    # Coordinator + officer titles.
    "College Counseling Department Coordinator": (
        "College Counseling Department",
        "College Counseling Department Coordinator",
    ),
    "Senior Teaching Coordinator": (
        "Curriculum and Teaching",
        "Senior Teaching Coordinator",
    ),
    "AP Coordinator": ("AAO - Academic Affairs Office", "AP Coordinator"),
    "Edexcel Exam Officer": (
        "AAO - Academic Affairs Office",
        "Edexcel Exam Officer",
    ),
    "CIE Exam Officer": ("AAO - Academic Affairs Office", "CIE Exam Officer"),
    "Academic Affairs Officer": (
        "AAO - Academic Affairs Office",
        "Academic Affairs Officer",
    ),
    "IHS Assistant": ("Principal's Office (PO)", "IHS Assistant"),
    # Year Leaders (with "I G2" spacing typo cleanup).
    "AS Year Leader": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "AS Year Leader",
    ),
    "A2 Year Leader": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "A2 Year Leader",
    ),
    "IG1 Year Leader": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "IG1 Year Leader",
    ),
    "IG2 Year Leader": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "IG2 Year Leader",
    ),
    "I G2 Year Leader": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "IG2 Year Leader",
    ),
    # College Counselor + SAO staff + Library.
    "College Counselor": (
        "College Counseling Department",
        "College Counselor",
    ),
    "Dormitory Teacher": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "Dormitory Teacher",
    ),
    "Assistant the Student affairs": (
        "SAO - Student Affairs Office (Pastoral and Well-Being)",
        "Assistant to Student Affairs",
    ),
    "Librarian": ("Library", "Librarian"),
    # Innovation Center Director (Axel Chen's row; landed by school/0055).
    "Director of Future Scholar Innovation Center": (
        "Future Scholar Innovation Center",
        "Director of Future Scholar Innovation Center",
    ),
}


def _normalize_cell(s: str) -> str:
    """Strip, then collapse all runs of whitespace into single spaces.

    The CSV carries embedded newlines (e.g. `"Mathmatics\nSubject Group"`)
    inside quoted fields and stray trailing whitespace on many cells.
    Collapsing every run of `\\s+` to a single space gives the lookup
    keys a stable shape for the module-level maps. Also normalises the
    curly right-single-quote (`U+2019`) to the straight ASCII apostrophe
    so cells like `"IHS Principal’s Office"` align with keys
    written with the straight form.
    """

    if not s:
        return ""
    collapsed = " ".join(s.split())
    return collapsed.replace("’", "'")


def _split_title_atoms(cell: str) -> list[str]:
    """Split a CSV "Position" cell on `&` and normalize each atom.

    `&` is overloaded in the source CSV: it acts both as the inter-atom
    separator AND as part of a canonical compound name (the
    "Economics & Business Subject Group" division and its HOD title).
    Before the split, the substring `Economics & Business` is rewritten
    to `Economics and Business` so the compound name survives splitting
    as a single atom. Map keys for that compound are written in the
    rewritten form. Empty atoms (from a trailing `&` or doubled `&`)
    are dropped.
    """

    if not cell:
        return []
    protected = cell.replace("Economics & Business", "Economics and Business")
    parts = protected.split("&")
    atoms: list[str] = []
    for raw in parts:
        atom = _normalize_cell(raw)
        if atom:
            atoms.append(atom)
    return atoms


def _normalize_email(email: str) -> str:
    """Run Django's `BaseUserManager.normalize_email` against a stripped value.

    Django's normalize_email lowercases the domain part of the address
    only; the local part is preserved verbatim. Empty/whitespace input
    returns the empty string.
    """

    if not email:
        return ""
    return User.objects.normalize_email(email.strip())


class Command(BaseCommand):
    help = (
        "Import the tenant staff roster CSV (US-ONB-4): create User + Person "
        "+ Holding rows per row; idempotent; per-row atomic; strict-fail on "
        "unmapped Division or title atom."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "csv_path",
            type=str,
            help="Path to the staff-roster CSV file.",
        )
        parser.add_argument(
            "--school-slug",
            type=str,
            default=DEFAULT_SCHOOL_SLUG,
            help="Slug of the School the rows belong to (default: %(default)s).",
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

        # Pre-load Division + Position lookups so per-row work is in-memory.
        divisions: dict[str, Division] = {
            d.label: d for d in Division.objects.filter(school=school)
        }
        positions: dict[tuple[str, str], Position] = {
            (p.division.label, p.label): p
            for p in Position.objects.filter(division__school=school).select_related("division")
        }

        persons_created = 0
        persons_reused = 0
        holdings_created = 0
        holdings_deduped = 0
        errors: list[str] = []

        last_division_cell = ""

        with csv_path.open(encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            # Header is CSV line 1; first data row is line 2.
            for row_number, row in enumerate(reader, start=2):
                # Forward-fill Division across rows where the cell is blank.
                raw_division = (row.get("Division") or "").strip()
                if raw_division:
                    last_division_cell = raw_division
                division_cell = last_division_cell

                try:
                    with transaction.atomic():
                        result = self._process_row(
                            row=row,
                            row_number=row_number,
                            division_cell=division_cell,
                            school=school,
                            divisions=divisions,
                            positions=positions,
                        )
                        # Counter updates happen even under --dry-run so the
                        # final tally reports what the run WOULD have created.
                        if result["person_created"]:
                            persons_created += 1
                        else:
                            persons_reused += 1
                        holdings_created += result["holdings_created"]
                        holdings_deduped += result["holdings_deduped"]

                        if dry_run:
                            transaction.set_rollback(True)

                        self.stdout.write(
                            self.style.SUCCESS(
                                f"row {row_number}: ok — Person({result['display']}) "
                                f"[{result['email']}] with "
                                f"{result['holdings_total']} Holding(s)"
                            )
                        )
                except _RowError as exc:
                    errors.append(f"row {row_number}: {exc}")
                    self.stdout.write(self.style.ERROR(f"row {row_number}: FAILED — {exc}"))

        suffix = " (DRY RUN — rolled back)" if dry_run else ""
        self.stdout.write(
            self.style.WARNING(
                f"Tally{suffix}: "
                f"persons_created={persons_created}, "
                f"persons_reused={persons_reused}, "
                f"holdings_created={holdings_created}, "
                f"holdings_deduped={holdings_deduped}, "
                f"errors={len(errors)}"
            )
        )
        if errors:
            self.stdout.write(self.style.ERROR("Errors:"))
            for line in errors:
                self.stdout.write(self.style.ERROR(f"  {line}"))

    def _process_row(
        self,
        *,
        row: dict[str, str],
        row_number: int,
        division_cell: str,
        school: School,
        divisions: dict[str, Division],
        positions: dict[tuple[str, str], Position],
    ) -> dict[str, Any]:
        """Resolve and persist one CSV row; raise `_RowError` on any failure.

        The whole method runs inside the caller's `transaction.atomic()`
        block, so any raised `_RowError` propagates the transaction
        rollback up to `handle`, leaving the row's partial work voided.
        """

        # Resolve Division via DIVISION_MAP → divisions lookup.
        division_key = _normalize_cell(division_cell)
        if not division_key:
            raise _RowError("missing Division (no forward-fill value yet)")
        mapped_division_label = DIVISION_MAP.get(division_key)
        if mapped_division_label is None:
            raise _RowError(f"unmapped Division cell {division_key!r}")
        division = divisions.get(mapped_division_label)
        if division is None:
            raise _RowError(
                f"Division {mapped_division_label!r} mapped from "
                f"{division_key!r} is not seeded for this school"
            )

        # Extract name + email columns.
        family = _normalize_cell(row.get("Last Name") or "")
        given = _normalize_cell(row.get("First Name") or "")
        display = _normalize_cell(row.get("English Name") or "")
        email = _normalize_email(row.get("Email") or "")
        title_cell = row.get("Position") or ""

        if not email:
            raise _RowError("missing email")

        atoms = _split_title_atoms(title_cell)
        if not atoms:
            raise _RowError("missing Position atoms")

        # Pre-resolve all atoms BEFORE any User/Person writes so an
        # unmapped atom on row N does not leave behind a partial User
        # if it were the last operation — the atomic block would roll
        # back anyway, but failing fast keeps error semantics clear.
        resolved_positions: list[Position] = []
        for atom in atoms:
            mapped = TITLE_TO_POSITION.get(atom)
            if mapped is None:
                raise _RowError(f"unmapped title atom {atom!r}")
            div_label, pos_label = mapped
            position = positions.get((div_label, pos_label))
            if position is None:
                raise _RowError(
                    f"Position {(div_label, pos_label)!r} mapped from "
                    f"atom {atom!r} is not seeded for this school"
                )
            resolved_positions.append(position)

        # User idempotency: lookup by normalized email.
        existing_user = User.objects.filter(email=email).first()
        person_created: bool
        if existing_user is not None:
            linked_person = Person.objects.filter(user=existing_user).first()
            if linked_person is None:
                raise _RowError(
                    f"email {email!r} already belongs to a pre-existing User "
                    f"with no linked Person (collision)"
                )
            user = existing_user
            person = linked_person
            person_created = False
        else:
            user = User.objects.create_user(email=email, password=None, school=school)
            # Person lookup: prefer user-link, then 3-field name fallback.
            person = Person.objects.filter(user=user).first()
            if person is None:
                person = Person.objects.filter(
                    school=school,
                    family_name=family,
                    given_name=given,
                    display_name=display,
                ).first()
            if person is None:
                person = Person.objects.create(
                    school=school,
                    family_name=family,
                    given_name=given,
                    display_name=display,
                    user=user,
                )
                person_created = True
            else:
                if person.user_id is None:
                    person.user = user
                    person.save(update_fields=["user"])
                person_created = False

        holdings_created_n = 0
        holdings_deduped_n = 0
        for position in resolved_positions:
            _, created = Holding.objects.get_or_create(person=person, position=position)
            if created:
                holdings_created_n += 1
            else:
                holdings_deduped_n += 1

        return {
            "person_created": person_created,
            "holdings_created": holdings_created_n,
            "holdings_deduped": holdings_deduped_n,
            "holdings_total": holdings_created_n + holdings_deduped_n,
            "display": person.display_name or person.given_name or email,
            "email": email,
        }


class _RowError(Exception):
    """Raised inside `_process_row` to abort the row's atomic block.

    Carrying its own type lets `handle` distinguish row-level failures
    (caught + logged + continue) from any unexpected exception
    (uncaught, propagates and aborts the whole import).
    """
