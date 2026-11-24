"""
End-to-End Pipeline Verification Test
Verifies the complete clinical lifecycle:
Scan Ingestion -> Quality Validation -> PyTorch U-Net Segmentation ->
Candidate Extraction -> PyTorch StenosisResNet Classification ->
Localisation -> Caliber Profiling & Narrowing Calculation ->
Severity Classification -> 4-Panel XAI & Grad-CAM ->
Automated Report Generation -> Doctor Review -> Patient Publication.
"""

import sys
import json
import sqlite3
import numpy as np
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "training"))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from backend.ai_engine import ArteryAIEngine

def test_full_pipeline():
    print("=" * 80)
    print("  INFOSYS ARTERY AI — END-TO-END PIPELINE VERIFICATION")
    print("=" * 80)
    results = {}

    # Step 1: Initialize Engine
    print("\n[Step 1] Initializing Diagnostic AI Engine...")
    engine = ArteryAIEngine()
    models_ready = (
        engine.segmentation_model is not None and
        engine.stenosis_classifier is not None and
        engine.candidate_extractor is not None
    )
    print(f"  - PyTorch U-Net Loaded: {engine.segmentation_model is not None}")
    print(f"  - PyTorch StenosisResNet Loaded: {engine.stenosis_classifier is not None}")
    print(f"  - Candidate Extractor Active: {engine.candidate_extractor is not None}")
    results["step_1_models_initialized"] = models_ready

    # Step 2: Load Real Angiogram from ARCADE test set
    print("\n[Step 2] Ingesting Real Clinical Angiogram...")
    arcade_root = next((p for p in (PROJECT_ROOT / "arcade (1)" / "arcade", PROJECT_ROOT / "arcade" / "arcade", PROJECT_ROOT / "arcade") if (p / "syntax").is_dir()), None)
    test_img_dir = arcade_root / "syntax" / "test" / "images"
    test_scan_p = list(test_img_dir.glob("*.png"))[0]
    scan_arr = engine.load_scan_array(str(test_scan_p))
    ingest_ok = scan_arr is not None and scan_arr.shape == (512, 512)
    print(f"  - Test Angiogram: {test_scan_p.name} (Shape: {scan_arr.shape}) -> {'PASS' if ingest_ok else 'FAIL'}")
    results["step_2_scan_ingestion"] = ingest_ok

    # Step 3: Execute End-to-End Analysis
    print("\n[Step 3] Running Full Diagnostic Analysis...")
    case_meta = {"case_id": "INF-E2E-TEST-01", "patient_id": "PATIENT-E2E-01"}
    analysis = engine.analyze_scan(str(test_scan_p), case_meta)
    
    # Verify outputs
    seg_ok = analysis.get("dice_score") is not None or "mask_overlay_b64" in analysis["visualizations"]
    cand_list = analysis.get("candidate_regions", [])
    cand_ok = len(cand_list) > 0
    narrowing = analysis.get("narrowing_percentage")
    severity = analysis.get("severity")
    conf = analysis.get("confidence_score")
    vis = analysis.get("visualizations", {})

    print(f"  - Vessel Segmentation Output: {'mask_overlay_b64' in vis} -> {'PASS' if seg_ok else 'FAIL'}")
    print(f"  - Candidate Regions Extracted: {len(cand_list)} proposals -> {'PASS' if cand_ok else 'FAIL'}")
    print(f"  - Stenosis Detected: {analysis.get('stenosis_detected')}")
    print(f"  - Measured Narrowing: {narrowing}%")
    print(f"  - ACC/AHA Severity: {severity}")
    conf_disp = f"{conf:.1f}%" if (conf is not None and conf > 1.0) else (f"{conf*100:.1f}%" if conf is not None else "N/A")
    print(f"  - Model Confidence: {conf_disp}")
    print(f"  - Inference Latency: {analysis.get('inference_time_ms')} ms")
    results["step_3_diagnostic_analysis"] = seg_ok and cand_ok and narrowing is not None

    # Step 4: Verify 4-Panel XAI & Grad-CAM Visualizations
    print("\n[Step 4] Verifying 4-Panel XAI & Grad-CAM Visualizations...")
    required_vis = [
        "original_b64", "mask_overlay_b64", "centerline_overlay_b64",
        "stenosis_overlay_b64", "candidate_localization_b64", "gradcam_heatmap_b64"
    ]
    vis_ok = all(k in vis and vis[k] for k in required_vis)
    gradcam_ok = analysis.get("explainability", {}).get("gradcam_available", False)
    print(f"  - 4-Panel Overlays Present: {vis_ok} -> {'PASS' if vis_ok else 'FAIL'}")
    print(f"  - U-Net Grad-CAM Active: {gradcam_ok} -> {'PASS' if gradcam_ok else 'FAIL'}")
    results["step_4_xai_visualizations"] = vis_ok and gradcam_ok

    # Step 5: Automated Clinical Report Generation
    print("\n[Step 5] Verifying Automated Report Generation...")
    rec = analysis.get("clinical_recommendations", {})
    report_text = f"Automated QCA: {severity} Stenosis ({narrowing}%) detected. MLD: {analysis.get('min_diameter_mm')} mm, RVD: {analysis.get('reference_diameter_mm')} mm."
    report_ok = len(report_text) > 20 and len(rec) > 0
    print(f"  - Automated Summary: {report_text}")
    print(f"  - Recommendation Category: {rec.get('category')} -> {'PASS' if report_ok else 'FAIL'}")
    results["step_5_automated_report"] = report_ok

    # Step 6: Doctor Review & Patient Publication Flow
    print("\n[Step 6] Verifying Doctor Review & Patient Publication Flow...")
    db_path = PROJECT_ROOT / "backend" / "artery_ai.db"
    db_flow_ok = False
    if db_path.is_file():
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Test approval status query
        unapproved = c.execute("SELECT COUNT(*) FROM reports WHERE status != 'Approved' AND patient_user_id IS NOT NULL").fetchone()[0]
        db_flow_ok = (unapproved == 0)
        print(f"  - Patient Security Boundary (Leaked Unapproved Reports: {unapproved}) -> {'PASS' if db_flow_ok else 'FAIL'}")
        conn.close()
    results["step_6_review_and_privacy"] = db_flow_ok

    print("\n" + "=" * 80)
    print("  END-TO-END PIPELINE VERIFICATION SUMMARY")
    print("=" * 80)
    all_ok = all(results.values())
    for k, v in results.items():
        print(f"  {k.ljust(35)}: {'[PASS]' if v else '[FAIL]'}")
    print("-" * 80)
    print(f"  FINAL RESULT: {'ALL END-TO-END STEPS PASSED' if all_ok else 'SOME STEPS FAILED'}")
    print("=" * 80)
    return all_ok

if __name__ == "__main__":
    success = test_full_pipeline()
    sys.exit(0 if success else 1)
