# Artery Medical — Upgrade Notes (26 October 2026)

## What changed

1. Added a backend endpoint `POST /api/preprocessing/{case_id}` for initial file validation and metadata inspection.
2. Updated the Upload page with a **Run Initial Preprocessing Checks** action and a result panel showing format, file size, checksum, available dimensions/spacing, warnings, and next step.
3. Added optional NIfTI/DICOM readers in `backend/requirements-imaging.txt` (`nibabel`, `pydicom`). Without them, basic file integrity checks still run and metadata parsing is reported as unavailable.
4. Added a research starter 3D U-Net architecture and NIfTI patch-training script under `backend/ml/`. This is separate from the live website.
5. Updated setup documentation and explicitly distinguished completed upload/validation checks from future voxel preprocessing and AI inference.

## Current status

- Connected: authentication, case management, upload/file storage, initial file integrity checks and optional header inspection.
- Research starter only: 3D U-Net model definition and training script.
- Not yet connected/completed: full volumetric normalization/resampling pipeline, trained checkpoint, mask-generation inference endpoint, segmentation post-processing, vessel centerline/diameter extraction, and validated stenosis grading.

## Start locally (Windows PowerShell)

Backend terminal:
```powershell
cd C:\backend\Artery_Medical\backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Optional metadata parsing support:
python -m pip install -r requirements-imaging.txt
uvicorn main:app --reload --port 8000
```

Frontend terminal:
```powershell
cd C:\backend\Artery_Medical\artery-ai-frontend
npm install
copy .env.example .env
npm run dev
```

Open the Vite URL, sign in, select/create a case, upload an approved sample, then click **Run Initial Preprocessing Checks**. API docs: `http://127.0.0.1:8000/docs`.

## ML starter

From the backend folder, install the separate dependencies with `python -m pip install -r ml/requirements-ml.txt`. Read `ml/README.md` before running; adapt the dataset paths and verify axis orientation/spacing and patient-level splits. The starter model is not a clinically validated tool.
