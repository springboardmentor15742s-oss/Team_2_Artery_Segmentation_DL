import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Globe2, Plus, RefreshCw } from 'lucide-react';
import { createFeatureEnvironment } from '../services/api';

export default function FeatureEnvironments() {
  const { environments, refreshEnvironments } = useOutletContext();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await createFeatureEnvironment(name);
      setName(''); setMessage(`${result.name} environment created and initialized for all existing flags.`);
      await refreshEnvironments();
    } catch (requestError) { setError(requestError.message || 'Could not create the environment.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <div><h2 className="text-lg font-bold text-slate-900">Environments</h2><p className="mt-1 text-sm text-slate-500">Feature flag settings are isolated between environments.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <section className="grid gap-3 sm:grid-cols-3">{environments.map(environment => <article key={environment.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="rounded-lg bg-sky-50 p-2 text-sky-700"><Globe2 size={18}/></span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Active</span></div><h3 className="mt-3 font-bold text-slate-900">{environment.name}</h3><p className="mt-1 font-mono text-xs text-slate-500">{environment.id}</p><p className="mt-3 text-xs text-slate-600">{environment.configuredFlags ?? 0} configured flags</p><p className="mt-2 text-[10px] text-slate-400">Created {environment.createdAt ? new Date(environment.createdAt).toLocaleDateString() : '—'}</p></article>)}</section>
    {!environments.length && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading environments…</div>}
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
      <label className="flex-1 text-xs font-semibold text-slate-700">Add environment<input required minLength={2} maxLength={40} pattern="[A-Za-z][A-Za-z0-9 _-]*" value={name} onChange={event => setName(event.target.value)} placeholder="QA" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
      <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16}/>{busy ? 'Creating…' : 'Create environment'}</button>
      <button type="button" onClick={refreshEnvironments} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw size={15}/>Refresh</button>
    </form>
  </div>;
}
