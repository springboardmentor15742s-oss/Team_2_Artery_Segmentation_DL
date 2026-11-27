import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { getFeatureSettings } from '../services/api';

export default function FeatureSettings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getFeatureSettings().then(setSettings).catch(requestError => setError(requestError.message || 'Could not load feature-management settings.'));
  }, []);

  return <div className="space-y-4">
    <div><h2 className="text-lg font-bold text-slate-900">Feature management settings</h2><p className="mt-1 text-sm text-slate-500">Access is controlled by backend configuration, not by a client-side UI toggle.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {settings && <>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="rounded-lg bg-sky-50 p-2 text-sky-700"><UserRound size={18}/></span><div><h3 className="font-bold text-slate-900">Signed-in administrator</h3><p className="mt-1 text-sm text-slate-600">{settings.administrator.name} · {settings.administrator.email}</p></div></div></section>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 text-emerald-700"/><div><h3 className="font-bold text-emerald-900">Protected management access</h3><p className="mt-1 text-sm leading-relaxed text-emerald-900">The backend permits users whose role is Administrator or whose email is explicitly listed in ARTERY_FEATURE_ADMIN_EMAILS. Patients and unlisted accounts cannot create or change flags.</p></div></div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-900">Configure an administrator in PowerShell</h3><p className="mt-2 text-sm text-slate-600">Set your own signed-in account email in the same terminal before launching the backend. Do not commit the email setting to a public repository.</p><pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{`$env:ARTERY_FEATURE_ADMIN_EMAILS = "${settings.administrator.email}"\ncd C:\\html\\Artery_Medical_Final_Complete\\Artery_Medical\\backend\n..\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`}</pre></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-900">Environments</h3><ul className="mt-3 flex flex-wrap gap-2">{settings.environments.map(environment => <li key={environment.id} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-700">{environment.name} · <code>{environment.id}</code></li>)}</ul><p className="mt-3 text-xs text-slate-500">Environment settings are stored in the local SQLite database. Flag configuration and audit events persist across restarts.</p></section>
    </>}
  </div>;
}
