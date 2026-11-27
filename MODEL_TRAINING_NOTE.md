# Model training and evaluation

This note describes the experiments present in the repository. Read the JSON
reports under `training/` for measured results, case counts, splits and stated
limitations. Do not reuse scores from older handoff documents or infer clinical
performance from an engineering benchmark.

## Available workflows

- `training/train.py` trains the classical image-feature research models.
- `training/test.py` evaluates the saved models on the held-out split.
- `training/compare_segmentation.py` compares classical 2D segmentation
  methods against the supplied reference masks.
- `training/train_segmentation_dl.py` optionally trains U-Net/U-Net++ models;
  install `training/requirements_segmentation.txt` first.
- `training/train_cadica_detector.py` trains a single-class lesion-box
  localizer with patient-level splits. It does not produce severity labels or
  calibrated narrowing measurements.

The exact dataset, split policy, model configuration and results differ by
workflow. Inspect each generated report rather than combining metrics across
modalities or tasks. Training reports do not establish prospective clinical
validation. Candidate regions and explanations require qualified review.

Run the standard workflow from the `Artery_Medical` project directory:

```powershell
python training\train.py
python training\test.py
python training\compare_segmentation.py
```
