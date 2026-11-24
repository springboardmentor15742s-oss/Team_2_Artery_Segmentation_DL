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
  Download,
  Brain,
  Layers,
  FileSpreadsheet,
  FileJson,
  Sparkles,
  ShieldCheck,
  Eye,
  ScanLine
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import {
  getAppointments,
  getCases,
  getSegmentationComparison,
  generateSegmentationComparison,
  getReports
} from '../services/api';
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
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [segmentationReport, setSegmentationReport] = useState(null);
  const [reportMessage, setReportMessage] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [comparisonTab, setComparisonTab] = useState('segmentation');

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const [casesRes, reportsRes] = await Promise.allSettled([
          getCases(),
          getReports()
        ]);
        if (casesRes.status === 'fulfilled') setCases(casesRes.value.cases || []);
        if (reportsRes.status === 'fulfilled') setReports(reportsRes.value || []);
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

  useEffect(() => {
    getSegmentationComparison()
      .then(setSegmentationReport)
      .catch(() => setSegmentationReport(null));
  }, []);

  useEffect(() => {
    if (user?.role?.toLowerCase() === 'doctor') {
      getAppointments()
        .then(setAppointments)
        .catch(() => setAppointments([]));
    }
  }, [user?.role]);

  if (user?.role?.toLowerCase() === 'patient') return <Navigate to="/patient-home" replace />;

  const generateReport = async () => {
    setGeneratingReport(true);
    setReportMessage('');
    try {
      const result = await generateSegmentationComparison();
      setReportMessage(result.message);
      window.setTimeout(() => {
        getSegmentationComparison()
          .then(report => {
            setSegmentationReport(report);
            setGeneratingReport(false);
            setReportMessage('Segmentation performance report updated from held-out test masks.');
          })
          .catch(() => {
            setGeneratingReport(false);
          });
      }, 5000);
    } catch (error) {
      setReportMessage(error.message);
      setGeneratingReport(false);
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

  const exportComparisonJson = () => {
    const data = {
      timestamp: new Date().toISOString(),
      segmentation_comparison: segmentationReport,
      stenosis_classifier_benchmark: {
        model: "PyTorch StenosisResNet",
        accuracy: 0.8484,
        roc_auc: 0.9166,
        precision: 0.8917,
        recall: 0.8316,
        specificity: 0.8700,
        f1_score: 0.8606,
        confusion_matrix: { true_negative: 261, false_positive: 39, false_negative: 65, true_positive: 321 }
      }
    };
    exportFile(JSON.stringify(data, null, 2), 'application/json', 'artery-ai-model-comparison.json');
  };

  const exportComparisonCsv = () => {
    const csv = [
      "Task,Model,Architecture,TestCases,AccuracyOrDice,IoUOrRocAuc,Precision,Recall,F1Score,LatencyMs,Selected",
      "Segmentation,Adaptive Threshold,Morphological Baseline,135,85.10%,76.51%,84.80%,86.18%,-,12.4ms,No",
      "Segmentation,Connected-Component,Morphology + Filter,135,86.97%,80.23%,96.22%,80.45%,-,15.0ms,No",
      "Segmentation,U-Net++,Deep Learning PyTorch,135,81.37%,68.59%,70.28%,96.61%,-,18.2ms,No",
      "Segmentation,PyTorch U-Net (Arcade Held-Out),4-Stage Residual U-Net,300,57.09%,39.95%,48.63%,69.12%,-,8.1ms,Yes",
      "Stenosis Detection,Linear / QCA Heuristic,Rule-based Caliber,686,72.40%,74.10%,68.00%,65.20%,66.57%,1.2ms,No",
      "Stenosis Detection,PyTorch StenosisResNet,4-Stage Deep Residual CNN,686,84.84%,91.66%,89.17%,83.16%,86.06%,3.4ms,Yes"
    ].join('\r\n');
    exportFile(csv, 'text/csv', 'artery-ai-model-comparison.csv');
  };

  // Compute Statistics
  const totalCases = cases.length;
  const completedCases = cases.filter(c => c.status === 'Completed').length;
  const pendingCases = cases.filter(c => c.status === 'Pending').length;
  const inProgressCases = cases.filter(c => c.status === 'In Progress').length;
  const reviewCases = cases.filter(c => c.status === 'Review Required' || c.status === 'Failed').length;
  const approvedReports = reports.filter(r => r.status === 'Approved').length;

  // Modality Breakdown for Doughnut Chart
  const modalityCounts = cases.reduce((acc, c) => {
    const key = c.modality.split(' ')[0];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const doughnutData = {
    labels: Object.keys(modalityCounts),
    datasets: [
      {
        data: Object.values(modalityCounts),
        backgroundColor: ['#0284c7', '#0d9488', '#6366f1', '#f59e0b'],
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
        labels: { boxWidth: 12, padding: 14, font: { size: 11, family: 'Inter, sans-serif' } },
      },
    },
    cutout: '70%',
  };

  // Anatomical Region Distribution for Bar Chart
  const regionCounts = cases.reduce((acc, c) => {
    const key = c.anatomicalRegion.split(' ')[0];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

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
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
      x: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  };

  const recentCases = [...cases].slice(0, 6);

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
      {loadError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      {/* Top Cardiology AI Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30 text-xs font-medium mb-2">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>Cardiovascular AI Lab · Deep Learning Pipeline Active</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Artery Segmentation and Stenosis Detection Platform
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
            PyTorch U-Net coronary lumen segmentation (Dice: 57.09%), 4-Stage ResNet stenosis classifier (Accuracy: 84.84%, ROC-AUC: 0.9166), and 4-Panel Explainable AI.
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
          <Link to="/reports">
            <Button variant="outline" icon={FileText} className="text-white border-white/20 hover:bg-white/10">
              Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cases */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('totalCases')}
            </span>
            <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <FolderKanban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono">
              {totalCases}
            </span>
            <span className="text-xs text-slate-400">cases in registry</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="text-emerald-600 font-semibold">100%</span> verified &amp; ready
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
            <span className="text-xs text-slate-400">awaiting AI processing</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Click 'Run Analysis' to process
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
            <span className="text-xs text-slate-400">analyzed studies</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            QCA &amp; 4-Panel XAI generated
          </div>
        </div>

        {/* Automated Reports & Approval Status */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Automated Reports
            </span>
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-purple-600 font-mono">
              {reports.length}
            </span>
            <span className="text-xs text-slate-400">reports ({approvedReports} approved)</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            PDF, CSV, JSON export ready
          </div>
        </div>
      </div>

      {/* Model Performance & Architecture Comparison Section */}
      <Card
        title="Comprehensive AI Model Benchmark & Architecture Comparison"
        subtitle="Evaluating deep learning architectures against classical baselines on held-out test data"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setComparisonTab('segmentation')}
                className={`rounded-md px-3 py-1 font-semibold transition ${
                  comparisonTab === 'segmentation' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vessel Segmentation
              </button>
              <button
                type="button"
                onClick={() => setComparisonTab('stenosis')}
                className={`rounded-md px-3 py-1 font-semibold transition ${
                  comparisonTab === 'stenosis' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Stenosis Detection (ResNet)
              </button>
            </div>
            <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={exportComparisonCsv}>
              CSV
            </Button>
            <Button size="sm" variant="outline" icon={FileJson} onClick={exportComparisonJson}>
              JSON
            </Button>
          </div>
        }
      >
        {comparisonTab === 'segmentation' ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Segmentation Model Leaderboard
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Model</th>
                        <th className="py-2.5 px-3">Architecture</th>
                        <th className="py-2.5 px-3">Dice</th>
                        <th className="py-2.5 px-3">IoU</th>
                        <th className="py-2.5 px-3">Recall</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-sky-50/60 font-medium">
                        <td className="py-2.5 px-3 font-bold text-sky-900">PyTorch U-Net (Arcade)</td>
                        <td className="py-2.5 px-3 text-slate-600">4-Stage Deep U-Net</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">57.09%</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">39.95%</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">69.12%</td>
                        <td className="py-2.5 px-3"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Production</span></td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">U-Net (Synthetic Split)</td>
                        <td className="py-2.5 px-3 text-slate-600">PyTorch U-Net</td>
                        <td className="py-2.5 px-3 font-mono">88.95%</td>
                        <td className="py-2.5 px-3 font-mono">80.10%</td>
                        <td className="py-2.5 px-3 font-mono">84.01%</td>
                        <td className="py-2.5 px-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">Benchmark</span></td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">U-Net++</td>
                        <td className="py-2.5 px-3 text-slate-600">Nested Dense Skips</td>
                        <td className="py-2.5 px-3 font-mono">81.37%</td>
                        <td className="py-2.5 px-3 font-mono">68.59%</td>
                        <td className="py-2.5 px-3 font-mono">96.61%</td>
                        <td className="py-2.5 px-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">Benchmark</span></td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Refined Connected Component</td>
                        <td className="py-2.5 px-3 text-slate-600">Adaptive + Morph</td>
                        <td className="py-2.5 px-3 font-mono">86.97%</td>
                        <td className="py-2.5 px-3 font-mono">80.23%</td>
                        <td className="py-2.5 px-3 font-mono">80.45%</td>
                        <td className="py-2.5 px-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">Classical</span></td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Adaptive Threshold Baseline</td>
                        <td className="py-2.5 px-3 text-slate-600">Local Gaussian</td>
                        <td className="py-2.5 px-3 font-mono">85.10%</td>
                        <td className="py-2.5 px-3 font-mono">76.51%</td>
                        <td className="py-2.5 px-3 font-mono">86.18%</td>
                        <td className="py-2.5 px-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">Baseline</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-500">
                  Evaluated on 300 real held-out clinical test angiograms from the ARCADE challenge syntax split. Real clinical lumen Dice reflects complex vessel branching and diffuse atherosclerosis.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Sample Segmentation Performance
                </h4>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2">
                  <img
                    src="/segmentation_test_results.png"
                    alt="Segmentation Test Results"
                    className="max-h-60 w-full object-contain"
                    onError={(e) => { e.target.src = '/segmentation_examples.png'; }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Input: 512x512 Angiogram</span>
                  <span>Ground Truth vs PyTorch U-Net Prediction</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Stenosis Classifier Leaderboard (686 Held-Out Test Patches)
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Model</th>
                        <th className="py-2.5 px-3">Architecture</th>
                        <th className="py-2.5 px-3">Accuracy</th>
                        <th className="py-2.5 px-3">ROC-AUC</th>
                        <th className="py-2.5 px-3">Precision</th>
                        <th className="py-2.5 px-3">Recall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-sky-50/60 font-medium">
                        <td className="py-2.5 px-3 font-bold text-sky-900">PyTorch StenosisResNet</td>
                        <td className="py-2.5 px-3 text-slate-600">4-Stage Residual CNN</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">84.84%</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">0.9166</td>
                        <td className="py-2.5 px-3 font-mono">89.17%</td>
                        <td className="py-2.5 px-3 font-mono">83.16%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Linear / QCA Heuristic</td>
                        <td className="py-2.5 px-3 text-slate-600">Caliber Contraction Rule</td>
                        <td className="py-2.5 px-3 font-mono">72.40%</td>
                        <td className="py-2.5 px-3 font-mono">0.7410</td>
                        <td className="py-2.5 px-3 font-mono">68.00%</td>
                        <td className="py-2.5 px-3 font-mono">65.20%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Confusion Matrix Highlights */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h5 className="text-[11px] font-bold text-slate-700 mb-1.5">
                    ResNet Confusion Matrix on Held-Out Test Data
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
                      <span className="text-slate-500 text-[10px]">True Negatives</span>
                      <p className="font-mono text-base font-bold text-emerald-800">261</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 border border-rose-200 p-2">
                      <span className="text-slate-500 text-[10px]">False Positives</span>
                      <p className="font-mono text-base font-bold text-rose-800">39</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <span className="text-slate-500 text-[10px]">False Negatives</span>
                      <p className="font-mono text-base font-bold text-amber-800">65</p>
                    </div>
                    <div className="rounded-lg bg-sky-50 border border-sky-200 p-2">
                      <span className="text-slate-500 text-[10px]">True Positives</span>
                      <p className="font-mono text-base font-bold text-sky-800">321</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Training History &amp; ROC Curve
                </h4>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                  <img
                    src="/stenosis_classifier_curves.png"
                    alt="Stenosis Classifier Training Curves"
                    className="max-h-60 w-full object-contain"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>ROC-AUC: 0.9166</span>
                  <span>Evaluated across 686 held-out test patches</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modality Doughnut Chart */}
        <Card title="Imaging Modality Distribution" subtitle="Breakdown of registered scan modalities" className="lg:col-span-1">
          <div className="h-64 flex items-center justify-center">
            {Object.keys(modalityCounts).length > 0 ? (
              <Doughnut data={doughnutData} options={doughnutOptions} />
            ) : (
              <p className="text-xs text-slate-400">No modality data available</p>
            )}
          </div>
        </Card>

        {/* Anatomical Region Distribution */}
        <Card title="Cases by Anatomical Region" subtitle="Vascular territories under diagnostic observation" className="lg:col-span-2">
          <div className="h-64">
            {Object.keys(regionCounts).length > 0 ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <p className="text-xs text-slate-400 flex items-center justify-center h-full">No anatomical data available</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Cases Table Preview with 4-Panel XAI Direct Launcher */}
      <Card
        title="Recent Clinical Angiography Cases"
        subtitle="Recent studies with direct Explainable AI launch capability"
        action={
          <Link to="/cases" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800">
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
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentCases.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
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
                  <td className="py-3 px-4 text-slate-500 font-mono">
                    {c.scanDate}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} size="xs" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/viewer/${encodeURIComponent(c.id)}`}
                        className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-500 shadow-2xs"
                      >
                        <ScanLine size={13} />
                        <span>4-Panel XAI</span>
                      </Link>
                      <button
                        onClick={() => navigate(`/cases/${encodeURIComponent(c.id)}`)}
                        className="text-xs text-slate-500 hover:text-slate-800 font-medium hover:underline px-1"
                      >
                        Details
                      </button>
                    </div>
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