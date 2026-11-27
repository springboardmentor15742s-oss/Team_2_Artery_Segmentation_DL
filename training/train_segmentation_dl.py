"""Train and compare U-Net and U-Net++ using the supplied mask annotations."""
import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset

from segmentation_models import UNet, UNetPlusPlus

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "dataset")
MODELS = os.path.join(HERE, "models")
sys.path.insert(0, HERE)
from data_splits import stratified_split_labels


class ArteryMaskDataset(Dataset):
    def __init__(self, rows, size=256, augment=False):
        self.rows = rows.reset_index(drop=True)
        self.size = size
        self.augment = augment

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        row = self.rows.iloc[index]
        image = Image.open(os.path.join(DATA, "images", row.file_name)).convert("L").resize((self.size, self.size), Image.Resampling.BILINEAR)
        mask = Image.open(os.path.join(DATA, "masks", row.mask_file)).convert("L").resize((self.size, self.size), Image.Resampling.NEAREST)
        x = np.asarray(image, dtype=np.float32) / 255.0
        y = (np.asarray(mask, dtype=np.float32) > 0).astype(np.float32)
        if self.augment and np.random.rand() < .5:
            x, y = x[:, ::-1].copy(), y[:, ::-1].copy()
        if self.augment and np.random.rand() < .5:
            x, y = x[::-1, :].copy(), y[::-1, :].copy()
        return torch.from_numpy(x[None]), torch.from_numpy(y[None])


def dice_loss(logits, target):
    probs = torch.sigmoid(logits)
    dims = (1, 2, 3)
    numerator = 2 * (probs * target).sum(dims) + 1
    denominator = probs.sum(dims) + target.sum(dims) + 1
    return 1 - (numerator / denominator).mean()


def metric_totals(model, loader, device):
    tp = fp = fn = 0
    model.eval()
    with torch.no_grad():
        for images, masks in loader:
            predicted = torch.sigmoid(model(images.to(device))) >= .5
            truth = masks.to(device) >= .5
            tp += int((predicted & truth).sum().item())
            fp += int((predicted & ~truth).sum().item())
            fn += int((~predicted & truth).sum().item())
    return {"dice": 2 * tp / max(1, 2 * tp + fp + fn), "iou": tp / max(1, tp + fp + fn),
            "precision": tp / max(1, tp + fp), "recall": tp / max(1, tp + fn)}


def train_one(name, model, train_loader, val_loader, test_loader, epochs, device):
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    bce = nn.BCEWithLogitsLoss()
    best_dice = -1
    best_state = None
    history = []
    for epoch in range(epochs):
        model.train()
        loss_sum = 0.0
        for images, masks in train_loader:
            images, masks = images.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = bce(logits, masks) + dice_loss(logits, masks)
            loss.backward()
            optimizer.step()
            loss_sum += float(loss.detach().item())
        val = metric_totals(model, val_loader, device)
        history.append({"epoch": epoch + 1, "train_loss": round(loss_sum / max(1, len(train_loader)), 5), "validation": val})
        print(f"{name} epoch {epoch + 1}/{epochs}: val Dice={val['dice']:.4f}", flush=True)
        if val["dice"] > best_dice:
            best_dice = val["dice"]
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
    model.load_state_dict(best_state)
    os.makedirs(MODELS, exist_ok=True)
    artifact = os.path.join(MODELS, f"{name.lower().replace('+','p').replace(' ','_')}.pt")
    torch.save({"architecture": name, "base_channels": 16 if name == "U-Net" else 12, "size": 256, "state_dict": best_state}, artifact)
    return {"name": name, "artifact": os.path.relpath(artifact, ROOT).replace("\\", "/"),
            "best_validation_dice": round(best_dice, 4), "test_metrics": {k: round(v, 4) for k, v in metric_totals(model, test_loader, device).items()},
            "history": history}, best_state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    frame = pd.read_csv(os.path.join(DATA, "clinical_manifest.csv"))
    frame = frame[frame.apply(lambda r: os.path.isfile(os.path.join(DATA, "images", r.file_name)) and os.path.isfile(os.path.join(DATA, "masks", r.mask_file)), axis=1)]
    split = stratified_split_labels(frame)
    train_rows, val_rows, test_rows = frame[split == "train"], frame[split == "val"], frame[split == "test"]
    if min(len(train_rows), len(val_rows), len(test_rows)) == 0:
        raise RuntimeError("The manifest must have non-empty train, val, and test splits with matching image and mask files.")
    kwargs = {"batch_size": args.batch_size, "num_workers": 0, "pin_memory": args.device.startswith("cuda")}
    train_loader = DataLoader(ArteryMaskDataset(train_rows, args.size, augment=True), shuffle=True, **kwargs)
    val_loader = DataLoader(ArteryMaskDataset(val_rows, args.size), shuffle=False, **kwargs)
    test_loader = DataLoader(ArteryMaskDataset(test_rows, args.size), shuffle=False, **kwargs)
    device = torch.device(args.device)
    models = [("U-Net", UNet(base=16)), ("U-Net++", UNetPlusPlus(base=12))]
    started = time.time()
    results, states = [], []
    for name, model in models:
        record, state = train_one(name, model, train_loader, val_loader, test_loader, args.epochs, device)
        results.append(record); states.append(state)
    best_index = int(np.argmax([item["best_validation_dice"] for item in results]))
    best_name = results[best_index]["name"]
    torch.save({"architecture": best_name, "base_channels": 16 if best_name == "U-Net" else 12, "size": args.size, "state_dict": states[best_index]}, os.path.join(MODELS, "best_segmentation_model.pt"))
    report = {"title": "Deep Learning Segmentation Comparison", "dataset_cases": len(frame), "train_cases": len(train_rows), "validation_cases": len(val_rows), "test_cases": len(test_rows), "split_method": "Deterministic severity-stratified 70/10/20 train/validation/test split (seed 42).", "selected_model": best_name, "selection_metric": "validation Dice", "models": results, "duration_seconds": round(time.time() - started, 2)}
    with open(os.path.join(HERE, "segmentation_dl_report.json"), "w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
