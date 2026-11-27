param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$backupDb = Join-Path $BackupPath 'artery_ai.db'
$backupUploads = Join-Path $BackupPath 'uploads'
$backupTraining = Join-Path $BackupPath 'training'
if (-not (Test-Path -LiteralPath $backupDb -PathType Leaf) -or
    -not (Test-Path -LiteralPath $backupUploads -PathType Container) -or
    -not (Test-Path -LiteralPath $backupTraining -PathType Container)) {
    throw 'Backup folder must contain artery_ai.db, uploads, and training.'
}

$runningApi = docker compose ps --status running -q api
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Compose services.' }
if ($runningApi) {
    & (Join-Path $PSScriptRoot 'backup.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create a safety backup before restore.' }
}

$safetyPath = Join-Path (Join-Path $ProjectRoot 'backups') ("pre-restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $safetyPath -Force | Out-Null
$databasePath = Join-Path $ProjectRoot 'backend\artery_ai.db'
$uploadPath = Join-Path $ProjectRoot 'backend\storage\uploads'
if (Test-Path -LiteralPath $databasePath -PathType Leaf) {
    Copy-Item -LiteralPath $databasePath -Destination (Join-Path $safetyPath 'artery_ai.before-restore.db')
}
if (Test-Path -LiteralPath $uploadPath -PathType Container) {
    Move-Item -LiteralPath $uploadPath -Destination (Join-Path $safetyPath 'uploads.before-restore')
}

docker compose stop api web
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the app before restore.' }
Copy-Item -LiteralPath $backupDb -Destination $databasePath -Force
New-Item -ItemType Directory -Path $uploadPath -Force | Out-Null
Copy-Item -Path (Join-Path $backupUploads '*') -Destination $uploadPath -Recurse -Force

docker compose create api
if ($LASTEXITCODE -ne 0) { throw 'Could not create the API container for restoring model artifacts.' }
docker compose cp (Join-Path $backupTraining '.') api:/app/training/
if ($LASTEXITCODE -ne 0) { throw 'Could not restore trained models and reports.' }
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'Data was restored, but the app did not start. Check docker compose logs.' }

Write-Output "Restore complete from: $BackupPath"
Write-Output "Pre-restore safety copy: $safetyPath"
