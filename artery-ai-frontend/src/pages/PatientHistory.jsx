import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, HeartPulse } from 'lucide-react';
import { getPatientReports } from '../services/api';

const value = (report, key, suffix = '') => report?.[key] == null ? 'Not recorded' : `${report[key]}${suffix}`;

export default function PatientHistory() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [previousId, setPreviousId] = useState('');
  useEffect(() => {
    getPatientReports().then(items => {
      const ordered = [...items].sort((a,b) => new Date(b.reportDate || b.date) - new Date(a.reportDate || a.date));
      setReports(ordered);
      setCurrentId(ordered[0]?.id || '');
      setPreviousId(ordered[1]?.id || '');
    }).catch(e => setError(e.message || 'Could not load report history.')).finally(() => setLoading(false));
  }, []);
  const current = useMemo(() => reports.find(r => r.id === currentId), [reports,currentId]);
  const previous = useMemo(() => reports.find(r => r.id === previousId), [reports,previousId]);
  const patientKey = reports[0]?.patientId;
  const samePatientReports = useMemo(() => reports.filter(report => report.patientId === patientKey), [reports, patientKey]);
  const rows = [
    ['Report date', r => r?.reportDate ? new Date(r.reportDate).toLocaleDateString() : r?.date || 'Not recorded'],
    ['Case', r => r?.caseId || '—'], ['Region', r => r?.region || '—'], ['Reviewed by', r => r?.doctorName || '—'],
    ['Analysis model', r => r?.analysisModel || 'Not recorded'],
    ['Severity', r => r?.severity || 'Not recorded'], ['Estimated narrowing', r => value(r,'narrowingPercentage','%')],
    ['Dice overlap', r => r?.analysisMetrics?.dice == null ? 'Not recorded' : `${(r.analysisMetrics.dice * 100).toFixed(1)}%`],
    ['IoU overlap', r => r?.analysisMetrics?.iou == null ? 'Not recorded' : `${(r.analysisMetrics.iou * 100).toFixed(1)}%`],
    ['Inference time', r => value(r?.analysisMetrics, 'inferenceTimeMs', ' ms')],
    ['Reference diameter', r => value(r,'referenceDiameterMm',' mm')], ['Minimum diameter', r => value(r,'minDiameterMm',' mm')],
  ];
  return <main className="mx-auto max-w-6xl space-y-6">
    <header className="rounded-2xl bg-gradient-to-r from-slate-900 to-sky-950 p-6 text-white"><HeartPulse className="text-sky-300"/><h1 className="mt-3 text-2xl font-bold">Patient history comparison</h1><p className="mt-1 text-sm text-slate-300">Compare details from reports your doctor has approved.</p></header>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading ? <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">Loading report history…</p> : samePatientReports.length < 2 ? <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">At least two approved reports are needed for a comparison. Reports appear here after your doctor approves them.</section> : <>
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Current report<select value={currentId} onChange={e => setCurrentId(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-2.5">{samePatientReports.map(r => <option key={r.id} value={r.id}>{r.caseId} · {new Date(r.reportDate || r.date).toLocaleDateString()}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">Compare with<select value={previousId} onChange={e => setPreviousId(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-2.5">{samePatientReports.filter(r => r.id !== currentId).map(r => <option key={r.id} value={r.id}>{r.caseId} · {new Date(r.reportDate || r.date).toLocaleDateString()}</option>)}</select></label>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Confidence, calibration and limitations</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Current per-scan confidence</p><p className="mt-1 text-sm font-bold text-slate-800">{current?.confidence == null ? 'Not returned / not calibrated' : `${(Number(current.confidence)*100).toFixed(1)}%`}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Image scale</p><p className="mt-1 text-sm font-bold text-slate-800">{current?.referenceDiameterMm == null || current?.minDiameterMm == null ? 'Physical calibration unavailable' : 'Recorded in report'}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Review context</p><p className="mt-1 text-sm font-bold text-slate-800">Doctor-approved reports only</p></div></div><p className="mt-3 text-xs leading-5 text-slate-600">Dice and IoU describe overlap with reference masks when available; they are not patient-specific confidence scores. Report-to-report differences are shown as recorded and must not be interpreted automatically as disease progression.</p></section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-200 p-4 font-bold text-slate-800"><ArrowLeftRight size={18} className="text-sky-700"/>Report comparison</div><div className="grid grid-cols-[minmax(130px,.8fr)_1fr_1fr]">{['Measure', 'Current report', 'Previous report'].map(h => <div key={h} className="bg-slate-50 p-3 text-xs font-bold uppercase tracking-wide text-slate-600">{h}</div>)}{rows.flatMap(([label, get]) => [<div key={`${label}-label`} className="border-t border-slate-100 p-3 text-sm font-semibold text-slate-700">{label}</div>,<div key={`${label}-current`} className="border-t border-slate-100 p-3 text-sm text-slate-900">{get(current)}</div>,<div key={`${label}-previous`} className="border-t border-slate-100 p-3 text-sm text-slate-900">{get(previous)}</div>])}</div>
        <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2">{[['Current report',current],['Previous report',previous]].map(([label,r]) => <article key={label} className="overflow-hidden rounded-lg border border-slate-200"><h2 className="bg-slate-50 px-3 py-2 text-xs font-bold">{label} · {r?.caseId}</h2><div className="grid grid-cols-2 gap-2 p-2">{[['Original','original_b64'],['Vessel segmentation','mask_overlay_b64'],['Lesion view','stenosis_overlay_b64']].map(([title,key]) => <figure key={key} className="overflow-hidden rounded border border-slate-200"><figcaption className="px-2 py-1 text-[10px] font-semibold">{title}</figcaption>{r?.visualizations?.[key] ? <img src={r.visualizations[key]} alt={`${title} ${label}`} className="h-32 w-full bg-slate-950 object-contain"/> : <div className="grid h-32 place-items-center text-[10px] text-slate-500">Unavailable</div>}</figure>)}</div></article>)}</div>
        <p className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This compares recorded report fields and images. Changes are not automatically interpreted as clinical progression; discuss them with your doctor.</p>
      </section>
    </>}
  </main>;
}
