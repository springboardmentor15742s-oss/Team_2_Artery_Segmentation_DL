import React, { useEffect, useState } from 'react';
import { CalendarDays, Mail, Phone, Search, Star, Stethoscope, X } from 'lucide-react';
import { createAppointment, getDoctors, getStoredUser } from '../services/api';

function nextSlotValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function ClinicianDirectory() {
  const [doctors, setDoctors] = useState([]);
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState('all');
  const [selected, setSelected] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(nextSlotValue);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const user = getStoredUser();
  const isPatient = user?.role?.toLowerCase() === 'patient';

  useEffect(() => {
    getDoctors().then(setDoctors).catch(e => setError(e.message || 'Could not load doctors. Check that the API is running.')).finally(() => setLoading(false));
  }, []);

  const specialties = [...new Set(doctors.map(doctor => doctor.specialty).filter(Boolean))].sort();
  const visible = doctors.filter(doctor => (specialty === 'all' || doctor.specialty === specialty) && (!query || [doctor.name, doctor.specialty, doctor.careAreas, doctor.email].some(value => value?.toLowerCase().includes(query.toLowerCase()))));
  const submit = async event => {
    event.preventDefault();
    if (!selected || !scheduledAt) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await createAppointment({ doctorId: selected.id, scheduledAt: new Date(scheduledAt).toISOString(), reason });
      setMessage(`${result.message} Your request is pending confirmation.`);
      setSelected(null); setReason(''); setScheduledAt(nextSlotValue());
    } catch (e) { setError(e.message || 'Could not request this appointment.'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Infosys Healthcare & Life Sciences</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Available Doctors</h1><p className="mt-1 text-sm text-slate-600">Browse clinician specialties and contact details. Patients can request a time directly from a doctor.</p></div>
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message} <a className="ml-1 font-semibold underline" href="/appointments">View appointments</a></div>}
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-[1fr_260px]"><label className="relative block"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search doctor, specialty, or care area (eye, ear, skin…)" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500"/></label><label className="text-xs font-semibold text-slate-600">Specialty<select value={specialty} onChange={e=>setSpecialty(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="all">All specialties</option>{specialties.map(item=><option key={item}>{item}</option>)}</select></label></div>
    {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading doctor directory…</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(doctor => <article key={doctor.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className="rounded-xl bg-sky-50 p-3 text-sky-700"><Stethoscope size={22}/></span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${doctor.acceptingAppointments ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{doctor.acceptingAppointments ? 'Accepting appointment requests' : 'Currently unavailable'}</span></div><h2 className="mt-4 text-lg font-bold text-slate-900">{doctor.name}</h2><p className="mt-1 text-sm font-semibold text-sky-800">{doctor.specialty}</p><div className="mt-2 flex flex-wrap items-center gap-3 text-xs"><span className="text-slate-600">{doctor.experienceYears} years experience</span><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-800"><Star size={12} fill="currentColor"/>{doctor.rating?.toFixed(1)} demo rating</span></div><p className="mt-1 text-xs text-slate-500">{doctor.institution}</p><div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm"><a className="flex items-center gap-2 text-slate-700 hover:text-sky-700" href={`mailto:${doctor.email}`}><Mail size={15}/>{doctor.email}</a>{doctor.phone && <a className="flex items-center gap-2 text-slate-700 hover:text-sky-700" href={`tel:${doctor.phone}`}><Phone size={15}/>{doctor.phone}</a>}</div>{isPatient && <button onClick={() => { setSelected(doctor); setError(''); }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"><CalendarDays size={16}/>Request appointment</button>}<p className="mt-3 text-[10px] leading-relaxed text-slate-400">Contact details and ratings are demonstration data; verify clinic information before real patient use.</p></article>)}</div>}
    {!loading && visible.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No doctors match that search.</div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">Request appointment</h2><p className="text-sm text-slate-500">With {selected.name}</p></div><button type="button" aria-label="Close" onClick={() => setSelected(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={20}/></button></div><label className="block text-sm font-medium text-slate-700">Preferred date and time<input required type="datetime-local" min={nextSlotValue()} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label><label className="block text-sm font-medium text-slate-700">Reason for appointment<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={3} placeholder="Briefly describe what you would like to discuss" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>{error && <p className="text-sm text-rose-700">{error}</p>}<p className="text-xs text-slate-500">This sends a request to the doctor. The appointment is not confirmed until they accept it.</p><button disabled={saving} className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Sending request…' : 'Send appointment request'}</button></form></div>}
  </div>;
}
