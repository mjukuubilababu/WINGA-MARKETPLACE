# PostgreSQL migrations

Migrations in `index.js` are append-only production history.

- Never rename, reorder, or edit a migration that may have run in production.
- Add a new migration with a lexically increasing identifier.
- Keep each migration backward-compatible with the currently deployed backend.
- The backend acquires a PostgreSQL advisory lock before baseline schema checks and migrations, so rolling Render instances cannot migrate concurrently.
- Each migration runs in its own transaction and is recorded in `schema_migrations` only after commit.
- A frontend Worker deployment does not run these migrations. They run when the Render backend starts with PostgreSQL configured.
- Verify migrations in staging and confirm a current database restore point before production deployment.

The legacy `writeStore()` path remains only as a transitional compatibility path. New production mutations should use row-level repository methods and must include concurrency and rollback tests.
