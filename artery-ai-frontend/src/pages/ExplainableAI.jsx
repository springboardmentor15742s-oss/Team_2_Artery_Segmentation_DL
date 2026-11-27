import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  Brain,
  CircleAlert,
  ClipboardCheck,
  Image as ImageIcon,
  RefreshCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  analyzeCase,
  approveCaseReport,
  caseScanUrl,
  createDenoisedPreview,
  datasetImageUrl,
  getCase,
  getCaseAnalysis,
  getCadicaImages,
  getCases,
  getDatasetImages,
  getReports,
  getStoredUser,
} from '../services/api';

const qualityIssuePattern = /quality (?:validation|check|metric calculation) failed|too small for angiography|quality could not be validated/i;
const arcadeCasePattern = /^ARCADE-(syntax|stenosis)-(train|val|test)-\d{4}$/;
const cadicaCasePattern = /^CADICA-p\d+-v\d+-\d+$/;

function getImageUrl(record) {
  if (record?.fileInfo?.storedFileName) return caseScanUrl(record.id);
  if (record?.fileInfo?.fileName) return datasetImageUrl(record.fileInfo.fileName);
  return '';
}

function formatStatus(status) {
  if (!status) return 'Not reported';
  return String(status).replaceAll('_', ' ');
}

function ImageViewport({ src, alt, emptyTitle, emptyText, className = '' }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageError, setImageError] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImageError(false);
  }, [src]);

  const updateZoom = nextZoom => {
    const next = Math.max(1, Math.min(4, nextZoom));
    setZoom(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };

  const startPan = event => {
    if (!src || zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const pan = event => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.offsetX + event.clientX - drag.current.x,
      y: drag.current.offsetY + event.clientY - drag.current.y,
    });
  };

  return (
    <div className={`relative h-[min(52vh,440px)] min-h-[250px] overflow-hidden rounded-xl bg-[#071226] ${className}`}>
      {src && !imageError ? (
        <>
          <div
            className={`grid h-full place-items-center ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={startPan}
            onPointerMove={pan}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            <img
              src={src}
              alt={alt}
              onError={() => setImageError(true)}
              draggable="false"
              className="h-full w-full select-none object-contain"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            />
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-white/15 bg-slate-950/85 p-1 shadow-lg">
            <button type="button" onClick={() => updateZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Zoom out" className="rounded-md p-2 text-white hover:bg-white/10 disabled:opacity-40"><ZoomOut size={15} /></button>
            <span className="min-w-11 text-center text-[10px] font-semibold text-slate-200">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => updateZoom(zoom + 0.25)} disabled={zoom >= 4} aria-label="Zoom in" className="rounded-md p-2 text-white hover:bg-white/10 disabled:opacity-40"><ZoomIn size={15} /></button>
            <button type="button" onClick={() => updateZoom(1)} aria-label="Reset zoom and pan" className="rounded-md p-2 text-white hover:bg-white/10"><RotateCcw size={14} /></button>
          </div>
          {zoom > 1 && <span className="absolute left-3 top-3 rounded-md bg-slate-950/75 px-2 py-1 text-[10px] text-slate-200">Drag to pan</span>}
        </>
      ) : (
        <div role="status" className="flex h-full flex-col items-center justify-center px-6 text-center">
          <ImageIcon size={28} className="text-slate-500" />
          <h3 className="mt-3 text-sm font-semibold text-white">{emptyTitle}</h3>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

function HeatmapLegend({ type, hasCandidates }) {
  if (type === 'gradcam') {
    return (
      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <p className="text-[11px] font-semibold text-slate-700">Relative model activation</p>
        <div className="mt-2 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #2563eb 0%, #22d3ee 35%, #fde047 65%, #dc2626 100%)' }} />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Lower</span><span>Higher</span></div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Explains the segmentation output only; it is not a stenosis probability.</p>
      </div>
    );
  }
  if (type === 'qca' && hasCandidates) {
    return (
      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <p className="text-[11px] font-semibold text-slate-700">Relative QCA candidate intensity</p>
        <div className="mt-2 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #2563eb 0%, #22d3ee 35%, #fde047 65%, #dc2626 100%)' }} />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Lower</span><span>Higher</span></div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Relative visualization only; not a calibrated probability or measurement.</p>
      </div>
    );
  }
  if (type === 'qca') {
    return <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] leading-4 text-slate-500">No stenosis candidates were returned. The backend may use the segmentation overlay as the QCA map fallback; no candidate heat is inferred here.</p>;
  }
  if (type === 'stenosis') {
    return (
      <div className="mt-3 flex flex-wrap gap-3 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Vessel region</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-yellow-400" />Centerline</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Candidate region</span>
      </div>
    );
  }
  return <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-500">Cyan pixels indicate the segmentation output returned by the backend.</p>;
}

export default function ExplainableAI() {
  const { id: routeCaseId } = useParams();
  const navigate = useNavigate();
  const user = getStoredUser();
  const isClinician = ['doctor', 'radiologist / clinician', 'clinical radiologist'].includes(String(user?.role || '').toLowerCase());
  const [cases, setCases] = useState([]);
  const [arcadeSamples, setArcadeSamples] = useState([]);
  const [cadicaSamples, setCadicaSamples] = useState([]);
  const [cadicaTotal, setCadicaTotal] = useState(0);
  const [cadicaAnnotatedOnly, setCadicaAnnotatedOnly] = useState(true);
  const [researchDataset, setResearchDataset] = useState('arcade');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchOffset, setResearchOffset] = useState(0);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [selectedId, setSelectedId] = useState(routeCaseId || '');
  const [caseData, setCaseData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [report, setReport] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [caseError, setCaseError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [reportError, setReportError] = useState('');
  const [viewMode, setViewMode] = useState('original');
  const [activeOverlay, setActiveOverlay] = useState('gradcam');
  const [denoisedPreview, setDenoisedPreview] = useState('');
  const [differencePreview, setDifferencePreview] = useState('');
  const [previewMethod, setPreviewMethod] = useState('');
  const [denoising, setDenoising] = useState(false);
  const [denoiseMessage, setDenoiseMessage] = useState('');
  const [denoiseError, setDenoiseError] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [doctorObservations, setDoctorObservations] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    getCases()
      .then(result => {
        if (!active) return;
        const records = result?.cases || [];
        setCases(records);
        if (routeCaseId) setSelectedId(routeCaseId);
        else if (!selectedId) setSelectedId(records[0]?.id || '');
      })
      .catch(error => {
        if (active) setListError(error.message || 'Authorized case list could not be loaded.');
      })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setResearchLoading(true);
    Promise.allSettled([getDatasetImages(), getCadicaImages({ limit: 100, offset: 0, annotatedOnly: true })])
      .then(([arcadeResult, cadicaResult]) => {
        if (!active) return;
        if (arcadeResult.status === 'fulfilled') setArcadeSamples(arcadeResult.value?.images || []);
        else setResearchError(arcadeResult.reason?.message || 'ARCade samples could not be loaded.');
        if (cadicaResult.status === 'fulfilled') {
          setCadicaSamples(cadicaResult.value?.images || []);
          setCadicaTotal(cadicaResult.value?.total || 0);
        } else {
          setResearchError(current => current ? `${current} ${cadicaResult.reason?.message || 'CADICA samples could not be loaded.'}` : cadicaResult.reason?.message || 'CADICA samples could not be loaded.');
        }
      })
      .finally(() => { if (active) setResearchLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (routeCaseId) setSelectedId(routeCaseId);
  }, [routeCaseId]);

  useEffect(() => {
    if (!selectedId) {
      setCaseData(null);
      setAnalysis(null);
      setReport(null);
      setAnalysisLoading(false);
      return undefined;
    }

    let active = true;
    setCaseLoading(true);
    setAnalysisLoading(true);
    setCaseData(null);
    setAnalysis(null);
    setReport(null);
    setCaseError('');
    setAnalysisError('');
    setReportError('');
    setApprovalError('');
    setApprovalMessage('');
    setDoctorObservations('');
    setViewMode('original');
    setActiveOverlay('gradcam');
    setDenoisedPreview('');
    setDifferencePreview('');
    setPreviewMethod('');
    setDenoiseMessage('');
    setDenoiseError('');

    Promise.allSettled([getCase(selectedId), getCaseAnalysis(selectedId), getReports()])
      .then(([caseResult, analysisResult, reportResult]) => {
        if (!active) return;
        if (caseResult.status === 'fulfilled') setCaseData(caseResult.value);
        else setCaseError(caseResult.reason?.message || 'Case details could not be loaded.');

        if (analysisResult.status === 'fulfilled') setAnalysis(analysisResult.value);
        else setAnalysisError(analysisResult.reason?.message || 'Analysis results could not be loaded.');

        if (reportResult.status === 'fulfilled') {
          setReport((reportResult.value || []).find(item => item.caseId === selectedId) || null);
        } else {
          setReportError(reportResult.reason?.message || 'Doctor review status could not be loaded.');
        }
      })
      .finally(() => {
        if (active) {
          setCaseLoading(false);
          setAnalysisLoading(false);
        }
      });
    return () => { active = false; };
  }, [selectedId]);

  const imageUrl = useMemo(() => getImageUrl(caseData), [caseData]);
  const visualizations = analysis?.visualizations || {};
  const explainability = analysis?.explainability || {};
  const candidates = analysis?.candidate_regions || visualizations.candidate_regions || [];
  const datasetCase = Boolean(caseData?.datasetOnly || arcadeCasePattern.test(selectedId) || cadicaCasePattern.test(selectedId));
  const qualityBlocked = analysis?.quality_check?.passed === false || qualityIssuePattern.test(`${analysis?.status || ''} ${analysis?.message || ''} ${analysis?.analysis_warning || ''} ${analysis?.scan_quality_status || ''} ${analysisError}`);
  const qualityReason = analysis?.quality_check?.reason || analysis?.message || analysisError || analysis?.analysis_warning || 'The backend blocked analysis because the scan did not pass its image-quality check.';
  const qualityStatus = analysis?.quality_check?.status || analysis?.scan_quality_status || (qualityBlocked ? 'Failed' : analysis ? 'Not blocked' : analysisLoading ? 'Checking' : 'Not run');
  const qualityRecommendation = analysis?.quality_recommendation
    || 'Replace the source with the original readable, full-resolution angiography image or choose another dataset frame, then retry analysis.';
  const saltPepperDetected = analysis?.quality_check?.salt_and_pepper_detected === true || /severe salt-and-pepper corruption/i.test(qualityReason);
  const overlayOptions = [
    { id: 'denoised', label: 'Denoised preview · research only', src: denoisedPreview, description: 'Non-diagnostic denoising preview returned by the backend' },
    { id: 'cadica_reference', label: 'CADICA reference annotations', src: visualizations.cadica_reference_boxes_b64, description: 'CADICA ground-truth reference boxes, not a model prediction' },
    { id: 'gradcam', label: 'Grad-CAM', src: explainability.gradcam_available ? visualizations.gradcam_heatmap_b64 : '', description: 'Backend Grad-CAM visualization' },
    { id: 'qca', label: 'QCA candidate map', src: visualizations.candidate_heatmap_b64, description: 'Backend QCA candidate visualization' },
    { id: 'segmentation', label: 'Segmentation mask', src: visualizations.raw_mask_b64 || visualizations.mask_overlay_b64, description: visualizations.raw_mask_b64 ? 'Backend segmentation mask' : 'Backend segmentation overlay' },
    { id: 'stenosis', label: 'Stenosis localization', src: visualizations.stenosis_overlay_b64, description: 'Backend stenosis localization overlay' },
  ];
  const selectedOverlay = overlayOptions.find(option => option.id === activeOverlay) || overlayOptions[0];
  const analysisStatus = analysis?.analyzed === true
    ? analysis.status || 'Completed'
    : qualityBlocked ? analysis?.status || 'Image quality check failed'
      : analysisLoading ? 'Processing' : analysisError ? 'Unavailable'
        : analysis ? 'Not confirmed' : 'Not run';
  const modelName = analysis?.model_version || explainability.segmentation_model || '';
  const confidenceValue = analysis?.confidence_score == null ? null : Number(analysis.confidence_score);
  const outputConfidence = Number.isFinite(confidenceValue) ? `${(confidenceValue * 100).toFixed(1)}%` : null;
  const limitationItems = [
    analysis?.analysis_warning,
    analysis?.stenosis_detection_pipeline?.warning,
    analysis?.quality_check?.passed === false ? analysis.quality_check.reason : null,
    'Grad-CAM explains segmentation activation when available; it is not a stenosis probability.',
    'No confidence value means none was returned or calibrated; pixel-radius estimates are not physical diameters.',
    'Research output requires clinician review and does not establish diagnosis or progression.',
  ].filter((item,index,array) => item && array.indexOf(item) === index);
  const returnedOutputs = [
    ['Stenosis result', analysis?.stenosis_detected === true ? 'Detected' : analysis?.stenosis_detected === false ? 'Not detected' : null],
    ['Severity', analysis?.severity ?? null],
    ['Estimated narrowing', analysis?.narrowing_percentage == null ? null : `${analysis.narrowing_percentage}%`],
    ['Confidence', outputConfidence],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  const filteredArcadeSamples = useMemo(() => {
    const query = researchQuery.trim().toLowerCase();
    return arcadeSamples.filter(item => !query || `${item.caseId} ${item.patientId} ${item.region} ${item.vessel} ${item.status}`.toLowerCase().includes(query));
  }, [arcadeSamples, researchQuery]);
  const researchTotal = researchDataset === 'arcade' ? filteredArcadeSamples.length : cadicaTotal;
  const visibleResearchSamples = researchDataset === 'arcade'
    ? filteredArcadeSamples.slice(researchOffset, researchOffset + 100)
    : cadicaSamples;

  const loadCadicaSamples = async (search = researchQuery, offset = 0, annotatedOnly = cadicaAnnotatedOnly) => {
    setResearchLoading(true);
    setResearchError('');
    try {
      const result = await getCadicaImages({ search, limit: 100, offset, annotatedOnly });
      setCadicaSamples(result?.images || []);
      setCadicaTotal(result?.total || 0);
      setResearchOffset(offset);
    } catch (error) {
      setResearchError(error.message || 'CADICA research samples could not be loaded.');
    } finally {
      setResearchLoading(false);
    }
  };

  const handleResearchDatasetChange = event => {
    const source = event.target.value;
    setResearchDataset(source);
    setResearchOffset(0);
    setResearchQuery('');
    if (source === 'cadica') loadCadicaSamples('', 0, cadicaAnnotatedOnly);
  };

  const handleResearchSearch = event => {
    event.preventDefault();
    setResearchOffset(0);
    if (researchDataset === 'cadica') loadCadicaSamples(researchQuery, 0);
  };

  const handleResearchPage = offset => {
    setResearchOffset(offset);
    if (researchDataset === 'cadica') loadCadicaSamples(researchQuery, offset);
  };

  const handleResearchSampleChange = event => {
    const sampleId = event.target.value;
    if (!sampleId) return;
    setSelectedId(sampleId);
    navigate(`/explainable-ai/${encodeURIComponent(sampleId)}`);
  };

  const handleCaseChange = event => {
    const nextId = event.target.value;
    setSelectedId(nextId);
    if (nextId) navigate(`/explainable-ai/${encodeURIComponent(nextId)}`);
    else navigate('/explainable-ai');
  };

  const handleDenoisingPreview = async () => {
    if (!selectedId || !imageUrl || denoising) return;
    setDenoising(true);
    setDenoiseError('');
    try {
      const result = await createDenoisedPreview(selectedId);
      if (!result?.denoisedPreview || !result?.differencePreview) throw new Error('The backend did not return both denoised and difference previews.');
      setDenoisedPreview(result.denoisedPreview);
      setDifferencePreview(result.differencePreview);
      setPreviewMethod(result.method || 'OpenCV median filter');
      setDenoiseMessage(result.message || 'Visualization only; the original scan is unchanged and the preview does not validate or repair a clinical scan.');
      setActiveOverlay('denoised');
      setViewMode('compare');
    } catch (error) {
      setDenoiseError(error.message || 'Denoising preview could not be generated.');
    } finally {
      setDenoising(false);
    }
  };

  const handleRetryAnalysis = async () => {
    if (!selectedId || analysisLoading || caseData?.datasetOnly) return;
    setAnalysisLoading(true);
    setAnalysisError('');
    setAnalysis(null);
    try {
      const response = await analyzeCase(selectedId);
      const result = response?.analysis || response;
      if (response?.success === false) {
        throw new Error(result?.message || 'The backend did not confirm a successful analysis.');
      }
      setAnalysis(response?.success === true && result?.analyzed !== true
        ? { ...result, analyzed: true, status: result?.status || 'Completed' }
        : result);
    } catch (error) {
      setAnalysisError(error.message || 'Analysis retry failed.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleApprove = async event => {
    event.preventDefault();
    setApproving(true);
    setApprovalError('');
    setApprovalMessage('');
    try {
      const result = await approveCaseReport(selectedId, { patientEmail, doctorComments: doctorObservations });
      setReport(current => ({ ...current, caseId: selectedId, status: result.status }));
      setApprovalMessage(`Report ${result.reportId} approved and published for ${result.patientName}.`);
    } catch (error) {
      setApprovalError(error.message || 'The report could not be approved.');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus = report?.status || (reportError ? 'Unavailable' : 'No report record');
  const canApprove = isClinician && !caseData?.datasetOnly && analysis?.analyzed && !analysis?.analysis_warning && !qualityBlocked && report?.status !== 'Approved';

  if (user?.role && String(user.role).toLowerCase() === 'patient') {
    return <div className="mx-auto max-w-3xl rounded-2xl border border-sky-100 bg-white p-8 text-center shadow-sm"><CircleAlert className="mx-auto text-sky-700" /><h1 className="mt-3 text-xl font-bold text-slate-900">Clinician review page</h1><p className="mt-2 text-sm text-slate-600">This explainability workspace is available to authorized clinical users.</p></div>;
  }

  return (
    <div className="space-y-5 text-slate-900">
      <header className="overflow-hidden rounded-2xl bg-[#10264a] text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white/10 p-3 text-sky-200"><Brain size={22} /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-200">Coronary imaging · research workspace</p>
              <h1 className="mt-1 text-xl font-bold sm:text-2xl">Explainable AI review</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-blue-100/75">{datasetCase ? 'Research sample visualizations and outputs returned by the API. These are not patient-specific findings.' : 'Patient-specific model visualizations and outputs returned by the clinical API. Missing outputs are shown as unavailable.'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setViewMode('original')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${viewMode === 'original' ? 'bg-white text-[#10264a]' : 'border border-white/25 text-white hover:bg-white/10'}`}>View original image</button>
            <button type="button" onClick={() => setViewMode('compare')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${viewMode === 'compare' ? 'bg-white text-[#10264a]' : 'border border-white/25 text-white hover:bg-white/10'}`}><ArrowLeftRight size={14} />{qualityBlocked ? 'View original and status' : 'Compare overlays'}</button>
            <Link to="/ai-analysis" className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">Analysis dashboard</Link>
          </div>
        </div>
      </header>

      {listError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{listError}</p>}
      {caseError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{caseError}</p>}
      {analysisError && !qualityBlocked && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{analysisError}</p>}
      {qualityBlocked && <section role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex items-start gap-2"><CircleAlert size={17} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1">
          <h2 className="font-bold">Image quality check: {formatStatus(qualityStatus)}</h2>
          <p className="mt-1 text-xs leading-5"><span className="font-semibold">Backend reason:</span> {qualityReason}</p>
          <p className="mt-1 text-xs leading-5"><span className="font-semibold">Recommended action:</span> {qualityRecommendation}</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-600">AI inference was not treated as successful for this scan. The original angiography remains available for review; no unavailable AI outputs are substituted.</p>
        </div></div>
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-6">
          {saltPepperDetected && !denoisedPreview && <button type="button" onClick={handleDenoisingPreview} disabled={denoising || !imageUrl} className="inline-flex items-center gap-2 rounded-lg bg-[#123566] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0e2b54] disabled:opacity-50"><RefreshCw size={13} className={denoising ? 'animate-spin' : ''} />{denoising ? 'Creating preview…' : 'Create OpenCV median preview'}</button>}
          {denoisedPreview && <button type="button" onClick={() => { setActiveOverlay('denoised'); setViewMode('compare'); }} className="rounded-lg bg-[#123566] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0e2b54]">View original / preview comparison</button>}
          {caseData && !caseData.datasetOnly && <Link to={`/upload?caseId=${encodeURIComponent(selectedId)}`} className="rounded-lg border border-amber-800/25 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100">Replace source scan</Link>}
          {caseData && !caseData.datasetOnly && <button type="button" onClick={handleRetryAnalysis} disabled={analysisLoading} className="rounded-lg border border-amber-800/25 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50">{analysisLoading ? 'Retrying analysis…' : 'Retry analysis'}</button>}
          {datasetCase && <a href="#research-dataset-explorer" className="rounded-lg border border-amber-800/25 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100">Choose another research frame</a>}
        </div>
        {denoiseError && <p role="alert" className="mt-3 pl-6 text-xs text-rose-800">{denoiseError}</p>}
        {analysis?.quality_check?.metrics && <dl className="mt-3 grid grid-cols-2 gap-2 pl-6 text-[10px] text-slate-600 sm:grid-cols-4">
          {Object.entries(analysis.quality_check.metrics).map(([label, value]) => <div key={label} className="rounded-lg bg-amber-100/70 px-2.5 py-2"><dt className="capitalize">{label.replaceAll('_', ' ')}</dt><dd className="mt-0.5 font-semibold">{value}</dd></div>)}
        </dl>}
        {denoisedPreview && <div className="mt-4 border-t border-amber-200 pt-4">
          <div className="mb-3"><h3 className="text-xs font-bold">Non-destructive preview comparison</h3><p className="mt-1 text-[10px] leading-4 text-slate-600">{previewMethod}. The uploaded original remains unchanged. Difference image shows raw absolute pixel differences, not model output.</p></div>
          <div className="grid gap-3 lg:grid-cols-3">
            {[['Original angiography', imageUrl], ['Median-filtered preview', denoisedPreview], ['Original − preview difference', differencePreview]].map(([label, src]) => <figure key={label} className="min-w-0">
              <figcaption className="mb-2 text-[11px] font-semibold text-slate-700">{label}</figcaption>
              <ImageViewport src={src} alt={label} emptyTitle={`${label} unavailable`} emptyText="The backend did not return this preview image." />
            </figure>)}
          </div>
          <p className="mt-3 text-[10px] leading-4 text-amber-900">{denoiseMessage} The preview does not pass or bypass quality validation; upload a readable original image before running AI analysis.</p>
        </div>}
      </section>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="min-w-64 flex-1 text-xs font-semibold text-slate-700">
            Select patient case
            <select value={selectedId} onChange={handleCaseChange} disabled={listLoading || cases.length === 0 || denoising} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100">
              {!cases.length && <option value="">{listLoading ? 'Loading authorized cases…' : 'No clinical cases available'}</option>}
              {cases.map(item => <option key={item.id} value={item.id}>{item.id} · Patient {item.patientId}</option>)}
              {selectedId && !cases.some(item => item.id === selectedId) && <option value={selectedId}>{selectedId} · research or direct case</option>}
            </select>
          </label>
          <span className="text-xs text-slate-500">{caseLoading ? 'Loading patient-specific data…' : 'Data source: authenticated FastAPI endpoints'}</span>
        </div>
        {caseData && (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ['Case ID', caseData.id],
              ['Patient ID', caseData.patientId || 'Not returned'],
              ['Study date', caseData.scanDate || 'Not recorded'],
              ['Modality', caseData.modality || 'Not recorded'],
              ['Anatomical region', caseData.anatomicalRegion || 'Not recorded'],
              ['Case status', formatStatus(caseData.status)],
            ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5"><dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-slate-800">{value}</dd></div>)}
          </dl>
        )}
      </section>

      <section id="research-dataset-explorer" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-sm font-bold text-slate-900">Research dataset explorer</h2><p className="mt-1 text-xs text-slate-500">Open an ARCade or CADICA frame in this Explainable AI viewer.</p></div>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-800">{researchTotal.toLocaleString()} matching samples</span>
        </div>
        <form onSubmit={handleResearchSearch} className="mt-3 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
          <label className="sr-only" htmlFor="research-dataset">Research dataset</label>
          <select id="research-dataset" value={researchDataset} onChange={handleResearchDatasetChange} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800">
            <option value="arcade">ARCade</option>
            <option value="cadica">CADICA</option>
          </select>
          <label className="sr-only" htmlFor="research-search">Search research samples</label>
          <input id="research-search" value={researchQuery} onChange={event => { setResearchQuery(event.target.value); setResearchOffset(0); }} placeholder={researchDataset === 'arcade' ? 'Search ARCade case, task, or split' : 'Search CADICA patient, video, or frame'} className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100" />
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Search samples</button>
        </form>
        {researchDataset === 'cadica' && <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={cadicaAnnotatedOnly}
            onChange={event => {
              const annotatedOnly = event.target.checked;
              setCadicaAnnotatedOnly(annotatedOnly);
              loadCadicaSamples(researchQuery, 0, annotatedOnly);
            }}
            className="h-4 w-4 rounded border-slate-300 text-[#123566] focus:ring-sky-600"
          />
          Show only frames with CADICA lesion reference annotations
        </label>}
        {researchError && <p role="alert" className="mt-3 text-xs text-rose-700">{researchError}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="min-w-60 flex-1 text-[10px] font-medium text-slate-500">
            Sample
            <select value="" onChange={handleResearchSampleChange} disabled={researchLoading || visibleResearchSamples.length === 0} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-800 disabled:bg-slate-50">
              <option value="">{researchLoading ? 'Loading samples…' : visibleResearchSamples.length ? 'Select a research sample' : 'No samples on this page'}</option>
              {visibleResearchSamples.map(sample => <option key={sample.caseId} value={sample.caseId}>
                {sample.caseId} · {sample.patientId}{researchDataset === 'cadica' ? (sample.referenceAnnotationAvailable ? ' · reference boxes available' : ' · no reference boxes') : ''}
              </option>)}
            </select>
          </label>
          <button type="button" onClick={() => handleResearchPage(Math.max(0, researchOffset - 100))} disabled={researchLoading || researchOffset === 0} className="mt-4 rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Previous</button>
          <span className="mt-4 text-[10px] text-slate-500">{researchTotal ? `${Math.floor(researchOffset / 100) + 1} / ${Math.ceil(researchTotal / 100)}` : '0 samples'}</span>
          <button type="button" onClick={() => handleResearchPage(researchOffset + 100)} disabled={researchLoading || researchOffset + 100 >= researchTotal} className="mt-4 rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Next</button>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-slate-500">ARCade samples have polygon labels. CADICA provides image frames and lesion bounding-box references on annotated frames; its reference boxes are not model predictions. CADICA segmentation views are cross-dataset ARCade model research outputs.</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-bold text-slate-900">{viewMode === 'compare' ? 'Original and explanation comparison' : 'Original coronary angiography'}</h2><p className="mt-1 text-xs text-slate-500">Zoom and pan controls are available on each image.</p></div>
            {viewMode === 'compare' && <select value={activeOverlay} onChange={event => setActiveOverlay(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              {overlayOptions.map(option => <option key={option.id} value={option.id} disabled={(!option.src && option.id !== 'denoised') || (qualityBlocked && option.id !== 'denoised' && option.id !== 'cadica_reference')}>{option.label}{qualityBlocked && option.id !== 'denoised' && option.id !== 'cadica_reference' ? ' (blocked by quality check)' : option.src ? '' : ' (unavailable)'}</option>)}
            </select>}
          </div>
          {viewMode === 'compare' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <figure className="min-w-0">
                <figcaption className="mb-2 text-xs font-semibold text-slate-700">Original angiography</figcaption>
                <ImageViewport src={imageUrl} alt={`Original angiography for case ${caseData?.id || selectedId}`} emptyTitle="Original image unavailable" emptyText="No accessible scan image was returned for this case." />
              </figure>
              <figure className="min-w-0">
                <figcaption className="mb-2 text-xs font-semibold text-slate-700">{selectedOverlay.label}</figcaption>
                <ImageViewport src={activeOverlay === 'denoised' ? denoisedPreview : (!qualityBlocked || activeOverlay === 'cadica_reference') ? selectedOverlay.src : ''} alt={`${selectedOverlay.description} for case ${selectedId}`} emptyTitle={qualityBlocked && activeOverlay !== 'denoised' && activeOverlay !== 'cadica_reference' ? 'Analysis blocked by scan quality' : 'Explanation unavailable'} emptyText={qualityBlocked && activeOverlay !== 'denoised' && activeOverlay !== 'cadica_reference' ? 'No AI overlays are shown for this scan.' : activeOverlay === 'denoised' ? 'Generate a non-diagnostic preview from the quality warning above.' : 'The backend did not return this explanation for the selected case.'} />
                {activeOverlay === 'denoised' ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">Denoised preview · research visualization only. It is not a restored, verified, or diagnostic image.</p> : activeOverlay === 'cadica_reference' ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">Red boxes are CADICA dataset reference annotations, not outputs from the AI model.</p> : <HeatmapLegend type={activeOverlay} hasCandidates={candidates.length > 0} />}
              </figure>
            </div>
          ) : (
            <ImageViewport src={imageUrl} alt={`Original angiography for case ${caseData?.id || selectedId}`} emptyTitle={caseData ? 'Original image unavailable' : listLoading || caseLoading ? 'Loading scan…' : 'Select a clinical case'} emptyText={caseData ? 'No accessible scan image was returned for this case.' : 'Choose a case with an angiography image to begin review.'} />
          )}
        </div>

        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-bold text-slate-900">Analysis provenance</h2><p className="mt-1 text-xs text-slate-500">Values are displayed only when present in the API response.</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${analysis?.analyzed === true ? 'bg-emerald-50 text-emerald-700' : qualityBlocked ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{formatStatus(analysisStatus)}</span>
          </div>
          <dl className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Model</dt><dd className="text-right font-semibold text-slate-800">{modelName || 'Not returned by backend'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Explanation method</dt><dd className="max-w-[65%] text-right font-semibold text-slate-800">{explainability.method || 'Not returned by backend'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Analysis date</dt><dd className="text-right font-semibold text-slate-800">{analysis?.analyzed_at ? new Date(analysis.analyzed_at).toLocaleString() : 'Not returned'}</dd></div>
          </dl>
          {returnedOutputs.length ? (
            <div className="grid grid-cols-2 gap-2">
              {returnedOutputs.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-[#10264a]">{value}</p></div>)}
            </div>
          ) : <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">No model output or confidence values were returned for this case.</p>}
          {!caseData?.datasetOnly && !qualityBlocked && analysis?.analyzed !== true && <button type="button" onClick={handleRetryAnalysis} disabled={analysisLoading || !caseData} className="w-full rounded-lg bg-[#123566] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#0e2b54] disabled:opacity-50">{analysisLoading ? 'Analysis processing…' : 'Run or retry analysis'}</button>}
          {analysis?.quality_check && !qualityBlocked && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] leading-4 text-emerald-900">
            <p><span className="font-semibold">Image quality check:</span> {formatStatus(analysis.quality_check.status)}{analysis.quality_check.quality_score != null ? ` · technical score ${analysis.quality_check.quality_score}/100` : ''}</p>
            {analysis.quality_check.metrics && <p className="mt-1 text-emerald-800">{analysis.quality_check.metrics.width} × {analysis.quality_check.metrics.height} px · isolated extreme pixels {analysis.quality_check.metrics.isolated_extreme_fraction ?? 'not measured'}</p>}
          </div>}
          {!analysis?.quality_check && analysis?.scan_quality_status && <p className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] leading-4 text-slate-600">Image quality: {analysis.scan_quality_status}</p>}
          {analysis?.analysis_warning && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-900">{analysis.analysis_warning}</p>}
          {analysis?.stenosis_detection_pipeline && <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[10px] leading-4 text-sky-950">
            <p className="font-semibold">Stenosis candidate pipeline · {formatStatus(analysis.stenosis_detection_pipeline.status)}</p>
            <p className="mt-1">{analysis.stenosis_detection_pipeline.method}</p>
            <p className="mt-1">Segmentation: {analysis.stenosis_detection_pipeline.segmentation_valid === true ? 'usable mask' : analysis.stenosis_detection_pipeline.segmentation_valid === false ? 'unavailable' : 'not run'} · QCA proposals: {analysis.stenosis_detection_pipeline.candidate_count ?? 'not available'}</p>
            {analysis.stenosis_detection_pipeline.cadica_localizer && <p className="mt-1">CADICA detector: {formatStatus(analysis.stenosis_detection_pipeline.cadica_localizer.status)} · predictions: {analysis.stenosis_detection_pipeline.cadica_localizer.candidate_count ?? 'not available'}</p>}
            <p className="mt-1 font-medium">{analysis.stenosis_detection_pipeline.warning} No candidate is a confirmed clinical diagnosis.</p>
          </div>}
          {analysis?.model_status && <p className="text-[10px] leading-4 text-slate-500">{analysis.model_status}</p>}
        </aside>
      </section>

      {analysis && <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-amber-950">Confidence and limitations</h2><p className="mt-1 text-xs text-amber-900">Per-scan confidence: {outputConfidence || 'not returned / not calibrated'}</p><p className="mt-1 text-xs text-amber-900">Heatmaps explain model activation; they are not clinical probabilities.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-900">Clinician review required</span></div><ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] leading-4 text-amber-950">{limitationItems.map((item,index)=><li key={index}>{item}</li>)}</ul></section>}

      <section className={`grid gap-4 lg:grid-cols-2 ${cadicaCasePattern.test(selectedId) ? '2xl:grid-cols-4' : '2xl:grid-cols-3'}`}>
        {[
          { key: 'gradcam', title: 'AI heatmap · Grad-CAM', description: 'Backend attribution overlays for the model outputs that support them.', images: [{ label: 'Original + U-Net segmentation Grad-CAM', src: visualizations.gradcam_heatmap_b64 }, ...(cadicaCasePattern.test(selectedId) ? [{ label: 'CADICA lesion localizer Grad-CAM', src: visualizations.cadica_detector_gradcam_b64 }] : [])] },
          { key: 'segmentation', title: /unet/i.test(String(explainability.segmentation_model || modelName)) ? 'U-Net segmentation output' : 'Segmentation output', description: 'Only masks and overlays returned by the backend are shown.', images: [{ label: 'Segmentation overlay', src: visualizations.mask_overlay_b64 }, { label: 'Binary segmentation mask', src: visualizations.raw_mask_b64 }] },
          { key: 'stenosis', title: 'Stenosis candidate localization', description: 'QCA research proposals and CADICA-trained lesion boxes are separate outputs.', images: [{ label: 'QCA candidate heatmap', src: visualizations.candidate_heatmap_b64 }, { label: 'QCA candidate localization', src: visualizations.stenosis_overlay_b64 }, ...(cadicaCasePattern.test(selectedId) ? [{ label: 'CADICA model prediction boxes', src: visualizations.cadica_detector_overlay_b64 }] : [])] },
          ...(cadicaCasePattern.test(selectedId) ? [{ key: 'cadica_reference', title: 'CADICA reference lesion boxes', description: 'Ground-truth dataset annotations; separate from all AI predictions.', images: [{ label: 'CADICA reference annotations', src: visualizations.cadica_reference_boxes_b64 }] }] : []),
        ].map(panel => (
          <article key={panel.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3"><h2 className="text-sm font-bold text-slate-900">{panel.title}</h2><p className="mt-1 text-[11px] text-slate-500">{panel.description}</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              {panel.images.map(image => {
                const blocked = qualityBlocked && panel.key !== 'cadica_reference';
                const src = blocked ? '' : image.src;
                return <figure key={image.label} className="min-w-0">
                  <figcaption className="mb-2 text-[11px] font-semibold text-slate-700">{image.label}</figcaption>
                  <ImageViewport
                    src={src}
                    alt={`${image.label} for case ${selectedId}`}
                    emptyTitle={analysisLoading ? 'Analysis in progress' : blocked ? 'Unavailable after quality check' : image.label === 'CADICA model prediction boxes' && analysis?.cadica_detector_predictions === null ? 'CADICA localizer not trained' : panel.key === 'cadica_reference' && cadicaCasePattern.test(selectedId) && caseData?.referenceAnnotationAvailable === false ? 'No reference boxes for this frame' : `${image.label} unavailable`}
                    emptyText={analysisLoading ? 'Waiting for the FastAPI analysis response.' : blocked ? 'AI inference was blocked. The original scan remains available above.' : image.label === 'CADICA model prediction boxes' && analysis?.cadica_detector_predictions === null ? analysis?.cadica_detector_status || 'Train the CADICA lesion localizer to generate research predictions.' : image.label === 'CADICA model prediction boxes' ? analysis?.cadica_detector_status || 'The model returned no prediction overlay for this frame.' : panel.key === 'cadica_reference' && cadicaCasePattern.test(selectedId) && caseData?.referenceAnnotationAvailable === false ? 'The CADICA dataset has no lesion annotation file for this frame. Choose a sample marked “reference boxes available” to view genuine ground-truth boxes.' : 'The backend did not return this visualization for the selected case.'}
                  />
                </figure>;
              })}
            </div>
            {panel.key === 'gradcam' && visualizations.gradcam_heatmap_b64 && <HeatmapLegend type="gradcam" hasCandidates={false} />}
            {panel.key === 'segmentation' && (visualizations.mask_overlay_b64 || visualizations.raw_mask_b64) && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">The overlay and raw mask are independent backend outputs. Empty or missing output is not reconstructed in the UI.</p>}
            {panel.key === 'stenosis' && (
              <>
                {visualizations.candidate_heatmap_b64 && <HeatmapLegend type="qca" hasCandidates={candidates.length > 0} />}
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <h3 className="text-xs font-semibold text-slate-800">QCA radius-profile research proposals ({candidates.length})</h3>
                  {candidates.length ? <ul className="mt-2 space-y-2">
                    {candidates.map((candidate, index) => {
                      const box = candidate.bbox_px;
                      const measurements = [
                        ['Bounding box (px)', box ? `x ${box.x}, y ${box.y}, w ${box.width}, h ${box.height}` : null],
                        ['Minimum radius (px)', candidate.minimum_radius_px],
                        ['Relative radius ratio', candidate.relative_radius_ratio],
                        ['Estimated narrowing (research)', candidate.estimated_narrowing_percent == null ? null : `${candidate.estimated_narrowing_percent}%`],
                        ['Area (pixels)', candidate.area_pixels],
                      ].filter(([, value]) => value !== null && value !== undefined && value !== '');
                      return <li key={candidate.candidate_id || candidate.id || index} className="rounded-lg bg-slate-50 p-2.5">
                        <p className="text-[11px] font-bold text-slate-800">{candidate.candidate_id || candidate.id || `Candidate ${index + 1}`}</p>
                        <dl className="mt-1 grid grid-cols-1 gap-1 text-[10px] sm:grid-cols-2">{measurements.map(([label, value]) => <div key={label} className="flex justify-between gap-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-700">{value}</dd></div>)}</dl>
                      </li>;
                    })}
                  </ul> : <p className="mt-2 text-[10px] leading-4 text-slate-500">{qualityBlocked ? 'Candidate detection was not run because image quality validation blocked inference.' : 'No candidate regions were returned. This does not confirm the absence of disease; no candidate box or measurement is inferred.'}</p>}
                  <p className="mt-2 text-[10px] leading-4 text-slate-500">Estimated narrowing is the relative reduction from the segmentation’s reference radius, not a validated clinical stenosis measurement. The reference segment may be imperfect; review the original image and do not use this estimate for diagnosis. No severity class or physical diameter is reported.</p>
                </div>
                {cadicaCasePattern.test(selectedId) && <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50/50 p-3">
                  <h3 className="text-xs font-semibold text-slate-800">CADICA-trained AI lesion predictions</h3>
                  <p className="mt-1 text-[10px] leading-4 text-slate-600">Cyan boxes are model predictions; red boxes in the separate reference panel are dataset ground truth. These research scores are not clinical confidence.</p>
                  {Array.isArray(analysis?.cadica_detector_predictions) && analysis.cadica_detector_predictions.length > 0
                    ? <ul className="mt-2 space-y-2">{analysis.cadica_detector_predictions.map((prediction, index) => {
                      const box = prediction.bbox_px;
                      return <li key={prediction.candidate_id || index} className="rounded-lg border border-cyan-100 bg-white p-2.5">
                        <p className="text-[11px] font-bold text-slate-800">{prediction.candidate_id || `Prediction ${index + 1}`} · {prediction.class_label || 'lesion'}</p>
                        <dl className="mt-1 grid grid-cols-1 gap-1 text-[10px] sm:grid-cols-2">
                          <div className="flex justify-between gap-2"><dt className="text-slate-500">Box (px)</dt><dd className="text-right font-medium text-slate-700">{box ? `x ${box.x}, y ${box.y}, w ${box.width}, h ${box.height}` : 'Not returned'}</dd></div>
                          {prediction.model_score != null && <div className="flex justify-between gap-2"><dt className="text-slate-500">Model score</dt><dd className="text-right font-medium text-slate-700">{Number(prediction.model_score).toFixed(3)} (uncalibrated)</dd></div>}
                          {prediction.model_version && <div className="flex justify-between gap-2"><dt className="text-slate-500">Model</dt><dd className="text-right font-medium text-slate-700">{prediction.model_version}</dd></div>}
                        </dl>
                      </li>;
                    })}</ul>
                    : <p className="mt-2 text-[10px] leading-4 text-slate-600">{analysis?.cadica_detector_status || 'No CADICA lesion-localizer result was returned for this frame.'}</p>}
                </div>}
              </>
            )}
            {panel.key === 'cadica_reference' && (visualizations.cadica_reference_boxes_b64 || analysis?.cadica_reference_annotations?.length > 0) && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] leading-4 text-slate-600"><span className="font-semibold text-rose-700">Red boxes are CADICA ground truth</span>, not AI predictions. If an overlay cannot be formed, returned box coordinates are listed below.</p>}
            {panel.key === 'cadica_reference' && analysis?.cadica_reference_annotations?.length > 0 && <ul className="mt-2 space-y-1 text-[10px] text-slate-600">{analysis.cadica_reference_annotations.map((annotation, index) => <li key={`${annotation.category}-${index}`}>{annotation.category}: {annotation.bbox_px?.x}, {annotation.bbox_px?.y}, {annotation.bbox_px?.width} × {annotation.bbox_px?.height} px</li>)}</ul>}
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-[#10264a]" /><h2 className="text-sm font-bold text-slate-900">Doctor observations</h2></div>
          <label className="mt-3 block text-xs font-medium text-slate-700">Review notes <textarea value={doctorObservations} onChange={event => setDoctorObservations(event.target.value)} rows={5} maxLength={5000} placeholder="Enter clinician observations for this case. Notes are submitted only when you explicitly approve and publish the report." className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
          {isClinician && !caseData?.datasetOnly && (
            <form onSubmit={handleApprove} className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-slate-700">Patient account email<input required type="email" value={patientEmail} onChange={event => setPatientEmail(event.target.value)} placeholder="patient@example.com" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-100" /></label>
              <button type="submit" disabled={!canApprove || approving || !patientEmail.trim()} className="w-full rounded-lg bg-[#123566] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0e2b54] disabled:cursor-not-allowed disabled:opacity-50">{approving ? 'Submitting review…' : report?.status === 'Approved' ? 'Report already approved' : 'Approve and publish report'}</button>
              {!canApprove && report?.status !== 'Approved' && <p className="text-[10px] leading-4 text-slate-500">Approval is available only for a saved, quality-validated analysis without a backend warning. The API also verifies patient registration and doctor appointment authorization.</p>}
              {approvalError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{approvalError}</p>}
              {approvalMessage && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{approvalMessage}</p>}
            </form>
          )}
          {!isClinician && <p className="mt-3 text-[10px] text-slate-500">Report approval is restricted to authorized clinician accounts.</p>}
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-sm font-bold text-slate-900">Doctor review status</h2><p className="mt-1 text-xs text-slate-500">Status from the report API for this case.</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">{formatStatus(reviewStatus)}</span>
          </div>
          {reportError && <p role="alert" className="mt-3 text-xs text-amber-800">{reportError}</p>}
          {report && <dl className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Report ID</dt><dd className="font-mono text-slate-800">{report.id}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Report date</dt><dd className="text-slate-800">{report.date || 'Not recorded'}</dd></div></dl>}
          {!report && !reportError && <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">No report record was returned for this case.</p>}
        </aside>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-[10px] leading-4 text-sky-950">
        <span className="inline-flex items-start gap-2"><Activity size={14} className="mt-0.5 shrink-0" />Research decision support only. Overlays explain returned model outputs and do not replace clinician review or verified image calibration.</span>
        <Link to="/ai-analysis" className="font-semibold underline underline-offset-2">Return to analysis dashboard</Link>
      </div>
    </div>
  );
}
