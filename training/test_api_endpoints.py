"""
API Test Suite for Infosys Artery AI
Tests all major REST endpoints:
- Health, Docs, OpenAPI
- Authentication & Login
- Cases & Case Details
- Diagnostic Analysis Pipeline
- Model Status, Reports & Full Comparison
- Reports List & Export (CSV, JSON)
- Notifications & Doctors
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "training"))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from backend.main import app

def run_api_tests():
    print("=" * 80)
    print("  INFOSYS ARTERY AI — FASTAPI ENDPOINT VERIFICATION SUITE")
    print("=" * 80)
    client = TestClient(app)
    results = {}

    # 1. Health check
    r = client.get("/api/health")
    ok_1 = r.status_code == 200 and r.json().get("status") == "ok"
    print(f"1. GET /api/health -> {r.status_code} ({'PASS' if ok_1 else 'FAIL'})")
    results["1_health_check"] = ok_1

    # 2. OpenAPI Docs
    r = client.get("/docs")
    ok_2 = r.status_code == 200
    print(f"2. GET /docs -> {r.status_code} ({'PASS' if ok_2 else 'FAIL'})")
    results["2_openapi_docs"] = ok_2

    # 3. Doctor Login
    r = client.post("/api/auth/login", json={"email": "doctor01@infosys.com", "password": "Doctor123!"})
    ok_3 = r.status_code == 200 and "token" in r.json()
    token = r.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    print(f"3. POST /api/auth/login -> {r.status_code} (User: {r.json().get('user', {}).get('name')}) ({'PASS' if ok_3 else 'FAIL'})")
    results["3_auth_login"] = ok_3

    # 4. User Profile
    r = client.get("/api/auth/me", headers=headers)
    ok_4 = r.status_code == 200 and r.json().get("user", {}).get("role") == "Doctor"
    print(f"4. GET /api/auth/me -> {r.status_code} ({'PASS' if ok_4 else 'FAIL'})")
    results["4_auth_me"] = ok_4

    # 5. Cases List
    r = client.get("/api/cases", headers=headers)
    cases = r.json().get("cases", [])
    ok_5 = r.status_code == 200 and len(cases) > 0
    print(f"5. GET /api/cases -> {r.status_code} ({len(cases)} cases found) ({'PASS' if ok_5 else 'FAIL'})")
    results["5_cases_list"] = ok_5

    # 6. Specific Case Details
    sample_cid = cases[0]["id"]
    r = client.get(f"/api/cases/{sample_cid}", headers=headers)
    ok_6 = r.status_code == 200 and r.json().get("id") == sample_cid
    print(f"6. GET /api/cases/{sample_cid} -> {r.status_code} ({'PASS' if ok_6 else 'FAIL'})")
    results["6_case_details"] = ok_6

    # 7. Case Analysis
    r = client.get(f"/api/cases/{sample_cid}/analysis", headers=headers)
    ok_7 = r.status_code == 200
    print(f"7. GET /api/cases/{sample_cid}/analysis -> {r.status_code} ({'PASS' if ok_7 else 'FAIL'})")
    results["7_case_analysis"] = ok_7

    # 8. Model Status
    r = client.get("/api/model/status", headers=headers)
    data = r.json()
    ok_8 = r.status_code == 200 and data.get("deep_segmentation_loaded") and data.get("stenosis_classifier_loaded")
    print(f"8. GET /api/model/status -> {r.status_code} (SegLoaded: {data.get('deep_segmentation_loaded')}, ResNetLoaded: {data.get('stenosis_classifier_loaded')}) ({'PASS' if ok_8 else 'FAIL'})")
    results["8_model_status"] = ok_8

    # 9. Model Reports Catalog
    r = client.get("/api/model/reports", headers=headers)
    ok_9 = r.status_code == 200 and "requirement_1_segmentation" in r.json() and "requirement_3_classifier" in r.json()
    print(f"9. GET /api/model/reports -> {r.status_code} ({'PASS' if ok_9 else 'FAIL'})")
    results["9_model_reports"] = ok_9

    # 10. Comprehensive Model Comparison
    r = client.get("/api/model/full-comparison", headers=headers)
    comp = r.json()
    ok_10 = r.status_code == 200 and "task_1_segmentation" in comp and "task_2_stenosis_detection" in comp
    print(f"10. GET /api/model/full-comparison -> {r.status_code} ({'PASS' if ok_10 else 'FAIL'})")
    results["10_model_full_comparison"] = ok_10

    # 11. Reports List
    r = client.get("/api/reports", headers=headers)
    reports = r.json()
    ok_11 = r.status_code == 200 and isinstance(reports, list)
    print(f"11. GET /api/reports -> {r.status_code} ({len(reports)} reports) ({'PASS' if ok_11 else 'FAIL'})")
    results["11_reports_list"] = ok_11

    # 12. Reports Export CSV
    r = client.get("/api/reports/export?format=csv", headers=headers)
    ok_12 = r.status_code == 200 and "text/csv" in r.headers.get("content-type", "")
    print(f"12. GET /api/reports/export?format=csv -> {r.status_code} ({r.headers.get('content-type')}) ({'PASS' if ok_12 else 'FAIL'})")
    results["12_export_reports_csv"] = ok_12

    # 13. Reports Export JSON
    r = client.get("/api/reports/export?format=json", headers=headers)
    ok_13 = r.status_code == 200 and "application/json" in r.headers.get("content-type", "")
    print(f"13. GET /api/reports/export?format=json -> {r.status_code} ({r.headers.get('content-type')}) ({'PASS' if ok_13 else 'FAIL'})")
    results["13_export_reports_json"] = ok_13

    # 14. Single Case Report Export JSON & CSV
    r_j = client.get(f"/api/cases/{sample_cid}/report/export?format=json", headers=headers)
    r_c = client.get(f"/api/cases/{sample_cid}/report/export?format=csv", headers=headers)
    ok_14 = r_j.status_code == 200 and r_c.status_code == 200
    print(f"14. GET /api/cases/{sample_cid}/report/export -> JSON: {r_j.status_code}, CSV: {r_c.status_code} ({'PASS' if ok_14 else 'FAIL'})")
    results["14_export_single_case"] = ok_14

    # 15. Doctors Directory
    r = client.get("/api/doctors", headers=headers)
    ok_15 = r.status_code == 200 and len(r.json()) > 0
    print(f"15. GET /api/doctors -> {r.status_code} ({len(r.json())} doctors) ({'PASS' if ok_15 else 'FAIL'})")
    results["15_doctors_directory"] = ok_15

    print("\n" + "=" * 80)
    print("  API ENDPOINT VERIFICATION SUMMARY")
    print("=" * 80)
    all_ok = all(results.values())
    for k, v in results.items():
        print(f"  {k.ljust(35)}: {'[PASS]' if v else '[FAIL]'}")
    print("-" * 80)
    print(f"  FINAL RESULT: {'ALL API TESTS PASSED' if all_ok else 'SOME TESTS FAILED'}")
    print("=" * 80)
    return all_ok

if __name__ == "__main__":
    success = run_api_tests()
    sys.exit(0 if success else 1)
