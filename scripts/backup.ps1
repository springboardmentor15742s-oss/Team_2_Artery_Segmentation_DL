param(
    [string]$BackupRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups')
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$apiContainer = docker compose ps -q api
if ($LASTEXITCODE -ne 0 -or -not $apiContainer) {
    throw 'The API container must be running before creating a backup.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $BackupRoot "artery-$timestamp"
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

$snapshotScript = @'
import os
import sqlite3

source_path = "/app/data/artery_ai.db"
snapshot_path = "/app/training/.artery-ai-db-backup.sqlite"
if not os.path.isfile(source_path):
    raise SystemExit(f"Database not found: {source_path}")
if os.path.exists(snapshot_path):
    os.remove(snapshot_path)
with sqlite3.connect(source_path) as source, sqlite3.connect(snapshot_path) as snapshot:
    source.backup(snapshot)
if not os.path.isfile(snapshot_path) or os.path.getsize(snapshot_path) == 0:
    raise SystemExit("SQLite backup did not create a non-empty snapshot.")
print(f"SQLite snapshot created ({os.path.getsize(snapshot_path)} bytes).")
'@
$snapshotScript | docker compose exec -T api python -
if ($LASTEXITCODE -ne 0) { throw 'Could not create a consistent SQLite snapshot.' }

docker compose cp api:/app/training/.artery-ai-db-backup.sqlite (Join-Path $backupPath 'artery_ai.db')
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the database snapshot out of the API container.' }
docker compose exec -T api python -c "import os; os.remove('/app/training/.artery-ai-db-backup.sqlite')"
if ($LASTEXITCODE -ne 0) { throw 'The database snapshot was copied, but could not be removed from the artifact volume.' }
docker compose cp api:/app/data/uploads (Join-Path $backupPath 'uploads')
if ($LASTEXITCODE -ne 0) { throw 'Could not copy uploaded scan files.' }
docker compose cp api:/app/training (Join-Path $backupPath 'training')
if ($LASTEXITCODE -ne 0) { throw 'Could not copy model artifacts and training reports.' }

Write-Output "Backup created: $backupPath"
