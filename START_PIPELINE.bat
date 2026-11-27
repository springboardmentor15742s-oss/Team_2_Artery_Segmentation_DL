@echo off
setlocal
cd /d "%~dp0"

echo Running the required training and held-out evaluation pipeline...
if exist "%~dp0.venv\Scripts\python.exe" (
  set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else (
  set "PYTHON_EXE=python"
)

"%PYTHON_EXE%" training\train.py
if errorlevel 1 (
  echo [ERROR] Model training failed. The application will not be started.
  exit /b 1
)

"%PYTHON_EXE%" training\test.py
if errorlevel 1 (
  echo [ERROR] Held-out testing failed. The application will not be started.
  exit /b 1
)

"%PYTHON_EXE%" training\compare_segmentation.py
if errorlevel 1 (
  echo [ERROR] Segmentation comparison failed. The application will not be started.
  exit /b 1
)

copy /Y "%~dp0training\segmentation_examples.png" "%~dp0artery-ai-frontend\public\segmentation_examples.png" >nul
copy /Y "%~dp0training\segmentation_comparison.png" "%~dp0artery-ai-frontend\public\segmentation_comparison.png" >nul

echo Training, testing, and segmentation comparison reports are ready under training\.
exit /b 0
