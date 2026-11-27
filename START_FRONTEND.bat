@echo off
cd /d "%~dp0artery-ai-frontend"
echo ======================================================================
echo   INFOSYS ARTERY AI — REACT / VITE CLINICAL PORTAL
echo   Healthcare & Life Sciences AI Lab
echo ======================================================================
if not exist node_modules (
  echo Installing frontend node packages...
  call npm install
)
echo Starting Vite dev server on http://localhost:3000...
npm run dev -- --host 127.0.0.1 --port 3000
pause
