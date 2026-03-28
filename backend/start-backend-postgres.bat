@echo off
cd /d "%~dp0"
call "%~dp0postgres-config.bat"
echo Starting WINGA backend in PostgreSQL mode...
echo Database: %PGDATABASE% on %PGHOST%:%PGPORT% as %PGUSER%
node server.js
pause
