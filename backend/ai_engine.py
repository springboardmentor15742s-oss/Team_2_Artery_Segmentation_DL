"""Artery AI research inference engine.

Runs vessel segmentation, QCA radius-profile candidate localization, optional
CADICA lesion-box inference, and clinician-review visualizations. Candidates
are not confirmed stenosis diagnoses or calibrated measurements.
"""

import os
import sys
import base64
import io
import logging
import time
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import scipy.ndimage as ndi
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
TRAINING_DIR = os.path.join(PROJECT_ROOT, "training")
MODELS_DIR = os.path.join(TRAINING_DIR, "models")
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")

sys.path.insert(0, TRAINING_DIR)
from feature_extractor import segment_coronary_vessels
try:
    from cadica_detector import CadicaBoxDetector, decode_boxes
except ImportError as exc:
    # PyTorch and the CADICA detector are optional at runtime. Keep the core
    # API available when the optional research dependency is not installed.
    CadicaBoxDetector = None
    decode_boxes = None
    logging.getLogger(__name__).info(
        "Optional CADICA lesion detector unavailable; continuing without it: %s", exc
    )
try:
    from .image_quality import inspect_grayscale_image, median_denoising_previews
except ImportError:
    from image_quality import inspect_grayscale_image, median_denoising_previews

logger = logging.getLogger(__name__)

class ArteryAIEngine:
    def __init__(self):
        self.detector = None
        self.severity_classifier = None
        self.narrowing_regressor = None
        self.scaler = None
        self.segmentation_model = None
        self.segmentation_torch = None
        self.segmentation_model_name = "adaptive_threshold_refined"
        self.segmentation_validation = None
        self.cadica_detector = None
        self.cadica_detector_torch = None
        self.cadica_detector_size = 256
        self.cadica_detector_threshold = 0.25
        self.cadica_detector_version = None
        self.denoising_model = None
        self.denoising_torch = None
        self.denoising_checkpoint_mtime = None
        self.denoising_model_status = "Median/Gaussian fallback (untrained)"
        self.is_loaded = False
        self.load_segmentation_model()
        self.load_denoising_model()
        self.load_cadica_detector()
        self.load_models()

    def load_segmentation_model(self):
        """Load an optional trained U-Net/U-Net++ checkpoint when torch is installed."""
        checkpoint_path = os.path.join(MODELS_DIR, "best_segmentation_model.pt")
        if not os.path.isfile(checkpoint_path):
            return
        try:
            import torch
            from segmentation_models import UNet, UNetPlusPlus
            checkpoint = torch.load(checkpoint_path, map_location="cpu")
            architecture = checkpoint.get("architecture", "U-Net")
            base = int(checkpoint.get("base_channels", 16 if architecture == "U-Net" else 12))
            model = UNet(base=base) if architecture == "U-Net" else UNetPlusPlus(base=base)
            model.load_state_dict(checkpoint["state_dict"])
            model.eval()
            model.input_size = int(checkpoint.get("size", 256))
            self.segmentation_model = model
            self.segmentation_torch = torch
            self.segmentation_model_name = architecture
            report_path = os.path.join(TRAINING_DIR, "arcade_model_validation_report.json")
            try:
                import json
                report = json.load(open(report_path, encoding="utf-8"))
                self.segmentation_validation = next((entry for entry in report.get("models", []) if entry.get("task") == "vessel_segmentation"), None)
            except (OSError, ValueError):
                self.segmentation_validation = None
            print(f"[Infosys Artery AI] Loaded trained {architecture} segmentation checkpoint.")
        except Exception as exc:
            print(f"[Infosys Artery AI] Optional segmentation checkpoint unavailable: {exc}")

    def load_denoising_model(self):
        checkpoint_path = os.path.join(MODELS_DIR, "cadica_denoiser.pt")
        if not os.path.isfile(checkpoint_path):
            return
        try:
            checkpoint_mtime = os.stat(checkpoint_path).st_mtime_ns
            if self.denoising_model is not None and checkpoint_mtime == self.denoising_checkpoint_mtime:
                return
            import torch
            from denoising_models import CadicaDenoiser
            checkpoint = torch.load(checkpoint_path, map_location="cpu")
            model = CadicaDenoiser(channels=int(checkpoint.get("channels", 16)))
            model.load_state_dict(checkpoint["state_dict"])
            model.eval()
            self.denoising_model = model
            self.denoising_torch = torch
            self.denoising_checkpoint_mtime = checkpoint_mtime
            self.denoising_model_status = "CADICA-trained experimental denoiser (synthetic-noise test only)"
            print("[Infosys Artery AI] Loaded CADICA experimental denoising checkpoint.")
        except (ImportError, OSError, RuntimeError, KeyError, ValueError) as exc:
            self.denoising_model = None
            self.denoising_torch = None
            self.denoising_model_status = "Median/Gaussian fallback (denoiser checkpoint unavailable)"
            print(f"[Infosys Artery AI] Optional denoising checkpoint unavailable: {exc}")

    def load_cadica_detector(self):
        checkpoint_path = os.path.join(MODELS_DIR, "cadica_lesion_detector.pt")
        if not os.path.isfile(checkpoint_path):
            self.cadica_detector = None
            self.cadica_detector_torch = None
            return
        try:
            import torch
            from cadica_detector import CadicaBoxDetector
            checkpoint = torch.load(checkpoint_path, map_location="cpu")
            model = CadicaBoxDetector()
            model.load_state_dict(checkpoint["state_dict"])
            model.eval()
            self.cadica_detector = model
            self.cadica_detector_torch = torch
            self.cadica_detector_size = int(checkpoint.get("input_size", 256))
            self.cadica_detector_threshold = float(checkpoint.get("score_threshold", 0.25))
            self.cadica_detector_version = str(checkpoint.get("version", "unknown"))
            print(f"[Infosys Artery AI] Loaded CADICA lesion localizer v{self.cadica_detector_version} (research only).")
        except (ImportError, OSError, RuntimeError, KeyError, TypeError, ValueError) as exc:
            self.cadica_detector = None
            self.cadica_detector_torch = None
            logger.exception("Could not load CADICA lesion localizer checkpoint: %s", exc)

    def analyze_cadica_lesions(self, image_input):
        """Return CADICA-trained research detections and Grad-CAM, or None if untrained."""
        if self.cadica_detector is None or self.cadica_detector_torch is None:
            return None
        from cadica_detector import decode_boxes
        image = self.load_scan_array(image_input)
        height, width = image.shape[:2]
        resized = Image.fromarray(image.astype(np.uint8)).resize(
            (self.cadica_detector_size, self.cadica_detector_size),
            Image.Resampling.BILINEAR,
        )
        tensor = self.cadica_detector_torch.from_numpy(
            np.asarray(resized, dtype=np.float32)[None, None] / 255.0
        )
        model = self.cadica_detector
        torch = self.cadica_detector_torch
        model.eval()
        with torch.enable_grad():
            features = model.features(tensor)
            output = model.head(features)
            detection_list = decode_boxes(
                output.detach(),
                self.cadica_detector_threshold,
                max_detections=20,
            )
            heatmap = None
            if detection_list:
                activation = torch.sigmoid(output[0, 0])
                flat_index = int(activation.detach().argmax().item())
                row, column = divmod(flat_index, activation.shape[1])
                gradient = torch.autograd.grad(output[0, 0, row, column], features)[0]
                weights = gradient.mean(dim=(2, 3), keepdim=True)
                cam = torch.relu((weights * features).sum(dim=1, keepdim=True))
                cam = torch.nn.functional.interpolate(
                    cam, size=(height, width), mode="bilinear", align_corners=False
                )[0, 0].detach().cpu().numpy()
                if np.isfinite(cam).all() and float(cam.max()) > float(cam.min()) + 1e-8:
                    cam = np.clip((cam - cam.min()) / (cam.max() - cam.min() + 1e-8), 0, 1)
                    gray = image.astype(np.float32)
                    gray = (gray - gray.min()) / (gray.max() - gray.min() + 1e-8) * 255
                    original = np.repeat(gray.astype(np.uint8)[..., None], 3, axis=2)
                    colors = cv2.applyColorMap((cam * 255).astype(np.uint8), cv2.COLORMAP_JET)[..., ::-1]
                    overlay = (original.astype(np.float32) * 0.55 + colors.astype(np.float32) * 0.45).clip(0, 255).astype(np.uint8)
                    buffer = io.BytesIO()
                    Image.fromarray(overlay).save(buffer, format="PNG")
                    heatmap = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        predictions = []
        for index, (box, score) in enumerate(detection_list, start=1):
            x1 = max(0, min(width - 1, int(round(box[0] * width))))
            y1 = max(0, min(height - 1, int(round(box[1] * height))))
            x2 = max(x1 + 1, min(width, int(round(box[2] * width))))
            y2 = max(y1 + 1, min(height, int(round(box[3] * height))))
            predictions.append({
                "candidate_id": f"CADICA-AI-{index:02d}",
                "class_label": "lesion",
                "bbox_px": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                "model_score": round(float(score), 4),
                "model_version": f"CADICA-LesionBox-{self.cadica_detector_version}",
                "prediction_source": "CADICA-trained research detector",
            })
        return {"predictions": predictions, "gradcam_b64": heatmap}

    def predict_segmentation(self, image):
        if self.segmentation_model is None:
            return segment_coronary_vessels(image)
        torch = self.segmentation_torch
        size = int(getattr(self.segmentation_model, "input_size", 256))
        resized = Image.fromarray(image.astype(np.uint8)).resize((size, size), Image.Resampling.BILINEAR)
        tensor = torch.from_numpy(np.asarray(resized, dtype=np.float32)[None, None] / 255.0)
        with torch.no_grad():
            probs = torch.sigmoid(self.segmentation_model(tensor))[0, 0].numpy()
        mask = Image.fromarray((probs >= 0.5).astype(np.uint8) * 255).resize((image.shape[1], image.shape[0]), Image.Resampling.NEAREST)
        mask = ndi.binary_closing(np.asarray(mask) > 0, structure=np.ones((3, 3)))
        labels, count = ndi.label(mask)
        if count:
            sizes = ndi.sum(mask, labels, range(1, count + 1))
            mask = labels == (int(np.argmax(sizes)) + 1)
        mask_uint8 = mask.astype(np.uint8) * 255
        dist = ndi.distance_transform_edt(mask)
        ridge = ndi.maximum_filter(dist, size=3)
        centerline = (dist == ridge) & (dist > 1.2)
        return mask_uint8, dist, centerline

    def generate_segmentation_gradcam(self, image, display_image=None):
        """Return a Grad-CAM overlay for the trained model's vessel segmentation output."""
        if self.segmentation_model is None or self.segmentation_torch is None:
            return None
        torch = self.segmentation_torch
        model = self.segmentation_model
        target_layer = getattr(model, "dec0", None) or getattr(model, "conv04", None)
        if target_layer is None:
            return None
        size = int(getattr(model, "input_size", 256))
        resized = Image.fromarray(image.astype(np.uint8)).resize((size, size), Image.Resampling.BILINEAR)
        tensor = torch.from_numpy(np.asarray(resized, dtype=np.float32)[None, None] / 255.0).requires_grad_(True)
        captured = {}
        handle = target_layer.register_forward_hook(lambda _module, _inputs, output: captured.setdefault("activation", output))
        try:
            with torch.enable_grad():
                logits = model(tensor)
                activation = captured.get("activation")
                if activation is None or not logits.requires_grad:
                    return None
                # Explain the network output supporting vessel segmentation, not stenosis classification.
                target = logits.sigmoid().mean()
                gradients = torch.autograd.grad(target, activation, retain_graph=False, create_graph=False)[0]
                weights = gradients.mean(dim=(2, 3), keepdim=True)
                cam = torch.relu((weights * activation).sum(dim=1, keepdim=True))
                cam = torch.nn.functional.interpolate(cam, size=(image.shape[0], image.shape[1]), mode="bilinear", align_corners=False)[0, 0]
                cam = cam.detach().cpu().numpy()
        except Exception as exc:
            print(f"[Infosys Artery AI] Grad-CAM unavailable: {exc}")
            return None
        finally:
            handle.remove()
        if not np.isfinite(cam).all() or float(cam.max()) <= float(cam.min()) + 1e-8:
            return None
        cam = np.clip((cam - cam.min()) / (cam.max() - cam.min() + 1e-8), 0, 1)
        display = display_image if display_image is not None else image
        gray = display.astype(np.float32)
        gray = (gray - gray.min()) / (gray.max() - gray.min() + 1e-8) * 255
        original = np.repeat(gray.astype(np.uint8)[..., None], 3, axis=2)
        heat = np.stack([
            np.clip(1.5 - np.abs(cam * 4 - 3), 0, 1),
            np.clip(1.5 - np.abs(cam * 4 - 2), 0, 1),
            np.clip(1.5 - np.abs(cam * 4 - 1), 0, 1),
        ], axis=-1) * 255
        overlay = (original.astype(np.float32) * 0.55 + heat * 0.45).clip(0, 255).astype(np.uint8)
        output = io.BytesIO()
        Image.fromarray(overlay).save(output, format="PNG")
        return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")

    @staticmethod
    def extract_stenosis_candidates(mask_arr, dist_transform, centerline):
        vessel = (mask_arr > 0) & (dist_transform > 0)
        if not np.any(vessel):
            return np.zeros_like(vessel), []
        ref_radius = float(np.percentile(dist_transform[vessel], 90))
        narrow_points = centerline & (dist_transform < ref_radius * 0.62)
        if not np.any(narrow_points):
            return np.zeros_like(vessel), []
        narrow_points = ndi.binary_closing(narrow_points, structure=np.ones((2, 2)))
        labels, count = ndi.label(narrow_points)
        components = []
        for label_id in range(1, count + 1):
            yy, xx = np.where(labels == label_id)
            if len(xx) < 2:
                continue
            ys, xs = slice(int(yy.min()), int(yy.max()) + 1), slice(int(xx.min()), int(xx.max()) + 1)
            local_radius = float(np.min(dist_transform[yy, xx]))
            relative_radius_ratio = local_radius / max(ref_radius, 1e-4)
            estimated_narrowing = max(0.0, min(100.0, (1.0 - relative_radius_ratio) * 100.0))
            components.append({"bbox_px": {"x": int(xs.start), "y": int(ys.start), "width": int(xs.stop-xs.start), "height": int(ys.stop-ys.start)}, "area_pixels": int(len(xx)), "minimum_radius_px": round(local_radius, 2), "relative_radius_ratio": round(relative_radius_ratio, 3), "estimated_narrowing_percent": round(estimated_narrowing, 1)})
        components.sort(key=lambda item: item["relative_radius_ratio"])
        candidate_mask = ndi.binary_dilation(narrow_points, iterations=3) & vessel
        selected = components[:10]
        for index, candidate in enumerate(selected, start=1):
            candidate["candidate_id"] = f"QCA-{index:02d}"
        return candidate_mask, selected

    def load_models(self):
        try:
            det_p = os.path.join(MODELS_DIR, "trained_artery_classifier.joblib")
            sev_p = os.path.join(MODELS_DIR, "severity_classifier.joblib")
            reg_p = os.path.join(MODELS_DIR, "narrowing_regressor.joblib")
            scl_p = os.path.join(MODELS_DIR, "feature_scaler.joblib")

            if all(os.path.exists(p) for p in [det_p, sev_p, reg_p, scl_p]):
                self.detector = joblib.load(det_p)
                self.severity_classifier = joblib.load(sev_p)
                self.narrowing_regressor = joblib.load(reg_p)
                self.scaler = joblib.load(scl_p)
                self.is_loaded = True
                print("[Infosys Artery AI Engine] All clinical diagnostic models loaded successfully.")
            else:
                print("[Infosys Artery AI Engine] Warning: Model artifacts not found. Engine will run in heuristic fallback mode.")
                self.is_loaded = False
        except Exception as e:
            print(f"[Infosys Artery AI Engine] Error loading models: {e}")
            self.is_loaded = False

    def generate_xai_visualizations(self, orig_img_arr, mask_arr, dist_transform, narrowing_pct, severity, candidate_mask=None, gradcam_overlay=None, centerline=None, denoised_img_arr=None):
        """
        Generates clinical Explainable AI (XAI) visual artifacts as Base64-encoded PNGs:
        1. Binary / Alpha Vessel Segmentation Mask
        2. QCA candidate heatmap (stenosis candidate pixels are high-attention)
        3. Color-Coded Stenosis Localization Overlay
        """
        h, w = orig_img_arr.shape[:2]
        
        # 1. Base image normalized to RGB
        orig_norm = orig_img_arr.astype(np.float32)
        orig_norm = (orig_norm - orig_norm.min()) / (orig_norm.max() - orig_norm.min() + 1e-5) * 255.0
        orig_rgb = np.stack([orig_norm.astype(np.uint8)] * 3, axis=-1)

        # 2. Mask visualization (Cyan vessel overlay on dark background)
        mask_rgb = np.zeros((h, w, 3), dtype=np.uint8)
        mask_bool = mask_arr > 0
        mask_rgb[mask_bool] = [14, 165, 233]  # Sky-500 cyan vessel lumen
        # Alpha blend with original scan
        mask_overlay = (orig_rgb.astype(float) * 0.45 + mask_rgb.astype(float) * 0.55).astype(np.uint8)
        centerline_rgb = orig_rgb.copy()
        if centerline is not None:
            centerline_rgb[centerline.astype(bool)] = [255, 220, 45]

        # 3. Explainable narrowing-candidate map. This is a transparent QCA
        # width-based explanation rather than a claim of neural Grad-CAM.
        heatmap_raw = np.zeros((h, w), dtype=np.float32)
        candidate_bool = candidate_mask.astype(bool) if candidate_mask is not None else np.zeros((h, w), dtype=bool)
        if np.any(candidate_bool):
            heatmap_raw[candidate_bool] = 1.0
            heatmap_raw = ndi.gaussian_filter(heatmap_raw, sigma=8.0)
            heatmap_raw = (heatmap_raw - heatmap_raw.min()) / (heatmap_raw.max() - heatmap_raw.min() + 1e-5)

        # Apply Jet colormap mathematically (Blue -> Cyan -> Yellow -> Red)
        cmap_rgb = np.zeros((h, w, 3), dtype=np.uint8)
        val = np.clip(heatmap_raw, 0.0, 1.0)
        # Red channel
        cmap_rgb[:, :, 0] = np.clip((1.5 - np.abs(val * 4 - 3)) * 255, 0, 255).astype(np.uint8)
        # Green channel
        cmap_rgb[:, :, 1] = np.clip((1.5 - np.abs(val * 4 - 2)) * 255, 0, 255).astype(np.uint8)
        # Blue channel
        cmap_rgb[:, :, 2] = np.clip((1.5 - np.abs(val * 4 - 1)) * 255, 0, 255).astype(np.uint8)

        # Blend Heatmap with original scan
        if np.any(candidate_bool):
            qca_overlay = (orig_rgb.astype(float) * 0.55 + cmap_rgb.astype(float) * 0.45).astype(np.uint8)
        else:
            qca_overlay = (orig_rgb.astype(float) * 0.48 + mask_rgb.astype(float) * 0.52).astype(np.uint8)

        # Vessel segmentation remains useful to review even when no stenosis
        # candidate is detected; only candidate pixels receive red styling.
        stenosis_overlay = (orig_rgb.astype(float) * 0.48 + mask_rgb.astype(float) * 0.52).clip(0, 255).astype(np.uint8)
        if centerline is not None:
            stenosis_overlay[centerline.astype(bool)] = [255, 220, 45]
        if np.any(candidate_bool):
            outline = candidate_bool & ~ndi.binary_erosion(candidate_bool, iterations=1)
            stenosis_overlay[outline] = [255, 40, 70]
            inside = candidate_bool & ~outline
            stenosis_overlay[inside] = (stenosis_overlay[inside] * 0.35 + np.array([255, 80, 80]) * 0.65).astype(np.uint8)

        # Helper to encode numpy RGB image to Base64 data URL
        def to_b64_url(img_mat):
            pil_im = Image.fromarray(img_mat)
            buff = io.BytesIO()
            pil_im.save(buff, format="PNG")
            b64_str = base64.b64encode(buff.getvalue()).decode("utf-8")
            return f"data:image/png;base64,{b64_str}"

        visualizations = {
            "original_b64": to_b64_url(orig_rgb),
            "mask_overlay_b64": to_b64_url(mask_overlay),
            "centerline_overlay_b64": to_b64_url(centerline_rgb),
            "stenosis_overlay_b64": to_b64_url(stenosis_overlay),
            **({"gradcam_heatmap_b64": gradcam_overlay} if gradcam_overlay else {}),
            "raw_mask_b64": to_b64_url(np.stack([mask_arr]*3, axis=-1)),
            "candidate_heatmap_b64": to_b64_url(qca_overlay)
        }
        if denoised_img_arr is not None and not np.array_equal(denoised_img_arr, orig_img_arr):
            denoised_norm = denoised_img_arr.astype(np.float32)
            denoised_norm = (denoised_norm - denoised_norm.min()) / (denoised_norm.max() - denoised_norm.min() + 1e-5) * 255.0
            visualizations["denoised_b64"] = to_b64_url(np.repeat(denoised_norm.astype(np.uint8)[..., None], 3, axis=2))
        return visualizations

    def analyze_scan(self, image_input, case_metadata=None):
        """
        Runs comprehensive end-to-end clinical AI analysis on a medical scan.
        image_input: bytes, PIL.Image, or file path.
        """
        start_t = time.time()
        
        img_arr = self.load_scan_array(image_input)

        # Preserve the original for display; denoise a preview and use it for
        # inference only when the high-frequency noise threshold is exceeded.
        high_frequency = float(np.std(img_arr.astype(np.int16) - ndi.median_filter(img_arr, size=3).astype(np.int16)))
        denoised_preview = ndi.gaussian_filter(ndi.median_filter(img_arr.astype(np.float32), size=3), sigma=0.8).clip(0, 255).astype(np.uint8)
        inference_img = denoised_preview if high_frequency > 20 else img_arr

        # 1. Automated Segmentation and Distance Transform
        mask_uint8, dist_transform, centerline = self.predict_segmentation(inference_img)
        predicted_coverage = float(np.mean(mask_uint8 > 0))
        mask_valid = 0.001 <= predicted_coverage <= 0.30
        if not mask_valid:
            # Refuse obvious background-collapse/full-frame masks. Never turn a
            # failed segmentation into a stenosis measurement or colored overlay.
            mask_uint8 = np.zeros_like(mask_uint8)
            dist_transform = np.zeros_like(dist_transform)
            centerline = np.zeros_like(centerline, dtype=bool)
        candidate_mask, candidate_regions = self.extract_stenosis_candidates(mask_uint8, dist_transform, centerline)
        candidate_status = (
            "segmentation_unavailable" if not mask_valid
            else "research_candidates_proposed" if candidate_regions
            else "no_candidate_proposed"
        )
        stenosis_detection_pipeline = {
            "status": candidate_status,
            "method": "Vessel segmentation followed by QCA radius-profile candidate localization",
            "segmentation_valid": mask_valid,
            "candidate_count": len(candidate_regions),
            "candidate_ids": [candidate["candidate_id"] for candidate in candidate_regions],
            "clinical_stenosis_confirmed": None,
            "warning": (
                "Segmentation was not plausible; no candidate analysis was performed."
                if not mask_valid else
                "Candidate proposals are not a confirmed stenosis diagnosis; clinician review is required."
            ),
        }

        # Pixel-to-mm conversion is intentionally omitted until image calibration is supplied.
        ref_diameter_mm = None
        min_diameter_mm = None

        # Segmentation geometry is a research candidate proposal, not a trained
        # stenosis diagnosis or a calibrated narrowing measurement.
        narrowing_pct = None
        severity = None
        det_pred = None
        confidence_score = None

        # Report overlap metrics only when a paired reference mask is available.
        dice_score, iou_score = self.reference_mask_metrics(image_input, mask_uint8) if mask_valid else (None, None)

        # 4. Generate Clinical Recommendations
        recommendations = {"action": "Clinician review required", "summary": "No automated treatment recommendation is provided. Verify image quality, calibration, segmentation, and measurements before clinical interpretation."}

        # 5. Generate Visual Overlays
        gradcam_overlay = self.generate_segmentation_gradcam(inference_img, display_image=img_arr) if mask_valid else None
        viz = self.generate_xai_visualizations(img_arr, mask_uint8, dist_transform, narrowing_pct, severity, candidate_mask, gradcam_overlay, centerline, denoised_preview)
        if not mask_valid:
            viz = {key: viz[key] for key in ("original_b64", "denoised_b64") if key in viz}

        elapsed = round((time.time() - start_t) * 1000, 1)

        result = {
            "model_version": f"Infosys-ArteryNet-{self.segmentation_model_name}-QCA-v3",
            "analysis_pipeline_version": "2.8.0-stenosis-candidate-pipeline",
            "scan_quality_status": "Readable image passed file, resolution, contrast, and decode checks; clinical suitability still requires doctor review",
            "input_preprocessing": "Median and light Gaussian denoising applied to an inference copy; original scan preserved for display" if high_frequency > 20 else "Original intensity image used for inference",
            "model_status": ((f"ARCADE U-Net held-out test: Dice {self.segmentation_validation['held_out_test_metrics']['dice']:.3f}, IoU {self.segmentation_validation['held_out_test_metrics']['iou']:.3f} (research evaluation; not clinically validated). " if self.segmentation_validation else "U-Net held-out evaluation report unavailable; not clinically validated. ") + ("Segmentation produced no plausible vessel mask for this scan; no stenosis measurements generated." if not mask_valid else "Vessel segmentation generated for clinician review.")) if self.segmentation_model is not None else "Trained segmentation model not configured; no clinical measurements available",
            "analysis_warning": ("U-Net output did not have a plausible vessel segmentation area. Review the original scan; no stenosis finding, confidence, or measurement is available." if not mask_valid else "QCA radius-profile regions are research candidates only; no trained clinical stenosis classification or calibrated narrowing measurement was produced." if candidate_regions else "No QCA radius-profile candidate was identified. This does not confirm the absence of disease; stenosis class and calibrated narrowing are unavailable."),
            "stenosis_detected": det_pred,
            "severity": severity,
            "narrowing_percentage": narrowing_pct,
            "reference_diameter_mm": ref_diameter_mm,
            "min_diameter_mm": min_diameter_mm,
            "lesion_length_mm": None,
            "dice_score": dice_score,
            "iou_score": iou_score,
            "confidence_score": confidence_score,
            "inference_time_ms": elapsed,
            "clinical_recommendations": recommendations,
            "visualizations": viz,
            "candidate_regions": candidate_regions,
            "stenosis_detection_pipeline": stenosis_detection_pipeline,
            "explainability": {
                "method": "Grad-CAM for U-Net vessel segmentation plus QCA radius-profile candidate localization" if gradcam_overlay else "QCA radius-profile candidate localization",
                "gradcam_available": bool(gradcam_overlay),
                "gradcam_target": "U-Net vessel segmentation output; highlights image regions influencing the segmentation prediction" if gradcam_overlay else None,
                "summary": "The QCA map marks segmented vessel-centerline locations whose radius falls below the candidate proposal threshold. The per-candidate percentage is a pixel-radius research estimate, not a confirmed or clinically validated stenosis measurement.",
                "segmentation_model": self.segmentation_model_name,
                "reference_radius_px": round(float(np.percentile(dist_transform[mask_uint8 > 0], 90)), 2) if np.any(mask_uint8) else 0.0,
                "minimum_radius_px": round(float(np.percentile(dist_transform[centerline], 2)), 2) if np.any(centerline) else 0.0,
                "candidate_count": len(candidate_regions),
            }
        }
        return result

    def create_denoised_preview(self, image_input):
        """Create median-filter and difference previews without altering the source."""
        source_name = os.path.basename(os.fspath(image_input)) if isinstance(image_input, (str, os.PathLike)) else "uploaded-image"
        logger.info("Starting non-destructive median preview for %s", source_name)
        try:
            original = self.load_scan_array(image_input)
            quality = inspect_grayscale_image(original)
            if not quality["salt_and_pepper_detected"]:
                raise ValueError("Salt-and-pepper noise was not detected; no denoising preview was generated.")
            denoised, difference = median_denoising_previews(original)

            def encode_png(image):
                buffer = io.BytesIO()
                Image.fromarray(image).save(buffer, format="PNG")
                encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
                return f"data:image/png;base64,{encoded}"

            return {
                "denoisedPreview": encode_png(denoised),
                "differencePreview": encode_png(difference),
                "method": "OpenCV medianBlur, 5x5 kernel",
                "qualityCheck": quality,
                "visualizationOnly": True,
            }
        except cv2.error as exc:
            logger.exception("OpenCV median preview failed for %s", source_name)
            raise ValueError(f"OpenCV median-filter preprocessing failed: {exc}") from exc
        except (OSError, ValueError) as exc:
            logger.exception("Median preview input or quality check failed for %s", source_name)
            raise

    @staticmethod
    def load_scan_array(image_input):
        """Read common raster images and optional DICOM/NIfTI input formats."""
        if isinstance(image_input, Image.Image):
            return np.asarray(image_input.convert("L"))
        if isinstance(image_input, bytes):
            return np.asarray(Image.open(io.BytesIO(image_input)).convert("L"))
        path = os.fspath(image_input)
        lower = path.lower()
        try:
            with Image.open(path) as source:
                source.load()
                return np.asarray(source.convert("L"), dtype=np.uint8)
        except (OSError, ValueError) as exc:
            if lower.endswith((".png", ".jpg", ".jpeg")):
                logger.exception("Raster image decode failed for %s", os.path.basename(path))
                raise ValueError(f"Unable to decode the uploaded raster image: {exc}") from exc
            logger.debug("Pillow did not decode %s; trying its medical-image reader.", os.path.basename(path))
        if lower.endswith(".dcm"):
            try:
                import pydicom
                volume = np.asarray(pydicom.dcmread(path).pixel_array)
            except ImportError as exc:
                raise ValueError("DICOM support requires pydicom. Install backend/requirements_imaging.txt.") from exc
        elif lower.endswith((".nii", ".nii.gz")):
            try:
                import nibabel as nib
                volume = np.asarray(nib.load(path).get_fdata())
            except ImportError as exc:
                raise ValueError("NIfTI support requires nibabel. Install backend/requirements_imaging.txt.") from exc
        elif lower.endswith(".mhd"):
            try:
                import SimpleITK as sitk
                volume = sitk.GetArrayFromImage(sitk.ReadImage(path))
            except ImportError as exc:
                raise ValueError("MetaImage support requires SimpleITK. Install backend/requirements_imaging.txt.") from exc
        else:
            raise ValueError("Unsupported scan encoding. Upload a readable PNG/JPEG, DICOM, or NIfTI image.")
        if volume.ndim == 3:
            volume = volume[volume.shape[0] // 2] if volume.shape[-1] > max(volume.shape[:2]) else volume[:, :, volume.shape[-1] // 2]
        volume = np.nan_to_num(volume.astype(np.float32))
        lo, hi = np.percentile(volume, [1, 99])
        return (np.clip((volume - lo) / max(float(hi - lo), 1e-6), 0, 1) * 255).astype(np.uint8)

    @staticmethod
    def reference_mask_metrics(image_input, prediction):
        if not isinstance(image_input, (str, os.PathLike)):
            return None, None
        path = os.path.abspath(os.fspath(image_input))
        dataset_images = os.path.abspath(os.path.join(DATASET_DIR, "images"))
        if os.path.commonpath([path, dataset_images]) != dataset_images:
            return None, None
        name = os.path.basename(path)
        if not name.startswith("case_"):
            return None, None
        truth_path = os.path.join(DATASET_DIR, "masks", name[:-4] + "_mask.png")
        if not os.path.isfile(truth_path):
            return None, None
        truth = np.asarray(Image.open(truth_path).convert("L").resize((prediction.shape[1], prediction.shape[0]), Image.Resampling.NEAREST)) > 0
        pred = prediction > 0
        tp = int(np.logical_and(pred, truth).sum())
        fp = int(np.logical_and(pred, ~truth).sum())
        fn = int(np.logical_and(~pred, truth).sum())
        dice = 2 * tp / max(1, 2 * tp + fp + fn)
        iou = tp / max(1, tp + fp + fn)
        return round(float(dice), 4), round(float(iou), 4)

    def get_clinical_recommendations(self, severity, narrowing_pct):
        if severity == "Normal":
            return {
                "management_class": "Class I (No Obstructive CAD)",
                "action": "Routine Preventive Care",
                "summary": "Hemodynamically normal coronary caliber without significant atherosclerotic obstruction.",
                "guidelines": "Maintain optimal lipid profile (LDL < 70 mg/dL), regular physical exercise, and annual cardiovascular checkup."
            }
        elif severity == "Mild":
            return {
                "management_class": "Class IIa (Non-Obstructive CAD)",
                "action": "Medical Management & Plaque Stabilization",
                "summary": f"Mild luminal stenosis ({narrowing_pct}%). Non-flow-limiting atherosclerotic plaque.",
                "guidelines": "Initiate or intensify high-intensity statin therapy (Atorvastatin 40-80mg), aspirin 81mg daily, and strict blood pressure control (<130/80 mmHg)."
            }
        elif severity == "Moderate":
            return {
                "management_class": "Class IIa (Functionally Intermediate Lesion)",
                "action": "Hemodynamic Assessment (FFR / iFR)",
                "summary": f"Moderate coronary stenosis ({narrowing_pct}%). Plaque may cause exercise-induced ischemia.",
                "guidelines": "Recommend non-invasive stress imaging (SPECT / Stress Echo) or invasive Fractional Flow Reserve (FFR) evaluation. Revascularize if FFR ≤ 0.80."
            }
        elif severity == "Severe":
            return {
                "management_class": "Class I (Flow-Limiting Obstructive CAD)",
                "action": "Interventional Cardiology Consultation (PCI / Stenting)",
                "summary": f"Severe flow-limiting luminal stenosis ({narrowing_pct}%). High probability of myocardial ischemia.",
                "guidelines": "Urgent referral for invasive coronary angiography. Percutaneous Coronary Intervention (PCI) with Drug-Eluting Stent (DES) or CABG evaluation indicated."
            }
        else: # Critical
            return {
                "management_class": "Class I (Critical High-Risk Stenosis)",
                "action": "Urgent Revascularization / Inpatient Care",
                "summary": f"Critical sub-occlusive stenosis ({narrowing_pct}%). Imminent risk of acute coronary syndrome (ACS).",
                "guidelines": "Immediate cardiology inpatient admission, continuous cardiac telemetry, dual antiplatelet therapy (DAPT), and urgent revascularization."
            }

ai_engine_instance = ArteryAIEngine()

