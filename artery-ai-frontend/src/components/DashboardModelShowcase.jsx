import React, { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ScatterController, LineController, Tooltip, Legend, Title } from 'chart.js';
import { Line, Scatter } from 'react-chartjs-2';
import { Activity, RefreshCw } from 'lucide-react';
import { generateClassifierLearningCurves, getModelReports, getModelRocCurve, getModelStatus, getSegmentationGallery } from '../services/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ScatterController, LineController, Tooltip, Legend, Title);
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'Not reported' : `${(Number(value) * 100).toFixed(1)}%`;
const options = (title, xLabel, yLabel, percentScale = false) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, title: { display: true, text: title } },
  scales: { x: { title: { display: true, text: xLabel }, grid: { color: '#f1f5f9' } }, y: { title: { display: true, text: yLabel }, ...(percentScale ? { min: 0, max: 100 } : {}), grid: { color: '#f1f5f9' } } },
});

export default function DashboardModelShowcase() {
  const [reports, setReports] = useState(null);
  const [roc, setRoc] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => {
    setError('');
    const [r, c, m, g] = await Promise.allSettled([getModelReports(), getModelRocCurve(), getModelStatus(), getSegmentationGallery()]);
    if (r.status === 'fulfilled') setReports(r.value); else setError(r.reason?.message || 'Model report unavailable.');
    if (c.status === 'fulfilled') setRoc(c.value); else setError(v => v || c.reason?.message || 'ROC report unavailable.');
    if (m.status === 'fulfilled') setRuntime(m.value);
    if (g.status === 'fulfilled') { setGallery(g.value); setGalleryIndex(i => Math.min(i, Math.max(0, (g.value?.count || 1) - 1))); } else setError(v => v || g.reason?.message || 'Segmentation gallery unavailable.');
  };
  useEffect(() => { refresh(); }, []);

  const detection = reports?.testing?.metrics?.stenosis_detection || {};
  const curve = reports?.classifier_learning_curves || reports?.training?.validation_metrics?.stenosis_detection?.training_curve || null;
  const points = curve?.values || curve?.points || [];
  const sample = gallery?.samples?.[galleryIndex] || null;
  const matrix = roc?.confusion_matrix?.values || detection.confusion_matrix?.values || [];
  const rocSource = roc?.curve || detection.roc_curve || {};
  const rocPoints = (rocSource.false_positive_rate || []).map((x, i) => ({ x, y: rocSource.true_positive_rate?.[i] })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const trainCases = curve?.train_cases ?? reports?.training?.dataset_summary?.train_cases;
  const validationCases = curve?.validation_cases ?? reports?.training?.dataset_summary?.val_cases;
  const testCases = roc?.test_cases ?? reports?.testing?.test_cases_count;
  const lossData = useMemo(() => ({ labels: points.map(p => p.estimators), datasets: [
    { label: 'Train loss', data: points.map(p => p.train?.log_loss ?? p.mean_loss ?? null), borderColor: '#ef4444', backgroundColor: '#ef4444', tension: .25 },
    { label: 'Validation loss', data: points.map(p => p.validation?.log_loss ?? null), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: .25 },
  ] }), [points]);
  const accuracyData = useMemo(() => ({ labels: points.map(p => p.estimators), datasets: [
    { label: 'Train accuracy', data: points.map(p => p.train?.accuracy == null ? null : p.train.accuracy * 100), borderColor: '#0d9488', backgroundColor: '#0d9488', tension: .25 },
    { label: 'Validation accuracy', data: points.map(p => p.validation?.accuracy == null ? null : p.validation.accuracy * 100), borderColor: '#7c3aed', backgroundColor: '#7c3aed', tension: .25 },
    { label: 'Validation F1', data: points.map(p => p.validation?.f1 == null ? null : p.validation.f1 * 100), borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderDash: [5, 4], tension: .25 },
  ] }), [points]);
  const rocData = { datasets: [
    { label: `Held-out ROC · AUC ${percent(roc?.roc_auc ?? detection.roc_auc)}`, data: rocPoints, showLine: true, pointRadius: 2, borderColor: '#2563eb', backgroundColor: '#2563eb' },
    { label: 'Chance baseline', data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], showLine: true, pointRadius: 0, borderColor: '#94a3b8', borderDash: [5, 4] },
  ] };
  const runCurve = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const started = await generateClassifierLearningCurves(); setMessage(started.message || 'Tree-count evaluation started.');
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const updated = await getModelReports();
        if ((updated?.classifier_learning_curves?.points || updated?.training?.validation_metrics?.stenosis_detection?.training_curve?.values || []).length) { setReports(updated); setMessage('Measured training/validation curve loaded.'); return; }
      }
      setMessage('Curve evaluation started; refresh reports shortly for the saved result.');
    } catch (e) { setError(e.message || 'Curve evaluation failed.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-700">Fixed held-out benchmark</p><h2 className="mt-1 text-lg font-bold text-slate-900">Stenosis classifier leaderboard and training history</h2><p className="mt-1 text-xs text-slate-500">Classifier performance and U-Net segmentation are reported as distinct tasks.</p></div><div className="flex gap-2"><button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"><RefreshCw size={14}/>Refresh</button><button type="button" disabled={busy} onClick={runCurve} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Activity size={14}/>{busy ? 'Measuring…' : 'Measure curve'}</button></div></div>
      {message && <p role="status" className="mt-3 rounded bg-sky-50 p-2 text-xs text-sky-800">{message}</p>}{error && <p role="alert" className="mt-3 rounded bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[['Test cohort', testCases == null ? 'Not reported' : `${testCases} scans`], ['Accuracy', percent(detection.accuracy)], ['Sensitivity', percent(roc?.sensitivity ?? detection.recall_sensitivity)], ['Specificity', percent(roc?.specificity ?? detection.specificity)], ['ROC AUC', percent(roc?.roc_auc ?? detection.roc_auc)]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-base font-bold text-slate-900">{value}</p></div>)}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3"><figure className="rounded-lg border border-slate-200 p-3"><figcaption className="mb-2 text-xs font-bold">Stenosis classifier loss</figcaption><div className="h-56">{points.some(p => p.train?.log_loss != null || p.validation?.log_loss != null) ? <Line data={lossData} options={options('Train and validation log loss', curve?.x_axis_label || 'Training step', 'Log loss')}/> : <p className="grid h-full place-items-center text-center text-xs text-slate-500">No measured loss curve is saved. Run “Measure curve”.</p>}</div></figure><figure className="rounded-lg border border-slate-200 p-3"><figcaption className="mb-2 text-xs font-bold">Classification accuracy and F1</figcaption><div className="h-56">{points.some(p => p.train?.accuracy != null || p.validation?.accuracy != null) ? <Line data={accuracyData} options={options('Train/validation scores', curve?.x_axis_label || 'Training step', 'Score (%)', true)}/> : <p className="grid h-full place-items-center text-center text-xs text-slate-500">Training accuracy/F1 history is not included in this report.</p>}</div></figure><figure className="rounded-lg border border-slate-200 p-3"><figcaption className="mb-2 text-xs font-bold">Held-out stenosis ROC curve</figcaption><div className="h-56">{rocPoints.length > 1 ? <Scatter data={rocData} options={{ ...options('ROC on fixed held-out cohort', 'False positive rate', 'True positive rate', true), scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'False positive rate' } }, y: { min: 0, max: 1, title: { display: true, text: 'True positive rate' } } } }}/> : <p className="grid h-full place-items-center text-center text-xs text-slate-500">Held-out ROC coordinates are not available.</p>}</div></figure></div>
      {matrix.length === 2 && <section className="mt-4 max-w-lg rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold">Binary stenosis confusion matrix</h3><p className="mt-1 text-[10px] text-slate-500">Rows are truth; columns are predicted class.</p><div className="mt-2 grid grid-cols-2 gap-2">{[['True negatives', matrix[0]?.[0], 'bg-emerald-50'], ['False positives', matrix[0]?.[1], 'bg-rose-50'], ['False negatives', matrix[1]?.[0], 'bg-amber-50'], ['True positives', matrix[1]?.[1], 'bg-sky-50']].map(([label, count, color]) => <div key={label} className={`rounded p-3 ${color}`}><span className="text-[10px] font-semibold">{label}</span><b className="ml-2 text-lg">{count}</b></div>)}</div></section>}
      {(trainCases != null || validationCases != null) && <p className="mt-3 text-[10px] text-slate-500">Train {trainCases ?? 'N/A'} · validation {validationCases ?? 'N/A'} · held-out test {testCases ?? 'N/A'}. Test data is excluded from training curves.</p>}
      <p className="mt-3 rounded bg-amber-50 p-3 text-[10px] leading-4 text-amber-900">This is a Random Forest classifier. Its measured diagnostic uses cumulative tree counts, not neural-network epochs. Cohort metrics are retrospective and not per-scan confidence or clinical validation.</p>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-700">Fixed held-out segmentation split</p><h2 className="mt-1 text-lg font-bold">Original angiogram, reference mask and model prediction</h2></div>{gallery && <div className="flex items-center gap-2"><button type="button" disabled={!galleryIndex} onClick={() => setIndex(i => Math.max(0, i - 1))} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">Previous</button><span className="text-[10px]">{galleryIndex+1} / {gallery.count}</span><button type="button" disabled={galleryIndex+1>=gallery.count} onClick={() => setIndex(i => Math.min(gallery.count-1, i+1))} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">Next</button></div>}</div>{galleryError && <p role="alert" className="mt-3 rounded bg-rose-50 p-2 text-xs text-rose-800">{galleryError}</p>}{sample ? <><div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-slate-100 px-2.5 py-1">{sample.caseId}</span><span className="rounded-full bg-slate-100 px-2.5 py-1">{sample.model}</span><span className="rounded-full bg-sky-50 px-2.5 py-1">Dice {Number(sample.metrics.dice).toFixed(3)}</span><span className="rounded-full bg-sky-50 px-2.5 py-1">IoU {Number(sample.metrics.iou).toFixed(3)}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Original angiogram', sample.original_b64], ['Ground truth mask', sample.ground_truth_b64], ['U-Net prediction', sample.prediction_b64], ['TP green · FP red · FN blue', sample.overlay_b64]].map(([label, src]) => <figure key={label} className="overflow-hidden rounded-lg border border-slate-200"><figcaption className="border-b px-2 py-1.5 text-[10px] font-semibold">{label}</figcaption><img src={src} alt={`${label} ${sample.caseId}`} className="h-44 w-full bg-slate-950 object-contain"/></figure>)}</div><p className="mt-3 text-[10px] text-amber-900">{sample.limitations}</p></> : <p className="mt-4 rounded border border-dashed p-4 text-xs text-slate-500">{error || 'Loading held-out gallery…'}</p>}</section>
  </div>;
}
EOF
python - <<'PY'
from pathlib import Path
p=Path('artery-ai-frontend/src/pages/Dashboard.jsx')
s=p.read_text(encoding='utf-8')
needle="  const [reports, setReports] = useState(null);\n"
assert needle in s
s=s.replace(needle,needle+"  const [roc, setRoc] = useState(null);\n  const [runtime, setRuntime] = useState(null);\n",1)
s=s.replace("const [reports, gallery, roc, runtime] = await Promise.all", "const [reports, gallery, rocData, runtimeData] = await Promise.all",1)
s=s.replace("setReports(reports || null); setRoc(roc || null); setRuntime(runtime || null); setGallery(gallery || null);", "setReports(reports || null); setRoc(rocData || null); setRuntime(runtimeData || null); setGallery(gallery || null);",1)
p.write_text(s,encoding='utf-8')
PY