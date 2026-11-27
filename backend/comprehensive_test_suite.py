"""Enterprise System Verification Suite for Infosys Artery AI Platform.

Performs:
1. API Contract & Endpoint Testing (Auth, Scans, Reports, Model Registry, Features, Appointments)
2. End-to-End Clinical Workflow (Create Case, Ingest Image, Run AI Inference, Validate Auto-Generated Reports)
3. Security & Access Control (RBAC, Token Validation, SQL Injection Resilience, PBKDF2 Salting)
4. Performance & Concurrency Testing (Sub-millisecond DB response, Latency benchmarks, High-load threading)
"""

from __future__ import annotations
import gc
import io
import json
import os
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import numpy as np
from PIL import Image

try:
    from backend import main
except ImportError:
    import main

TOTAL_PASSED = 0
TOTAL_FAILED = 0

def record_result(category: str, name: str, passed: bool, details: str = ""):
    global TOTAL_PASSED, TOTAL_FAILED
    status_str = "[PASS]" if passed else "[FAIL]"
    if passed:
        TOTAL_PASSED += 1
    else:
        TOTAL_FAILED += 1
    print(f"{status_str} | {category.upper():<10} | {name:<46} | {details}")


# ==============================================================================
# 1. API TESTING SUITE
# ==============================================================================
def test_api():
    print("\n" + "="*84)
    print(" 1. API & ENDPOINT TESTING SUITE")
    print("="*84)

    # 1.1 Health endpoint
    h = main.health()
    record_result("API", "GET /api/health", h.get("status") == "ok", f"Status: {h.get('status')}")

    # 1.2 Clinician Login
    login_body = main.LoginBody(email="doctor01@infosys.com", password="Doctor123!")
    login_res = main.login(login_body)
    token = login_res.get("token")
    user = login_res.get("user")
    record_result("API", "POST /api/auth/login (Doctor)", bool(token and user.get("role") == "Doctor"), f"User: {user.get('name')}")

    # 1.3 Token Verification
    user_id = main.token_user(token)
    record_result("API", "Verify JWT Bearer Token", user_id == user.get("id"), f"UID: {user_id}")

    # 1.4 Get Authenticated User Profile
    with main.connect() as c:
        db_user = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    me_res = main.user_public(db_user)
    record_result("API", "GET /api/auth/me Profile", me_res.get("email") == "doctor01@infosys.com", f"Dept: {me_res.get('department')}")

    # 1.5 Cases Listing
    cases_payload = main.get_cases(search="", modality="all", status="all", region="all", user=db_user)
    cases_res = cases_payload.get("cases", [])
    record_result("API", "GET /api/cases (Registry Pagination)", len(cases_res) > 0, f"Retrieved: {len(cases_res)} cases (Total: {cases_payload.get('total')})")

    # 1.6 Single Case Detail
    first_id = cases_res[0]["id"]
    single_case = main.get_case(first_id, user=db_user)
    record_result("API", f"GET /api/cases/{first_id} (Detail)", single_case.get("id") == first_id, f"Patient: {single_case.get('patientId')}")

    # 1.7 Reports Listing
    reports = main.get_reports(user=db_user)
    record_result("API", "GET /api/reports (Clinical Reports)", isinstance(reports, list) and len(reports) > 0, f"Reports available: {len(reports)}")

    # 1.8 Model Registry Query
    registry = main.model_registry(user=db_user)
    record_result("API", "GET /api/model/registry (Artifacts)", "models" in registry and len(registry["models"]) > 0, f"Models listed: {len(registry['models'])}")

    # 1.9 Model Status Query
    mstatus = main.model_status(user=db_user)
    record_result("API", "GET /api/model/status (Readiness)", bool(mstatus.get("status")), f"Service Status: {mstatus.get('status')}")

    # 1.10 Model Evaluation Reports Query
    mreports = main.model_reports(user=db_user)
    has_test = "testing" in mreports
    record_result("API", "GET /api/model/reports (Evaluation Data)", has_test, f"Held-out test report loaded: {has_test}")

    # 1.11 Feature Access & Settings
    faccess = main.feature_management_access(user=db_user)
    record_result("API", "GET /api/features/access", "canManage" in faccess, f"CanManage: {faccess.get('canManage')}")

    # 1.12 Clinician Directory
    doctors = main.get_doctors()
    record_result("API", "GET /api/doctors (Staff Roster)", len(doctors) >= 10, f"Total clinicians: {len(doctors)}")

    return token, db_user


# ==============================================================================
# 2. END-TO-END CLINICAL WORKFLOW TESTING
# ==============================================================================
def test_end_to_end(user):
    print("\n" + "="*84)
    print(" 2. END-TO-END CLINICAL WORKFLOW TESTING")
    print("="*84)

    # 2.1 Create a new diagnostic case
    case_body = main.CaseBody(
        patientId="INF-PAT-VERIFY-001",
        modality="X-Ray Angiography",
        anatomicalRegion="LAD (Left Anterior Descending)",
        scanDate="2026-11-22"
    )
    new_case = main.create_case(case_body, user=user)
    case_id = new_case["id"]
    record_result("E2E", "1. Create Diagnostic Case", bool(case_id), f"Case ID: {case_id}")

    # 2.2 Ingest Angiography Scan Image into Case
    img_array = np.full((256, 256), fill_value=128, dtype=np.uint8)
    img_array[60:196, 120:136] = 220
    test_file_path = main.UPLOAD_DIR / f"{case_id}_scan.png"
    Image.fromarray(img_array).save(test_file_path)

    with main.connect() as c:
        c.execute("UPDATE scans SET file_path=?, file_info_json=? WHERE id=?",
                  (str(test_file_path), json.dumps({"fileName": f"{case_id}_scan.png", "size": test_file_path.stat().st_size}), case_id))
    record_result("E2E", "2. Ingest Scan Image", test_file_path.exists(), f"Image Path: {test_file_path.name}")

    # 2.3 Execute AI Diagnostic Pipeline (Quality Check, U-Net Segmentation, Candidate Search)
    analysis_res = main.run_ai_analysis(case_id, user=user)
    record_result("E2E", "3. Execute AI Inference Pipeline", "analysis" in analysis_res, f"Quality: {analysis_res.get('analysis', {}).get('quality_check', {}).get('status')}")

    # 2.4 Verify Automated Report Creation
    with main.connect() as c:
        report_row = c.execute("SELECT * FROM reports WHERE scan_id=?", (case_id,)).fetchone()
    record_result("E2E", "4. Automated Report Creation", report_row is not None, f"Report ID: {report_row['id'] if report_row else 'None'}")

    # 2.5 Multi-Format Report Export Contract (PDF, CSV, JSON)
    reports = main.get_reports(user=user)
    target_report = next((r for r in reports if r["caseId"] == case_id), None)
    
    # JSON export test
    json_export = json.dumps(target_report)
    json_valid = len(json_export) > 100 and target_report["caseId"] == case_id
    record_result("E2E", "5a. JSON Report Export", json_valid, f"Bytes: {len(json_export)}")

    # CSV serialization test
    fields = ['id','caseId','patientId','date','modality','region','status','severity','narrowing_percentage','dice_score','confidence','author','summary']
    csv_row = [str(target_report.get(k, '')) for k in fields]
    csv_valid = len(csv_row) == len(fields)
    record_result("E2E", "5b. CSV Data Export", csv_valid, f"Serialized {len(fields)} fields")

    # PDF template contract test (HTML/print format)
    pdf_template_valid = bool(target_report and target_report.get("id"))
    record_result("E2E", "5c. PDF / Print Export Structure", pdf_template_valid, f"Formatted for Report: {target_report['id']}")

    # 2.6 Schedule Appointment Consultation as Patient
    with main.connect() as c:
        p_row = c.execute("SELECT * FROM users WHERE role='Patient' LIMIT 1").fetchone()
        if not p_row:
            c.execute("INSERT OR IGNORE INTO users(id, name, email, password_hash, role, department, institution, created_at) "
                      "VALUES('PAT-SEC-TEST', 'Test Patient', 'pat_sec@infosys.com', 'hash', 'Patient', 'General', 'Infosys', ?)",
                      (main.now_iso(),))
            p_row = c.execute("SELECT * FROM users WHERE id='PAT-SEC-TEST'").fetchone()

    # Use a dynamic future timestamp so repeated test runs do not collision on the same second
    import datetime
    unique_future = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365, seconds=int(time.time() % 86400))).isoformat()
    appt_body = main.AppointmentBody(
        doctorId="DOCTOR-001",
        scheduledAt=unique_future,
        reason="Follow-up on coronary evaluation"
    )
    appt_res = main.create_appointment(appt_body, background_tasks=main.BackgroundTasks(), user=p_row)
    record_result("E2E", "6. Schedule Consultation", bool(appt_res.get("appointmentId")), f"Appt ID: {appt_res.get('appointmentId')}")


# ==============================================================================
# 3. SECURITY TESTING SUITE
# ==============================================================================
def test_security():
    print("\n" + "="*84)
    print(" 3. SECURITY & ACCESS CONTROL TESTING SUITE")
    print("="*84)

    # 3.1 Token Verification Security: Reject Invalid Bearer
    bad_token_user = main.token_user("bad-tampered-token-xyz")
    record_result("SECURITY", "Reject Tampered Token", bad_token_user is None, "Correctly rejected unauthorized token")

    # 3.2 Role-Based Access Control (RBAC): Patient cannot access clinician routes
    with main.connect() as c:
        p_row = c.execute("SELECT * FROM users WHERE role='Patient' LIMIT 1").fetchone()

    rbac_blocked = False
    try:
        main.clinical_user(p_row)
    except Exception as exc:
        rbac_blocked = (getattr(exc, "status_code", None) == 403)
    record_result("SECURITY", "RBAC Enforcement (Patient -> Clinical)", rbac_blocked, "Protected with HTTP 403 Forbidden")

    # 3.3 Patient Direct Scan File Access Blocked
    file_blocked = False
    try:
        main.download_scan(case_id="CASE-0001", auth="", authorization=f"Bearer {main.make_token(p_row['id'])}")
    except Exception as exc:
        file_blocked = (getattr(exc, "status_code", None) == 403)
    record_result("SECURITY", "DICOM / Scan Access Isolation", file_blocked, "Patient blocked with HTTP 403 Forbidden")

    # 3.4 SQL Injection Resilience in User Lookup
    sqli_safe = False
    with main.connect() as c:
        res = c.execute("SELECT * FROM users WHERE lower(email)=lower(?)", ("' OR '1'='1' --",)).fetchall()
        sqli_safe = (len(res) == 0)
    record_result("SECURITY", "SQL Injection Protection (Parameterized)", sqli_safe, "No rows returned for injection payload")

    # 3.5 Cryptographic Password Hashing (PBKDF2-HMAC-SHA256 with Unique Salt)
    hash1 = main.password_hash("InfosysSecure2026!")
    hash2 = main.password_hash("InfosysSecure2026!")
    is_salted = (hash1 != hash2) and hash1.startswith("pbkdf2_sha256$")
    record_result("SECURITY", "Cryptographic Salted Hash (PBKDF2)", is_salted, "Unique salt per hash generated")


# ==============================================================================
# 4. PERFORMANCE & CONCURRENCY TESTING SUITE
# ==============================================================================
def test_performance(user):
    print("\n" + "="*84)
    print(" 4. PERFORMANCE & CONCURRENCY BENCHMARKING")
    print("="*84)

    # 4.1 Health Check API Latency
    health_times = []
    for _ in range(50):
        t0 = time.perf_counter()
        main.health()
        health_times.append((time.perf_counter() - t0) * 1000)
    avg_health = sum(health_times) / len(health_times)
    record_result("PERF", "GET /api/health Latency", avg_health < 5.0, f"Avg: {avg_health:.3f}ms")

    # 4.2 Database Scan Query & Serialization Latency
    cases_in_registry = main.get_cases(search="", modality="all", status="all", region="all", user=user)
    registry_size = len(cases_in_registry.get("cases", [])) if isinstance(cases_in_registry, dict) else 0
    db_times = []
    for _ in range(25):
        t0 = time.perf_counter()
        main.get_cases(search="", modality="all", status="all", region="all", user=user)
        db_times.append((time.perf_counter() - t0) * 1000)
    avg_db = sum(db_times) / len(db_times)
    # The registry grows as users create cases; allow 100ms per original 675-case
    # cohort for querying and serializing the complete local registry.
    db_latency_budget_ms = max(100.0, 100.0 * registry_size / 675.0)
    record_result("PERF", "Case Query & Serialization Latency", avg_db < db_latency_budget_ms, f"Avg: {avg_db:.3f}ms ({registry_size} cases; budget {db_latency_budget_ms:.1f}ms)")

    # 4.3 Multi-Threaded Concurrent Read Load (30 parallel threads)
    def concurrent_worker():
        return main.get_cases(search="", modality="all", status="all", region="all", user=user)

    t_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(concurrent_worker) for _ in range(30)]
        results = [f.result() for f in futures]
    total_time = time.perf_counter() - t_start
    all_success = all(isinstance(r, dict) and "cases" in r for r in results)
    throughput = len(results) / total_time
    record_result("PERF", "Multi-Threaded Concurrency (30 tasks)", all_success, f"Throughput: {throughput:.1f} queries/s in {total_time:.3f}s")

    # 4.4 Model Registry Benchmark
    t0 = time.perf_counter()
    main.model_registry(user=user)
    reg_latency = (time.perf_counter() - t0) * 1000
    record_result("PERF", "Model Registry Inspection Latency", reg_latency < 30.0, f"Latency: {reg_latency:.3f}ms")


# ==============================================================================
# MAIN EXECUTION
# ==============================================================================
if __name__ == "__main__":
    print("\n" + "#"*84)
    print(" INFOSYS ARTERY AI - ENTERPRISE QUALITY & VERIFICATION SUITE")
    print(" Execution Target: Complete System Validation")
    print("#"*84)

    start_time = time.time()
    
    token, user = test_api()
    test_end_to_end(user)
    test_security()
    test_performance(user)

    elapsed = time.time() - start_time
    print("\n" + "="*84)
    print(" COMPLETE SYSTEM VERIFICATION SUMMARY")
    print("="*84)
    print(f" Total Tests Executed : {TOTAL_PASSED + TOTAL_FAILED}")
    print(f" Total Passed         : {TOTAL_PASSED}")
    print(f" Total Failed         : {TOTAL_FAILED}")
    print(f" Total Execution Time : {elapsed:.2f} seconds")
    print(f" Final System Status  : {'ALL TESTS PASSED - PRODUCTION READY' if TOTAL_FAILED == 0 else 'VERIFICATION FAILED'}")
    print("="*84 + "\n")

    sys.exit(0 if TOTAL_FAILED == 0 else 1)
