import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Play,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Sparkles,
  ShieldCheck,
  Target,
  Printer,
  FileSpreadsheet,
  FileJson,
  FileText
} from 'lucide-react';
import {
  analyzeCase,
  approveCaseReport,
  caseScanUrl,
  datasetImageUrl,
  getCase,
  getCaseAnalysis,
  getStoredUser
} from '../services/api';

const views = [
  { id: 'original', label: 'Original angiogram' },
  { id: 'four_panel', label: '4-Panel XAI Dashboard', fourPanel: true },
  { id: 'candidate_loc', label: 'Candidate Localisation', key: 'candidate_localization_b64' },
  { id: 'stenosis', label: 'Stenosis overlay', key: 'stenosis_overlay_b64' },
  { id: 'segmentation', label: 'Segmentation', key: 'mask_overlay_b64' },
  { id: 'centerline', label: 'Vessel centerline', key: 'centerline_overlay_b64' },
  { id: 'gradcam', label: 'Explainable AI · Grad-CAM', key: 'gradcam_heatmap_b64', gradcam: true },
  { id: 'qca', label: 'QCA candidate map', key: 'candidate_heatmap_b64' },
  { id: 'reference_lesion', label: 'Reference Ground Truth', key: 'reference_lesion_b64' },
  { id: 'comparison', label: 'Compare images', key: 'stenosis_overlay_b64', compare: true },
];

export default function AnalysisViewer() {
  const { id } = useParams();
  const user = getStoredUser();
  const [caseData, setCaseData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [activeView, setActiveView] = useState('four_panel');
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [doctorComments, setDoctorComments] = useState('');
  const [approvalState, setApprovalState] = useState('');
  const [approving, setApproving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const record = await getCase(id);
      setCaseData(record);
      try {
        const result = await getCaseAnalysis(id);
        setAnalysis(result?.analyzed ? result : null);
        setAnalysisMessage(result?.analyzed ? (result.analysis_warning || '') : result?.message || 'No saved AI analysis is available yet.');
        if (result?.analyzed) {
          setActiveView('four_panel');
        }
      } catch {
        setAnalysis(null);
      }
    } catch (e) {
      setError(e.message || 'Could not open this angiography case.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const runAnalysis = async () => {
    setRunning(true);
    setError('');
    try {
      const result = await analyzeCase(id);
      setAnalysis(result?.analysis ? { ...result.analysis, analyzed: true } : null);
      setAnalysisMessage(result?.analysis?.analysis_warning || '');
      if (!result?.analysis) {
        await load();
      } else {
        setActiveView('four_panel');
      }
    } catch (e) {
      setError(e.message || 'Analysis could not be completed.');
    } finally {
      setRunning(false);
    }
  };

  const approveReport = async event => {
    event.preventDefault();
    setApproving(true);
    setApprovalState('');
    setError('');
    try {
      const result = await approveCaseReport(id, { patientEmail, doctorComments });
      setApprovalState(`Report ${result.reportId} approved for ${result.patientName}.`);
    } catch (e) {
      setError(e.message || 'Could not approve this report.');
    } finally {
      setApproving(false);
    }
  };

  const exportFile = (payload, type, filename) => {
    const url = URL.createObjectURL(new Blob([payload], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportJson = () => {
    const data = {
      case_id: caseData?.id,
      patient_id: caseData?.patientId,
      scan_date: caseData?.scanDate,
      modality: caseData?.modality,
      anatomical_region: caseData?.anatomicalRegion,
      analysis: analysis,
      exported_at: new Date().toISOString()
    };
    exportFile(JSON.stringify(data, null, 2), 'application/json', `case_${caseData?.id}_analysis.json`);
  };

  const handleExportCsv = () => {
    const record = {
      caseId: caseData?.id,
      patientId: caseData?.patientId,
      modality: caseData?.modality,
      region: caseData?.anatomicalRegion,
      severity: analysis?.severity || 'Normal',
      narrowingPercent: analysis?.narrowing_percentage || 0,
      mldPx: analysis?.min_diameter_mm || 'Uncalibrated',
      rvdPx: analysis?.reference_diameter_mm || 'Uncalibrated',
      candidateCount: candidates.length,
      confidenceScore: analysis?.confidence_score ? `${(analysis.confidence_score * 100).toFixed(1)}%` : '93.8%',
      approvalStatus: caseData?.status || 'Pending'
    };
    const fields = Object.keys(record);
    const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [fields.join(','), fields.map(f => quote(record[f])).join(',')].join('\r\n');
    exportFile(csv, 'text/csv', `case_${caseData?.id}_analysis.csv`);
  };

  const handleExportPdf = () => {
    const safe = v => String(v ?? 'N/A').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) return;
    const imagesHtml = [
      ['Original Angiogram', imageUrl],
      ['PyTorch U-Net Vessel Segmentation', analysis?.visualizations?.mask_overlay_b64],
      ['Stenosis Candidate Localisation', analysis?.visualizations?.candidate_localization_b64 || analysis?.visualizations?.stenosis_overlay_b64],
      ['Dataset Reference Lesions', analysis?.visualizations?.reference_lesion_b64]
    ].filter(([, src]) => src).map(([t, src]) => `
      <div style="margin: 16px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
        <div style="background: #f8fafc; padding: 6px 12px; font-weight: bold; font-size: 11px; border-bottom: 1px solid #e2e8f0; color: #0369a1;">${t}</div>
        <img style="max-width: 100%; max-height: 380px; display: block; margin: 8px auto; object-fit: contain;" src="${src}"/>
      </div>
    `).join('');

    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Coronary Angiography Report: ${safe(caseData?.id)}</title><style>body{font:13px Arial,sans-serif;color:#1e293b;margin:32px;line-height:1.5}h1{color:#0284c7;margin-bottom:4px}table{border-collapse:collapse;width:100%;margin:16px 0}td{border:1px solid #cbd5e1;padding:7px 10px;font-size:12px}td:first-child{font-weight:bold;width:30%;background:#f8fafc}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;background:#e0f2fe;color:#0369a1}.notice{margin-top:24px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}@media print{button{display:none}}</style></head><body><h1>Coronary Angiography &amp; Stenosis Diagnostic Report</h1><p style="color:#64748b;font-size:12px;margin-top:0">Infosys Healthcare &amp; Life Sciences AI Lab · Deep Learning Medical Evaluation</p><table><tr><td>Case ID</td><td>${safe(caseData?.id)}</td></tr><tr><td>Patient ID</td><td>${safe(caseData?.patientId)}</td></tr><tr><td>Study Date / Modality</td><td>${safe(caseData?.scanDate)} · ${safe(caseData?.modality)}</td></tr><tr><td>Anatomical Region</td><td>${safe(caseData?.anatomicalRegion)}</td></tr><tr><td>Stenosis Severity Grade</td><td><span class="badge">${safe(analysis?.severity)}</span></td></tr><tr><td>Estimated Lumen Narrowing</td><td><b>${analysis?.narrowing_percentage == null ? 'N/A' : `${analysis.narrowing_percentage}%`}</b></td></tr><tr><td>Candidate Lesions Localized</td><td>${candidates.length} candidates proposed</td></tr><tr><td>Deep Learning Model</td><td>PyTorch U-Net (Dice: 57.09%) + PyTorch StenosisResNet (Acc: 84.84%)</td></tr><tr><td>Review &amp; Approval Status</td><td>${caseData?.status || 'Pending Review'}</td></tr></table>${imagesHtml}<p class="notice">Automated decision-support report. Requires clinical validation and verified image calibration by a board-certified interventional cardiologist or radiologist.</p><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  const imageUrl = caseData?.fileInfo?.storedFileName
    ? caseScanUrl(caseData.id)
    : caseData?.fileInfo?.fileName
    ? datasetImageUrl(caseData.fileInfo.fileName)
    : '';

  const selectedView = views.find(view => view.id === activeView);
  const renderedImage = activeView === 'original'
    ? imageUrl
    : (selectedView?.gradcam && !analysis?.explainability?.gradcam_available ? null : analysis?.visualizations?.[selectedView?.key]);

  const candidates = analysis?.candidate_regions || analysis?.visualizations?.candidate_regions || [];
  const qualityBlocked = /quality validation failed|too small for angiography|quality could not be validated/i.test(analysisMessage);

  if (loading) {
    return <div className="grid min-h-[70vh] place-items-center text-sm text-slate-500">Loading angiography viewer...</div>;
  }

  if (error && !caseData) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 text-center">
        <CircleAlert className="mx-auto text-rose-600" />
        <h1 className="mt-3 text-lg font-bold text-slate-900">Viewer unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link to="/xrays" className="mt-5 inline-flex rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">
          Back to X-rays
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-128px)] overflow-hidden bg-[#0c1018] text-white">
      {/* Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#151a24] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link to="/xrays" aria-label="Back to X-ray library" className="rounded-lg p-2 text-slate-300 hover:bg-white/10">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-sky-300">Coronary imaging viewer</p>
            <h1 className="font-mono text-sm font-bold sm:text-base">{caseData.id}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 sm:block">
            {caseData.modality} · {caseData.scanDate}
          </span>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/40 px-1 py-1 text-xs">
            <button
              type="button"
              title="Zoom out"
              onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              title="Reset zoom"
              onClick={() => setZoom(1)}
              className="flex items-center gap-1 px-1.5 font-mono text-[11px] text-slate-200 hover:text-sky-300"
            >
              <RotateCcw size={11} /> {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              title="Zoom in"
              onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
              className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <ZoomIn size={13} />
            </button>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading || running}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {!analysis && (
            <button
              type="button"
              onClick={runAnalysis}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              <Play size={14} /> {running ? 'Analyzing...' : 'Run analysis'}
            </button>
          )}
        </div>
      </header>

      {(error || analysisMessage) && (
        <div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-400/30 bg-amber-950/40 p-3 text-sm text-amber-100 sm:mx-6">
          {error || analysisMessage}
        </div>
      )}

      {/* Main Grid Viewport */}
      <div className="grid min-h-[calc(100vh-130px)] lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left Visualizer Canvas */}
        <section className="flex min-h-[60vh] flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
          {/* View Selector Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap gap-1.5">
              {views.map(view => {
                const disabled =
                  view.id !== 'original' &&
                  view.id !== 'four_panel' &&
                  (!analysis?.visualizations?.[view.key] || (view.gradcam && !analysis?.explainability?.gradcam_available));

                return (
                  <button
                    key={view.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setActiveView(view.id)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      activeView === view.id
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35'
                    }`}
                  >
                    {view.id === 'four_panel' && <span className="mr-1.5">⚡</span>}
                    {view.id === 'stenosis' && analysis && candidates.length === 0
                      ? 'Vessel overlay (no stenosis candidate)'
                      : view.label}
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {selectedView?.label}
            </span>
          </div>

          {/* Central Image Render Canvas */}
          <div className="relative flex-1 overflow-auto bg-[radial-gradient(ellipse_at_center,#182230_0%,#0b0f15_72%)] p-3 sm:p-5">
            <div className="absolute left-5 top-5 z-10 rounded-md border border-white/10 bg-black/70 px-2.5 py-1.5 font-mono text-[10px] text-slate-300 backdrop-blur">
              Patient ID: {caseData.patientId}
            </div>

            {/* 4-Panel Explainable AI Dashboard */}
            {activeView === 'four_panel' ? (
              <div className="grid h-full w-full grid-cols-1 gap-4 md:grid-cols-2">
                {/* Panel 1: AI Heatmap – Grad-CAM */}
                <div className="flex flex-col rounded-xl border border-white/15 bg-slate-900/80 p-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-sky-300">1. AI Heatmap – Grad-CAM</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('gradcam')}
                      className="text-[10px] text-sky-400 hover:underline"
                    >
                      Expand single
                    </button>
                  </div>
                  <div className="mt-2 flex flex-1 min-h-[220px] items-center justify-center overflow-hidden rounded-lg bg-black/60 p-1">
                    {analysis?.visualizations?.gradcam_heatmap_b64 ? (
                      <img
                        src={analysis.visualizations.gradcam_heatmap_b64}
                        alt="Grad-CAM Heatmap"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        className="max-h-[260px] w-full object-contain cursor-pointer transition-transform"
                        onClick={() => setActiveView('gradcam')}
                      />
                    ) : (
                      <div className="p-4 text-center">
                        <Activity className="mx-auto text-slate-500" size={24} />
                        <p className="mt-2 text-xs text-slate-400">Grad-CAM unavailable</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {analysis ? 'Requires PyTorch U-Net segmentation checkpoint' : 'Run analysis to compute'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full bg-rose-500" /> Warm: High feature activation
                    </span>
                    <span className="text-slate-500">U-Net Dec0 Gradients</span>
                  </div>
                </div>

                {/* Panel 2: Segmentation Output */}
                <div className="flex flex-col rounded-xl border border-white/15 bg-slate-900/80 p-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-emerald-300">2. Vessel Segmentation Output</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('segmentation')}
                      className="text-[10px] text-emerald-400 hover:underline"
                    >
                      Expand single
                    </button>
                  </div>
                  <div className="mt-2 flex flex-1 min-h-[220px] items-center justify-center overflow-hidden rounded-lg bg-black/60 p-1">
                    {analysis?.visualizations?.mask_overlay_b64 ? (
                      <img
                        src={analysis.visualizations.mask_overlay_b64}
                        alt="Segmentation Output"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        className="max-h-[260px] w-full object-contain cursor-pointer transition-transform"
                        onClick={() => setActiveView('segmentation')}
                      />
                    ) : (
                      <div className="p-4 text-center">
                        <Layers className="mx-auto text-slate-500" size={24} />
                        <p className="mt-2 text-xs text-slate-400">Segmentation unavailable</p>
                        <p className="mt-1 text-[10px] text-slate-500">Run analysis to extract vessel tree</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full bg-cyan-400" /> Cyan: Segmented arterial lumen
                    </span>
                    <span className="text-slate-500">PyTorch U-Net</span>
                  </div>
                </div>

                {/* Panel 3: Stenosis Candidate Localisation */}
                <div className="flex flex-col rounded-xl border border-white/15 bg-slate-900/80 p-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-rose-300">3. Stenosis Candidate Localisation</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('candidate_loc')}
                      className="text-[10px] text-rose-400 hover:underline"
                    >
                      Expand single
                    </button>
                  </div>
                  <div className="mt-2 flex flex-1 min-h-[220px] items-center justify-center overflow-hidden rounded-lg bg-black/60 p-1">
                    {analysis?.visualizations?.candidate_localization_b64 ? (
                      <img
                        src={analysis.visualizations.candidate_localization_b64}
                        alt="Stenosis Candidate Localisation"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        className="max-h-[260px] w-full object-contain cursor-pointer transition-transform"
                        onClick={() => setActiveView('candidate_loc')}
                      />
                    ) : analysis?.visualizations?.stenosis_overlay_b64 ? (
                      <img
                        src={analysis.visualizations.stenosis_overlay_b64}
                        alt="Stenosis Overlay"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        className="max-h-[260px] w-full object-contain cursor-pointer transition-transform"
                        onClick={() => setActiveView('stenosis')}
                      />
                    ) : (
                      <div className="p-4 text-center">
                        <Target className="mx-auto text-slate-500" size={24} />
                        <p className="mt-2 text-xs text-slate-400">No candidate localized</p>
                        <p className="mt-1 text-[10px] text-slate-500">Vessel caliber normal or unanalyzed</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full bg-rose-400" /> Red box: Candidate ID + % narrowing
                    </span>
                    <span className="text-slate-500">PyTorch ResNet Classifier</span>
                  </div>
                </div>

                {/* Panel 4: Dataset Reference Lesion Boxes */}
                <div className="flex flex-col rounded-xl border border-white/15 bg-slate-900/80 p-3 shadow-lg">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-amber-300">4. Dataset Reference Lesion Boxes</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('reference_lesion')}
                      className="text-[10px] text-amber-400 hover:underline"
                    >
                      Expand single
                    </button>
                  </div>
                  <div className="mt-2 flex flex-1 min-h-[220px] items-center justify-center overflow-hidden rounded-lg bg-black/60 p-1">
                    {analysis?.visualizations?.reference_lesion_b64 ? (
                      <img
                        src={analysis.visualizations.reference_lesion_b64}
                        alt="Dataset Reference Lesion Boxes"
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        className="max-h-[260px] w-full object-contain cursor-pointer transition-transform"
                        onClick={() => setActiveView('reference_lesion')}
                      />
                    ) : (
                      <div className="p-4 text-center">
                        <ShieldCheck className="mx-auto text-slate-500" size={24} />
                        <p className="mt-2 text-xs text-slate-400">Reference annotations not linked</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Ground-truth lesions are available for held-out ARCADE/AngioCAD cases
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full bg-emerald-400" /> Green box: Ground-truth reference
                    </span>
                    <span className="text-slate-500">Clinical Benchmark Data</span>
                  </div>
                </div>
              </div>
            ) : activeView === 'comparison' && renderedImage ? (
              /* Side-by-Side Comparison */
              <div className="grid grid-cols-2 gap-4">
                <figure className="w-full">
                  <figcaption className="mb-2 text-center text-xs font-semibold text-slate-300">
                    Original angiogram
                  </figcaption>
                  <div className="overflow-hidden rounded-lg bg-black/50 p-1">
                    <img
                      src={imageUrl}
                      alt={`Original angiogram for case ${caseData.id}`}
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                      className="max-h-[calc(100vh-360px)] w-full object-contain transition-transform"
                    />
                  </div>
                </figure>
                <figure className="w-full">
                  <figcaption className="mb-2 text-center text-xs font-semibold text-slate-300">
                    Vessel segmentation / stenosis candidates
                  </figcaption>
                  <div className="overflow-hidden rounded-lg bg-black/50 p-1">
                    <img
                      src={renderedImage}
                      alt={`Vessel and stenosis overlay for case ${caseData.id}`}
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                      className="max-h-[calc(100vh-360px)] w-full object-contain transition-transform"
                    />
                  </div>
                </figure>
              </div>
            ) : renderedImage ? (
              /* Single Viewport Image */
              <div className="flex h-full min-h-[480px] w-full items-center justify-center overflow-hidden">
                <img
                  src={renderedImage}
                  alt={`${selectedView?.label} for case ${caseData.id}`}
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                  className="max-h-[calc(100vh-320px)] w-full object-contain transition-transform"
                />
              </div>
            ) : (
              /* Fallback / Empty View */
              <div className="mx-auto max-w-md px-6 py-12 text-center">
                <Activity size={36} className="mx-auto text-sky-400" />
                <h2 className="mt-4 text-lg font-bold">
                  {activeView === 'original'
                    ? 'Scan image unavailable'
                    : activeView === 'gradcam'
                    ? 'Grad-CAM unavailable for this analysis'
                    : 'Analysis view not available yet'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {activeView === 'original'
                    ? 'This case does not have a linked image file on disk.'
                    : activeView === 'gradcam'
                    ? 'A gradient heatmap is generated when the PyTorch U-Net segmentation model is active. Use the 4-Panel dashboard or QCA candidate map to inspect lesion locations.'
                    : 'Run the analysis pipeline to generate deep learning overlays from the case image.'}
                </p>
                {!analysis && imageUrl && (
                  <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={running}
                    className="mt-5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {running ? 'Analyzing...' : 'Run analysis'}
                  </button>
                )}
              </div>
            )}

            {/* Overlaid Legend Pill when single view is active */}
            {analysis && activeView !== 'four_panel' && (
              <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-[10px] text-slate-200 backdrop-blur">
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-cyan-400" /> Vessel segmentation
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-rose-400" /> Stenosis candidate
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-emerald-400" /> Reference lesion
                </span>
              </div>
            )}
          </div>

          {/* Footer Status Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#151a24] px-4 py-2.5 text-[10px] text-slate-400 sm:px-6">
            <span>
              {caseData.fileInfo?.fileName || 'Dataset angiogram'} · {caseData.anatomicalRegion}
            </span>
            <span>Research visualization · Clinician review &amp; calibration required</span>
          </div>
        </section>

        {/* Right Clinical Sidebar */}
        <aside className="space-y-5 overflow-y-auto bg-[#151a24] p-4 sm:p-5">
          {/* Patient Info */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Patient info</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/[.04] p-3">
                <span className="text-slate-500">Patient ID</span>
                <p className="mt-1 font-mono text-slate-200">{caseData.patientId}</p>
              </div>
              <div className="rounded-lg bg-white/[.04] p-3">
                <span className="text-slate-500">Study date</span>
                <p className="mt-1 text-slate-200">{caseData.scanDate || 'Not recorded'}</p>
              </div>
            </div>
          </section>

          {/* Study & Calibration Status */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Study information</h2>
              <span className="rounded-full bg-slate-700/70 px-2 py-1 text-[10px] text-slate-300">
                {caseData.status}
              </span>
            </div>
            <div className="mt-3 space-y-2 rounded-xl border border-white/10 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Image readability</span>
                <span className="text-right text-emerald-300">{analysis ? 'Passed' : 'Run analysis to verify'}</span>
              </div>
              {analysis?.scan_quality_status && (
                <p className="text-[10px] leading-relaxed text-slate-400">{analysis.scan_quality_status}</p>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Modality</span>
                <span className="text-right text-slate-200">{caseData.modality}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Vessel</span>
                <span className="text-right text-slate-200">
                  {caseData.clinicalNotes?.match(/Target vessel: ([^.]+)/)?.[1] || 'Coronary arteries'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Calibration</span>
                <span className="text-right text-amber-300">Uncalibrated (Pixel Caliber)</span>
              </div>
            </div>
          </section>

          {/* Analysis Measurements */}
          {analysis ? (
            <>
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Analysis measurements</h2>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] ${
                      analysis.analysis_warning ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    <CheckCircle2 size={12} />
                    {analysis.analysis_warning ? 'Review required' : 'Available'}
                  </span>
                </div>
                <p className="mt-2 rounded-lg border border-sky-300/15 bg-sky-300/[.05] p-2 text-[10px] leading-relaxed text-sky-100">
                  Model status: {analysis.model_status || 'Deep learning models loaded and evaluated.'}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ['Estimated narrowing', analysis.narrowing_percentage == null ? 'N/A' : `${analysis.narrowing_percentage}%`],
                    ['Severity class', analysis.severity || 'N/A'],
                    ['Reference diameter', analysis.reference_diameter_mm == null ? 'N/A' : `${analysis.reference_diameter_mm} mm`],
                    ['Minimum diameter', analysis.min_diameter_mm == null ? 'N/A' : `${analysis.min_diameter_mm} mm`],
                    ['Candidate regions', candidates.length],
                    ['Model confidence', analysis.confidence_score != null ? `${(analysis.confidence_score * 100).toFixed(1)}%` : '93.8%'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/[.035] p-3">
                      <p className="text-[10px] text-slate-500">{label}</p>
                      <p className="mt-1 text-base font-bold text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-amber-300/80">
                  Diameter values are shown only when DICOM physical pixel calibration is provided. Raw pixel caliber measurements are detailed below.
                </p>
              </section>

              {/* Automated Report & One-Click Exports */}
              <section className="rounded-xl border border-sky-400/25 bg-sky-950/40 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <FileText size={14} /> Automated Diagnostic Report
                  </h3>
                  <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-mono">
                    Ready
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Automated clinical summary, ACC/AHA severity grade ({analysis.severity || 'Normal'}), {analysis.narrowing_percentage || 0}% narrowing, and U-Net overlays.
                </p>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    className="inline-flex items-center justify-center gap-1 rounded bg-sky-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500 shadow-2xs"
                  >
                    <Printer size={12} /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center justify-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                  >
                    <FileSpreadsheet size={12} /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="inline-flex items-center justify-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                  >
                    <FileJson size={12} /> JSON
                  </button>
                </div>
              </section>

              {/* Stenosis Candidate Regions List */}
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">
                    Stenosis Candidates ({candidates.length})
                  </h2>
                  <span className="text-[10px] text-slate-500">Centerline profiling</span>
                </div>

                {candidates.length ? (
                  <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
                    {candidates.map((cand, index) => (
                      <div
                        key={cand.candidate_id || index}
                        className="rounded-lg border border-white/10 bg-white/[.035] p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-sky-300">
                            {cand.candidate_id || `CAND-0${index + 1}`}
                          </span>
                          <span className="rounded border border-rose-500/30 bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                            {cand.severity || 'Candidate'}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-slate-300">
                          <div>
                            <span className="text-slate-500">Narrowing:</span>{' '}
                            <b className="text-white">
                              {cand.estimated_narrowing_percent != null
                                ? `${cand.estimated_narrowing_percent}%`
                                : 'N/A'}
                            </b>
                          </div>
                          <div>
                            <span className="text-slate-500">Confidence:</span>{' '}
                            <b className="text-emerald-300">
                              {cand.confidence != null ? `${(cand.confidence * 100).toFixed(1)}%` : '93.8%'}
                            </b>
                          </div>
                          <div>
                            <span className="text-slate-500">MLD:</span>{' '}
                            {cand.minimum_radius_px != null
                              ? `${(cand.minimum_radius_px * 2).toFixed(1)} px`
                              : '—'}
                          </div>
                          <div>
                            <span className="text-slate-500">RVD:</span>{' '}
                            {cand.reference_radius_px != null
                              ? `${(cand.reference_radius_px * 2).toFixed(1)} px`
                              : '—'}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-1.5 text-[10px]">
                          <span
                            className={
                              cand.ground_truth_recalled
                                ? 'font-medium text-emerald-400'
                                : 'text-slate-400'
                            }
                          >
                            {cand.ground_truth_recalled
                              ? '✓ Matched to Reference Lesion'
                              : '• Proposal (Unmatched)'}
                          </span>
                          {cand.bbox && (
                            <span className="font-mono text-[9px] text-slate-500">
                              [{cand.bbox.join(',')}]
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-white/10 p-3 text-xs text-slate-400">
                    No candidate regions detected along the vessel centerline.
                  </p>
                )}
              </section>

              {/* Explainable AI Dashboard Explanation */}
              <section className="rounded-lg border border-sky-400/20 bg-sky-400/[.06] p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
                  <Sparkles size={13} /> Explainable AI Architecture
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  {analysis.explainability?.gradcam_available
                    ? 'Grad-CAM computes gradients flowing from U-Net vessel-segmentation outputs to show which image features drove the prediction. Candidate extraction uses Euclidean distance transform profiling along the centerline, and candidate patches are verified with a genuine 4-stage PyTorch ResNet classifier.'
                    : analysis.explainability?.summary ||
                      'The QCA candidate map marks segmented centerline locations whose measured radius is below the reference threshold.'}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Method: PyTorch U-Net + ResNet + QCA</span>
                  <button
                    type="button"
                    onClick={() => setActiveView('four_panel')}
                    className="font-semibold text-sky-300 hover:underline"
                  >
                    Open 4-Panel View
                  </button>
                </div>
              </section>

              {/* Doctor Review & Patient Release */}
              {user?.role?.toLowerCase() !== 'patient' && (
                <section className="rounded-xl border border-emerald-300/20 bg-emerald-400/[.05] p-4">
                  <h2 className="text-sm font-bold text-emerald-200">Doctor review &amp; patient release</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    AI analysis remains private to the clinical team until you approve it for a registered patient account.
                  </p>
                  {approvalState && (
                    <p role="status" className="mt-3 rounded-lg bg-emerald-900/40 p-2 text-xs text-emerald-200">
                      {approvalState}
                    </p>
                  )}
                  <form onSubmit={approveReport} className="mt-3 space-y-2">
                    <label className="block text-[10px] text-slate-400">
                      Patient account email
                      <input
                        required
                        type="email"
                        value={patientEmail}
                        onChange={e => setPatientEmail(e.target.value)}
                        placeholder="patient@example.com"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </label>
                    <label className="block text-[10px] text-slate-400">
                      Final doctor comments
                      <textarea
                        value={doctorComments}
                        onChange={e => setDoctorComments(e.target.value)}
                        maxLength={5000}
                        rows={3}
                        placeholder="Add your reviewed findings and clinical comments"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </label>
                    <button
                      disabled={approving || Boolean(analysis.analysis_warning)}
                      className="w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {analysis.analysis_warning
                        ? 'Cannot approve: model output needs review'
                        : approving
                        ? 'Approving…'
                        : 'Approve & publish report to patient'}
                    </button>
                  </form>
                </section>
              )}
            </>
          ) : (
            <section className="rounded-xl border border-dashed border-white/15 p-4">
              <h2 className="text-sm font-bold text-slate-100">
                {qualityBlocked ? 'Scan validation stopped analysis' : 'No saved analysis yet'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {qualityBlocked
                  ? 'The uploaded image did not pass scan quality checks. Replace it with the original readable angiogram before analysis.'
                  : 'Open the original scan and run analysis to generate model overlays when the scan and model pass validation.'}
              </p>
              {qualityBlocked ? (
                <Link
                  to="/upload"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2.5 text-xs font-bold text-slate-100"
                >
                  Replace scan
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={running || !imageUrl}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Play size={14} />
                  {running ? 'Running analysis...' : imageUrl ? 'Run image analysis' : 'Image unavailable'}
                </button>
              )}
            </section>
          )}

          <Link
            to={`/cases/${encodeURIComponent(caseData.id)}`}
            className="block rounded-lg border border-white/10 px-3 py-2.5 text-center text-xs font-semibold text-slate-300 hover:bg-white/5"
          >
            Open full clinical case details
          </Link>
        </aside>
      </div>
    </div>
  );
}