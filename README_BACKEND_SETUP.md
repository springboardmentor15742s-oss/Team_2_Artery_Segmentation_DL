# Artery AI — Frontend + FastAPI Backend

This package connects the existing React/Vite frontend to a FastAPI backend with SQLite persistence.

## Included backend features
- Login and registration with hashed passwords and signed bearer tokens
- Case create/list/detail/update APIs
- Real multipart upload of selected medical image files to local storage (max 300 MB)
- Notifications, reports, profile update and password-change APIs
- SQLite tables for users, patients, scans, annotations, analysis jobs, segmentation results, stenosis findings, reports, notifications and audit logs
- Health endpoint and interactive API docs

## Important project status
The backend now stores real uploaded files and persists application records. **The trained segmentation/stenosis AI model is not integrated yet.** Uploading a file does not produce a clinical finding; analysis jobs remain pending with an explicit `AI inference is not configured yet` message. Do not present this prototype as clinically validated.

## Run on Windows
Open two terminals from the `Artery_Medical` project folder.

### Terminal 1 — backend
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
If PowerShell blocks activation, use `\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`.

### Terminal 2 — frontend
```powershell
cd artery-ai-frontend
npm install
copy .env.example .env
npm run dev
```
Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

### Demo login
- Email: `s.mitchell@hospital.med.org`
- Password: `Password123!`

Alternative demo account:
- Email: `demo@artery.ai`
- Password: `Demo1234!`

These are local demonstration credentials only. Change/remove them before deployment.

## Verify the connection
1. Open `http://127.0.0.1:8000/api/health` — should return `status: ok`.
2. Open `http://127.0.0.1:8000/docs` — interactive API docs.
3. Sign in through the frontend.
4. Create a case, open Upload Medical Scan, select a supported file and upload it.
5. Confirm the file is stored under `backend/storage/uploads/` and the case now contains file metadata.
6. Reload the cases page to verify records persist in `backend/artery_ai.db`.

## Current upload formats
`.dcm`, `.nii`, `.nii.gz`, `.mhd`, `.raw`, `.png`, `.jpg`, `.jpeg` (extension checks only; production validation should inspect content and medical metadata too).

## Configuration
- `VITE_API_BASE_URL` in frontend `.env` defaults to `http://127.0.0.1:8000/api`.
- `ARTERY_DB_PATH` optionally changes the SQLite database path.
- `ARTERY_UPLOAD_DIR` optionally changes upload storage.
- `ARTERY_SECRET_KEY` should be set to a strong random secret for any shared environment.
- `CORS_ORIGINS` can override allowed frontend origins.

## Notes before real deployment
This is an internship/research prototype. Add stronger production authentication, authorization checks, encrypted storage/backups, content-based DICOM/NIfTI validation, audit review, malware scanning, HTTPS, and institution-approved handling of medical data. Do not upload identifiable real patient data to an unapproved environment.


## Upgrade notes (26 Oct 2026)

- The Upload page now has **Run Initial Preprocessing Checks**. It checks file existence/readability, computes SHA-256, and attempts NIfTI/DICOM header metadata inspection if optional readers are installed.
- Optional medical-image readers: from `backend`, run `python -m pip install -r requirements-imaging.txt`.
- The result is a validation/metadata stage only. It does **not** resample/normalize voxels, generate artery masks, run segmentation, or diagnose stenosis.
- A research starter 3D U-Net and training script are in `backend/ml/`. They are not wired into the web API and need dataset-specific validation and a proper validation/test protocol before results can be reported. Install ML dependencies separately using `python -m pip install -r ml/requirements-ml.txt` from `backend`.
- Do not use identifiable patient data unless you have approval and a secure, compliant environment.
