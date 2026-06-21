# Threat model (light)

This document records the threat assumptions the application is built
under. It is intentionally light — the application's user base is one
school's accreditation team, not the open internet. The threat model
sets the bar for design choices made elsewhere in the codebase.

## Trust boundaries

1. **Public internet → reverse proxy.** TLS terminates here. The
   proxy forwards `X-Forwarded-Proto`; `SECURE_PROXY_SSL_HEADER`
   in `prod.py` instructs Django to trust the forwarded value.
2. **Reverse proxy → Django (gunicorn).** Plain HTTP inside the
   container network. `ALLOWED_HOSTS` constrains which hostnames are
   served.
3. **Django → postgres.** Application traffic uses the
   `socrates` role with DML-only grants. The `postgres`
   superuser is reserved for migrations and is not available in the
   running app's environment.
4. **Django → filesystem.** Media uploads land under `MEDIA_ROOT`;
   user uploads are size-capped (`DATA_UPLOAD_MAX_MEMORY_SIZE = 2.5MB`)
   and field-count-capped (`DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000`).

## In-scope threats

- **Credential brute-force.** `django-axes` lockout after 5 failures.
- **Session theft.** `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`,
  `SECURE_HSTS_*` in production.
- **CSRF.** Django CSRF middleware enabled; `CSRF_TRUSTED_ORIGINS`
  enumerated from env in prod.
- **Clickjacking.** `X_FRAME_OPTIONS = "DENY"`; CSP
  `frame-ancestors 'none'` in prod.
- **XSS via injected content.** Django auto-escapes templates;
  strict CSP in prod limits inline-script execution.
- **Admin account compromise.** Admin requires a registered OTP device
  via `OTPAdminSite`.
- **Database role escalation.** Application connects as
  `socrates` with no schema-create grants; schema changes require
  the superuser DSN reserved for migrations.

## Out-of-scope threats (acknowledged)

- **Sophisticated state-actor adversary** with code-execution on
  underlying infrastructure.
- **Insider threat from privileged operators** with shell access to
  the database server.
- **Side-channel attacks** on the host hypervisor.

## Open items

- Object-permission policy. `django-guardian` is installed and wired
  into `AUTHENTICATION_BACKENDS` but no policy applies yet. The
  first feature requiring per-instance authorization will define one.
- Strict CSP in production currently enumerates only `'self'` and
  `data:` (for images). Third-party integrations will require
  explicit allowlist additions.
