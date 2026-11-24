"""
Performance & Benchmark Verification Test Suite
Benchmarks:
1. Scan Loading & Preprocessing Latency
2. PyTorch U-Net Vessel Segmentation Inference Latency
3. Centerline & Euclidean Distance Transform Profiling Latency
4. Candidate Region Proposal Extraction Latency
5. PyTorch StenosisResNet Patch Classification Latency
6. End-to-End Analysis Pipeline Throughput & Latency
7. Memory Footprint & Peak Resident Set Size (RSS)
"""

import sys
import time
import os
import psutil
from pathlib import Path
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
sys.path.insert(0, str(PROJECT_ROOT / "training"))

from backend.ai_engine import ArteryAIEngine

def run_performance_benchmarks():
    print("=" * 80)
    print("  INFOSYS ARTERY AI — PERFORMANCE & LATENCY BENCHMARK SUITE")
    print("=" * 80)
    engine = ArteryAIEngine()
    results = {}

    arcade_root = next((p for p in (PROJECT_ROOT / "arcade (1)" / "arcade", PROJECT_ROOT / "arcade" / "arcade", PROJECT_ROOT / "arcade") if (p / "syntax").is_dir()), None)
    test_img_dir = arcade_root / "syntax" / "test" / "images"
    test_scan_paths = list(test_img_dir.glob("*.png"))[:5]

    process = psutil.Process(os.getpid())
    mem_initial = process.memory_info().rss / (1024 * 1024)
    print(f"Initial Memory Usage: {mem_initial:.2f} MB")

    # Benchmark 1: Image loading & preprocessing
    print("\n[Benchmark 1] Scan Loading & Preprocessing...")
    times = []
    for p in test_scan_paths:
        t0 = time.perf_counter()
        img = engine.load_scan_array(str(p))
        times.append(time.perf_counter() - t0)
    avg_load_ms = np.mean(times) * 1000.0
    print(f"  - Average Load & Preprocessing Time: {avg_load_ms:.2f} ms / scan (Target < 20 ms)")
    results["1_load_preprocessing_latency"] = avg_load_ms < 20.0

    # Benchmark 2: PyTorch U-Net Segmentation
    print("\n[Benchmark 2] PyTorch U-Net Segmentation...")
    seg_times = []
    for p in test_scan_paths:
        img = engine.load_scan_array(str(p))
        t0 = time.perf_counter()
        mask, dist, centerline = engine.predict_segmentation(img)
        seg_times.append(time.perf_counter() - t0)
    avg_seg_ms = np.mean(seg_times) * 1000.0
    print(f"  - Average U-Net Segmentation Time: {avg_seg_ms:.2f} ms / scan (Target < 50 ms)")
    results["2_unet_segmentation_latency"] = avg_seg_ms < 50.0

    # Benchmark 3: Centerline & Candidate Extraction
    print("\n[Benchmark 3] Stenosis Candidate Region Extraction...")
    cand_times = []
    total_candidates = 0
    for p in test_scan_paths:
        img = engine.load_scan_array(str(p))
        mask, dist, centerline = engine.predict_segmentation(img)
        t0 = time.perf_counter()
        cmask, cands = engine.candidate_extractor.extract_candidates(img, mask, dist, centerline)
        cand_times.append(time.perf_counter() - t0)
        total_candidates += len(cands)
    avg_cand_ms = np.mean(cand_times) * 1000.0
    print(f"  - Average Candidate Extraction Time: {avg_cand_ms:.2f} ms / scan (Target < 100 ms)")
    print(f"  - Total Candidates Extracted Across 5 Scans: {total_candidates}")
    results["3_candidate_extraction_latency"] = avg_cand_ms < 100.0

    # Benchmark 4: PyTorch ResNet Patch Classification
    print("\n[Benchmark 4] PyTorch StenosisResNet Patch Classification...")
    import torch
    dummy_patches = torch.randn(total_candidates or 10, 1, 64, 64)
    t0 = time.perf_counter()
    with torch.no_grad():
        logits = engine.stenosis_classifier(dummy_patches)
        probs = torch.softmax(logits, dim=1)
    clf_total_ms = (time.perf_counter() - t0) * 1000.0
    per_patch_ms = clf_total_ms / len(dummy_patches)
    print(f"  - Batch Inference Time: {clf_total_ms:.2f} ms for {len(dummy_patches)} patches")
    print(f"  - Per-Patch Classification Latency: {per_patch_ms:.2f} ms / patch (Target < 5 ms)")
    results["4_resnet_classification_latency"] = per_patch_ms < 5.0

    # Benchmark 5: Full End-to-End Analysis Pipeline
    print("\n[Benchmark 5] Full End-to-End Analysis Pipeline Throughput...")
    e2e_times = []
    for p in test_scan_paths:
        t0 = time.perf_counter()
        res = engine.analyze_scan(str(p), {"case_id": "BENCHMARK-CASE"})
        e2e_times.append(time.perf_counter() - t0)
    avg_e2e_ms = np.mean(e2e_times) * 1000.0
    fps = 1000.0 / avg_e2e_ms
    print(f"  - Average End-to-End Analysis Latency: {avg_e2e_ms:.2f} ms / scan (Target < 350 ms on CPU)")
    print(f"  - Processing Throughput: {fps:.2f} scans / second")
    results["5_end_to_end_analysis_latency"] = avg_e2e_ms < 350.0

    # Benchmark 6: Memory Usage & Peak RSS
    mem_final = process.memory_info().rss / (1024 * 1024)
    mem_delta = mem_final - mem_initial
    print("\n[Benchmark 6] Memory Usage & Leak Detection...")
    print(f"  - Initial Memory: {mem_initial:.2f} MB")
    print(f"  - Final Memory: {mem_final:.2f} MB")
    print(f"  - Memory Delta: +{mem_delta:.2f} MB (Target < 150 MB increase)")
    results["6_memory_footprint"] = mem_delta < 150.0

    print("\n" + "=" * 80)
    print("  PERFORMANCE BENCHMARK SUMMARY")
    print("=" * 80)
    all_ok = all(results.values())
    for k, v in results.items():
        print(f"  {k.ljust(35)}: {'[PASS]' if v else '[FAIL]'}")
    print("-" * 80)
    print(f"  FINAL RESULT: {'ALL PERFORMANCE BENCHMARKS PASSED' if all_ok else 'SOME BENCHMARKS FAILED'}")
    print("=" * 80)
    return all_ok

if __name__ == "__main__":
    success = run_performance_benchmarks()
    sys.exit(0 if success else 1)
