@echo off
cd /d "%~dp0backend"
echo ======================================================================
echo   INFOSYS ARTERY AI — FASTAPI BACKEND SERVER
echo   Healthcare & Life Sciences AI Lab
echo ======================================================================
echo Starting uvicorn on http://127.0.0.1:8000...
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
) else (
  python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
)
pause
