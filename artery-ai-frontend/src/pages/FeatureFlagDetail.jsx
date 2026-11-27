import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Save } from 'lucide-react';
import { evaluateFeatureFlag, getFeatureFlag, updateFeatureFlag, updateFeatureFlagConfig } from '../services/api';

export default function FeatureFlagDetail() {
  const { flagKey } = useParams();
  const { environmentId } = useOutletContext();
  const [detail, setDetail] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [rolloutPercent, setRolloutPercent] = useState(0);
  const [defaultValue, setDefaultValue] = useState(false);
  const [rulesText, setRulesText] = useState('[]');
  const [subjectId, setSubjectId] = useState('demo-user-1');
  const [attributesText, setAttributesText] = useState('{}');
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await getFeatureFlag(flagKey, environmentId);
      setDetail(result);
      const config = result.environments.find(item => item.environmentId === environmentId);
      if (config) {
        setEnabled(config.enabled);
        setRolloutPercent(config.rolloutPercent);
        setDefaultValue(config.defaultValue);
        setRulesText(JSON.stringify(config.rules, null, 2));
      }
      setError('');
    } catch (requestError) { setError(requestError.message || 'Could not load this feature flag.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [flagKey, environmentId]);

  const save = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage(''); setEvaluation(null);
    try {
      const rules = JSON.parse(rulesText);
      if (!Array.isArray(rules)) throw new Error('Targeting rules must be a JSON array.');
      await updateFeatureFlagConfig(flagKey, environmentId, { enabled, rolloutPercent, defaultValue, rules });
      setMessage(`Configuration saved for ${environmentId}.`);
      await refresh();
    } catch (requestError) { setError(requestError.message || 'Could not save this configuration.'); }
    finally { setBusy(false); }
  };

  const evaluate = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setEvaluation(null);
    try {
      const attributes = JSON.parse(attributesText);
      if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') throw new Error('Attributes must be a JSON object.');
      setEvaluation(await evaluateFeatureFlag({ flagKey, environmentId, subjectId, attributes }));
      await refresh();
    } catch (requestError) { setError(requestError.message || 'Could not evaluate this flag.'); }
    finally { setBusy(false); }
  };

  const saveMetadata = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await updateFeatureFlag(flagKey, { name: detail.name, description: detail.description, owner: detail.owner });
      setMessage('Flag details updated.');
      await refresh();
    } catch (requestError) { setError(requestError.message || 'Could not update flag details.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <Link to="/feature-management/flags" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16}/>All feature flags</Link>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {loading ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading feature details…</p> : detail && <>
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-mono text-xs text-slate-500">{detail.flagKey} · Boolean flag</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{detail.name}</h2>
        <p className="mt-1 text-sm text-slate-600">{detail.description || 'No description supplied.'}</p>
        <p className="mt-3 text-xs text-slate-500">Created {new Date(detail.createdAt).toLocaleString()} · Evaluations {detail.evaluationCount} · Environment {environmentId}</p>
      </header>

      <form onSubmit={saveMetadata} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h3 className="font-bold text-slate-900 sm:col-span-2">Flag details</h3>
        <label className="text-xs font-semibold text-slate-700">Display name<input required minLength={2} maxLength={120} value={detail.name} onChange={event => setDetail({ ...detail, name: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
        <label className="text-xs font-semibold text-slate-700">Owner<input maxLength={120} value={detail.owner || ''} onChange={event => setDetail({ ...detail, owner: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Description<textarea maxLength={1000} rows={2} value={detail.description || ''} onChange={event => setDetail({ ...detail, description: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
        <button disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 sm:col-span-2">Save flag details</button>
      </form>

      <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div><h3 className="font-bold text-slate-900">Environment configuration</h3><p className="mt-1 text-xs text-slate-500">Each environment has an independent enable state, rollout percentage, default, and rule list.</p></div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>Enabled in {environmentId}</label>
        <label className="block text-xs font-semibold text-slate-700">Rollout percentage: {rolloutPercent}%<input type="range" min="0" max="100" value={rolloutPercent} onChange={event => setRolloutPercent(Number(event.target.value))} className="mt-2 block w-full"/></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={defaultValue} onChange={event => setDefaultValue(event.target.checked)}/>Default value for subjects outside rules/rollout</label>
        <label className="block text-xs font-semibold text-slate-700">Targeting rules (JSON array)<textarea rows={7} spellCheck="false" value={rulesText} onChange={event => setRulesText(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"/></label>
        <p className="text-[11px] leading-relaxed text-slate-500">Rule shape: <code>{'[{ "attribute": "plan", "operator": "equals", "value": "beta", "result": true }]'}</code>. First matching equality rule wins. Rollout assignment is stable per subject and environment.</p>
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16}/>{busy ? 'Saving…' : 'Save environment configuration'}</button>
      </form>

      <form onSubmit={evaluate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div><h3 className="font-bold text-slate-900">Evaluate this flag</h3><p className="mt-1 text-xs text-slate-500">Runs and records a real evaluation using this environment's saved configuration.</p></div>
        <label className="block text-xs font-semibold text-slate-700">Subject ID<input required maxLength={200} value={subjectId} onChange={event => setSubjectId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/></label>
        <label className="block text-xs font-semibold text-slate-700">Subject attributes (JSON object)<textarea rows={3} value={attributesText} onChange={event => setAttributesText(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-normal"/></label>
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50"><Play size={15}/>{busy ? 'Working…' : 'Evaluate'}</button>
        {evaluation && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Result: <strong>{String(evaluation.value)}</strong> · {evaluation.reason} · evaluation {evaluation.evaluationId}</p>}
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-900">Evaluation activity · last 30 days</h3>
        {detail.dailyEvaluations.length ? <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">{detail.dailyEvaluations.map(item => <div key={item.date} className="flex items-center gap-3 text-xs"><span className="w-24 shrink-0 text-slate-500">{item.date}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, item.count ? item.enabledCount / item.count * 100 : 0)}%` }}/></div><span className="w-20 text-right text-slate-600">{item.enabledCount}/{item.count} enabled</span></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No evaluations have been recorded for this flag yet.</p>}
      </section>
    </>}
  </div>;
}
