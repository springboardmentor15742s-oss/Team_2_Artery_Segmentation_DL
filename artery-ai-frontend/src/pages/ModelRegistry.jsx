import React, { useEffect, useState } from 'react';
import { Activity, Database, RefreshCw } from 'lucide-react';
import { getModelRegistry } from '../services/api';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ModelRegistry() {
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setRegistry(await getModelRegistry());
    } catch (requestError) {
      setError(requestError.message || 'Could not load the local model registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Runtime artifact inventory</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Model Registry</h1>
        <p className="mt-1 text-sm text-slate-500">Availability and load state are read from this workstation's model files.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh
      </button>
    </header>

    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {registry && <>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Active segmentation</p><p className="mt-2 text-lg font-bold text-slate-900">{registry.activeSegmentationModel || 'Unavailable'}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Segmentation runtime</p><p className="mt-2 text-lg font-bold text-slate-900">{registry.deepSegmentationLoaded ? 'Loaded' : 'Fallback / not loaded'}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Artifacts present</p><p className="mt-2 text-lg font-bold text-slate-900">{registry.models.filter(item => item.available).length} / {registry.models.length}</p></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Database size={17} className="text-sky-700"/><h2 className="font-bold text-slate-900">Installed model artifacts</h2></div>
        {loading ? <p className="p-6 text-sm text-slate-500">Refreshing artifact inventory…</p> : registry.models.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Family</th><th className="px-4 py-3">Artifact</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Runtime</th><th className="px-4 py-3">Size</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{registry.models.map(model => <tr key={model.id}>
              <td className="px-4 py-3 font-semibold text-slate-900">{model.name}</td>
              <td className="px-4 py-3 text-slate-600">{model.family}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{model.artifact}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${model.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{model.available ? 'Present' : 'Missing'}</span></td>
              <td className="px-4 py-3 text-slate-600">{model.loaded ? 'Loaded' : 'Not loaded'}</td>
              <td className="px-4 py-3 text-slate-600">{formatBytes(model.sizeBytes)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="p-6 text-sm text-slate-500">No model artifacts are registered.</p>}
      </section>

      {registry.validation && <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-slate-900">Available validation record</h2>
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(registry.validation, null, 2)}</pre>
      </section>}
      <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><Activity size={15} className="shrink-0"/> {registry.note}</p>
    </>}
  </div>;
}
