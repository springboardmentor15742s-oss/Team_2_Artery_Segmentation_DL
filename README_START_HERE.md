# Infosys Artery AI

## Public repository and data setup

The source repository intentionally excludes local credentials, databases, backups, virtual environments, downloaded archives, and generated full-size dataset image collections. The deterministic synthetic dataset generator and a tiny synthetic demo set are included. See [dataset/README.md](dataset/README.md) for local data setup and third-party dataset licensing guidance.

Pushing source code to GitHub does not deploy the backend as a public live website. The Docker Compose app requires a host that can run its FastAPI service and persistent storage. GitHub Pages alone can host only a static frontend.

See [GITHUB_PUBLISHING.md](GITHUB_PUBLISHING.md) for the repository push checklist and commands.

## A3 project architecture sheet

The updated visual project poster is available as [A3 PNG](docs/architecture/artery_project_poster_a3.png) and [print-ready PDF](docs/architecture/artery_project_poster_a3.pdf). The in-depth explanation is available in [Word format](docs/PROJECT_EXPLANATION_GUIDE.docx) and [Markdown format](docs/PROJECT_EXPLANATION_GUIDE.md).

Print-ready A3 landscape architecture files are in [`docs/architecture`](docs/architecture): [PNG image](docs/architecture/artery_project_architecture_a3.png) and [PDF for printing](docs/architecture/artery_project_architecture_a3.pdf). Regenerate the files with `python scripts/generate_architecture_sheet.py`.

Artery Segmentation and Stenosis Detection using Advanced Deep Learning Techniques. This local web application provides authenticated case management, scan review, segmentation and stenosis analysis, notifications, reports, training/evaluation tools, and a clinician assistant.

Read [PROJECT_EXPLANATION_GUIDE.md](docs/PROJECT_EXPLANATION_GUIDE.md) for the in-depth architecture walkthrough, model and dataset explanation, presentation script, run instructions, and common questions.

## Run locally on Windows

Prerequisites: Python 3.10+ and Node.js 18+.

```powershell
cd C:\html\Artery_Medical_Final_Complete\Artery_Medical
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
cd artery-ai-frontend
npm install
cd ..
.\START_APP.bat
```

`START_APP.bat` checks/starts the API and launches the web portal. It does not retrain models on each launch; use `START_PIPELINE.bat` when you intentionally want to refresh training and evaluation reports. Open the URL printed by Vite (usually <http://127.0.0.1:3000>, or a later port if 3000 is occupied). The API and interactive docs are at <http://127.0.0.1:8000/api/health> and <http://127.0.0.1:8000/docs>. Leave the service windows open. New members register before signing in; the public doctor access directory provides 10 demo clinician accounts for local evaluation.

## Main workflows

- Dashboard: registry status, dataset preview, segmentation comparison, and measured performance reports.
- Cases and Patients: search/filter scan records and browse the patient identifiers represented by the local case registry.
- Image Analysis: select a case, review scan quality, open analysis results, or browse ARCade samples for research visualization.
- Results & Reports: review saved case reports, export JSON/CSV, and print reports.
- Model Evaluation and Model Registry: review local training/evaluation output and inspect actual model artifact availability and runtime load state.
- Activity Logs: review recorded case creation, scan upload, analysis, and report approval actions.
- Feature Management: create boolean feature flags, configure isolated Development/Staging/Production rollouts, define equality targeting rules, evaluate a subject, inspect rollout analytics, and review audit events. Management access requires an Administrator role or an email listed in `ARTERY_FEATURE_ADMIN_EMAILS`.
- Settings: edit the signed-in user's profile and password.
- X-rays: authenticated browser for the local ARCade coronary X-ray images and their syntax/stenosis annotation splits. Dataset samples are research data, not patient records or calibrated clinical measurements.
- Patients: browse available doctors, use their email/phone contact links, request/cancel appointments, and track status. Doctors see requests on their dashboard, can confirm/cancel/complete them, and can contact patients.
- Training & Testing: train/evaluate the classical QCA suite and optionally train U-Net/U-Net++ segmentation models.
- Reports and Notifications: review completed reports, export CSV/JSON, print to PDF, and review workflow events.
- Clinician assistant and interface language selector (12 languages).

The X-ray library automatically reads the extracted `arcade (1)\arcade` folder. If the dataset is stored elsewhere, set `ARTERY_ARCADE_DIR` to the directory containing the `syntax` and `stenosis` folders before starting the backend.

The viewer can generate a separate experimental denoising preview even when image-quality checks block analysis. It uses the CADICA-trained denoiser when that checkpoint is available, otherwise a median-plus-Gaussian fallback. It does not alter the source image or override the quality gate; this output is not clinically validated and must not be used for diagnosis.

The top navigation's API indicator checks `/api/health`. Model Registry and Activity Logs read from the local artifact directory and audit table respectively; they do not simulate model or audit data.

To build the frontend from the project root, run `npm --prefix .\artery-ai-frontend run build`. The frontend `package.json` is inside `artery-ai-frontend`, not the repository root.

To allow your signed-in account to manage flags locally, set the backend process environment before starting it (use the email of your account):

```powershell
$env:ARTERY_FEATURE_ADMIN_EMAILS = "admin@your-company.example"
.\START_BACKEND.bat
```

Feature flag evaluations are deterministic per subject and environment, use the saved rollout configuration, and are recorded with a salted subject hash. The feature-management controls are a separate app module and do not gate clinical workflows or constitute a production deployment service.

## Training and evaluation

From the project root, activate the environment and run:

```powershell
python training\train.py
python training\test.py
python training\compare_segmentation.py
```

The shared deterministic split is stratified by severity (70% train, 10% validation, 20% test; seed 42). Classifier inputs use image-derived features only; masks are used only for segmentation scores. Reports are written under `training/`. The current classical segmentation comparison measured on 135 supplied image/mask pairs is in `training/segmentation_comparison.json` and is surfaced in the dashboard. U-Net and U-Net++ training is optional because PyTorch is a large dependency:

```powershell
python -m pip install -r training\requirements_segmentation.txt
python training\train_segmentation_dl.py
```

Optional DICOM, NIfTI, and MetaImage support (installed in Docker builds):

```powershell
python -m pip install -r backend\requirements_imaging.txt
```

After extracting the supplied CADICA archive so that its `selectedVideos` folder is at `dataset\CADICA\selectedVideos`, train and held-out-test the optional experimental denoiser with:

```powershell
python training\train_cadica_denoiser.py --epochs 5
```

This trains on clinician-selected CADICA frames with synthetic noise, splitting by patient to avoid patient overlap. It is a denoising visualization experiment only: CADICA does not provide clean/noisy pairs, vessel masks, or centerline labels, so this run does not train the segmentation, centerline, Grad-CAM, or clinical QCA pipeline. Restart the backend after a successful run to load the denoiser checkpoint.

## Docker

Install and start Docker Desktop, then run these commands in PowerShell from the project root. They generate a persistent app secret, copy the container settings, and start the web app and API. The API does not retrain models at startup. The local SQLite database, uploads, ARCade data, and CADICA data are mounted from the project folder; trained models and reports use a persistent Docker volume. The container includes CPU PyTorch for the optional segmentation and CADICA training actions. The local ARCade and CADICA folders must exist for those data and training workflows.

```powershell
Copy-Item .env.docker.example .env
$secretKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
(Get-Content .env -Raw).Replace('replace-with-a-long-random-secret-before-deploying', $secretKey) | Set-Content .env
docker compose up --build -d
```

Open `http://localhost:8081` with the current `.env` settings (use the value of `WEB_PORT` if you change it). Check health at `http://localhost:8081/api/health`, and follow logs with `docker compose logs -f api web`. Stop with `docker compose down`; the database and uploaded files remain in the project folder, while trained artifacts remain in a Docker volume. To enable email alerts, fill in the `ARTERY_SMTP_*` settings in `.env` before starting the containers.

### Monitoring

Set a unique `GRAFANA_ADMIN_PASSWORD` value in `.env`, then start the app and monitoring stack:

```powershell
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up --build -d
```

Grafana is at <http://localhost:3001> and Prometheus is at <http://localhost:9090>. The preconfigured Grafana dashboard charts API request rates, server errors, and latency. Both monitoring ports bind to localhost. Stop the full stack with:

```powershell
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml down
```

The web and API containers emit logs to Docker's rotating log driver; API request logs are structured JSON and omit query strings and patient identifiers. Use `docker compose logs -f api web` to inspect them. Audited events include report views, annotation changes, analysis, uploads, and approvals. Uploaded videos can be played and a selected timestamp analyzed as a frame; this does not analyze every frame or provide a video-level diagnosis. The technical image-quality score is a screening aid, not a clinical quality certification.

Create and restore local backups from PowerShell in this folder:

```powershell
.\scripts\backup.ps1
.\scripts\restore.ps1 -BackupPath .\backups\artery-YYYYMMDD-HHMMSS
```

Backups contain patient records, uploaded images, and model artifacts. Keep them in access-controlled, encrypted storage and verify recovery procedures for your deployment. For a public deployment, set `WEB_BIND_ADDRESS=0.0.0.0` only behind a TLS-enabled reverse proxy and firewall, configure production secrets and SMTP, and arrange encrypted backups for Docker volumes. This Compose setup is a deployment package; it does not create a cloud server or domain automatically.

## Validation and limitations

The training and test reports are calculated from the supplied manifest and reference masks. Inspect their class supports and split descriptions; a metric is not meaningful for classes absent from its test split. Segmentation comparison is an empirical 2D benchmark, and stenosis measurements, classifications, and recommendations are decision-support estimates for review by a qualified clinician. The included demonstration dataset and local app have not undergone prospective clinical validation or production security review. Do not treat model output as a diagnosis.

The analysis dashboard displays an estimated percentage narrowing from segmented lumen radii: `100 × (1 − minimum radius / reference radius)`. This is a pixel-based research estimate; without image calibration and clinical validation it is not a diagnostic QCA measurement.
