"""Infosys Artery AI - Production Model Training Pipeline.

Trains:
1. Binary Stenosis Detector (RandomForestClassifier)
2. Multi-Class Severity Classifier (Normal, Mild, Moderate, Severe, Critical)
3. Quantitative Narrowing Regressor (GradientBoostingRegressor)
4. Automated Vessel Segmentation Calibrator

Input: dataset/clinical_manifest.csv & dataset/images/
Output: training/models/*, training/training_report.json
"""

import os
import sys
import json
import time
import numpy as np
import pandas as pd
from PIL import Image
import joblib

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_absolute_error, r2_score, classification_report, log_loss
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")
IMAGES_DIR = os.path.join(DATASET_DIR, "images")
MASKS_DIR = os.path.join(DATASET_DIR, "masks")
CENTERLINES_DIR = os.path.join(DATASET_DIR, "centerlines")
MANIFEST_PATH = os.path.join(DATASET_DIR, "clinical_manifest.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Add training dir to path
sys.path.insert(0, BASE_DIR)
from feature_extractor import extract_qca_features, segment_coronary_vessels
from data_splits import stratified_split_labels

def run_training():
    start_time = time.time()
    print("=" * 70)
    print("  INFOSYS ARTERY AI — CLINICAL MODEL TRAINING PIPELINE")
    print("  Enterprise Cardiovascular Stenosis & Vessel Intelligence")
    print("=" * 70)

    if not os.path.exists(MANIFEST_PATH):
        raise FileNotFoundError(f"Manifest not found at {MANIFEST_PATH}. Run build_large_dataset.py first.")

    manifest = pd.read_csv(MANIFEST_PATH)
    total_records = len(manifest)
    print(f"\n[+] Loaded clinical manifest: {total_records} records.")

    print("[+] Extracting QCA and radiomic morphological features from scans...")
    features_list = []
    valid_indices = []

    for i, row in manifest.iterrows():
        img_name = row["file_name"]
        mask_name = row.get("mask_file")
        cline_name = row.get("centerline_file")

        img_path = os.path.join(IMAGES_DIR, img_name)
        if not os.path.exists(img_path):
            continue
        try:
            im = np.array(Image.open(img_path).convert("L"))
            mask_arr = None
            cline_arr = None
            if mask_name:
                mp = os.path.join(MASKS_DIR, mask_name)
                if os.path.exists(mp):
                    mask_arr = np.array(Image.open(mp).convert("L"))
            if cline_name:
                cp = os.path.join(CENTERLINES_DIR, cline_name)
                if os.path.exists(cp):
                    cline_arr = np.array(Image.open(cp).convert("L"))

            # Match live inference: the classifier may only see the scan. Ground
            # truth masks and centerlines are reserved for segmentation metrics.
            feats = extract_qca_features(im)
            features_list.append(feats)
            valid_indices.append(i)
        except Exception as e:
            print(f"    Warning: skipping {img_name}: {e}")

    df_valid = manifest.iloc[valid_indices].copy().reset_index(drop=True)
    X = np.array(features_list, dtype=np.float32)

    y_det = df_valid["stenosis_detected"].astype(int).to_numpy()
    y_sev = df_valid["severity"].to_numpy()
    y_reg = df_valid["narrowing_percentage"].astype(float).to_numpy()

    split_labels = stratified_split_labels(df_valid)
    train_mask = split_labels == "train"
    val_mask = split_labels == "val"
    test_mask = split_labels == "test"

    print(f"[+] Splits: Train={train_mask.sum()}, Validation={val_mask.sum()}, Test={test_mask.sum()}")

    scaler = StandardScaler()
    X_train = scaler.fit_transform(X[train_mask])
    X_val = scaler.transform(X[val_mask])

    # 1. Train Stenosis Detection Classifier
    print("\n--- Training Model 1: Binary Stenosis Detection (RandomForest) ---")
    detector = RandomForestClassifier(
        n_estimators=100, max_depth=10, min_samples_split=2,
        random_state=42, class_weight="balanced"
    )
    detector.fit(X_train, y_det[train_mask])
    val_det_pred = detector.predict(X_val)
    det_acc = accuracy_score(y_det[val_mask], val_det_pred)
    det_f1 = f1_score(y_det[val_mask], val_det_pred, zero_division=0)
    detector_tree_curve = []
    detector_estimators = list(detector.estimators_)
    curve_tree_counts = sorted(set(min(len(detector_estimators), n) for n in range(1, len(detector_estimators) + 1, 5)) | {len(detector_estimators)})
    for tree_count in curve_tree_counts:
        train_probabilities = np.mean([tree.predict_proba(X_train) for tree in detector_estimators[:tree_count]], axis=0)
        val_probabilities = np.mean([tree.predict_proba(X_val) for tree in detector_estimators[:tree_count]], axis=0)
        train_predictions = detector.classes_[np.argmax(train_probabilities, axis=1)]
        val_predictions = detector.classes_[np.argmax(val_probabilities, axis=1)]
        train_curve = {"accuracy": float(accuracy_score(y_det[train_mask], train_predictions)), "f1": float(f1_score(y_det[train_mask], train_predictions, zero_division=0)), "log_loss": float(log_loss(y_det[train_mask], np.clip(train_probabilities, 1e-9, 1.0), labels=detector.classes_))}
        validation_curve = {"accuracy": float(accuracy_score(y_det[val_mask], val_predictions)), "f1": float(f1_score(y_det[val_mask], val_predictions, zero_division=0)), "log_loss": float(log_loss(y_det[val_mask], np.clip(val_probabilities, 1e-9, 1.0), labels=detector.classes_))}
        detector_tree_curve.append({"estimators": int(tree_count), "train": train_curve, "validation": validation_curve})
    print(f"    Validation Accuracy: {det_acc * 100:.2f}% | F1-Score: {det_f1:.4f}")

    # 2. Train Multi-Class Severity Classifier
    print("\n--- Training Model 2: Multi-Class Stenosis Severity Classifier ---")
    severity_classifier = RandomForestClassifier(
        n_estimators=100, max_depth=8, min_samples_split=2,
        random_state=42
    )
    severity_classifier.fit(X_train, y_sev[train_mask])
    val_sev_pred = severity_classifier.predict(X_val)
    sev_acc = accuracy_score(y_sev[val_mask], val_sev_pred)
    sev_f1 = f1_score(y_sev[val_mask], val_sev_pred, average="weighted", zero_division=0)
    sev_classes = ["Normal", "Mild", "Moderate", "Severe", "Critical"]
    sev_probabilities = severity_classifier.predict_proba(X_val)
    sev_logs = []
    for tree_count in range(1, len(severity_classifier.estimators_) + 1):
        partial = np.zeros((int(val_mask.sum()), len(sev_classes)), dtype=np.float64)
        class_indices = {label: index for index, label in enumerate(sev_classes)}
        for estimator in severity_classifier.estimators_[:tree_count]:
            tree_probabilities = estimator.predict_proba(X_val)
            for source_index, label in enumerate(estimator.classes_):
                if label in class_indices:
                    partial[:, class_indices[label]] += tree_probabilities[:, source_index]
        partial /= tree_count
        sev_logs.append(round(float(log_loss(y_sev[val_mask], np.clip(partial, 1e-9, 1.0), labels=sev_classes)), 6))
    sev_tree_curve = {
        "kind": "cumulative_estimators",
        "x_axis_label": "Cumulative trees in fitted Random Forest",
        "values": [{"estimators": index + 1, "validation_log_loss": value} for index, value in enumerate(sev_logs)],
        "note": "Validation loss for prefixes of the fitted forest, not epoch-by-epoch neural training.",
    }
    print(f"    Validation Multi-Class Accuracy: {sev_acc * 100:.2f}% | Weighted F1: {sev_f1:.4f}")

    # 3. Train Quantitative Narrowing Regressor
    print("\n--- Training Model 3: Quantitative Stenosis Narrowing % Regressor ---")
    narrowing_regressor = GradientBoostingRegressor(
        n_estimators=120, max_depth=4, learning_rate=0.08,
        random_state=42
    )
    narrowing_regressor.fit(X_train, y_reg[train_mask])
    val_reg_pred = narrowing_regressor.predict(X_val)
    mae = mean_absolute_error(y_reg[val_mask], val_reg_pred)
    r2 = r2_score(y_reg[val_mask], val_reg_pred)
    print(f"    Validation Mean Absolute Error: ±{mae:.2f}% narrowing | R² Score: {r2:.4f}")

    # 4. Calibrate Segmentation Parameters
    print("\n--- Calibrating Model 4: Automated Lumen Segmentation Parameters ---")
    seg_dice_scores, seg_iou_scores = [], []
    for val_index in np.where(val_mask)[0]:
        row = df_valid.iloc[val_index]
        image_path = os.path.join(IMAGES_DIR, str(row["file_name"]))
        mask_path = os.path.join(MASKS_DIR, str(row.get("mask_file", "")))
        if not os.path.isfile(image_path) or not os.path.isfile(mask_path):
            continue
        image = np.asarray(Image.open(image_path).convert("L"))
        truth = np.asarray(Image.open(mask_path).convert("L")) > 0
        prediction, _, _ = segment_coronary_vessels(image)
        pred_bool = prediction > 0
        if truth.shape != pred_bool.shape:
            truth = np.asarray(Image.fromarray(truth.astype(np.uint8) * 255).resize((pred_bool.shape[1], pred_bool.shape[0]), Image.Resampling.NEAREST)) > 0
        intersection = int(np.logical_and(pred_bool, truth).sum())
        union = int(np.logical_or(pred_bool, truth).sum())
        seg_dice_scores.append(2 * intersection / max(1, int(pred_bool.sum()) + int(truth.sum())))
        seg_iou_scores.append(intersection / max(1, union))
    seg_mean_dice = float(np.mean(seg_dice_scores)) if seg_dice_scores else 0.0
    seg_mean_iou = float(np.mean(seg_iou_scores)) if seg_iou_scores else 0.0
    seg_config = {
        "model_name": "Infosys-ArteryNet-RefinedThreshold-v3",
        "standard_input_size": [256, 256],
        "validation_cases": len(seg_dice_scores),
        "mean_dice_score": round(seg_mean_dice, 4),
        "mean_iou_score": round(seg_mean_iou, 4),
        "note": "Measured on the validation split against supplied reference masks. This is the classical fallback; train U-Net/U-Net++ separately for deep-learning segmentation."
    }

    # Save models
    print("\n[+] Exporting trained model artifacts...")
    detector_path = os.path.join(MODELS_DIR, "trained_artery_classifier.joblib")
    severity_path = os.path.join(MODELS_DIR, "severity_classifier.joblib")
    regressor_path = os.path.join(MODELS_DIR, "narrowing_regressor.joblib")
    scaler_path = os.path.join(MODELS_DIR, "feature_scaler.joblib")
    seg_config_path = os.path.join(MODELS_DIR, "segmentation_config.json")

    joblib.dump(detector, detector_path)
    joblib.dump(severity_classifier, severity_path)
    joblib.dump(narrowing_regressor, regressor_path)
    joblib.dump(scaler, scaler_path)
    with open(seg_config_path, "w", encoding="utf-8") as f:
        json.dump(seg_config, f, indent=2)

    # Backward compatibility exports
    joblib.dump(detector, os.path.join(BASE_DIR, "trained_synthetic_classifier.joblib"))

    elapsed = round(time.time() - start_time, 2)

    report = {
        "organization": "Infosys Healthcare & Life Sciences AI Lab",
        "model_suite": "Infosys Artery AI Diagnostics v2.4",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "training_duration_seconds": elapsed,
        "dataset_summary": {
            "total_cases": int(total_records),
            "train_cases": int(train_mask.sum()),
            "val_cases": int(val_mask.sum()),
            "test_cases": int(test_mask.sum())
        },
        "split_method": "Deterministic severity-stratified 70/10/20 train/validation/test split (seed 42); image-only inputs for classifiers.",
        "validation_metrics": {
            "stenosis_detection": {
                "accuracy": round(float(det_acc), 4),
                "f1_score": round(float(det_f1), 4),
                "precision": round(float(precision_score(y_det[val_mask], val_det_pred, zero_division=0)), 4),
                "recall": round(float(recall_score(y_det[val_mask], val_det_pred, zero_division=0)), 4),
                "training_curve": {
                    "kind": "cumulative_estimators",
                    "x_axis_label": "Cumulative trees in fitted Random Forest",
                    "values": detector_tree_curve,
                    "note": "Measured train/validation metrics from prefixes of the fitted forest; these are not neural-network epochs.",
                }
            },
            "severity_classification": {
                "accuracy": round(float(sev_acc), 4),
                "weighted_f1": round(float(sev_f1), 4),
                "classes": ["Normal", "Mild", "Moderate", "Severe", "Critical"],
                "training_curve": sev_tree_curve,
                "detailed_report": classification_report(y_sev[val_mask], val_sev_pred, output_dict=True, zero_division=0)
            },
            "narrowing_regression": {
                "mean_absolute_error_percent": round(float(mae), 2),
                "r2_score": round(float(r2), 4)
            },
            "segmentation_benchmark": {
                "model": seg_config["model_name"],
                "cases": seg_config["validation_cases"],
                "mean_dice_score": seg_config["mean_dice_score"],
                "mean_iou_score": seg_config["mean_iou_score"]
            }
        },
        "model_artifacts": [
            "training/models/trained_artery_classifier.joblib",
            "training/models/severity_classifier.joblib",
            "training/models/narrowing_regressor.joblib",
            "training/models/feature_scaler.joblib",
            "training/models/segmentation_config.json"
        ]
    }

    report_path = os.path.join(BASE_DIR, "training_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    curve_path = os.path.join(BASE_DIR, "stenosis_classifier_training_curve.png")
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        points = detector_tree_curve
        figure, axes = plt.subplots(1, 2, figsize=(11, 4))
        trees = [point["estimators"] for point in points]
        axes[0].plot(trees, [point["train"]["log_loss"] for point in points], marker="o", label="Train")
        axes[0].plot(trees, [point["validation"]["log_loss"] for point in points], marker="o", label="Validation")
        axes[0].set_title("Stenosis classifier log loss")
        axes[0].set_xlabel("Cumulative trees")
        axes[0].set_ylabel("Log loss")
        axes[0].legend()
        for split_name, color in (("train", "#0d9488"), ("validation", "#7c3aed")):
            axes[1].plot(trees, [point[split_name]["accuracy"] * 100 for point in points], marker="o", color=color, label=f"{split_name.title()} accuracy")
            axes[1].plot(trees, [point[split_name]["f1"] * 100 for point in points], marker="^", linestyle="--", color=color, label=f"{split_name.title()} F1")
        axes[1].set_title("Classification accuracy and F1")
        axes[1].set_xlabel("Cumulative trees")
        axes[1].set_ylabel("Score (%)")
        axes[1].legend(fontsize=8)
        for axis in axes:
            axis.grid(alpha=0.2)
        figure.tight_layout()
        figure.savefig(curve_path, dpi=160)
        plt.close(figure)
        report["classifier_training_curve_artifact"] = "training/stenosis_classifier_training_curve.png"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    except Exception as exc:
        print(f"    Warning: could not render classifier curve: {exc}")

    print(f"\n[✓] Training complete in {elapsed}s!")
    print(f"[✓] Artifacts saved in {MODELS_DIR}")
    print(f"[✓] Summary report written to {report_path}")
    print("=" * 70)
    return report

if __name__ == "__main__":
    run_training()
