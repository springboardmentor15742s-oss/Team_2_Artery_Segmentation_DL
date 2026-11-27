@echo off
setlocal
cd /d "%~dp0"

echo ======================================================================
echo   INFOSYS ARTERY AI - LOCAL APPLICATION STARTUP
echo   Existing model reports and checkpoints are loaded when available.
echo ======================================================================

if not exist "%~dp0.venv\Scripts\python.exe" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10 or newer.
    pause
    exit /b 1
  )
)
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18 or newer.
  pause
  exit /b 1
)

set "APP_ROOT=%~dp0"
echo Checking the API on http://127.0.0.1:8000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; try {$null=Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; $ok=$true} catch {}; if (-not $ok) {Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','START_BACKEND.bat' -WorkingDirectory $env:APP_ROOT -WindowStyle Normal; for($i=0;$i -lt 180;$i++){try {$null=Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; $ok=$true; break} catch {}; Start-Sleep -Seconds 2}}; if (-not $ok) {exit 1}"
if errorlevel 1 (
  echo [ERROR] Backend did not become healthy on port 8000. See the backend window.
  pause
  exit /b 1
)

if not exist "%~dp0artery-ai-frontend\node_modules" (
  echo Installing frontend packages...
  pushd "%~dp0artery-ai-frontend"
  call npm install
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

echo Starting the web portal. Vite may use port 3001 if 3000 is busy.
start "Infosys Artery AI Web Portal" /D "%~dp0artery-ai-frontend" cmd /k npm run dev -- --host 127.0.0.1 --port 3000
echo.
echo Application startup complete. Open the URL printed in the frontend window.
echo API health: http://127.0.0.1:8000/api/health
echo API docs:   http://127.0.0.1:8000/docs
echo Leave backend and frontend windows running while you use the app.
pause
