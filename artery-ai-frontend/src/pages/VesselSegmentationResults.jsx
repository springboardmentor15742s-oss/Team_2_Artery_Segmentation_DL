import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { getSegmentationGallery } from '../services/api';

const PAGE_SIZE = 6;
const views = [
  { key: 'original_b64', title: 'Original angiogram' },
  { key: 'ground_truth_b64', title: 'Ground-truth mask' },
  { key: 'prediction_b64', title: 'U-Net prediction' },
  { key: 'overlay_b64', title: 'Overlay · TP green · FP red · FN blue' },
];

function ResultImage({ title, source, caseId }) {
  return <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <figcaption className="min-h-9 border-b border-slate-100 px-2 py-2 text-[10px] font-semibold leading-4 text-slate-700">{title}</figcaption>
    {source ? <img src={source} alt={`${title} for ${caseId}`} className="h-48 w-full bg-slate-950 object-contain sm:h-52" loading="lazy"/> : <div className="grid h-48 place-items-center text-xs text-slate-400">Image unavailable</div>}
  </figure>;
}

export default function VesselSegmentationResults() {
  const [gallery, setGallery] = useState(null);
  const [split, setSplit] = useState('all');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setGallery(await getSegmentationGallery({ split, offset, limit: PAGE_SIZE })); }
    catch (requestError) { setError(requestError.message || 'Could not load vessel segmentation results.'); }
    finally { setLoading(false); }
  }, [split, offset]);

  useEffect(() => { refresh(); }, [refresh]);
  const samples = gallery?.samples || [];
  const total = gallery?.total || 0;
  const first = total ? offset + 1 : 0;
  const last = Math.min(offset + samples.length, total);

  return <main className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-700">Full dataset · {gallery?.dataset_cases ?? '—'} manifest cases</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Vessel segmentation results</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Browse each dataset angiogram with its reference mask, U-Net prediction, and pixel-level comparison overlay. Cases are labeled by their train, validation, or held-out test split.</p></div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh results</button>
    </header>

    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[10px] shadow-sm">
      <label htmlFor="segmentation-split" className="font-semibold text-slate-700">Dataset split</label>
      <select id="segmentation-split" value={split} onChange={event => { setOffset(0); setSplit(event.target.value); }} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800">
        <option value="all">All dataset cases</option><option value="train">Training</option><option value="val">Validation</option><option value="test">Held-out test</option>
      </select>
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1"><ImageIcon size={12}/>{gallery?.model || 'U-Net segmentation'}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1">Showing {first}–{last} of {total} eligible cases</span>
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">TP · green</span><span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800">FP · red</span><span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">FN · blue</span>
      <span className="text-slate-500">Dice and IoU are calculated against each reference mask.</span>
    </section>

    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-slate-500">Each page runs the trained segmentation model on its dataset cases.</p>
      <nav aria-label="Segmentation dataset pages" className="flex items-center gap-2">
        <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><ChevronLeft size={14}/>Previous</button>
        <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={loading || offset + samples.length >= total} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Next<ChevronRight size={14}/></button>
      </nav>
    </div>

    {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle size={16}/>{error}</div>}
    {loading && <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Generating segmentation results for this dataset page…</p>}
    {!loading && !error && samples.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="font-semibold text-slate-800">No segmentation cases are available</h2><p className="mt-2 text-sm text-slate-500">{gallery?.message || 'Check that the dataset manifest, angiograms, and reference masks are available to the API.'}</p></div>}

    <div className="space-y-5">{samples.map((sample, index) => <section key={sample.caseId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-slate-900">Dataset case {offset + index + 1} · {sample.caseId}</h2><p className="mt-1 text-[10px] text-slate-500">{sample.fileName} · {sample.model}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold capitalize text-slate-700">{sample.split} split</span><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-800">Dice {Number(sample.metrics?.dice).toFixed(3)}</span><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-800">IoU {Number(sample.metrics?.iou).toFixed(3)}</span></div></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{views.map(view => <ResultImage key={view.key} title={view.title} source={sample[view.key]} caseId={sample.caseId}/>)}</div>
      {sample.limitations && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[10px] leading-relaxed text-amber-900">{sample.limitations}</p>}
    </section>)}</div>

    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><ChevronLeft size={14}/>Previous</button>
      <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={loading || offset + samples.length >= total} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Next<ChevronRight size={14}/></button>
    </div>
    <figure className="border-t border-slate-200 pt-3 text-center"><figcaption className="font-serif text-sm italic text-slate-700">Vessel segmentation results across the selected dataset split — angiogram, reference mask, model prediction, and pixel-level overlay (TP = green, FP = red, FN = blue).</figcaption></figure>
  </main>;
}
