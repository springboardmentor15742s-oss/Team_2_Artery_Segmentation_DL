import React, { useCallback, useEffect, useState } from 'react';
import { Activity, BarChart3, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { generateClassifierLearningCurves, getModelReports, getModelRocCurve, runModelTest } from '../services/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip, Legend);

const percent = value => value == null || !Number.isFinite(Number(value)) ? 'Not reported' : `${(Number(value) * 100).toFixed(2)}%`;
const count = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString();

function ConfusionTile({ title, value, color }) {
  return <div className={`rounded-lg border p-3 text-center ${color}`}><p className="text-[10px] opacity-75">{title}</p><p className="text-xl font-bold tabular-nums">{count(value)}</p></div>;
}

function ChartPanel({ title, children }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><h3 className="mb-2 text-center text-xs font-bold text-slate-800">{title}</h3><div className="h-52">{children}</div></section>;
}

export default function StenosisLeaderboard() {
  const [reports, setReports] = useState(null);
  const [roc, setRoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    const [reportResult, rocResult] = await Promise.allSettled([getModelReports(), getModelRocCurve()]);
    if (reportResult.status === 'fulfilled') setReports(reportResult.value);
    else setError(reportResult.reason?.message || 'Could not load saved evaluation data.');
    setRoc(rocResult.status === 'fulfilled' ? rocResult.value : null);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const trainingReport = reports?.training || {};
  const testReport = reports?.testing || {};
  const detection = testReport.metrics?.stenosis_detection || {};
  const comparisons = Array.isArray(detection.model_comparison) ? detection.model_comparison : [];
  const fallbackModel = {
    name: 'Trained stenosis detector',
    architecture: 'Random Forest · QCA image features',
    accuracy: detection.accuracy,
    roc_auc: roc?.roc_auc ?? detection.roc_auc,
    precision: detection.precision,
    recall: detection.recall_sensitivity ?? detection.recall,
    confusion_matrix: roc?.confusion_matrix || detection.confusion_matrix,
  };
  const rows = comparisons.length ? comparisons : [fallbackModel];
  const primary = rows[0] || fallbackModel;
  const matrix = primary.confusion_matrix?.values || primary.confusion_matrix || [];
  const dataset = trainingReport.dataset_summary || {};
  const learning = reports?.classifier_learning_curves || {};
  const curvePoints = learning.points || learning.values || [];
  const xValues = curvePoints.map(point => point.estimators ?? point.epoch);
  const lossData = {
    labels: xValues,
    datasets: [
      { label: 'Train loss', data: curvePoints.map(point => point.train?.log_loss ?? point.train_log_loss ?? null), borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.2 },
      { label: 'Validation loss', data: curvePoints.map(point => point.validation?.log_loss ?? point.validation_log_loss ?? null), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.2 },
    ],
  };
  const scoreData = {
    labels: xValues,
    datasets: [
      { label: 'Train accuracy', data: curvePoints.map(point => point.train?.accuracy == null ? null : point.train.accuracy * 100), borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.2 },
      { label: 'Validation accuracy', data: curvePoints.map(point => point.validation?.accuracy == null ? null : point.validation.accuracy * 100), borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.2 },
      { label: 'Validation F1', data: curvePoints.map(point => point.validation?.f1 == null ? null : point.validation.f1 * 100), borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', borderDash: [4, 3], tension: 0.2 },
    ],
  };
  const chartOptions = (yTitle, percentAxis = false) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 9 } } } },
    scales: {
      x: { title: { display: true, text: learning.x_axis_label || 'Measured training step' }, ticks: { font: { size: 9 } } },
      y: { title: { display: true, text: yTitle }, ticks: percentAxis ? { callback: value => `${value}%`, font: { size: 9 } } : { font: { size: 9 } }, grid: { color: '#eef2f7' } },
    },
  });

  const runEvaluation = async () => {
    setBusy(true); setMessage('');
    try { const result = await runModelTest(); setMessage(result.message || 'Dataset evaluation started. Refresh after it completes.'); }
    catch (requestError) { setMessage(requestError.message || 'Could not start the dataset evaluation.'); }
    finally { setBusy(false); }
  };
  const measureHistory = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await generateClassifierLearningCurves();
      setMessage(result.message || 'Training and validation curve calculation started.');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        const updated = await getModelReports();
        if (updated?.classifier_learning_curves?.points?.length) { setReports(updated); setMessage('Dataset-derived training history loaded.'); break; }
      }
    } catch (requestError) { setMessage(requestError.message || 'Could not calculate the dataset training curves.'); }
    finally { setBusy(false); }
  };

  const totalCases = dataset.total_cases ?? (((Number(dataset.train_cases) || 0) + (Number(dataset.val_cases) || 0) + (Number(dataset.test_cases) || 0)) || null);
  const auc = roc?.roc_auc ?? detection.roc_auc;

  return <main className="mx-auto max-w-6xl space-y-4 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">Automated artery analysis · trained dataset evaluation</p><h1 className="mt-1 text-xl font-bold text-slate-900">Stenosis classifier leaderboard</h1>
        <p className="mt-1 text-xs text-slate-500">All metrics and curves below are loaded from the project’s dataset split and saved training/evaluation artifacts.</p></div>
      <div className="flex gap-2"><button onClick={refresh} disabled={loading || busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw size={13}/>Refresh</button><button onClick={runEvaluation} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Activity size={13}/>Re-run dataset evaluation</button></div>
    </header>

    {message && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">{message}</p>}
    {error && <p role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"><CircleAlert size={14}/>{error}</p>}

    <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Stenosis classifier leaderboard · {count(testReport.test_cases_count)} held-out test cases</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{count(totalCases)} total dataset cases</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[10px]"><thead className="border-y border-slate-100 bg-slate-50 uppercase text-slate-500"><tr>{['Model', 'Architecture', 'Accuracy', 'ROC-AUC', 'Precision', 'Recall'].map(label => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.name} className="border-b border-slate-100"><td className="px-2 py-3 font-bold text-sky-800">{row.name}</td><td className="px-2 py-3 text-slate-600">{row.architecture}</td><td className="px-2 py-3 font-bold text-emerald-700">{percent(row.accuracy)}</td><td className="px-2 py-3 font-bold text-emerald-700">{row.roc_auc == null ? 'Not reported' : Number(row.roc_auc).toFixed(4)}</td><td className="px-2 py-3">{percent(row.precision)}</td><td className="px-2 py-3">{percent(row.recall)}</td></tr>)}</tbody>
        </table></div>
        <div><h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600"><ShieldCheck size={13}/>Held-out confusion matrix · {primary.name}</h3>
          {Array.isArray(matrix) && matrix.length === 2 && matrix.every(row => Array.isArray(row) && row.length === 2) ? <div className="grid grid-cols-2 gap-2"><ConfusionTile title="True negatives" value={matrix[0][0]} color="border-emerald-200 bg-emerald-50 text-emerald-800"/><ConfusionTile title="False positives" value={matrix[0][1]} color="border-rose-200 bg-rose-50 text-rose-800"/><ConfusionTile title="False negatives" value={matrix[1][0]} color="border-amber-200 bg-amber-50 text-amber-800"/><ConfusionTile title="True positives" value={matrix[1][1]} color="border-sky-200 bg-sky-50 text-sky-800"/></div> : <p className="rounded border border-dashed p-3 text-xs text-slate-500">No held-out confusion matrix is saved. Run the dataset evaluation to generate it.</p>}
        </div>
        <p className="text-[9px] leading-relaxed text-slate-500">Confusion counts and summary metrics are measured on the held-out test split. The training split is never used for this table.</p>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Training history & ROC-AUC</h2><p className="mt-1 text-[9px] text-slate-500">Train: {count(dataset.train_cases)} · Validation: {count(dataset.val_cases)} · Test: {count(dataset.test_cases)}</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><ChartPanel title="Stenosis classifier loss">{curvePoints.length ? <Line data={lossData} options={chartOptions('Log loss')}/> : <p className="grid h-full place-items-center rounded border border-dashed p-3 text-center text-[10px] text-slate-500">No measured curve is saved for this trained model.</p>}</ChartPanel><ChartPanel title="Classification accuracy & F1">{curvePoints.length ? <Line data={scoreData} options={chartOptions('Score (%)', true)}/> : <p className="grid h-full place-items-center rounded border border-dashed p-3 text-center text-[10px] text-slate-500">Measure the train/validation history to show dataset-derived curves.</p>}</ChartPanel></div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] text-slate-500"><span>Held-out ROC-AUC: <b className="text-slate-800">{auc == null ? 'Not reported' : Number(auc).toFixed(4)}</b></span><span>Evaluated on {count(testReport.test_cases_count)} cases from the project test split</span></div>
        {!curvePoints.length && <button onClick={measureHistory} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><BarChart3 size={13}/>{busy ? 'Measuring dataset history…' : 'Measure training history from dataset'}</button>}
        {curvePoints.length > 0 && <p className="text-[9px] text-slate-500">{learning.model} · {learning.x_axis_label} · {learning.split_method}</p>}
      </section>
    </div>
    {loading && <p role="status" className="text-xs text-slate-500">Loading saved dataset reports…</p>}
    {testReport.split_method && <p className="text-[9px] text-slate-400">Split: {testReport.split_method}</p>}
    {learning.limitations && <p className="text-[9px] text-slate-400">{learning.limitations}</p>}
  </main>;
}
