# Security

## Reporting a vulnerability

Send vulnerability reports to the project owner via private email
rather than opening a public issue. Include a description, a
reproduction recipe, and the commit SHA you observed it on.

Expect an initial acknowledgement within a small number of business
days. Fix timelines depend on severity and complexity.

## Secrets handling

- `.env` is gitignored in the Django project root. Never commit it.
- `.env.example` lists every variable the app reads, without values.
- `detect-secrets` runs as a pre-commit hook against staged content.
- `django-axes` enforces a 5-attempt / 1-hour lockout keyed by
  username + IP on admin and authentication endpoints.
- Admin login requires a verified OTP device via
  `django-two-factor-auth` and `OTPAdminSite`.

## Production posture

`config/settings/prod.py` reads every hardening flag from environment:
HSTS, secure cookies, CSP, CSRF trusted origins. The settings module
refuses to start without `DJANGO_SECRET_KEY` and `ALLOWED_HOSTS`.

## Backups

See `school-improvement-plans/BACKUPS.md` for the documented backup
schedule, retention policy, and restore-test cadence.
