# Synthetic artery image dataset specification

## Intended use

The 675-case dataset created by build_large_dataset.py is deterministic, computer-generated research/demo data. Its images, patient-like IDs, demographics, risk factors, vessel labels, narrowing values, masks, and centerlines are synthetic. They are not clinical studies, verified medical annotations, or real patient information.

Do not describe benchmark performance on this generated dataset as clinical validation or expected clinical performance.

## Layout

The generator writes the following locally:

- clinical_manifest.csv: synthetic case metadata and labels.
- images/: generated grayscale angiography-style illustrations.
- masks/: generated binary vessel masks.
- centerlines/: generated centerline images.
- labels.csv and dataset_catalog.json: generated label/catalog outputs.

## Splits

The current deterministic project split utility assigns 675 cases as:

| Split | Number of examples |
|---|---:|
| Train | 472 |
| Validation | 68 |
| Held-out test | 135 |

The held-out test split is used for the project's local software benchmark reports. Keep it separate from training when reproducing the evaluation.

## Recreate

From the project root, install the backend/training dependencies and run:

    python dataset/build_large_dataset.py

The image collections and generated manifest are intentionally git-ignored. This avoids a multi-gigabyte source repository; the generator is included so the synthetic dataset can be recreated locally.

## Third-party research datasets

ARCade and CADICA are separate third-party datasets. They are not the synthetic dataset described here. Obtain them independently, review their licenses and redistribution rules, and follow their citation requirements. Do not put restricted datasets or identifiable patient data in this public repository.
