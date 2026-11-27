import gc
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main


class ReportApiTests(unittest.TestCase):
    def test_reports_include_saved_analysis_and_candidate_details(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            database = Path(temp_dir) / "reports.sqlite"
            with sqlite3.connect(database) as connection:
                connection.executescript(
                    """
                    CREATE TABLE reports (
                        id TEXT, scan_id TEXT, status TEXT, summary TEXT, author TEXT,
                        severity TEXT, narrowing_percentage REAL, created_at TEXT
                    );
                    CREATE TABLE scans (
                        id TEXT, patient_id TEXT, modality TEXT, anatomical_region TEXT,
                        scan_date TEXT, model_version TEXT
                    );
                    CREATE TABLE segmentation_results (
                        scan_id TEXT, severity TEXT, narrowing_percentage REAL,
                        dice_score REAL, iou_score REAL, stenosis_detected INTEGER,
                        ref_diameter_mm REAL, min_diameter_mm REAL, confidence_score REAL,
                        inference_time_ms REAL, recommendations_json TEXT,
                        visualizations_json TEXT, created_at TEXT
                    );
                    INSERT INTO reports VALUES(
                        'REP-1', 'CASE-1', 'Pending Review', 'Research candidate summary',
                        'Artery AI', NULL, NULL, '2026-11-18T10:00:00+00:00'
                    );
                    INSERT INTO scans VALUES(
                        'CASE-1', 'PAT-1', 'DSA Angiography', 'Coronary Artery',
                        '2026-11-18', 'model-1'
                    );
                    INSERT INTO segmentation_results VALUES(
                        'CASE-1', NULL, NULL, 0.57, 0.40, NULL, NULL, NULL, 0.72,
                        125.0, '{"review":"Clinician review required"}',
                        '{"model_version":"model-1","stenosis_detection_pipeline":{"status":"research_candidates_proposed"},"candidate_regions":[{"candidate_id":"QCA-01","estimated_narrowing_percent":35.0}],"quality_check":{"status":"Passed"}}',
                        '2026-11-18T10:00:00+00:00'
                    );
                    """
                )

            with patch.object(main, "DB_PATH", database):
                reports = main.get_reports(user={"role": "Doctor"})

            gc.collect()

        self.assertEqual(len(reports), 1)
        report = reports[0]
        self.assertEqual(report["status"], "Pending Review")
        self.assertEqual(report["analysis"]["pipeline_status"], "research_candidates_proposed")
        self.assertEqual(report["analysis"]["candidate_regions"][0]["estimated_narrowing_percent"], 35.0)
        self.assertIsNone(report["analysis"]["stenosis_detected"])
        self.assertIn("not a confirmed diagnosis", report["analysis"]["limitations"])


if __name__ == "__main__":
    unittest.main()

