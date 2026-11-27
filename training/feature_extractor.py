"""Infosys Artery AI - Radiomic Feature & Vessel Analysis Engine.

Unified QCA (Quantitative Coronary Angiography) feature extraction and automated
vessel lumen segmentation pipeline used across training, testing, and live API inference.
"""

import numpy as np
from PIL import Image
import scipy.ndimage as ndi

def segment_coronary_vessels(img_arr):
    """
    Automated coronary vessel segmentation from an unannotated grayscale medical scan.
    Returns:
        vessel_mask (np.ndarray of uint8): binary mask (0 or 255)
        dist_transform (np.ndarray of float32): Euclidean distance transform
        centerline (np.ndarray of bool): extracted vessel centerline coordinates
    """
    im = img_arr.astype(np.float32)
    # 1. Background illumination estimation
    bg_est = ndi.gaussian_filter(im, sigma=18.0)
    # 2. Absorption difference
    diff = np.maximum(0.0, bg_est - im)
    
    # 3. Adaptive thresholding
    valid_diff = diff[diff > 5.0]
    thresh = float(np.percentile(valid_diff, 76)) if len(valid_diff) > 50 else 22.0
    raw_mask = diff > thresh

    # 4. Morphological closure to smooth lumen boundaries
    closed_mask = ndi.binary_closing(raw_mask, structure=np.ones((3, 3)))
    
    # 5. Connected component filtering to isolate dominant arterial tree
    labeled, num_features = ndi.label(closed_mask)
    if num_features > 0:
        sizes = ndi.sum(closed_mask, labeled, range(1, num_features + 1))
        # Keep dominant coronary trunk
        vessel_mask = (labeled == (np.argmax(sizes) + 1))
    else:
        vessel_mask = closed_mask

    # 6. Euclidean distance transform (lumen radius at each interior pixel)
    dist_transform = ndi.distance_transform_edt(vessel_mask)

    # 7. Centerline / ridge detection
    if np.any(dist_transform > 1.2):
        local_max = ndi.maximum_filter(dist_transform, size=3)
        centerline = (dist_transform == local_max) & (dist_transform > 1.2)
    else:
        centerline = vessel_mask

    mask_uint8 = (vessel_mask.astype(np.uint8)) * 255
    return mask_uint8, dist_transform, centerline

def extract_qca_features(img_arr, mask_arr=None, centerline_arr=None):
    """
    Extracts QCA morphological and radiomic features from scan.
    Returns feature vector:
        [ref_radius, min_radius, mean_radius, narrowing_pct, vessel_area, contrast_depth, mean_contrast]
    """
    im = img_arr.astype(np.float32)

    if mask_arr is not None and centerline_arr is not None:
        m_bool = mask_arr > 0
        c_bool = (centerline_arr == 255) if 255 in centerline_arr else (centerline_arr > 0)
        dt = ndi.distance_transform_edt(m_bool)
        radii = dt[c_bool] if np.any(c_bool) else dt[m_bool]
    else:
        mask_uint8, dt, c_bool = segment_coronary_vessels(im)
        m_bool = mask_uint8 > 0
        radii = dt[c_bool] if np.any(c_bool) else dt[m_bool]

    if len(radii) > 0:
        ref_r = float(np.percentile(radii, 90))
        min_r = float(np.percentile(radii, 2)) if len(radii) > 20 else float(np.min(radii))
        mean_r = float(np.mean(radii))
        narrow_pct = float(max(0.0, min(100.0, (ref_r - min_r) / (ref_r + 1e-4) * 100.0)))
    else:
        ref_r, min_r, mean_r, narrow_pct = 8.0, 8.0, 8.0, 0.0

    vessel_area = float(m_bool.sum())

    # Contrast features
    bg_est = ndi.gaussian_filter(im, sigma=18.0)
    diff = np.maximum(0.0, bg_est - im)
    max_contrast = float(np.percentile(diff[m_bool], 95)) if np.any(m_bool) else 100.0
    mean_contrast = float(np.mean(diff[m_bool])) if np.any(m_bool) else 50.0

    return [ref_r, min_r, mean_r, narrow_pct, vessel_area, max_contrast, mean_contrast]
