"""Infosys Artery AI - Production Model Testing & Evaluation Pipeline.

Evaluates trained models on the held-out test split (155 cases):
1. Binary Stenosis Detection Evaluation (Accuracy, Precision, Recall, F1, ROC-AUC)
2. Multi-Class Severity Classification Evaluation (Confusion Matrix, Class F1-Scores)
3. Quantitative Narrowing Regressor Evaluation (MAE, RMSE, R²)
4. Empirical Segmentation Verification (Dice Coefficient & IoU vs Ground Truth Masks)

Outputs:
- training/test_report.json
- training/confusion_matrix.png
- training/evaluation_plots.png
- training/TEST_BENCHMARK_SUMMARY.md
"""

import os
import sys
import json
import time
import numpy as np
import pandas as pd
from PIL import Image
import scipy.ndimage as ndi
import joblib

# Set non-interactive backend for matplotlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_absolute_error, mean_squared_error, r2_score,
    confusion_matrix, classification_report, roc_curve, auc
)
from sklearn.linear_model import LogisticRegression

BASE_DIR = os.getenv("ARTERY_TRAINING_DIR", os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")
IMAGES_DIR = os.path.join(DATASET_DIR, "images")
MASKS_DIR = os.path.join(DATASET_DIR, "masks")
CENTERLINES_DIR = os.path.join(DATASET_DIR, "centerlines")
MANIFEST_PATH = os.path.join(DATASET_DIR, "clinical_manifest.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")

sys.path.insert(0, BASE_DIR)
from feature_extractor import extract_qca_features, segment_coronary_vessels
from data_splits import stratified_split_labels

def calculate_dice_and_iou(pred_mask, gt_mask):
    """Calculates Dice coefficient and Intersection over Union between two binary masks."""
    p_bool = pred_mask > 0
    g_bool = gt_mask > 0
    intersection = np.logical_and(p_bool, g_bool).sum()
    total_area = p_bool.sum() + g_bool.sum()
    union = np.logical_or(p_bool, g_bool).sum()

    dice = (2.0 * intersection) / (total_area + 1e-6) if total_area > 0 else 1.0
    iou = intersection / (union + 1e-6) if union > 0 else 1.0
    return float(dice), float(iou)

def run_testing():
    start_time = time.time()
    print("=" * 75)
    print("  INFOSYS ARTERY AI — HELD-OUT INDEPENDENT TEST BENCHMARK")
    print("  Comprehensive Clinical Validation & Diagnostic Reliability Suite")
    print("=" * 75)

    detector_path = os.path.join(MODELS_DIR, "trained_artery_classifier.joblib")
    severity_path = os.path.join(MODELS_DIR, "severity_classifier.joblib")
    regressor_path = os.path.join(MODELS_DIR, "narrowing_regressor.joblib")
    scaler_path = os.path.join(MODELS_DIR, "feature_scaler.joblib")

    for p in [detector_path, severity_path, regressor_path, scaler_path, MANIFEST_PATH]:
        if not os.path.exists(p):
            raise FileNotFoundError(f"Required artifact not found: {p}. Run training/train.py first.")

    detector = joblib.load(detector_path)
    severity_classifier = joblib.load(severity_path)
    narrowing_regressor = joblib.load(regressor_path)
    scaler = joblib.load(scaler_path)

    manifest = pd.read_csv(MANIFEST_PATH)
    split_labels = stratified_split_labels(manifest)
    test_df = manifest[split_labels == "test"].copy().reset_index(drop=True)
    train_df = manifest[split_labels == "train"].copy().reset_index(drop=True)
    total_test = len(test_df)
    print(f"\n[+] Loaded held-out test split: {total_test} clinical cases.")

    test_features = []
    dice_scores = []
    iou_scores = []
    valid_test_indices = []

    print("[+] Running multi-task inference and empirical segmentation benchmarks...")
    for i, row in test_df.iterrows():
        img_name = row["file_name"]
        mask_name = row.get("mask_file")
        cline_name = row.get("centerline_file")
        img_p = os.path.join(IMAGES_DIR, img_name)
        if not os.path.exists(img_p):
            continue

        try:
            im = np.array(Image.open(img_p).convert("L"))
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

            # Match live inference: only the scan may inform the classifier.
            # Reference masks and centerlines remain reserved for segmentation metrics.
            feats = extract_qca_features(im)
            test_features.append(feats)
            valid_test_indices.append(i)

            # Segmentation validation against ground truth mask
            if mask_arr is not None:
                pred_mask, _, _ = segment_coronary_vessels(im)
                d, u = calculate_dice_and_iou(pred_mask, mask_arr)
                dice_scores.append(d)
                iou_scores.append(u)
        except Exception as e:
            print(f"    Warning: skipping test case {img_name}: {e}")

    df_test_valid = test_df.iloc[valid_test_indices].copy().reset_index(drop=True)
    X_test = np.array(test_features, dtype=np.float32)
    X_test_scaled = scaler.transform(X_test)

    y_true_det = df_test_valid["stenosis_detected"].astype(int).to_numpy()
    y_true_sev = df_test_valid["severity"].to_numpy()
    y_true_reg = df_test_valid["narrowing_percentage"].astype(float).to_numpy()

    # 1. Evaluate Detection
    pred_det = detector.predict(X_test_scaled)
    prob_det = detector.predict_proba(X_test_scaled)[:, 1] if hasattr(detector, "predict_proba") else pred_det
    det_acc = accuracy_score(y_true_det, pred_det)
    det_prec = precision_score(y_true_det, pred_det, zero_division=0)
    det_rec = recall_score(y_true_det, pred_det, zero_division=0)
    det_f1 = f1_score(y_true_det, pred_det, zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y_true_det, pred_det, labels=[0, 1]).ravel()
    det_specificity = float(tn / max(1, tn + fp))
    if len(np.unique(y_true_det)) > 1:
        fpr, tpr, _ = roc_curve(y_true_det, prob_det)
        det_auc = float(auc(fpr, tpr))
    else:
        fpr, tpr, det_auc = np.array([0.0, 1.0]), np.array([0.0, 1.0]), None

    # Fit an interpretable linear QCA-feature baseline on train only, then
    # compare it with the saved detector on the identical untouched test rows.
    train_features, train_labels = [], []
    for _, row in train_df.iterrows():
        train_image_path = os.path.join(IMAGES_DIR, str(row["file_name"]))
        if not os.path.isfile(train_image_path):
            continue
        try:
            train_image = np.asarray(Image.open(train_image_path).convert("L"))
            train_features.append(extract_qca_features(train_image))
            train_labels.append(int(row["stenosis_detected"]))
        except Exception as exc:
            print(f"    Warning: skipping baseline train case {row['file_name']}: {exc}")
    if not train_features or len(np.unique(train_labels)) < 2:
        raise RuntimeError("The train split does not contain enough readable images and both stenosis classes for the linear QCA baseline.")
    linear_baseline = LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)
    linear_baseline.fit(scaler.transform(np.asarray(train_features, dtype=np.float32)), np.asarray(train_labels, dtype=np.int64))
    linear_predictions = linear_baseline.predict(X_test_scaled)
    linear_probabilities = linear_baseline.predict_proba(X_test_scaled)[:, list(linear_baseline.classes_).index(1)]
    linear_tn, linear_fp, linear_fn, linear_tp = confusion_matrix(y_true_det, linear_predictions, labels=[0, 1]).ravel()
    if len(np.unique(y_true_det)) > 1:
        linear_fpr, linear_tpr, _ = roc_curve(y_true_det, linear_probabilities)
        linear_auc = float(auc(linear_fpr, linear_tpr))
    else:
        linear_fpr, linear_tpr, linear_auc = np.array([0.0, 1.0]), np.array([0.0, 1.0]), None
    model_comparison = [
        {
            "name": "Trained stenosis detector",
            "architecture": f"{type(detector).__name__} · {len(getattr(detector, 'estimators_', []))} trees · QCA image features",
            "training_cases": int(len(train_features)), "test_cases": int(len(y_true_det)),
            "accuracy": float(det_acc), "roc_auc": det_auc, "precision": float(det_prec), "recall": float(det_rec),
            "f1_score": float(det_f1),
            "confusion_matrix": {"labels": ["No stenosis", "Stenosis"], "values": [[int(tn), int(fp)], [int(fn), int(tp)]]},
            "roc_curve": {"false_positive_rate": [float(v) for v in fpr], "true_positive_rate": [float(v) for v in tpr]},
        },
        {
            "name": "Linear QCA baseline",
            "architecture": "LogisticRegression · QCA image features",
            "training_cases": int(len(train_features)), "test_cases": int(len(y_true_det)),
            "accuracy": float(accuracy_score(y_true_det, linear_predictions)),
            "roc_auc": linear_auc,
            "precision": float(precision_score(y_true_det, linear_predictions, zero_division=0)),
            "recall": float(recall_score(y_true_det, linear_predictions, zero_division=0)),
            "f1_score": float(f1_score(y_true_det, linear_predictions, zero_division=0)),
            "confusion_matrix": {"labels": ["No stenosis", "Stenosis"], "values": [[int(linear_tn), int(linear_fp)], [int(linear_fn), int(linear_tp)]]},
            "roc_curve": {"false_positive_rate": [float(v) for v in linear_fpr], "true_positive_rate": [float(v) for v in linear_tpr]},
        },
    ]

    # 2. Evaluate Severity Multi-Class
    pred_sev = severity_classifier.predict(X_test_scaled)
    sev_classes = ["Normal", "Mild", "Moderate", "Severe", "Critical"]
    sev_acc = accuracy_score(y_true_sev, pred_sev)
    sev_f1 = f1_score(y_true_sev, pred_sev, average="weighted", zero_division=0)
    cm = confusion_matrix(y_true_sev, pred_sev, labels=sev_classes)
    cls_report = classification_report(y_true_sev, pred_sev, labels=sev_classes, output_dict=True, zero_division=0)

    # 3. Evaluate Narrowing Regressor
    pred_reg = narrowing_regressor.predict(X_test_scaled)
    mae = mean_absolute_error(y_true_reg, pred_reg)
    rmse = np.sqrt(mean_squared_error(y_true_reg, pred_reg))
    r2 = r2_score(y_true_reg, pred_reg)

    # 4. Segmentation Summary
    mean_dice = float(np.mean(dice_scores)) if dice_scores else 0.0
    mean_iou = float(np.mean(iou_scores)) if iou_scores else 0.0

    elapsed = round(time.time() - start_time, 2)

    # Print Executive Test Dashboard
    print("\n" + "=" * 75)
    print("                    TEST BENCHMARK EVALUATION RESULTS")
    print("=" * 75)
    print(f"Total Test Cases Evaluated : {len(df_test_valid)}")
    print(f"Test Runtime               : {elapsed} seconds")
    print("-" * 75)
    print("  TASK 1: CORONARY ARTERY STENOSIS DETECTION (BINARY)")
    print(f"    • Test Accuracy         : {det_acc * 100:.2f}%")
    print(f"    • Precision             : {det_prec * 100:.2f}%")
    print(f"    • Sensitivity (Recall)  : {det_rec * 100:.2f}%")
    print(f"    • F1-Score              : {det_f1:.4f}")
    print(f"    • Area Under ROC (AUC)  : {det_auc:.4f}" if det_auc is not None else "    • Area Under ROC (AUC)  : unavailable (one test class)")
    print("-" * 75)
    print("  TASK 2: MULTI-CLASS CLINICAL SEVERITY CLASSIFICATION")
    print(f"    • Overall Multi-Class Acc: {sev_acc * 100:.2f}%")
    print(f"    • Weighted F1-Score      : {sev_f1:.4f}")
    print("    • Class Breakdown:")
    for c in sev_classes:
        c_stats = cls_report.get(c, {})
        print(f"       [{c:<9}] Prec: {c_stats.get('precision', 0)*100:5.1f}% | Rec: {c_stats.get('recall', 0)*100:5.1f}% | F1: {c_stats.get('f1-score', 0):.3f} | Support: {c_stats.get('support', 0)}")
    print("-" * 75)
    print("  TASK 3: QUANTITATIVE CORONARY ANGIOGRAPHY (QCA) REGRESSION")
    print(f"    • Mean Absolute Error (MAE) : ±{mae:.2f}% narrowing")
    print(f"    • Root Mean Squared Error   : ±{rmse:.2f}%")
    print(f"    • Coefficient of Determ (R²): {r2:.4f}")
    print("-" * 75)
    print("  TASK 4: VESSEL LUMEN SEGMENTATION BENCHMARK")
    print(f"    • Mean Dice Similarity Coeff : {mean_dice:.4f} ({mean_dice*100:.1f}% match)")
    print(f"    • Mean Intersection over Union: {mean_iou:.4f} ({mean_iou*100:.1f}% IoU)")
    print("=" * 75)

    # Render plots
    print("[+] Rendering performance evaluation plots...")
    fig, axes = plt.subplots(2, 2, figsize=(14, 11))

    # Subplot 1: Confusion Matrix
    ax1 = axes[0, 0]
    im_cm = ax1.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax1.set_title("Stenosis Severity Confusion Matrix (Test Set)", fontsize=12, fontweight="bold", pad=10)
    fig.colorbar(im_cm, ax=ax1, fraction=0.046, pad=0.04)
    tick_marks = np.arange(len(sev_classes))
    ax1.set_xticks(tick_marks)
    ax1.set_yticks(tick_marks)
    ax1.set_xticklabels(sev_classes, rotation=35, ha="right", fontsize=9)
    ax1.set_yticklabels(sev_classes, fontsize=9)
    ax1.set_ylabel("True Clinical Grade", fontsize=10, fontweight="bold")
    ax1.set_xlabel("Predicted Grade", fontsize=10, fontweight="bold")
    thresh = cm.max() / 2.0
    for r in range(cm.shape[0]):
        for c in range(cm.shape[1]):
            ax1.text(c, r, format(cm[r, c], "d"),
                     ha="center", va="center",
                     color="white" if cm[r, c] > thresh else "black",
                     fontweight="bold")

    # Subplot 2: ROC Curve
    ax2 = axes[0, 1]
    ax2.plot(fpr, tpr, color="#0284c7", lw=2.5, label=f"ROC Curve (AUC = {det_auc:.3f})" if det_auc is not None else "ROC unavailable (one class)")
    ax2.plot([0, 1], [0, 1], color="#94a3b8", lw=1.5, linestyle="--", label="Chance Baseline")
    ax2.set_xlim([0.0, 1.0])
    ax2.set_ylim([0.0, 1.05])
    ax2.set_xlabel("False Positive Rate (1 - Specificity)", fontsize=10, fontweight="bold")
    ax2.set_ylabel("True Positive Rate (Sensitivity)", fontsize=10, fontweight="bold")
    ax2.set_title("Coronary Stenosis ROC Curve", fontsize=12, fontweight="bold", pad=10)
    ax2.legend(loc="lower right", frameon=True)
    ax2.grid(True, linestyle=":", alpha=0.6)

    # Subplot 3: QCA Narrowing Regression Scatter
    ax3 = axes[1, 0]
    ax3.scatter(y_true_reg, pred_reg, color="#0d9488", alpha=0.65, edgecolors="none", s=36)
    reg_line = np.linspace(0, 100, 100)
    ax3.plot(reg_line, reg_line, color="#e11d48", linestyle="--", lw=2, label="Perfect Agreement (y = x)")
    ax3.set_xlabel("True Luminal Narrowing (%)", fontsize=10, fontweight="bold")
    ax3.set_ylabel("AI Predicted Narrowing (%)", fontsize=10, fontweight="bold")
    ax3.set_title(f"Quantitative Angiography Agreement (MAE: ±{mae:.1f}%, R²: {r2:.3f})", fontsize=12, fontweight="bold", pad=10)
    ax3.legend(loc="upper left")
    ax3.grid(True, linestyle=":", alpha=0.6)

    # Subplot 4: Dice Distribution
    ax4 = axes[1, 1]
    ax4.hist(dice_scores if dice_scores else [mean_dice], bins=15, color="#6366f1", edgecolor="white", alpha=0.85)
    ax4.axvline(mean_dice, color="#dc2626", linestyle="--", lw=2, label=f"Mean Dice: {mean_dice:.3f}")
    ax4.set_xlabel("Dice Similarity Coefficient (DSC)", fontsize=10, fontweight="bold")
    ax4.set_ylabel("Case Frequency", fontsize=10, fontweight="bold")
    ax4.set_title("Vessel Lumen Segmentation Dice Distribution", fontsize=12, fontweight="bold", pad=10)
    ax4.legend(loc="upper left")
    ax4.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plot_path = os.path.join(BASE_DIR, "evaluation_plots.png")
    fig.savefig(plot_path, dpi=200, bbox_inches="tight")
    plt.close(fig)

    fig_cm, ax_cm = plt.subplots(figsize=(6, 5))
    im_cm2 = ax_cm.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax_cm.set_title("Infosys Artery AI — Severity Confusion Matrix", fontsize=11, fontweight="bold")
    fig_cm.colorbar(im_cm2, ax=ax_cm, fraction=0.046, pad=0.04)
    ax_cm.set_xticks(tick_marks)
    ax_cm.set_yticks(tick_marks)
    ax_cm.set_xticklabels(sev_classes, rotation=35, ha="right")
    ax_cm.set_yticklabels(sev_classes)
    ax_cm.set_ylabel("Ground Truth")
    ax_cm.set_xlabel("AI Prediction")
    for r in range(cm.shape[0]):
        for c in range(cm.shape[1]):
            ax_cm.text(c, r, format(cm[r, c], "d"),
                       ha="center", va="center",
                       color="white" if cm[r, c] > thresh else "black")
    plt.tight_layout()
    cm_path = os.path.join(BASE_DIR, "confusion_matrix.png")
    fig_cm.savefig(cm_path, dpi=180, bbox_inches="tight")
    plt.close(fig_cm)

    test_report = {
        "organization": "Infosys Healthcare & Life Sciences AI Lab",
        "benchmark_suite": "Infosys Artery AI Held-Out Validation",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_cases_count": int(len(df_test_valid)),
        "split_method": "Deterministic severity-stratified 70/10/20 train/validation/test split (seed 42); classifier inputs use scans only.",
        "evaluation_duration_seconds": elapsed,
        "metrics": {
            "stenosis_detection": {
                "accuracy": round(float(det_acc), 4),
                "precision": round(float(det_prec), 4),
                "recall_sensitivity": round(float(det_rec), 4),
                "specificity": round(det_specificity, 4),
                "confusion_matrix": {"labels": ["No stenosis", "Stenosis"], "values": [[int(tn), int(fp)], [int(fn), int(tp)]]},
                "confusion_matrix": {"labels": ["No stenosis", "Stenosis"], "values": [[int(tn), int(fp)], [int(fn), int(tp)]]},
                "f1_score": round(float(det_f1), 4),
                "roc_auc": round(float(det_auc), 4) if det_auc is not None else None,
                "roc_curve": {"false_positive_rate": [round(float(value), 6) for value in fpr], "true_positive_rate": [round(float(value), 6) for value in tpr]}
                ,"model_comparison": model_comparison
            },
            "severity_classification": {
                "accuracy": round(float(sev_acc), 4),
                "weighted_f1": round(float(sev_f1), 4),
                "classes": sev_classes,
                "confusion_matrix": cm.tolist(),
                "class_report": cls_report
            },
            "narrowing_regression": {
                "mean_absolute_error_percent": round(float(mae), 2),
                "root_mean_squared_error_percent": round(float(rmse), 2),
                "r2_score": round(float(r2), 4)
            },
            "segmentation_benchmark": {
                "mean_dice_similarity_coefficient": round(mean_dice, 4),
                "mean_intersection_over_union": round(mean_iou, 4)
            }
        },
        "artifacts_generated": [
            "training/test_report.json",
            "training/evaluation_plots.png",
            "training/confusion_matrix.png",
            "training/TEST_BENCHMARK_SUMMARY.md"
        ],
        "roc_curve_artifact": "training/evaluation_plots.png" if det_auc is not None else None
    }

    test_report_path = os.path.join(BASE_DIR, "test_report.json")
    with open(test_report_path, "w", encoding="utf-8") as f:
        json.dump(test_report, f, indent=2)

    summary_md = f"""# Infosys Artery AI — Independent Model Test Benchmark

## Executive Summary
This report summarizes the objective diagnostic performance of the **Infosys Artery AI** model suite on a held-out test cohort of **{len(df_test_valid)} clinical angiograms**.

- **Evaluation Date:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
- **Benchmark Suite:** Infosys Diagnostic Intelligence Protocol
- **Test Sample Size:** {len(df_test_valid)} Cases (Stratified across Normal, Mild, Moderate, Severe, and Critical)

---

## 1. Stenosis Detection Performance (Binary)
- **Test Accuracy:** **{det_acc * 100:.2f}%**
- **Sensitivity (Recall):** **{det_rec * 100:.2f}%**
- **Precision:** **{det_prec * 100:.2f}%**
- **F1-Score:** **{det_f1:.4f}**
- **Area Under ROC Curve (AUC):** **{f'{det_auc:.4f}' if det_auc is not None else 'Unavailable (one test class)'}**

---

## 2. Multi-Class Severity Grading (ACC/AHA Criteria)
- **Multi-Class Accuracy:** **{sev_acc * 100:.2f}%**
- **Weighted F1-Score:** **{sev_f1:.4f}**

| Grade | Narrowing % | Precision | Recall | F1-Score |
| :--- | :--- | :--- | :--- | :--- |
| **Normal** | 0% – 24% | {cls_report.get('Normal',{}).get('precision',0)*100:.1f}% | {cls_report.get('Normal',{}).get('recall',0)*100:.1f}% | {cls_report.get('Normal',{}).get('f1-score',0):.3f} |
| **Mild** | 25% – 49% | {cls_report.get('Mild',{}).get('precision',0)*100:.1f}% | {cls_report.get('Mild',{}).get('recall',0)*100:.1f}% | {cls_report.get('Mild',{}).get('f1-score',0):.3f} |
| **Moderate** | 50% – 69% | {cls_report.get('Moderate',{}).get('precision',0)*100:.1f}% | {cls_report.get('Moderate',{}).get('recall',0)*100:.1f}% | {cls_report.get('Moderate',{}).get('f1-score',0):.3f} |
| **Severe** | 70% – 89% | {cls_report.get('Severe',{}).get('precision',0)*100:.1f}% | {cls_report.get('Severe',{}).get('recall',0)*100:.1f}% | {cls_report.get('Severe',{}).get('f1-score',0):.3f} |
| **Critical** | 90% – 99% | {cls_report.get('Critical',{}).get('precision',0)*100:.1f}% | {cls_report.get('Critical',{}).get('recall',0)*100:.1f}% | {cls_report.get('Critical',{}).get('f1-score',0):.3f} |

---

## 3. Quantitative Coronary Angiography (QCA) Lumen Narrowing
- **Mean Absolute Error (MAE):** **±{mae:.2f}%**
- **Root Mean Squared Error (RMSE):** **±{rmse:.2f}%**
- **Coefficient of Determination (R²):** **{r2:.4f}**

---

## 4. Vessel Segmentation Benchmark
- **Mean Dice Similarity Coefficient (DSC):** **{mean_dice:.4f}** ({mean_dice*100:.1f}% accuracy)
- **Mean Intersection over Union (IoU):** **{mean_iou:.4f}** ({mean_iou*100:.1f}% IoU)
"""
    summary_path = os.path.join(BASE_DIR, "TEST_BENCHMARK_SUMMARY.md")
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write(summary_md)

    print(f"\n[✓] All test benchmarks completed successfully!")
    print(f"[✓] Figures generated: {plot_path} and {cm_path}")
    print(f"[✓] Summary written to: {summary_path}")
    print("=" * 75)
    return test_report

if __name__ == "__main__":
    run_testing()
