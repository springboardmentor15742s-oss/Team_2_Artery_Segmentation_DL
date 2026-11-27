import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Activity,
  UploadCloud,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
  Calendar,
  Tag,
  Stethoscope,
  Info,
  Sparkles,
  Eye,
  AlertTriangle,
  Zap,
  TrendingDown,
  ShieldCheck,
  Check
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import PreprocessingStatus from '../components/Preprocessing/PreprocessingStatus';
import FileUpload from '../components/FileUpload/FileUpload';
import NarrowingEstimate from '../components/NarrowingEstimate';
import { getCase, uploadMedicalImage, analyzeCase, getCaseAnalysis, datasetImageUrl, caseScanUrl } from '../services/api';

export default function CaseDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [showInlineUpload, setShowInlineUpload] = useState(false);
  const [activeTab, setActiveTab] = useState('stenosis'); // 'stenosis', 'heatmap', 'mask'

  const fetchCaseDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      setAnalysisError('');
      const data = await getCase(id);
      setCaseData(data);
      // Fetch associated AI analysis findings
      try {
        const analysis = await getCaseAnalysis(id);
        setAnalysisData(analysis?.analyzed ? analysis : null);
        if (analysis?.analyzed) setActiveTab('comparison');
        const qualityIssue = /image quality validation failed|too small for angiography|image quality could not be validated/i.test(analysis?.message || '');
        if (qualityIssue) setAnalysisError(analysis.message);
      } catch (aErr) {
        setAnalysisData(null);
        console.warn('Could not load prior analysis:', aErr);
      }
    } catch (err) {
      setError(err.message || `Case ${id} could not be loaded.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseDetails();
  }, [id]);

  const handleUploadSuccess = async (fileMeta) => {
    try {
      await uploadMedicalImage(id, fileMeta);
      await fetchCaseDetails();
      setShowInlineUpload(false);
    } catch (err) {
      console.error('Upload sync failed', err);
    }
  };

  const handleTriggerAnalysis = async () => {
    try {
      setAnalyzing(true);
      const res = await analyzeCase(id);
      setAnalysisError('');
      if (res?.analysis) {
        setAnalysisData({
          ...res.analysis,
          analyzed: true,
          status: 'Completed'
        });
      }
      await fetchCaseDetails();
    } catch (err) {
      setAnalysisError(err.message || 'AI analysis could not be completed.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Loading clinical record {id}...</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Case Record Not Found</h2>
        <p className="text-sm text-slate-500">{error || 'The requested clinical case does not exist.'}</p>
        <Link to="/cases">
          <Button variant="outline" icon={ArrowLeft}>
            Back to Case Registry
          </Button>
        </Link>
      </div>
    );
  }

  const { fileInfo } = caseData;
  const scanQualityBlocked = /image quality validation failed|too small for angiography|image quality could not be validated/i.test(analysisError);
  const scanImageUrl = fileInfo?.storedFileName
    ? caseScanUrl(caseData.id)
    : fileInfo?.fileName ? datasetImageUrl(fileInfo.fileName) : '';

  const getSeverityBadgeColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'normal':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'mild':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      case 'moderate':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'severe':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'critical':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/cases"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Back to Cases"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-mono">
                {caseData.id}
              </h1>
              <StatusBadge status={caseData.status} size="md" />
              {analysisData?.analyzed && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getSeverityBadgeColor(analysisData.severity)}`}>
                  {analysisData.severity} Stenosis ({analysisData.narrowing_percentage == null ? 'estimate unavailable' : `${analysisData.narrowing_percentage}%`})
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Patient ID: <span className="font-mono font-semibold text-slate-700">{caseData.patientId}</span> • Registered on {caseData.scanDate} • Region: {caseData.anatomicalRegion}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={handleTriggerAnalysis}
            disabled={analyzing || scanQualityBlocked}
            className="bg-gradient-to-r from-medical-600 to-sky-600 hover:from-medical-700 hover:to-sky-700 text-white shadow-sm"
          >
            {analyzing ? 'Analyzing with AI...' : scanQualityBlocked ? 'Replace scan to analyze' : analysisData?.analyzed ? 'Re-Run AI Analysis' : 'Run AI Diagnostic Analysis'}
          </Button>

          <Button
            variant={showInlineUpload ? 'secondary' : 'outline'}
            icon={UploadCloud}
            onClick={() => setShowInlineUpload(!showInlineUpload)}
          >
            {showInlineUpload ? 'Close Upload' : fileInfo ? 'Re-upload Scan' : 'Upload Scan'}
          </Button>
        </div>
      </div>

      {analysisError && (scanQualityBlocked
        ? <p role="status" className="flex items-start gap-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{analysisError} Analysis is paused until the original readable X-ray/DICOM is attached. <Link to={`/viewer/${encodeURIComponent(id)}`} className="font-semibold underline">Open scan viewer</Link>.</span></p>
        : <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{analysisError}</div>)}

      {/* Inline Upload Drawer */}
      {showInlineUpload && (
        <Card
          title="Upload Medical Scan for Case"
          subtitle={`Attaching DICOM / NIfTI volumetric series to ${caseData.id}`}
          icon={UploadCloud}
        >
          <FileUpload
            selectedCaseId={caseData.id}
            onUploadSuccess={handleUploadSuccess}
          />
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Patient & Acquisition Demographics */}
        <div className="space-y-6 lg:col-span-1">
          {/* Patient Card */}
          <Card
            title="Patient Clinical Profile"
            subtitle="Cardiovascular risk factors & history"
            icon={User}
          >
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Patient Identifier</span>
                <span className="font-mono font-semibold text-slate-800">
                  {caseData.patientId}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Demographics</span>
                <span className="font-medium text-slate-800">
                  {caseData.age} yrs • {caseData.gender}
                </span>
              </div>

              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-500 block mb-1.5">Cardiovascular Risk Profile</span>
                <div className="flex flex-wrap gap-1.5">
                  {caseData.riskFactors && caseData.riskFactors.length > 0 ? (
                    caseData.riskFactors.map((rf, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {rf}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400 text-xs">No risk factors recorded</span>
                  )}
                </div>
              </div>

              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-500 block mb-1">Medical History</span>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {caseData.medicalHistory || 'No prior coronary intervention reported.'}
                </p>
              </div>

              {caseData.clinicalNotes && (
                <div className="py-2">
                  <span className="text-slate-500 block mb-1">Clinical Notes</span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-medical-50/50 p-2.5 rounded-lg border border-medical-100">
                    {caseData.clinicalNotes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Acquisition Protocol Card */}
          <Card
            title="Imaging Acquisition Protocol"
            subtitle="Modality and scan metadata"
            icon={Activity}
          >
            <div className="space-y-3.5 text-xs sm:text-sm">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Case Identifier</span>
                <span className="font-mono font-semibold text-medical-700">
                  {caseData.id}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Modality</span>
                <span className="font-medium text-slate-800">
                  {caseData.modality}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Scan Date</span>
                <span className="font-mono text-slate-800">
                  {caseData.scanDate}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Anatomical Target</span>
                <span className="font-medium text-slate-800">
                  {caseData.anatomicalRegion}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">AI Diagnostic Suite</span>
                <span className="font-mono text-xs text-medical-800 bg-medical-50 border border-medical-200 px-2 py-0.5 rounded font-semibold">
                  {caseData.modelVersion}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: AI Diagnostic Viewer & Quantitative Findings */}
        <div className="space-y-6 lg:col-span-2">
          {/* Main Visual Diagnostic Card */}
          <Card
            title="Infosys Artery AI — Multi-Planar Diagnostic Viewer"
            subtitle="Artery segmentation, QCA stenosis candidate localization, and interpretable narrowing measurements"
            icon={Layers}
          >
            {analyzing ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4 bg-slate-900 rounded-xl text-white">
                <div className="w-12 h-12 rounded-xl bg-medical-600/30 border border-medical-500 text-medical-400 flex items-center justify-center animate-spin">
                  <Activity className="w-6 h-6" />
                </div>
                <div className="text-center space-y-1">
                  <h4 className="text-base font-bold text-white">
                    Running artery segmentation & QCA analysis...
                  </h4>
                  <p className="text-xs text-slate-400">
                    Extracting vessel structure, measuring lumen caliber, and localizing stenosis candidates.
                  </p>
                </div>
              </div>
            ) : analysisData?.visualizations ? (
              <div className="space-y-5">
                {/* View Tabs */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActiveTab('comparison')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'comparison'
                          ? 'bg-white text-medical-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Compare Images
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('stenosis')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'stenosis'
                          ? 'bg-white text-medical-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Stenosis Localization
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('heatmap')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'heatmap'
                          ? 'bg-white text-medical-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Candidate Heatmap (QCA)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('mask')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'mask'
                          ? 'bg-white text-medical-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Lumen Segmentation Mask
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>AI Model Inference: {analysisData.inference_time_ms || 120} ms</span>
                  </div>
                </div>

                {/* Image Display Canvas */}
                {activeTab === 'comparison' ? (
                  <div className="grid min-h-[340px] grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 md:grid-cols-2">
                    <figure className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-black">
                      <figcaption className="border-b border-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-200">Original angiogram</figcaption>
                      <img
                        src={analysisData.visualizations.original_b64 || scanImageUrl}
                        alt={`Original angiogram for ${caseData.id}`}
                        className="max-h-[380px] min-h-[300px] w-full flex-1 object-contain"
                      />
                    </figure>
                    <figure className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-black">
                      <figcaption className="border-b border-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-200">Segmentation and stenosis overlay</figcaption>
                      <img
                        src={analysisData.visualizations.stenosis_overlay_b64}
                        alt={`Vessel segmentation and estimated candidate overlay for ${caseData.id}`}
                        className="max-h-[380px] min-h-[300px] w-full flex-1 object-contain"
                      />
                    </figure>
                  </div>
                ) : (
                  <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2">
                    <img
                      src={
                        activeTab === 'stenosis'
                          ? analysisData.visualizations.stenosis_overlay_b64
                          : activeTab === 'heatmap'
                          ? analysisData.visualizations.candidate_heatmap_b64
                          : analysisData.visualizations.mask_overlay_b64
                      }
                      alt="AI Diagnostic Visualization"
                      className="max-h-[380px] w-auto rounded-lg object-contain shadow-lg"
                    />
                    <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-[11px] text-white backdrop-blur-md">
                      {activeTab === 'stenosis' ? (
                        <>
                          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>Normal lumen</span>
                          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>Candidate region</span>
                          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>Estimated narrowing</span>
                        </>
                      ) : activeTab === 'heatmap' ? (
                        <span>QCA candidate regions are derived from the segmented lumen-radius profile.</span>
                      ) : (
                        <span>Cyan = segmented coronary lumen</span>
                      )}
                    </div>
                  </div>
                )}

                <NarrowingEstimate analysis={analysisData} />

                {/* Quantitative Coronary Angiography (QCA) Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                      Min Lumen Diam (MLD)
                    </span>
                    <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                      {analysisData.min_diameter_mm == null ? 'N/A' : `${analysisData.min_diameter_mm} mm`}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Ref: {analysisData.reference_diameter_mm == null ? 'N/A' : `${analysisData.reference_diameter_mm} mm`}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                      Dice Agreement
                    </span>
                    <span className="text-xl font-bold font-mono text-emerald-600 mt-1 block">
                      {analysisData.dice_score == null ? 'N/A' : `${(analysisData.dice_score * 100).toFixed(1)}%`}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      IoU: {analysisData.iou_score == null ? 'N/A' : `${(analysisData.iou_score * 100).toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                      Model Confidence
                    </span>
                    <span className="text-xl font-bold font-mono text-medical-700 mt-1 block">
                      {analysisData.confidence_score == null ? 'N/A' : `${(analysisData.confidence_score * 100).toFixed(1)}%`}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      {analysisData.model_version || 'Artery AI QCA model'}
                    </span>
                  </div>
                </div>

                {(analysisData.explainability || analysisData.candidate_regions?.length > 0) && <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4"><h4 className="text-sm font-bold text-slate-900">QCA radius-profile research proposals</h4><p className="mt-1 text-xs leading-relaxed text-slate-600">{analysisData.explainability?.summary || 'Candidate regions are selected from local vessel-radius minima.'} The narrowing estimate is an unvalidated pixel-radius ratio, not a diagnosis.</p>{analysisData.candidate_regions?.length ? <div className="mt-3 space-y-2">{analysisData.candidate_regions.map((candidate, index) => <div key={candidate.candidate_id || index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-100 bg-white p-3 text-xs"><span className="font-semibold text-slate-800">{candidate.candidate_id || `Candidate ${index + 1}`}</span><span className="text-slate-600">Minimum radius {candidate.minimum_radius_px}px · relative ratio {candidate.relative_radius_ratio ?? 'not returned'} · estimated narrowing {candidate.estimated_narrowing_percent == null ? 'not returned' : `${candidate.estimated_narrowing_percent}%`}</span></div>)}</div> : <p className="mt-3 text-xs font-medium text-slate-600">No candidate regions were returned. This does not confirm the absence of disease.</p>}</div>}

                {/* Evidence-Based Clinical Recommendations */}
                {analysisData.clinical_recommendations && (
                  <div className="bg-gradient-to-r from-medical-50/70 to-sky-50/70 p-4 rounded-xl border border-medical-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-medical-700" />
                        <h4 className="text-sm font-bold text-slate-900">
                          Clinical Management Protocol — {analysisData.clinical_recommendations.management_class}
                        </h4>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-medical-100 text-medical-800 border border-medical-300">
                        {analysisData.clinical_recommendations.action}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <strong>Diagnostic Assessment:</strong> {analysisData.clinical_recommendations.summary}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <strong>ACC/AHA Clinical Guidelines:</strong> {analysisData.clinical_recommendations.guidelines}
                    </p>
                  </div>
                )}
              </div>
            ) : fileInfo ? (
              <div className="space-y-5">
                {fileInfo.fileName && <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><img src={fileInfo.storedFileName ? caseScanUrl(caseData.id) : datasetImageUrl(fileInfo.fileName)} alt={`Angiogram for ${caseData.id}`} className="mx-auto max-h-[460px] w-full object-contain" onError={(event) => { event.currentTarget.parentElement.style.display = 'none'; }} /><p className="border-t border-slate-800 px-3 py-2 text-center text-xs text-slate-400">De-identified angiogram preview · {fileInfo.fileName}</p></div>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">File Name</span>
                    <span className="text-xs font-mono font-semibold text-slate-900 truncate block mt-0.5" title={fileInfo.fileName}>
                      {fileInfo.fileName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Format</span>
                    <span className="text-xs font-semibold text-slate-800 block mt-0.5">
                      {fileInfo.fileType}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">File Size</span>
                    <span className="text-xs font-semibold text-slate-800 block mt-0.5">
                      {fileInfo.fileSize}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Resolution</span>
                    <span className="text-xs font-mono text-slate-800 block mt-0.5">
                      {fileInfo.resolution || '512 x 512'}
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl bg-slate-900 text-white p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
                  <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-200">
                    Medical Scan Attached & Verified
                  </h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5 leading-relaxed">
                    Scan file <span className="font-mono text-sky-300">{fileInfo.fileName}</span> is loaded and ready for multi-task coronary vessel segmentation and QCA stenosis evaluation.
                  </p>
                  <Button
                    variant="primary"
                    icon={Sparkles}
                    onClick={handleTriggerAnalysis}
                    disabled={analyzing}
                    className="bg-gradient-to-r from-medical-600 to-sky-600 hover:from-medical-700 hover:to-sky-700 text-white font-semibold shadow-md px-6 py-2.5"
                  >
                    {analyzing ? 'Processing Scan...' : 'Initiate AI Diagnostic Analysis'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800">
                  No Medical Scan Attached Yet
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Attach a DICOM or angiogram scan series to begin automated vessel segmentation and stenosis grading.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  icon={UploadCloud}
                  onClick={() => setShowInlineUpload(true)}
                >
                  Upload Medical Scan
                </Button>
              </div>
            )}
          </Card>

          {/* Preprocessing Interface Component */}
          <PreprocessingStatus
            currentStage={
              analysisData?.analyzed
                ? 'ready'
                : fileInfo
                ? fileInfo.uploadStatus === 'Failed'
                  ? 'failed'
                  : 'ready'
                : 'validation'
            }
          />
        </div>
      </div>
    </div>
  );
}
