import unittest

import numpy as np

from backend.image_quality import inspect_grayscale_image, median_denoising_previews


def clean_angiogram_like_image():
    rows, columns = np.indices((256, 256))
    background = 28 + columns * 0.35 + rows * 0.12
    vessel = np.exp(-((rows - (128 + 16 * np.sin(columns / 38))) ** 2) / 30) * 90
    return np.clip(background + vessel, 0, 255).astype(np.uint8)


class ImageQualityTests(unittest.TestCase):
    def test_clean_image_passes_quality_check(self):
        result = inspect_grayscale_image(clean_angiogram_like_image())

        self.assertTrue(result["passed"])
        self.assertFalse(result["salt_and_pepper_detected"])

    def test_salt_and_pepper_noise_is_rejected(self):
        noisy = clean_angiogram_like_image()
        rng = np.random.default_rng(42)
        mask = rng.random(noisy.shape) < 0.35
        noisy[mask] = np.where(rng.random(mask.sum()) < 0.5, 0, 255)

        result = inspect_grayscale_image(noisy)

        self.assertFalse(result["passed"])
        self.assertTrue(result["salt_and_pepper_detected"])
        self.assertIn("salt-and-pepper", result["reason"])

    def test_blank_or_corrupt_image_is_rejected_without_noise_label(self):
        result = inspect_grayscale_image(np.zeros((256, 256), dtype=np.uint8))

        self.assertFalse(result["passed"])
        self.assertFalse(result["salt_and_pepper_detected"])
        self.assertIn("blank", result["reason"])

    def test_small_and_non_grayscale_images_are_rejected(self):
        small = inspect_grayscale_image(np.full((64, 64), 100, dtype=np.uint8))
        color = inspect_grayscale_image(np.zeros((256, 256, 3), dtype=np.uint8))

        self.assertIn("too small", small["reason"])
        self.assertIn("grayscale", color["reason"])

    def test_median_preview_preserves_source_and_returns_raw_difference(self):
        original = clean_angiogram_like_image()
        original[::3, ::3] = 0
        source_copy = original.copy()

        denoised, difference = median_denoising_previews(original)

        expected = np.abs(original.astype(np.int16) - denoised.astype(np.int16)).astype(np.uint8)
        self.assertTrue(np.array_equal(original, source_copy))
        self.assertEqual(denoised.shape, original.shape)
        self.assertEqual(difference.dtype, np.uint8)
        self.assertTrue(np.array_equal(difference, expected))


if __name__ == "__main__":
    unittest.main()
