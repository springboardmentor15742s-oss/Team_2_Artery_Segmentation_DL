import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Image,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { caseScanUrl, datasetImageUrl, getCases, getModelStatus } from '../services/api';

const views = {
  '/stenosis-visualization': {
    title: 'Stenosis visualization',
    description: 'Open a case to review its saved vessel overlay and stenosis candidate map.',
    icon: ScanLine,
  },
  '/explainable-ai': {
    title: 'Explainable analysis',
    description: 'Open a case to inspect model-generated explanation maps when available.',
    icon: Brain,
  },
};

function caseImageUrl(item) {
  if (item?.fileInfo?.storedFileName) return caseScanUrl(item.id);
  if (item?.fileInfo?.fileName) return datasetImageUrl(item.fileInfo.fileName);
  return '';
}

function statusStyle(status = '') {
  const value = status.toLowerCase();
  if (value.includes('complete')) return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
  if (value.includes('ready') || value.includes('pending')) return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
  return 'border-white/10 bg-white/5 text-slate-300';
}

export default function DoctorAIAnalysis() {
  const location = useLocation();
  const page = views[location.pathname] || {
    title: 'AI angiography analysis',
    description: 'Select a registered case to open its angiography, review analysis outputs, and complete clinician review.',
    icon: Activity,
  };
  const PageIcon = page.icon;
  const [cases, setCases] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');
  const [loading, setLoading] = useState(true);
  const [imageUnavailable, setImageUnavailable] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError('');
    setModelError('');
    const [caseResult, modelResult] = await Promise.allSettled([getCases(), getModelStatus()]);

    if (caseResult.status === 'fulfilled') {
      const records = caseResult.value?.cases || [];
      setCases(records);
      setSelectedId(current => records.some(item => item.id === current) ? current : records[0]?.id || '');
    } else {
      setError(caseResult.reason?.message || 'Could not load authorized clinical cases.');
    }

    if (modelResult.status === 'fulfilled') {
      setModelStatus(modelResult.value);
    } else {
      setModelStatus(null);
      setModelError(modelResult.reason?.message || 'Model status is unavailable.');
    }

    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectedCase = cases.find(item => item.id === selectedId) || cases[0] || null;
  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cases.filter(item => !normalizedQuery || `${item.id} ${item.patientId} ${item.status} ${item.modality}`.toLowerCase().includes(normalizedQuery));
  }, [cases, query]);
  const scansAvailable = cases.filter(item => caseImageUrl(item)).length;
  const completedCases = cases.filter(item => item.status?.toLowerCase().includes('complete')).length;
  const readyCases = cases.filter(item => /ready|pending|review/i.test(item.status || '')).length;
  const imageUrl = caseImageUrl(selectedCase);
  const modelConfigured = modelStatus?.deep_segmentation_loaded === true;

  useEffect(() => {
    setImageUnavailable(false);
  }, [selectedId]);

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-slate-800 bg-[#101721] text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="rounded-xl border border-sky-300/15 bg-sky-400/10 p-3 text-sky-300"><PageIcon size={22} /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Doctor portal · Coronary imaging</p>
              <h1 className="mt-1 text-xl font-bold sm:text-2xl">{page.title}</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{page.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/xrays" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">
              <Image size={14}/>Browse ARCade samples
            </Link>
            <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${modelConfigured ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}`}>
              {modelConfigured ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {modelError ? 'Model status unavailable' : modelConfigured ? 'U-Net model configured' : 'Model not configured'}
            </span>
            <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50" aria-label="Refresh cases and model status">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
            </button>
          </div>
        </div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Registered studies', cases.length, 'Cases available to this clinician'],
            ['Scans available', scansAvailable, 'Cases with a linked image file'],
            ['Ready for review', readyCases, 'Pending or ready study records'],
            ['Completed studies', completedCases, 'Cases marked completed'],
          ].map(([label, value, hint]) => (
            <div key={label} className="bg-[#151d28] px-5 py-4">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">{loading ? '—' : value}</p>
              <p className="mt-1 text-[10px] text-slate-500">{hint}</p>
            </div>
          ))}
        </div>
      </header>

      {modelError && <p role="alert" className="rounded-lg border border-amber-300/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">Could not verify model availability: {modelError}</p>}
      {!modelError && !modelConfigured && modelStatus && (
        <div role="status" className="flex gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <p><strong>Model not configured.</strong> A trained U-Net checkpoint is not loaded. Do not interpret fallback research processing as a trained model prediction. All outputs require clinician review.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <section className="grid overflow-hidden rounded-2xl border border-slate-800 bg-[#101721] text-white shadow-lg lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-[420px] flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Angiography workspace</p>
              <h2 className="mt-1 text-sm font-bold">{selectedCase ? selectedCase.id : 'Select a clinical case'}</h2>
            </div>
            {selectedCase && (
              <Link to={`/explainable-ai/${encodeURIComponent(selectedCase.id)}`} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500">
                Open explainability review <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
          <div className="relative grid flex-1 place-items-center bg-[radial-gradient(ellipse_at_center,#202b39_0%,#0b1017_75%)] p-4 sm:p-6">
            {selectedCase && imageUrl && !imageUnavailable ? (
              <>
                <img
                  src={imageUrl}
                  alt={`Original angiogram for case ${selectedCase.id}`}
                  onError={() => setImageUnavailable(true)}
                  className="max-h-[min(56vh,560px)] w-full object-contain"
                />
                <span className="absolute left-4 top-4 rounded-md border border-white/10 bg-black/70 px-2.5 py-1.5 font-mono text-[10px] text-slate-200">Patient ID: {selectedCase.patientId}</span>
                <span className="absolute bottom-4 left-4 rounded-md border border-white/10 bg-black/65 px-2.5 py-1.5 text-[10px] text-slate-300">Original scan preview · no AI overlay applied</span>
              </>
            ) : (
              <div className="max-w-sm px-6 text-center">
                <Image size={34} className="mx-auto text-slate-500" />
                <h3 className="mt-3 text-sm font-bold text-slate-200">{selectedCase ? 'Angiography image unavailable' : loading ? 'Loading clinical studies…' : 'No clinical cases available'}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{selectedCase ? 'This case has no accessible image file. Open the case after a scan is uploaded.' : 'Create or upload a registered case before starting analysis.'}</p>
                {!selectedCase && !loading && <Link to="/cases/new" className="mt-4 inline-flex rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500">Create a case</Link>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#151d28] px-4 py-2.5 text-[10px] text-slate-400 sm:px-5">
            <span>{selectedCase?.fileInfo?.fileName || 'No scan filename recorded'}</span>
            <span>Image measurements require verified calibration</span>
          </div>
        </div>

        <aside className="space-y-5 bg-[#151d28] p-4 sm:p-5">
          <section>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Patient and study</h2>
              {selectedCase && <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusStyle(selectedCase.status)}`}>{selectedCase.status}</span>}
            </div>
            {selectedCase ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/[.04] p-3"><dt className="text-slate-500">Patient ID</dt><dd className="mt-1 font-mono text-slate-200">{selectedCase.patientId}</dd></div>
                <div className="rounded-lg bg-white/[.04] p-3"><dt className="text-slate-500">Study date</dt><dd className="mt-1 text-slate-200">{selectedCase.scanDate || 'Not recorded'}</dd></div>
                <div className="rounded-lg bg-white/[.04] p-3"><dt className="text-slate-500">Modality</dt><dd className="mt-1 text-slate-200">{selectedCase.modality || 'Not recorded'}</dd></div>
                <div className="rounded-lg bg-white/[.04] p-3"><dt className="text-slate-500">Anatomical region</dt><dd className="mt-1 text-slate-200">{selectedCase.anatomicalRegion || 'Not recorded'}</dd></div>
              </dl>
            ) : <p className="mt-3 rounded-lg bg-white/[.04] p-3 text-xs text-slate-400">Study details will appear when a case is selected.</p>}
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">Analysis readiness</h2>
            <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-sky-300" />
                <div><p className="text-xs font-semibold text-slate-200">Access-controlled case list</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Studies are loaded from the authenticated clinical API.</p></div>
              </div>
              <div className="flex items-start gap-2.5">
                {modelConfigured ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />}
                <div><p className="text-xs font-semibold text-slate-200">{modelError ? 'Model status unavailable' : modelConfigured ? 'Trained segmentation model loaded' : 'Model not configured'}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{modelStatus?.segmentation_model || 'Model configuration has not been verified.'}</p></div>
              </div>
              <p className="border-t border-white/10 pt-3 text-[10px] leading-relaxed text-amber-200/80">Research decision support only. No diagnosis or treatment recommendation is produced by this screen.</p>
            </div>
          </section>

          <Link to="/upload" className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/5">
            <Image size={14} /> Upload or attach a scan
          </Link>
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-base font-bold text-slate-900">Clinical case queue</h2><p className="mt-1 text-xs text-slate-500">Choose an authorized case to review its original scan and saved analysis.</p></div>
          <label className="relative block w-full sm:w-72">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search case or patient ID" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" />
          </label>
        </div>
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading clinical studies…</p> : filteredCases.length ? (
          <div className="mt-4 divide-y divide-slate-100">
            {filteredCases.map(item => (
              <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3 ${selectedCase?.id === item.id ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                <button type="button" onClick={() => setSelectedId(item.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold text-slate-900">{item.id}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(item.status)}`}>{item.status}</span></span>
                  <span className="mt-1 block truncate text-xs text-slate-500">Patient {item.patientId} · {item.modality || 'Modality not recorded'} · {item.scanDate || 'Date not recorded'}</span>
                </button>
                <div className="flex items-center gap-2">
                  {caseImageUrl(item) ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><Image size={12} />Scan linked</span> : <span className="text-[10px] text-slate-400">No scan linked</span>}
                  <Link to={`/explainable-ai/${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-2 text-[10px] font-bold text-white hover:bg-slate-700">Review <ArrowUpRight size={12} /></Link>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="py-8 text-center text-sm text-slate-500">{error ? 'Case list could not be loaded.' : 'No matching clinical cases.'}</div>}
      </section>
    </div>
  );
}
