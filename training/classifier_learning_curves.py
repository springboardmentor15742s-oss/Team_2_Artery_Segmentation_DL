"""Measure fitted Random Forest classification metrics as trees are accumulated.

This is a diagnostic learning curve over estimator count, not an epoch-based
neural-network training history. It uses deterministic train/validation splits
and never tunes on the held-out test cohort.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.metrics import accuracy_score, f1_score, log_loss

ROOT = Path(os.path.dirname(os.path.abspath(__file__))).parent
TRAINING = ROOT / "training"
DATASET = ROOT / "dataset"
MODELS = TRAINING / "models"
OUTPUT = TRAINING / "classifier_learning_curves.json"

sys.path.insert(0, str(TRAINING))
from data_splits import stratified_split_labels
from feature_extractor import extract_qca_features


def forest_probabilities(estimators, features, labels=(0, 1)):
    total = np.zeros((len(features), len(labels)), dtype=np.float64)
    label_to_index = {label: index for index, label in enumerate(labels)}
    for estimator in estimators:
        probabilities = estimator.predict_proba(features)
        for source_index, label in enumerate(estimator.classes_):
            if label in label_to_index:
                total[:, label_to_index[label]] += probabilities[:, source_index]
    return total / max(1, len(estimators))


def evaluate(y_true, probabilities):
    predicted = np.asarray(probabilities).argmax(axis=1)
    clipped = np.clip(probabilities, 1e-9, 1 - 1e-9)
    return {
        "log_loss": float(log_loss(y_true, clipped, labels=[0, 1])),
        "accuracy": float(accuracy_score(y_true, predicted)),
        "f1": float(f1_score(y_true, predicted, zero_division=0)),
    }


def main():
    started = time.perf_counter()
    manifest_path = DATASET / "clinical_manifest.csv"
    detector_path = MODELS / "trained_artery_classifier.joblib"
    scaler_path = MODELS / "feature_scaler.joblib"
    if not manifest_path.is_file() or not detector_path.is_file() or not scaler_path.is_file():
        raise FileNotFoundError("Classifier manifest, scaler or trained Random Forest is missing.")

    manifest = pd.read_csv(manifest_path)
    split = stratified_split_labels(manifest)
    features, labels, split_names = [], [], []
    image_root = DATASET / "images"
    for index, row in manifest.iterrows():
        image_path = image_root / str(row["file_name"])
        if not image_path.is_file():
            continue
        image = np.asarray(Image.open(image_path).convert("L"))
        features.append(extract_qca_features(image))
        labels.append(int(row["stenosis_detected"]))
        split_names.append(str(split[index]))

    if not features:
        raise RuntimeError("No manifest-linked input scans were available to evaluate.")

    x = joblib.load(scaler_path).transform(np.asarray(features, dtype=np.float32))
    y = np.asarray(labels, dtype=np.int64)
    split_names = np.asarray(split_names)
    train_x, train_y = x[split_names == "train"], y[split_names == "train"]
    validation_x, validation_y = x[split_names == "val"], y[split_names == "val"]
    forest = joblib.load(detector_path)
    estimators = list(getattr(forest, "estimators_", []))
    if not estimators:
        raise RuntimeError("Saved stenosis classifier has no fitted tree estimators.")

    checkpoints = sorted(set(min(len(estimators), count) for count in (1, 5, 10, 20, 40, 60, 80, 100)))
    points = []
    for count in checkpoints:
        train_metrics = evaluate(train_y, forest_probabilities(estimators[:count], train_x))
        validation_metrics = evaluate(validation_y, forest_probabilities(estimators[:count], validation_x))
        points.append({"estimators": count, "train": train_metrics, "validation": validation_metrics})

    report = {
        "model": "RandomForest stenosis detector",
        "model_version": "trained_artery_classifier.joblib",
        "curve_kind": "cumulative_estimators",
        "x_axis_label": "Cumulative trees in fitted forest",
        "split_method": "Deterministic severity-stratified train/validation/test; test split excluded from curves.",
        "train_cases": int(len(train_y)),
        "validation_cases": int(len(validation_y)),
        "held_out_test_cases": int(np.count_nonzero(split_names == "test")),
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_seconds": round(time.perf_counter() - started, 3),
        "points": points,
        "limitations": "Curves evaluate prefixes of the already-fitted Random Forest. They show train/validation behavior by tree count, not epoch-by-epoch neural training. No measurements from the held-out test cohort are used in these curves.",
    }
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, indent=2), encoding="utf-8")
    temporary.replace(OUTPUT)
    print(json.dumps({"output": str(OUTPUT), "model": report["model"], "points": len(points), "duration_seconds": report["duration_seconds"]}, indent=2))


if __name__ == "__main__":
    main()
