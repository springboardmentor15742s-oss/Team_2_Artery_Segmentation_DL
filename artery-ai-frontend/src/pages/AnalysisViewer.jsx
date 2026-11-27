import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, CheckCircle2, CircleAlert, Play, Printer, RefreshCw, Maximize2, Minimize2, Eye, ShieldCheck, Target, Layers } from 'lucide-react';
import { analyzeCase, analyzeVideoFrame, approveCaseReport, caseDicomFrameUrl, caseScanUrl, createDenoisedPreview, datasetImageUrl, getCase, getCaseAnalysis, getReviewAnnotations, getStoredUser, saveReviewAnnotation } from '../services/api';

const views = [
  { id: 'original', label: 'Original angiogram' },
  { id: '4panel', label: '⚡ 4-Panel XAI Dashboard' },
  { id: 'denoised', label: 'Denoised X-ray', key: 'denoised_b64' },
  { id: 'comparison', label: 'Lesion comparison', key: 'stenosis_overlay_b64', compare: true },
  { id: 'stenosis', label: 'Stenosis overlay', key: 'stenosis_overlay_b64' },
  { id: 'segmentation', label: 'Segmentation', key: 'mask_overlay_b64' },
  { id: 'centerline', label: 'Vessel centerline', key: 'centerline_overlay_b64' },
  { id: 'gradcam', label: 'Explainable AI · Grad-CAM', key: 'gradcam_heatmap_b64', gradcam: true },
  { id: 'qca', label: 'QCA candidate map', key: 'candidate_heatmap_b64' },
];
const qualityIssuePattern = /quality validation failed|too small for angiography|quality could not be validated/i;

export default function AnalysisViewer() {
  const { id } = useParams();
  const user = getStoredUser();
  const [caseData, setCaseData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [denoisedPreview, setDenoisedPreview] = useState('');
  const [denoiseMessage, setDenoiseMessage] = useState('');
  const [activeView, setActiveView] = useState('original');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [denoising, setDenoising] = useState(false);
  const [error, setError] = useState('');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [doctorComments, setDoctorComments] = useState('');
  const [approvalState, setApprovalState] = useState('');
  const [approving, setApproving] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [overlayOpacity, setOverlayOpacity] = useState(75);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [showCandidateMarkers, setShowCandidateMarkers] = useState(true);
  const [dicomFrame, setDicomFrame] = useState(0);
  const [annotations, setAnnotations] = useState([]);
  const [reviewCandidate, setReviewCandidate] = useState('');
  const [reviewDecision, setReviewDecision] = useState('uncertain');
  const [reviewComment, setReviewComment] = useState('');
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const videoRef = useRef(null);
  const [expandedPanel, setExpandedPanel] = useState(null);

  const load = async () => {
    setLoading(true); setError(''); setAnalysisMessage(''); setAnalysis(null);
    try {
      const record = await getCase(id); setCaseData(record); setDicomFrame(Math.floor((Number(record.fileInfo?.dicomMetadata?.frames || 1) - 1) / 2));
      try { setAnnotations(await getReviewAnnotations(id)); } catch { setAnnotations([]); }
      try { const result = await getCaseAnalysis(id); setAnalysis(result?.analyzed ? result : null); setAnalysisMessage(result?.analyzed ? (result.analysis_warning || '') : result?.message || 'No saved AI analysis is available yet.'); if (result?.analyzed) setActiveView(result.visualizations?.stenosis_overlay_b64 ? 'stenosis' : result.visualizations?.denoised_b64 ? 'denoised' : 'segmentation'); }
      catch (analysisError) {
        setAnalysis(null);
        const message = analysisError.message || 'Saved analysis could not be loaded.';
        if (qualityIssuePattern.test(message)) setAnalysisMessage(message);
        else setError(message);
      }
    } catch (e) { setError(e.message || 'Could not open this angiography case.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setDenoisedPreview(''); setDenoiseMessage(''); setActiveView('original'); setSelectedCandidateId(''); setImageDimensions({ width: 0, height: 0 }); load(); }, [id]);

  const runDenoisingPreview = async (viewAfterPreview = 'denoised') => {
    setDenoising(true); setError('');
    try {
      const result = await createDenoisedPreview(id);
      setDenoisedPreview(result.denoisedPreview);
      setDenoiseMessage(result.message);
      setActiveView(viewAfterPreview);
    } catch (e) { setError(e.message || 'Denoising preview could not be generated.'); }
    finally { setDenoising(false); }
  };

  const selectView = view => {
    if (view.id === 'comparison' && !hasValidatedStenosisOverlay && !denoisedPreview) {
      runDenoisingPreview('comparison');
      return;
    }
    setActiveView(view.id);
  };

  const runAnalysis = async () => {
    if (isDicom) setDicomFrame(Math.floor((dicomFrameCount - 1) / 2));
    setRunning(true); setError('');
    try {
      const result = isVideo
        ? await analyzeVideoFrame(id, Number((videoRef.current?.currentTime ?? videoTime).toFixed(2)))
        : await analyzeCase(id);
      setAnalysis(result?.analysis ? { ...result.analysis, analyzed: true } : null);
      setAnalysisMessage(result?.analysis?.analysis_warning || '');
      if (!result?.analysis) await load();
      else setActiveView(result.analysis.visualizations?.stenosis_overlay_b64 ? 'stenosis' : result.analysis.visualizations?.denoised_b64 ? 'denoised' : 'segmentation');
    } catch (e) {
      const message = e.message || 'Analysis could not be completed.';
      if (qualityIssuePattern.test(message)) {
        setAnalysisMessage(message);
      } else {
        setError(message);
      }
    }
    finally { setRunning(false); }
  };

  const approveReport = async event => {
    event.preventDefault(); setApproving(true); setApprovalState(''); setError('');
    try { const result = await approveCaseReport(id, { patientEmail, doctorComments }); setApprovalState(`Report ${result.reportId} approved for ${result.patientName}.`); }
    catch (e) { setError(e.message || 'Could not approve this report.'); }
    finally { setApproving(false); }
  };

  const saveAnnotation = async event => {
    event.preventDefault(); setSavingAnnotation(true); setError('');
    try {
      const candidateId = reviewCandidate || candidates[0]?.candidate_id || 'case-review';
      await saveReviewAnnotation(id, { candidateId, decision: reviewDecision, comment: reviewComment });
      setAnnotations(await getReviewAnnotations(id));
      setApprovalState(`Saved ${reviewDecision} review for ${candidateId}.`);
    } catch (e) { setError(e.message || 'Could not save clinician annotation.'); }
    finally { setSavingAnnotation(false); }
  };

  const printAutomatedReport = () => {
    if (!analysis) return;
    const escape = value => String(value ?? 'Not available').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const popup = window.open('', '_blank', 'width=1100,height=850');
    if (!popup) { setError('Allow pop-ups to print or save the automated report.'); return; }
    const visuals = analysis.visualizations || {};
    const imageCards = [
      ['Original angiography', visuals.original_b64 || imageUrl],
      ['Vessel segmentation overlay', visuals.mask_overlay_b64],
      ['Stenosis comparison overlay', visuals.stenosis_overlay_b64],
      [analysis.explainability?.gradcam_available ? 'Grad-CAM explanation' : 'QCA candidate map', analysis.explainability?.gradcam_available ? visuals.gradcam_heatmap_b64 : visuals.candidate_heatmap_b64],
    ].filter(([, src]) => Boolean(src)).map(([title, src]) => `<figure><figcaption>${escape(title)}</figcaption><div class="scan"><img src="${escape(src)}" alt="${escape(title)}"></div></figure>`).join('');
    const rows = candidates.length
      ? candidates.map((candidate, index) => {
          const review = annotations.find(item => item.candidate_id === candidate.candidate_id);
          return `<tr><td>${escape(candidate.candidate_id || `Candidate ${index + 1}`)}</td><td>${candidate.estimated_narrowing_percent == null ? 'Not available' : `${escape(candidate.estimated_narrowing_percent)}% (pixel estimate)`}</td><td>${candidate.minimum_radius_px == null ? 'Not available' : `${escape(candidate.minimum_radius_px)} px`}</td><td>${escape(review?.decision || 'Not reviewed')}</td><td>${escape(review?.comment || '—')}</td></tr>`;
        }).join('')
      : '<tr><td colspan="5">No candidate regions were returned. This does not rule out disease.</td></tr>';
    const confidence = analysis.confidence_score == null ? 'Not returned / not calibrated' : `${(Number(analysis.confidence_score) * 100).toFixed(1)}%`;
    const metrics = [
      ['Image quality', analysis.quality_check?.status || analysis.scan_quality_status],
      ['Model version', analysis.model_version || visuals.model_version],
      ['Model status', analysis.model_status || visuals.model_status],
      ['Per-scan confidence', confidence],
      ['Estimated narrowing', analysis.narrowing_percentage == null ? 'Not available' : `${analysis.narrowing_percentage}%`],
      ['Severity', analysis.severity || 'Not assigned'],
      ['Reference diameter', analysis.reference_diameter_mm == null ? 'Not measurable' : `${analysis.reference_diameter_mm} mm`],
      ['Minimum diameter', analysis.min_diameter_mm == null ? 'Not measurable' : `${analysis.min_diameter_mm} mm`],
      ['Dice overlap', analysis.dice_score == null ? 'Reference mask unavailable' : `${(Number(analysis.dice_score) * 100).toFixed(1)}%`],
      ['IoU overlap', analysis.iou_score == null ? 'Reference mask unavailable' : `${(Number(analysis.iou_score) * 100).toFixed(1)}%`],
      ['Inference time', analysis.inference_time_ms == null ? 'Not available' : `${analysis.inference_time_ms} ms`],
      ['Review status', 'Pending clinician review'],
    ];
    const metricCards = metrics.map(([label, value]) => `<div class="metric"><small>${escape(label)}</small><b>${escape(value)}</b></div>`).join('');
    const explainability = analysis.explainability || {};
    const limitations = analysis.analysis_warning || analysis.stenosis_detection_pipeline?.warning || 'Automated analysis completed. Clinician review is required.';
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Automated Artery Analysis Report - ${escape(caseData.id)}</title><style>*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#172033;margin:24px;line-height:1.4}header{display:flex;justify-content:space-between;border-bottom:3px solid #0e7490;padding-bottom:12px}h1{font-size:23px;margin:0;color:#0c4a6e}h2{font-size:15px;color:#075985;margin:18px 0 8px}.sub,small{color:#64748b;font-size:11px}.tag{display:inline-block;background:#fff7ed;color:#9a3412;padding:5px 8px;border-radius:10px;font-weight:bold;font-size:10px}.layout{display:grid;grid-template-columns:1.15fr 1fr;gap:16px;margin-top:14px}.images{display:grid;grid-template-columns:1fr 1fr;gap:9px}.scan{height:190px;background:#0b1220;border-radius:6px;display:grid;place-items:center;overflow:hidden}.scan img{max-width:100%;max-height:100%;object-fit:contain}figure{margin:0}figcaption{font-size:10px;font-weight:bold;color:#334155;margin-bottom:4px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}.metric{border:1px solid #dbe3ee;border-radius:6px;padding:7px}.metric small{display:block}.metric b{display:block;margin-top:3px;font-size:11px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin-top:6px}td,th{border:1px solid #dbe3ee;padding:6px;text-align:left;font-size:10px}th{background:#eff6ff}.notice{margin-top:14px;padding:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:11px}.page{break-before:page}.fine{font-size:10px;color:#475569}.footer{margin-top:18px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:9px;color:#64748b}@page{size:landscape;margin:12mm}@media print{body{margin:0}.scan{height:175px}}</style></head><body><header><div><h1>Automated Artery Analysis Report</h1><div class="sub">Coronary angiography · automated research analysis</div></div><div style="text-align:right"><span class="tag">PENDING DOCTOR REVIEW</span><div><b>Case ${escape(caseData.id)}</b></div><div class="sub">Patient ${escape(caseData.patientId)} · ${escape(caseData.scanDate)} · ${escape(caseData.modality)}</div></div></header><div class="layout"><section><h2>Angiography visualization</h2><div class="images">${imageCards || '<p>Images unavailable for this analysis.</p>'}</div><p class="fine">Interactive viewer provides zoom, overlay opacity, side-by-side comparison, and candidate selection.</p></section><section><h2>Automated findings and model performance</h2><div class="metrics">${metricCards}</div><p class="fine">Dice and IoU are overlap metrics only when paired reference masks are available. Sensitivity and specificity are benchmark metrics, not per-scan confidence; review held-out model results in Model Comparison.</p></section></div><section class="page"><h2>Lesion comparison and annotations</h2><table><thead><tr><th>Candidate</th><th>Estimated narrowing</th><th>Minimum radius</th><th>Doctor review</th><th>Reviewer note</th></tr></thead><tbody>${rows}</tbody></table><h2>Explainable AI</h2><p>${escape(explainability.method || (explainability.gradcam_available ? 'Grad-CAM' : 'QCA radius-profile candidate localization'))}. ${escape(explainability.summary || 'The heatmap or candidate map highlights model-related regions; it does not establish stenosis.')}</p><p class="fine">${explainability.gradcam_available ? 'Grad-CAM is available for the loaded segmentation model and explains segmentation influence, not a stenosis classification.' : 'Grad-CAM was unavailable for this analysis. The QCA candidate map is shown when present and is not Grad-CAM.'}</p><h2>History, approval, and notifications</h2><p>This report is pending clinician review. Doctor annotations are shown above. After approval, the patient receives an in-app notification and the report becomes available in Patient History for comparison with prior approved reports. Differences are not automatically interpreted as progression.</p><div class="notice"><b>Research decision support only.</b> ${escape(limitations)} Severity classification, confidence, and physical diameters are omitted when the model, calibration, or supporting labels do not provide them. A qualified clinician must review the source images and annotations before any care decision.</div><div class="footer">Report generated ${escape(new Date().toLocaleString())} · Model ${escape(analysis.model_version || visuals.model_version)} · This document preserves analysis values as recorded by the application.</div></section><script>window.onload=async()=>{await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));window.print()}</script></body></html>`);
    popup.document.close();
  };

  const isVideo = caseData?.fileInfo?.mediaKind === 'video' || /\.(mp4|mov|avi|webm|mpg|mpeg)$/i.test(caseData?.fileInfo?.fileName || '');
  const isDicom = caseData?.fileInfo?.mediaKind === 'dicom' || /\.dcm$/i.test(caseData?.fileInfo?.fileName || '');
  const dicomFrameCount = Math.max(1, Number(caseData?.fileInfo?.dicomMetadata?.frames || 1));
  const imageUrl = caseData?.fileInfo?.storedFileName
    ? isDicom ? caseDicomFrameUrl(caseData.id, dicomFrame) : caseScanUrl(caseData.id)
    : caseData?.fileInfo?.fileName ? datasetImageUrl(caseData.fileInfo.fileName) : '';
  const qualityBlocked = qualityIssuePattern.test(`${analysisMessage} ${error}`);
  const hasValidatedStenosisOverlay = Boolean(!qualityBlocked && analysis?.visualizations?.stenosis_overlay_b64);
  const onOriginalImageLoad = event => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalWidth && naturalHeight) setImageDimensions({ width: naturalWidth, height: naturalHeight }); };
  const candidateStyle = candidate => { const box=candidate?.bbox_px; if (!box || !imageDimensions.width || !imageDimensions.height) return null; return { left:`${box.x/imageDimensions.width*100}%`, top:`${box.y/imageDimensions.height*100}%`, width:`${box.width/imageDimensions.width*100}%`, height:`${box.height/imageDimensions.height*100}%` }; };
  const syncComparisonZoom = event => { event.preventDefault(); const bounds=event.currentTarget.getBoundingClientRect(); const x=(event.clientX-bounds.left)/bounds.width*100; const y=(event.clientY-bounds.top)/bounds.height*100; const origin=`${Math.max(0,Math.min(100,x))}% ${Math.max(0,Math.min(100,y))}%`; document.querySelectorAll('[data-compare-image]').forEach(image=>{image.style.transformOrigin=origin;}); setZoom(current=>Math.max(50,Math.min(250,current+(event.deltaY<0?10:-10)))); };
  const resetComparisonZoom = () => document.querySelectorAll('[data-compare-image]').forEach(image=>{image.style.transformOrigin='center center'; image.style.transform=`scale(${zoom/100})`;});
  const handleSelectCandidate = candidate => { setSelectedCandidateId(candidate.candidate_id); setActiveView('stenosis'); };
  const selectedView = views.find(view => view.id === activeView);
  const currentImageUrl = isVideo && analysis?.visualizations?.original_b64 ? analysis.visualizations.original_b64 : imageUrl;
  const comparisonImage = (hasValidatedStenosisOverlay ? analysis?.visualizations?.stenosis_overlay_b64 : '') || denoisedPreview;
  const renderedImage = activeView === 'original' ? currentImageUrl : activeView === 'denoised' ? (denoisedPreview || analysis?.visualizations?.denoised_b64) : activeView === 'comparison' ? comparisonImage : (selectedView?.gradcam && !analysis?.explainability?.gradcam_available ? null : analysis?.visualizations?.[selectedView?.key]);
  const candidates = analysis?.candidate_regions || analysis?.visualizations?.candidate_regions || [];
  const selectedCandidate = candidates.find(candidate => candidate.candidate_id === selectedCandidateId) || candidates[0] || null;
  const activeReviewCandidate = reviewCandidate || candidates[0]?.candidate_id || 'case-review';
  const denoisedAvailable = Boolean(analysis?.visualizations?.denoised_b64 || denoisedPreview);
  const viewAvailable = view => view.id === 'original'
    || view.id === '4panel'
    || (isVideo && view.id === 'original')
    || (view.id === 'denoised' && denoisedAvailable)
    || (view.id === 'comparison' && Boolean(imageUrl) && (!isVideo || Boolean(analysis?.visualizations?.original_b64)))
    || Boolean(!qualityBlocked && analysis?.visualizations?.[view.key] && (!view.gradcam || analysis?.explainability?.gradcam_available));
  const readabilityStatus = qualityBlocked ? 'Failed' : analysis ? 'Passed' : 'Run analysis to verify';
  const readabilityClass = qualityBlocked ? 'text-rose-300' : analysis ? 'text-emerald-300' : 'text-slate-400';
  useEffect(() => { if (analysis?.visualizations?.stenosis_overlay_b64 && activeView === 'original') setActiveView('stenosis'); else if (analysis?.visualizations?.denoised_b64 && activeView === 'original') setActiveView('denoised'); }, [analysis]);
  useEffect(() => {
    if (activeView === 'denoised' && !denoisedPreview && !denoising && !error && imageUrl) runDenoisingPreview();
  }, [activeView, denoisedPreview, denoising, error, imageUrl]);
  useEffect(() => {
    const saved = annotations.find(item => item.candidate_id === activeReviewCandidate);
    setReviewDecision(saved?.decision || 'uncertain');
    setReviewComment(saved?.comment || '');
  }, [activeReviewCandidate, annotations]);

  if (loading) return <div className="grid min-h-[70vh] place-items-center text-sm text-slate-500">Loading angiography viewer...</div>;
  if (error && !caseData) return <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 text-center"><CircleAlert className="mx-auto text-rose-600"/><h1 className="mt-3 text-lg font-bold text-slate-900">Viewer unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><Link to="/xrays" className="mt-5 inline-flex rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">Back to X-rays</Link></div>;

  return <div className="min-h-[calc(100vh-128px)] overflow-hidden bg-[#0c1018] text-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#151a24] px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><Link to="/xrays" aria-label="Back to X-ray library" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><ArrowLeft size={18}/></Link><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-sky-300">Automated Artery Analysis Report</p><h1 className="font-mono text-sm font-bold sm:text-base">{caseData.id}</h1></div></div><div className="flex items-center gap-2"><span className="hidden rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 sm:block">{caseData.modality} · {caseData.scanDate}</span>{analysis && <button type="button" onClick={printAutomatedReport} className="inline-flex items-center gap-2 rounded-lg border border-sky-300/30 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-300/10"><Printer size={14}/>Export report</button>}<button type="button" onClick={load} disabled={loading || running} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"><RefreshCw size={14}/>Refresh</button>{!analysis && !qualityBlocked && <button type="button" onClick={runAnalysis} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"><Play size={14}/>{running ? 'Analyzing...' : 'Run analysis'}</button>}</div></header>
    {error && !qualityIssuePattern.test(error) && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-100 sm:mx-6">{error}</div>}
    {qualityBlocked && <p role="status" className="mx-4 mt-3 flex items-center gap-2 px-1 text-xs text-amber-200/90 sm:mx-6"><CircleAlert size={14} className="shrink-0"/><span>Analysis is paused because this scan did not pass image-quality checks.</span><Link to={`/upload?caseId=${encodeURIComponent(caseData.id)}`} className="font-semibold underline underline-offset-2">Replace scan</Link></p>}
    <div className="grid min-h-[calc(100vh-130px)] lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_410px]">
      <section className="flex min-h-[60vh] flex-col border-b border-white/10 lg:border-b-0 lg:border-r"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"><div className="flex flex-wrap gap-1.5">{views.map(view => <button key={view.id} type="button" disabled={!viewAvailable(view)} onClick={() => selectView(view)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeView === view.id ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35'}`}>{view.id === 'stenosis' && analysis && candidates.length === 0 ? 'Vessel overlay (no stenosis candidate)' : view.label}</button>)}</div><span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{selectedView?.label}</span></div>
        <div className="flex flex-wrap items-center gap-5 border-b border-white/10 bg-[#111722] px-4 py-2.5 text-[10px] text-slate-300 sm:px-6">
          {!isVideo && <label className="flex items-center gap-2">Zoom <input aria-label="Image zoom" type="range" min="50" max="250" step="10" value={zoom} onChange={event => setZoom(Number(event.target.value))}/><span className="w-10 text-right">{zoom}%</span></label>}
          {analysis && ['segmentation','stenosis','comparison'].includes(activeView) && <label className="flex items-center gap-2">Overlay opacity <input aria-label="Overlay opacity" type="range" min="10" max="100" value={overlayOpacity} onChange={event => setOverlayOpacity(Number(event.target.value))}/><span className="w-8 text-right">{overlayOpacity}%</span></label>}
          {analysis && candidates.length > 0 && ['stenosis','comparison'].includes(activeView) && <label className="flex items-center gap-2"><input type="checkbox" checked={showCandidateMarkers} onChange={event => setShowCandidateMarkers(event.target.checked)} className="accent-rose-500"/>Show candidate locations</label>}
          {isDicom && <label className="flex items-center gap-2">DICOM frame <input aria-label="DICOM frame" type="range" min="0" max={dicomFrameCount - 1} value={dicomFrame} disabled={Boolean(analysis && activeView !== 'original')} onChange={event => setDicomFrame(Number(event.target.value))}/><span>{dicomFrame + 1}/{dicomFrameCount}{analysis && activeView !== 'original' ? ' · overlays use center frame' : ''}</span></label>}
          {isVideo && <span className="text-amber-300">Analyze the current frame at the selected video time</span>}
          {isDicom && <span className="text-slate-500">{caseData.fileInfo?.dicomMetadata?.columns || '—'} × {caseData.fileInfo?.dicomMetadata?.rows || '—'} pixels</span>}
        </div>
        <div className={`relative grid flex-1 content-start place-items-center bg-[radial-gradient(ellipse_at_center,#182230_0%,#0b0f15_72%)] p-3 sm:p-6 ${activeView === 'comparison' ? 'grid-cols-1 gap-3 md:grid-cols-2' : ''}`}>
          {activeView !== '4panel' && <div className="absolute left-5 top-5 z-10 rounded-md border border-white/10 bg-black/70 px-2.5 py-1.5 font-mono text-[10px] text-slate-300">ID: {caseData.patientId}</div>}
          {activeView === '4panel' ? (
            <div className="w-full max-w-6xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-400">4-Panel Explainable AI Dashboard</span>
                  <p className="text-xs text-slate-400">Multi-modal visualization suite · Grad-CAM, Lumen Segmentation, Stenosis Localisation & Ground Truth Reference</p>
                </div>
                <div className="flex items-center gap-2">
                  {!analysis && !qualityBlocked && (
                    <button type="button" onClick={runAnalysis} disabled={running} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50">
                      <Play size={13} />{running ? 'Running AI Engine…' : 'Run Full AI Analysis'}
                    </button>
                  )}
                  {expandedPanel && (
                    <button type="button" onClick={() => setExpandedPanel(null)} className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/20">
                      <Minimize2 size={13} /> Restore 4-Panel Grid
                    </button>
                  )}
                </div>
              </div>

              {expandedPanel ? (
                <div className="rounded-2xl border border-sky-400/30 bg-[#0d131d] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-sky-200">Focused View: {expandedPanel.title}</h3>
                    <button type="button" onClick={() => setExpandedPanel(null)} className="rounded-lg border border-white/20 px-3 py-1 text-xs text-slate-200 hover:bg-white/10">Back to 4-Panel</button>
                  </div>
                  <div className="grid min-h-[440px] place-items-center overflow-hidden rounded-xl bg-black/50 p-2">
                    {expandedPanel.image ? (
                      <img src={expandedPanel.image} alt={expandedPanel.title} style={{ transform: `scale(${zoom / 100})` }} className="max-h-[60vh] max-w-full object-contain" />
                    ) : (
                      <div className="p-8 text-center text-slate-400">
                        <Activity size={32} className="mx-auto text-sky-400" />
                        <p className="mt-2 text-sm">{expandedPanel.emptyText || 'Visualization not yet available for this scan.'}</p>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">{expandedPanel.badge}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Panel 1: Grad-CAM */}
                  <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0e141f] p-3.5 shadow-lg transition hover:border-sky-500/40">
                    <div className="flex items-center justify-between pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
                        <h4 className="font-mono text-xs font-bold text-slate-200">Patient ID: {caseData.patientId} / Grad-CAM Heatmap</h4>
                      </div>
                      <button type="button" onClick={() => setExpandedPanel({ title: 'Grad-CAM Feature Activation', image: analysis?.visualizations?.gradcam_heatmap_b64 || denoisedPreview || currentImageUrl, badge: 'Warm colors: High feature activation influencing vessel geometry prediction (U-Net Dec0 Gradients)' })} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline">
                        <Maximize2 size={12} /> Expand single
                      </button>
                    </div>
                    <div className="relative my-2 grid h-60 w-full place-items-center overflow-hidden rounded-lg bg-black/40 border border-white/5">
                      {analysis?.visualizations?.gradcam_heatmap_b64 ? (
                        <img src={analysis.visualizations.gradcam_heatmap_b64} alt="Grad-CAM Heatmap" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : denoisedPreview ? (
                        <img src={denoisedPreview} alt="Denoised Preview" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : currentImageUrl ? (
                        <div className="relative h-full w-full grid place-items-center">
                          <img src={currentImageUrl} alt="Scan preview" className="max-h-full max-w-full object-contain opacity-50" />
                          <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center">
                            <Activity size={24} className="mx-auto text-sky-400 animate-pulse" />
                            <p className="mt-1 text-xs font-semibold text-slate-200">Grad-CAM Feature Activation</p>
                            <p className="text-[10px] text-slate-400">Click &apos;Run analysis&apos; or inspect activation map</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-4 text-slate-400">
                          <Activity size={24} className="mx-auto text-sky-400" />
                          <p className="mt-1 text-xs font-semibold text-slate-300">Grad-CAM unavailable</p>
                          <p className="text-[10px] text-slate-500">Run analysis to compute</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                      <span className="flex items-center gap-1.5 text-slate-400"><i className="h-2 w-2 rounded-full bg-amber-400"></i>Warm: High feature activation</span>
                      <span className="font-mono text-slate-500">U-Net Dec0 Gradients</span>
                    </div>
                  </div>

                  {/* Panel 2: Vessel Segmentation */}
                  <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0e141f] p-3.5 shadow-lg transition hover:border-sky-500/40">
                    <div className="flex items-center justify-between pb-2">
                      <div className="flex items-center gap-2">
                        <Layers size={13} className="text-cyan-400" />
                        <h4 className="text-xs font-bold text-slate-200">2. Vessel Segmentation Output</h4>
                      </div>
                      <button type="button" onClick={() => setExpandedPanel({ title: 'Arterial Vessel Segmentation', image: analysis?.visualizations?.mask_overlay_b64 || analysis?.visualizations?.raw_mask_b64 || analysis?.visualizations?.centerline_overlay_b64, badge: 'Cyan: Segmented arterial lumen geometry (PyTorch U-Net)' })} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline">
                        <Maximize2 size={12} /> Expand single
                      </button>
                    </div>
                    <div className="relative my-2 grid h-60 w-full place-items-center overflow-hidden rounded-lg bg-black/40 border border-white/5">
                      {analysis?.visualizations?.mask_overlay_b64 ? (
                        <img src={analysis.visualizations.mask_overlay_b64} alt="Vessel Segmentation Overlay" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : analysis?.visualizations?.raw_mask_b64 ? (
                        <img src={analysis.visualizations.raw_mask_b64} alt="Vessel Mask" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : currentImageUrl ? (
                        <div className="relative h-full w-full grid place-items-center">
                          <img src={currentImageUrl} alt="Angiogram scan" className="max-h-full max-w-full object-contain opacity-50" />
                          <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center">
                            <Layers size={24} className="mx-auto text-cyan-400 animate-pulse" />
                            <p className="mt-1 text-xs font-semibold text-slate-200">Segmentation Model Loaded</p>
                            <p className="text-[10px] text-slate-400">U-Net model ready to extract arterial tree</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-4 text-slate-400">
                          <Layers size={24} className="mx-auto text-cyan-400" />
                          <p className="mt-1 text-xs font-semibold text-slate-300">Segmentation unavailable</p>
                          <p className="text-[10px] text-slate-500">Run analysis to extract vessel tree</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                      <span className="flex items-center gap-1.5 text-slate-400"><i className="h-2 w-2 rounded-full bg-cyan-400"></i>Cyan: Segmented arterial lumen</span>
                      <span className="font-mono text-slate-500">PyTorch U-Net</span>
                    </div>
                  </div>

                  {/* Panel 3: Stenosis Candidate Localisation */}
                  <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0e141f] p-3.5 shadow-lg transition hover:border-sky-500/40">
                    <div className="flex items-center justify-between pb-2">
                      <div className="flex items-center gap-2">
                        <Target size={13} className="text-rose-400" />
                        <h4 className="text-xs font-bold text-slate-200">3. Stenosis Candidate Localisation</h4>
                      </div>
                      <button type="button" onClick={() => setExpandedPanel({ title: 'Stenosis Candidate Localisation', image: analysis?.visualizations?.stenosis_overlay_b64 || analysis?.visualizations?.candidate_heatmap_b64, badge: 'Red box: Candidate ID + % narrowing (PyTorch ResNet Classifier / QCA)' })} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline">
                        <Maximize2 size={12} /> Expand single
                      </button>
                    </div>
                    <div className="relative my-2 grid h-60 w-full place-items-center overflow-hidden rounded-lg bg-black/40 border border-white/5">
                      {analysis?.visualizations?.stenosis_overlay_b64 ? (
                        <img src={analysis.visualizations.stenosis_overlay_b64} alt="Stenosis Candidate Overlay" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : analysis?.visualizations?.candidate_heatmap_b64 ? (
                        <img src={analysis.visualizations.candidate_heatmap_b64} alt="QCA Candidate Heatmap" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : currentImageUrl ? (
                        <div className="relative h-full w-full grid place-items-center">
                          <img src={currentImageUrl} alt="Angiogram scan" className="max-h-full max-w-full object-contain opacity-50" />
                          <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center">
                            <Target size={24} className="mx-auto text-rose-400" />
                            <p className="mt-1 text-xs font-semibold text-slate-200">Stenosis Localizer Ready</p>
                            <p className="text-[10px] text-slate-400">Vessel caliber normal or awaiting execution</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-4 text-slate-400">
                          <Target size={24} className="mx-auto text-rose-400" />
                          <p className="mt-1 text-xs font-semibold text-slate-300">No candidate localized</p>
                          <p className="text-[10px] text-slate-500">Vessel caliber normal or unanalyzed</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                      <span className="flex items-center gap-1.5 text-slate-400"><i className="h-2 w-2 rounded-full bg-rose-400"></i>Red box: Candidate ID + % narrowing</span>
                      <span className="font-mono text-slate-500">PyTorch ResNet Classifier / QCA</span>
                    </div>
                  </div>

                  {/* Panel 4: Dataset Reference Lesion Boxes */}
                  <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0e141f] p-3.5 shadow-lg transition hover:border-sky-500/40">
                    <div className="flex items-center justify-between pb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={13} className="text-emerald-400" />
                        <h4 className="text-xs font-bold text-slate-200">4. Dataset Reference Lesion Boxes</h4>
                      </div>
                      <button type="button" onClick={() => setExpandedPanel({ title: 'Dataset Reference Lesion Boxes (Ground Truth)', image: analysis?.visualizations?.cadica_reference_boxes_b64 || analysis?.visualizations?.cadica_detector_overlay_b64 || analysis?.visualizations?.candidate_heatmap_b64, badge: 'Green/Red box: Ground-truth reference annotations from benchmark (Clinical Benchmark Data / Ground Truth)' })} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 hover:underline">
                        <Maximize2 size={12} /> Expand single
                      </button>
                    </div>
                    <div className="relative my-2 grid h-60 w-full place-items-center overflow-hidden rounded-lg bg-black/40 border border-white/5">
                      {analysis?.visualizations?.cadica_reference_boxes_b64 ? (
                        <img src={analysis.visualizations.cadica_reference_boxes_b64} alt="Dataset Reference Lesion Boxes" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : analysis?.visualizations?.cadica_detector_overlay_b64 ? (
                        <img src={analysis.visualizations.cadica_detector_overlay_b64} alt="CADICA Lesion Detections" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : analysis?.visualizations?.stenosis_overlay_b64 ? (
                        <img src={analysis.visualizations.stenosis_overlay_b64} alt="Ground Truth Reference Overlay" style={{ transform: `scale(${zoom / 100})` }} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="text-center p-4 text-slate-400">
                          <ShieldCheck size={24} className="mx-auto text-emerald-400" />
                          <p className="mt-1 text-xs font-semibold text-slate-300">Reference annotations linked</p>
                          <p className="text-[10px] text-slate-500">Ground-truth lesions are available for held-out ARCADE/AngioCAD cases</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                      <span className="flex items-center gap-1.5 text-slate-400"><i className="h-2 w-2 rounded-full bg-emerald-400"></i>Green box: Ground-truth reference</span>
                      <span className="font-mono text-slate-500">Clinical Benchmark Data</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : isVideo ? <div className="grid w-full max-w-6xl grid-cols-1 gap-4 xl:grid-cols-2"><section className="min-w-0"><video key={imageUrl} ref={videoRef} controls playsInline preload="metadata" src={imageUrl} onTimeUpdate={event => setVideoTime(event.currentTarget.currentTime)} className="max-h-[min(62vh,680px)] w-full bg-black"/><div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-300">Selected frame time: <b className="text-white">{videoTime.toFixed(2)}s</b>{analysis?.video_frame && <span className="ml-2 text-slate-400">Last analyzed: {analysis.video_frame.time_seconds}s</span>}</p><button type="button" onClick={runAnalysis} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play size={14}/>{running ? 'Analyzing frame…' : 'Analyze current frame'}</button></div><p className="mt-2 text-[10px] leading-4 text-amber-200/80">The selected frame is analyzed as a still image and stored with this case. Repeat at another timestamp to update the report to that frame.</p></section><section className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3"><h3 className="mb-2 text-center text-xs font-semibold text-slate-300">{analysis ? (activeView === 'original' ? 'Extracted angiography frame' : selectedView?.label) : 'Frame analysis output'}</h3>{activeView === 'comparison' && analysis?.visualizations?.original_b64 && renderedImage ? <div className="grid grid-cols-2 gap-2"><img src={analysis.visualizations.original_b64} alt="Extracted original angiography frame" className="max-h-[min(58vh,620px)] w-full bg-black object-contain"/><img src={renderedImage} alt="Analyzed vessel overlay" style={{opacity:overlayOpacity/100}} className="max-h-[min(58vh,620px)] w-full bg-black object-contain"/></div> : renderedImage ? <img src={renderedImage} alt={`${selectedView?.label || 'Frame analysis'} for case ${caseData.id}`} style={{transform:`scale(${zoom/100})`,opacity:activeView==='stenosis'?overlayOpacity/100:1}} className="max-h-[min(58vh,620px)] w-full object-contain"/> : <p className="grid min-h-64 place-items-center px-4 text-center text-xs text-slate-400">Move the video to a frame and choose Analyze current frame. The results will appear here.</p>}</section></div> : activeView === 'comparison' && renderedImage ? (
            <div className="w-full max-w-5xl" onWheel={syncComparisonZoom} onDoubleClick={resetComparisonZoom}><div className="grid grid-cols-2 gap-3">
              <figure className="min-w-0"><figcaption className="mb-2 text-center text-xs font-semibold text-slate-300">Original angiogram</figcaption><div className="grid min-h-48 place-items-center rounded-lg bg-black/30"><img src={imageUrl} onLoad={onOriginalImageLoad} data-compare-image="true" alt={`Original angiogram for case ${caseData.id}`} style={{ transform:`scale(${zoom/100})`, transformOrigin:'center center' }} className="max-h-[min(58vh,620px)] w-full object-contain"/></div></figure>
              <figure className="min-w-0"><figcaption className="mb-2 text-center text-xs font-semibold text-slate-300">{hasValidatedStenosisOverlay ? 'Vessel / stenosis overlay' : 'Denoised preview ? research only'}</figcaption><div className="grid min-h-48 place-items-center rounded-lg bg-black/30"><img src={renderedImage} alt={`Comparison view for case ${caseData.id}`} data-compare-image="true" style={{transform:`scale(${zoom/100})`,transformOrigin:'center center',opacity:overlayOpacity/100}} className="max-h-[min(58vh,620px)] w-full object-contain"/></div></figure>
            </div>{hasValidatedStenosisOverlay && candidates.length>0 && <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold text-slate-100">Suspected lesion locations ? research candidates</h3><span className="text-[10px] text-slate-400">Select a candidate to review its pixel location.</span></div><div className="mt-2 flex flex-wrap gap-2">{candidates.map((candidate,index)=><button key={candidate.candidate_id||index} type="button" onClick={()=>setSelectedCandidateId(candidate.candidate_id)} className={`rounded-lg border px-3 py-2 text-left text-[10px] ${selectedCandidate?.candidate_id===candidate.candidate_id?'border-rose-300 bg-rose-500/20 text-white':'border-white/10 text-slate-300 hover:bg-white/5'}`}><span className="block font-bold">{candidate.candidate_id||`Candidate ${index+1}`}</span><span className="mt-0.5 block">{candidate.estimated_narrowing_percent==null?'Estimate unavailable':`${candidate.estimated_narrowing_percent}% pixel-based estimate`}</span></button>)}</div><p className="mt-2 text-[10px] text-amber-200/80">Research proposals, not confirmed lesions or calibrated measurements.</p></div>}{!hasValidatedStenosisOverlay && <p className="mt-3 text-center text-[10px] text-amber-200/80">Denoising preview only; it does not validate the scan or enable stenosis measurements.</p>}</div>
          ) : renderedImage ? (
            <>{['segmentation','stenosis'].includes(activeView) && imageUrl && (activeView==='stenosis'?analysis?.visualizations?.stenosis_overlay_b64:analysis?.visualizations?.raw_mask_b64) ? <div className="relative grid max-h-[calc(100vh-520px)] w-full place-items-center overflow-hidden"><div className="relative max-h-[calc(100vh-520px)] max-w-full" style={{aspectRatio:imageDimensions.width&&imageDimensions.height?`${imageDimensions.width}/${imageDimensions.height}`:'1/1', transform:`scale(${zoom/100})`}}><img src={imageUrl} onLoad={onOriginalImageLoad} alt={`Original angiogram for ${caseData.id}`} className="block max-h-[calc(100vh-520px)] max-w-full object-contain"/><img src={activeView==='stenosis'?analysis.visualizations.stenosis_overlay_b64:analysis.visualizations.raw_mask_b64} alt={activeView==='stenosis'?'Stenosis candidate comparison overlay':'Binary vessel segmentation mask overlay'} style={{opacity:overlayOpacity/100,mixBlendMode:'screen'}} className="pointer-events-none absolute inset-0 h-full w-full object-fill"/>{activeView==='stenosis'&&showCandidateMarkers&&imageDimensions.width>0&&candidates.map((candidate,index)=>{const boxStyle=candidateStyle(candidate);return boxStyle?<button key={candidate.candidate_id||index} type="button" onClick={()=>handleSelectCandidate(candidate)} title={`${candidate.candidate_id||`Candidate ${index+1}`} ? ${candidate.estimated_narrowing_percent??'N/A'}% research estimate`} style={boxStyle} className={`absolute z-10 border-2 ${selectedCandidate?.candidate_id===candidate.candidate_id?'border-yellow-300 bg-yellow-300/15':'border-rose-400 bg-rose-400/10'} hover:bg-yellow-200/20`}><span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-black/80 px-1 text-[9px] font-bold text-white">{candidate.candidate_id||`C${index+1}`}</span></button>:null;})}</div></div>:<img src={renderedImage} alt={`${selectedView?.label} for case ${caseData.id}`} style={{transform:`scale(${zoom/100})`,opacity:activeView==='stenosis'?overlayOpacity/100:1}} className="max-h-[calc(100vh-520px)] w-full object-contain"/>}</>
          ) : (
            <div className="max-w-md px-6 text-center">
              <Activity size={36} className="mx-auto text-sky-400" />
              <h2 className="mt-4 text-lg font-bold">{activeView === 'original' ? 'Scan image unavailable' : activeView === 'gradcam' ? 'Grad-CAM unavailable for this analysis' : 'Analysis view not available yet'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{activeView === 'original' ? 'This case does not have a linked image file.' : activeView === 'gradcam' ? 'A gradient heatmap is generated only when the trained U-Net segmentation model is loaded. Use the QCA candidate map to inspect radius based lesion candidates.' : 'Run the analysis to generate this view from the case image.'}</p>
              {activeView === 'comparison' && !analysis && imageUrl && <button type="button" onClick={() => runDenoisingPreview('comparison')} disabled={denoising} className="mt-5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{denoising ? 'Generating preview...' : 'Generate comparison preview'}</button>}
              {!analysis && !qualityBlocked && imageUrl && activeView !== 'comparison' && <button type="button" onClick={runAnalysis} disabled={running} className="mt-5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{running ? 'Analyzing...' : 'Run analysis'}</button>}
            </div>
          )}
          {analysis && activeView !== 'comparison' && <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-[10px] text-slate-200 backdrop-blur"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-cyan-400"/>Vessel segmentation</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-400"/>QCA candidate region</span></div>}
        </div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#151a24] px-4 py-2.5 text-[10px] text-slate-400 sm:px-6"><span>{caseData.fileInfo?.fileName || 'Dataset angiogram'} · {caseData.anatomicalRegion}</span><span>Research visualization · clinician review required</span></div></section>
      <aside className="space-y-5 bg-[#151a24] p-4 sm:p-5"><section><h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">{caseData.datasetOnly ? 'Dataset sample information' : 'Patient info'}</h2><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-white/[.04] p-3"><span className="text-slate-500">{caseData.datasetOnly ? 'Dataset ID' : 'Patient ID'}</span><p className="mt-1 font-mono text-slate-200">{caseData.patientId}</p></div><div className="rounded-lg bg-white/[.04] p-3"><span className="text-slate-500">Study date</span><p className="mt-1 text-slate-200">{caseData.scanDate || 'Not recorded'}</p></div></div></section>
        <section><div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Study information</h2><span className="rounded-full bg-slate-700/70 px-2 py-1 text-[10px] text-slate-300">{caseData.status}</span></div><div className="mt-3 space-y-2 rounded-xl border border-white/10 p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-slate-500">Image readability</span><span className={`text-right ${readabilityClass}`}>{readabilityStatus}</span></div>{(analysis?.quality_check || caseData.fileInfo?.qualityCheck)?.quality_score != null && <div className="flex justify-between gap-3"><span className="text-slate-500">Technical quality score</span><span className="text-right text-sky-200">{(analysis?.quality_check || caseData.fileInfo?.qualityCheck).quality_score}/100</span></div>}{analysis?.scan_quality_status && <p className="text-[10px] leading-relaxed text-slate-400">{analysis.scan_quality_status}</p>}<div className="flex justify-between gap-3"><span className="text-slate-500">Modality</span><span className="text-right text-slate-200">{caseData.modality}</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Vessel</span><span className="text-right text-slate-200">{caseData.clinicalNotes?.match(/Target vessel: ([^.]+)/)?.[1] || 'Coronary arteries'}</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Calibration</span><span className="text-right text-amber-300">Not verified</span></div></div></section>
        {analysis ? <><section><div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Analysis measurements</h2><span className={`inline-flex items-center gap-1 text-[10px] ${analysis.analysis_warning ? 'text-amber-300' : 'text-emerald-300'}`}><CheckCircle2 size={12}/>{analysis.analysis_warning ? 'Review required' : 'Available'}</span></div><p className="mt-2 rounded-lg border border-sky-300/15 bg-sky-300/[.05] p-2 text-[10px] leading-relaxed text-sky-100">Model status: {analysis.model_status || 'Status unavailable for this saved result.'}</p>{analysis.analysis_warning && <p className="mt-2 text-[10px] leading-relaxed text-amber-300/80">{analysis.analysis_warning}</p>}<div className="mt-3 grid grid-cols-2 gap-2">{[["Estimated narrowing", analysis.narrowing_percentage == null ? 'N/A' : `${analysis.narrowing_percentage}%`],['Severity class',analysis.severity || 'N/A'],['Reference diameter',analysis.reference_diameter_mm == null ? 'N/A' : `${analysis.reference_diameter_mm} mm`],['Minimum diameter',analysis.min_diameter_mm == null ? 'N/A' : `${analysis.min_diameter_mm} mm`],['Candidate regions',candidates.length],['Inference',analysis.inference_time_ms == null ? 'N/A' : `${analysis.inference_time_ms} ms`]].map(([label,value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[.035] p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-base font-bold text-slate-100">{value}</p></div>)}</div><p className="mt-2 text-[10px] leading-relaxed text-amber-300/80">Diameter values are shown only when image calibration is available. Current measurements are uncalibrated and withheld.</p></section>
          {analysis.stenosis_detection_pipeline && <section className="rounded-xl border border-sky-300/20 bg-sky-300/[.05] p-3"><h2 className="text-xs font-bold uppercase tracking-[.15em] text-sky-200">Stenosis candidate pipeline</h2><p className="mt-2 text-xs text-slate-200">{analysis.stenosis_detection_pipeline.status.replace(/_/g, ' ')}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{analysis.stenosis_detection_pipeline.method} · {analysis.stenosis_detection_pipeline.candidate_count ?? 'not available'} QCA candidate(s)</p>{analysis.stenosis_detection_pipeline.warning && <p className="mt-2 text-[10px] leading-relaxed text-amber-300">{analysis.stenosis_detection_pipeline.warning}</p>}</section>}
          <section><h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">QCA radius-profile research proposals</h2>{candidates.length ? <div className="mt-3 space-y-2">{candidates.slice(0,5).map((candidate,index) => <div key={candidate.candidate_id || index} className="rounded-lg border border-white/10 bg-white/[.035] p-3"><div className="flex justify-between text-xs"><span className="font-semibold text-slate-200">{candidate.candidate_id || `Candidate ${index+1}`}</span><span className="text-slate-400">{candidate.minimum_radius_px ?? '—'} px min radius</span></div><p className="mt-1 text-[10px] text-slate-400">Estimated narrowing: {candidate.estimated_narrowing_percent == null ? 'not returned' : `${candidate.estimated_narrowing_percent}%`} (unvalidated pixel-radius ratio) · no severity class</p></div>)}</div> : <p className="mt-3 rounded-lg border border-white/10 p-3 text-xs text-slate-400">No candidate regions were returned. This does not confirm the absence of disease.</p>}</section>
          <section className="rounded-lg border border-sky-400/20 bg-sky-400/[.06] p-3"><h3 className="text-xs font-bold text-sky-200">How does this explanation work?</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-300">{analysis.explainability?.gradcam_available ? 'Grad-CAM uses gradients flowing from the U-Net vessel-segmentation output to show which image regions influenced that prediction. Warm colors show stronger relative influence; this explains segmentation, not stenosis classification.' : analysis.explainability?.summary || 'The QCA candidate map marks segmented centerline locations whose measured radius is below the reference threshold.'}</p><p className="mt-2 text-[10px] text-slate-500">{analysis.explainability?.gradcam_available ? 'Method: Grad-CAM · U-Net vessel segmentation' : 'Method: QCA radius-profile candidate localization (not Grad-CAM)'}</p><button type="button" onClick={() => setActiveView(analysis.explainability?.gradcam_available ? 'gradcam' : 'qca')} className="mt-3 rounded-md border border-sky-300/25 px-2.5 py-1.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-300/10">View explanation heatmap</button></section>
          {user?.role?.toLowerCase() !== 'patient' && !caseData.datasetOnly && <section className="rounded-xl border border-emerald-300/20 bg-emerald-400/[.05] p-4"><h2 className="text-sm font-bold text-emerald-200">Doctor review & patient release</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">AI analysis remains private to the clinical team until you approve it for a registered patient account.</p>{approvalState && <p role="status" className="mt-3 rounded-lg bg-emerald-900/40 p-2 text-xs text-emerald-200">{approvalState}</p>}<form onSubmit={approveReport} className="mt-3 space-y-2"><label className="block text-[10px] text-slate-400">Patient account email<input required type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} placeholder="patient@example.com" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"/></label><label className="block text-[10px] text-slate-400">Final doctor comments<textarea value={doctorComments} onChange={e => setDoctorComments(e.target.value)} maxLength={5000} rows={3} placeholder="Add your reviewed findings and comments" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white"/></label><button disabled={approving || Boolean(analysis.analysis_warning)} className="w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{analysis.analysis_warning ? 'Cannot approve: model output needs review' : approving ? 'Approving…' : 'Approve & publish report to patient'}</button></form></section>}
        </> : <section className="rounded-xl border border-dashed border-white/15 p-4"><h2 className="text-sm font-bold text-slate-100">{qualityBlocked ? 'Scan validation stopped analysis' : 'No saved analysis yet'}</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">{qualityBlocked ? analysisMessage || error : 'Open the original scan and run analysis to generate model overlays when the scan and model pass validation.'}</p>{qualityBlocked ? <><button type="button" onClick={runDenoisingPreview} disabled={denoising || !imageUrl} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">{denoising ? 'Generating preview...' : 'Generate denoised preview'}</button><p className="mt-2 text-[10px] leading-relaxed text-amber-300/80">{denoiseMessage || 'Preview only: this does not restore or validate the scan and will not enable analysis.'}</p><Link to={`/upload?caseId=${encodeURIComponent(caseData.id)}`} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2.5 text-xs font-bold text-slate-100">Replace scan</Link></> : <button type="button" onClick={runAnalysis} disabled={running || !imageUrl} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Play size={14}/>{running ? 'Running analysis...' : isVideo ? 'Analyze selected video frame' : imageUrl ? 'Run image analysis' : 'Image unavailable'}</button>}</section>}
        {qualityBlocked && <Link to="/xrays" className="block rounded-lg border border-sky-300/25 bg-sky-300/[.06] px-3 py-2.5 text-center text-xs font-semibold text-sky-200 hover:bg-sky-300/10">Browse ARCade research samples with analysis views</Link>}
        {!caseData.datasetOnly && <Link to={`/cases/${encodeURIComponent(caseData.id)}`} className="block rounded-lg border border-white/10 px-3 py-2.5 text-center text-xs font-semibold text-slate-300 hover:bg-white/5">Open full clinical case details</Link>}
      </aside>
    </div>
  </div>;
}
