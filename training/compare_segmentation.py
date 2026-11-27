"""Compare a simple threshold baseline with the refined artery segmenter.

Metrics are calculated against the supplied held-out masks, not hard-coded.
Run from any directory with: python training/compare_segmentation.py
"""
import json
import os
import sys
import time

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE_DIR)
sys.path.insert(0, BASE_DIR)
from feature_extractor import segment_coronary_vessels
from data_splits import stratified_split_labels

DATA = os.path.join(ROOT, "dataset")
MANIFEST = os.path.join(DATA, "clinical_manifest.csv")
OUT = os.path.join(BASE_DIR, "segmentation_comparison.json")
PLOT = os.path.join(BASE_DIR, "segmentation_comparison.png")
EXAMPLES = os.path.join(BASE_DIR, "segmentation_examples.png")


def baseline(image):
    """Basic dark-vessel adaptive threshold without connected-component cleanup."""
    im = image.astype(np.float32)
    background = ndi.gaussian_filter(im, sigma=18)
    response = np.maximum(0, background - im)
    values = response[response > 5]
    threshold = float(np.percentile(values, 76)) if values.size > 50 else 22.0
    return response > threshold


def scores(pred, truth):
    pred = pred.astype(bool)
    truth = truth.astype(bool)
    tp = int(np.logical_and(pred, truth).sum())
    fp = int(np.logical_and(pred, ~truth).sum())
    fn = int(np.logical_and(~pred, truth).sum())
    dice = 2 * tp / max(1, 2 * tp + fp + fn)
    iou = tp / max(1, tp + fp + fn)
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    return {"dice": dice, "iou": iou, "precision": precision, "recall": recall}


def resize_mask(path, shape):
    mask = Image.open(path).convert("L")
    return np.asarray(mask.resize((shape[1], shape[0]), Image.Resampling.NEAREST)) > 0


def main():
    started = time.time()
    frame = pd.read_csv(MANIFEST)
    split_labels = stratified_split_labels(frame)
    test = frame[split_labels == "test"]
    names = ("Adaptive Threshold Baseline", "Refined Connected-Component Segmenter")
    results = {name: [] for name in names}
    examples = []
    skipped = 0
    for _, row in test.iterrows():
        image_path = os.path.join(DATA, "images", str(row["file_name"]))
        mask_path = os.path.join(DATA, "masks", str(row["mask_file"]))
        if not os.path.isfile(image_path) or not os.path.isfile(mask_path):
            skipped += 1
            continue
        image = np.asarray(Image.open(image_path).convert("L"))
        truth = resize_mask(mask_path, image.shape)
        baseline_pred = baseline(image)
        refined_pred, _, _ = segment_coronary_vessels(image)
        predictions = [baseline_pred, refined_pred > 0]
        for name, prediction in zip(names, predictions):
            results[name].append(scores(prediction, truth))
        if len(examples) < 6:
            examples.append((image, truth, baseline_pred, refined_pred > 0))

    models = []
    for name in names:
        rows = results[name]
        metrics = {key: float(np.mean([item[key] for item in rows])) if rows else 0.0 for key in ("dice", "iou", "precision", "recall")}
        models.append({"name": name, "cases": len(rows), **{key: round(val, 4) for key, val in metrics.items()}})
    best = max(models, key=lambda model: model["dice"]) if models else None
    report = {
        "title": "Segmentation Model Comparison",
        "dataset": "Supplied de-identified artery image dataset",
        "evaluation_split": "test",
        "split_method": "Deterministic severity-stratified 70/10/20 train/validation/test split (seed 42).",
        "cases_evaluated": len(results[names[0]]),
        "cases_skipped": skipped,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metrics": models,
        "selected_model": best["name"] if best else None,
        "selection_metric": "mean Dice coefficient",
        "interpretation": "Both methods are evaluated on the same held-out image masks. The refined method adds morphology and dominant-component filtering to the adaptive threshold baseline.",
        "limitations": "This comparison covers the supplied 2D image masks. It is not a prospective clinical validation and does not establish diagnostic performance.",
        "elapsed_seconds": round(time.time() - started, 2),
    }
    os.makedirs(BASE_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    keys = ["dice", "iou", "precision", "recall"]
    fig, ax = plt.subplots(figsize=(9, 5))
    x = np.arange(len(keys))
    width = 0.34
    for index, model in enumerate(models):
        vals = [model[key] for key in keys]
        ax.bar(x + (index - .5) * width, vals, width, label=model["name"])
    ax.set_xticks(x, [key.upper() for key in keys])
    ax.set_ylim(0, 1)
    ax.set_ylabel("Score")
    ax.set_title(f"Artery segmentation comparison · held-out test set (n={report['cases_evaluated']})")
    ax.legend(loc="lower right")
    ax.grid(axis="y", alpha=.2)
    fig.tight_layout()
    fig.savefig(PLOT, dpi=160)
    plt.close(fig)

    if examples:
        cell_w, cell_h = 240, 270
        canvas = Image.new("RGB", (cell_w * 4, cell_h * len(examples)), "white")
        draw = ImageDraw.Draw(canvas)
        headings = ["Original", "Ground truth", "Threshold baseline", "Refined segmenter"]
        for col, label in enumerate(headings):
            draw.text((col * cell_w + 8, 5), label, fill="black")
        for row_i, (image, truth, pred0, pred1) in enumerate(examples):
            for col, arr in enumerate((image, truth, pred0, pred1)):
                rgb = np.stack([arr.astype(np.uint8) * (255 if arr.dtype == bool else 1)] * 3, axis=-1) if arr.dtype == bool else np.stack([arr] * 3, axis=-1)
                tile = Image.fromarray(rgb).resize((cell_w - 8, cell_h - 30))
                canvas.paste(tile, (col * cell_w + 4, row_i * cell_h + 26))
        canvas.save(EXAMPLES)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
