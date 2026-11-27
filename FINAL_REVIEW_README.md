# Final project handoff

This project is a local research prototype for coronary image review. The milestone documents describe the requested scope; they do not establish that every AI output is clinically validated. The application deliberately reports unavailable values when labels or physical calibration are missing.

## Start the application on Windows

Run these commands in PowerShell:

```powershell
cd C:\html\Artery_Medical_Final_Complete\Artery_Medical
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
npm.cmd --prefix .\artery-ai-frontend install
$env:ARTERY_SECRET_KEY = [guid]::NewGuid().ToString('N')
.\START_APP.bat
```

Open the frontend URL printed by Vite, normally `http://127.0.0.1:3000`. The API health page is `http://127.0.0.1:8000/api/health`; interactive API documentation is at `http://127.0.0.1:8000/docs`. Keep both service windows open. The secret applies to this local session; set the same private value before restarting if existing login tokens must remain valid.

## Docker deployment, monitoring, and logs

For a containerized deployment, install Docker Desktop and run this in PowerShell. The sample environment file is in the `Artery_Medical` project root:

```powershell
cd C:\html\Artery_Medical_Final_Complete\Artery_Medical
Copy-Item .env.docker.example .env
$secretKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
(Get-Content .env -Raw).Replace('replace-with-a-long-random-secret-before-deploying', $secretKey) | Set-Content .env
docker compose up --build -d
```

Visit `http://localhost:3000`. Check service status with `docker compose ps`, app health with `Invoke-RestMethod http://localhost:3000/api/health`, and live application logs with `docker compose logs -f api web`. The API uses JSON request logs and Docker log rotation. SQLite, uploads, and model artifacts are persisted in named volumes. Stop the app with `docker compose down` (this leaves data volumes in place).

To add Prometheus and Grafana, set a unique `GRAFANA_ADMIN_PASSWORD` in `.env` and run:

```powershell
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up --build -d
```

Open Grafana at `http://localhost:3001` (user `admin`) for the provisioned API dashboard, or Prometheus at `http://localhost:9090`. Stop both application and monitoring services with `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml down`. Monitoring endpoints bind to localhost. A public host still needs to be provisioned separately, with TLS, firewall rules, secret management, and encrypted volume backups.

To run the reproducible training/evaluation pipeline manually, use a separate PowerShell window:

```powershell
cd C:\html\Artery_Medical_Final_Complete\Artery_Medical
.\.venv\Scripts\Activate.ps1
.\START_PIPELINE.bat
```

Training is intentionally not part of normal startup. Optional 3D medical-image readers are declared in `backend\requirements.txt`; if installing the smaller dependency set, install `backend\requirements_imaging.txt` as well.

## Milestone topic coverage

| Milestone topics | Project coverage | Limits to retain in reports and demos |
|---|---|---|
| 1: project scope, datasets, EDA, architecture, schema, UI, upload, workflow and validation | React/Vite portal, FastAPI/SQLite API, local upload storage, dataset/training artifacts and evaluation reports are present. | Dataset-specific claims must cite the included manifests/reports. A successful upload/readability check is not a model result. |
| 2: segmentation comparison, upload/preprocessing, model training/inference, mask post-processing, vessel structures and centerline/diameter | Classical 2D segmentation comparison and optional U-Net/U-Net++ reports/checkpoints are included. Case analysis produces 2D mask, centerline and candidate visualizations. | The included benchmark is 2D. It does not demonstrate validated 3D CCTA centerlines or calibrated vessel diameter. Use the same modality and held-out split for comparisons. |
| 3: stenosis pipeline, candidate regions, detection, localization, severity, narrowing, XAI, visualization and doctor dashboard | The application supports research candidate proposals, optional CADICA lesion-box inference, image overlays/Grad-CAM where supported, case analysis and clinician review. | Severity class and calibrated percentage narrowing are unavailable without validated task labels and calibration. Candidate proposals and heatmaps are not diagnoses. |

## Research and safety boundaries

- ARCADE is 2D X-ray angiography; ImageCAS is 3D CCTA; CADICA provides a separate 2D angiography task. Do not mix modalities into one model comparison.
- The included CADICA lesion detector is a research localization model. Category codes are not mapped to clinical severity.
- Pixel-radius candidate estimates are not calibrated quantitative coronary angiography. The API intentionally returns no severity or numeric narrowing when supporting evidence is absent.
- The local demo accounts, contacts, and some case records are demonstration data. Do not enter identifiable patient information.
- The prototype has no prospective clinical validation or production security review. A qualified clinician must review research outputs.

## Added review workflows

- **Interactive segmentation:** zoom and opacity controls let clinicians inspect the original study with the saved vessel mask. The DICOM cine control steps through multi-frame `.dcm` objects; segmentation overlays correspond to the analyzed center frame.
- **Lesion comparison:** the viewer compares the source angiogram with the research candidate/stenosis overlay and displays candidate radii in pixels. It does not present pixel estimates as calibrated measurements.
- **Doctor annotation and approval:** the Doctor Review page stores per-candidate confirmed, rejected, or uncertain decisions with reviewer notes. Approval is audited and releases the report only to a registered patient with the required doctor-patient relationship.
- **Patient history:** patients can select two approved reports and compare dates, report fields, and saved images side by side. The application does not infer disease progression from those differences.
- **DICOM and video:** DICOM frames can be viewed and stepped through. MP4, MOV, AVI, WebM, MPG, and MPEG files can be uploaded and played inline; analyze the currently selected timestamp as a frame. Video analysis is frame-by-frame on request, not an automated whole-video diagnosis.
- **Image quality:** The viewer displays a technical image-quality score when measurable, alongside the existing validation outcome. It is an image usability aid, not a clinical quality certification.
- **Audit, recovery, and localization:** Report views, annotation edits, analysis, uploads, and approvals are recorded. The app includes twelve language options. PowerShell backup and restore scripts preserve the database, uploads, and trained artifacts.
- **PDF report:** Export includes the original image and available segmentation, stenosis, and explainability overlays, plus measurements and review/model details.
- **Voice assistant:** the existing portal assistant now supports browser speech-to-text and optional spoken replies. It answers workflow and specialty-navigation questions; it is not a diagnostic or treatment engine.
- **Email alerts:** appointment requests/updates and report approvals queue minimal email alerts when SMTP is configured. In-app notifications work without SMTP. No patient details or clinical findings are placed in email bodies.
- **Broader specialty directory:** demo listings now cover cardiology, ophthalmology, ENT, neurology, dermatology, orthopedics, endocrinology, pediatrics, psychiatry, and general practice. Search by specialty or care area. Directory entries are sample records, not a verified real-world referral service.
- **Medicine lookup:** the patient portal continues to link to official price information. It does not select or prescribe a medicine for a disease; patients should follow their clinician's prescription and confirm details with a pharmacist.

To enable SMTP alerts, set these variables in the PowerShell session before starting `START_APP.bat`:

```powershell
$env:ARTERY_SMTP_HOST = "smtp.example.com"
$env:ARTERY_SMTP_PORT = "587"
$env:ARTERY_SMTP_USERNAME = "notifications@example.com"
$env:ARTERY_SMTP_PASSWORD = "your-mail-provider-app-password"
$env:ARTERY_SMTP_FROM = "Artery Medical <notifications@example.com>"
$env:ARTERY_SMTP_STARTTLS = "true"
```

Check **Notifications** in the app for email alert configuration status. Use a mail-provider app password and keep credentials out of source control. SMTP is optional; alerts remain in-app when it is not configured.

## Useful commands

```powershell
# Frontend production build
npm.cmd --prefix .\artery-ai-frontend run build

# Classical model training, held-out evaluation, and segmentation comparison
python .\training\train.py
python .\training\test.py
python .\training\compare_segmentation.py

# Optional deep-learning segmentation training (install its requirements first)
python -m pip install -r .\training\requirements_segmentation.txt
python .\training\train_segmentation_dl.py
```
