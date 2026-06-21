---
name: project-dev-db-reset-restores-socrates-grants
description: "Resetting this project's dev DB (drop/recreate as postgres) wipes the socrates app-role grants — restore them or the app/createsuperuser fails \"permission denied\""
metadata: 
  node_type: memory
  type: project
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

The dev DB (`school_improvement_plans`, localhost:5433, in the postgres:18 container `school-improvement-plans-postgres-1`) has TWO roles: **`postgres`** (superuser — the DSN CLAUDE.md documents for dev: `postgres://postgres:postgres@localhost:5433/school_improvement_plans`) and **`socrates`** (the app's default role used when a `manage.py` command runs WITHOUT the `DATABASE_URL` prefix).

If you DROP + CREATE + `migrate` the dev DB as `postgres`, every object is postgres-owned and `socrates` has zero grants → any prefix-less `manage.py` command (e.g. `createsuperuser`) fails with `permission denied for table django_migrations`. Restore the grants (matches the original DB; idempotent):

```sql
GRANT USAGE ON SCHEMA public TO socrates;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO socrates;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO socrates;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO socrates;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO socrates;
```

Other gotchas from the same reset:
- **Backups**: local `pg_dump` is v14 vs server v18 → use `docker exec school-improvement-plans-postgres-1 pg_dump -U postgres -Fc -d school_improvement_plans > backup.dump`. Validate a custom-format dump by copying it into the container first (`pg_restore -l` needs a seekable file, not a pipe).
- **What `migrate` alone does NOT reproduce**: persons/holdings/users are 0 after a bare migrate. The staff roster (56 persons / 75 holdings / 56 users) is reproduced by `manage.py import_staff_roster data/may-27-2026-staff-names-crs.csv` (committed CSV). The superuser is manual (`createsuperuser`) — not reproducible from committed sources.
- **Before planning/running migration work, check the actual DB migration state** (`django_migrations` + table presence) — the divergence that triggered all this was an excised attempt's ghost records that planning never inspected. See [[feedback-flagging-is-not-persistence]].
