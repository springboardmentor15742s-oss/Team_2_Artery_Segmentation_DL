"""Artery AI research and clinical-workflow API.

Provides image quality checks, vessel segmentation, QCA candidate localization,
optional CADICA research lesion boxes, and clinician review workflows. Research
candidate outputs are not confirmed stenosis diagnoses.
"""

from __future__ import annotations
import os
import re
import json
import logging
import hmac
import hashlib
import secrets
import sqlite3
import mimetypes
import subprocess
import sys
import tempfile
import base64
import io
import smtplib
import ssl
import time
import threading
from collections import defaultdict
from email.message import EmailMessage
from functools import lru_cache
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Literal

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Header, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

try:
    from feature_extractor import extract_qca_features
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
    from feature_extractor import extract_qca_features


try:
    from data_splits import stratified_split_labels
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
    from data_splits import stratified_split_labels

try:
    # Package import: ``python -m uvicorn backend.main:app`` from project root.
    from .ai_engine import ai_engine_instance
    from .image_quality import inspect_grayscale_image
except ImportError:
    # Direct module import: ``python -m uvicorn main:app`` from backend/.
    from ai_engine import ai_engine_instance
    from image_quality import inspect_grayscale_image

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATASET_DIR = PROJECT_ROOT / "dataset"
IMAGES_DIR = DATASET_DIR / "images"
TRAINING_DIR = PROJECT_ROOT / "training"
_ARCADE_INDEX = None
_CADICA_INDEX = None
logger = logging.getLogger(__name__)
_METRIC_LOCK = threading.Lock()
_HTTP_REQUESTS = defaultdict(int)
_HTTP_DURATION_SUM = defaultdict(float)
_HTTP_DURATION_COUNT = defaultdict(int)
_HTTP_DURATION_BUCKETS = (0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
_HTTP_DURATION_OBSERVATIONS = defaultdict(lambda: [0] * (len(_HTTP_DURATION_BUCKETS) + 1))
DB_PATH = Path(os.getenv("ARTERY_DB_PATH", str(BASE_DIR / "artery_ai.db")))
UPLOAD_DIR = Path(os.getenv("ARTERY_UPLOAD_DIR", str(BASE_DIR / "storage" / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 300 * 1024 * 1024
VIDEO_EXTS = (".mp4", ".mov", ".avi", ".webm", ".mpg", ".mpeg")
ALLOWED_EXTS = (".dcm", ".nii", ".nii.gz", ".mhd", ".png", ".jpg", ".jpeg", *VIDEO_EXTS)
SECRET = os.getenv("ARTERY_SECRET_KEY") or secrets.token_urlsafe(32)
SECRET = SECRET.encode("utf-8")

app = FastAPI(
    title="Infosys Artery AI — Enterprise Cardiovascular Diagnostic Platform API",
    version="2.4.0",
    description="Research and clinical-workflow API for coronary image quality, vessel segmentation, and candidate localization."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.middleware("http")
async def observe_http_requests(request, call_next):
    if request.url.path == "/metrics":
        return await call_next(request)
    started = time.perf_counter()
    status_code = 500
    method = request.method
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = secrets.token_hex(8)
        return response
    except Exception:
        logger.exception("Unhandled request exception")
        raise
    finally:
        elapsed = time.perf_counter() - started
        route = getattr(request.scope.get("route"), "path", "/unmatched")
        key = (method, route, status_code)
        with _METRIC_LOCK:
            _HTTP_REQUESTS[key] += 1
            _HTTP_DURATION_SUM[(method, route)] += elapsed
            _HTTP_DURATION_COUNT[(method, route)] += 1
            for index, bound in enumerate(_HTTP_DURATION_BUCKETS):
                if elapsed <= bound:
                    _HTTP_DURATION_OBSERVATIONS[(method, route)][index] += 1
            _HTTP_DURATION_OBSERVATIONS[(method, route)][-1] += 1
        logger.info("http_request", extra={"method": method, "route": route, "status_code": status_code, "duration_ms": round(elapsed * 1000, 2)})

@app.get("/metrics", include_in_schema=False)
def prometheus_metrics():
    lines = [
        "# HELP artery_http_requests_total HTTP requests handled by the Artery API.",
        "# TYPE artery_http_requests_total counter",
    ]
    with _METRIC_LOCK:
        requests_snapshot = list(_HTTP_REQUESTS.items())
        sums_snapshot = list(_HTTP_DURATION_SUM.items())
        counts_snapshot = list(_HTTP_DURATION_COUNT.items())
        buckets_snapshot = [(key, list(value)) for key, value in _HTTP_DURATION_OBSERVATIONS.items()]
    for (method, route, status), count in requests_snapshot:
        lines.append(f'artery_http_requests_total{{method="{method}",route="{route}",status="{status}"}} {count}')
    lines.extend(["# HELP artery_http_request_duration_seconds HTTP request duration in seconds.", "# TYPE artery_http_request_duration_seconds histogram"])
    bucket_map = dict(buckets_snapshot)
    sum_map, count_map = dict(sums_snapshot), dict(counts_snapshot)
    for key, observations in buckets_snapshot:
        method, route = key
        for index, bound in enumerate(_HTTP_DURATION_BUCKETS):
            lines.append(f'artery_http_request_duration_seconds_bucket{{method="{method}",route="{route}",le="{bound}"}} {observations[index]}')
        lines.append(f'artery_http_request_duration_seconds_bucket{{method="{method}",route="{route}",le="+Inf"}} {observations[-1]}')
        lines.append(f'artery_http_request_duration_seconds_sum{{method="{method}",route="{route}"}} {sum_map.get(key, 0.0)}')
        lines.append(f'artery_http_request_duration_seconds_count{{method="{method}",route="{route}"}} {count_map.get(key, 0)}')
    return Response("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4; charset=utf-8")

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def send_alert_email(to_email: str, subject: str, body: str):
    """Send a minimal workflow email when SMTP is configured; otherwise skip safely."""
    host = os.getenv("ARTERY_SMTP_HOST", "").strip()
    if not host or not to_email:
        logger.info("Email alert skipped: SMTP host or recipient is not configured.")
        return False
    try:
        port = int(os.getenv("ARTERY_SMTP_PORT", "587"))
        username = os.getenv("ARTERY_SMTP_USERNAME", "").strip()
        password = os.getenv("ARTERY_SMTP_PASSWORD", "")
        sender = os.getenv("ARTERY_SMTP_FROM", username).strip()
        if not sender:
            logger.warning("Email alert skipped: ARTERY_SMTP_FROM is not set.")
            return False
        message = EmailMessage()
        message["Subject"], message["From"], message["To"] = subject, sender, to_email
        message.set_content(body)
        use_ssl = os.getenv("ARTERY_SMTP_USE_SSL", "false").lower() == "true" or port == 465
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_class(host, port, timeout=12) as server:
            if not use_ssl and os.getenv("ARTERY_SMTP_STARTTLS", "true").lower() == "true":
                server.starttls(context=ssl.create_default_context())
            if username:
                server.login(username, password)
            server.send_message(message)
        return True
    except Exception:
        logger.exception("Workflow email delivery failed")
        return False

def connect():
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

def json_load(v, fallback=None):
    try:
        return json.loads(v) if v else (fallback if fallback is not None else {})
    except Exception:
        return fallback if fallback is not None else {}

def image_quality_result(path):
    """Assess source pixels and return quality status, reason, and measured indicators."""
    try:
        gray = np.asarray(ai_engine_instance.load_scan_array(path), dtype=np.uint8)
    except Exception as exc:
        logger.exception("Image decoding failed during quality check for %s", Path(path).name)
        return {
            "passed": False,
            "status": "Error",
            "reason": f"Image quality could not be validated ({exc}). Upload a readable angiography image.",
            "salt_and_pepper_detected": False,
            "metrics": {},
        }
    try:
        result = inspect_grayscale_image(gray)
    except Exception as exc:
        logger.exception("Quality metric calculation failed for %s", Path(path).name)
        return {
            "passed": False,
            "status": "Error",
            "reason": f"Image quality metric calculation failed ({exc}). Upload a readable angiography image.",
            "salt_and_pepper_detected": False,
            "metrics": {},
        }
    if result["passed"]:
        logger.info("Image quality passed for %s: %s", Path(path).name, result["metrics"])
    else:
        logger.warning(
            "Image quality failed for %s: %s; metrics=%s",
            Path(path).name,
            result["reason"],
            result["metrics"],
        )
    return result

def image_quality_issue(path):
    """Compatibility helper for callers that only need the rejection reason."""
    return image_quality_result(path)["reason"]

def quality_recommendation(result):
    if result.get("salt_and_pepper_detected"):
        return "Upload another original angiography image or DICOM file. A denoised preview is for comparison only and does not clear this failure."
    reason = str(result.get("reason") or "").lower()
    if "too small" in reason:
        return "Upload the original full-resolution angiography image or DICOM series."
    if "blank" in reason or "contrast" in reason:
        return "Check that the original scan is readable and has usable contrast, then upload it again."
    return "Upload a readable original angiography image or DICOM file and retry analysis."

def locate_case_image(scan_row, case_id):
    if scan_row["file_path"] and Path(scan_row["file_path"]).is_file():
        return Path(scan_row["file_path"])
    info = json_load(scan_row["file_info_json"], {})
    candidates = [IMAGES_DIR / info.get("fileName", ""), IMAGES_DIR / f"{case_id}.png", IMAGES_DIR / f"case_{case_id.split('-')[-1]}.png"]
    return next((path for path in candidates if path.is_file()), None)

def arcade_root():
    configured = os.getenv("ARTERY_ARCADE_DIR")
    candidates = [Path(configured)] if configured else []
    candidates.extend((
        PROJECT_ROOT / "arcade (1)" / "arcade",
        DATASET_DIR / "ARCADE" / "data" / "arcade",
        DATASET_DIR / "ARCADE" / "data",
        DATASET_DIR / "ARCADE",
    ))
    for candidate in candidates:
        if any((candidate / task / split / "annotations" / f"{split}.json").is_file()
               for task in ("syntax", "stenosis") for split in ("train", "val", "test")):
            return candidate.resolve()
    return None

def arcade_index():
    global _ARCADE_INDEX
    if _ARCADE_INDEX is not None:
        return _ARCADE_INDEX
    root = arcade_root()
    records = []
    cases = {}
    image_paths = {}
    if root:
        for task in ("syntax", "stenosis"):
            for split in ("train", "val", "test"):
                annotation_path = root / task / split / "annotations" / f"{split}.json"
                if not annotation_path.is_file():
                    continue
                try:
                    data = json.loads(annotation_path.read_text(encoding="utf-8-sig"))
                except (OSError, json.JSONDecodeError) as exc:
                    raise HTTPException(500, f"Could not read ARCade {task}/{split} annotations: {exc}")
                images_dir = root / task / split / "images"
                annotation_counts = {}
                for annotation in data.get("annotations", []):
                    image_id = annotation.get("image_id")
                    annotation_counts[image_id] = annotation_counts.get(image_id, 0) + 1
                for image in data.get("images", []):
                    try:
                        image_id = int(image["id"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    file_name = Path(str(image.get("file_name", ""))).name
                    if not re.fullmatch(r"\d+\.png", file_name):
                        continue
                    image_path = images_dir / file_name
                    case_id = f"ARCADE-{task}-{split}-{image_id:04d}"
                    image_key = f"ARCADE_{task}_{split}_{image_id:04d}.png"
                    record = {
                        "caseId": case_id,
                        "patientId": "ARCade public sample",
                        "fileName": image_key,
                        "modality": "X-ray angiography",
                        "region": "Coronary arteries",
                        "vessel": f"{task.title()} annotation task",
                        "severity": f"{annotation_counts.get(image_id, 0)} annotation(s)",
                        "status": split.title(),
                        "task": task,
                        "split": split,
                    }
                    records.append(record)
                    cases[case_id] = record
                    image_paths[image_key] = image_path
    _ARCADE_INDEX = {"records": records, "cases": cases, "image_paths": image_paths}
    return _ARCADE_INDEX

def cadica_index():
    global _CADICA_INDEX
    if _CADICA_INDEX is not None:
        return _CADICA_INDEX

    root = DATASET_DIR / "CADICA" / "selectedVideos"
    records, cases, image_paths = [], {}, {}
    if root.is_dir():
        for input_dir in root.glob("p*/v*/input"):
            parts = input_dir.parts
            if len(parts) < 4:
                continue
            patient_key, video_key = parts[-3], parts[-2]
            if not re.fullmatch(r"p\d+", patient_key) or not re.fullmatch(r"v\d+", video_key):
                continue
            groundtruth_dir = input_dir.parent / "groundtruth"
            try:
                annotation_files = {path.name for path in groundtruth_dir.glob("*.txt")}
            except OSError:
                annotation_files = set()
            for image_path in input_dir.glob("*.png"):
                frame_id = image_path.stem.rsplit("_", 1)[-1]
                if not frame_id.isdigit():
                    continue
                case_id = f"CADICA-{patient_key}-{video_key}-{frame_id}"
                file_name = f"CADICA_{image_path.name}"
                has_annotation = f"{image_path.stem}.txt" in annotation_files
                record = {
                    "caseId": case_id,
                    "patientId": f"CADICA {patient_key}",
                    "fileName": file_name,
                    "modality": "X-ray angiography",
                    "region": "Coronary arteries",
                    "vessel": f"{video_key} · frame {frame_id}",
                    "severity": "Reference annotation available" if has_annotation else "No frame annotation",
                    "status": "CADICA research sample",
                    "task": "denoising and cross-dataset research",
                    "patientKey": patient_key,
                    "videoKey": video_key,
                    "frameId": frame_id,
                    "imagePath": image_path,
                    "annotationPath": groundtruth_dir / f"{image_path.stem}.txt" if has_annotation else None,
                }
                records.append(record)
                cases[case_id] = record
                image_paths[file_name] = image_path

    _CADICA_INDEX = {"records": records, "cases": cases, "image_paths": image_paths}
    return _CADICA_INDEX


def cadica_case(case_id):
    if not re.fullmatch(r"CADICA-p\d+-v\d+-\d+", case_id):
        raise HTTPException(404, "CADICA research sample not found.")
    record = cadica_index()["cases"].get(case_id)
    if not record:
        raise HTTPException(404, "CADICA research sample not found.")
    return record

def cadica_case_public(record):
    return {
        "id": record["caseId"],
        "patientId": record["patientId"],
        "age": None,
        "gender": "Not provided",
        "medicalHistory": "CADICA is a de-identified public research dataset, not a patient registry.",
        "riskFactors": [],
        "clinicalNotes": "Research frame. Cross-dataset model output is not a patient-specific clinical finding.",
        "modality": record["modality"],
        "scanDate": f"{record['patientKey']} · {record['videoKey']} · frame {record['frameId']}",
        "anatomicalRegion": record["region"],
        "status": record["status"],
        "modelVersion": ai_engine_instance.segmentation_model_name,
        "createdAt": None,
        "updatedAt": None,
        "fileInfo": {"fileName": record["fileName"]},
        "datasetOnly": True,
        "referenceAnnotationAvailable": bool(record["annotationPath"]),
    }

def cadica_reference_annotations(record):
    annotation_path = record.get("annotationPath")
    if not annotation_path:
        return []
    annotations = []
    for line_number, line in enumerate(annotation_path.read_text(encoding="utf-8").splitlines(), start=1):
        parts = line.split()
        if not parts:
            continue
        if len(parts) < 4:
            raise HTTPException(500, f"Malformed CADICA annotation at {annotation_path.name}:{line_number}.")
        try:
            x, y, width, height = (float(value) for value in parts[:4])
        except ValueError as exc:
            raise HTTPException(500, f"Malformed CADICA box coordinates at {annotation_path.name}:{line_number}.") from exc
        if not np.isfinite([x, y, width, height]).all() or width <= 0 or height <= 0:
            raise HTTPException(500, f"Invalid CADICA box dimensions at {annotation_path.name}:{line_number}.")
        annotations.append({
            "bbox_px": {"x": x, "y": y, "width": width, "height": height},
            "category": " ".join(parts[4:]) or "lesion",
        })
    return annotations

def cadica_reference_overlay(image_path, annotations):
    if not annotations:
        return None
    image = Image.fromarray(np.asarray(ai_engine_instance.load_scan_array(image_path), dtype=np.uint8)).convert("RGB")
    draw = ImageDraw.Draw(image)
    for annotation in annotations:
        box = annotation["bbox_px"]
        left, top = box["x"], box["y"]
        right, bottom = left + box["width"], top + box["height"]
        draw.rectangle((left, top, right, bottom), outline=(255, 40, 70), width=3)
        draw.text((left, max(0, top - 12)), annotation["category"], fill=(255, 40, 70))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")

def cadica_prediction_overlay(image_path, predictions):
    if not predictions:
        return None
    image = Image.fromarray(np.asarray(ai_engine_instance.load_scan_array(image_path), dtype=np.uint8)).convert("RGB")
    draw = ImageDraw.Draw(image)
    for prediction in predictions:
        box = prediction["bbox_px"]
        left, top = box["x"], box["y"]
        right, bottom = left + box["width"], top + box["height"]
        draw.rectangle((left, top, right, bottom), outline=(0, 235, 255), width=3)
        draw.text((left, max(0, top - 12)), f"{prediction['candidate_id']} · score {prediction['model_score']:.2f}", fill=(0, 235, 255))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")

def arcade_case_id_parts(case_id):
    match = re.fullmatch(r"ARCADE-(syntax|stenosis)-(train|val|test)-(\d{4})", case_id)
    return match.groups() if match else None

def arcade_case(case_id):
    if not arcade_case_id_parts(case_id):
        return None
    record = arcade_index()["cases"].get(case_id)
    if not record:
        raise HTTPException(404, "ARCade dataset sample not found.")
    return record

def arcade_case_public(record):
    return {
        "id": record["caseId"],
        "patientId": "ARCade public dataset sample",
        "age": None,
        "gender": "Not provided",
        "medicalHistory": "The ARCade dataset does not provide patient demographics in this viewer.",
        "riskFactors": [],
        "clinicalNotes": "Research dataset sample; model output is not patient-specific.",
        "modality": record["modality"],
        "scanDate": f"{record['split'].title()} split",
        "anatomicalRegion": record["region"],
        "status": "ARCade research sample",
        "modelVersion": ai_engine_instance.segmentation_model_name,
        "createdAt": None,
        "updatedAt": None,
        "fileInfo": {"fileName": record["fileName"]},
        "datasetOnly": True,
    }

def run_arcade_analysis(case_id):
    record = arcade_case(case_id)
    image_path = arcade_index()["image_paths"][record["fileName"]]
    quality_check = image_quality_result(image_path)
    if not quality_check["passed"]:
        raise HTTPException(422, quality_check["reason"])
    result = ai_engine_instance.analyze_scan(str(image_path), {"case_id": case_id})
    result["quality_check"] = quality_check
    model_warning = result.get("analysis_warning", "")
    result["scan_quality_status"] = "ARCade X-ray passed technical readability checks; this research sample is not a patient record."
    result["analysis_warning"] = "ARCade research visualization only; not a patient-specific clinical finding." + (f" {model_warning}" if model_warning else "")
    result["clinical_recommendations"] = {
        "action": "Research visualization only",
        "summary": "ARCade annotations and model outputs are not calibrated for patient-specific clinical decisions.",
    }
    return result

def rowdict(row):
    return dict(row) if row else None

def init_db():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Clinical Radiologist',
          department TEXT DEFAULT 'Cardiovascular Imaging', institution TEXT DEFAULT 'Infosys Healthcare AI Lab',
          phone TEXT DEFAULT '', license_number TEXT DEFAULT '', preferences_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS patients (
          patient_id TEXT PRIMARY KEY, age INTEGER, gender TEXT, medical_history TEXT DEFAULT '',
          risk_factors_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scans (
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(patient_id),
          modality TEXT NOT NULL, anatomical_region TEXT NOT NULL, scan_date TEXT,
          clinical_notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending',
          model_version TEXT DEFAULT 'Infosys-ArteryNet-v2.4', file_info_json TEXT,
          file_path TEXT, created_at TEXT NOT NULL, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS annotations (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          annotation_type TEXT NOT NULL, file_path TEXT, version TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS review_annotations (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL REFERENCES users(id), candidate_id TEXT NOT NULL,
          decision TEXT NOT NULL CHECK(decision IN ('confirmed','rejected','uncertain')),
          comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(scan_id, author_id, candidate_id)
        );
        CREATE TABLE IF NOT EXISTS analysis_jobs (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          model_version TEXT, status TEXT NOT NULL DEFAULT 'Pending', message TEXT DEFAULT '',
          created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS segmentation_results (
          id TEXT PRIMARY KEY, job_id TEXT, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          dice_score REAL, iou_score REAL, stenosis_detected INTEGER, severity TEXT,
          narrowing_percentage REAL, ref_diameter_mm REAL, min_diameter_mm REAL,
          confidence_score REAL, inference_time_ms REAL,
          recommendations_json TEXT NOT NULL DEFAULT '{}',
          visualizations_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          report_path TEXT, status TEXT DEFAULT 'Completed', summary TEXT DEFAULT '', author TEXT DEFAULT '',
          severity TEXT DEFAULT 'Normal', narrowing_percentage REAL DEFAULT 0.0,
          reviewed_by TEXT DEFAULT '', doctor_comments TEXT DEFAULT '', patient_user_id TEXT,
          approved_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY, type TEXT, title TEXT, message TEXT, case_id TEXT,
          patient_id TEXT, read INTEGER DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          patient_user_id TEXT NOT NULL REFERENCES users(id),
          doctor_user_id TEXT NOT NULL REFERENCES users(id),
          scheduled_at TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pharmacy_directory (
          osm_id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
          latitude REAL NOT NULL, longitude REAL NOT NULL, source TEXT NOT NULL DEFAULT 'OpenStreetMap',
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hospital_directory (
          osm_id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
          latitude REAL NOT NULL, longitude REAL NOT NULL, source TEXT NOT NULL DEFAULT 'OpenStreetMap',
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY, sender_user_id TEXT NOT NULL REFERENCES users(id),
          recipient_user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
          sent_at TEXT NOT NULL, read_at TEXT
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL,
          entity_type TEXT, entity_id TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feature_environments (
          id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feature_flags (
          flag_key TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          flag_type TEXT NOT NULL DEFAULT 'boolean', owner TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feature_flag_configs (
          flag_key TEXT NOT NULL REFERENCES feature_flags(flag_key) ON DELETE CASCADE,
          environment_id TEXT NOT NULL REFERENCES feature_environments(id) ON DELETE CASCADE,
          enabled INTEGER NOT NULL DEFAULT 0,
          rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK(rollout_percent BETWEEN 0 AND 100),
          rules_json TEXT NOT NULL DEFAULT '[]',
          default_value INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(flag_key, environment_id)
        );
        CREATE TABLE IF NOT EXISTS feature_flag_evaluations (
          id TEXT PRIMARY KEY,
          flag_key TEXT NOT NULL REFERENCES feature_flags(flag_key) ON DELETE CASCADE,
          environment_id TEXT NOT NULL REFERENCES feature_environments(id) ON DELETE CASCADE,
          subject_hash TEXT NOT NULL,
          evaluated_value INTEGER NOT NULL,
          reason TEXT NOT NULL,
          evaluated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scans_patient ON scans(patient_id);
        CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_scan ON analysis_jobs(scan_id);
        CREATE INDEX IF NOT EXISTS idx_seg_scan ON segmentation_results(scan_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
        CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time ON appointments(doctor_user_id, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_appointments_patient_time ON appointments(patient_user_id, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_feature_evaluations_flag_time ON feature_flag_evaluations(flag_key, evaluated_at);
        ''')
        for environment_id, name in (("development", "Development"), ("staging", "Staging"), ("production", "Production")):
            c.execute("INSERT OR IGNORE INTO feature_environments(id,name,created_at) VALUES(?,?,?)", (environment_id, name, now_iso()))
        # Additive migrations for existing local databases.
        report_columns = {row[1] for row in c.execute("PRAGMA table_info(reports)").fetchall()}
        for column, definition in {
            "reviewed_by": "TEXT DEFAULT ''", "doctor_comments": "TEXT DEFAULT ''",
            "patient_user_id": "TEXT", "approved_at": "TEXT"
        }.items():
            if column not in report_columns:
                c.execute(f"ALTER TABLE reports ADD COLUMN {column} {definition}")

        # Production enterprise user accounts
        clinicians = [
            ("DOCTOR-001", "Dr. Sarah Mitchell", "doctor01@infosys.com", "Interventional Cardiology"),
            ("DOCTOR-002", "Dr. Arjun Rao", "doctor02@infosys.com", "Ophthalmology"),
            ("DOCTOR-003", "Dr. Meera Iyer", "doctor03@infosys.com", "Otolaryngology (ENT)"),
            ("DOCTOR-004", "Dr. Daniel Chen", "doctor04@infosys.com", "Neurology"),
            ("DOCTOR-005", "Dr. Priya Nair", "doctor05@infosys.com", "Dermatology"),
            ("DOCTOR-006", "Dr. Omar Hassan", "doctor06@infosys.com", "Orthopedics"),
            ("DOCTOR-007", "Dr. Aisha Patel", "doctor07@infosys.com", "Endocrinology"),
            ("DOCTOR-008", "Dr. Kenji Watanabe", "doctor08@infosys.com", "Pediatrics"),
            ("DOCTOR-009", "Dr. Sofia Martinez", "doctor09@infosys.com", "Psychiatry"),
            ("DOCTOR-010", "Dr. Ravi Kumar", "doctor10@infosys.com", "General Practice"),
        ]
        # Retire the former shared demo identities so members register first;
        # direct access is limited to the named clinician demo accounts below.
        c.execute("DELETE FROM users WHERE id IN ('INF-USR-101','INF-USR-102','USR-1042','USR-DEMO')")
        demo_accounts = [(uid, name, email, "Doctor123!", specialty, "Infosys Cardiovascular Center of Excellence") for uid, name, email, specialty in clinicians]
        for index, (uid, name, email, password, specialty, inst) in enumerate(demo_accounts, start=1):
            if not c.execute("SELECT 1 FROM users WHERE lower(email)=lower(?)", (email,)).fetchone():
                c.execute(
                    "INSERT INTO users(id,name,email,password_hash,role,department,institution,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (uid, name, email.lower(), password_hash(password), "Doctor", specialty, inst, now_iso())
                )
            c.execute("UPDATE users SET role='Doctor',department=?,phone=? WHERE id=?", (specialty, f"+1-202-555-{100 + index:04d}", uid))

        # Seed clinical cases from our large dataset if scans table is empty
        if not c.execute("SELECT 1 FROM scans LIMIT 1").fetchone():
            seed_initial_cases(c)
        refresh_legacy_analysis_results(c)
        if not c.execute("SELECT 1 FROM notifications LIMIT 1").fetchone():
            first_case = c.execute("SELECT id,patient_id FROM scans ORDER BY created_at LIMIT 1").fetchone()
            c.execute(
                "INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)",
                ("NOTIF-SYSTEM-READY", "system_ready", "Infosys Artery AI is ready", "The local case registry and analysis service are available. Review case status, reports, and model results in the workspace.", first_case["id"] if first_case else None, first_case["patient_id"] if first_case else None, now_iso())
            )

def seed_initial_cases(c):
    print("[Infosys Artery AI] Seeding database with initial high-res clinical cases...")
    manifest_p = DATASET_DIR / "clinical_manifest.csv"
    if manifest_p.exists():
        import pandas as pd
        df = pd.read_csv(manifest_p)
        # Register the full supplied manifest so the registry and dataset views
        # reflect the files delivered with this application.
        selected = df
        for case_index, (_, row) in enumerate(selected.iterrows()):
            cid = row["case_id"]
            pid = row["patient_id"]
            img_fname = row["file_name"]
            img_path = str(IMAGES_DIR / img_fname)
            risks = [r.strip() for r in str(row["risk_factors"]).split(";") if r.strip()]

            c.execute(
                "INSERT OR IGNORE INTO patients(patient_id,age,gender,medical_history,risk_factors_json,created_at) VALUES(?,?,?,?,?,?)",
                (pid, int(row["age"]), row["gender"], f"Clinical evaluation for {row['vessel_segment']}. Plaque: {row['plaque_type']}.", json.dumps(risks), now_iso())
            )
            file_info = {
                "fileName": img_fname,
                "fileSize": "186 KB" if "PATIENT" in img_fname else "24 KB",
                "fileType": "DICOM Angiogram / Image",
                "slices": 512 if "PATIENT" in img_fname else 256,
                "resolution": "512 x 512" if "PATIENT" in img_fname else "256 x 256",
                "uploadedAt": now_iso(),
                "uploadStatus": "Completed",
                "preprocessingStatus": "Verified & Ready for AI Analysis"
            }
            c.execute(
                "INSERT OR IGNORE INTO scans(id,patient_id,modality,anatomical_region,scan_date,clinical_notes,status,model_version,file_info_json,file_path,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (cid, pid, row["modality"], "Coronary Arteries", datetime.now().date().isoformat(), f"Target vessel: {row['vessel_segment']} ({row['parent_vessel']}). Plaque type: {row['plaque_type']}.", "In Progress" if case_index in (2, 4) else "Pending", "Infosys-ArteryNet-v2.4", json.dumps(file_info), img_path, now_iso())
            )

        # Pre-analyze case 0 and case 3 so dashboard shows live completed cases immediately
        for pre_idx in [0, 1, 3]:
            pre_cid = selected.iloc[pre_idx]["case_id"]
            pre_img = str(IMAGES_DIR / selected.iloc[pre_idx]["file_name"])
            if os.path.exists(pre_img):
                try:
                    res = ai_engine_instance.analyze_scan(pre_img, {"case_id": pre_cid})
                    c.execute("UPDATE scans SET status='Completed' WHERE id=?", (pre_cid,))
                    c.execute(
                        '''INSERT OR REPLACE INTO segmentation_results(
                            id, scan_id, dice_score, iou_score, stenosis_detected, severity,
                            narrowing_percentage, ref_diameter_mm, min_diameter_mm, confidence_score,
                            inference_time_ms, recommendations_json, visualizations_json, created_at
                        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                        (
                            f"SEG-{pre_cid}", pre_cid, res["dice_score"], res["iou_score"],
                            None if res["stenosis_detected"] is None else int(res["stenosis_detected"]), res["severity"],
                            res["narrowing_percentage"], res["reference_diameter_mm"], res["min_diameter_mm"],
                            res["confidence_score"], res["inference_time_ms"],
                            json.dumps(res["clinical_recommendations"]),
                            json.dumps({**res["visualizations"], "candidate_regions": res["candidate_regions"], "stenosis_detection_pipeline": res["stenosis_detection_pipeline"], "explainability": res["explainability"], "model_version": res["model_version"], "analysis_pipeline_version": res["analysis_pipeline_version"]}), now_iso()
                        )
                    )
                    c.execute(
                        "INSERT OR IGNORE INTO reports(id,scan_id,status,summary,author,severity,narrowing_percentage,created_at) VALUES(?,?,?,?,?,?,?,?)",
                        (
                            f"REP-{pre_cid}", pre_cid, "Completed",
                            "Image processing completed. Severity and calibrated narrowing are unavailable; clinician review is required.",
                            "Infosys ArteryNet AI Diagnostic System", res["severity"], res["narrowing_percentage"], now_iso()
                        )
                    )
                except Exception as e:
                    print(f"Warning pre-analyzing {pre_cid}: {e}")

        c.execute(
            "INSERT OR IGNORE INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)",
            ("NOTIF-INF-01", "system_ready", "Infosys Artery AI Engine Online", "The local analysis service is ready. Review each case's measured results and model status in the case workspace.", "INF-CAS-0003", "INF-PAT-1003", now_iso())
        )

def refresh_legacy_analysis_results(c):
    """Replace earlier placeholder overlap values and heatmaps for bundled scans."""
    rows = c.execute('''SELECT sr.scan_id,s.file_path,s.model_version,sr.visualizations_json
                        FROM segmentation_results sr JOIN scans s ON s.id=sr.scan_id''').fetchall()
    dataset_images = IMAGES_DIR.resolve()
    for row in rows:
        scan_path = Path(row["file_path"] or "").resolve()
        if not scan_path.is_file() or scan_path.parent != dataset_images:
            continue
        visualization = json_load(row["visualizations_json"], {})
        if visualization.get("analysis_pipeline_version") == "2.8.0-stenosis-candidate-pipeline":
            continue
        try:
            result = ai_engine_instance.analyze_scan(str(scan_path), {"case_id": row["scan_id"]})
            stored_visualizations = {**result["visualizations"], "candidate_regions": result["candidate_regions"], "stenosis_detection_pipeline": result["stenosis_detection_pipeline"], "explainability": result["explainability"], "model_version": result["model_version"], "analysis_pipeline_version": result["analysis_pipeline_version"]}
            c.execute('''UPDATE segmentation_results SET dice_score=?,iou_score=?,stenosis_detected=?,severity=?,narrowing_percentage=?,ref_diameter_mm=?,min_diameter_mm=?,confidence_score=?,inference_time_ms=?,recommendations_json=?,visualizations_json=?,created_at=? WHERE scan_id=?''',
                (result["dice_score"], result["iou_score"], None if result["stenosis_detected"] is None else int(result["stenosis_detected"]), result["severity"], result["narrowing_percentage"], result["reference_diameter_mm"], result["min_diameter_mm"], result["confidence_score"], result["inference_time_ms"], json.dumps(result["clinical_recommendations"]), json.dumps(stored_visualizations), now_iso(), row["scan_id"]))
            c.execute("UPDATE scans SET model_version=?,updated_at=? WHERE id=?", (result["model_version"], now_iso(), row["scan_id"]))
            c.execute("UPDATE reports SET severity=?,narrowing_percentage=?,summary=? WHERE scan_id=?", (result["severity"], result["narrowing_percentage"], "Analysis refreshed. Severity and calibrated narrowing are unavailable; clinician review is required.", row["scan_id"]))
        except Exception as exc:
            print(f"[Infosys Artery AI] Could not refresh legacy analysis for {row['scan_id']}: {exc}")

def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"

def verify_password(password, stored):
    try:
        scheme, salt, digest = stored.split("$", 2)
        return scheme == "pbkdf2_sha256" and hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex(), digest)
    except Exception:
        return False

def make_token(user_id: str):
    expires = int((datetime.now(timezone.utc) + timedelta(hours=24)).timestamp())
    payload = f"{user_id}:{expires}"
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    import base64
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode().rstrip("=")

def token_user(token: str):
    import base64
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode()
        user_id, exp, sig = raw.split(":", 2)
        payload = f"{user_id}:{exp}"
        expected = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected) or int(exp) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return user_id
    except Exception:
        return None

def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    user_id = token_user(authorization.split(" ", 1)[1].strip())
    if not user_id:
        raise HTTPException(401, "Invalid or expired authorization token")
    with connect() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(401, "User not found")
    return rowdict(row)

def user_public(row):
    return {
        "id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"],
        "department": row["department"], "institution": row["institution"], "phone": row["phone"],
        "licenseNumber": row["license_number"], "preferences": json_load(row["preferences_json"], {})
    }

def case_public(row):
    return {
        "id": row["id"], "patientId": row["patient_id"], "age": row["age"], "gender": row["gender"],
        "medicalHistory": row["medical_history"], "riskFactors": json_load(row["risk_factors_json"], []),
        "clinicalNotes": row["clinical_notes"], "modality": row["modality"], "scanDate": row["scan_date"],
        "anatomicalRegion": row["anatomical_region"], "status": row["status"], "modelVersion": row["model_version"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"], "fileInfo": json_load(row["file_info_json"], None)
    }

class LoginBody(BaseModel): email: str; password: str
class RegisterBody(BaseModel): fullName: str; email: str; password: str; role: str = "Patient"; phone: str = ""
class CaseBody(BaseModel):
    patientId: str; age: Optional[int] = None; gender: Optional[str] = "Not Specified"
    medicalHistory: Optional[str] = ""; riskFactors: list[str] = Field(default_factory=list)
    clinicalNotes: Optional[str] = ""; modality: str; scanDate: Optional[str] = None
    anatomicalRegion: str; id: Optional[str] = None
class VideoFrameBody(BaseModel): timeSeconds: float = Field(ge=0, le=3600)
class ProfileBody(BaseModel):
    name: Optional[str] = None; email: Optional[str] = None; department: Optional[str] = None;
    institution: Optional[str] = None; phone: Optional[str] = None; licenseNumber: Optional[str] = None;
    preferences: Optional[dict] = None
class PasswordBody(BaseModel): currentPassword: str; newPassword: str; confirmPassword: str
class AssistantBody(BaseModel): message: str = Field(min_length=1, max_length=1000)
class AppointmentBody(BaseModel): doctorId: str; scheduledAt: str; reason: str = Field(default="", max_length=500)
class ReportApprovalBody(BaseModel): patientEmail: str = Field(min_length=3, max_length=254); doctorComments: str = Field(default="", max_length=5000)
class ReviewAnnotationBody(BaseModel):
    candidateId: str = Field(min_length=1, max_length=100)
    decision: Literal["confirmed", "rejected", "uncertain"]
    comment: str = Field(default="", max_length=2000)
class AppointmentStatusBody(BaseModel): status: str
class PharmacyRecord(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default='', max_length=500)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
class PharmacyBatchBody(BaseModel): pharmacies: list[PharmacyRecord] = Field(max_length=100)
class HospitalRecord(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default='', max_length=500)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
class HospitalBatchBody(BaseModel): hospitals: list[HospitalRecord] = Field(max_length=100)
class MessageBody(BaseModel): recipientId: str = Field(min_length=1, max_length=80); message: str = Field(min_length=1, max_length=2000)
class FeatureEnvironmentBody(BaseModel):
    name: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z][A-Za-z0-9 _-]*$")
class FeatureFlagBody(BaseModel):
    flagKey: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$")
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    owner: str = Field(default="", max_length=120)
class FeatureFlagUpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    owner: Optional[str] = Field(default=None, max_length=120)
class FeatureRuleBody(BaseModel):
    attribute: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z][A-Za-z0-9_.-]*$")
    operator: Literal["equals"] = "equals"
    value: Any
    result: bool = True
class FeatureConfigBody(BaseModel):
    enabled: bool
    rolloutPercent: int = Field(ge=0, le=100)
    defaultValue: bool = False
    rules: list[FeatureRuleBody] = Field(default_factory=list, max_length=50)
class FeatureEvaluationBody(BaseModel):
    flagKey: str = Field(min_length=2, max_length=64)
    environmentId: str = Field(min_length=2, max_length=64)
    subjectId: str = Field(min_length=1, max_length=200)
    attributes: dict[str, Any] = Field(default_factory=dict)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/api/health")
def health():
    try:
        with connect() as c:
            c.execute("SELECT 1").fetchone()
    except sqlite3.Error as exc:
        logger.exception("Readiness database check failed")
        raise HTTPException(503, "Database is not ready") from exc
    return {
        "status": "ok",
        "service": "infosys-artery-ai-backend",
        "organization": "Infosys Healthcare & Life Sciences AI",
        "version": "2.4.0-Local-Validation",
        "time": now_iso(),
        "ai_model": "Infosys-ArteryNet-QCA-Local",
        "model_status": "online" if ai_engine_instance.is_loaded else "standby",
        "segmentation_model": ai_engine_instance.segmentation_model_name,
        "deep_segmentation_loaded": ai_engine_instance.segmentation_model is not None
    }

@app.get("/api/health/live", include_in_schema=False)
def liveness():
    return {"status": "alive", "time": now_iso()}

@app.get("/")
def root():
    return {
    "platform": "Infosys Artery AI — Cardiovascular Imaging Research Platform",
        "version": "2.4.0-local",
        "api_docs": "/docs",
        "health": "/api/health"
    }

# ----------------- AUTHENTICATION -----------------
@app.post("/api/auth/login")
def login(body: LoginBody):
    with connect() as c:
        row = c.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (body.email.strip(),)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"success": True, "token": make_token(row["id"]), "user": user_public(row)}

@app.post("/api/auth/register")
def register(body: RegisterBody):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    allowed_roles = {"Patient", "Radiologist / Clinician", "Medical Researcher", "Data Scientist / ML Engineer"}
    if body.role not in allowed_roles:
        raise HTTPException(400, "Choose Patient or an approved clinical workspace role.")
    uid = "INF-USR-" + secrets.token_hex(3).upper()
    try:
        with connect() as c:
            c.execute(
                "INSERT INTO users(id,name,email,password_hash,role,department,institution,phone,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (uid, body.fullName.strip(), body.email.strip().lower(), password_hash(body.password), body.role, "Cardiovascular AI & Imaging", "Infosys Healthcare AI Lab", body.phone.strip(), now_iso())
            )
            row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists")
    return {"success": True, "message": "Registration complete. Sign in with your new account to continue."}

@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return {"user": user_public(user)}

@app.post("/api/auth/logout")
def logout(user=Depends(current_user)):
    return {"success": True}

def clinical_user(user=Depends(current_user)):
    if str(user["role"]).lower() == "patient":
        raise HTTPException(403, "This clinical workspace is available to clinician accounts.")
    return user

def appointment_public(row):
    return {
        "id": row["id"], "patientId": row["patient_user_id"], "patientName": row["patient_name"],
        "patientEmail": row["patient_email"], "patientPhone": row["patient_phone"],
        "doctorId": row["doctor_user_id"], "doctorName": row["doctor_name"],
        "doctorEmail": row["doctor_email"], "doctorPhone": row["doctor_phone"],
        "scheduledAt": row["scheduled_at"], "reason": row["reason"], "status": row["status"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"]
    }

@app.get("/api/doctors")
def get_doctors(user=Depends(current_user)):
    demo_profiles = {
        "DOCTOR-001": (16, 4.8), "DOCTOR-002": (12, 4.7), "DOCTOR-003": (14, 4.9),
        "DOCTOR-004": (11, 4.6), "DOCTOR-005": (10, 4.8), "DOCTOR-006": (13, 4.7),
        "DOCTOR-007": (9, 4.9), "DOCTOR-008": (15, 4.8), "DOCTOR-009": (10, 4.6),
        "DOCTOR-010": (12, 4.7),
    }
    with connect() as c:
        rows = c.execute("SELECT id,name,email,phone,department,institution FROM users WHERE role='Doctor' ORDER BY name").fetchall()
    care_areas = {
        "Interventional Cardiology": "Heart and circulation concerns",
        "Ophthalmology": "Eye health, vision, and eye conditions",
        "Otolaryngology (ENT)": "Ear, nose, throat, hearing, and sinus concerns",
        "Neurology": "Brain, nerve, headache, and movement concerns",
        "Dermatology": "Skin, hair, and nail concerns",
        "Orthopedics": "Bone, joint, muscle, and injury concerns",
        "Endocrinology": "Diabetes, thyroid, and hormone concerns",
        "Pediatrics": "Health care for children and adolescents",
        "Psychiatry": "Mental health assessment and care",
        "General Practice": "First assessment and general health concerns",
    }
    return [{"id": r["id"], "name": r["name"], "email": r["email"], "phone": r["phone"], "specialty": r["department"], "careAreas": care_areas.get(r["department"], "Specialty care; contact the clinic to confirm fit"), "institution": r["institution"], "experienceYears": demo_profiles.get(r["id"], (0, None))[0], "rating": demo_profiles.get(r["id"], (0, None))[1], "ratingIsDemo": True, "acceptingAppointments": True, "contactIsDemo": True} for r in rows]

@app.get("/api/pharmacies")
def get_pharmacies(lat: Optional[float] = None, lon: Optional[float] = None, radius_km: float = 10, user=Depends(current_user)):
    if (lat is None) != (lon is None):
        raise HTTPException(400, "Provide both latitude and longitude for a nearby pharmacy search.")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "Invalid location coordinates.")
    radius_km = max(1, min(float(radius_km), 50))
    with connect() as c:
        rows = c.execute("SELECT osm_id,name,address,latitude,longitude,source,updated_at FROM pharmacy_directory ORDER BY updated_at DESC LIMIT 5000").fetchall()
    results = []
    for row in rows:
        distance = None
        if lat is not None:
            from math import radians, sin, cos, atan2, sqrt
            dlat, dlon = radians(row["latitude"] - lat), radians(row["longitude"] - lon)
            a = sin(dlat / 2) ** 2 + cos(radians(lat)) * cos(radians(row["latitude"])) * sin(dlon / 2) ** 2
            distance = 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
            if distance > radius_km:
                continue
        results.append({"id": row["osm_id"], "name": row["name"], "address": row["address"], "lat": row["latitude"], "lon": row["longitude"], "source": row["source"], "updatedAt": row["updated_at"], "distance": round(distance, 2) if distance is not None else None})
    if lat is not None:
        results.sort(key=lambda item: item["distance"])
    return {"pharmacies": results[:100], "total": len(results), "source": "OpenStreetMap"}

@app.post("/api/pharmacies/cache")
def cache_pharmacies(body: PharmacyBatchBody, user=Depends(current_user)):
    now = now_iso()
    with connect() as c:
        for pharmacy in body.pharmacies:
            c.execute("""INSERT INTO pharmacy_directory(osm_id,name,address,latitude,longitude,source,updated_at)
                         VALUES(?,?,?,?,?,'OpenStreetMap',?)
                         ON CONFLICT(osm_id) DO UPDATE SET name=excluded.name,address=excluded.address,
                         latitude=excluded.latitude,longitude=excluded.longitude,updated_at=excluded.updated_at""",
                      (pharmacy.id, pharmacy.name, pharmacy.address, pharmacy.lat, pharmacy.lon, now))
    return {"success": True, "stored": len(body.pharmacies), "message": "Public pharmacy listings saved for future searches."}

@app.get("/api/hospitals")
def get_hospitals(lat: Optional[float] = None, lon: Optional[float] = None, radius_km: float = 15, user=Depends(current_user)):
    if (lat is None) != (lon is None):
        raise HTTPException(400, "Provide both latitude and longitude for a nearby hospital search.")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "Invalid location coordinates.")
    radius_km = max(1, min(float(radius_km), 50))
    with connect() as c:
        rows = c.execute("SELECT osm_id,name,address,latitude,longitude,source,updated_at FROM hospital_directory ORDER BY updated_at DESC LIMIT 5000").fetchall()
    results = []
    for row in rows:
        distance = None
        if lat is not None:
            from math import radians, sin, cos, atan2, sqrt
            dlat, dlon = radians(row["latitude"] - lat), radians(row["longitude"] - lon)
            a = sin(dlat / 2) ** 2 + cos(radians(lat)) * cos(radians(row["latitude"])) * sin(dlon / 2) ** 2
            distance = 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
            if distance > radius_km:
                continue
        results.append({"id": row["osm_id"], "name": row["name"], "address": row["address"], "lat": row["latitude"], "lon": row["longitude"], "source": row["source"], "updatedAt": row["updated_at"], "distance": round(distance, 2) if distance is not None else None})
    if lat is not None:
        results.sort(key=lambda item: item["distance"])
    return {"hospitals": results[:100], "total": len(results), "source": "OpenStreetMap"}

@app.post("/api/hospitals/cache")
def cache_hospitals(body: HospitalBatchBody, user=Depends(current_user)):
    now = now_iso()
    with connect() as c:
        for hospital in body.hospitals:
            c.execute("""INSERT INTO hospital_directory(osm_id,name,address,latitude,longitude,source,updated_at)
                         VALUES(?,?,?,?,?,'OpenStreetMap',?)
                         ON CONFLICT(osm_id) DO UPDATE SET name=excluded.name,address=excluded.address,
                         latitude=excluded.latitude,longitude=excluded.longitude,updated_at=excluded.updated_at""",
                      (hospital.id, hospital.name, hospital.address, hospital.lat, hospital.lon, now))
    return {"success": True, "stored": len(body.hospitals), "message": "Public hospital listings saved for future searches."}

def message_public(row):
    return {"id": row["id"], "senderId": row["sender_user_id"], "recipientId": row["recipient_user_id"],
            "senderName": row["sender_name"], "recipientName": row["recipient_name"],
            "message": row["body"], "sentAt": row["sent_at"], "readAt": row["read_at"]}

@app.get("/api/messages")
def get_message_threads(user=Depends(current_user)):
    uid = user["id"]
    with connect() as c:
        rows = c.execute("""SELECT m.*,s.name sender_name,r.name recipient_name FROM messages m
                           JOIN users s ON s.id=m.sender_user_id JOIN users r ON r.id=m.recipient_user_id
                           WHERE m.sender_user_id=? OR m.recipient_user_id=? ORDER BY m.sent_at DESC""", (uid, uid)).fetchall()
    latest = {}
    for row in rows:
        partner_id = row["recipient_user_id"] if row["sender_user_id"] == uid else row["sender_user_id"]
        if partner_id not in latest:
            partner_name = row["recipient_name"] if row["recipient_user_id"] == partner_id else row["sender_name"]
            latest[partner_id] = {"userId": partner_id, "name": partner_name, "lastMessage": row["body"], "sentAt": row["sent_at"], "unread": 0}
        if row["recipient_user_id"] == uid and not row["read_at"]:
            latest[partner_id]["unread"] += 1
    return list(latest.values())

@app.get("/api/messages/{other_user_id}")
def get_message_thread(other_user_id: str, user=Depends(current_user)):
    uid = user["id"]
    with connect() as c:
        other = c.execute("SELECT id,role FROM users WHERE id=?", (other_user_id,)).fetchone()
        if not other:
            raise HTTPException(404, "Message recipient was not found.")
        roles = {str(user["role"]).lower(), str(other["role"]).lower()}
        if roles != {"patient", "doctor"}:
            raise HTTPException(403, "Messages are available between patients and doctors only.")
        if str(user["role"]).lower() == "doctor":
            linked = c.execute("SELECT 1 FROM messages WHERE (sender_user_id=? AND recipient_user_id=?) OR (sender_user_id=? AND recipient_user_id=?) UNION SELECT 1 FROM appointments WHERE patient_user_id=? AND doctor_user_id=? LIMIT 1", (uid, other_user_id, other_user_id, uid, other_user_id, uid)).fetchone()
            if not linked:
                raise HTTPException(403, "Doctors can open a patient's thread after a patient message or appointment request.")
        c.execute("UPDATE messages SET read_at=? WHERE sender_user_id=? AND recipient_user_id=? AND read_at IS NULL", (now_iso(), other_user_id, uid))
        rows = c.execute("""SELECT m.*,s.name sender_name,r.name recipient_name FROM messages m
                           JOIN users s ON s.id=m.sender_user_id JOIN users r ON r.id=m.recipient_user_id
                           WHERE (m.sender_user_id=? AND m.recipient_user_id=?) OR (m.sender_user_id=? AND m.recipient_user_id=?)
                           ORDER BY m.sent_at ASC LIMIT 500""", (uid, other_user_id, other_user_id, uid)).fetchall()
    return [message_public(row) for row in rows]

@app.post("/api/messages")
def send_message(body: MessageBody, user=Depends(current_user)):
    uid = user["id"]
    content = body.message.strip()
    if not content:
        raise HTTPException(400, "Message cannot be empty.")
    with connect() as c:
        recipient = c.execute("SELECT id,role FROM users WHERE id=?", (body.recipientId,)).fetchone()
        if not recipient:
            raise HTTPException(404, "Message recipient was not found.")
        sender_role, recipient_role = str(user["role"]).lower(), str(recipient["role"]).lower()
        if {sender_role, recipient_role} != {"patient", "doctor"}:
            raise HTTPException(403, "Messages are available between patients and doctors only.")
        if sender_role == "doctor":
            linked = c.execute("SELECT 1 FROM messages WHERE (sender_user_id=? AND recipient_user_id=?) OR (sender_user_id=? AND recipient_user_id=?) UNION SELECT 1 FROM appointments WHERE patient_user_id=? AND doctor_user_id=? LIMIT 1", (uid, body.recipientId, body.recipientId, uid, body.recipientId, uid)).fetchone()
            if not linked:
                raise HTTPException(403, "Doctors can reply after the patient sends a message or requests an appointment.")
        message_id, sent_at = "MSG-" + secrets.token_hex(6).upper(), now_iso()
        c.execute("INSERT INTO messages(id,sender_user_id,recipient_user_id,body,sent_at) VALUES(?,?,?,?,?)", (message_id, uid, body.recipientId, content, sent_at))
        row = c.execute("""SELECT m.*,s.name sender_name,r.name recipient_name FROM messages m
                          JOIN users s ON s.id=m.sender_user_id JOIN users r ON r.id=m.recipient_user_id WHERE m.id=?""", (message_id,)).fetchone()
    return message_public(row)

@app.get("/api/appointments")
def get_appointments(user=Depends(current_user)):
    query = '''SELECT a.*, p.name patient_name,p.email patient_email,p.phone patient_phone,
                      d.name doctor_name,d.email doctor_email,d.phone doctor_phone
               FROM appointments a JOIN users p ON p.id=a.patient_user_id
               JOIN users d ON d.id=a.doctor_user_id'''
    role = str(user["role"]).lower()
    with connect() as c:
        if role == "doctor":
            rows = c.execute(query + " WHERE a.doctor_user_id=? ORDER BY a.scheduled_at", (user["id"],)).fetchall()
        elif role == "patient":
            rows = c.execute(query + " WHERE a.patient_user_id=? ORDER BY a.scheduled_at", (user["id"],)).fetchall()
        else:
            rows = c.execute(query + " ORDER BY a.scheduled_at DESC").fetchall()
    return [appointment_public(r) for r in rows]

@app.post("/api/appointments")
def create_appointment(body: AppointmentBody, background_tasks: BackgroundTasks, user=Depends(current_user)):
    if str(user["role"]).lower() != "patient":
        raise HTTPException(403, "Appointment requests must be made from a patient account.")
    try:
        scheduled = datetime.fromisoformat(body.scheduledAt.replace("Z", "+00:00"))
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        scheduled = scheduled.astimezone(timezone.utc)
    except ValueError:
        raise HTTPException(400, "Choose a valid appointment date and time.")
    if scheduled <= datetime.now(timezone.utc):
        raise HTTPException(400, "Appointment time must be in the future.")
    appointment_id = "APT-" + secrets.token_hex(4).upper()
    timestamp, now = scheduled.isoformat(), now_iso()
    with connect() as c:
        doctor = c.execute("SELECT id,name,email FROM users WHERE id=? AND role='Doctor'", (body.doctorId,)).fetchone()
        if not doctor:
            raise HTTPException(404, "The selected doctor is not available.")
        busy = c.execute("SELECT 1 FROM appointments WHERE doctor_user_id=? AND scheduled_at=? AND status IN ('Pending','Confirmed')", (doctor["id"], timestamp)).fetchone()
        if busy:
            raise HTTPException(409, "That appointment time was just booked. Choose another time.")
        c.execute("INSERT INTO appointments(id,patient_user_id,doctor_user_id,scheduled_at,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,'Pending',?,?)", (appointment_id, user["id"], doctor["id"], timestamp, body.reason.strip(), now, now))
        c.execute("INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,NULL,?,0,?)", ("NOTIF-" + secrets.token_hex(4).upper(), "appointment_request", "New appointment request", f"{user['name']} requested an appointment for {timestamp}.", user["id"], now))
    notice = f"Appointment request {appointment_id} for {timestamp} is pending doctor confirmation. Sign in to the Artery Medical portal for details."
    background_tasks.add_task(send_alert_email, doctor["email"], "New appointment request", f"A patient submitted appointment request {appointment_id}. Requested time: {timestamp}. Sign in to the portal to review.")
    background_tasks.add_task(send_alert_email, user["email"], "Appointment request received", notice)
    return {"success": True, "appointmentId": appointment_id, "status": "Pending", "message": "Appointment request sent to the doctor.", "emailAlert": "queued when SMTP is configured"}

@app.patch("/api/appointments/{appointment_id}")
def update_appointment(appointment_id: str, body: AppointmentStatusBody, background_tasks: BackgroundTasks, user=Depends(current_user)):
    requested = body.status.strip().title()
    if requested not in {"Confirmed", "Cancelled", "Completed"}:
        raise HTTPException(400, "Choose Confirmed, Cancelled, or Completed.")
    with connect() as c:
        appointment = c.execute("SELECT * FROM appointments WHERE id=?", (appointment_id,)).fetchone()
        if not appointment:
            raise HTTPException(404, "Appointment not found.")
        role = str(user["role"]).lower()
        is_doctor = role == "doctor" and appointment["doctor_user_id"] == user["id"]
        is_patient_cancel = role == "patient" and appointment["patient_user_id"] == user["id"] and requested == "Cancelled" and appointment["status"] == "Pending"
        if not (is_doctor or is_patient_cancel):
            raise HTTPException(403, "You cannot update this appointment.")
        allowed_transitions = {"Pending": {"Confirmed", "Cancelled"}, "Confirmed": {"Completed", "Cancelled"}}
        if is_doctor and requested not in allowed_transitions.get(appointment["status"], set()):
            raise HTTPException(409, f"An appointment in {appointment['status']} status cannot be changed to {requested}.")
        now = now_iso()
        c.execute("UPDATE appointments SET status=?,updated_at=? WHERE id=?", (requested, now, appointment_id))
        recipient = appointment["patient_user_id"] if is_doctor else appointment["doctor_user_id"]
        recipient_email = c.execute("SELECT email FROM users WHERE id=?", (recipient,)).fetchone()["email"]
        c.execute("INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,NULL,?,0,?)", ("NOTIF-" + secrets.token_hex(4).upper(), "appointment_update", f"Appointment {requested.lower()}", f"Appointment {appointment_id} is now {requested.lower()}.", recipient, now))
    background_tasks.add_task(send_alert_email, recipient_email, f"Appointment {requested.lower()}", f"Appointment request {appointment_id} is now {requested.lower()}. Sign in to the Artery Medical portal for details.")
    return {"success": True, "status": requested, "emailAlert": "queued when SMTP is configured"}

# ----------------- CASE MANAGEMENT -----------------
@app.get("/api/cases")
def get_cases(search: str = "", modality: str = "all", status: str = "all", region: str = "all", user=Depends(clinical_user)):
    query = "SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE 1=1"
    args = []
    if search:
        query += " AND (lower(s.id) LIKE ? OR lower(s.patient_id) LIKE ? OR lower(s.anatomical_region) LIKE ? OR lower(s.modality) LIKE ?)"
        q = f"%{search.lower().strip()}%"
        args += [q, q, q, q]
    if modality and modality != "all":
        query += " AND s.modality LIKE ?"
        args.append(f"%{modality}%")
    if status and status != "all":
        query += " AND s.status=?"
        args.append(status)
    if region and region != "all":
        query += " AND s.anatomical_region=?"
        args.append(region)
    query += " ORDER BY s.created_at DESC"
    with connect() as c:
        rows = c.execute(query, args).fetchall()
    cases = [case_public(r) for r in rows]
    return {"total": len(cases), "cases": cases}

@app.post("/api/cases")
def create_case(body: CaseBody, user=Depends(clinical_user)):
    case_id = body.id.strip() if body.id else "INF-CAS-" + datetime.now().strftime("%Y%m%d") + "-" + secrets.token_hex(2).upper()
    patient_id = body.patientId.strip().upper()
    with connect() as c:
        if c.execute("SELECT 1 FROM scans WHERE id=?", (case_id,)).fetchone():
            raise HTTPException(409, "Case ID already exists")
        c.execute(
            "INSERT INTO patients(patient_id,age,gender,medical_history,risk_factors_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(patient_id) DO UPDATE SET age=excluded.age,gender=excluded.gender,medical_history=excluded.medical_history,risk_factors_json=excluded.risk_factors_json",
            (patient_id, body.age, body.gender or "Not Specified", body.medicalHistory or "", json.dumps(body.riskFactors), now_iso())
        )
        c.execute(
            "INSERT INTO scans(id,patient_id,modality,anatomical_region,scan_date,clinical_notes,status,model_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (case_id, patient_id, body.modality, body.anatomicalRegion, body.scanDate or datetime.now().date().isoformat(), body.clinicalNotes or "", "Pending", "Infosys-ArteryNet-v2.4", now_iso())
        )
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"], "create_case", "scan", case_id, now_iso()))
        c.execute(
            "INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)",
            ("NOTIF-" + secrets.token_hex(4).upper(), "case_uploaded", "New case ready for review", f"Case {case_id} was created for patient {patient_id}. Upload an angiography image to begin review.", case_id, patient_id, now_iso()),
        )
        row = c.execute("SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE s.id=?", (case_id,)).fetchone()
    return case_public(row)

@app.get("/api/cases/{case_id}")
def get_case(case_id: str, user=Depends(clinical_user)):
    with connect() as c:
        row = c.execute("SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE s.id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Case not found")
    return case_public(row)

@app.get("/api/arcade/cases/{case_id}")
def get_arcade_case(case_id: str, user=Depends(clinical_user)):
    return arcade_case_public(arcade_case(case_id))

@app.get("/api/cadica/cases/{case_id}")
def get_cadica_case(case_id: str, user=Depends(clinical_user)):
    return cadica_case_public(cadica_case(case_id))

def run_cadica_analysis(case_id):
    record = cadica_case(case_id)
    annotations = cadica_reference_annotations(record)
    quality_check = image_quality_result(record["imagePath"])
    if not quality_check["passed"]:
        issue = quality_check["reason"]
        visualizations = {}
        if annotations and quality_check["status"] != "Error":
            visualizations["cadica_reference_boxes_b64"] = cadica_reference_overlay(record["imagePath"], annotations)
        return {
            "analyzed": False,
            "status": "Image Quality Check Failed",
            "message": issue,
            "scan_quality_status": "Failed; model inference was blocked before execution.",
            "quality_recommendation": quality_recommendation(quality_check),
            "quality_check": quality_check,
            "model_status": "No AI predictions were generated because the image-quality check failed.",
            "analysis_warning": issue,
            "visualizations": visualizations,
            "candidate_regions": [],
            "stenosis_detection_pipeline": {
                "status": "blocked_by_quality_check",
                "method": "Quality gate prevented model inference",
                "segmentation_valid": None,
                "candidate_count": None,
                "candidate_ids": None,
                "clinical_stenosis_confirmed": None,
                "warning": issue,
                "cadica_localizer": {
                    "status": "blocked_by_quality_check",
                    "candidate_count": None,
                    "model_version": None,
                },
            },
            "cadica_detector_status": "Blocked by image quality check; inference was not run.",
            "cadica_detector_predictions": None,
            "cadica_reference_annotations": annotations,
            "explainability": {
                "cadica_reference_note": "CADICA ground-truth lesion boxes are dataset annotations, not AI predictions."
            } if annotations else {},
        }
    result = ai_engine_instance.analyze_scan(str(record["imagePath"]), {"case_id": case_id})
    result["analyzed"] = True
    result["quality_check"] = quality_check
    detector_result = ai_engine_instance.analyze_cadica_lesions(record["imagePath"])
    if detector_result is None:
        result["cadica_detector_status"] = "No trained CADICA lesion localizer is loaded."
        result["cadica_detector_predictions"] = None
        result["stenosis_detection_pipeline"]["cadica_localizer"] = {
            "status": "model_not_loaded",
            "candidate_count": None,
            "model_version": None,
        }
    else:
        predictions = detector_result["predictions"]
        result["cadica_detector_status"] = "Research-only CADICA lesion localization completed." if predictions else "CADICA lesion localizer ran; no candidate boxes were returned."
        result["cadica_detector_predictions"] = predictions
        result["cadica_detector_model_version"] = f"CADICA-LesionBox-{ai_engine_instance.cadica_detector_version}"
        result["stenosis_detection_pipeline"]["cadica_localizer"] = {
            "status": "research_candidates_proposed" if predictions else "no_candidate_proposed",
            "candidate_count": len(predictions),
            "model_version": result["cadica_detector_model_version"],
        }
        if detector_result["gradcam_b64"]:
            result["visualizations"]["cadica_detector_gradcam_b64"] = detector_result["gradcam_b64"]
        overlay = cadica_prediction_overlay(record["imagePath"], predictions)
        if overlay:
            result["visualizations"]["cadica_detector_overlay_b64"] = overlay
        result["explainability"]["cadica_detector_method"] = "Grad-CAM for the CADICA lesion localizer's highest-scoring objectness output."
    if annotations:
        result["visualizations"]["cadica_reference_boxes_b64"] = cadica_reference_overlay(record["imagePath"], annotations)
        result["cadica_reference_annotations"] = annotations
        result["explainability"]["cadica_reference_note"] = "CADICA ground-truth lesion bounding boxes; reference annotations, not model predictions."
    previous_warning = result.get("analysis_warning", "")
    transfer_note = "CADICA research sample. The segmentation model was trained on ARCade, not CADICA; this is an unvalidated cross-dataset research output."
    result["analysis_warning"] = f"{transfer_note} {previous_warning}".strip()
    result["scan_quality_status"] = "CADICA sample passed technical readability checks; model transfer is not clinically validated."
    return result

@app.post("/api/cadica/cases/{case_id}/analyze")
def analyze_cadica_case(case_id: str, user=Depends(clinical_user)):
    analysis = run_cadica_analysis(case_id)
    return {"success": analysis.get("analyzed") is True, "analysis": analysis}

@app.post("/api/cadica/cases/{case_id}/denoise-preview")
def create_cadica_denoising_preview(case_id: str, user=Depends(clinical_user)):
    record = cadica_case(case_id)
    try:
        preview = ai_engine_instance.create_denoised_preview(record["imagePath"])
    except (OSError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "caseId": case_id,
        **preview,
        "message": f"{preview['method']}. CADICA research frame preview only; not a diagnostic result.",
    }

@app.patch("/api/cases/{case_id}")
def update_case(case_id: str, updates: dict[str, Any], user=Depends(clinical_user)):
    mapping = {"status": "status", "modelVersion": "model_version", "clinicalNotes": "clinical_notes", "scanDate": "scan_date", "anatomicalRegion": "anatomical_region", "modality": "modality"}
    allowed = {mapping[k]: v for k, v in updates.items() if k in mapping}
    if not allowed:
        raise HTTPException(400, "No supported fields to update")
    allowed["updated_at"] = now_iso()
    with connect() as c:
        if not c.execute("SELECT 1 FROM scans WHERE id=?", (case_id,)).fetchone():
            raise HTTPException(404, "Case not found")
        c.execute("UPDATE scans SET " + ",".join(f"{k}=?" for k in allowed) + " WHERE id=?", [*allowed.values(), case_id])
        row = c.execute("SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE s.id=?", (case_id,)).fetchone()
    return case_public(row)

# ----------------- SCAN UPLOAD -----------------
@app.post("/api/cases/{case_id}/upload")
async def upload_medical_image(case_id: str, file: UploadFile = File(...), user=Depends(clinical_user)):
    name = Path(file.filename or "upload").name
    low = name.lower()
    if not any(low.endswith(ext) for ext in ALLOWED_EXTS):
        raise HTTPException(415, "Unsupported medical image format. Supported: .dcm, .nii, .png, .jpg")
    with connect() as c:
        row = c.execute("SELECT * FROM scans WHERE id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Case not found")
    case_dir = UPLOAD_DIR / re.sub(r"[^A-Za-z0-9_-]", "_", case_id)
    case_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    dest = case_dir / (secrets.token_hex(4) + "_" + safe_name)
    total = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "File exceeds 300 MB limit")
                out.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    is_video = low.endswith(VIDEO_EXTS)
    quality_check = {"status": "Frame review required", "passed": False, "reason": "Select a frame to run image-quality checks and AI analysis."} if is_video else image_quality_result(dest)
    quality_issue = None if is_video else quality_check["reason"]

    size_mb = total / (1024 * 1024)
    file_type = "Angiography Video" if is_video else "NIfTI (.nii.gz)" if low.endswith((".nii.gz", ".nii")) else "DICOM (.dcm)" if low.endswith(".dcm") else "Angiogram Image"
    dicom_metadata = None
    if low.endswith(".dcm"):
        try:
            import pydicom
            ds = pydicom.dcmread(dest, stop_before_pixels=True)
            dicom_metadata = {"rows": int(ds.Rows) if getattr(ds, "Rows", None) else None,
                "columns": int(ds.Columns) if getattr(ds, "Columns", None) else None,
                "frames": int(getattr(ds, "NumberOfFrames", 1)),
                "samplesPerPixel": int(getattr(ds, "SamplesPerPixel", 1)),
                "photometricInterpretation": str(getattr(ds, "PhotometricInterpretation", "Unknown"))}
        except Exception:
            dicom_metadata = {"frames": 1, "metadataStatus": "Header metadata unavailable"}
    info = {
        "fileName": name,
        "fileSize": f"{size_mb:.2f} MB",
        "fileType": file_type,
        "uploadedAt": now_iso(),
        "uploadStatus": "Quality Check Failed" if quality_issue else "Completed",
        "preprocessingStatus": "Video saved; selected-frame analysis available" if is_video else "Original preserved; AI analysis blocked" if quality_issue else "Verified; Ready for AI Inference",
        "mediaKind": "video" if is_video else "dicom" if low.endswith(".dcm") else "image",
        "dicomMetadata": dicom_metadata,
        "storedFileName": dest.name,
        "bytes": total,
        "qualityCheck": quality_check,
    }
    scan_status = "Video Ready for Frame Analysis" if is_video else "Image Quality Check Failed" if quality_issue else "Ready for Analysis"
    with connect() as c:
        c.execute("DELETE FROM segmentation_results WHERE scan_id=?", (case_id,))
        c.execute("UPDATE reports SET status='Superseded' WHERE scan_id=?", (case_id,))
        c.execute("UPDATE scans SET file_info_json=?,file_path=?,status=?,updated_at=? WHERE id=?", (json.dumps(info), str(dest), scan_status, now_iso(), case_id))
        c.execute("INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)",
                  ("NOTIF-" + secrets.token_hex(4).upper(), "upload_completed", "Scan Uploaded" if not quality_issue else "Scan Quality Check Failed", f"Original scan {name} is preserved for review. " + (f"Analysis was blocked: {quality_issue}" if quality_issue else "Click 'Run AI Analysis' to initiate."), case_id, row["patient_id"], now_iso()))
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"], "upload_scan", "scan", case_id, now_iso()))
    if quality_issue:
        raise HTTPException(422, quality_issue)
    return {"success": True, "fileInfo": info, "qualityCheck": quality_check, "message": "Video uploaded. Choose a timestamp in the viewer to analyze a frame." if is_video else "Medical scan uploaded and ready for automated AI analysis."}

# ----------------- AI INFERENCE PIPELINE -----------------
def persist_analysis_result(case_id, scan_row, analysis_res, user, job_message=None):
    job_id = "JOB-" + secrets.token_hex(4).upper()
    seg_id = "SEG-" + case_id
    report_id = "REP-" + case_id
    visuals = {
        **analysis_res["visualizations"],
        "candidate_regions": analysis_res["candidate_regions"],
        "stenosis_detection_pipeline": analysis_res["stenosis_detection_pipeline"],
        "explainability": analysis_res["explainability"],
        "model_version": analysis_res["model_version"],
        "model_status": analysis_res["model_status"],
        "scan_quality_status": analysis_res["scan_quality_status"],
        "quality_check": analysis_res["quality_check"],
        "analysis_warning": analysis_res.get("analysis_warning", ""),
        "analysis_pipeline_version": analysis_res["analysis_pipeline_version"],
        "input_preprocessing": analysis_res["input_preprocessing"],
    }
    if analysis_res.get("video_frame"):
        visuals["video_frame"] = analysis_res["video_frame"]
    with connect() as c:
        c.execute(
            "INSERT INTO analysis_jobs(id,scan_id,model_version,status,message,created_at,completed_at) VALUES(?,?,?,?,?,?,?)",
            (job_id, case_id, analysis_res["model_version"], "Completed", job_message or "Automated QCA and vessel segmentation completed successfully.", now_iso(), now_iso())
        )
        c.execute(
            '''INSERT OR REPLACE INTO segmentation_results(
                id, job_id, scan_id, dice_score, iou_score, stenosis_detected, severity,
                narrowing_percentage, ref_diameter_mm, min_diameter_mm, confidence_score,
                inference_time_ms, recommendations_json, visualizations_json, created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (seg_id, job_id, case_id, analysis_res["dice_score"], analysis_res["iou_score"],
             None if analysis_res["stenosis_detected"] is None else int(analysis_res["stenosis_detected"]),
             analysis_res["severity"], analysis_res["narrowing_percentage"],
             analysis_res["reference_diameter_mm"], analysis_res["min_diameter_mm"],
             analysis_res["confidence_score"], analysis_res["inference_time_ms"],
             json.dumps(analysis_res["clinical_recommendations"]), json.dumps(visuals), now_iso())
        )
        c.execute("UPDATE scans SET status='Completed',model_version=?,updated_at=? WHERE id=?", (analysis_res["model_version"], now_iso(), case_id))
        frame_note = f" Video frame at {analysis_res['video_frame']['time_seconds']:.2f}s was analyzed." if analysis_res.get("video_frame") else ""
        summary = (f"Research-only QCA candidate analysis completed for {case_id}: {len(analysis_res['candidate_regions'])} candidate region(s) proposed. " if analysis_res["candidate_regions"] else f"No QCA candidate region was proposed for {case_id}. ") + f"This is not a confirmed stenosis diagnosis; clinician review is required.{frame_note}"
        c.execute(
            '''INSERT OR REPLACE INTO reports(id,scan_id,status,summary,author,severity,narrowing_percentage,reviewed_by,doctor_comments,patient_user_id,approved_at,created_at)
               VALUES(?,?, 'Pending Review',?,?,?,?,'','',NULL,NULL,?)''',
            (report_id, case_id, summary, "Infosys ArteryNet AI Diagnostic System", analysis_res["severity"], analysis_res["narrowing_percentage"], now_iso())
        )
        c.execute(
            "INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)",
            ("NOTIF-" + secrets.token_hex(4).upper(), "analysis_completed", "Automated artery analysis completed", summary, case_id, scan_row["patient_id"], now_iso())
        )
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"], "run_ai_analysis", "scan", case_id, now_iso()))


@app.post("/api/cases/{case_id}/analyze")
def run_ai_analysis(case_id: str, user=Depends(clinical_user)):
    with connect() as c:
        row = c.execute("SELECT * FROM scans WHERE id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Case not found")

    scan_file_path = locate_case_image(row, case_id)

    if not scan_file_path:
        raise HTTPException(400, "No valid scan file found on disk for this case. Please upload a scan first.")
    if scan_file_path.suffix.lower() in VIDEO_EXTS:
        raise HTTPException(415, "Choose a timestamp in the video viewer and use Analyze current frame.")
    quality_check = image_quality_result(scan_file_path)
    if not quality_check["passed"]:
        raise HTTPException(422, quality_check["reason"])

    # Execute end-to-end AI Analysis
    analysis_res = ai_engine_instance.analyze_scan(scan_file_path, {"case_id": case_id})
    analysis_res["quality_check"] = quality_check

    persist_analysis_result(case_id, row, analysis_res, user)

    return {
        "success": True,
        "caseId": case_id,
        "analysis": analysis_res
    }


@app.post("/api/cases/{case_id}/analyze-video-frame")
def analyze_video_frame(case_id: str, body: VideoFrameBody, user=Depends(clinical_user)):
    with connect() as c:
        row = c.execute("SELECT * FROM scans WHERE id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Case not found")
    video_path = locate_case_image(row, case_id)
    if not video_path or video_path.suffix.lower() not in VIDEO_EXTS:
        raise HTTPException(415, "This case does not have a supported angiography video.")

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        raise HTTPException(422, "Could not decode this video. Try an MP4 encoded with H.264 or upload a still frame.")
    temp_path = None
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if fps <= 0 or frame_count <= 0:
            raise HTTPException(422, "Video frame rate or duration could not be read.")
        duration = frame_count / fps
        if body.timeSeconds >= duration:
            raise HTTPException(422, f"Requested time is beyond the video duration ({duration:.2f} seconds).")
        frame_index = min(frame_count - 1, max(0, int(round(body.timeSeconds * fps))))
        capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = capture.read()
        if not ok or frame is None:
            raise HTTPException(422, "Could not extract a frame at this time. Choose a nearby timestamp.")
    finally:
        capture.release()

    try:
        with tempfile.NamedTemporaryFile(prefix="artery-video-frame-", suffix=".png", dir="/tmp", delete=False) as temp_file:
            temp_path = Path(temp_file.name)
        if not cv2.imwrite(str(temp_path), frame):
            raise HTTPException(500, "Could not prepare the selected video frame for analysis.")
        quality_check = image_quality_result(temp_path)
        if not quality_check["passed"]:
            raise HTTPException(422, quality_check["reason"])
        analysis_res = ai_engine_instance.analyze_scan(temp_path, {"case_id": case_id, "video_frame": frame_index})
        analysis_res["quality_check"] = quality_check
        analysis_res["video_frame"] = {
            "time_seconds": round(frame_index / fps, 3),
            "frame_index": frame_index,
            "frame_count": frame_count,
            "fps": round(fps, 3),
            "duration_seconds": round(duration, 3),
        }
        persist_analysis_result(
            case_id, row, analysis_res, user,
            job_message=f"Automated artery analysis completed for video frame {frame_index} at {frame_index / fps:.2f} seconds."
        )
        return {"success": True, "caseId": case_id, "analysis": analysis_res}
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)

@app.post("/api/cases/{case_id}/denoise-preview")
def create_case_denoising_preview(case_id: str, user=Depends(clinical_user)):
    with connect() as c:
        scan = c.execute("SELECT * FROM scans WHERE id=?", (case_id,)).fetchone()
    if not scan:
        raise HTTPException(404, "Case not found.")
    image_path = locate_case_image(scan, case_id)
    if not image_path:
        raise HTTPException(404, "No readable scan file is linked to this case.")
    try:
        preview = ai_engine_instance.create_denoised_preview(image_path)
    except (OSError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "caseId": case_id,
        **preview,
        "message": f"{preview['method']}. Preview only; the original scan is unchanged and the output does not validate or repair a clinical scan.",
    }

@app.post("/api/arcade/cases/{case_id}/analyze")
def analyze_arcade_case(case_id: str, user=Depends(clinical_user)):
    return {"success": True, "analysis": run_arcade_analysis(case_id)}

@app.post("/api/arcade/cases/{case_id}/denoise-preview")
def create_arcade_denoising_preview(case_id: str, user=Depends(clinical_user)):
    record = arcade_case(case_id)
    image_path = arcade_index()["image_paths"].get(record["fileName"])
    if not image_path:
        raise HTTPException(404, "ARCade image file was not found.")
    try:
        preview = ai_engine_instance.create_denoised_preview(image_path)
    except (OSError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "caseId": case_id,
        **preview,
        "message": f"{preview['method']}. Preview only; the original research image is unchanged and the output is not calibrated for diagnosis.",
    }

@app.post("/api/cases/{case_id}/approve-report")
def approve_case_report(case_id: str, body: ReportApprovalBody, background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    if str(user["role"]).lower() not in {"doctor", "radiologist / clinician", "clinical radiologist"}:
        raise HTTPException(403, "Only an authorized doctor or clinician can approve patient reports.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", body.patientEmail.strip()):
        raise HTTPException(422, "Enter a valid patient account email address.")
    with connect() as c:
        patient = c.execute("SELECT id,name,email FROM users WHERE lower(email)=lower(?) AND role='Patient'", (str(body.patientEmail),)).fetchone()
        report = c.execute("SELECT r.id,r.scan_id,s.patient_id,s.status,s.file_path,s.file_info_json,sr.visualizations_json FROM reports r JOIN scans s ON s.id=r.scan_id LEFT JOIN segmentation_results sr ON sr.scan_id=s.id WHERE r.scan_id=? ORDER BY sr.created_at DESC LIMIT 1", (case_id,)).fetchone()
        result = c.execute("SELECT id FROM segmentation_results WHERE scan_id=? ORDER BY created_at DESC LIMIT 1", (case_id,)).fetchone()
        if not report:
            raise HTTPException(404, "No saved AI analysis report exists for this case.")
        image_path = locate_case_image(report, case_id)
        is_video = bool(image_path and image_path.suffix.lower() in VIDEO_EXTS)
        saved_visuals = json_load(report["visualizations_json"], {})
        video_quality = saved_visuals.get("quality_check") or {}
        if is_video and not saved_visuals.get("video_frame"):
            raise HTTPException(409, "Analyze a selected video frame before requesting report approval.")
        if (not image_path or (is_video and not video_quality.get("passed")) or
                (not is_video and image_quality_issue(image_path))):
            raise HTTPException(422, "This scan did not pass image-quality validation. The report cannot be approved or released.")
        if not result:
            raise HTTPException(409, "Run and save an AI analysis before requesting report approval.")
        if not patient:
            raise HTTPException(404, "No registered patient account matches that email. Verify the patient's account first.")
        assigned = c.execute("SELECT 1 FROM appointments WHERE patient_user_id=? AND doctor_user_id=? AND status IN ('Pending','Confirmed','Completed') LIMIT 1", (patient["id"], user["id"])).fetchone()
        if not assigned:
            raise HTTPException(403, "Report release requires an appointment relationship between this patient and doctor.")
        now = now_iso()
        c.execute("UPDATE reports SET status='Approved',author=?,reviewed_by=?,doctor_comments=?,patient_user_id=?,approved_at=? WHERE id=?", (user["name"], user["id"], body.doctorComments.strip(), patient["id"], now, report["id"]))
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"], "approve_patient_report", "report", report["id"], now))
        c.execute("INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)", ("NOTIF-" + secrets.token_hex(4).upper(), "report_approved", "Doctor-approved angiography report", f"A coronary angiography report for case {case_id} is now available in your Medical Reports.", case_id, patient["id"], now))
    background_tasks.add_task(send_alert_email, patient["email"], "A doctor-approved report is available", f"A report for case {case_id} has been approved. Sign in to your patient portal to view it or contact your clinic with questions.")
    return {"success": True, "reportId": report["id"], "status": "Approved", "patientName": patient["name"], "approvedAt": now, "emailAlert": "queued when SMTP is configured"}

@app.get("/api/cases/{case_id}/review-annotations")
def get_review_annotations(case_id: str, user=Depends(clinical_user)):
    with connect() as c:
        if not c.execute("SELECT 1 FROM scans WHERE id=?", (case_id,)).fetchone():
            raise HTTPException(404, "Case not found")
        rows = c.execute('''SELECT a.id,a.candidate_id,a.decision,a.comment,a.created_at,a.updated_at,u.name author
            FROM review_annotations a JOIN users u ON u.id=a.author_id
            WHERE a.scan_id=? ORDER BY a.updated_at DESC''', (case_id,)).fetchall()
    return [dict(row) for row in rows]

@app.put("/api/cases/{case_id}/review-annotations")
def save_review_annotation(case_id: str, body: ReviewAnnotationBody, user=Depends(clinical_user)):
    now = now_iso()
    annotation_id = "ANN-" + hashlib.sha256(f"{case_id}:{user['id']}:{body.candidateId}".encode()).hexdigest()[:12].upper()
    with connect() as c:
        if not c.execute("SELECT 1 FROM scans WHERE id=?", (case_id,)).fetchone():
            raise HTTPException(404, "Case not found")
        c.execute('''INSERT INTO review_annotations(id,scan_id,author_id,candidate_id,decision,comment,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scan_id,author_id,candidate_id) DO UPDATE SET
            decision=excluded.decision,comment=excluded.comment,updated_at=excluded.updated_at''',
            (annotation_id, case_id, user["id"], body.candidateId, body.decision, body.comment.strip(), now, now))
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
            (user["id"], "save_review_annotation", "scan", case_id, now))
    return {"success": True, "candidateId": body.candidateId, "decision": body.decision, "updatedAt": now}

@app.get("/api/patient/reports")
def get_patient_reports(user=Depends(current_user)):
    if str(user["role"]).lower() != "patient":
        raise HTTPException(403, "This endpoint is for patient accounts.")
    with connect() as c:
        rows = c.execute('''SELECT r.*,s.patient_id,s.modality,s.anatomical_region,s.scan_date,s.file_info_json,s.file_path,
            doc.name doctor_name,doc.email doctor_email,doc.phone doctor_phone,doc.department doctor_specialty,
            sr.visualizations_json,sr.severity ai_severity,sr.narrowing_percentage ai_narrowing,
            sr.ref_diameter_mm,sr.min_diameter_mm,sr.confidence_score,
            sr.dice_score AS analysis_dice,sr.iou_score AS analysis_iou,sr.inference_time_ms AS analysis_inference_time_ms,
            sr.created_at AS analysis_created_at
            FROM reports r JOIN scans s ON s.id=r.scan_id
            LEFT JOIN users doc ON doc.id=r.reviewed_by
            LEFT JOIN segmentation_results sr ON sr.id=(
                SELECT latest.id FROM segmentation_results latest
                WHERE latest.scan_id=s.id ORDER BY latest.created_at DESC LIMIT 1
            )
            WHERE r.status='Approved' AND r.patient_user_id=? ORDER BY r.approved_at DESC''', (user["id"],)).fetchall()
        now = now_iso()
        for row in rows:
            c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                (user["id"], "view_patient_report", "report", row["id"], now))
    reports = []
    for row in rows:
        image_path = locate_case_image(row, row["scan_id"])
        visuals = json_load(row["visualizations_json"], {})
        is_video = bool(image_path and image_path.suffix.lower() in VIDEO_EXTS)
        if not image_path or (is_video and not visuals.get("video_frame")) or (not is_video and image_quality_issue(image_path)):
            continue
        info = json_load(row["file_info_json"], {})
        reports.append({"id": row["id"], "caseId": row["scan_id"], "patientId": row["patient_id"], "date": row["scan_date"], "reportDate": row["approved_at"], "modality": row["modality"], "region": row["anatomical_region"], "summary": row["summary"], "severity": row["ai_severity"] or row["severity"], "narrowingPercentage": row["ai_narrowing"], "referenceDiameterMm": row["ref_diameter_mm"], "minDiameterMm": row["min_diameter_mm"], "confidence": row["confidence_score"], "doctorName": row["doctor_name"] or row["author"], "doctorEmail": row["doctor_email"], "doctorPhone": row["doctor_phone"], "doctorSpecialty": row["doctor_specialty"], "doctorComments": row["doctor_comments"], "visualizations": {key: visuals.get(key) for key in ("original_b64", "mask_overlay_b64", "stenosis_overlay_b64")}, "fileName": info.get("fileName"), "analysisDate": row["analysis_created_at"], "analysisModel": visuals.get("model_version"), "analysisMetrics": {"dice": row["analysis_dice"], "iou": row["analysis_iou"], "inferenceTimeMs": row["analysis_inference_time_ms"]}})
    return reports

@app.get("/api/cases/{case_id}/analysis")
def get_case_analysis(case_id: str, user=Depends(clinical_user)):
    with connect() as c:
        scan = c.execute("SELECT file_path,file_info_json FROM scans WHERE id=?", (case_id,)).fetchone()
        if not scan:
            raise HTTPException(404, "Case not found")
        scan_path = locate_case_image(scan, case_id)
        quality_check = None
        if scan_path and scan_path.suffix.lower() not in VIDEO_EXTS:
            quality_check = image_quality_result(scan_path)
            if not quality_check["passed"]:
                return {
                    "caseId": case_id,
                    "analyzed": False,
                    "status": "Image Quality Check Failed",
                    "message": quality_check["reason"],
                    "scan_quality_status": quality_check["status"],
                    "quality_check": quality_check,
                    "quality_recommendation": quality_recommendation(quality_check),
                }
        row = c.execute("SELECT * FROM segmentation_results WHERE scan_id=? ORDER BY created_at DESC LIMIT 1", (case_id,)).fetchone()
        if row:
            report_row = c.execute("SELECT id FROM reports WHERE scan_id=? ORDER BY created_at DESC LIMIT 1", (case_id,)).fetchone()
            if report_row:
                c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                    (user["id"], "view_report_detail", "report", report_row["id"], now_iso()))
    if not row:
        return {
            "caseId": case_id,
            "analyzed": False,
            "status": "Pending",
            "message": "AI analysis has not been executed yet for this case. Click 'Run AI Diagnostic Analysis' to process.",
            "scan_quality_status": quality_check["status"] if quality_check else "Not checked",
            "quality_check": quality_check,
        }

    saved_visuals = json_load(row["visualizations_json"], {})
    if saved_visuals.get("analysis_pipeline_version") != "2.8.0-stenosis-candidate-pipeline":
        return {"caseId": case_id, "analyzed": False, "status": "Reanalysis Required", "message": "This saved result predates the current evidence and calibration safeguards. Re-run analysis to refresh it."}

    return {
        "caseId": case_id,
        "analyzed": True,
        "status": "Completed",
        "model_version": saved_visuals.get("model_version", "Infosys-ArteryNet-QCA-v3"),
        "model_status": saved_visuals.get("model_status", "Model status unavailable for this saved analysis."),
        "analysis_warning": saved_visuals.get("analysis_warning", ""),
        "scan_quality_status": saved_visuals.get("scan_quality_status", "Scan readability status unavailable; run analysis again."),
        "quality_check": saved_visuals.get("quality_check", quality_check),
        "stenosis_detected": None if row["stenosis_detected"] is None else bool(row["stenosis_detected"]),
        "severity": row["severity"],
        "narrowing_percentage": row["narrowing_percentage"],
        "reference_diameter_mm": row["ref_diameter_mm"],
        "min_diameter_mm": row["min_diameter_mm"],
        "dice_score": row["dice_score"],
        "iou_score": row["iou_score"],
        "confidence_score": row["confidence_score"],
        "inference_time_ms": row["inference_time_ms"],
        "clinical_recommendations": json_load(row["recommendations_json"], {}),
        "visualizations": saved_visuals,
        "candidate_regions": saved_visuals.get("candidate_regions", []),
        "stenosis_detection_pipeline": saved_visuals.get("stenosis_detection_pipeline"),
        "explainability": saved_visuals.get("explainability", {}),
        "analyzed_at": row["created_at"]
    }

@app.get("/api/arcade/cases/{case_id}/analysis")
def get_arcade_case_analysis(case_id: str, user=Depends(clinical_user)):
    return {
        "caseId": case_id,
        "analyzed": True,
        "status": "ARCade research sample",
        **run_arcade_analysis(case_id),
    }

@app.get("/api/cadica/cases/{case_id}/analysis")
def get_cadica_case_analysis(case_id: str, user=Depends(clinical_user)):
    return {
        "caseId": case_id,
        "analyzed": True,
        "status": "CADICA cross-dataset research sample",
        **run_cadica_analysis(case_id),
    }

# ----------------- MODEL BENCHMARKS & METRICS -----------------
@app.get("/api/model/status")
def model_status(user=Depends(clinical_user)):
    test_rep_p = TRAINING_DIR / "test_report.json"
    train_rep_p = TRAINING_DIR / "training_report.json"
    
    test_metrics = {}
    if test_rep_p.exists():
        test_metrics = json_load(test_rep_p.read_text(encoding="utf-8"), {})
    
    train_metrics = {}
    if train_rep_p.exists():
        train_metrics = json_load(train_rep_p.read_text(encoding="utf-8"), {})

    return {
        "platform": "Infosys Artery AI Diagnostics",
        "organization": "Infosys Healthcare & Life Sciences AI Lab",
        "model_name": "Infosys-ArteryNet-v2.4",
        "architecture": "U-Net vessel segmentation, QCA research candidate localization, and optional CADICA research box detector; no validated stenosis classifier",
        "status": "Local validation",
        "segmentation_model": ai_engine_instance.segmentation_model_name,
        "deep_segmentation_loaded": ai_engine_instance.segmentation_model is not None,
        "denoising_model": ai_engine_instance.denoising_model_status,
        "cadica_lesion_detector_loaded": ai_engine_instance.cadica_detector is not None,
        "cadica_lesion_detector_version": ai_engine_instance.cadica_detector_version,
        "metrics": test_metrics.get("metrics", {}),
        "inference_time_ms": test_metrics.get("evaluation_duration_seconds"),
        "test_cases_evaluated": test_metrics.get("test_cases_count", 0),
        "benchmark_timestamp": test_metrics.get("timestamp"),
        "training_summary": train_metrics.get("dataset_summary", {})
    }

@app.get("/api/model/registry")
def model_registry(user=Depends(clinical_user)):
    artifacts = [
        ("legacy-stenosis-detector", "Legacy stenosis classifier (demo only)", "Loaded artifact; not used for predictions", "models/trained_artery_classifier.joblib", ai_engine_instance.detector is not None),
        ("legacy-severity-classifier", "Legacy severity classifier (demo only)", "Loaded artifact; not used for predictions", "models/severity_classifier.joblib", ai_engine_instance.severity_classifier is not None),
        ("legacy-narrowing-regressor", "Legacy narrowing regressor (demo only)", "Loaded artifact; not used for predictions", "models/narrowing_regressor.joblib", ai_engine_instance.narrowing_regressor is not None),
        ("feature-scaler", "Feature scaler", "Preprocessing", "models/feature_scaler.joblib", ai_engine_instance.scaler is not None),
        ("vessel-segmentation", "Vessel segmentation", "Deep segmentation", "models/best_segmentation_model.pt", ai_engine_instance.segmentation_model is not None),
        ("cadica-lesion-localizer", "CADICA lesion localizer", "Research bounding-box detector", "models/cadica_lesion_detector.pt", ai_engine_instance.cadica_detector is not None),
        ("cadica-denoiser", "CADICA denoiser", "Experimental denoising", "models/cadica_denoiser.pt", ai_engine_instance.denoising_model is not None),
    ]
    models = []
    for model_id, name, family, relative_path, loaded in artifacts:
        path = TRAINING_DIR / relative_path
        available = path.is_file()
        stat = path.stat() if available else None
        models.append({
            "id": model_id,
            "name": name,
            "family": family,
            "artifact": relative_path,
            "available": available,
            "loaded": loaded,
            "sizeBytes": stat.st_size if stat else None,
            "updatedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat() if stat else None,
        })
    return {
        "activeSegmentationModel": ai_engine_instance.segmentation_model_name,
        "deepSegmentationLoaded": ai_engine_instance.segmentation_model is not None,
        "models": models,
        "validation": ai_engine_instance.segmentation_validation,
        "note": "Inventory is read from local model artifacts and runtime load state. Availability does not imply clinical validation.",
    }

@app.get("/api/activity-logs")
def activity_logs(limit: int = Query(100, ge=1, le=500), user=Depends(clinical_user)):
    with connect() as c:
        rows = c.execute(
            """SELECT a.id,a.user_id,a.action,a.entity_type,a.entity_id,a.created_at,u.name AS actor_name
               FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
               ORDER BY a.created_at DESC,a.id DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [{
        "id": row["id"],
        "userId": row["user_id"],
        "actor": row["actor_name"] or "Unknown user",
        "action": row["action"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "timestamp": row["created_at"],
    } for row in rows]

def feature_manager(user):
    if not feature_manager_access(user):
        raise HTTPException(403, "Feature management is restricted. Add your account email to ARTERY_FEATURE_ADMIN_EMAILS or use an Administrator account.")
    return user

def feature_manager_access(user):
    user_dict = dict(user) if user else {}
    allowed_emails = {
        email.strip().lower()
        for email in os.getenv("ARTERY_FEATURE_ADMIN_EMAILS", "").split(",")
        if email.strip()
    }
    return str(user_dict.get("role", "")).lower() == "administrator" or str(user_dict.get("email", "")).lower() in allowed_emails

@app.get("/api/features/access")
def feature_management_access(user=Depends(current_user)):
    return {"canManage": feature_manager_access(user)}

def feature_audit(c, user, action, entity_id):
    c.execute(
        "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
        (user["id"], action, "feature_flag", entity_id, now_iso()),
    )

def feature_environment_or_404(c, environment_id):
    row = c.execute("SELECT id,name FROM feature_environments WHERE id=?", (environment_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Feature environment not found.")
    return row

@app.get("/api/features/settings")
def feature_settings(user=Depends(current_user)):
    feature_manager(user)
    with connect() as c:
        environments = c.execute("SELECT id,name,created_at FROM feature_environments ORDER BY CASE id WHEN 'development' THEN 0 WHEN 'staging' THEN 1 WHEN 'production' THEN 2 ELSE 3 END,name").fetchall()
    return {
        "environments": [{"id": row["id"], "name": row["name"], "createdAt": row["created_at"]} for row in environments],
        "administrator": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }

@app.get("/api/features/environments")
def feature_environments(user=Depends(current_user)):
    feature_manager(user)
    with connect() as c:
        rows = c.execute(
            """SELECT e.id,e.name,e.created_at,COUNT(DISTINCT cfg.flag_key) AS configured_flags
               FROM feature_environments e
               LEFT JOIN feature_flag_configs cfg ON cfg.environment_id=e.id
               GROUP BY e.id ORDER BY CASE e.id WHEN 'development' THEN 0 WHEN 'staging' THEN 1 WHEN 'production' THEN 2 ELSE 3 END,e.name"""
        ).fetchall()
    return [{"id": row["id"], "name": row["name"], "createdAt": row["created_at"], "configuredFlags": row["configured_flags"]} for row in rows]

@app.post("/api/features/environments", status_code=201)
def create_feature_environment(body: FeatureEnvironmentBody, user=Depends(current_user)):
    feature_manager(user)
    name = body.name.strip()
    environment_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not environment_id or len(environment_id) > 64:
        raise HTTPException(422, "Environment name must produce an identifier of at most 64 characters.")
    with connect() as c:
        if c.execute("SELECT 1 FROM feature_environments WHERE id=? OR lower(name)=lower(?)", (environment_id, name)).fetchone():
            raise HTTPException(409, "An environment with that name already exists.")
        created_at = now_iso()
        c.execute("INSERT INTO feature_environments(id,name,created_at) VALUES(?,?,?)", (environment_id, name, created_at))
        flags = c.execute("SELECT flag_key FROM feature_flags").fetchall()
        c.executemany(
            "INSERT INTO feature_flag_configs(flag_key,environment_id,enabled,rollout_percent,rules_json,default_value,updated_at) VALUES(?,?,0,0,'[]',0,?)",
            [(row["flag_key"], environment_id, created_at) for row in flags],
        )
        feature_audit(c, user, "create_environment", environment_id)
    return {"id": environment_id, "name": name, "createdAt": created_at, "configuredFlags": len(flags)}

@app.get("/api/features/summary")
def feature_summary(environment_id: str = "development", user=Depends(current_user)):
    feature_manager(user)
    with connect() as c:
        feature_environment_or_404(c, environment_id)
        total_flags = c.execute("SELECT COUNT(*) FROM feature_flags").fetchone()[0]
        enabled_flags = c.execute("SELECT COUNT(*) FROM feature_flag_configs WHERE environment_id=? AND enabled=1", (environment_id,)).fetchone()[0]
        total_environments = c.execute("SELECT COUNT(*) FROM feature_environments").fetchone()[0]
        evaluations = c.execute(
            "SELECT COUNT(*) FROM feature_flag_evaluations WHERE environment_id=? AND evaluated_at >= ?",
            (environment_id, (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()),
        ).fetchone()[0]
        recent_events = c.execute(
            """SELECT a.id,a.action,a.entity_id,a.created_at,u.name actor
               FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
               WHERE a.entity_type IN ('feature_flag','feature_environment')
               ORDER BY a.created_at DESC,a.id DESC LIMIT 8"""
        ).fetchall()
    return {
        "totalFlags": total_flags,
        "enabledFlags": enabled_flags,
        "disabledFlags": total_flags - enabled_flags,
        "environmentCount": total_environments,
        "evaluations30d": evaluations,
        "recentEvents": [{"id": row["id"], "action": row["action"], "entityId": row["entity_id"], "timestamp": row["created_at"], "actor": row["actor"] or "Unknown user"} for row in recent_events],
    }

@app.get("/api/features/flags")
def list_feature_flags(environment_id: str = "development", search: str = "", user=Depends(current_user)):
    feature_manager(user)
    term = f"%{search.strip().lower()}%"
    with connect() as c:
        feature_environment_or_404(c, environment_id)
        rows = c.execute(
            """SELECT f.flag_key,f.name,f.description,f.flag_type,f.owner,f.created_by,f.created_at,f.updated_at,
                      cfg.enabled,cfg.rollout_percent,cfg.rules_json,cfg.default_value,
                      (SELECT COUNT(*) FROM feature_flag_evaluations ev WHERE ev.flag_key=f.flag_key AND ev.environment_id=cfg.environment_id) evaluation_count
               FROM feature_flags f
               JOIN feature_flag_configs cfg ON cfg.flag_key=f.flag_key AND cfg.environment_id=?
               WHERE lower(f.flag_key) LIKE ? OR lower(f.name) LIKE ? OR lower(f.description) LIKE ?
               ORDER BY f.created_at DESC""",
            (environment_id, term, term, term),
        ).fetchall()
    return [{
        "flagKey": row["flag_key"], "name": row["name"], "description": row["description"],
        "type": row["flag_type"], "owner": row["owner"], "createdBy": row["created_by"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        "enabled": bool(row["enabled"]), "rolloutPercent": row["rollout_percent"],
        "defaultValue": bool(row["default_value"]), "rules": json_load(row["rules_json"], []),
        "evaluationCount": row["evaluation_count"], "environmentId": environment_id,
    } for row in rows]

@app.post("/api/features/flags", status_code=201)
def create_feature_flag(body: FeatureFlagBody, user=Depends(current_user)):
    feature_manager(user)
    flag_key = body.flagKey.strip().lower()
    created_at = now_iso()
    with connect() as c:
        if c.execute("SELECT 1 FROM feature_flags WHERE flag_key=?", (flag_key,)).fetchone():
            raise HTTPException(409, "A feature flag with that key already exists.")
        c.execute(
            "INSERT INTO feature_flags(flag_key,name,description,owner,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (flag_key, body.name.strip(), body.description.strip(), body.owner.strip(), user["id"], created_at, created_at),
        )
        environments = c.execute("SELECT id FROM feature_environments").fetchall()
        c.executemany(
            "INSERT INTO feature_flag_configs(flag_key,environment_id,enabled,rollout_percent,rules_json,default_value,updated_at) VALUES(?,?,0,0,'[]',0,?)",
            [(flag_key, row["id"], created_at) for row in environments],
        )
        feature_audit(c, user, "create_flag", flag_key)
    return {"flagKey": flag_key, "name": body.name.strip(), "createdAt": created_at, "environmentsConfigured": len(environments)}

@app.get("/api/features/flags/{flag_key}")
def get_feature_flag(flag_key: str, environment_id: str = "development", user=Depends(current_user)):
    feature_manager(user)
    with connect() as c:
        feature_environment_or_404(c, environment_id)
        flag = c.execute("SELECT * FROM feature_flags WHERE flag_key=?", (flag_key.lower(),)).fetchone()
        if not flag:
            raise HTTPException(404, "Feature flag not found.")
        configs = c.execute(
            """SELECT e.id environment_id,e.name environment_name,cfg.enabled,cfg.rollout_percent,cfg.rules_json,cfg.default_value,cfg.updated_at
               FROM feature_flag_configs cfg JOIN feature_environments e ON e.id=cfg.environment_id
               WHERE cfg.flag_key=? ORDER BY CASE e.id WHEN 'development' THEN 0 WHEN 'staging' THEN 1 WHEN 'production' THEN 2 ELSE 3 END,e.name""",
            (flag_key.lower(),),
        ).fetchall()
        total = c.execute(
            "SELECT COUNT(*) FROM feature_flag_evaluations WHERE flag_key=? AND environment_id=?",
            (flag_key.lower(), environment_id),
        ).fetchone()[0]
        recent = c.execute(
            """SELECT date(evaluated_at) day,COUNT(*) count,SUM(evaluated_value) enabled_count
               FROM feature_flag_evaluations
               WHERE flag_key=? AND environment_id=? AND evaluated_at >= ?
               GROUP BY date(evaluated_at) ORDER BY day""",
            (flag_key.lower(), environment_id, (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()),
        ).fetchall()
    return {
        "flagKey": flag["flag_key"], "name": flag["name"], "description": flag["description"],
        "type": flag["flag_type"], "owner": flag["owner"], "createdBy": flag["created_by"],
        "createdAt": flag["created_at"], "updatedAt": flag["updated_at"],
        "evaluationCount": total,
        "environments": [{"environmentId": row["environment_id"], "environmentName": row["environment_name"], "enabled": bool(row["enabled"]), "rolloutPercent": row["rollout_percent"], "defaultValue": bool(row["default_value"]), "rules": json_load(row["rules_json"], []), "updatedAt": row["updated_at"]} for row in configs],
        "dailyEvaluations": [{"date": row["day"], "count": row["count"], "enabledCount": row["enabled_count"] or 0} for row in recent],
    }

@app.patch("/api/features/flags/{flag_key}")
def update_feature_flag(flag_key: str, body: FeatureFlagUpdateBody, user=Depends(current_user)):
    feature_manager(user)
    updates = {column: value.strip() if isinstance(value, str) else value for field, column in (("name", "name"), ("description", "description"), ("owner", "owner")) if (value := getattr(body, field)) is not None}
    if not updates:
        raise HTTPException(400, "Provide at least one supported feature flag field.")
    updated_fields = list(updates)
    updates["updated_at"] = now_iso()
    with connect() as c:
        if not c.execute("SELECT 1 FROM feature_flags WHERE flag_key=?", (flag_key.lower(),)).fetchone():
            raise HTTPException(404, "Feature flag not found.")
        c.execute("UPDATE feature_flags SET " + ",".join(f"{column}=?" for column in updates) + " WHERE flag_key=?", [*updates.values(), flag_key.lower()])
        feature_audit(c, user, "update_flag", flag_key.lower())
    return {"success": True, "flagKey": flag_key.lower(), "updatedFields": updated_fields}

@app.delete("/api/features/flags/{flag_key}")
def delete_feature_flag(flag_key: str, user=Depends(current_user)):
    feature_manager(user)
    with connect() as c:
        flag = c.execute("SELECT flag_key FROM feature_flags WHERE flag_key=?", (flag_key.lower(),)).fetchone()
        if not flag:
            raise HTTPException(404, "Feature flag not found.")
        feature_audit(c, user, "delete_flag", flag_key.lower())
        cursor = c.execute("DELETE FROM feature_flags WHERE flag_key=?", (flag_key.lower(),))
    return {"success": True, "flagKey": flag_key.lower()}

@app.put("/api/features/flags/{flag_key}/environments/{environment_id}")
def update_feature_flag_config(flag_key: str, environment_id: str, body: FeatureConfigBody, user=Depends(current_user)):
    feature_manager(user)
    updated_at = now_iso()
    with connect() as c:
        feature_environment_or_404(c, environment_id)
        if not c.execute("SELECT 1 FROM feature_flags WHERE flag_key=?", (flag_key.lower(),)).fetchone():
            raise HTTPException(404, "Feature flag not found.")
        c.execute(
            """UPDATE feature_flag_configs SET enabled=?,rollout_percent=?,rules_json=?,default_value=?,updated_at=?
               WHERE flag_key=? AND environment_id=?""",
            (int(body.enabled), body.rolloutPercent, json.dumps([rule.model_dump() for rule in body.rules]), int(body.defaultValue), updated_at, flag_key.lower(), environment_id),
        )
        feature_audit(c, user, "configure_flag", f"{flag_key.lower()}@{environment_id}")
    return {"success": True, "flagKey": flag_key.lower(), "environmentId": environment_id, "enabled": body.enabled, "rolloutPercent": body.rolloutPercent, "updatedAt": updated_at}

@app.post("/api/features/evaluate")
def evaluate_feature_flag(body: FeatureEvaluationBody, user=Depends(current_user)):
    flag_key = body.flagKey.strip().lower()
    with connect() as c:
        flag = c.execute("SELECT 1 FROM feature_flags WHERE flag_key=?", (flag_key,)).fetchone()
        if not flag:
            raise HTTPException(404, "Feature flag not found.")
        feature_environment_or_404(c, body.environmentId)
        config = c.execute("SELECT * FROM feature_flag_configs WHERE flag_key=? AND environment_id=?", (flag_key, body.environmentId)).fetchone()
        if not config:
            raise HTTPException(404, "Feature configuration is missing for this environment.")
        rules = json_load(config["rules_json"], [])
        if not config["enabled"]:
            value, reason = bool(config["default_value"]), "disabled_default"
        else:
            matching_rule = next((rule for rule in rules if body.attributes.get(rule.get("attribute")) == rule.get("value")), None)
            if matching_rule is not None:
                value, reason = bool(matching_rule.get("result", True)), "targeting_rule"
            else:
                bucket_seed = f"{flag_key}:{body.environmentId}:{body.subjectId}".encode("utf-8")
                bucket = int.from_bytes(hashlib.sha256(bucket_seed).digest()[:4], "big") % 100
                if bucket < config["rollout_percent"]:
                    value, reason = True, "percentage_rollout"
                else:
                    value, reason = bool(config["default_value"]), "default_value"
        evaluation_id = "FFE-" + secrets.token_hex(8).upper()
        subject_hash = hmac.new(SECRET, body.subjectId.encode("utf-8"), hashlib.sha256).hexdigest()
        evaluated_at = now_iso()
        c.execute(
            "INSERT INTO feature_flag_evaluations(id,flag_key,environment_id,subject_hash,evaluated_value,reason,evaluated_at) VALUES(?,?,?,?,?,?,?)",
            (evaluation_id, flag_key, body.environmentId, subject_hash, int(value), reason, evaluated_at),
        )
    return {"evaluationId": evaluation_id, "flagKey": flag_key, "environmentId": body.environmentId, "value": value, "reason": reason, "evaluatedAt": evaluated_at}

@app.get("/api/features/analytics")
def feature_analytics(environment_id: str = "development", user=Depends(current_user)):
    feature_manager(user)
    with connect() as c:
        feature_environment_or_404(c, environment_id)
        totals = c.execute(
            """SELECT f.flag_key,f.name,COUNT(ev.id) evaluations,COALESCE(SUM(ev.evaluated_value),0) enabled_evaluations
               FROM feature_flags f
               JOIN feature_flag_configs cfg ON cfg.flag_key=f.flag_key AND cfg.environment_id=?
               LEFT JOIN feature_flag_evaluations ev ON ev.flag_key=f.flag_key AND ev.environment_id=cfg.environment_id
               GROUP BY f.flag_key ORDER BY evaluations DESC,f.name""",
            (environment_id,),
        ).fetchall()
        daily = c.execute(
            """SELECT date(evaluated_at) day,COUNT(*) evaluations,COALESCE(SUM(evaluated_value),0) enabled_evaluations
               FROM feature_flag_evaluations WHERE environment_id=? AND evaluated_at>=?
               GROUP BY date(evaluated_at) ORDER BY day""",
            (environment_id, (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()),
        ).fetchall()
    return {
        "environmentId": environment_id,
        "totalEvaluations": sum(row["evaluations"] for row in totals),
        "enabledEvaluations": sum(row["enabled_evaluations"] for row in totals),
        "flags": [{"flagKey": row["flag_key"], "name": row["name"], "evaluations": row["evaluations"], "enabledEvaluations": row["enabled_evaluations"]} for row in totals],
        "daily": [{"date": row["day"], "evaluations": row["evaluations"], "enabledEvaluations": row["enabled_evaluations"]} for row in daily],
    }

@app.post("/api/model/retrain")
def trigger_retraining(user=Depends(clinical_user)):
    raise HTTPException(
        status_code=410,
        detail="The legacy model suite uses synthetic labels and is disabled. Train the CADICA lesion localizer instead; severity and narrowing remain unavailable without validated labels and calibration.",
    )

@app.get("/api/dataset/summary")
def dataset_summary(user=Depends(clinical_user)):
    cat_p = DATASET_DIR / "dataset_catalog.json"
    if cat_p.exists():
        return json_load(cat_p.read_text(encoding="utf-8"))
    return {"message": "Dataset catalog available in dataset/clinical_manifest.csv"}

@app.get("/api/dataset/images")
def dataset_images(user=Depends(clinical_user)):
    arcade_images = arcade_index()["records"]
    if not arcade_images:
        raise HTTPException(503, "ARCade dataset not found. Extract its syntax and stenosis folders or set ARTERY_ARCADE_DIR.")
    return {"total": len(arcade_images), "source": "ARCade", "images": arcade_images}

@app.get("/api/cadica/images")
def cadica_images(
    search: str = "",
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    annotated_only: bool = False,
    user=Depends(clinical_user),
):
    records = cadica_index()["records"]
    if not records:
        raise HTTPException(503, "CADICA selectedVideos dataset was not found. Extract CADICA under dataset/CADICA.")
    if annotated_only:
        records = [record for record in records if record["annotationPath"]]
    query = search.strip().lower()
    if query:
        records = [
            record for record in records
            if query in record["caseId"].lower()
            or query in record["patientId"].lower()
            or query in record["vessel"].lower()
        ]
    images = [
        {
            **{key: record[key] for key in ("caseId", "patientId", "fileName", "modality", "region", "vessel", "severity", "status", "task")},
            "referenceAnnotationAvailable": bool(record["annotationPath"]),
        }
        for record in records[offset:offset + limit]
    ]
    return {"total": len(records), "limit": limit, "offset": offset, "source": "CADICA", "images": images}

@app.post("/api/assistant")
def assistant_reply(body: AssistantBody, user=Depends(current_user)):
    prompt = body.message.strip().lower()
    if str(user["role"]).lower() == "patient":
        if any(word in prompt for word in ("chest pain", "shortness of breath", "can't breathe", "cannot breathe", "faint", "emergency", "stroke")):
            answer = "If you may be experiencing a medical emergency, contact your local emergency service or go to the nearest emergency department now. I cannot assess symptoms or diagnose you."
        elif any(word in prompt for word in ("eye", "vision", "sight", "cataract", "glaucoma")):
            answer = "For eye or vision concerns, browse the Ophthalmology specialty in Doctors and request an appointment. This is general navigation help, not a diagnosis; seek urgent care for sudden vision loss or a severe eye injury."
        elif any(word in prompt for word in ("ear", "hearing", "nose", "throat", "sinus", "ent")):
            answer = "For ear, hearing, nose, throat, or sinus concerns, browse Otolaryngology (ENT) in Doctors and request an appointment. I cannot diagnose the cause."
        elif any(word in prompt for word in ("skin", "rash", "acne", "hair", "nail")):
            answer = "For skin, hair, or nail concerns, browse Dermatology in Doctors. I cannot identify a condition from chat; request a clinician appointment for assessment."
        elif any(word in prompt for word in ("bone", "joint", "fracture", "back pain", "muscle")):
            answer = "For bone, joint, muscle, or injury concerns, browse Orthopedics in Doctors. If an injury is severe or urgent, contact emergency services."
        elif any(word in prompt for word in ("diabetes", "thyroid", "hormone")):
            answer = "For diabetes, thyroid, or hormone care, browse Endocrinology in Doctors. Keep taking medicines as prescribed and ask your clinician before changing a dose."
        elif any(word in prompt for word in ("child", "baby", "pediatric")):
            answer = "For a child's routine or non-emergency care, browse Pediatrics in Doctors. For a serious or rapidly worsening problem, seek urgent medical care."
        elif any(word in prompt for word in ("headache", "migraine", "seizure", "nerve", "memory")):
            answer = "For recurring headache, nerve, seizure, or memory concerns, browse Neurology in Doctors. Sudden weakness, facial droop, confusion, or a severe sudden headache needs emergency care."
        elif any(word in prompt for word in ("appointment", "booking", "book", "visit")):
            with connect() as c:
                count = c.execute("SELECT COUNT(*) FROM appointments WHERE patient_user_id=?", (user["id"],)).fetchone()[0]
            answer = f"You have {count} appointment request(s) or visit(s). Open My Appointments to review them, or Doctors to request a visit. A doctor must confirm a pending request."
        elif any(word in prompt for word in ("doctor", "clinician", "cardiologist", "specialty", "specialist")):
            answer = "Open Doctors and search by specialty or care area, including cardiology, eye care, ENT, neurology, skin, bones and joints, diabetes and thyroid, pediatrics, mental health, and general practice. The directory entries are demonstration data; verify credentials and availability before booking."
        elif any(word in prompt for word in ("medicine", "medication", "pharmacy", "drug", "price")):
            answer = "Open Medicine & pharmacy finder on your patient home page to locate nearby pharmacies and check current medicine prices through the Government of India NPPA portal. I cannot recommend or prescribe a medicine; confirm it with your clinician or pharmacist."
        elif any(word in prompt for word in ("message", "text", "contact")):
            answer = "On your patient home page, choose Text message on a doctor card to send a private message in the app. Replies appear in Messages."
        elif any(word in prompt for word in ("report", "record", "x-ray", "xray", "scan")):
            answer = "Use My Appointments, Doctors, and Notifications from your patient portal. For access to a medical report or scan, contact your treating clinic; this patient portal does not expose the clinical image registry."
        else:
            answer = "I can help you navigate doctor contacts, appointment requests, messages, nearby pharmacies, and the official medicine price lookup. I cannot diagnose symptoms, recommend treatment, or prescribe medication."
        return {"answer": answer, "scope": "Patient portal assistant. It does not provide diagnosis, treatment advice, or prescriptions."}

    with connect() as c:
        counts = c.execute("SELECT COUNT(*) total, SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) pending, SUM(CASE WHEN status='In Progress' THEN 1 ELSE 0 END) in_progress, SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) completed FROM scans").fetchone()
        reports = c.execute("SELECT COUNT(*) FROM reports WHERE status='Completed'").fetchone()[0]
    if any(word in prompt for word in ("pending", "queue", "awaiting")):
        answer = f"There are {counts['pending'] or 0} cases pending analysis. Open Cases and choose the Pending filter to review them."
    elif any(word in prompt for word in ("report", "completed")):
        answer = f"The registry has {counts['completed'] or 0} completed cases and {reports} completed reports. Open Reports to view available summaries."
    elif any(word in prompt for word in ("x-ray", "xray", "image", "scan")):
        answer = "The authenticated X-ray Library serves local ARCade coronary X-ray images and their syntax/stenosis annotation splits. Open X-rays to search by sample, task, or split; these research samples are not patient records."
    elif any(word in prompt for word in ("doctor", "clinician")):
        answer = "The clinician directory has 10 demo doctor accounts. Open Doctors from the navigation or the public sign-in page to access one."
    else:
        answer = f"Registry snapshot: {counts['total'] or 0} cases, {counts['pending'] or 0} pending, {counts['in_progress'] or 0} in progress, {counts['completed'] or 0} completed, and {reports} completed reports. Ask about pending cases, reports, X-rays, or doctors."
    return {"answer": answer, "scope": "Workflow guidance from the local case registry. This assistant does not provide clinical diagnosis."}

@app.get("/api/dataset/images/{file_name}")
def dataset_image(file_name: str, auth: str = ""):
    # Validate the signed browser token because <img> requests cannot attach
    # the Authorization header used by the JSON API client.
    user_id = token_user(auth)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    with connect() as c:
        account = c.execute("SELECT id,role FROM users WHERE id=?", (user_id,)).fetchone()
        if not account:
            raise HTTPException(status_code=401, detail="User not found")
        if account["role"] == "Patient":
            raise HTTPException(status_code=403, detail="Scan images are restricted to the clinical workspace.")
    if file_name.startswith("ARCADE_"):
        image_path = arcade_index()["image_paths"].get(file_name)
        if not image_path:
            raise HTTPException(status_code=404, detail="ARCade image not found")
        return FileResponse(image_path)
    if file_name.startswith("CADICA_"):
        image_path = cadica_index()["image_paths"].get(file_name)
        if not image_path:
            raise HTTPException(status_code=404, detail="CADICA image not found")
        return FileResponse(image_path)
    if Path(file_name).name != file_name:
        raise HTTPException(status_code=400, detail="Invalid image name")
    image_path = (IMAGES_DIR / file_name).resolve()
    if image_path.parent != IMAGES_DIR.resolve() or not image_path.is_file():
        raise HTTPException(status_code=404, detail="Dataset image not found")
    return FileResponse(image_path)

@app.post("/api/model/test")
def run_heldout_test(background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    def run_script():
        subprocess.run([sys.executable, str(TRAINING_DIR / "test.py")], check=True, cwd=str(PROJECT_ROOT))
    background_tasks.add_task(run_script)
    return {"success": True, "message": "Held-out model evaluation started. Refresh the Training & Testing page for the latest report."}

@lru_cache(maxsize=8)
def segmentation_gallery_samples(split_name="test", offset=0, limit=6):
    """Build a paginated cached comparison over the selected manifest split."""
    manifest_path = DATASET_DIR / "clinical_manifest.csv"
    if not manifest_path.is_file():
        return {"dataset": "clinical_manifest", "split": split_name, "samples": [], "count": 0, "total": 0, "message": "Dataset manifest unavailable."}
    import pandas as pd

    manifest = pd.read_csv(manifest_path)
    split = stratified_split_labels(manifest)
    eligible_rows = []
    for position, (_, row) in enumerate(manifest.iterrows()):
        row_split = str(split[position])
        if split_name != "all" and row_split != split_name:
            continue
        image_path = (IMAGES_DIR / str(row["file_name"])).resolve()
        mask_name = row.get("mask_file")
        if not mask_name or pd.isna(mask_name):
            continue
        mask_path = (DATASET_DIR / "masks" / str(mask_name)).resolve()
        if image_path.parent != IMAGES_DIR.resolve() or not image_path.is_file() or not mask_path.is_file():
            continue
        eligible_rows.append((row, row_split, image_path, mask_path))

    total = len(eligible_rows)
    selected = eligible_rows[offset:offset + limit]
    samples = []
    for row, row_split, image_path, mask_path in selected:
        original = ai_engine_instance.load_scan_array(image_path)
        reference = np.asarray(Image.open(mask_path).convert("L").resize((original.shape[1], original.shape[0]), Image.Resampling.NEAREST)) > 0
        predicted_mask, _, _ = ai_engine_instance.predict_segmentation(original)
        predicted = np.asarray(predicted_mask) > 0
        if predicted.shape != reference.shape:
            predicted = np.asarray(Image.fromarray(predicted.astype(np.uint8) * 255).resize((reference.shape[1], reference.shape[0]), Image.Resampling.NEAREST)) > 0
        tp = predicted & reference
        fp = predicted & ~reference
        fn = ~predicted & reference
        overlay = np.zeros((*reference.shape, 3), dtype=np.uint8)
        overlay[tp] = (34, 197, 94)
        overlay[fp] = (239, 68, 68)
        overlay[fn] = (59, 130, 246)

        def png_data_url(array, mode="L"):
            buffer = io.BytesIO()
            Image.fromarray(array.astype(np.uint8), mode=mode).save(buffer, format="PNG", optimize=True)
            return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

        samples.append({
            "caseId": str(row["case_id"]),
            "fileName": str(row["file_name"]),
            "split": row_split,
            "model": ai_engine_instance.segmentation_model_name,
            "original_b64": png_data_url(original),
            "ground_truth_b64": png_data_url(reference.astype(np.uint8) * 255),
            "prediction_b64": png_data_url(predicted.astype(np.uint8) * 255),
            "overlay_b64": png_data_url(overlay, "RGB"),
            "metrics": {
                "dice": float(2 * int(tp.sum()) / max(1, 2 * int(tp.sum()) + int(fp.sum()) + int(fn.sum()))),
                "iou": float(int(tp.sum()) / max(1, int(tp.sum()) + int(fp.sum()) + int(fn.sum()))),
            },
            "limitations": "Fixed held-out sample. TP=green, FP=red, FN=blue. Model output is research-only and not a clinical diagnosis.",
        })
    return {
        "dataset": "clinical_manifest", "split": split_name,
        "count": len(samples), "total": total, "offset": offset, "limit": limit,
        "dataset_cases": int(len(manifest)), "model": ai_engine_instance.segmentation_model_name,
        "samples": samples,
    }

@app.get("/api/model/artifacts/{artifact_name}")
def model_artifact(artifact_name: str, user=Depends(clinical_user)):
    allowed = {"evaluation_plots.png", "confusion_matrix.png", "segmentation_examples.png", "stenosis_classifier_training_curve.png"}
    if artifact_name not in allowed:
        raise HTTPException(404, "Model artifact is not available.")
    path = TRAINING_DIR / artifact_name
    if not path.is_file():
        raise HTTPException(404, "Model artifact has not been generated yet.")
    return FileResponse(path)

@app.get("/api/model/segmentation-gallery")
def model_segmentation_gallery(
    split: str = "test",
    offset: int = Query(0, ge=0),
    limit: int = Query(6, ge=1, le=12),
    user=Depends(clinical_user),
):
    if split not in {"all", "train", "val", "test"}:
        raise HTTPException(422, "Split must be all, train, val, or test.")
    return segmentation_gallery_samples(split, offset, limit)

@app.get("/api/model/roc-curve")
def model_roc_curve(user=Depends(clinical_user)):
    report_path = TRAINING_DIR / "test_report.json"
    if not report_path.is_file():
        raise HTTPException(404, "Held-out test report is unavailable.")
    report = json_load(report_path.read_text(encoding="utf-8"), {})
    detection = (report.get("metrics") or {}).get("stenosis_detection") or {}
    return {
        "model": "stenosis_detection",
        "split": "held-out test",
        "test_cases": report.get("test_cases_count"),
        "roc_auc": detection.get("roc_auc"),
        "curve": detection.get("roc_curve"),
        "confusion_matrix": detection.get("confusion_matrix"),
        "specificity": detection.get("specificity"),
        "sensitivity": detection.get("recall_sensitivity"),
        "limitations": "Retrospective held-out benchmark. This ROC and confusion matrix are cohort-level evaluation, not per-scan probabilities or clinical validation.",
    }

@app.post("/api/model/classifier-learning-curves")
def generate_classifier_learning_curves(background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    script = TRAINING_DIR / "classifier_learning_curves.py"
    if not script.is_file():
        raise HTTPException(404, "Classifier learning-curve evaluator is unavailable.")
    def run_script():
        subprocess.run([sys.executable, str(script)], check=True, cwd=str(PROJECT_ROOT))
    background_tasks.add_task(run_script)
    return {"success": True, "message": "Random Forest train/validation curves are being measured across cumulative tree counts; the held-out test split is excluded."}

@app.get("/api/model/reports")
def model_reports(user=Depends(clinical_user)):
    result = {}
    for key, name in (("training", "training_report.json"), ("testing", "test_report.json"), ("segmentation_comparison", "segmentation_comparison.json"), ("segmentation_deep_learning", "segmentation_dl_report.json"), ("cadica_denoising", "cadica_denoiser_report.json"), ("cadica_detector", "cadica_detector_report.json"), ("arcade_model_validation", "arcade_model_validation_report.json"), ("classifier_learning_curves", "classifier_learning_curves.json")):
        path = TRAINING_DIR / name
        if path.is_file():
            try:
                result[key] = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                result[key] = None
        else:
            result[key] = None
    return result

@app.post("/api/model/train-segmentation")
def train_segmentation_models(background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    try:
        import torch  # noqa: F401
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Install the optional PyTorch dependency first: python -m pip install -r training/requirements_segmentation.txt") from exc
    script = TRAINING_DIR / "train_segmentation_dl.py"
    def run_script():
        subprocess.run([sys.executable, str(script)], check=True, cwd=str(PROJECT_ROOT))
        ai_engine_instance.load_segmentation_model()
    background_tasks.add_task(run_script)
    return {"success": True, "message": "U-Net and U-Net++ training started. It trains on the train split, selects by validation Dice, then reports held-out test metrics."}

@app.post("/api/model/train-cadica-detector")
def train_cadica_lesion_detector(background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    try:
        import torch  # noqa: F401
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Install the optional PyTorch dependency first: python -m pip install -r training/requirements_segmentation.txt") from exc
    data_dir = DATASET_DIR / "CADICA" / "selectedVideos"
    if not data_dir.is_dir() or not any(data_dir.glob("p*/v*/input/*.png")):
        raise HTTPException(status_code=400, detail="Extract the CADICA dataset so dataset/CADICA/selectedVideos contains the labeled frames.")
    script = TRAINING_DIR / "train_cadica_detector.py"
    def run_script():
        subprocess.run([sys.executable, str(script), "--epochs", "5"], check=True, cwd=str(PROJECT_ROOT))
        ai_engine_instance.load_cadica_detector()
    background_tasks.add_task(run_script)
    return {"success": True, "message": "CADICA single-class lesion-box training started with patient-held-out train/validation/test splits. Severity and calibrated narrowing are not trained or returned."}

@app.post("/api/model/train-denoiser")
def train_cadica_denoiser(background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    try:
        import torch  # noqa: F401
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Install the optional PyTorch dependency first: python -m pip install -r training/requirements_segmentation.txt") from exc
    data_dir = PROJECT_ROOT / "dataset" / "CADICA" / "selectedVideos"
    if not data_dir.is_dir() or not any(data_dir.glob("p*/v*/input/*.png")):
        raise HTTPException(status_code=400, detail="Extract the CADICA dataset so dataset/CADICA/selectedVideos contains patient/video input folders.")
    script = TRAINING_DIR / "train_cadica_denoiser.py"
    def run_script():
        subprocess.run([sys.executable, str(script), "--epochs", "5"], check=True, cwd=str(PROJECT_ROOT))
        ai_engine_instance.load_denoising_model()
    background_tasks.add_task(run_script)
    return {"success": True, "message": "Patient-held-out CADICA denoising training and synthetic-noise test started. The model is preview-only and will be promoted only if it beats the median-filter baseline."}

@app.get("/api/model/segmentation-comparison")
def segmentation_comparison(user=Depends(clinical_user)):
    path = TRAINING_DIR / "segmentation_comparison.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Generate the held-out segmentation comparison report first.")
    report = json_load(path.read_text(encoding="utf-8"), {})
    dl_path = TRAINING_DIR / "segmentation_dl_report.json"
    dl_report = json_load(dl_path.read_text(encoding="utf-8"), {}) if dl_path.is_file() else None
    report["deep_learning_comparison"] = dl_report
    return report

@app.post("/api/model/segmentation-comparison")
def generate_segmentation_comparison(background_tasks: BackgroundTasks, user=Depends(clinical_user)):
    script = TRAINING_DIR / "compare_segmentation.py"
    def run_script():
        subprocess.run([sys.executable, str(script)], check=True, cwd=str(PROJECT_ROOT))
    background_tasks.add_task(run_script)
    return {"success": True, "message": "Held-out segmentation comparison is running. Refresh the home page in a few moments for measured Dice, IoU, precision, and recall."}

@app.get("/api/testing/verification-suite")
def run_verification_suite_api(user=Depends(clinical_user)):
    """Runs the 4 enterprise verification suites and returns structured telemetry."""
    suite_script = BASE_DIR / "comprehensive_test_suite.py"
    try:
        proc = subprocess.run(
            [sys.executable, str(suite_script)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(PROJECT_ROOT),
            env={**os.environ, "PYTHONPATH": str(PROJECT_ROOT)}
        )
        output = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
        return {
            "success": proc.returncode == 0,
            "returncode": proc.returncode,
            "output": output,
            "timestamp": now_iso()
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
            "timestamp": now_iso()
        }

# ----------------- REPORTS, NOTIFICATIONS, PROFILE -----------------
@app.get("/api/reports")
def get_reports(user=Depends(clinical_user)):
    with connect() as c:
        rows = c.execute(
            '''SELECT r.*, s.patient_id, s.modality, s.anatomical_region, s.scan_date,
                      s.model_version AS scan_model_version,
                      sr.severity AS ai_severity, sr.narrowing_percentage AS ai_narrowing,
                      sr.dice_score AS ai_dice, sr.iou_score AS ai_iou,
                      sr.stenosis_detected AS ai_stenosis_detected,
                      sr.ref_diameter_mm, sr.min_diameter_mm,
                      sr.confidence_score AS ai_confidence, sr.inference_time_ms,
                      sr.recommendations_json, sr.visualizations_json,
                      sr.created_at AS analysis_created_at
               FROM reports r
               JOIN scans s ON s.id=r.scan_id
               LEFT JOIN segmentation_results sr ON sr.scan_id=s.id
               ORDER BY r.created_at DESC'''
        ).fetchall()
        now = now_iso()
        for row in rows:
            c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                (user["id"], "view_report", "report", row["id"], now))
    reports = []
    for r in rows:
        visualizations = json_load(r["visualizations_json"], {})
        reports.append({
            "id": r["id"], "caseId": r["scan_id"], "patientId": r["patient_id"],
            "date": r["scan_date"], "modality": r["modality"].split(" ")[0],
            "region": r["anatomical_region"], "status": r["status"],
            "author": r["author"], "summary": r["summary"],
            "severity": r["ai_severity"] if r["ai_severity"] is not None else (r["severity"] if r["status"] == "Approved" else None),
            "narrowing_percentage": r["ai_narrowing"] if r["ai_narrowing"] is not None else (r["narrowing_percentage"] if r["status"] == "Approved" else None),
            "dice_score": r["ai_dice"],
            "confidence": r["ai_confidence"],
            "analysis": {
                "model_version": visualizations.get("model_version") or r["scan_model_version"],
                "pipeline_status": (visualizations.get("stenosis_detection_pipeline") or {}).get("status"),
                "stenosis_detected": None if r["ai_stenosis_detected"] is None else bool(r["ai_stenosis_detected"]),
                "candidate_regions": visualizations.get("candidate_regions", []),
                "quality_check": visualizations.get("quality_check"),
                "recommendations": json_load(r["recommendations_json"], {}),
                "iou_score": r["ai_iou"],
                "reference_diameter_mm": r["ref_diameter_mm"],
                "minimum_diameter_mm": r["min_diameter_mm"],
                "inference_time_ms": r["inference_time_ms"],
                "analyzed_at": r["analysis_created_at"],
                "analysis_model": visualizations.get("model_version") or r["scan_model_version"],
                "analysis_metrics": {"dice": r["ai_dice"], "iou": r["ai_iou"], "inference_time_ms": r["inference_time_ms"]},
                "limitations": "Research decision-support only. Candidate regions and pixel-radius estimates are not a confirmed diagnosis or calibrated clinical measurement."
            } if r["analysis_created_at"] else None
        })
    return reports

@app.get("/api/notifications/email-status")
def email_alert_status(user=Depends(current_user)):
    configured = bool(os.getenv("ARTERY_SMTP_HOST") and os.getenv("ARTERY_SMTP_FROM", os.getenv("ARTERY_SMTP_USERNAME", "")))
    return {"configured": configured, "provider": os.getenv("ARTERY_SMTP_HOST", "").strip() or None,
            "message": "Workflow emails are enabled." if configured else "In-app notifications are active; configure SMTP environment variables to send email alerts."}

@app.get("/api/notifications")
def get_notifications(user=Depends(current_user)):
    with connect() as c:
        if str(user["role"]).lower() == "patient":
            rows = c.execute("SELECT * FROM notifications WHERE patient_id=? ORDER BY created_at DESC LIMIT 200", (user["id"],)).fetchall()
            return [{"id": r["id"], "type": r["type"], "title": r["title"], "message": r["message"], "caseId": r["case_id"], "patientId": None, "timestamp": r["created_at"], "read": bool(r["read"])} for r in rows]
        totals = c.execute("SELECT COUNT(*) AS total, SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending FROM scans").fetchone()
        first_pending = c.execute("SELECT id,patient_id FROM scans WHERE status='Pending' ORDER BY created_at DESC LIMIT 1").fetchone()
        report_count = c.execute("SELECT COUNT(*) FROM reports WHERE status='Completed'").fetchone()[0]
        created = now_iso()
        summaries = [
            ("NOTIF-REGISTRY-SUMMARY", "case_registry", "Registered case registry", f"{totals['total'] or 0} clinical cases are registered and searchable in the case registry.", None, None, created),
            ("NOTIF-PENDING-SUMMARY", "pending_cases", "Cases awaiting analysis", f"{totals['pending'] or 0} cases are pending analysis." + (f" Open {first_pending['id']} to review the queue." if first_pending else ""), first_pending["id"] if first_pending else None, first_pending["patient_id"] if first_pending else None, created),
            ("NOTIF-REPORTS-SUMMARY", "reports_ready", "Completed reports available", f"{report_count} completed diagnostic reports are available in Reports.", None, None, created),
        ]
        for item in summaries:
            c.execute("INSERT OR IGNORE INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)", item)
            c.execute("UPDATE notifications SET message=?,case_id=?,patient_id=? WHERE id=?", (item[3], item[4], item[5], item[0]))
        rows = c.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200").fetchall()
    return [
        {
            "id": r["id"], "type": r["type"], "title": r["title"],
            "message": r["message"], "caseId": r["case_id"],
            "patientId": r["patient_id"], "timestamp": r["created_at"],
            "read": bool(r["read"])
        }
        for r in rows
    ]

@app.patch("/api/notifications/{notification_id}/read")
def mark_notification(notification_id: str, user=Depends(current_user)):
    with connect() as c:
        if str(user["role"]).lower() == "patient":
            cur = c.execute("UPDATE notifications SET read=1 WHERE id=? AND patient_id=?", (notification_id, user["id"]))
        else:
            cur = c.execute("UPDATE notifications SET read=1 WHERE id=?", (notification_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Notification not found")
    return {"success": True}

@app.post("/api/notifications/read-all")
def mark_all_notifications(user=Depends(current_user)):
    with connect() as c:
        if str(user["role"]).lower() == "patient": c.execute("UPDATE notifications SET read=1 WHERE patient_id=?", (user["id"],))
        else: c.execute("UPDATE notifications SET read=1")
    return {"success": True}

@app.delete("/api/notifications")
def clear_notifications(user=Depends(current_user)):
    with connect() as c:
        if str(user["role"]).lower() == "patient": c.execute("DELETE FROM notifications WHERE patient_id=?", (user["id"],))
        else: c.execute("DELETE FROM notifications")
    return []

@app.get("/api/profile")
def get_profile(user=Depends(current_user)):
    return user_public(user)

@app.patch("/api/profile")
def update_profile(body: ProfileBody, user=Depends(current_user)):
    fields = {"name": "name", "email": "email", "department": "department", "institution": "institution", "phone": "phone", "licenseNumber": "license_number"}
    updates = {fields[k]: v for k, v in body.model_dump(exclude_unset=True).items() if k in fields and v is not None}
    if body.preferences is not None:
        updates["preferences_json"] = json.dumps(body.preferences)
    if updates:
        with connect() as c:
            try:
                c.execute("UPDATE users SET " + ",".join(f"{k}=?" for k in updates) + " WHERE id=?", [*updates.values(), user["id"]])
            except sqlite3.IntegrityError:
                raise HTTPException(409, "Email already in use")
            row = c.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    else:
        row = user
    return user_public(row)

@app.post("/api/profile/change-password")
def change_password(body: PasswordBody, user=Depends(current_user)):
    if not verify_password(body.currentPassword, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if body.newPassword != body.confirmPassword:
        raise HTTPException(400, "New password and confirmation do not match")
    if len(body.newPassword) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    with connect() as c:
        c.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash(body.newPassword), user["id"]))
    return {"success": True, "message": "Password updated successfully"}

@app.get("/api/files/{case_id}")
def download_scan(case_id: str, auth: str = "", authorization: Optional[str] = Header(None)):
    bearer = authorization.split(" ", 1)[1].strip() if authorization and authorization.lower().startswith("bearer ") else auth
    user_id = token_user(bearer)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    with connect() as c:
        account = c.execute("SELECT id,role FROM users WHERE id=?", (user_id,)).fetchone()
        if not account:
            raise HTTPException(status_code=401, detail="User not found")
        if account["role"] == "Patient":
            raise HTTPException(status_code=403, detail="Scan images are restricted to the clinical workspace.")
        row = c.execute("SELECT file_path FROM scans WHERE id=?", (case_id,)).fetchone()
    if not row or not row["file_path"] or not Path(row["file_path"]).exists():
        raise HTTPException(404, "No uploaded scan file found on disk for this case")
    p = Path(row["file_path"])
    return FileResponse(p, filename=p.name, media_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream", content_disposition_type="inline")

@app.get("/api/files/{case_id}/dicom-frames/{frame_index}")
def dicom_frame(case_id: str, frame_index: int, auth: str = "", authorization: Optional[str] = Header(None)):
    bearer = authorization.split(" ", 1)[1].strip() if authorization and authorization.lower().startswith("bearer ") else auth
    user_id = token_user(bearer)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    with connect() as c:
        account = c.execute("SELECT id,role FROM users WHERE id=?", (user_id,)).fetchone()
        row = c.execute("SELECT file_path FROM scans WHERE id=?", (case_id,)).fetchone()
    if not account or account["role"] == "Patient":
        raise HTTPException(status_code=403, detail="DICOM frames are restricted to the clinical workspace.")
    if not row or not row["file_path"] or not Path(row["file_path"]).is_file():
        raise HTTPException(404, "No uploaded DICOM study found")
    path = Path(row["file_path"])
    if path.suffix.lower() != ".dcm":
        raise HTTPException(415, "This study is not a single-file DICOM object")
    try:
        import pydicom
        ds = pydicom.dcmread(path)
        pixels = np.asarray(ds.pixel_array)
        frame_count = int(getattr(ds, "NumberOfFrames", 1))
        if frame_index < 0 or frame_index >= frame_count:
            raise HTTPException(404, f"Frame index must be between 0 and {frame_count - 1}")
        frame = pixels[frame_index] if frame_count > 1 else pixels
        if frame.ndim == 3 and frame.shape[-1] in (3, 4):
            image = Image.fromarray(frame.astype(np.uint8))
        else:
            values = frame.astype(np.float32) * float(getattr(ds, "RescaleSlope", 1)) + float(getattr(ds, "RescaleIntercept", 0))
            low, high = np.percentile(values, [1, 99])
            normalized = (np.clip((values - low) / max(float(high - low), 1e-6), 0, 1) * 255).astype(np.uint8)
            if str(getattr(ds, "PhotometricInterpretation", "")) == "MONOCHROME1":
                normalized = 255 - normalized
            image = Image.fromarray(normalized)
        buffer = io.BytesIO(); image.save(buffer, format="PNG")
        return Response(buffer.getvalue(), media_type="image/png", headers={"X-DICOM-Frame-Count": str(frame_count), "Cache-Control": "no-store"})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not decode DICOM frame: {exc}") from exc
