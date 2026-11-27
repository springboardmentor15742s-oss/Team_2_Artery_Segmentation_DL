"""Compact single-class detector for CADICA lesion bounding boxes."""

import numpy as np
import torch
from torch import nn


class CadicaBoxDetector(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.SiLU(inplace=True),
            nn.Conv2d(16, 24, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(24),
            nn.SiLU(inplace=True),
            nn.Conv2d(24, 32, 3, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.SiLU(inplace=True),
            nn.Conv2d(32, 32, 3, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.SiLU(inplace=True),
        )
        self.head = nn.Conv2d(32, 5, 1)

    def forward(self, image):
        return self.head(self.features(image))


def box_iou(box, boxes):
    if not boxes:
        return np.zeros(0, dtype=np.float32)
    boxes = np.asarray(boxes, dtype=np.float32)
    left = np.maximum(box[0], boxes[:, 0])
    top = np.maximum(box[1], boxes[:, 1])
    right = np.minimum(box[2], boxes[:, 2])
    bottom = np.minimum(box[3], boxes[:, 3])
    intersection = np.maximum(0, right - left) * np.maximum(0, bottom - top)
    area_box = max(0, box[2] - box[0]) * max(0, box[3] - box[1])
    area_boxes = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0, boxes[:, 3] - boxes[:, 1])
    return intersection / np.maximum(area_box + area_boxes - intersection, 1e-8)


def decode_boxes(output, score_threshold, iou_threshold=0.5, max_detections=50):
    probabilities = torch.sigmoid(output[0]).detach().cpu().numpy()
    scores = probabilities[0].reshape(-1)
    regression = probabilities[1:5].reshape(4, -1)
    grid_size = probabilities.shape[1]
    candidates = np.flatnonzero(scores >= score_threshold)
    if not len(candidates):
        return []
    candidates = candidates[np.argsort(scores[candidates])[::-1][:max_detections * 4]]
    decoded = []
    for cell in candidates:
        row, column = divmod(int(cell), grid_size)
        center_x = (column + regression[0, cell]) / grid_size
        center_y = (row + regression[1, cell]) / grid_size
        box_width = regression[2, cell]
        box_height = regression[3, cell]
        box = [
            max(0.0, center_x - box_width / 2),
            max(0.0, center_y - box_height / 2),
            min(1.0, center_x + box_width / 2),
            min(1.0, center_y + box_height / 2),
        ]
        if box[2] > box[0] and box[3] > box[1]:
            decoded.append((box, float(scores[cell])))
    selected = []
    while decoded and len(selected) < max_detections:
        best = decoded.pop(0)
        selected.append(best)
        decoded = [
            item for item in decoded
            if box_iou(best[0], [item[0]])[0] < iou_threshold
        ]
    return selected
