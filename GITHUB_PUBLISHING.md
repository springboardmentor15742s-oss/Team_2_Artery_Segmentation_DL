# Publishing this project to GitHub

The public repository shown in the project screenshot is:

    https://github.com/ramyaveeramreddy2006-cloud/ARTERY-SEGMENATION-.git

## What this project keeps out of Git

The project-level .gitignore excludes local .env credentials, SQLite files, uploads, backups, Python/Node environments, downloaded zip archives, and the multi-gigabyte generated image collections. It keeps the app source, synthetic demo images, synthetic dataset generator, model artifacts, reports, deployment files, architecture sheets, poster, and explanation documents.

The main dataset generator is under dataset/build_large_dataset.py. Run it locally after cloning to recreate the 675-case synthetic dataset. Obtain ARCade/CADICA separately and follow their original licenses before using those third-party assets. Do not commit patient records or restricted datasets.

## Push the initial project

Open PowerShell as your normal Windows account and run from the project folder:

    Set-Location C:\html\Artery_Medical_Final_Complete\Artery_Medical
    git status --short --branch
    git remote -v

If this folder has not been initialized as a Git repository:

    git init -b main

Review the files before staging. Verify that .env, *.zip, dataset/images, dataset/masks, backups, .venv, and node_modules are not listed. Then:

    git add -A
    git status --short
    git diff --cached --stat
    git commit -m "Publish Artery Medical analysis platform"

Connect the screenshot repository and push:

    git remote add origin https://github.com/ramyaveeramreddy2006-cloud/ARTERY-SEGMENATION-.git
    git push -u origin main

If origin already exists, update it rather than adding another remote:

    git remote set-url origin https://github.com/ramyaveeramreddy2006-cloud/ARTERY-SEGMENATION-.git

Git Credential Manager may open a browser for GitHub sign-in. Never paste a GitHub password or token into chat or commit it to a file.

## “Push live” versus hosting the app

Pushing puts the source in the GitHub repository. It does not run the FastAPI service or SQLite database on GitHub. GitHub Pages alone cannot host this full application. To make the app reachable as a live service, deploy the Docker Compose web/API stack to a server/container host and configure its persistent storage, domain, TLS, secrets, and any required data separately. Do not publish this demo app for real patient care without security, privacy, and clinical validation.

