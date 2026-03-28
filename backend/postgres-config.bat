@echo off
set "PGHOST=localhost"
set "PGPORT=5432"
set "PGDATABASE=winga_app"
set "PGUSER=postgres"
set "PGPASSWORD=CHANGE_ME"
set "BACKUP_RETENTION_DAYS=14"

if exist "%~dp0postgres-config.local.bat" (
  call "%~dp0postgres-config.local.bat"
)

set "DATABASE_URL=postgresql://%PGUSER%:%PGPASSWORD%@%PGHOST%:%PGPORT%/%PGDATABASE%"
