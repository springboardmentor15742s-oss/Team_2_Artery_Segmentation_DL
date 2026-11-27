import React, { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Search } from 'lucide-react';
import { getActivityLogs } from '../services/api';

export default function ActivityLogs() {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await getActivityLogs(200));
    } catch (requestError) {
      setError(requestError.message || 'Could not load activity history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter(entry => !term || `${entry.actor} ${entry.action} ${entry.entityType} ${entry.entityId}`.toLowerCase().includes(term));
  }, [entries, query]);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Database audit trail</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Activity Logs</h1>
        <p className="mt-1 text-sm text-slate-500">Recent case, upload, analysis, and report actions recorded by the application.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh
      </button>
    </header>

    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="flex items-center gap-2"><History size={17} className="text-sky-700"/><h2 className="font-bold text-slate-900">Recent events</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{filtered.length}</span></div>
        <label className="relative block w-full sm:max-w-xs"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter events…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"/></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Record</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Loading audit events…</td></tr>
              : filtered.length ? filtered.map(entry => <tr key={entry.id}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Time unavailable'}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{entry.actor}</td>
                <td className="px-4 py-3 text-slate-700">{entry.action.replaceAll('_', ' ')}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{[entry.entityType, entry.entityId].filter(Boolean).join(' · ') || '—'}</td>
              </tr>) : <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">{error ? 'Audit events could not be loaded.' : 'No matching audit events were recorded.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
