"""Train a single-class lesion localizer from CADICA boxes.

The split is by patient. CADICA category codes are retained in the report but
not interpreted as severity classes without the dataset annotation guide.
"""

import argparse
import json
import os
import random
import tempfile
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps
from torch.utils.data import DataLoader, Dataset

try:
    from .cadica_detector import CadicaBoxDetector, box_iou, decode_boxes
except ImportError:
    from cadica_detector import CadicaBoxDetector, box_iou, decode_boxes


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "dataset" / "CADICA" / "selectedVideos"
TRAINING_ROOT = ROOT / "training"
MODEL_PATH = TRAINING_ROOT / "models" / "cadica_lesion_detector.pt"
REPORT_PATH = TRAINING_ROOT / "cadica_detector_report.json"
DEFAULT_SIZE = 256
GRID_DIVISOR = 4
IOU_THRESHOLD = 0.5


def parse_boxes(path, width, height):
    boxes = []
    categories = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) < 4:
            raise ValueError(f"Malformed CADICA box at {path}:{line_number}")
        try:
            x, y, box_width, box_height = map(float, parts[:4])
        except ValueError as exc:
            raise ValueError(f"Malformed CADICA coordinates at {path}:{line_number}") from exc
        if (
            not np.isfinite([x, y, box_width, box_height]).all()
            or x < 0
            or y < 0
            or box_width <= 0
            or box_height <= 0
            or x + box_width > width + 1
            or y + box_height > height + 1
        ):
            raise ValueError(f"Invalid CADICA box dimensions at {path}:{line_number}")
        boxes.append([x, y, box_width, box_height])
        categories.append(" ".join(parts[4:]) or "unspecified")
    return boxes, categories


def read_video_ids(path):
    if not path.is_file():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_samples(data_root=DATA_ROOT):
    samples = []
    category_counts = {}
    missing_annotated_frames = []
    for patient_dir in sorted(data_root.glob("p*"), key=lambda path: int(path.name[1:])):
        if not patient_dir.is_dir() or not patient_dir.name[1:].isdigit():
            continue
        lesion_videos = read_video_ids(patient_dir / "lesionVideos.txt")
        nonlesion_videos = read_video_ids(patient_dir / "nonlesionVideos.txt")
        for video_dir in sorted(patient_dir.glob("v*"), key=lambda path: int(path.name[1:])):
            if not video_dir.is_dir() or not video_dir.name[1:].isdigit():
                continue
            if video_dir.name not in lesion_videos and video_dir.name not in nonlesion_videos:
                continue
            selected_frames = video_dir / f"{patient_dir.name}_{video_dir.name}_selectedFrames.txt"
            if not selected_frames.is_file():
                raise FileNotFoundError(f"CADICA selected-frame list not found: {selected_frames}")
            for frame_name in sorted(read_video_ids(selected_frames)):
                frame_stem = Path(frame_name).stem
                image_path = video_dir / "input" / f"{frame_stem}.png"
                if not image_path.is_file():
                    raise FileNotFoundError(f"CADICA selected image not found: {image_path}")
                with Image.open(image_path) as image:
                    width, height = image.size
                    if width < 2 or height < 2:
                        raise ValueError(f"Invalid CADICA image dimensions: {image_path}")
                    if video_dir.name in lesion_videos:
                        annotation_path = video_dir / "groundtruth" / f"{frame_stem}.txt"
                        if not annotation_path.is_file():
                            missing_annotated_frames.append(str(image_path.relative_to(data_root)))
                            continue
                        boxes, categories = parse_boxes(annotation_path, width, height)
                        for category in categories:
                            category_counts[category] = category_counts.get(category, 0) + 1
                    else:
                        boxes = []
                samples.append({
                    "image_path": image_path,
                    "patient_id": patient_dir.name,
                    "frame_id": frame_stem,
                    "width": width,
                    "height": height,
                    "boxes": boxes,
                })
    if not samples or not any(sample["boxes"] for sample in samples):
        raise ValueError(f"No usable CADICA selected frames and lesion boxes found under {data_root}")
    if not any(not sample["boxes"] for sample in samples):
        raise ValueError("CADICA non-lesion selected frames are required for detector training.")
    return samples, category_counts, missing_annotated_frames


def split_patient_ids(samples, seed):
    patients = sorted({sample["patient_id"] for sample in samples}, key=lambda value: int(value[1:]))
    if len(patients) < 3:
        raise ValueError("At least three distinct patients are required for train/validation/test splits.")
    test_count = max(1, round(len(patients) * 0.15))
    validation_count = max(1, round(len(patients) * 0.15))
    for attempt in range(1000):
        shuffled = patients[:]
        random.Random(seed + attempt).shuffle(shuffled)
        splits = {
            "train": set(shuffled[:len(patients) - validation_count - test_count]),
            "validation": set(shuffled[len(patients) - validation_count - test_count:len(patients) - test_count]),
            "test": set(shuffled[len(patients) - test_count:]),
        }
        valid = True
        for patient_ids in splits.values():
            patient_samples = [sample for sample in samples if sample["patient_id"] in patient_ids]
            if not patient_samples or not any(sample["boxes"] for sample in patient_samples) or not any(not sample["boxes"] for sample in patient_samples):
                valid = False
                break
        if valid:
            return splits
    raise ValueError("Could not form patient-held-out splits containing both annotated and non-lesion frames.")


def target_for_boxes(boxes, width, height, size, grid_size):
    objectness = np.zeros((grid_size, grid_size), dtype=np.float32)
    regression = np.zeros((4, grid_size, grid_size), dtype=np.float32)
    collisions = 0
    for x, y, box_width, box_height in boxes:
        center_x = (x + box_width / 2) * size / width
        center_y = (y + box_height / 2) * size / height
        cell_x = min(grid_size - 1, max(0, int(center_x / size * grid_size)))
        cell_y = min(grid_size - 1, max(0, int(center_y / size * grid_size)))
        if objectness[cell_y, cell_x]:
            collisions += 1
            old_area = regression[2, cell_y, cell_x] * regression[3, cell_y, cell_x]
            new_area = (box_width / width) * (box_height / height)
            if old_area >= new_area:
                continue
        objectness[cell_y, cell_x] = 1.0
        regression[:, cell_y, cell_x] = (
            center_x / size * grid_size - cell_x,
            center_y / size * grid_size - cell_y,
            box_width / width,
            box_height / height,
        )
    return objectness, regression, collisions


class CadicaFrames(Dataset):
    def __init__(self, samples, size, augment=False):
        self.samples = samples
        self.size = size
        self.grid_size = size // GRID_DIVISOR
        self.augment = augment

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        sample = self.samples[index]
        with Image.open(sample["image_path"]) as source:
            image = source.convert("L")
        width, height = image.size
        boxes = [box[:] for box in sample["boxes"]]
        if self.augment and random.random() < 0.5:
            image = ImageOps.mirror(image)
            boxes = [[width - x - box_width, y, box_width, box_height] for x, y, box_width, box_height in boxes]
        if self.augment and random.random() < 0.5:
            image = ImageOps.flip(image)
            boxes = [[x, height - y - box_height, box_width, box_height] for x, y, box_width, box_height in boxes]
        resized = image.resize((self.size, self.size), Image.Resampling.BILINEAR)
        pixels = np.asarray(resized, dtype=np.float32) / 255.0
        objectness, regression, _ = target_for_boxes(boxes, width, height, self.size, self.grid_size)
        normalized_boxes = [
            [x / width, y / height, (x + box_width) / width, (y + box_height) / height]
            for x, y, box_width, box_height in boxes
        ]
        return (
            torch.from_numpy(pixels[None]),
            torch.from_numpy(objectness),
            torch.from_numpy(regression),
            torch.tensor(normalized_boxes, dtype=torch.float32).reshape(-1, 4),
        )


def collate_frames(batch):
    images, objectness, regression, boxes = zip(*batch)
    return torch.stack(images), torch.stack(objectness), torch.stack(regression), list(boxes)


def detector_loss(output, objectness, regression):
    object_logits = output[:, 0]
    positive = objectness > 0.5
    negative = ~positive
    positive_loss = F.binary_cross_entropy_with_logits(object_logits[positive], objectness[positive]) if positive.any() else output.sum() * 0
    negative_loss = F.binary_cross_entropy_with_logits(object_logits[negative], objectness[negative]) if negative.any() else output.sum() * 0
    object_loss = positive_loss + 0.25 * negative_loss
    if positive.any():
        predicted_boxes = torch.sigmoid(output[:, 1:5]).permute(0, 2, 3, 1)[positive]
        target_boxes = regression.permute(0, 2, 3, 1)[positive]
        box_loss = F.smooth_l1_loss(predicted_boxes, target_boxes)
    else:
        box_loss = output.sum() * 0
    return object_loss + 4.0 * box_loss, object_loss.detach(), box_loss.detach()


def match_predictions(predictions, ground_truths):
    matched = set()
    true_positives = []
    false_positives = []
    ordered = []
    for image_index, image_predictions in enumerate(predictions):
        for box, score in image_predictions:
            ordered.append((score, image_index, box))
    ordered.sort(key=lambda item: item[0], reverse=True)
    for score, image_index, box in ordered:
        truths = ground_truths[image_index]
        overlaps = box_iou(box, truths)
        best = int(np.argmax(overlaps)) if len(overlaps) else -1
        if best >= 0 and overlaps[best] >= IOU_THRESHOLD and (image_index, best) not in matched:
            matched.add((image_index, best))
            true_positives.append(1)
            false_positives.append(0)
        else:
            true_positives.append(0)
            false_positives.append(1)
    total_ground_truth = sum(len(boxes) for boxes in ground_truths)
    return true_positives, false_positives, total_ground_truth


def average_precision(true_positives, false_positives, total_ground_truth):
    if total_ground_truth == 0:
        return None
    if not true_positives:
        return 0.0
    tp = np.cumsum(true_positives)
    fp = np.cumsum(false_positives)
    recall = tp / total_ground_truth
    precision = tp / np.maximum(tp + fp, 1)
    recall = np.concatenate(([0.0], recall, [1.0]))
    precision = np.concatenate(([0.0], precision, [0.0]))
    for index in range(len(precision) - 2, -1, -1):
        precision[index] = max(precision[index], precision[index + 1])
    changes = np.flatnonzero(recall[1:] != recall[:-1])
    return float(np.sum((recall[changes + 1] - recall[changes]) * precision[changes + 1]))


def predict(model, loader, device):
    model.eval()
    all_predictions = []
    all_truths = []
    with torch.inference_mode():
        for images, _objectness, _regression, boxes in loader:
            outputs = model(images.to(device))
            for output, ground_truth in zip(outputs, boxes):
                decoded = decode_boxes(output[None], 0.01, IOU_THRESHOLD)
                all_predictions.append(decoded)
                all_truths.append(ground_truth.cpu().numpy().tolist())
    return all_predictions, all_truths


def metrics_from_predictions(all_predictions, all_truths, score_threshold):
    selected = [
        [(box, score) for box, score in predictions if score >= score_threshold]
        for predictions in all_predictions
    ]
    tp, fp, total_ground_truth = match_predictions(selected, all_truths)
    true_positive_count = sum(tp)
    false_positive_count = sum(fp)
    false_negative_count = max(0, total_ground_truth - true_positive_count)
    precision = true_positive_count / max(1, true_positive_count + false_positive_count)
    recall = true_positive_count / max(1, total_ground_truth)
    f1 = 2 * precision * recall / max(1e-8, precision + recall)
    ap_tp, ap_fp, ap_gt = match_predictions(all_predictions, all_truths)
    return {
        "score_threshold": score_threshold,
        "iou_threshold": IOU_THRESHOLD,
        "true_positives": true_positive_count,
        "false_positives": false_positive_count,
        "false_negatives": false_negative_count,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "mAP50": average_precision(ap_tp, ap_fp, ap_gt),
        "ground_truth_boxes": total_ground_truth,
        "evaluated_images": len(all_truths),
    }


def evaluate(model, loader, device, score_threshold):
    predictions, truths = predict(model, loader, device)
    return metrics_from_predictions(predictions, truths, score_threshold)


def validation_loss(model, loader, device):
    model.eval()
    totals = []
    with torch.inference_mode():
        for images, objectness, regression, _boxes in loader:
            output = model(images.to(device))
            loss, _, _ = detector_loss(output, objectness.to(device), regression.to(device))
            totals.append(float(loss.item()))
    return float(np.mean(totals)) if totals else float("inf")


def train(args):
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    samples, category_counts, missing_frames = load_samples(args.data_root)
    splits = split_patient_ids(samples, args.seed)
    split_samples = {
        name: [sample for sample in samples if sample["patient_id"] in patient_ids]
        for name, patient_ids in splits.items()
    }
    if set.union(*splits.values()) != {sample["patient_id"] for sample in samples}:
        raise RuntimeError("Patient split omitted dataset members.")
    if any(splits[left] & splits[right] for left, right in (("train", "validation"), ("train", "test"), ("validation", "test"))):
        raise RuntimeError("Patient leakage detected between dataset splits.")

    grid_size = args.size // GRID_DIVISOR
    datasets = {
        name: CadicaFrames(rows, args.size, augment=(name == "train"))
        for name, rows in split_samples.items()
    }
    loader_options = {"batch_size": args.batch_size, "num_workers": 0, "collate_fn": collate_frames}
    train_loader = DataLoader(datasets["train"], shuffle=True, **loader_options)
    validation_loader = DataLoader(datasets["validation"], shuffle=False, **loader_options)
    test_loader = DataLoader(datasets["test"], shuffle=False, **loader_options)

    model = CadicaBoxDetector().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    best_validation_loss = float("inf")
    best_state = None
    history = []
    started = time.time()
    for epoch in range(args.epochs):
        model.train()
        epoch_losses = []
        for images, objectness, regression, _boxes in train_loader:
            images = images.to(device)
            objectness = objectness.to(device)
            regression = regression.to(device)
            optimizer.zero_grad(set_to_none=True)
            output = model(images)
            loss, object_loss, box_loss = detector_loss(output, objectness, regression)
            loss.backward()
            optimizer.step()
            epoch_losses.append((float(loss.detach()), float(object_loss), float(box_loss)))
        val_loss = validation_loss(model, validation_loader, device)
        record = {
            "epoch": epoch + 1,
            "training_loss": float(np.mean([row[0] for row in epoch_losses])),
            "training_objectness_loss": float(np.mean([row[1] for row in epoch_losses])),
            "training_box_loss": float(np.mean([row[2] for row in epoch_losses])),
            "validation_loss": val_loss,
        }
        history.append(record)
        print(
            f"epoch {epoch + 1}/{args.epochs}: "
            f"train_loss={record['training_loss']:.4f} validation_loss={val_loss:.4f}",
            flush=True,
        )
        if val_loss < best_validation_loss:
            best_validation_loss = val_loss
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
    if best_state is None:
        raise RuntimeError("Training completed without a validation-selected model checkpoint.")
    model.load_state_dict(best_state)

    val_loader_for_metrics = DataLoader(datasets["validation"], shuffle=False, **loader_options)
    validation_predictions, validation_truths = predict(model, val_loader_for_metrics, device)
    threshold_results = [
        metrics_from_predictions(validation_predictions, validation_truths, threshold)
        for threshold in (0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6)
    ]
    validation_metrics = max(
        threshold_results,
        key=lambda result: (result["f1"], result["precision"], result["recall"]),
    )
    test_metrics = evaluate(model, test_loader, device, validation_metrics["score_threshold"])
    collision_count = 0
    for sample in samples:
        _objectness, _regression, collisions = target_for_boxes(
            sample["boxes"], sample["width"], sample["height"], args.size, grid_size
        )
        collision_count += collisions

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "architecture": "CADICA single-class lesion box detector",
        "version": "1.0.0",
        "dataset": "CADICA selectedVideos",
        "input_size": args.size,
        "grid_size": grid_size,
        "score_threshold": validation_metrics["score_threshold"],
        "iou_threshold": IOU_THRESHOLD,
        "patient_split_seed": args.seed,
        "selected_epoch": min(history, key=lambda row: row["validation_loss"])["epoch"],
        "state_dict": best_state,
    }
    with tempfile.NamedTemporaryFile(dir=MODEL_PATH.parent, delete=False, suffix=".tmp") as temporary:
        temp_checkpoint = Path(temporary.name)
    try:
        torch.save(checkpoint, temp_checkpoint)
        os.replace(temp_checkpoint, MODEL_PATH)
    finally:
        if temp_checkpoint.exists():
            temp_checkpoint.unlink()

    report = {
        "model": checkpoint["architecture"],
        "version": checkpoint["version"],
        "deployment_scope": "CADICA research samples only; not clinically validated.",
        "task": "single-class lesion bounding-box localization",
        "category_codes": category_counts,
        "category_code_interpretation": "Not mapped to severity; consult the CADICA annotation guide before classification.",
        "dataset_summary": {
            "selected_frames": len(samples),
            "positive_frames": sum(bool(sample["boxes"]) for sample in samples),
            "negative_frames": sum(not sample["boxes"] for sample in samples),
            "ground_truth_boxes": sum(len(sample["boxes"]) for sample in samples),
            "multiple_box_cell_collisions": collision_count,
            "missing_annotated_frames_skipped": len(missing_frames),
            "image_size": [args.size, args.size],
        },
        "split_method": "Deterministic patient-level 70/15/15 split; all frames from each patient remain in one split.",
        "patient_splits": {name: sorted(values, key=lambda value: int(value[1:])) for name, values in splits.items()},
        "splits": {
            name: {
                "patients": len(splits[name]),
                "images": len(rows),
                "positive_images": sum(bool(sample["boxes"]) for sample in rows),
                "negative_images": sum(not sample["boxes"] for sample in rows),
                "boxes": sum(len(sample["boxes"]) for sample in rows),
            }
            for name, rows in split_samples.items()
        },
        "selection_metric": "Minimum validation objectness and box regression loss; score threshold selected by validation F1 at IoU 0.5.",
        "validation_metrics": validation_metrics,
        "validation_threshold_sweep": threshold_results,
        "held_out_test_metrics": test_metrics,
        "test_threshold_source": "Selected on validation split; test split evaluated once after checkpoint selection.",
        "checkpoint": str(MODEL_PATH.relative_to(ROOT)),
        "epochs_requested": args.epochs,
        "epochs_completed": len(history),
        "training_history": history,
        "duration_seconds": round(time.time() - started, 1),
        "clinical_severity": "Unavailable; class code definitions were not used as clinical severity labels.",
        "narrowing_percentage": "Unavailable; no calibrated physical diameter measurements were provided.",
        "limitations": [
            "Research-only model trained on CADICA selected frames and lesion boxes.",
            "Single-class predictions identify labeled lesion regions; the dataset category codes are not interpreted.",
            "Patient-held-out performance is not external or clinical validation.",
            "No calibrated confidence, severity, or percent narrowing is produced.",
        ],
    }
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=REPORT_PATH.parent, delete=False, suffix=".tmp") as temporary:
        json.dump(report, temporary, indent=2)
        temporary.write("\n")
        temp_report = Path(temporary.name)
    try:
        os.replace(temp_report, REPORT_PATH)
    finally:
        if temp_report.exists():
            temp_report.unlink()
    print(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=DATA_ROOT)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=0.001)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.size < 64 or args.size % GRID_DIVISOR:
        parser.error("epochs and batch-size must be positive; size must be >=64 and divisible by 4.")
    if not args.data_root.is_dir():
        raise FileNotFoundError(f"CADICA selectedVideos dataset was not found: {args.data_root}")
    train(args)


if __name__ == "__main__":
    main()
