import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight, Stethoscope } from 'lucide-react';
import { login } from '../services/api';

const doctors = [
  ['Dr. Sarah Mitchell', 'Interventional Cardiology', 'Coronary intervention · 16 years'],
  ['Dr. Arjun Rao', 'Cardiovascular Imaging', 'Cardiac CT · 12 years'],
  ['Dr. Meera Iyer', 'Interventional Cardiology', 'Angiography · 14 years'],
  ['Dr. Daniel Chen', 'Cardiac Radiology', 'Cardiac MRI · 11 years'],
  ['Dr. Priya Nair', 'Preventive Cardiology', 'Risk assessment · 10 years'],
  ['Dr. Omar Hassan', 'Vascular Medicine', 'Vascular imaging · 13 years'],
  ['Dr. Aisha Patel', 'Cardiovascular Imaging', 'Image review · 9 years'],
  ['Dr. Kenji Watanabe', 'Interventional Cardiology', 'Coronary procedures · 15 years'],
  ['Dr. Sofia Martinez', 'Cardiac Radiology', 'Diagnostic imaging · 10 years'],
  ['Dr. Ravi Kumar', 'Clinical Cardiology', 'Cardiology · 12 years'],
];

export default function Doctors() {
  const navigate = useNavigate();
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');
  const signIn = async (index) => {
    setActive(index); setError('');
    try {
      await login({ email: `doctor${String(index + 1).padStart(2, '0')}@infosys.com`, password: 'Doctor123!' });
      navigate('/dashboard');
    } catch (e) { setError(e.message || 'Doctor sign-in is unavailable. Start the backend and try again.'); }
    finally { setActive(-1); }
  };
  return <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <Link to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft size={16}/> Back to sign in</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800"><Activity size={14}/> Infosys Healthcare & Life Sciences</div><h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Clinician directory</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Choose one of the ten demo clinician accounts for direct access to the Artery AI workspace.</p></div><span className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">10 doctors available</span></div>
      {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map(([name, specialty, experience], index) => <article key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-medical-50 text-medical-700"><Stethoscope size={22}/></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Demo account</span></div><h2 className="mt-4 text-lg font-bold text-slate-900">{name}</h2><p className="mt-1 text-sm font-semibold text-sky-800">{specialty}</p><p className="mt-1 text-xs text-slate-500">{experience}</p><button disabled={active !== -1} onClick={() => signIn(index)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-medical-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-medical-800 disabled:opacity-50">{active === index ? 'Signing in…' : <>Sign in as this doctor <ArrowRight size={16}/></>}</button></article>)}
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">These are seeded demo identities for this local prototype. All other members must register before signing in.</p>
    </div>
  </div>;
}
