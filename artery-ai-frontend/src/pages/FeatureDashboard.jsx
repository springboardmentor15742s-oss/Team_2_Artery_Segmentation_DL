import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, Flag, Globe2, Plus, TrendingUp } from 'lucide-react';
import { getFeatureSummary } from '../services/api';

function Metric({ label, value, icon: Icon, tone }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`rounded-lg p-2 ${tone}`}><Icon size={17}/></span></div>
    <p className="mt-3 text-2xl font-bold text-slate-900">{value ?? '—'}</p>
  </div>;
}

export default function FeatureDashboard() {
  const { environmentId, environments } = useOutletContext();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setSummary(await getFeatureSummary(environmentId)); setError(''); }
    catch (requestError) { setError(requestError.message || 'Could not load feature dashboard.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [environmentId]);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-900">Feature rollout overview</h2><p className="mt-1 text-sm text-slate-500">Manage safe, environment-scoped feature releases.</p></div>
      <Link to="/feature-management/flags?create=1" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Plus size={16}/>Create feature flag</Link>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total feature flags" value={loading ? '…' : summary?.totalFlags} icon={Flag} tone="bg-blue-50 text-blue-700"/>
      <Metric label="Enabled in environment" value={loading ? '…' : summary?.enabledFlags} icon={TrendingUp} tone="bg-emerald-50 text-emerald-700"/>
      <Metric label="Disabled in environment" value={loading ? '…' : summary?.disabledFlags} icon={Flag} tone="bg-rose-50 text-rose-700"/>
      <Metric label="Environments" value={loading ? '…' : summary?.environmentCount ?? environments.length} icon={Globe2} tone="bg-violet-50 text-violet-700"/>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">Evaluation activity</h3><p className="mt-1 text-xs text-slate-500">Recorded evaluations across all flags during the last 30 days.</p></div><Link to="/feature-management/analytics" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">Open analytics <ArrowRight size={15}/></Link></div>
      <p className="mt-5 text-3xl font-bold text-slate-900">{loading ? '…' : (summary?.evaluations30d || 0).toLocaleString()}</p>
      <p className="text-xs text-slate-500">evaluations · {environments.find(item => item.id === environmentId)?.name || environmentId} selected</p>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-bold text-slate-900">Recent flag activity</h3><p className="mt-1 text-xs text-slate-500">Events are read from the application audit log.</p></div>
      {summary?.recentEvents?.length ? <ul className="divide-y divide-slate-100">{summary.recentEvents.map(event => <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-semibold capitalize text-slate-800">{event.action.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{event.entityId} · {event.actor}</p></div><time className="text-xs text-slate-500">{new Date(event.timestamp).toLocaleString()}</time></li>)}</ul> : <p className="px-5 py-8 text-sm text-slate-500">{loading ? 'Loading activity…' : 'No flag activity recorded yet.'}</p>}
    </section>
  </div>;
}
