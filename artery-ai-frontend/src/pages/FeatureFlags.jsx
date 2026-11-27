import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Plus, Search, Trash2 } from 'lucide-react';
import { createFeatureFlag, deleteFeatureFlag, getFeatureFlags, updateFeatureFlagConfig } from '../services/api';

const blankForm = { flagKey: '', name: '', description: '', owner: '' };

export default function FeatureFlags() {
  const { environmentId } = useOutletContext();
  const [searchParams] = useSearchParams();
  const [flags, setFlags] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blankForm);
  const [creating, setCreating] = useState(searchParams.get('create') === '1');
  const [busyKey, setBusyKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setLoading(true);
    try { setFlags(await getFeatureFlags(environmentId, search)); setError(''); }
    catch (requestError) { setError(requestError.message || 'Could not load feature flags.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(refresh, 200); return () => window.clearTimeout(timer); }, [environmentId, search]);

  const submit = async event => {
    event.preventDefault();
    setBusyKey('create'); setError(''); setMessage('');
    try {
      await createFeatureFlag(form);
      setForm(blankForm); setCreating(false); setMessage('Feature flag created disabled in every environment.');
      await refresh();
    } catch (requestError) { setError(requestError.message || 'Could not create the feature flag.'); }
    finally { setBusyKey(''); }
  };

  const toggle = async flag => {
    setBusyKey(flag.flagKey); setError(''); setMessage('');
    try {
      await updateFeatureFlagConfig(flag.flagKey, environmentId, {
        enabled: !flag.enabled,
        rolloutPercent: flag.rolloutPercent,
        defaultValue: flag.defaultValue,
        rules: flag.rules || [],
      });
      await refresh();
      setMessage(`${flag.name} ${flag.enabled ? 'disabled' : 'enabled'} in this environment.`);
    } catch (requestError) { setError(requestError.message || 'Could not update the feature flag.'); }
    finally { setBusyKey(''); }
  };

  const remove = async flag => {
    if (!window.confirm(`Delete "${flag.name}" and its configuration/evaluation history?`)) return;
    setBusyKey(flag.flagKey); setError(''); setMessage('');
    try { await deleteFeatureFlag(flag.flagKey); await refresh(); setMessage('Feature flag and its history deleted.'); }
    catch (requestError) { setError(requestError.message || 'Could not delete the feature flag.'); }
    finally { setBusyKey(''); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Feature flags</h2><p className="mt-1 text-sm text-slate-500">Create, search, configure, and safely release boolean features.</p></div><button type="button" onClick={() => setCreating(value => !value)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white"><Plus size={16}/>{creating ? 'Close form' : 'Create flag'}</button></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {creating && <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-700">Flag key<input required pattern="[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*" maxLength={64} value={form.flagKey} onChange={event => setForm({ ...form, flagKey: event.target.value })} placeholder="new_dashboard" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
      <label className="text-xs font-semibold text-slate-700">Display name<input required minLength={2} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="New dashboard experience" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
      <label className="text-xs font-semibold text-slate-700">Owner<input maxLength={120} value={form.owner} onChange={event => setForm({ ...form, owner: event.target.value })} placeholder="Frontend team" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
      <label className="text-xs font-semibold text-slate-700">Description<input maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="What this flag controls" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
      <p className="text-xs text-slate-500 sm:col-span-2">New flags start disabled with 0% rollout in all environments.</p>
      <button disabled={busyKey === 'create'} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{busyKey === 'create' ? 'Creating…' : 'Create feature flag'}</button>
    </form>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h3 className="font-bold text-slate-900">Flags · {environmentId}</h3><p className="mt-1 text-xs text-slate-500">Changes here apply only to the selected environment.</p></div><label className="relative w-full max-w-xs"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search flags…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"/></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Flag</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Rollout</th><th className="px-4 py-3">Evaluations</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading flags…</td></tr>
          : flags.length ? flags.map(flag => <tr key={flag.flagKey}>
            <td className="px-4 py-3"><Link to={`/feature-management/flags/${encodeURIComponent(flag.flagKey)}`} className="font-semibold text-blue-700 hover:text-blue-900">{flag.name}<span className="mt-0.5 block font-mono text-[10px] text-slate-500">{flag.flagKey}</span></Link><p className="mt-1 max-w-xs truncate text-xs text-slate-500">{flag.description}</p></td>
            <td className="px-4 py-3 text-slate-600">{flag.owner || '—'}</td>
            <td className="px-4 py-3 text-slate-700">{flag.rolloutPercent}%</td>
            <td className="px-4 py-3 text-slate-700">{flag.evaluationCount}</td>
            <td className="px-4 py-3"><button type="button" disabled={busyKey === flag.flagKey} onClick={() => toggle(flag)} aria-pressed={flag.enabled} className={`rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50 ${flag.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{flag.enabled ? 'Enabled' : 'Disabled'}</button></td>
            <td className="px-4 py-3"><div className="flex items-center gap-2"><Link title="Configure and evaluate flag" to={`/feature-management/flags/${encodeURIComponent(flag.flagKey)}`} className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ArrowUpRight size={15}/></Link><button type="button" title="Delete flag" disabled={busyKey === flag.flagKey} onClick={() => remove(flag)} className="rounded-md border border-slate-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15}/></button></div></td>
          </tr>) : <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{error ? 'Flags could not be loaded.' : 'No flags found. Create your first feature flag above.'}</td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
