import React, { useEffect, useState } from 'react';
import { Activity, Play, RefreshCw, Database } from 'lucide-react';
import { getDatasetSummary, getModelReports, getModelStatus, trainCadicaDenoiser, trainCadicaDetector, trainSegmentationModels } from '../services/api';

function Metric({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-lg font-bold text-slate-900">{value ?? '—'}</div></div>;
}

export default function Training() {
  const [reports, setReports] = useState({});
  const [dataset, setDataset] = useState(null);
  const [model, setModel] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const refresh = async () => {
    const [r, d, m] = await Promise.all([getModelReports(), getDatasetSummary(), getModelStatus()]);
    setReports(r || {}); setDataset(d); setModel(m);
  };
  useEffect(() => { refresh().catch(e => setMessage(e.message)); }, []);
  const start = async (action) => {
    setBusy(action); setMessage('');
    try { const result = action === 'cadica_detector' ? await trainCadicaDetector() : action === 'segmentation' ? await trainSegmentationModels() : await trainCadicaDenoiser(); setMessage(result.message); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(''); }
  };
  const train = reports.training;
  const test = reports.testing;
  const deepSegmentation = reports.segmentation_deep_learning;
  const cadicaDenoising = reports.cadica_denoising;
  const cadicaDetector = reports.cadica_detector;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-sky-700">Infosys Healthcare & Life Sciences</div><h1 className="mt-1 text-2xl font-bold text-slate-900">Model Training & Testing</h1><p className="mt-1 text-sm text-slate-500">Manage the coronary analysis pipeline and review saved evaluation results.</p></div><button onClick={() => refresh().catch(e => setMessage(e.message))} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw size={16}/> Refresh reports</button></div>
    {message && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{message}</div>}
    <div className="grid gap-4 md:grid-cols-3"><Metric label="Dataset cases" value={dataset?.total_cases ?? dataset?.totalCases ?? dataset?.total_records ?? '675 records in manifest'}/><Metric label="Model service" value={model?.status || model?.model_status || 'Connected'}/><Metric label="Training report" value={train ? 'Available' : 'Not generated yet'}/></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="rounded-lg bg-sky-50 p-2 text-sky-700"><Activity size={19}/></span><div><h2 className="font-bold text-slate-900">Train CADICA lesion localizer</h2><p className="text-sm text-slate-500">Learns single-class lesion boxes from real CADICA annotations with patient-held-out evaluation.</p></div></div><button disabled={!!busy} onClick={() => start('cadica_detector')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Play size={16}/>{busy === 'cadica_detector' ? 'Starting training…' : 'Train and evaluate localizer'}</button><p className="mt-3 text-[11px] text-slate-500">Research only. Does not infer severity or calibrated narrowing. Requires CADICA under <code>dataset/CADICA</code>.</p></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="rounded-lg bg-violet-50 p-2 text-violet-700"><Activity size={19}/></span><div><h2 className="font-bold text-slate-900">Train U-Net models</h2><p className="text-sm text-slate-500">Compare U-Net and U-Net++ using the annotated train, validation, and test splits.</p></div></div><button disabled={!!busy} onClick={() => start('segmentation')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Play size={16}/>{busy === 'segmentation' ? 'Starting training…' : 'Train segmentation models'}</button><p className="mt-3 text-[11px] text-slate-500">If PyTorch is not installed, run: <code>python -m pip install -r training/requirements_segmentation.txt</code></p></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="rounded-lg bg-amber-50 p-2 text-amber-700"><Activity size={19}/></span><div><h2 className="font-bold text-slate-900">Train CADICA denoiser</h2><p className="text-sm text-slate-500">Trains a research-only preview model with synthetic noise and patient-held-out testing.</p></div></div><button disabled={!!busy} onClick={() => start('denoising')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Play size={16}/>{busy === 'denoising' ? 'Starting training…' : 'Train and test denoiser'}</button><p className="mt-3 text-[11px] text-slate-500">Requires extracted data under <code>dataset/CADICA</code>. It does not train segmentation or clinical analysis.</p></section>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Latest evaluation results</h2><p className="mt-1 text-sm text-slate-500">The CADICA localizer report uses real box labels and held-out patients. Legacy manifest reports are demo-only and are not used for scan analysis.</p><div className="mt-4 grid gap-5 lg:grid-cols-2"><div><h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><Database size={16}/> CADICA lesion localizer report</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{cadicaDetector ? JSON.stringify(cadicaDetector, null, 2) : 'No CADICA lesion-localizer training report yet.'}</pre></div><div><h3 className="mb-2 text-sm font-bold text-slate-700">Legacy demo training report (not used by AI analysis)</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{train ? JSON.stringify(train, null, 2) : 'No legacy training report found.'}</pre></div><div><h3 className="mb-2 text-sm font-bold text-slate-700">Legacy demo test report (not clinical validation)</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{test ? JSON.stringify(test, null, 2) : 'No legacy testing report found.'}</pre></div><div><h3 className="mb-2 text-sm font-bold text-slate-700">U-Net / U-Net++ report</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{deepSegmentation ? JSON.stringify(deepSegmentation, null, 2) : 'No deep segmentation training report yet.'}</pre></div><div><h3 className="mb-2 text-sm font-bold text-slate-700">CADICA denoising report</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{cadicaDenoising ? JSON.stringify(cadicaDenoising, null, 2) : 'No CADICA denoising run has passed yet.'}</pre></div></div></section>
  </div>;
}
