# Automated Artery Analysis

An educational research application for reviewing angiography images, vessel segmentation, stenosis estimates, cases, reports, and model evaluation. The application is a research prototype: its outputs require review by a qualified clinician and are not a diagnosis.

## Project structure

```text
Artery_Medical/
├── artery-ai-frontend/       React + Vite user interface and Nginx configuration
├── backend/                  FastAPI API, SQLite setup, authentication, analysis
├── dataset/                  Dataset instructions and synthetic dataset generator
├── dataset_demo/             Small synthetic examples for UI demonstrations
├── training/                 Training, evaluation, and report-generation scripts
├── deploy/monitoring/         Prometheus and Grafana configuration
├── docs/                     Project guide, architecture sheets, poster, and PDFs
├── scripts/                  Backup, restore, and documentation-generation scripts
├── docker-compose.yml        Web/API services, networking, health checks, and storage
├── docker-compose.monitoring.yml
├── .env.docker.example       Safe template for local Docker settings
└── README.md                 This setup guide
```

Large datasets, downloaded archives, local databases, uploads, secrets, and model outputs are excluded from Git. See [dataset setup](dataset/README.md) before training. Third-party datasets must be obtained from their official sources and used under their licenses.

## Requirements

- Windows 10/11 with hardware virtualization enabled.
- Docker Desktop using the WSL 2 backend and Linux containers.
- Git, for cloning and updating the repository.
- Optional for local non-Docker development: Python 3.10+ and Node.js 18+.

## Start the full application with Docker Desktop

Clone the repository once, then open PowerShell in the project folder:

```powershell
git clone https://github.com/ramyaveeramreddy2006-cloud/ARTERY-SEGMENATION-.git C:\html\Artery_Medical_Final_Complete\Artery_Medical
Set-Location C:\html\Artery_Medical_Final_Complete\Artery_Medical
```

Start Docker Desktop and wait until its status says **Engine running**. If Docker reports a missing engine pipe, check the available context and select Docker Desktop's Linux context when listed:

```powershell
docker context ls
docker context use desktop-linux
docker info
```

`docker info` must show both **Client** and **Server** information before continuing. If `desktop-linux` is not listed, start or restart Docker Desktop and check its WSL 2 / Linux containers settings.

Create `.env` from the example only when it does not exist, preserving existing settings and secrets. Generate a secret if the example placeholder is still present, validate Compose, then build and start the app:

```powershell
if (-not (Test-Path .env)) {
    Copy-Item .env.docker.example .env
}

$envPath = Join-Path (Get-Location) '.env'
$envText = [System.IO.File]::ReadAllText($envPath)
if ($envText.Contains('replace-with-a-long-random-secret-before-deploying')) {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes)
    $rng.Dispose()
    $envText = $envText.Replace('replace-with-a-long-random-secret-before-deploying', $secret)
    [System.IO.File]::WriteAllText($envPath, $envText, (New-Object System.Text.UTF8Encoding($false)))
}

docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed; check the error above.' }

docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw 'The app did not start; inspect the Compose output and logs.' }

docker compose ps
Start-Process http://localhost:8081
```

The web port defaults to `8081`; change `WEB_PORT` in `.env` if that port is already in use. The API health endpoint is <http://localhost:8081/api/health>. View service logs with:

```powershell
docker compose logs -f api web
```

Stop the containers with `docker compose down`. The app's database and uploads use the project bind mounts; generated model artifacts use a Docker volume. Do not delete volumes if you want to keep their data.

### Optional monitoring stack

Set a strong `GRAFANA_ADMIN_PASSWORD` in `.env`, then run:

```powershell
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up --build -d
```

Grafana is available at <http://localhost:3001> and Prometheus at <http://localhost:9090>. Both are bound to localhost by default.

## Run frontend and API separately

Docker is the recommended local setup. For development without Docker, create a Python environment, install backend requirements, and start the backend and frontend in separate PowerShell windows:

```powershell
Set-Location C:\html\Artery_Medical_Final_Complete\Artery_Medical
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m pip install -r backend\requirements_imaging.txt
python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In a second PowerShell window:

```powershell
Set-Location C:\html\Artery_Medical_Final_Complete\Artery_Medical\artery-ai-frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually <http://localhost:3000>. API documentation is at <http://localhost:8000/docs>. The Vite development server proxies `/api` to the local API.

## Training and datasets

The public repository does not contain the complete ARCade or CADICA datasets or generated full-size image collections. Follow [dataset/README.md](dataset/README.md) to generate the included synthetic research set or obtain third-party data from its official source. Do not upload identifiable patient data or restricted datasets to this public repository.

Typical training commands, from the repository root:

```powershell
python -m pip install -r backend\requirements.txt
python dataset\build_large_dataset.py
python training\train.py
python training\test.py
```

Deep-learning segmentation training is optional and has additional dependencies:

```powershell
python -m pip install -r training\requirements_segmentation.txt
python training\train_segmentation_dl.py
```

## Recommended editor extensions

The extensions are optional; Docker and the application can run without them. In VS Code or a compatible editor, install:

- **Docker** (`ms-azuretools.vscode-docker`) — inspect containers, images, and Compose services.
- **Python** (`ms-python.python`) and **Pylance** (`ms-python.vscode-pylance`) — backend editing and Python support.
- **ESLint** (`dbaeumer.vscode-eslint`) — frontend lint feedback.
- **Prettier - Code formatter** (`esbenp.prettier-vscode`) — consistent formatting.
- **GitHub Actions** (`github.vscode-github-actions`) — view workflow files and CI runs.

Docker Desktop is a separate Windows application, not an editor extension. Its engine must be running for `docker compose` commands to work.

## GitHub and deployment

Push source changes from the repository root with:

```powershell
git status
git add -A
git commit -m "Describe the change"
git push origin main
```

Pushing to GitHub stores the code; it does not publish or start the app. GitHub Pages only hosts static files and cannot run this FastAPI service, SQLite storage, or Docker Compose stack. To make the complete app public, deploy the Docker services to a Docker-capable hosting provider, configure persistent storage and production secrets, and enable HTTPS. Do not expose the local development deployment directly to the internet.

## Documentation

- [In-depth project explanation](docs/PROJECT_EXPLANATION_GUIDE.md) and [Word document](docs/PROJECT_EXPLANATION_GUIDE.docx)
- [Team project documentation PDF](docs/Team_2_Project_Documentation_edited.pdf)
- [A3 architecture diagram and poster](docs/architecture/)
- [Repository publishing notes](GITHUB_PUBLISHING.md)

## Research and safety note

This application and the included demonstration data are research/educational material, not clinically validated medical software. Measurements and model outputs are estimates and must not be used as a standalone diagnosis or treatment recommendation. Use only de-identified data where permitted, protect credentials and backups, and have qualified clinicians review results.
