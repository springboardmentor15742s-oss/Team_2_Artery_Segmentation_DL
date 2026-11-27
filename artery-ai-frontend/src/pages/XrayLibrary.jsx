import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { datasetImageUrl, getDatasetImages } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export default function XrayLibrary() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [images, setImages] = useState([]);
  const [query, setQuery] = useState('');
  const [modality, setModality] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const pageSize = 24;
  const load = () => getDatasetImages().then(data => { setImages(data.images || []); setError(''); }).catch(e => setError(e.message || 'Could not load the X-ray library.'));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => images.filter(item => {
    const q = query.toLowerCase().trim();
    return (!q || [item.caseId, item.patientId, item.region, item.vessel].some(value => value?.toLowerCase().includes(q))) &&
      (modality === 'all' || item.modality === modality) && (status === 'all' || item.status === status);
  }), [images, query, modality, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const modalities = [...new Set(images.map(item => item.modality))].sort();
  const statuses = [...new Set(images.map(item => item.status).filter(Boolean))].sort();
  const onFilter = (setter, value) => { setter(value); setPage(1); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{t('xrayLibrary')}</h1><p className="mt-1 text-sm text-slate-500">Browse authenticated ARCade X-ray angiograms and their annotation splits.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw size={16}/> {t('refresh')}</button></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"><label className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={e => onFilter(setQuery, e.target.value)} placeholder="Search case, patient, vessel…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500"/></label><select value={modality} onChange={e => onFilter(setModality, e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="all">All modalities</option>{modalities.map(value => <option key={value}>{value}</option>)}</select><select value={status} onChange={e => onFilter(setStatus, e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="all">All dataset splits/statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></div>
    <div className="flex items-center justify-between text-sm text-slate-500"><span>{filtered.length} images</span><span>Page {page} of {totalPages}</span></div>
    {visible.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(item => <button key={item.caseId} onClick={() => navigate(`/viewer/${encodeURIComponent(item.caseId)}`)} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm hover:border-sky-300 hover:shadow-md"><div className="flex h-52 items-center justify-center bg-slate-950"><img loading="lazy" src={datasetImageUrl(item.fileName)} alt={`Angiogram ${item.caseId}`} className="h-full w-full object-contain"/></div><div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold text-slate-900">{item.caseId}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{item.status}</span></div><p className="text-xs text-slate-600">{item.patientId} · {item.modality}</p><p className="truncate text-xs text-slate-500">{item.vessel} · {item.severity}</p></div></button>)}</div> : !error && <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"><ImageIcon className="mx-auto mb-2 text-slate-400"/>No images match those filters.</div>}
    {totalPages > 1 && <div className="flex justify-center gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-40">Next</button></div>}
  </div>;
}
