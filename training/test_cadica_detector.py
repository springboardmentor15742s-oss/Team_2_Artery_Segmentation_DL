import unittest

import torch

from training.cadica_detector import decode_boxes
from training.train_cadica_detector import (
    metrics_from_predictions,
    split_patient_ids,
    target_for_boxes,
)


class CadicaDetectorTests(unittest.TestCase):
    def test_target_encoding_tracks_boxes_and_reports_grid_collisions(self):
        objectness, regression, collisions = target_for_boxes(
            [[10, 10, 8, 8], [11, 11, 4, 4]], width=64, height=64, size=64, grid_size=16
        )

        self.assertEqual(objectness.sum(), 1)
        self.assertEqual(collisions, 1)
        self.assertEqual(regression[:, 3, 3].tolist(), [0.5, 0.5, 0.125, 0.125])

    def test_decoder_returns_box_coordinates_in_unit_square_and_suppresses_overlap(self):
        output = torch.full((1, 5, 4, 4), -10.0)
        output[0, 0, 1, 1] = 4.0
        output[0, 0, 1, 2] = 3.0
        output[0, 1:, 1, 1] = 0.0
        output[0, 1:, 1, 2] = 0.0

        predictions = decode_boxes(output, score_threshold=0.1, iou_threshold=0.2)

        self.assertEqual(len(predictions), 1)
        box, score = predictions[0]
        self.assertTrue(0 < score < 1)
        self.assertTrue(all(0 <= coordinate <= 1 for coordinate in box))
        self.assertTrue(box[2] > box[0] and box[3] > box[1])

    def test_patient_splits_are_disjoint_and_include_all_patients(self):
        samples = [
            {"patient_id": f"p{patient}", "boxes": boxes}
            for patient in range(1, 11)
            for boxes in ([], [[1, 1, 2, 2]])
        ]

        splits = split_patient_ids(samples, seed=3)

        self.assertEqual(set.union(*splits.values()), {sample["patient_id"] for sample in samples})
        self.assertFalse(splits["train"] & splits["validation"])
        self.assertFalse(splits["train"] & splits["test"])
        self.assertFalse(splits["validation"] & splits["test"])

    def test_threshold_metrics_reuse_predictions_without_changing_map(self):
        predictions = [[
            ([0.1, 0.1, 0.5, 0.5], 0.9),
            ([0.6, 0.6, 0.9, 0.9], 0.2),
        ]]
        truths = [[[0.1, 0.1, 0.5, 0.5]]]

        strict = metrics_from_predictions(predictions, truths, score_threshold=0.5)
        relaxed = metrics_from_predictions(predictions, truths, score_threshold=0.1)

        self.assertEqual(strict["true_positives"], 1)
        self.assertEqual(strict["false_positives"], 0)
        self.assertEqual(relaxed["true_positives"], 1)
        self.assertEqual(relaxed["false_positives"], 1)
        self.assertEqual(strict["mAP50"], relaxed["mAP50"])
