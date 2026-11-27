"""Image-quality checks and non-destructive salt-and-pepper preview helpers."""

import cv2
from scipy import ndimage as ndi
import numpy as np


MIN_ANALYSIS_SIZE = 128
MIN_INTENSITY_RANGE = 8
MIN_IMAGE_STD = 2.0
SALT_PEPPER_FRACTION_LIMIT = 0.20
IMPULSE_DIFFERENCE_LIMIT = 32


def _quality_score(metrics, noise_fraction=None):
    """Return a transparent technical image-quality score, not a diagnosis."""
    height = metrics.get("height")
    width = metrics.get("width")
    intensity_std = metrics.get("intensity_std")
    components = {}
    weights = {}
    if width is not None and height is not None:
        components["resolution"] = round(min(1.0, min(width, height) / 512), 3)
        weights["resolution"] = 0.35
    if intensity_std is not None:
        components["contrast"] = round(min(1.0, intensity_std / 32), 3)
        weights["contrast"] = 0.35
    if noise_fraction is not None:
        components["impulse_noise"] = round(max(0.0, 1.0 - min(1.0, noise_fraction / SALT_PEPPER_FRACTION_LIMIT)), 3)
        weights["impulse_noise"] = 0.30
    total_weight = sum(weights.values())
    score = round(100 * sum(components[key] * weights[key] for key in weights) / total_weight) if total_weight else None
    return score, components


def inspect_grayscale_image(image):
    """Assess decoded source pixels without resizing, normalizing, or modifying them."""
    gray = np.asarray(image)
    if gray.ndim != 2 or gray.dtype != np.uint8 or gray.size == 0:
        return {
            "passed": False,
            "status": "Failed",
            "reason": "Image quality could not be validated: expected a non-empty 8-bit grayscale image.",
            "salt_and_pepper_detected": False,
            "metrics": {},
            "quality_score": None,
            "score_components": {},
        }

    height, width = gray.shape
    metrics = {
        "width": int(width),
        "height": int(height),
        "intensity_min": int(gray.min()),
        "intensity_max": int(gray.max()),
        "intensity_std": round(float(gray.std()), 3),
    }
    quality_score, score_components = _quality_score(metrics)
    if height < MIN_ANALYSIS_SIZE or width < MIN_ANALYSIS_SIZE:
        reason = "Image is too small for angiography analysis. Upload the full-resolution scan."
        return {"passed": False, "status": "Failed", "reason": reason, "salt_and_pepper_detected": False, "metrics": metrics, "quality_score": quality_score, "score_components": score_components}

    if metrics["intensity_std"] < MIN_IMAGE_STD or metrics["intensity_max"] - metrics["intensity_min"] < MIN_INTENSITY_RANGE:
        reason = "Image quality validation failed: the scan is blank or has too little contrast to analyze. Upload the original readable scan."
        return {"passed": False, "status": "Failed", "reason": reason, "salt_and_pepper_detected": False, "metrics": metrics, "quality_score": quality_score, "score_components": score_components}

    median = cv2.medianBlur(gray, 3)
    residual = cv2.absdiff(gray, median)
    extreme = (gray <= 1) | (gray >= 254)
    impulse = extreme & (residual >= IMPULSE_DIFFERENCE_LIMIT)
    impulse_fraction = float(np.mean(impulse))
    metrics["isolated_extreme_fraction"] = round(impulse_fraction, 5)
    metrics["median_residual_fraction"] = round(float(np.mean(residual >= IMPULSE_DIFFERENCE_LIMIT)), 5)
    quality_score, score_components = _quality_score(metrics, impulse_fraction)

    salt_and_pepper_detected = impulse_fraction >= SALT_PEPPER_FRACTION_LIMIT
    if salt_and_pepper_detected:
        reason = (
            "Image quality validation failed: severe salt-and-pepper corruption obscures the angiogram. "
            "The original file is preserved for review; upload another original angiography image or DICOM."
        )
        return {
            "passed": False,
            "status": "Failed",
            "reason": reason,
            "salt_and_pepper_detected": True,
            "metrics": metrics,
            "quality_score": quality_score,
            "score_components": score_components,
        }

    return {
        "passed": True,
        "status": "Passed",
        "reason": None,
        "salt_and_pepper_detected": False,
        "metrics": metrics,
        "quality_score": quality_score,
        "score_components": score_components,
    }


def median_denoising_previews(image):
    """Return a median-filtered preview and raw absolute-difference image."""
    gray = np.asarray(image)
    if gray.ndim != 2 or gray.dtype != np.uint8 or gray.size == 0:
        raise ValueError("A non-empty 8-bit grayscale angiography image is required.")
    if min(gray.shape) < 3:
        raise ValueError("A minimum 3x3 image is required for median filtering.")
    denoised = cv2.medianBlur(gray, 5)
    difference = cv2.absdiff(gray, denoised)
    return denoised, difference
