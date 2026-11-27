import unittest

import numpy as np

from backend.ai_engine import ArteryAIEngine


class StenosisCandidatePipelineTests(unittest.TestCase):
    def test_radius_profile_proposal_includes_research_narrowing_estimate(self):
        vessel_mask = np.full((32, 32), 255, dtype=np.uint8)
        radii = np.full((32, 32), 10.0, dtype=np.float32)
        centerline = np.zeros((32, 32), dtype=bool)
        centerline[16, 14:18] = True
        radii[16, 14:18] = 3.0

        candidate_mask, candidates = ArteryAIEngine.extract_stenosis_candidates(
            vessel_mask, radii, centerline
        )

        self.assertTrue(candidate_mask.any())
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["candidate_id"], "QCA-01")
        self.assertEqual(candidates[0]["relative_radius_ratio"], 0.3)
        self.assertEqual(candidates[0]["estimated_narrowing_percent"], 70.0)

    def test_no_radius_drop_returns_no_candidate_not_zero_percent_finding(self):
        vessel_mask = np.full((32, 32), 255, dtype=np.uint8)
        radii = np.full((32, 32), 10.0, dtype=np.float32)
        centerline = np.zeros((32, 32), dtype=bool)
        centerline[16, :] = True

        candidate_mask, candidates = ArteryAIEngine.extract_stenosis_candidates(
            vessel_mask, radii, centerline
        )

        self.assertFalse(candidate_mask.any())
        self.assertEqual(candidates, [])


if __name__ == "__main__":
    unittest.main()
