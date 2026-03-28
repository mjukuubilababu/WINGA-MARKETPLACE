@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_PORT=4173"
set "BACKEND_PORT=3000"
set "PYTHON_EXE=C:\Python314\python.exe"

if not exist "%PYTHON_EXE%" (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_EXE=python"
  ) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
      set "PYTHON_EXE=py -3"
    ) else (
      echo Python haijapatikana. Tafadhali install Python au tumia static server nyingine.
      pause
      exit /b 1
    )
  )
)

echo Starting WINGA backend on http://127.0.0.1:%BACKEND_PORT% ...
start "WINGA Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && node server.js"

echo Starting WINGA frontend on http://127.0.0.1:%FRONTEND_PORT%/winga.html ...
start "WINGA Frontend" cmd /k "cd /d ""%ROOT%"" && %PYTHON_EXE% -m http.server %FRONTEND_PORT%"

echo.
echo Open the app here:
echo   http://127.0.0.1:%FRONTEND_PORT%/winga.html
echo.
echo Open the admin login here:
echo   http://127.0.0.1:%FRONTEND_PORT%/winga.html#/admin-login
echo.
echo Local admin credentials:
echo   username: admin
echo   password: Admin1234
echo.
pause
