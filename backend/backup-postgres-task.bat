@echo off
setlocal
cd /d "%~dp0"
call "%~dp0postgres-config.bat"

set "BACKUP_DIR=%~dp0postgres-backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%i"
set "BACKUP_FILE=%BACKUP_DIR%\winga_postgres_%STAMP%.sql"

set "PG_DUMP_EXE=%ProgramFiles%\PostgreSQL\18\bin\pg_dump.exe"
if not exist "%PG_DUMP_EXE%" set "PG_DUMP_EXE=pg_dump"

"%PG_DUMP_EXE%" --host="%PGHOST%" --port="%PGPORT%" --username="%PGUSER%" --dbname="%PGDATABASE%" --clean --if-exists --create --format=plain --file="%BACKUP_FILE%"

if not "%BACKUP_RETENTION_DAYS%"=="" (
  powershell -NoProfile -Command "Get-ChildItem -Path '%BACKUP_DIR%' -Filter '*.sql' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-%BACKUP_RETENTION_DAYS%) } | Remove-Item -Force"
)
