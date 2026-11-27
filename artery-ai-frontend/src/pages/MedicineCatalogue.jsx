import React, { useState } from 'react';
import { ExternalLink, Pill, Search } from 'lucide-react';

export default function MedicineCatalogue() {
  const [query, setQuery] = useState('');
  const official = 'https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine';
  return <div className="mx-auto max-w-4xl space-y-5"><header className="rounded-2xl bg-gradient-to-r from-slate-900 to-sky-950 p-6 text-white"><Pill className="text-sky-300"/><h1 className="mt-3 text-2xl font-bold">Medicine Catalogue</h1><p className="mt-1 text-sm text-slate-300">Look up official medicine price information. The app does not prescribe medicines or claim live pharmacy stock.</p></header><section className="rounded-xl border border-slate-200 bg-white p-5"><label className="text-sm font-semibold text-slate-800">Medicine name<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Generic or brand name" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm"/></label><a href={official} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Search Government NPPA price database <Search size={16}/><ExternalLink size={14}/></a><p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">Confirm medicine, strength, current maximum retail price, prescription requirements, and availability with a licensed pharmacist. Search term: {query.trim() || 'Enter a medicine name above'}.</p></section></div>;
}
