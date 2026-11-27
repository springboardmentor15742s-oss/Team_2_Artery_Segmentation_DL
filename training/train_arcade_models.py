"""Train vessel and stenosis U-Nets from the supplied ARCADE polygon labels.

Fits on the official ARCADE train split, selects checkpoints using the official
validation split, and reports performance on the separately held-out test split.
The two tasks are saved as different checkpoints and are never conflated.
"""
import argparse
import json
import os
import random
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from torch import nn
from torch.utils.data import DataLoader, Dataset

from segmentation_models import UNet

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = next((p for p in (ROOT / "arcade (1)" / "arcade", ROOT / "arcade" / "arcade", ROOT / "arcade") if (p / "syntax").is_dir() and (p / "stenosis").is_dir()), None)
MODELS = ROOT / "training" / "models"


def load_coco(task, split):
    base = DATA_ROOT / task / split
    path = base / "annotations" / f"{split}.json"
    if not path.is_file():
        raise FileNotFoundError(f"Missing ARCADE annotation file: {path}")
    document = json.loads(path.read_text(encoding="utf-8"))
    images = {image["id"]: image for image in document["images"]}
    by_image = {image_id: [] for image_id in images}
    lesion_category = next((c["id"] for c in document["categories"] if c["name"].lower() == "stenosis"), None)
    for ann in document["annotations"]:
        if task == "syntax" and ann["category_id"] == lesion_category:
            continue
        if task == "stenosis" and ann["category_id"] != lesion_category:
            continue
        by_image.setdefault(ann["image_id"], []).append(ann.get("segmentation") or [])
    return base / "images", [(images[i], by_image.get(i, [])) for i in images]


class PolygonDataset(Dataset):
    def __init__(self, image_dir, rows, size=256, augment=False):
        self.image_dir, self.rows, self.size, self.augment = image_dir, rows, size, augment

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        info, polygons = self.rows[index]
        image = Image.open(self.image_dir / info["file_name"]).convert("L")
        w, h = image.size
        image = image.resize((self.size, self.size), Image.Resampling.BILINEAR)
        # Draw polygons in the resized model coordinate space. Drawing scaled
        # coordinates onto the source-sized canvas shrinks masks a second time.
        mask = Image.new("L", (self.size, self.size), 0)
        draw = ImageDraw.Draw(mask)
        for segments in polygons:
            for polygon in segments:
                if len(polygon) >= 6:
                    points = [(float(polygon[i]) * self.size / w, float(polygon[i + 1]) * self.size / h) for i in range(0, len(polygon) - 1, 2)]
                    draw.polygon(points, fill=255)
        x = np.asarray(image, dtype=np.float32) / 255.0
        y = (np.asarray(mask, dtype=np.uint8) > 0).astype(np.float32)
        if self.augment and random.random() < 0.5:
            x, y = x[:, ::-1].copy(), y[:, ::-1].copy()
        if self.augment and random.random() < 0.25:
            x, y = x[::-1, :].copy(), y[::-1, :].copy()
        return torch.from_numpy(x[None]), torch.from_numpy(y[None])


def segmentation_metrics(model, loader, device):
    tp = fp = fn = 0
    model.eval()
    with torch.inference_mode():
        for images, masks in loader:
            predicted = torch.sigmoid(model(images.to(device))) >= 0.5
            truth = masks.to(device) >= 0.5
            tp += int((predicted & truth).sum().item())
            fp += int((predicted & ~truth).sum().item())
            fn += int((~predicted & truth).sum().item())
    return {"dice": 2 * tp / max(1, 2 * tp + fp + fn), "iou": tp / max(1, tp + fp + fn),
            "precision": tp / max(1, tp + fp), "recall": tp / max(1, tp + fn)}


def dice_loss(logits, target):
    probs = torch.sigmoid(logits)
    dims = (1, 2, 3)
    return 1 - ((2 * (probs * target).sum(dims) + 1) / (probs.sum(dims) + target.sum(dims) + 1)).mean()


def train_task(task, epochs, batch_size, size, device):
    image_dir, train_rows = load_coco(task, "train")
    val_dir, val_rows = load_coco(task, "val")
    test_dir, test_rows = load_coco(task, "test")
    train_loader = DataLoader(PolygonDataset(image_dir, train_rows, size, True), batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(PolygonDataset(val_dir, val_rows, size), batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(PolygonDataset(test_dir, test_rows, size), batch_size=batch_size, shuffle=False, num_workers=0)
    model = UNet(base=16).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-4, weight_decay=1e-4)
    bce = nn.BCEWithLogitsLoss()
    best_dice, best_state, history = -1.0, None, []
    checkpoint_name = "best_segmentation_model.pt" if task == "syntax" else "stenosis_candidate_model.pt"
    checkpoint_path = MODELS / checkpoint_name
    baseline_validation = None
    selected_source = "new training"
    if checkpoint_path.is_file():
        checkpoint = torch.load(checkpoint_path, map_location=device)
        baseline_model = UNet(base=int(checkpoint.get("base_channels", 16))).to(device)
        baseline_model.load_state_dict(checkpoint["state_dict"])
        baseline_validation = segmentation_metrics(baseline_model, val_loader, device)
        best_dice = baseline_validation["dice"]
        best_state = {key: value.detach().cpu().clone() for key, value in baseline_model.state_dict().items()}
        selected_source = "existing checkpoint"
        del baseline_model
    started = time.time()
    for epoch in range(epochs):
        model.train()
        loss_total = 0.0
        for images, masks in train_loader:
            images, masks = images.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = bce(logits, masks) + dice_loss(logits, masks)
            loss.backward()
            optimizer.step()
            loss_total += float(loss.detach().item())
        val_metrics = segmentation_metrics(model, val_loader, device)
        history.append({"epoch": epoch + 1, "mean_loss": round(loss_total / max(1, len(train_loader)), 5), "validation": val_metrics})
        print(f"{task} epoch {epoch + 1}/{epochs}: val Dice={val_metrics['dice']:.4f} IoU={val_metrics['iou']:.4f}", flush=True)
        if val_metrics["dice"] > best_dice:
            best_dice = val_metrics["dice"]
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            selected_source = "new training"
    if best_state is None:
        raise RuntimeError(f"No usable checkpoint was produced for ARCade {task} training.")
    model.load_state_dict(best_state)
    test_metrics = segmentation_metrics(model, test_loader, device)
    MODELS.mkdir(parents=True, exist_ok=True)
    promoted = selected_source == "new training"
    if promoted:
        torch.save({"architecture": "U-Net", "base_channels": 16, "size": size, "task": "vessel_segmentation" if task == "syntax" else "stenosis_candidate_segmentation", "dataset": "ARCADE", "state_dict": best_state}, checkpoint_path)
    return {"task": "vessel_segmentation" if task == "syntax" else "stenosis_candidate_segmentation", "dataset": "ARCADE", "train_images": len(train_rows), "validation_images": len(val_rows), "held_out_test_images": len(test_rows), "selection_metric": "official validation split Dice", "best_validation_dice": best_dice, "baseline_validation_metrics": baseline_validation, "checkpoint_source": selected_source, "promoted": promoted, "held_out_test_metrics": test_metrics, "checkpoint": str(checkpoint_path.relative_to(ROOT)), "epochs": epochs, "duration_seconds": round(time.time() - started, 1), "history": history}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--task", choices=("all", "vessel", "stenosis"), default="all")
    args = parser.parse_args()
    if DATA_ROOT is None:
        raise FileNotFoundError("ARCADE syntax/stenosis annotations were not found. Add the supplied arcade dataset folders first.")
    torch.manual_seed(args.seed); np.random.seed(args.seed); random.seed(args.seed)
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tasks = ("syntax", "stenosis") if args.task == "all" else (("syntax",) if args.task == "vessel" else ("stenosis",))
    report = {"dataset_root": str(DATA_ROOT.relative_to(ROOT)), "device": str(device), "models": []}
    for task in tasks:
        report["models"].append(train_task(task, args.epochs, args.batch_size, args.size, device))
    report_path = ROOT / "training" / "arcade_model_validation_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
