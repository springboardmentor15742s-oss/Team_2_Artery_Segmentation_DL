"""FastAPI backend for Artery AI internship project.

Research prototype: manages cases, uploads, notifications, profiles and reports.
It does NOT perform AI segmentation/stenosis inference until a trained model is integrated.
"""
from __future__ import annotations
import os, re, json, hmac, hashlib, secrets, sqlite3, mimetypes
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, Any
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("ARTERY_DB_PATH", str(BASE_DIR / "artery_ai.db")))
UPLOAD_DIR = Path(os.getenv("ARTERY_UPLOAD_DIR", str(BASE_DIR / "storage" / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 300 * 1024 * 1024
ALLOWED_EXTS = (".dcm", ".nii", ".nii.gz", ".mhd", ".raw", ".png", ".jpg", ".jpeg")
SECRET = os.getenv("ARTERY_SECRET_KEY", "dev-only-change-this-secret-before-deployment").encode()

app = FastAPI(title="Artery AI Backend", version="1.1.0", description="Research prototype API for artery segmentation workflow")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def now_iso(): return datetime.now(timezone.utc).isoformat()
def connect():
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

def json_load(v, fallback=None):
    try: return json.loads(v) if v else (fallback if fallback is not None else {})
    except Exception: return fallback if fallback is not None else {}

def rowdict(row): return dict(row) if row else None

def init_db():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Medical Researcher',
          department TEXT DEFAULT '', institution TEXT DEFAULT '', phone TEXT DEFAULT '',
          license_number TEXT DEFAULT '', preferences_json TEXT NOT NULL DEFAULT '{}',
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
          model_version TEXT DEFAULT 'not-configured', file_info_json TEXT,
          file_path TEXT, created_at TEXT NOT NULL, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS annotations (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          annotation_type TEXT NOT NULL, file_path TEXT, version TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analysis_jobs (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          model_version TEXT, status TEXT NOT NULL DEFAULT 'Pending', message TEXT DEFAULT '',
          created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS segmentation_results (
          id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
          mask_path TEXT, dice_score REAL, iou_score REAL, quality_status TEXT DEFAULT 'Not evaluated',
          metrics_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS stenosis_findings (
          id TEXT PRIMARY KEY, result_id TEXT NOT NULL REFERENCES segmentation_results(id) ON DELETE CASCADE,
          vessel_segment TEXT DEFAULT '', location_json TEXT NOT NULL DEFAULT '{}',
          reference_diameter_mm REAL, minimum_diameter_mm REAL, estimated_narrowing_percent REAL,
          validation_status TEXT DEFAULT 'Not validated', notes TEXT DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
          report_path TEXT, status TEXT DEFAULT 'Pending', summary TEXT DEFAULT '', author TEXT DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY, type TEXT, title TEXT, message TEXT, case_id TEXT,
          patient_id TEXT, read INTEGER DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL,
          entity_type TEXT, entity_id TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scans_patient ON scans(patient_id);
        CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_scan ON analysis_jobs(scan_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
        ''')
        # Local demo login. Change credentials before any shared deployment.
        demo_accounts = [
            ("USR-DEMO", "Demo Researcher", "demo@artery.ai", "Demo1234!", "Medical Researcher"),
            ("USR-1042", "Dr. Sarah Mitchell", "s.mitchell@hospital.med.org", "Password123!", "Radiologist / Clinician"),
        ]
        for uid, name, email, password, role in demo_accounts:
            if not c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                c.execute("INSERT INTO users(id,name,email,password_hash,role,department,institution,created_at) VALUES(?,?,?,?,?,?,?,?)",
                          (uid, name, email, password_hash(password), role, "Cardiovascular Imaging", "Internship Prototype", now_iso()))
        # Seed the frontend's clearly synthetic demo records once so the dashboard
        # remains populated on first run. These are not real patient records or AI results.
        seed_path = BASE_DIR / "demo_seed.json"
        if seed_path.exists() and not c.execute("SELECT 1 FROM scans LIMIT 1").fetchone():
            try:
                seed = json.loads(seed_path.read_text(encoding="utf-8"))
                for item in seed.get("cases", []):
                    pid = item.get("patientId", "DEMO-PATIENT")
                    c.execute("INSERT OR IGNORE INTO patients(patient_id,age,gender,medical_history,risk_factors_json,created_at) VALUES(?,?,?,?,?,?)",
                              (pid, item.get("age"), item.get("gender", "Not Specified"), item.get("medicalHistory", ""), json.dumps(item.get("riskFactors", [])), item.get("createdAt") or now_iso()))
                    c.execute("INSERT OR IGNORE INTO scans(id,patient_id,modality,anatomical_region,scan_date,clinical_notes,status,model_version,file_info_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                              (item["id"], pid, item.get("modality", "CTA"), item.get("anatomicalRegion", "Coronary Arteries"), item.get("scanDate"), item.get("clinicalNotes", ""), item.get("status", "Pending"), item.get("modelVersion", "not-configured"), json.dumps(item.get("fileInfo")) if item.get("fileInfo") else None, item.get("createdAt") or now_iso()))
                for item in seed.get("notifications", []):
                    c.execute("INSERT OR IGNORE INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,?,?)",
                              (item["id"], item.get("type", "system_info"), item.get("title", "Demo notification"), item.get("message", "Synthetic demo notification"), item.get("caseId"), item.get("patientId"), 1 if item.get("read") else 0, now_iso()))
                for item in seed.get("reports", []):
                    if c.execute("SELECT 1 FROM scans WHERE id=?", (item.get("caseId"),)).fetchone():
                        c.execute("INSERT OR IGNORE INTO reports(id,scan_id,status,summary,author,created_at) VALUES(?,?,?,?,?,?)",
                                  (item["id"], item["caseId"], item.get("status", "Pending"), item.get("summary", "Demo report"), item.get("author", "Demo user"), now_iso()))
            except Exception as exc:
                print(f"Warning: demo seed was skipped: {exc}")


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"
def verify_password(password, stored):
    try:
        scheme, salt, digest = stored.split("$", 2)
        return scheme == "pbkdf2_sha256" and hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex(), digest)
    except Exception: return False

def make_token(user_id: str):
    # Compact signed token using stdlib; intended for local internship prototype.
    expires = int((datetime.now(timezone.utc) + timedelta(hours=12)).timestamp())
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
        if not hmac.compare_digest(sig, expected) or int(exp) < int(datetime.now(timezone.utc).timestamp()): return None
        return user_id
    except Exception: return None

def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    user_id = token_user(authorization.split(" ",1)[1].strip())
    if not user_id: raise HTTPException(401, "Invalid or expired token")
    with connect() as c: row = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row: raise HTTPException(401, "User not found")
    return rowdict(row)

def user_public(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"],
            "department": row["department"], "institution": row["institution"], "phone": row["phone"],
            "licenseNumber": row["license_number"], "preferences": json_load(row["preferences_json"], {})}

def case_public(row):
    return {"id": row["id"], "patientId": row["patient_id"], "age": row["age"], "gender": row["gender"],
      "medicalHistory": row["medical_history"], "riskFactors": json_load(row["risk_factors_json"], []),
      "clinicalNotes": row["clinical_notes"], "modality": row["modality"], "scanDate": row["scan_date"],
      "anatomicalRegion": row["anatomical_region"], "status": row["status"], "modelVersion": row["model_version"],
      "createdAt": row["created_at"], "updatedAt": row["updated_at"], "fileInfo": json_load(row["file_info_json"], None)}

class LoginBody(BaseModel): email: str; password: str
class RegisterBody(BaseModel): fullName: str; email: str; password: str; role: str = "Medical Researcher"
class CaseBody(BaseModel):
    patientId: str; age: Optional[int] = None; gender: Optional[str] = "Not Specified"
    medicalHistory: Optional[str] = ""; riskFactors: list[str] = Field(default_factory=list)
    clinicalNotes: Optional[str] = ""; modality: str; scanDate: Optional[str] = None
    anatomicalRegion: str; id: Optional[str] = None
class ProfileBody(BaseModel): name: Optional[str] = None; email: Optional[str] = None; department: Optional[str] = None; institution: Optional[str] = None; phone: Optional[str] = None; licenseNumber: Optional[str] = None; preferences: Optional[dict] = None
class PasswordBody(BaseModel): currentPassword: str; newPassword: str; confirmPassword: str

@app.on_event("startup")
def startup(): init_db()

@app.get("/api/health")
def health(): return {"status":"ok", "service":"artery-ai-backend", "time":now_iso(), "ai_model":"not-configured"}
@app.get("/")
def root(): return {"message":"Artery AI API is running", "docs":"/docs", "health":"/api/health"}

@app.post("/api/auth/login")
def login(body: LoginBody):
    with connect() as c: row = c.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (body.email.strip(),)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]): raise HTTPException(401, "Invalid email or password")
    return {"success":True, "token":make_token(row["id"]), "user":user_public(row)}
@app.post("/api/auth/register")
def register(body: RegisterBody):
    if len(body.password) < 8: raise HTTPException(400, "Password must be at least 8 characters")
    uid = "USR-" + secrets.token_hex(4).upper()
    try:
        with connect() as c:
            c.execute("INSERT INTO users(id,name,email,password_hash,role,department,institution,created_at) VALUES(?,?,?,?,?,?,?,?)",
              (uid, body.fullName.strip(), body.email.strip().lower(), password_hash(body.password), body.role, "Cardiovascular Imaging", "Research Institution", now_iso()))
            row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    except sqlite3.IntegrityError: raise HTTPException(409, "An account with this email already exists")
    return {"success":True,"token":make_token(uid),"user":user_public(row)}
@app.get("/api/auth/me")
def me(user=Depends(current_user)): return {"user":user_public(user)}
@app.post("/api/auth/logout")
def logout(user=Depends(current_user)): return {"success":True}

@app.get("/api/cases")
def get_cases(search: str="", modality: str="all", status: str="all", region: str="all", user=Depends(current_user)):
    query = "SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE 1=1"
    args=[]
    if search:
        query += " AND (lower(s.id) LIKE ? OR lower(s.patient_id) LIKE ? OR lower(s.anatomical_region) LIKE ? OR lower(s.modality) LIKE ?)"
        q=f"%{search.lower().strip()}%"; args += [q,q,q,q]
    if modality and modality != "all": query += " AND s.modality LIKE ?"; args.append(f"%{modality}%")
    if status and status != "all": query += " AND s.status=?"; args.append(status)
    if region and region != "all": query += " AND s.anatomical_region=?"; args.append(region)
    query += " ORDER BY s.created_at DESC"
    with connect() as c: rows=c.execute(query,args).fetchall()
    cases=[case_public(r) for r in rows]
    return {"total":len(cases), "cases":cases}
@app.post("/api/cases")
def create_case(body: CaseBody, user=Depends(current_user)):
    case_id = body.id.strip() if body.id else "CAS-" + datetime.now().strftime("%Y%m%d") + "-" + secrets.token_hex(2).upper()
    patient_id=body.patientId.strip().upper()
    with connect() as c:
        if c.execute("SELECT 1 FROM scans WHERE id=?",(case_id,)).fetchone(): raise HTTPException(409,"Case ID already exists")
        c.execute("INSERT INTO patients(patient_id,age,gender,medical_history,risk_factors_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(patient_id) DO UPDATE SET age=excluded.age,gender=excluded.gender,medical_history=excluded.medical_history,risk_factors_json=excluded.risk_factors_json",
          (patient_id,body.age,body.gender or "Not Specified",body.medicalHistory or "",json.dumps(body.riskFactors),now_iso()))
        c.execute("INSERT INTO scans(id,patient_id,modality,anatomical_region,scan_date,clinical_notes,status,model_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          (case_id,patient_id,body.modality,body.anatomicalRegion,body.scanDate or datetime.now().date().isoformat(),body.clinicalNotes or "","Pending","not-configured",now_iso()))
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",(user["id"],"create_case","scan",case_id,now_iso()))
        row=c.execute("SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE s.id=?",(case_id,)).fetchone()
    return case_public(row)
@app.get("/api/cases/{case_id}")
def get_case(case_id: str, user=Depends(current_user)):
    with connect() as c: row=c.execute("SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE s.id=?",(case_id,)).fetchone()
    if not row: raise HTTPException(404,"Case not found")
    return case_public(row)
@app.patch("/api/cases/{case_id}")
def update_case(case_id: str, updates: dict[str,Any], user=Depends(current_user)):
    mapping={"status":"status","modelVersion":"model_version","clinicalNotes":"clinical_notes","scanDate":"scan_date","anatomicalRegion":"anatomical_region","modality":"modality"}
    allowed={mapping[k]:v for k,v in updates.items() if k in mapping}
    if not allowed: raise HTTPException(400,"No supported fields to update")
    allowed["updated_at"]=now_iso()
    with connect() as c:
        if not c.execute("SELECT 1 FROM scans WHERE id=?",(case_id,)).fetchone(): raise HTTPException(404,"Case not found")
        c.execute("UPDATE scans SET " + ",".join(f"{k}=?" for k in allowed) + " WHERE id=?", [*allowed.values(),case_id])
        row=c.execute("SELECT s.*,p.age,p.gender,p.medical_history,p.risk_factors_json FROM scans s JOIN patients p ON p.patient_id=s.patient_id WHERE s.id=?",(case_id,)).fetchone()
    return case_public(row)

@app.post("/api/cases/{case_id}/upload")
async def upload_medical_image(case_id: str, file: UploadFile=File(...), user=Depends(current_user)):
    name=Path(file.filename or "upload").name
    low=name.lower()
    if not any(low.endswith(ext) for ext in ALLOWED_EXTS): raise HTTPException(415,"Unsupported medical image format")
    with connect() as c:
        row=c.execute("SELECT * FROM scans WHERE id=?",(case_id,)).fetchone()
    if not row: raise HTTPException(404,"Case not found")
    case_dir=UPLOAD_DIR / re.sub(r"[^A-Za-z0-9_-]", "_", case_id); case_dir.mkdir(parents=True,exist_ok=True)
    safe_name=re.sub(r"[^A-Za-z0-9._-]", "_", name)
    dest=case_dir / (secrets.token_hex(5) + "_" + safe_name)
    total=0
    try:
        with dest.open("wb") as out:
            while True:
                chunk=await file.read(1024*1024)
                if not chunk: break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES: raise HTTPException(413,"File exceeds 300 MB limit")
                out.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True); raise
    finally: await file.close()
    if total == 0:
        dest.unlink(missing_ok=True); raise HTTPException(400,"Uploaded file is empty")
    size_mb=total/(1024*1024)
    file_type="NIfTI (.nii.gz)" if low.endswith((".nii.gz", ".nii")) else "DICOM (.dcm)" if low.endswith(".dcm") else "Medical Image"
    info={"fileName":name,"fileSize":f"{size_mb:.2f} MB","fileType":file_type,"uploadedAt":now_iso(),"uploadStatus":"Completed","preprocessingStatus":"Uploaded; AI model not configured","storedFileName":dest.name,"bytes":total}
    with connect() as c:
        c.execute("UPDATE scans SET file_info_json=?,file_path=?,status='Pending',updated_at=? WHERE id=?",(json.dumps(info),str(dest),now_iso(),case_id))
        c.execute("INSERT INTO analysis_jobs(id,scan_id,model_version,status,message,created_at) VALUES(?,?,?,?,?,?)",("JOB-"+secrets.token_hex(5).upper(),case_id,"not-configured","Pending","Upload stored. AI inference is not configured yet.",now_iso()))
        c.execute("INSERT INTO notifications(id,type,title,message,case_id,patient_id,read,created_at) VALUES(?,?,?,?,?,?,0,?)",("NOTIF-"+secrets.token_hex(5).upper(),"upload_completed","Scan Uploaded","File uploaded and linked to case. AI inference is not configured yet.",case_id,row["patient_id"],now_iso()))
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",(user["id"],"upload_scan","scan",case_id,now_iso()))
    return {"success":True,"fileInfo":info,"message":"File stored successfully. AI analysis is not configured yet."}

@app.post("/api/preprocessing/{case_id}")
def run_initial_preprocessing(case_id: str, user=Depends(current_user)):
    """Run safe initial file checks and extract available image metadata.

    This is a validation/metadata pipeline only; it does not normalize voxel data,
    generate masks, or run AI inference.
    """
    with connect() as c:
        row = c.execute("SELECT * FROM scans WHERE id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Case not found")
    if not row["file_path"] or not Path(row["file_path"]).is_file():
        raise HTTPException(404, "Upload a medical image before running preprocessing checks")
    path = Path(row["file_path"])
    size = path.stat().st_size
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    low = path.name.lower()
    fmt = "NIfTI" if low.endswith((".nii", ".nii.gz")) else "DICOM" if low.endswith(".dcm") else "MetaImage" if low.endswith((".mhd", ".raw")) else "2D image / unsupported volumetric format"
    metadata = {"format": fmt, "fileName": path.name, "sizeBytes": size, "sha256": digest.hexdigest(), "readable": True}
    notes = ["File exists and is readable", "File size is within upload limit", "SHA-256 checksum generated"]
    warnings = []
    if fmt == "NIfTI":
        try:
            import nibabel as nib
            image = nib.load(str(path))
            metadata.update({"shape": list(image.shape), "voxelSpacingMm": [round(float(x), 5) for x in image.header.get_zooms()[:len(image.shape)]], "dataType": str(image.get_data_dtype()), "affine": image.affine.tolist()})
            notes.append("NIfTI header parsed successfully")
        except ImportError:
            warnings.append("Install optional imaging packages from requirements-imaging.txt to inspect NIfTI dimensions and voxel spacing")
        except Exception as exc:
            metadata["readable"] = False
            warnings.append("NIfTI header could not be parsed: " + str(exc)[:180])
    elif fmt == "DICOM":
        try:
            import pydicom
            ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=False)
            metadata.update({"rows": int(ds.Rows) if hasattr(ds, "Rows") else None, "columns": int(ds.Columns) if hasattr(ds, "Columns") else None, "modality": str(getattr(ds, "Modality", "Unknown")), "pixelSpacing": [float(x) for x in getattr(ds, "PixelSpacing", [])]})
            notes.append("DICOM header parsed successfully")
        except ImportError:
            warnings.append("Install optional imaging packages from requirements-imaging.txt to inspect DICOM metadata")
        except Exception as exc:
            metadata["readable"] = False
            warnings.append("DICOM header could not be parsed: " + str(exc)[:180])
    else:
        warnings.append("Detailed 3D metadata inspection is not available for this file type in the initial pipeline")
    if metadata["readable"]:
        status = "Validation checks passed"
        next_step = "Ready for format-specific preprocessing; segmentation model is not connected"
    else:
        status = "Validation failed"
        next_step = "Check the file format and upload a valid medical image"
    result = {"caseId": case_id, "status": status, "pipelineType": "initial-validation-only", "metadata": metadata, "checks": notes, "warnings": warnings, "nextStep": next_step, "modelConfigured": False, "clinicalDisclaimer": "Research prototype only; no diagnosis or segmentation inference was performed."}
    # Keep a record in the case file-info metadata for traceability.
    with connect() as c:
        existing = json_load(row["file_info_json"], {})
        existing["preprocessingCheck"] = result
        c.execute("UPDATE scans SET file_info_json=?, updated_at=? WHERE id=?", (json.dumps(existing), now_iso(), case_id))
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"], "preprocessing_validation", "scan", case_id, now_iso()))
    return result

@app.get("/api/notifications")
def get_notifications(user=Depends(current_user)):
    with connect() as c: rows=c.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200").fetchall()
    return [{"id":r["id"],"type":r["type"],"title":r["title"],"message":r["message"],"caseId":r["case_id"],"patientId":r["patient_id"],"timestamp":r["created_at"],"read":bool(r["read"])} for r in rows]
@app.patch("/api/notifications/{notification_id}/read")
def mark_notification(notification_id: str, user=Depends(current_user)):
    with connect() as c:
        cur=c.execute("UPDATE notifications SET read=1 WHERE id=?",(notification_id,))
        if cur.rowcount==0: raise HTTPException(404,"Notification not found")
    return {"success":True}
@app.post("/api/notifications/read-all")
def mark_all_notifications(user=Depends(current_user)):
    with connect() as c: c.execute("UPDATE notifications SET read=1")
    return {"success":True}
@app.delete("/api/notifications")
def clear_notifications(user=Depends(current_user)):
    with connect() as c: c.execute("DELETE FROM notifications")
    return []
@app.get("/api/reports")
def get_reports(user=Depends(current_user)):
    with connect() as c:
        rows=c.execute("SELECT r.*,s.patient_id,s.modality,s.anatomical_region,s.scan_date FROM reports r JOIN scans s ON s.id=r.scan_id ORDER BY r.created_at DESC").fetchall()
    return [{"id":r["id"],"caseId":r["scan_id"],"patientId":r["patient_id"],"date":r["scan_date"],"modality":r["modality"].split(" ")[0],"region":r["anatomical_region"],"status":r["status"],"author":r["author"],"summary":r["summary"]} for r in rows]
@app.get("/api/profile")
def get_profile(user=Depends(current_user)): return user_public(user)
@app.patch("/api/profile")
def update_profile(body: ProfileBody, user=Depends(current_user)):
    fields={"name":"name","email":"email","department":"department","institution":"institution","phone":"phone","licenseNumber":"license_number"}
    updates={fields[k]:v for k,v in body.model_dump(exclude_unset=True).items() if k in fields and v is not None}
    if body.preferences is not None: updates["preferences_json"]=json.dumps(body.preferences)
    if updates:
        with connect() as c:
            try: c.execute("UPDATE users SET " + ",".join(f"{k}=?" for k in updates) + " WHERE id=?",[*updates.values(),user["id"]])
            except sqlite3.IntegrityError: raise HTTPException(409,"Email already in use")
            row=c.execute("SELECT * FROM users WHERE id=?",(user["id"],)).fetchone()
    else: row=user
    return user_public(row)
@app.post("/api/profile/change-password")
def change_password(body: PasswordBody, user=Depends(current_user)):
    if not verify_password(body.currentPassword,user["password_hash"]): raise HTTPException(400,"Current password is incorrect")
    if body.newPassword != body.confirmPassword: raise HTTPException(400,"New password and confirmation do not match")
    if len(body.newPassword)<8: raise HTTPException(400,"New password must be at least 8 characters")
    with connect() as c: c.execute("UPDATE users SET password_hash=? WHERE id=?",(password_hash(body.newPassword),user["id"]))
    return {"success":True,"message":"Password updated successfully"}

@app.get("/api/analysis/{case_id}")
def analysis_status(case_id: str, user=Depends(current_user)):
    with connect() as c:
        if not c.execute("SELECT 1 FROM scans WHERE id=?",(case_id,)).fetchone(): raise HTTPException(404,"Case not found")
        rows=c.execute("SELECT * FROM analysis_jobs WHERE scan_id=? ORDER BY created_at DESC",(case_id,)).fetchall()
    return {"caseId":case_id,"modelConfigured":False,"status":rows[0]["status"] if rows else "Not started","message":"Upload and case management are connected. Integrate a trained segmentation model to enable AI inference.","jobs":[dict(r) for r in rows]}

@app.get("/api/files/{case_id}")
def download_scan(case_id: str, user=Depends(current_user)):
    with connect() as c: row=c.execute("SELECT file_path FROM scans WHERE id=?",(case_id,)).fetchone()
    if not row or not row["file_path"] or not Path(row["file_path"]).exists(): raise HTTPException(404,"No uploaded file found")
    p=Path(row["file_path"])
    return FileResponse(p, filename=p.name, media_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream")
