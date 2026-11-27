import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart3, RefreshCw } from 'lucide-react';
import { getFeatureAnalytics } from '../services/api';

export default function FeatureAnalytics() {
  const { environmentId } = useOutletContext();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setData(await getFeatureAnalytics(environmentId)); setError(''); }
    catch (requestError) { setError(requestError.message || 'Could not load evaluation analytics.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [environmentId]);

  const max = Math.max(1, ...(data?.daily || []).map(day => day.evaluations));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Rollout analytics</h2><p className="mt-1 text-sm text-slate-500">Evaluation events recorded by the local feature evaluation API.</p></div><button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw size={15}/>Refresh</button></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Total evaluations · {environmentId}</p><p className="mt-2 text-2xl font-bold text-slate-900">{loading ? '…' : (data?.totalEvaluations || 0).toLocaleString()}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">Evaluated enabled</p><p className="mt-2 text-2xl font-bold text-emerald-700">{loading ? '…' : (data?.enabledEvaluations || 0).toLocaleString()}</p></div></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><BarChart3 size={17} className="text-blue-700"/><div><h3 className="font-bold text-slate-900">Evaluation count by day</h3><p className="text-xs text-slate-500">Last 30 days, based on persisted evaluations</p></div></div>
      {loading ? <p className="mt-5 text-sm text-slate-500">Loading analytics…</p> : data?.daily?.length ? <div className="mt-5 flex h-48 items-end gap-1 overflow-x-auto border-b border-l border-slate-200 px-2">
        {data.daily.map(day => <div key={day.date} title={`${day.date}: ${day.evaluations} evaluations`} className="group flex h-full min-w-5 flex-1 items-end"><div className="w-full rounded-t bg-blue-600 hover:bg-blue-800" style={{ height: `${Math.max(3, day.evaluations / max * 100)}%` }}/></div>)}
      </div> : <p className="mt-5 rounded-lg bg-slate-50 p-8 text-center text-sm text-slate-500">No evaluation events recorded yet. Open a flag and submit an evaluation to populate this report.</p>}
      {!!data?.daily?.length && <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{data.daily[0].date}</span><span>{data.daily[data.daily.length - 1].date}</span></div>}
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h3 className="font-bold text-slate-900">Evaluations by flag</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[450px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Flag</th><th className="px-4 py-3">Evaluations</th><th className="px-4 py-3">Enabled results</th><th className="px-4 py-3">Enabled rate</th></tr></thead><tbody className="divide-y divide-slate-100">{data?.flags?.length ? data.flags.map(flag => <tr key={flag.flagKey}><td className="px-4 py-3"><span className="font-semibold text-slate-900">{flag.name}</span><span className="mt-0.5 block font-mono text-[10px] text-slate-500">{flag.flagKey}</span></td><td className="px-4 py-3">{flag.evaluations}</td><td className="px-4 py-3">{flag.enabledEvaluations}</td><td className="px-4 py-3">{flag.evaluations ? `${(flag.enabledEvaluations / flag.evaluations * 100).toFixed(1)}%` : '—'}</td></tr>) : <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No flag evaluations recorded.</td></tr>}</tbody></table></div></section>
  </div>;
}
