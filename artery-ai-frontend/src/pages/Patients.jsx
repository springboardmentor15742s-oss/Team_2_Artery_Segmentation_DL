import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Users } from 'lucide-react';
import { getCases } from '../services/api';

export default function Patients() {
  const [cases, setCases] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getCases();
      setCases(result.cases || []);
    } catch (requestError) {
      setError(requestError.message || 'Could not load patient-linked case records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const patients = useMemo(() => {
    const grouped = new Map();
    cases.forEach(record => {
      const current = grouped.get(record.patientId) || {
        id: record.patientId,
        age: record.age,
        gender: record.gender,
        medicalHistory: record.medicalHistory,
        caseCount: 0,
        lastScan: '',
      };
      current.caseCount += 1;
      if (record.scanDate && record.scanDate > current.lastScan) current.lastScan = record.scanDate;
      grouped.set(record.patientId, current);
    });
    const term = query.trim().toLowerCase();
    return [...grouped.values()]
      .filter(patient => !term || `${patient.id} ${patient.gender || ''} ${patient.medicalHistory || ''}`.toLowerCase().includes(term))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [cases, query]);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Case-linked registry</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Patients</h1>
        <p className="mt-1 text-sm text-slate-500">Distinct patient identifiers represented in the local case registry.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh</button>
    </header>
    <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">This view groups records by patient ID from the local database; it is not connected to an external EHR.</p>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="flex items-center gap-2"><Users size={17} className="text-sky-700"/><h2 className="font-bold text-slate-900">Patient registry</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{patients.length}</span></div>
        <label className="relative block w-full sm:max-w-xs"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search patient records…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"/></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Patient ID</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Gender</th><th className="px-4 py-3">Cases</th><th className="px-4 py-3">Latest scan</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading patient records…</td></tr>
              : patients.length ? patients.map(patient => <tr key={patient.id}>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">{patient.id}</td>
                <td className="px-4 py-3 text-slate-600">{patient.age ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{patient.gender || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{patient.caseCount}</td>
                <td className="px-4 py-3 text-slate-600">{patient.lastScan || '—'}</td>
                <td className="px-4 py-3"><Link to={`/cases?search=${encodeURIComponent(patient.id)}`} className="font-semibold text-sky-700 hover:text-sky-900">View cases</Link></td>
              </tr>) : <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{error ? 'Patient records could not be loaded.' : 'No patient-linked case records found.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
