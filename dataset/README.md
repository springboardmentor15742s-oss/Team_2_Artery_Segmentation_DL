# Dataset setup

Large/generated image collections and downloaded third-party datasets are intentionally not stored in this public source repository. This keeps GitHub history manageable and prevents accidentally publishing data whose redistribution terms have not been checked.

## Rebuild the included synthetic research dataset

The deterministic generator in this folder creates the project's 675-case synthetic image/mask dataset locally. It is research/demo data and does not represent real patient studies.

From the project root, install the training dependencies if needed, then run:

    python -m pip install -r backend/requirements.txt
    python dataset/build_large_dataset.py

The generator writes a manifest and image, mask, and centerline files into this directory. This dataset can be used for local development and reproducible software demonstrations; its metrics are not evidence of clinical performance.

## Third-party datasets

ARCade and CADICA assets are not included. Obtain them from their official sources and follow their licenses, terms, and citation requirements. Place the files in the paths expected by the training scripts or configure the corresponding dataset path. Do not commit restricted datasets, patient information, or original downloaded archives to a public repository.

The synthetic six-image examples under dataset_demo are safe UI examples and are separate from training/benchmark data.
