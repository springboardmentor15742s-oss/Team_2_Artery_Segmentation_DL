import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import {
  FolderKanban,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Plus,
  ArrowRight,
  TrendingUp,
  Activity,
  FileText,
  Download
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Pie, Line } from 'react-chartjs-2';

import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import { getAppointments, getCases, getReports, getSegmentationComparison, generateSegmentationComparison, getModelReports, getModelStatus, getSegmentationGallery, generateClassifierLearningCurves, getModelRocCurve } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

// Register Chart.js elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [segmentationReport, setSegmentationReport] = useState(null);
  const [modelReports, setModelReports] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [rocReport, setRocReport] = useState(null);
  const [curveBusy, setCurveBusy] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [galleryError, setGalleryError] = useState('');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reportMessage, setReportMessage] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportLoadError, setReportLoadError] = useState('');
  const [modalityChartType, setModalityChartType] = useState('doughnut'); // 'doughnut' | 'pie'
  const [regionChartType, setRegionChartType] = useState('bar'); // 'bar' | 'pie'

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const res = await getCases();
        setCases(res.cases || []);
        setLoadError('');
      } catch (err) {
        console.error('Failed to load dashboard data', err);
        setLoadError(err.message || 'Could not load dashboard data. Check your sign-in and backend connection.');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  useEffect(() => { getSegmentationComparison().then(setSegmentationReport).catch(() => setSegmentationReport(null)); }, []);
  useEffect(() => {
    Promise.all([getModelReports(), getModelStatus(), getSegmentationGallery(), getModelRocCurve()]).then(([reportsData,statusData,galleryData,rocData]) => {
      setModelReports(reportsData || null); setModelStatus(statusData || null); setGallery(galleryData || null); setRocReport(rocData || null);
    }).catch(error => setGalleryError(error.message || 'Held-out results could not be loaded.'));
  }, []);
  useEffect(() => { if (user?.role?.toLowerCase() === 'doctor') getAppointments().then(setAppointments).catch(() => setAppointments([])); }, [user?.role]);
  useEffect(() => {
    getReports()
      .then(data => { setReports(Array.isArray(data) ? data : []); setReportLoadError(''); })
      .catch(error => {
        console.error('Failed to load dashboard reports', error);
        setReportLoadError(error.message || 'Could not load report activity.');
      });
  }, []);

  if (user?.role?.toLowerCase() === 'patient') return <Navigate to="/patient-home" replace />;

  const generateReport = async () => {
    setGeneratingReport(true); setReportMessage('');
    try {
      const result = await generateSegmentationComparison();
      setReportMessage(result.message);
      window.setTimeout(() => getSegmentationComparison().then(report => { setSegmentationReport(report); setGeneratingReport(false); setReportMessage('Segmentation performance report generated from the held-out test masks.'); }).catch(() => { setGeneratingReport(false); }), 28000);
    } catch (error) { setReportMessage(error.message); setGeneratingReport(false); }
  };
  const downloadSegmentationReport = () => {
    if (!segmentationReport) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(segmentationReport, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'segmentation-performance-report.json'; link.click(); URL.revokeObjectURL(url);
  };

  // Compute Statistics
  const totalCases = cases.length;
  const completedCases = cases.filter((c) => c.status === 'Completed').length;
  const pendingCases = cases.filter((c) => c.status === 'Pending').length;
  const inProgressCases = cases.filter((c) => c.status === 'In Progress').length;
  const reviewCases = cases.filter((c) => c.status === 'Review Required' || c.status === 'Failed').length;
  const pendingReviewReports = reports.filter(report => report.status === 'Pending Review').length;
  const recentReports = reports.slice(0, 5);
  const detectorMetrics = modelReports?.testing?.metrics?.stenosis_detection || {};
  const severityMetrics = modelReports?.testing?.metrics?.severity_classification || {};
  const confusion = severityMetrics.confusion_matrix || [];
  const detectorCurve = modelReports?.classifier_learning_curves || modelReports?.training?.validation_metrics?.stenosis_detection?.training_curve || null;
  const gallerySample = gallery?.samples?.[galleryIndex] || null;
  const binaryConfusion = rocReport?.confusion_matrix?.values || [];
  const testCount = modelReports?.testing?.test_cases_count ?? null;
  const rocValues = rocReport?.curve || {};
  const rocPoints = (rocValues.false_positive_rate || []).map((x,index)=>({x,y:rocValues.true_positive_rate?.[index]})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
  const classifierTreePoints = detectorCurve?.values || [];
  const learningLossData = { labels:classifierTreePoints.map(point=>point.estimators), datasets:[
    {label:'Train loss',data:classifierTreePoints.map(point=>point.train?.log_loss ?? null),borderColor:'#ef4444',backgroundColor:'#ef4444',tension:.25},
    {label:'Validation loss',data:classifierTreePoints.map(point=>point.validation?.log_loss ?? null),borderColor:'#3b82f6',backgroundColor:'#3b82f6',tension:.25},
  ]};
  const learningScoreData = { labels:classifierTreePoints.map(point=>point.estimators), datasets:[
    {label:'Train accuracy',data:classifierTreePoints.map(point=>point.train?.accuracy == null ? null : point.train.accuracy*100),borderColor:'#0d9488',backgroundColor:'#0d9488',tension:.25},
    {label:'Validation accuracy',data:classifierTreePoints.map(point=>point.validation?.accuracy == null ? null : point.validation.accuracy*100),borderColor:'#7c3aed',backgroundColor:'#7c3aed',tension:.25},
    {label:'Validation F1',data:classifierTreePoints.map(point=>point.validation?.f1 == null ? null : point.validation.f1*100),borderColor:'#f59e0b',backgroundColor:'#f59e0b',borderDash:[5,4],tension:.25},
  ]};
  const learningOptions=(title,yTitle)=>({responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}},title:{display:true,text:title}},scales:{x:{title:{display:true,text:detectorCurve?.x_axis_label || 'Measured training step'}},y:{beginAtZero:false,title:{display:true,text:yTitle},grid:{color:'#f1f5f9'}}}});
  const rocChartData={datasets:[{label:`Held-out ROC${rocReport?.roc_auc == null ? '' : ` ? AUC ${(rocReport.roc_auc*100).toFixed(1)}%`}`,data:rocPoints,showLine:true,pointRadius:2,borderColor:'#2563eb',backgroundColor:'#2563eb',tension:0},{label:'Chance baseline',data:[{x:0,y:0},{x:1,y:1}],showLine:true,pointRadius:0,borderColor:'#94a3b8',borderDash:[5,4]}]};
  const rocChartOptions={responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}},scales:{x:{type:'linear',min:0,max:1,title:{display:true,text:'False positive rate (1 ? specificity)'}},y:{min:0,max:1,title:{display:true,text:'True positive rate (sensitivity)'}}}};

  // Modality Breakdown for Doughnut Chart
  const modalityCounts = cases.reduce((acc, c) => {
    const key = c.modality.split(' ')[0]; // CTA, MRA, DSA
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const doughnutData = {
    labels: Object.keys(modalityCounts),
    datasets: [
      {
        data: Object.values(modalityCounts),
        backgroundColor: [
          '#0284c7', // sky 600
          '#0d9488', // teal 600
          '#6366f1', // indigo 500
          '#f59e0b', // amber 500
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 14,
          font: { size: 11, family: 'Inter, sans-serif' },
        },
      },
    },
    cutout: modalityChartType === 'pie' ? '0%' : '70%',
  };

  // Anatomical Region Distribution for Bar / Pie Chart
  const regionCounts = cases.reduce((acc, c) => {
    const key = c.anatomicalRegion.split(' ')[0]; // Carotid, Coronary, Cerebral, etc.
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const regionPieColors = [
    '#0284c7', // sky 600
    '#0d9488', // teal 600
    '#6366f1', // indigo 500
    '#f59e0b', // amber 500
    '#ec4899', // pink 500
    '#8b5cf6', // purple 500
    '#10b981', // emerald 500
  ];

  const regionPieData = {
    labels: Object.keys(regionCounts),
    datasets: [
      {
        data: Object.values(regionCounts),
        backgroundColor: regionPieColors.slice(0, Object.keys(regionCounts).length),
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const regionPieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 10,
          font: { size: 11, family: 'Inter, sans-serif' },
        },
      },
    },
  };
  const barData = {
    labels: Object.keys(regionCounts),
    datasets: [
      {
        label: 'Cases by Region',
        data: Object.values(regionCounts),
        backgroundColor: '#0284c7',
        borderRadius: 6,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 10 } },
        grid: { color: '#f1f5f9' },
      },
      x: {
        ticks: { font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  const recentCases = [...cases].slice(0, 5);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Loading clinical metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>}
      {/* Top Welcome / Action Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-medical-900 rounded-2xl p-6 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-medical-500/20 text-medical-200 border border-medical-400/30 text-xs font-medium mb-2">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>Infosys Healthcare & Life Sciences AI Lab</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Artery Segmentation and Stenosis Detection using Advanced Deep Learning Techniques
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
            Multi-planar coronary lumen segmentation, QCA stenosis localization, and ACC/AHA clinical decision intelligence.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link to="/cases/new">
            <Button variant="primary" icon={Plus}>
              New Case
            </Button>
          </Link>
          <Link to="/upload">
            <Button variant="secondary" icon={UploadCloud}>
              Upload Scan
            </Button>
          </Link>
        </div>
      </div>

      {user?.role?.toLowerCase() === 'doctor' && <Card title="My appointments" subtitle={`${appointments.filter(a => ['Pending','Confirmed'].includes(a.status) && new Date(a.scheduledAt) >= new Date()).length} upcoming or awaiting confirmation`} action={<Link to="/appointments" className="text-sm font-semibold text-sky-700 hover:underline">Open appointments</Link>}>
        {appointments.length ? <div className="divide-y divide-slate-100">{appointments.slice(0, 5).map(appointment => <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold text-slate-900">{appointment.patientName}</p><p className="text-xs text-slate-500">{new Date(appointment.scheduledAt).toLocaleString()} · {appointment.reason || 'Appointment request'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${appointment.status === 'Pending' ? 'bg-amber-50 text-amber-800' : appointment.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{appointment.status}</span></div>)}</div> : <p className="text-sm text-slate-500">No patient appointment requests yet. New requests will appear here.</p>}
      </Card>}

      <Card title="Segmentation & stenosis workflow" subtitle="Original scan, reference mask, U-Net prediction and measured overlays from the fixed held-out test split">
        <div className="grid gap-5 lg:grid-cols-2 lg:items-center">
          <div><p className="text-sm leading-relaxed text-slate-600">Inspect original angiograms alongside reference vessel masks, predictions, and true/false-positive comparison overlays. Select a held-out case to compare the fixed test-set model output.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/xrays" className="rounded-lg bg-medical-700 px-3 py-2 text-xs font-semibold text-white">Open X-ray library</Link><Link to="/training" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Training & testing</Link></div><p className="mt-3 text-[11px] text-slate-500">Green=TP, red=FP, blue=FN. Research visualization only; not patient-specific diagnosis.</p></div>
          <img src="/segmentation_examples.png" alt="Original angiogram, reference segmentation, threshold baseline and refined prediction on held-out test examples" className="w-full rounded-xl border border-slate-200 bg-slate-950 object-contain" loading="lazy" />
          {gallerySample && <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">Held-out example ? {gallerySample.caseId}</h3><p className="mt-1 text-[10px] text-slate-500">{gallerySample.model} ? Dice {Number(gallerySample.metrics.dice).toFixed(3)} ? IoU {Number(gallerySample.metrics.iou).toFixed(3)} ? test split</p></div><div className="flex gap-2"><button type="button" disabled={galleryIndex===0} onClick={()=>setGalleryIndex(index=>Math.max(0,index-1))} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">Previous</button><span className="self-center text-[10px] text-slate-500">{galleryIndex+1} / {gallery.count}</span><button type="button" disabled={galleryIndex+1>=gallery.count} onClick={()=>setGalleryIndex(index=>Math.min(gallery.count-1,index+1))} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">Next</button></div></div><div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">{[['Original angiogram',gallerySample.original_b64],['Ground-truth mask',gallerySample.ground_truth_b64],['Model prediction',gallerySample.prediction_b64],['TP green ? FP red ? FN blue',gallerySample.overlay_b64]].map(([label,src])=><figure key={label} className="overflow-hidden rounded border border-slate-200"><figcaption className="border-b border-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{label}</figcaption><img src={src} alt={`${label} for ${gallerySample.caseId}`} className="h-36 w-full bg-slate-950 object-contain"/></figure>)}</div><p className="mt-2 text-[10px] text-amber-800">{gallerySample.limitations}</p></div>}
          {galleryError && <p role="alert" className="lg:col-span-2 rounded bg-rose-50 p-3 text-xs text-rose-800">{galleryError}</p>}
        </div>
      </Card>

      <Card title="Classifier training curves and held-out evaluation" subtitle="Random Forest measurements by cumulative tree count, plus cohort-level held-out ROC and confusion matrix. These are not neural-network epoch curves." action={<Button size="sm" variant="outline" disabled={curveBusy} onClick={async()=>{setCurveBusy(true);setReportMessage('');try{const result=await generateClassifierLearningCurves();setReportMessage(result.message);for(let attempt=0;attempt<8;attempt++){await new Promise(resolve=>setTimeout(resolve,1500));const updated=await getModelReports();if(updated?.classifier_learning_curves?.points?.length){setModelReports(updated);break;}}}catch(error){setReportMessage(error.message||'Classifier curve calculation failed.');}finally{setCurveBusy(false);}}}>{curveBusy?'Measuring?':'Measure classifier curve'}</Button>}>
        {reportMessage && <p className="mb-3 rounded-lg bg-sky-50 p-2 text-xs text-sky-800">{reportMessage}</p>}
        <div className="grid gap-4 xl:grid-cols-3"><div className="grid gap-3 md:grid-cols-2 xl:col-span-2">{classifierTreePoints.length ? <><div className="h-56 rounded border border-slate-200 p-2"><Line data={learningLossData} options={learningOptions('Stenosis classifier loss','Log loss')}/></div><div className="h-56 rounded border border-slate-200 p-2"><Line data={learningScoreData} options={learningOptions('Accuracy and F1','Score (%)')}/></div></> : <p className="rounded border border-dashed border-slate-300 p-4 text-xs text-slate-600 md:col-span-2">No measured curve is saved. Choose ?Measure classifier curve? to evaluate the fitted forest?s train/validation prefixes. The held-out test split is excluded.</p>}</div><div className="grid gap-3 rounded border border-slate-200 p-3"><div className="h-48">{rocPoints.length>1?<Line data={rocChartData} options={rocChartOptions}/>:<p className="grid h-full place-items-center text-center text-xs text-slate-500">Held-out ROC coordinates are unavailable; rerun model testing to generate them.</p>}</div>{binaryConfusion.length===2 && <div><p className="text-[10px] font-bold uppercase text-slate-600">Held-out binary confusion matrix</p><div className="mt-2 grid grid-cols-2 gap-2">{[['TN',binaryConfusion[0]?.[0],'bg-emerald-50'],['FP',binaryConfusion[0]?.[1],'bg-rose-50'],['FN',binaryConfusion[1]?.[0],'bg-amber-50'],['TP',binaryConfusion[1]?.[1],'bg-sky-50']].map(([label,value,color])=><div key={label} className={`rounded p-2 ${color}`}><b className="text-[10px]">{label}</b><span className="ml-2 text-sm font-bold">{value}</span></div>)}</div></div>}<p className="text-[10px] text-slate-500">{testCount ?? '?'} held-out cases. Cohort statistics are not per-scan confidence.</p></div></div>
      </Card>

      <Card title="Held-out segmentation examples" subtitle={gallery ? `${gallery.count} fixed test samples ? ${gallery.model}` : 'Original, reference mask, prediction and overlay from the fixed test split'}>
        {galleryError && <p role="alert" className="mb-3 rounded bg-rose-50 p-2 text-xs text-rose-800">{galleryError}</p>}
        {gallerySample ? <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm text-slate-900">{gallerySample.caseId}</b><p className="text-[10px] text-slate-500">Dice {Number(gallerySample.metrics.dice).toFixed(3)} ? IoU {Number(gallerySample.metrics.iou).toFixed(3)} ? test split</p></div><div className="flex items-center gap-2"><button type="button" disabled={!galleryIndex} onClick={()=>setGalleryIndex(i=>Math.max(0,i-1))} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Previous</button><span className="text-[10px]">{galleryIndex+1}/{gallery.count}</span><button type="button" disabled={galleryIndex+1>=gallery.count} onClick={()=>setGalleryIndex(i=>Math.min(gallery.count-1,i+1))} className="rounded border px-3 py-1 text-xs disabled:opacity-40">Next</button></div></div><div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{[['Original',gallerySample.original_b64],['Ground truth',gallerySample.ground_truth_b64],['U-Net prediction',gallerySample.prediction_b64],['TP green ? FP red ? FN blue',gallerySample.overlay_b64]].map(([label,src])=><figure key={label} className="overflow-hidden rounded border border-slate-200"><figcaption className="border-b px-2 py-1 text-[10px] font-semibold">{label}</figcaption><img src={src} alt={`${label} ${gallerySample.caseId}`} className="h-40 w-full bg-slate-950 object-contain"/></figure>)}</div><p className="mt-2 text-[10px] text-amber-800">{gallerySample.limitations}</p></> : <p className="rounded border border-dashed border-slate-300 p-4 text-xs text-slate-600">{galleryError || 'Loading held-out examples?'}</p>}
      </Card>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cases */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('totalCases')}
            </span>
            <div className="w-9 h-9 rounded-lg bg-medical-50 text-medical-600 flex items-center justify-center">
              <FolderKanban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono">
              {totalCases}
            </span>
            <span className="text-xs text-slate-400">active records</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="text-emerald-600 font-semibold">100%</span> tracked in registry
          </div>
        </div>

        {/* Pending Analysis */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('pendingCases')}
            </span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-amber-600 font-mono">
              {pendingCases}
            </span>
            <span className="text-xs text-slate-400">in queue</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Awaiting scan processing
          </div>
        </div>

        {/* Completed Analysis */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('completedCases')}
            </span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600 font-mono">
              {completedCases}
            </span>
            <span className="text-xs text-slate-400">cases</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Reports finalized
          </div>
        </div>

        {/* In Progress / Review */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              In Progress / Review
            </span>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-indigo-600 font-mono">
              {inProgressCases + reviewCases}
            </span>
            <span className="text-xs text-slate-400">cases</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Active preparation & review
          </div>
        </div>
      </div>

      <Card
        title="Automated report activity"
        subtitle="Analysis reports are created automatically when a case analysis completes."
        icon={FileText}
        action={<Link to="/reports" className="text-sm font-semibold text-sky-700 hover:underline">Open reports</Link>}
        noPadding
      >
        {reportLoadError ? (
          <p role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{reportLoadError}</p>
        ) : recentReports.length ? (
          <>
            <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{reports.length} reports</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">{pendingReviewReports} awaiting clinician review</span>
            </div>
            <div className="divide-y divide-slate-100">
              {recentReports.map(report => (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link to="/reports" className="font-mono text-sm font-semibold text-sky-700 hover:underline">{report.id}</Link>
                    <p className="text-xs text-slate-500">Case {report.caseId} · Patient {report.patientId} · {report.date || 'Date unavailable'}</p>
                  </div>
                  <StatusBadge status={report.status} size="xs" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            No reports have been generated yet. Run AI analysis on a quality-passing case to create a report for clinician review.
          </div>
        )}
      </Card>

      <Card title="Compare segmentation models" subtitle={segmentationReport ? `Measured on ${segmentationReport.cases_evaluated} held-out test cases · same reference masks` : 'Generate a measured comparison on the supplied held-out image masks'} action={<div className="flex gap-2"><Button size="sm" variant="outline" icon={Activity} onClick={generateReport} disabled={generatingReport}>{generatingReport ? 'Generating…' : 'Generate performance report'}</Button><Button size="sm" variant="ghost" icon={Download} onClick={downloadSegmentationReport} disabled={!segmentationReport}>JSON</Button></div>}>
        {reportMessage && <p className="mb-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-800">{reportMessage}</p>}
        {segmentationReport?.metrics?.length ? <div className="grid gap-4 lg:grid-cols-2"><div className="h-64"><Bar data={{labels: segmentationReport.metrics.map(model => model.name), datasets: [{label:'Dice',data:segmentationReport.metrics.map(model=>model.dice),backgroundColor:'#0284c7'},{label:'IoU',data:segmentationReport.metrics.map(model=>model.iou),backgroundColor:'#14b8a6'},{label:'Precision',data:segmentationReport.metrics.map(model=>model.precision),backgroundColor:'#f59e0b'},{label:'Recall',data:segmentationReport.metrics.map(model=>model.recall),backgroundColor:'#8b5cf6'}]}} options={{responsive:true,maintainAspectRatio:false,scales:{y:{min:0,max:1,ticks:{callback:value=>`${Math.round(value*100)}%`}}}}}/></div><div className="space-y-3">{segmentationReport.metrics.map(model=><div key={model.name} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{model.name}</h3>{segmentationReport.selected_model===model.name&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Selected by Dice</span>}</div><div className="mt-3 grid grid-cols-4 gap-2 text-center">{[['Dice',model.dice],['IoU',model.iou],['Precision',model.precision],['Recall',model.recall]].map(([label,value])=><div key={label}><div className="text-[10px] uppercase text-slate-400">{label}</div><div className="font-mono text-sm font-bold text-slate-800">{(value*100).toFixed(1)}%</div></div>)}</div></div>)}<p className="text-[11px] leading-relaxed text-slate-500">{segmentationReport.limitations}</p></div></div> : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Segmentation comparison report is not available yet. Generate it to evaluate Dice, IoU, precision, and recall from the test masks.</div>}
      </Card>

      {segmentationReport?.deep_learning_comparison?.models?.length > 0 && <Card title="Deep learning architecture comparison" subtitle={`U-Net vs U-Net++ · selected by validation Dice, reported on ${segmentationReport.deep_learning_comparison.test_cases} held-out cases`}>
        <div className="grid gap-3 md:grid-cols-2">{segmentationReport.deep_learning_comparison.models.map(model=><div key={model.name} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">{model.name}</h3>{segmentationReport.deep_learning_comparison.selected_model===model.name&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Best validation Dice</span>}</div><div className="mt-3 grid grid-cols-4 gap-2 text-center">{[['Dice',model.test_metrics.dice],['IoU',model.test_metrics.iou],['Precision',model.test_metrics.precision],['Recall',model.test_metrics.recall]].map(([label,value])=><div key={label}><div className="text-[10px] uppercase text-slate-400">{label}</div><div className="font-mono text-sm font-bold text-slate-800">{(value*100).toFixed(1)}%</div></div>)}</div></div>)}</div><p className="mt-3 text-xs text-slate-500">Metrics are calculated against supplied reference masks after model training. Install the optional PyTorch package and train from Training & Testing to populate this comparison.</p>
      </Card>}

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modality Chart with Pie / Donut toggle */}
        <Card
          title="Imaging Modality Distribution"
          subtitle="Breakdown of registered scan modalities"
          className="lg:col-span-1"
          action={
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px]">
              <button
                type="button"
                onClick={() => setModalityChartType('doughnut')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                  modalityChartType === 'doughnut' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Doughnut
              </button>
              <button
                type="button"
                onClick={() => setModalityChartType('pie')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                  modalityChartType === 'pie' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Pie
              </button>
            </div>
          }
        >
          <div className="h-64 flex items-center justify-center">
            {Object.keys(modalityCounts).length > 0 ? (
              modalityChartType === 'pie' ? (
                <Pie data={doughnutData} options={doughnutOptions} />
              ) : (
                <Doughnut data={doughnutData} options={doughnutOptions} />
              )
            ) : (
              <p className="text-xs text-slate-400">No modality data available</p>
            )}
          </div>
        </Card>

        {/* Anatomical Region Distribution with Bar / Pie toggle */}
        <Card
          title="Cases by Anatomical Region"
          subtitle="Vascular territories under diagnostic observation"
          className="lg:col-span-2"
          action={
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px]">
              <button
                type="button"
                onClick={() => setRegionChartType('bar')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                  regionChartType === 'bar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Bar
              </button>
              <button
                type="button"
                onClick={() => setRegionChartType('pie')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                  regionChartType === 'pie' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Pie
              </button>
            </div>
          }
        >
          <div className="h-64 flex items-center justify-center">
            {Object.keys(regionCounts).length > 0 ? (
              regionChartType === 'pie' ? (
                <Pie data={regionPieData} options={regionPieOptions} />
              ) : (
                <div className="h-full w-full">
                  <Bar data={barData} options={barOptions} />
                </div>
              )
            ) : (
              <p className="text-xs text-slate-400 flex items-center justify-center h-full">No anatomical data available</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Cases Table Preview */}
      <Card
        title="Recent Cases"
        subtitle="Recently registered clinical records"
        action={
          <Link
            to="/cases"
            className="inline-flex items-center gap-1 text-xs font-semibold text-medical-600 hover:text-medical-700"
          >
            <span>View All Cases</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Patient ID</th>
                <th className="py-3 px-4">Modality</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Scan Date</th>
                <th className="py-3 px-4">Analysis Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentCases.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-slate-900">
                    {c.id}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {c.patientId}
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium">
                    {c.modality.split(' ')[0]}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {c.anatomicalRegion}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {c.scanDate}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} size="xs" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => navigate(`/cases/${c.id}`)}
                      className="text-xs text-medical-600 hover:text-medical-800 font-medium hover:underline"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
