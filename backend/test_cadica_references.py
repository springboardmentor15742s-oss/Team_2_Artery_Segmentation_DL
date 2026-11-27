import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main


class CadicaReferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.dataset_dir = Path(self.temp_dir.name) / "dataset"
        self.video_dir = self.dataset_dir / "CADICA" / "selectedVideos" / "p1" / "v1"
        input_dir = self.video_dir / "input"
        groundtruth_dir = self.video_dir / "groundtruth"
        input_dir.mkdir(parents=True)
        groundtruth_dir.mkdir()
        (input_dir / "p1_v1_00001.png").touch()
        (input_dir / "p1_v1_00002.png").touch()
        (groundtruth_dir / "p1_v1_00001.txt").write_text("12 24 30 18 p0_20\n", encoding="utf-8")

        self.previous_index = main._CADICA_INDEX
        main._CADICA_INDEX = None
        self.dataset_patch = patch.object(main, "DATASET_DIR", self.dataset_dir)
        self.dataset_patch.start()
        self.addCleanup(self.dataset_patch.stop)
        self.addCleanup(setattr, main, "_CADICA_INDEX", self.previous_index)

    def test_annotated_only_lists_only_frames_with_ground_truth(self):
        result = main.cadica_images(
            search="",
            limit=100,
            offset=0,
            annotated_only=True,
            user={},
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["images"][0]["caseId"], "CADICA-p1-v1-00001")
        self.assertTrue(result["images"][0]["referenceAnnotationAvailable"])

    def test_unfiltered_list_exposes_annotation_availability(self):
        result = main.cadica_images(search="", limit=100, offset=0, annotated_only=False, user={})

        availability = {image["caseId"]: image["referenceAnnotationAvailable"] for image in result["images"]}
        self.assertEqual(availability, {
            "CADICA-p1-v1-00001": True,
            "CADICA-p1-v1-00002": False,
        })

    def test_reference_box_coordinates_and_category_are_parsed(self):
        record = main.cadica_case("CADICA-p1-v1-00001")

        self.assertEqual(
            main.cadica_reference_annotations(record),
            [{"bbox_px": {"x": 12.0, "y": 24.0, "width": 30.0, "height": 18.0}, "category": "p0_20"}],
        )


if __name__ == "__main__":
    unittest.main()
