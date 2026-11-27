import React, { useState, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Layers,
  Award,
  Download,
  RefreshCw,
  Info,
  Scale,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Radar } from 'react-chartjs-2';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import { getSegmentationComparison, generateSegmentationComparison, getModelReports, getReports, getModelStatus } from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function ModelComparison() {
  const [data, setData] = useState(null);
  const [reports, setReports] = useState(null);
  const [caseReports, setCaseReports] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('dice');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [comparison, rep, clinical, runtime] = await Promise.all([
        getSegmentationComparison().catch(() => null),
        getModelReports().catch(() => null),
        getReports().catch(() => []),
        getModelStatus().catch(() => null),
      ]);
      setData(comparison);
      setReports(rep);
      setCaseReports(Array.isArray(clinical) ? clinical : []);
      setModelStatus(runtime);
    } catch (err) {
      console.error("Failed to load model comparison data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRunEvaluation = async () => {
    setGenerating(true);
    setMessage('');
    try {
      const res = await generateSegmentationComparison();
      setMessage(res.message || 'Evaluation started...');
      setTimeout(() => {
        fetchData();
        setGenerating(false);
        setMessage('Model benchmark evaluation successfully updated from held-out dataset.');
      }, 3000);
    } catch (err) {
      setMessage(err.message || 'Failed to trigger comparison');
      setGenerating(false);
    }
  };

  // Compile combined models from empirical metrics and deep learning reports
  const dlModels = data?.deep_learning_comparison?.models || reports?.segmentation_deep_learning?.models || [];
  const classicModels = data?.metrics || [];

  const allModels = [
    ...dlModels.map(m => ({
      name: m.name,
      family: 'Deep Learning',
      dice: m.test_metrics?.dice ?? m.best_validation_dice ?? 0,
      iou: m.test_metrics?.iou ?? 0,
      precision: m.test_metrics?.precision ?? 0,
      recall: m.test_metrics?.recall ?? 0,
      artifact: m.artifact,
      selected: (data?.deep_learning_comparison?.selected_model === m.name) || (m.name === 'U-Net')
    })),
    ...classicModels.map(m => ({
      name: m.name,
      family: 'Empirical Algorithm',
      dice: m.dice,
      iou: m.iou,
      precision: m.precision,
      recall: m.recall,
      artifact: 'Standard Pipeline',
      selected: data?.selected_model === m.name
    }))
  ];

  const testMetrics = reports?.testing?.metrics || {};
  const detectionMetrics = testMetrics.stenosis_detection || {};
  const segmentationMetrics = testMetrics.segmentation_benchmark || {};
  const classificationMetrics = testMetrics.severity_classification || {};
  const confusion = classificationMetrics.confusion_matrix || [];
  const activeSegmentation = reports?.segmentation_deep_learning?.selected_model || 'U-Net';
  const selectedDl = dlModels.find(model => model.name === activeSegmentation) || dlModels.find(model => model.name === 'U-Net') || dlModels[0];
  const testCases = reports?.testing?.test_cases_count ?? reports?.testing?.testCasesCount ?? data?.deep_learning_comparison?.test_cases ?? data?.cases_evaluated ?? null;
  const trainingSplit = data?.deep_learning_comparison?.train_cases;
  const validationSplit = data?.deep_learning_comparison?.validation_cases;
  const totalSplit = data?.deep_learning_comparison?.dataset_cases;

  const specificityPercent = detectionMetrics.specificity == null ? null : detectionMetrics.specificity;
  const clinicalLatencies = caseReports.map(report => Number(report.analysis?.inference_time_ms)).filter(value => Number.isFinite(value) && value >= 0);
  const meanClinicalLatency = clinicalLatencies.length ? clinicalLatencies.reduce((sum,value)=>sum+value,0)/clinicalLatencies.length : null;
  const clinicalModelVersions = [...new Set(caseReports.map(report=>report.analysis?.model_version).filter(Boolean))];
  const statusName = modelStatus?.segmentation_model || selectedDl?.name || null;
  const benchmarkTimestamp = reports?.testing?.timestamp;
  const sensitivityPerClass = classificationMetrics.class_report || {};

  const barChartData = {
    labels: allModels.map(m => m.name),
    datasets: [
      {
        label: 'Dice Score',
        data: allModels.map(m => m.dice),
        backgroundColor: '#0284c7',
        borderRadius: 6,
      },
      {
        label: 'IoU Score',
        data: allModels.map(m => m.iou),
        backgroundColor: '#0d9488',
        borderRadius: 6,
      },
      {
        label: 'Precision',
        data: allModels.map(m => m.precision),
        backgroundColor: '#eab308',
        borderRadius: 6,
      },
      {
        label: 'Recall (Sensitivity)',
        data: allModels.map(m => m.recall),
        backgroundColor: '#8b5cf6',
        borderRadius: 6,
      }
    ]
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(2)}%`
        }
      }
    },
    scales: {
      y: {
        min: 0,
        max: 1.0,
        ticks: { callback: (val) => `${Math.round(val * 100)}%` },
        grid: { color: '#f1f5f9' }
      },
      x: { grid: { display: false } }
    }
  };

  const radarData = {
    labels: ['Dice', 'IoU', 'Precision', 'Recall'],
    datasets: allModels.slice(0, 3).map((m, idx) => {
      const colors = [
        { stroke: '#0284c7', fill: 'rgba(2, 132, 199, 0.2)' },
        { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.2)' },
        { stroke: '#0d9488', fill: 'rgba(13, 148, 136, 0.2)' },
      ];
      const c = colors[idx % colors.length];
      return {
        label: m.name,
        data: [m.dice, m.iou, m.precision, m.recall],
        borderColor: c.stroke,
        backgroundColor: c.fill,
        pointBackgroundColor: c.stroke,
        pointBorderColor: '#fff',
      };
    })
  };

  const exportComparisonJson = () => {
    const payload = JSON.stringify({
      title: "Infosys Artery AI Model Comparison Benchmark",
      timestamp: new Date().toISOString(),
      evaluation_split: `Held-out test split (${testCases ?? 'not reported'} cases)`,
      model_versions: { active_segmentation_model: selectedDl?.name || null, reports_generated_at: benchmarkTimestamp || null },
      models: allModels,
      deep_learning_benchmark: data?.deep_learning_comparison || null,
      classic_algorithm_benchmark: data || null
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `model-comparison-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            Infosys Diagnostic Intelligence & Architecture Benchmarks
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Model Comparison & Evaluation
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Empirical comparative analysis across deep learning segmentation (U-Net vs. U-Net++) and morphological segmenters on identical held-out test splits.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={Download}
            onClick={exportComparisonJson}
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={RefreshCw}
            onClick={handleRunEvaluation}
            disabled={generating}
            className={generating ? 'animate-pulse' : ''}
          >
            {generating ? 'Benchmarking…' : 'Re-run Evaluation'}
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs font-medium text-sky-900">
          {message}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Active segmentation model', selectedDl?.name || 'Not reported', selectedDl?.test_metrics?.dice == null ? 'Test Dice unavailable' : `Test Dice ${(selectedDl.test_metrics.dice * 100).toFixed(1)}%`, Award],
          ['Held-out segmentation', segmentationMetrics.mean_dice_similarity_coefficient == null ? 'Not reported' : `${(segmentationMetrics.mean_dice_similarity_coefficient * 100).toFixed(1)}% Dice`, segmentationMetrics.mean_intersection_over_union == null ? 'IoU unavailable' : `${(segmentationMetrics.mean_intersection_over_union * 100).toFixed(1)}% IoU`, Layers],
          ['Stenosis specificity', specificityPercent == null ? 'Not reported' : `${(specificityPercent * 100).toFixed(1)}%`, detectionMetrics.precision == null ? 'Precision unavailable' : `${(detectionMetrics.precision * 100).toFixed(1)}% precision`, ShieldCheck],
          ['Fixed test cohort', testCases == null ? 'Not reported' : `${testCases} scans`, [trainingSplit, validationSplit, testCases].every(value => Number.isFinite(value)) ? `${trainingSplit} train · ${validationSplit} validation · ${testCases} test${totalSplit ? ` · ${totalSplit} total` : ''}` : 'Split details unavailable', Sparkles],
        ].map(([label, value, hint, Icon]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4"><span className="inline-flex rounded-lg bg-sky-50 p-2 text-sky-700"><Icon size={18}/></span><p className="mt-3 text-xs font-semibold uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></article>)}
      </div>


      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Bar Chart Comparison */}
        <Card
          title="Architectural Metric Breakdown"
          subtitle="Direct performance comparison across Dice, IoU, Precision & Sensitivity"
          icon={BarChart3}
          className="lg:col-span-2"
        >
          <div className="h-80 w-full pt-2">
            <Bar data={barChartData} options={barChartOptions} />
          </div>
        </Card>

        {/* Multi-Dimensional Radar Chart */}
        <Card
          title="Multi-Axis Attribute Radar"
          subtitle="Relative balance across the top 3 contenders"
          icon={TrendingUp}
          className="lg:col-span-1"
        >
          <div className="h-80 w-full flex items-center justify-center p-2">
            <Radar
              data={radarData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { r: { min: 0.5, max: 1.0, ticks: { display: false } } },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
              }}
            />
          </div>
        </Card>
      </div>

      {/* Quantitative Matrix Table */}
      <Card
        title="Comparative Performance Matrix"
        subtitle="Detailed metrics computed on held-out independent test splits"
        icon={Cpu}
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Model Architecture</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-center">Dice Similarity</th>
                <th className="py-3.5 px-4 text-center">IoU (Jaccard)</th>
                <th className="py-3.5 px-4 text-center">Precision</th>
                <th className="py-3.5 px-4 text-center">Recall (Sensitivity)</th>
                <th className="py-3.5 px-4 text-right">Production Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allModels.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                    {m.selected && <CheckCircle2 size={14} className="text-emerald-600" />}
                    <span>{m.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-600">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.family === 'Deep Learning' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                      {m.family}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono font-bold text-sky-800">
                    {(m.dice * 100).toFixed(2)}%
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono font-bold text-teal-800">
                    {(m.iou * 100).toFixed(2)}%
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                    {(m.precision * 100).toFixed(2)}%
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                    {(m.recall * 100).toFixed(2)}%
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {m.selected ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-[11px]">
                        Active Production
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full text-[11px]">
                        Benchmarked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Held-out performance monitoring" subtitle={`Fixed held-out dataset · ${testCases ?? 'case count unavailable'} cases · ${benchmarkTimestamp ? `evaluated ${new Date(benchmarkTimestamp).toLocaleString()}` : 'report date unavailable'}`} icon={Activity}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Segmentation Dice', segmentationMetrics.mean_dice_similarity_coefficient, 'overlap agreement'],
            ['Segmentation IoU', segmentationMetrics.mean_intersection_over_union, 'intersection over union'],
            ['Stenosis sensitivity', detectionMetrics.recall_sensitivity, 'held-out recall'],
            ['Stenosis specificity', specificityPercent, 'explicit held-out specificity; otherwise not reported'],
          ].map(([label,value,note]) => <div key={label} className="rounded-lg border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value == null ? 'Not available' : `${(value*100).toFixed(1)}%`}</p><p className="mt-1 text-[10px] text-slate-500">{note}</p></div>)}
          <div className="rounded-lg border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Per-analysis inference latency</p><p className="mt-1 text-lg font-bold text-slate-900">{meanClinicalLatency == null ? 'Not reported' : `${meanClinicalLatency.toFixed(1)} ms avg`}</p><p className="mt-1 text-[10px] text-slate-500">{clinicalLatencies.length} saved case analyses</p></div>
          <div className="rounded-lg border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Runtime model version</p><p className="mt-1 break-all text-sm font-bold text-slate-900">{statusName || 'Not reported'}</p><p className="mt-1 text-[10px] text-slate-500">Active model selected by backend</p></div>
          <div className="rounded-lg border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Versions in saved reports</p><p className="mt-1 break-all text-sm font-bold text-slate-900">{clinicalModelVersions.length ? clinicalModelVersions.join(', ') : 'No analyzed reports'}</p><p className="mt-1 text-[10px] text-slate-500">Observed across clinical analysis records</p></div>
        </div>
        {Object.keys(sensitivityPerClass).length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b bg-slate-50 text-[10px] uppercase text-slate-500"><th className="p-2">Reference class</th><th className="p-2">Sensitivity</th><th className="p-2">Specificity</th><th className="p-2">Support</th></tr></thead><tbody>{Object.entries(sensitivityPerClass).filter(([name])=>!['accuracy','macro avg','weighted avg'].includes(name)).map(([name,metrics])=><tr key={name} className="border-b border-slate-100"><td className="p-2 font-semibold">{name}</td><td className="p-2">{metrics.recall == null ? 'N/A' : `${(metrics.recall*100).toFixed(1)}%`}</td><td className="p-2 text-slate-500">Not reported per class</td><td className="p-2">{metrics.support ?? 'N/A'}</td></tr>)}</tbody></table><p className="mt-2 text-[10px] text-slate-500">The supplied benchmark includes severity-class recall, but not per-class specificity; no value is inferred here.</p></div>}
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">Metrics reflect the saved held-out report only. Sensitivity/specificity are benchmark statistics, not calibrated per-scan confidence. Inference time is displayed when the report provides it. Results are retrospective and do not establish clinical validation.</p>
      </Card>

      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 flex items-start gap-3 text-xs leading-relaxed text-amber-900">
        <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Benchmarking Methodology & Regulatory Notice:</span> All reported performance metrics are measured strictly on held-out test splits without patient leakage across train/validation splits. In clinical deployments, deep learning models provide decision-support candidate regions and calibrated vessel segmentation. Autonomous clinical diagnoses require licensed clinician review.
        </div>
      </div>
    </div>
  );
}
