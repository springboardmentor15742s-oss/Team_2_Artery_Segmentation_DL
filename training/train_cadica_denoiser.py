"""Train and hold out-test a research-only denoiser on CADICA angiograms."""
import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from scipy import ndimage as ndi
from torch import nn
from torch.utils.data import DataLoader, Dataset

from denoising_models import CadicaDenoiser

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "dataset" / "CADICA"
MODEL_PATH = ROOT / "training" / "models" / "cadica_denoiser.pt"
REPORT_PATH = ROOT / "training" / "cadica_denoiser_report.json"
IMAGE_SIZE = 128


def collect_patient_images():
    rows = []
    for path in sorted((DATA_ROOT / "selectedVideos").glob("p*/v*/input/*.png")):
        relative = path.relative_to(DATA_ROOT / "selectedVideos")
        patient_id = relative.parts[0]
        rows.append((patient_id, path))
    if not rows:
        raise FileNotFoundError(
            f"No selected CADICA frames found under {DATA_ROOT / 'selectedVideos'}. "
            "Extract the supplied CADICA archive there first."
        )
    return rows


def split_by_patient(rows, seed):
    patient_ids = sorted({patient for patient, _ in rows})
    if len(patient_ids) < 10:
        raise RuntimeError("At least 10 distinct patients are required for a patient-held-out split.")
    random.Random(seed).shuffle(patient_ids)
    test_count = max(1, round(len(patient_ids) * 0.15))
    validation_count = max(1, round(len(patient_ids) * 0.15))
    test_patients = set(patient_ids[:test_count])
    validation_patients = set(patient_ids[test_count:test_count + validation_count])
    train_patients = set(patient_ids[test_count + validation_count:])
    partitions = {
        "train": [row for row in rows if row[0] in train_patients],
        "validation": [row for row in rows if row[0] in validation_patients],
        "test": [row for row in rows if row[0] in test_patients],
    }
    return partitions, {
        "train": sorted(train_patients),
        "validation": sorted(validation_patients),
        "test": sorted(test_patients),
    }


def limit_per_patient(rows, maximum, seed):
    grouped = {}
    for row in rows:
        grouped.setdefault(row[0], []).append(row)
    rng = random.Random(seed)
    limited = []
    for patient in sorted(grouped):
        patient_rows = grouped[patient]
        rng.shuffle(patient_rows)
        limited.extend(patient_rows[:maximum])
    return limited


class CadicaFrameDataset(Dataset):
    def __init__(self, rows, augment=False):
        self.rows = rows
        self.augment = augment

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        _, path = self.rows[index]
        image = Image.open(path).convert("L").resize(
            (IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BILINEAR
        )
        clean = torch.from_numpy(np.asarray(image, dtype=np.float32)[None] / 255.0)
        if self.augment:
            if torch.rand(()) < 0.5:
                clean = clean.flip(-1)
            if torch.rand(()) < 0.5:
                clean = clean.flip(-2)
        return clean


def corrupt(clean, fixed_density=None):
    density = fixed_density if fixed_density is not None else float(torch.empty(()).uniform_(0.05, 0.50))
    random_pixels = torch.rand_like(clean)
    noisy = clean.clone()
    noisy[random_pixels < density / 2] = 0.0
    noisy[random_pixels > 1.0 - density / 2] = 1.0
    gaussian_sigma = float(torch.empty(()).uniform_(0.0, 0.06))
    if gaussian_sigma:
        noisy = (noisy + torch.randn_like(noisy) * gaussian_sigma).clamp(0.0, 1.0)
    return noisy


def image_metrics(prediction, target):
    pred = prediction.detach().cpu().numpy()
    truth = target.detach().cpu().numpy()
    mse = np.mean((pred - truth) ** 2, axis=(1, 2, 3))
    psnr = 10.0 * np.log10(1.0 / np.maximum(mse, 1e-10))
    mu_pred = pred.mean(axis=(1, 2, 3))
    mu_truth = truth.mean(axis=(1, 2, 3))
    var_pred = pred.var(axis=(1, 2, 3))
    var_truth = truth.var(axis=(1, 2, 3))
    covariance = ((pred - mu_pred[:, None, None, None]) *
                  (truth - mu_truth[:, None, None, None])).mean(axis=(1, 2, 3))
    c1, c2 = 0.01 ** 2, 0.03 ** 2
    ssim = ((2 * mu_pred * mu_truth + c1) * (2 * covariance + c2)) / (
        (mu_pred ** 2 + mu_truth ** 2 + c1) * (var_pred + var_truth + c2)
    )
    return psnr, ssim


def evaluate(model, loader, device, seed):
    model.eval()
    torch.manual_seed(seed)
    totals = {"noisy_psnr": [], "median_psnr": [], "model_psnr": [],
              "noisy_ssim": [], "median_ssim": [], "model_ssim": []}
    with torch.inference_mode():
        for clean in loader:
            clean = clean.to(device)
            noisy = corrupt(clean, fixed_density=0.35)
            denoised = model(noisy)
            median_np = np.stack([
                ndi.median_filter(image[0].cpu().numpy(), size=3)
                for image in noisy
            ])[:, None]
            median = torch.from_numpy(median_np).to(device=device, dtype=clean.dtype)
            for name, result in (("noisy", noisy), ("median", median), ("model", denoised)):
                psnr, ssim = image_metrics(result, clean)
                totals[f"{name}_psnr"].extend(psnr.tolist())
                totals[f"{name}_ssim"].extend(ssim.tolist())
    return {key: round(float(np.mean(values)), 4) for key, values in totals.items()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-per-patient", type=int, default=16)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.max_per_patient < 1:
        raise ValueError("epochs, batch-size, and max-per-patient must be positive.")

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(max(1, min(6, torch.get_num_threads())))
    rows = collect_patient_images()
    partitions, patient_split = split_by_patient(rows, args.seed)
    samples = {
        name: limit_per_patient(partition, args.max_per_patient, args.seed + index)
        for index, (name, partition) in enumerate(partitions.items())
    }
    if min(len(samples[name]) for name in ("train", "validation", "test")) < 8:
        raise RuntimeError("Each patient-held-out partition needs at least 8 selected images.")

    train_loader = DataLoader(
        CadicaFrameDataset(samples["train"], augment=True),
        batch_size=args.batch_size, shuffle=True, num_workers=0,
    )
    validation_loader = DataLoader(
        CadicaFrameDataset(samples["validation"]),
        batch_size=args.batch_size, shuffle=False, num_workers=0,
    )
    test_loader = DataLoader(
        CadicaFrameDataset(samples["test"]),
        batch_size=args.batch_size, shuffle=False, num_workers=0,
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = CadicaDenoiser().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-4, weight_decay=1e-5)
    loss_fn = nn.L1Loss()
    best_validation_psnr = -1.0
    best_state = None
    history = []
    started = time.time()
    for epoch in range(args.epochs):
        model.train()
        losses = []
        for clean in train_loader:
            clean = clean.to(device)
            noisy = corrupt(clean)
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(noisy), clean)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().item()))
        validation = evaluate(model, validation_loader, device, args.seed + epoch)
        history.append({
            "epoch": epoch + 1,
            "train_l1": round(float(np.mean(losses)), 5),
            "validation": validation,
        })
        print(
            f"epoch {epoch + 1}/{args.epochs}: "
            f"validation model PSNR={validation['model_psnr']:.3f} dB "
            f"(median={validation['median_psnr']:.3f} dB)",
            flush=True,
        )
        if validation["model_psnr"] > best_validation_psnr:
            best_validation_psnr = validation["model_psnr"]
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}

    if best_state is None:
        raise RuntimeError("Training completed without a selectable model checkpoint.")
    model.load_state_dict(best_state)
    test_metrics = evaluate(model, test_loader, device, args.seed + 10_000)
    promoted = test_metrics["model_psnr"] > test_metrics["median_psnr"]
    checkpoint_path = None
    if promoted:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary_model = MODEL_PATH.with_suffix(".pt.tmp")
        torch.save({
            "architecture": "CadicaDenoiser",
            "channels": 16,
            "image_size": IMAGE_SIZE,
            "training_noise": "synthetic salt-and-pepper (5%-50%) plus Gaussian noise",
            "state_dict": best_state,
        }, temporary_model)
        temporary_model.replace(MODEL_PATH)
        checkpoint_path = str(MODEL_PATH.relative_to(ROOT)).replace("\\", "/")
    report = {
        "dataset": "CADICA selectedVideos",
        "dataset_root": str(DATA_ROOT.relative_to(ROOT)).replace("\\", "/"),
        "dataset_frames_available": len(rows),
        "image_split": "patient-held-out; no patient appears in more than one split",
        "patient_counts": {name: len(ids) for name, ids in patient_split.items()},
        "image_counts": {name: len(items) for name, items in samples.items()},
        "epochs": args.epochs,
        "selection_metric": "validation PSNR",
        "best_validation_psnr_db": best_validation_psnr,
        "held_out_test_metrics": test_metrics,
        "baseline": "3x3 median filter on the same synthesized noise",
        "checkpoint": checkpoint_path,
        "baseline_check_passed": promoted,
        "duration_seconds": round(time.time() - started, 2),
        "scope": "Research denoising only. Noise is synthetically added to acquired frames; this is not clinical validation.",
        "history": history,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not promoted:
        raise RuntimeError(
            "CADICA denoiser failed the held-out baseline check: "
            f"model PSNR {test_metrics['model_psnr']:.4f} dB <= "
            f"median baseline {test_metrics['median_psnr']:.4f} dB. "
            "The report was saved and no model checkpoint was promoted."
        )


if __name__ == "__main__":
    main()
