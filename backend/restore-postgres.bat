@echo off
setlocal
cd /d "%~dp0"
call "%~dp0postgres-config.bat"

set "BACKUP_DIR=%~dp0postgres-backups"
if not exist "%BACKUP_DIR%" (
  echo No backup folder found at %BACKUP_DIR%
  pause
  exit /b 1
)

if "%~1"=="" (
  for /f "delims=" %%i in ('powershell -NoProfile -Command "$latest = Get-ChildItem -Path '%BACKUP_DIR%' -Filter '*.sql' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($latest) { $latest.FullName }"') do set "BACKUP_FILE=%%i"
) else (
  set "BACKUP_FILE=%~1"
)

if "%BACKUP_FILE%"=="" (
  echo No backup file found to restore.
  pause
  exit /b 1
)

if not exist "%BACKUP_FILE%" (
  echo Backup file not found:
  echo %BACKUP_FILE%
  pause
  exit /b 1
)

set "PSQL_EXE=%ProgramFiles%\PostgreSQL\18\bin\psql.exe"
if not exist "%PSQL_EXE%" set "PSQL_EXE=psql"

echo Restoring from:
echo %BACKUP_FILE%
echo This will recreate the WINGA database from backup.
"%PSQL_EXE%" --host="%PGHOST%" --port="%PGPORT%" --username="%PGUSER%" --dbname="postgres" --file="%BACKUP_FILE%"

if errorlevel 1 (
  echo Restore failed.
  pause
  exit /b 1
)

echo Restore completed successfully.
pause
