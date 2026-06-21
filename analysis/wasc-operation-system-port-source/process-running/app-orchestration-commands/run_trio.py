"""TASK (FEAT-010 slice — minimal trigger) — run the production trio end-to-end.

The production orchestration trio is code-complete
(`planner.orchestration.run_trio_to_proposed_plan`) but nothing INVOKES it yet
(only code + tests). This management command is the MINIMAL trigger: it resolves
a school + author, mints a `draft_id`, calls the existing entry, and reports the
result. It is a THIN trigger — it adds no orchestration/gate/promote/Flag logic
of its own, never flips `plan.lifecycle`, and touches none of the trio internals.
(The streaming planner-view UX is a SEPARATE later slice, out of scope here.)

CLI:

    python manage.py run_trio \\
        [--school-slug chiway-repton-xiamen] [--author-email <email>] \\
        [--seed <text>] [--max-rounds <n>] [--dry-run]

Author resolution: `--author-email` if given (else a `CommandError`), otherwise a
single superuser (`User.objects.filter(is_superuser=True).first()`; a
`CommandError` if none). The author OWNS the saved Plan (`plan.author`); there is
no author↔school coupling on the LLM save (the trio pins the school internally).

`--dry-run` runs the trio inside a `transaction.atomic()` block that is rolled
back (`transaction.set_rollback(True)`) after the call, so the work runs but no
Plan persists. A precondition failure — unknown school, unresolvable author, or a
school with no active cycle (the trio's `build_create_post_data` raises a
`ValidationError` BEFORE any write) — surfaces as a clear `CommandError` carrying
its message, never a raw traceback and never a partial Plan.

The LLM is the configured provider (real in production; the command makes real
LLM calls when run for real — that is expected; tests mock it).
"""

from __future__ import annotations

import uuid
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from planner.orchestration import DEFAULT_GATE_CLOSURE_MAX_ROUNDS, run_trio_to_proposed_plan
from plans.choices import FlagSeverity
from school.models import School

DEFAULT_SCHOOL_SLUG = "chiway-repton-xiamen"

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Run the production orchestration trio end-to-end for a school + author "
        "and report the saved proposed Plan, residual gate failures, and must-fix "
        "flags. Thin trigger over run_trio_to_proposed_plan; --dry-run rolls back."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--school-slug",
            type=str,
            default=DEFAULT_SCHOOL_SLUG,
            help="Slug of the School to run the trio for (default: %(default)s).",
        )
        parser.add_argument(
            "--author-email",
            type=str,
            default=None,
            help=(
                "Email of the author user to own the saved Plan. If omitted, a "
                "single superuser is used."
            ),
        )
        parser.add_argument(
            "--seed",
            type=str,
            default="",
            help="Free-text seed steering the narrative draft (default: empty).",
        )
        parser.add_argument(
            "--max-rounds",
            type=int,
            default=DEFAULT_GATE_CLOSURE_MAX_ROUNDS,
            help="Max gate-closure rounds (default: %(default)s).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run the trio but roll back, persisting no Plan.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        school_slug = options["school_slug"]
        author_email = options["author_email"]
        seed = options["seed"]
        max_rounds = options["max_rounds"]
        dry_run = options["dry_run"]

        try:
            school = School.objects.get(slug=school_slug)
        except School.DoesNotExist as exc:
            raise CommandError(f"No School with slug {school_slug!r} exists.") from exc

        author = self._resolve_author(author_email)
        draft_id = uuid.uuid4()

        try:
            with transaction.atomic():
                plan, residual = run_trio_to_proposed_plan(
                    school, author, draft_id, seed=seed, max_rounds=max_rounds
                )
                if dry_run:
                    # Run the full trio, then unwind: the work is rolled back so no
                    # Plan (and no flag row) persists.
                    transaction.set_rollback(True)
        except ValidationError as exc:
            # The trio's precondition failures (e.g. the school has no active
            # cycle, raised by build_create_post_data BEFORE any write) surface
            # here. Re-raise as a clean CommandError carrying the message — no raw
            # traceback, no partial Plan (the atomic block rolled back).
            raise CommandError("; ".join(exc.messages)) from exc

        self._report(plan, residual, dry_run=dry_run)

    def _resolve_author(self, author_email: str | None) -> Any:
        """Resolve the author who will OWN the saved Plan.

        By `--author-email` when given (a `CommandError` if no such user); else a
        single superuser (`CommandError` if none). The author is needed only to
        own the Plan — the LLM save has no author↔school coupling."""
        if author_email:
            author = User.objects.filter(email=author_email).first()
            if author is None:
                raise CommandError(f"No user with email {author_email!r} exists.")
            return author
        author = User.objects.filter(is_superuser=True).first()
        if author is None:
            raise CommandError(
                "No --author-email given and no superuser exists to own the Plan. "
                "Pass --author-email <email>."
            )
        return author

    def _report(self, plan: Any, residual: list[str], *, dry_run: bool) -> None:
        """Report the saved Plan's identity, the residual gate failures, and the
        persisted MUST_FIX flags. Reads back the returned Plan/residual only — adds
        no gate/promote logic."""
        suffix = " (DRY RUN — rolled back, no Plan persisted)" if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"Trio run complete{suffix}. "
                f"Plan pk={plan.pk} title={plan.title!r} lifecycle={plan.lifecycle}"
            )
        )

        if residual:
            self.stdout.write(self.style.WARNING(f"Residual gate failures ({len(residual)}):"))
            for message in residual:
                self.stdout.write(self.style.WARNING(f"  - {message}"))
        else:
            self.stdout.write(self.style.SUCCESS("Gate converged: no residual failures."))

        flags = list(plan.flags.filter(severity=FlagSeverity.MUST_FIX))
        if flags:
            self.stdout.write(self.style.WARNING(f"MUST_FIX flags ({len(flags)}):"))
            for flag in flags:
                self.stdout.write(self.style.WARNING(f"  - {flag.element_path}: {flag.message}"))
        else:
            self.stdout.write(self.style.SUCCESS("No must-fix flags persisted."))
