import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, Mail, Phone, RefreshCw, X } from 'lucide-react';
import { getAppointments, getStoredUser, updateAppointment } from '../services/api';

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Appointments() {
  const user = getStoredUser();
  const isDoctor = user?.role?.toLowerCase() === 'doctor';
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try { setAppointments(await getAppointments()); }
    catch (e) { setError(e.message || 'Could not load appointments.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const update = async (appointment, status) => {
    setBusy(appointment.id); setError(''); setMessage('');
    try {
      await updateAppointment(appointment.id, status);
      setMessage(`Appointment ${appointment.id} marked ${status.toLowerCase()}.`);
      await refresh();
    } catch (e) { setError(e.message || 'Appointment could not be updated.'); }
    finally { setBusy(''); }
  };

  const upcoming = appointments.filter(item => new Date(item.scheduledAt) >= new Date() && ['Pending', 'Confirmed'].includes(item.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Infosys Healthcare & Life Sciences</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{isDoctor ? 'My Appointments' : 'My Appointment Requests'}</h1>
          <p className="mt-1 text-sm text-slate-600">{isDoctor ? 'Review patient requests, contact patients, and update appointment status.' : 'Track appointment requests and contact the selected doctor.'}</p>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw size={16}/>Refresh</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total requests" value={appointments.length}/>
        <Metric label="Upcoming" value={upcoming.length}/>
        <Metric label="Awaiting confirmation" value={appointments.filter(item => item.status === 'Pending').length}/>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading appointments…</div> : appointments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <CalendarDays className="mx-auto text-slate-400"/>
          <h2 className="mt-3 font-semibold text-slate-900">No appointments yet</h2>
          <p className="mt-1 text-sm text-slate-500">{isDoctor ? 'Patient requests will appear here.' : 'Browse available doctors to request a time.'}</p>
          {!isDoctor && <a href="/doctors" className="mt-4 inline-flex rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white">Browse doctors</a>}
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(appointment => {
            const canManage = isDoctor && ['Pending', 'Confirmed'].includes(appointment.status);
            const canCancel = !isDoctor && appointment.status === 'Pending';
            const contactEmail = isDoctor ? appointment.patientEmail : appointment.doctorEmail;
            const contactPhone = isDoctor ? appointment.patientPhone : appointment.doctorPhone;
            return (
              <article key={appointment.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><h2 className="font-bold text-slate-900">{isDoctor ? appointment.patientName : appointment.doctorName}</h2><Status value={appointment.status}/></div>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Clock3 size={15}/>{dateLabel(appointment.scheduledAt)}</p>
                    <p className="mt-2 text-sm text-slate-600">{appointment.reason || 'No reason provided'}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-400">{appointment.id}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm">
                  <a className="inline-flex items-center gap-1.5 text-sky-800 hover:underline" href={`mailto:${contactEmail}`}><Mail size={14}/>{contactEmail}</a>
                  {contactPhone && <a className="inline-flex items-center gap-1.5 text-sky-800 hover:underline" href={`tel:${contactPhone}`}><Phone size={14}/>{contactPhone}</a>}
                </div>

                {(canManage || canCancel) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {isDoctor && appointment.status === 'Pending' && <Action disabled={busy === appointment.id} onClick={() => update(appointment, 'Confirmed')} icon={<Check size={15}/>} label="Confirm" tone="green"/>}
                    {isDoctor && appointment.status === 'Confirmed' && <Action disabled={busy === appointment.id} onClick={() => update(appointment, 'Completed')} icon={<Check size={15}/>} label="Mark completed" tone="blue"/>}
                    <Action disabled={busy === appointment.id} onClick={() => update(appointment, 'Cancelled')} icon={<X size={15}/>} label="Cancel" tone="red"/>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">Clinician contact details and appointment workflows in this build are demonstration data. Confirm contact information and scheduling directly before real clinical use.</p>
    </div>
  );
}

function Metric({label,value}) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>; }
function Status({value}) { const colors = value === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' : value === 'Pending' ? 'bg-amber-50 text-amber-800' : value === 'Cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors}`}>{value}</span>; }
function Action({disabled,onClick,icon,label,tone}) { const colors={green:'bg-emerald-700 hover:bg-emerald-800',blue:'bg-sky-700 hover:bg-sky-800',red:'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'};return <button disabled={disabled} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${colors[tone]}`}>{icon}{label}</button>; }
