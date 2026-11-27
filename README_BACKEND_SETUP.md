# Backend setup

The FastAPI service is in `backend/`. From the `Artery_Medical` directory, start it with:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
$env:ARTERY_SECRET_KEY = [guid]::NewGuid().ToString('N')
python -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

The API health endpoint is `http://127.0.0.1:8000/api/health`; OpenAPI documentation is at `http://127.0.0.1:8000/docs`.

The main requirements include optional DICOM, NIfTI and MetaImage readers. For a minimal install, install `backend/requirements_imaging.txt` separately when those formats are needed. Image format support does not imply that the 2D research models provide validated 3D clinical inference.

For the complete local application, use `FINAL_REVIEW_README.md` and `START_APP.bat` instead. Do not use identifiable patient data in this demonstration environment.
