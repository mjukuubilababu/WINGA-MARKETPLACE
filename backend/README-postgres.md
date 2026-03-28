# WINGA PostgreSQL Setup

## 1. Create database

Use a PostgreSQL server and create this database:

```sql
CREATE DATABASE winga_app;
```

## 2. Connection config

Main local config file used by backend, backup and restore:

```bat
backend\postgres-config.bat
```

Real machine-specific secret override file:

```bat
backend\postgres-config.local.bat
```

Default values inside it are:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=winga_app
PGUSER=postgres
```

If your password or host changes, prefer editing `postgres-config.local.bat`.

## 3. Start backend

Use:

```powershell
backend\start-backend-postgres.bat
```

On first boot, WINGA will:
- create PostgreSQL tables automatically
- migrate current legacy data from `backend/data/store.json` if the database is empty
- keep uploads in `backend/uploads`

## 4. Backup database

Use:

```powershell
backend\backup-postgres.bat
```

Backups are saved in:

```text
backend\postgres-backups
```

Each backup is saved as a `.sql` file with date and time in the name.

## 5. Restore database

Restore latest backup:

```powershell
backend\restore-postgres.bat
```

Restore a specific backup:

```powershell
backend\restore-postgres.bat "C:\full\path\to\backup.sql"
```

## 6. Default staff accounts

- admin / Admin1234
- moderator / Moderator1234
