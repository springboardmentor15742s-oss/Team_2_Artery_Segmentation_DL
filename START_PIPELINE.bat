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
if exist "%~dp0training\stenosis_classifier_curves.png" copy /Y "%~dp0training\stenosis_classifier_curves.png" "%~dp0artery-ai-frontend\public\stenosis_classifier_curves.png" >nul
if exist "%~dp0training\stenosis_classifier_confusion_matrix.png" copy /Y "%~dp0training\stenosis_classifier_confusion_matrix.png" "%~dp0artery-ai-frontend\public\stenosis_classifier_confusion_matrix.png" >nul
if exist "%~dp0training\dataset_inspection_samples.png" copy /Y "%~dp0training\dataset_inspection_samples.png" "%~dp0artery-ai-frontend\public\dataset_inspection_samples.png" >nul
if exist "%~dp0training\segmentation_test_results.png" copy /Y "%~dp0training\segmentation_test_results.png" "%~dp0artery-ai-frontend\public\segmentation_test_results.png" >nul
if exist "%~dp0training\candidate_extraction_test_results.png" copy /Y "%~dp0training\candidate_extraction_test_results.png" "%~dp0artery-ai-frontend\public\candidate_extraction_test_results.png" >nul

echo Training, testing, and segmentation comparison reports are ready under training\.
exit /b 0
