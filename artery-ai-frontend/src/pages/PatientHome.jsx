import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock3, ExternalLink, Hospital, Mail, MapPin, MessageSquare, Phone, Search, Send, Star, Stethoscope, X } from 'lucide-react';
import { getAppointments, getDoctors, getHospitals, getMessageThread, getPharmacies, getStoredUser, saveHospitals, savePharmacies, sendPatientMessage } from '../services/api';

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(bLat - aLat); const dLon = rad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function queryOpenStreetMap(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  let lastError;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 14000);
    try {
      const response = await fetch(`${endpoint}?${new URLSearchParams({ data: query })}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Map data service returned ${response.status}.`);
      return await response.json();
    } catch (error) { lastError = error; }
    finally { window.clearTimeout(timeout); }
  }
  throw lastError || new Error('Nearby map data is temporarily unavailable.');
}

export default function PatientHome() {
  const user = getStoredUser();
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [hospitals, setHospitals] = useState([]);
  const [location, setLocation] = useState(null);
  const [hospitalError, setHospitalError] = useState('');
  const [hospitalMessage, setHospitalMessage] = useState('');
  const [medicineQuery, setMedicineQuery] = useState('');
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyMessage, setPharmacyMessage] = useState('');
  const [pharmacyError, setPharmacyError] = useState('');
  const [loadingPharmacies, setLoadingPharmacies] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([getDoctors(), getAppointments()])
      .then(([doctorList, appointmentList]) => { setDoctors(doctorList); setAppointments(appointmentList); })
      .catch(error => setLoadError(error.message || 'Could not load your patient portal.'))
      .finally(() => setLoading(false));
  }, []);

  const findHospitals = () => {
    setHospitalError(''); setHospitalMessage(''); setHospitals([]);
    if (!navigator.geolocation) { setHospitalError('Location search is not supported in this browser.'); return; }
    setLoadingHospitals(true);
    navigator.geolocation.getCurrentPosition(async position => {
      const { latitude, longitude } = position.coords;
      setLocation({ latitude, longitude });
      const cached = await getHospitals(latitude, longitude, 15).catch(() => []);
      if (cached.length) setHospitals(cached);
      const query = `[out:json][timeout:20];(nwr["amenity"="hospital"](around:15000,${latitude},${longitude});nwr["healthcare"="hospital"](around:15000,${latitude},${longitude}););out center tags;`;
      try {
        const payload = await queryOpenStreetMap(query);
        const rows = (payload.elements || []).map(item => {
          const lat = item.lat ?? item.center?.lat; const lon = item.lon ?? item.center?.lon;
          if (lat == null || lon == null) return null;
          const tags = item.tags || {};
          return { id: `${item.type}-${item.id}`, name: tags.name || tags['name:en'] || tags.operator || 'Hospital', address: [tags['addr:street'], tags['addr:city'] || tags['addr:suburb']].filter(Boolean).join(', '), distance: distanceKm(latitude, longitude, lat, lon), lat, lon };
        }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 12);
        if (rows.length) {
          await saveHospitals(rows.map(({ id, name, address, lat, lon }) => ({ id, name, address, lat, lon })));
          setHospitals(rows);
          setHospitalMessage('Nearby public hospital listings are saved in the application database for later searches.');
        } else if (!cached.length) setHospitals([]);
        if (!rows.length) setHospitalError(cached.length ? 'No new hospitals were returned. Showing previously saved nearby listings.' : 'No mapped hospitals were found within 15 km. Try the map search below.');
      } catch (error) {
        setHospitalError(cached.length ? 'Nearby map service is unavailable. Showing saved hospital listings for this area.' : `${error.name === 'AbortError' ? 'Nearby hospital search timed out.' : error.message || 'Nearby hospital search failed.'} Try the map search below.`);
      } finally { setLoadingHospitals(false); }
    }, error => {
      setLoadingHospitals(false);
      setHospitalError(error.code === 1 ? 'Allow location access to show nearby hospitals, or use the map search below.' : 'Could not read your location. Try the map search below.');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };

  const mapSearch = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`hospitals near ${location.latitude},${location.longitude}`)}`
    : 'https://www.google.com/maps/search/?api=1&query=hospitals+near+me';
  const upcoming = appointments.filter(item => ['Pending', 'Confirmed'].includes(item.status) && new Date(item.scheduledAt) >= new Date()).slice(0, 3);
  const medicineSearch = medicineQuery.trim() || 'medicine';
  const priceLookup = 'https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine';
  const pharmacyMapSearch = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`pharmacies near ${location.latitude},${location.longitude}`)}`
    : 'https://www.google.com/maps/search/?api=1&query=pharmacy+near+me';

  const findPharmacies = () => {
    setPharmacyError(''); setPharmacyMessage(''); setPharmacies([]);
    if (!navigator.geolocation) { setPharmacyError('Location search is not supported in this browser.'); return; }
    setLoadingPharmacies(true);
    navigator.geolocation.getCurrentPosition(async position => {
      const { latitude, longitude } = position.coords;
      setLocation({ latitude, longitude });
      const cached = await getPharmacies(latitude, longitude, 10).catch(() => []);
      if (cached.length) setPharmacies(cached);
      const query = `[out:json][timeout:20];(nwr["amenity"="pharmacy"](around:10000,${latitude},${longitude}););out center tags;`;
      try {
        const payload = await queryOpenStreetMap(query);
        const rows = (payload.elements || []).map(item => {
          const lat = item.lat ?? item.center?.lat; const lon = item.lon ?? item.center?.lon;
          if (lat == null || lon == null) return null;
          const tags = item.tags || {};
          return { id: `${item.type}-${item.id}`, name: tags.name || tags['name:en'] || 'Pharmacy', address: [tags['addr:street'], tags['addr:city'] || tags['addr:suburb']].filter(Boolean).join(', '), distance: distanceKm(latitude, longitude, lat, lon), lat, lon };
        }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 10);
        if (rows.length) {
          await savePharmacies(rows.map(({ id, name, address, lat, lon }) => ({ id, name, address, lat, lon })));
          setPharmacies(rows);
          setPharmacyMessage('These public pharmacy listings are saved in the application database for later searches.');
        } else if (!cached.length) setPharmacies([]);
        if (!rows.length) setPharmacyError('No mapped pharmacies were found within 10 km. Try the map search.');
      } catch (error) { setPharmacyError(cached.length ? 'Showing saved pharmacy listings. Live refresh is currently unavailable.' : `${error.message || 'Nearby pharmacy search failed.'} Listings will be saved after a successful search.`); }
      finally { setLoadingPharmacies(false); }
    }, error => { setLoadingPharmacies(false); setPharmacyError(error.code === 1 ? 'Allow location access to show nearby pharmacies, or use the map search.' : 'Could not read your location.'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };

  return <div className="space-y-6">
    <section className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 p-6 text-white sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Patient portal</p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome, {user?.name || 'Patient'}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">Find a clinician, review your appointment requests, and search for hospitals near your current location.</p>
      <div className="mt-5 flex flex-wrap gap-3"><a href="/doctors" className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500">Browse doctors</a><a href="/appointments" className="rounded-lg border border-slate-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">My appointments ({appointments.length})</a><a href="/patient-medical-reports" className="rounded-lg border border-slate-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Medical reports</a></div>
      <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4"><p className="text-sm font-semibold">Medical availability</p><p className="mt-1 text-sm text-slate-300">{doctors.filter(doctor => doctor.acceptingAppointments).length} doctors are currently accepting appointment requests. Choose a preferred time; the doctor confirms the visit.</p></div>
    </section>

    {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</div>}

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">Available doctors</h2><p className="mt-1 text-sm text-slate-600">View specialties, experience, profile ratings, and direct contact details.</p></div><a href="/doctors" className="text-sm font-semibold text-sky-800 hover:underline">Full directory →</a></div>
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading doctor directory…</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{doctors.map(doctor => <DoctorCard key={doctor.id} doctor={doctor}/>)}</div>}
      <p className="text-xs text-slate-500">The listed ratings and clinician profiles are sample demonstration data, not verified patient reviews. Confirm contacts with the clinic before real-world use.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Hospital size={22}/></span><div><h2 className="text-xl font-bold text-slate-900">Nearby hospitals</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Allow location access to search OpenStreetMap for hospitals within 15 km. Your coordinates are used for this search only and are not saved to your account.</p></div></div><button onClick={findHospitals} disabled={loadingHospitals} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"><Search size={16}/>{loadingHospitals ? 'Searching nearby…' : 'Find hospitals near me'}</button></div>
      {hospitalError && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{hospitalError}</p>}
      {hospitalMessage && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{hospitalMessage}</p>}
      {!hospitals.length && !loadingHospitals && <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:underline" href={mapSearch} target="_blank" rel="noreferrer"><MapPin size={16}/>Open nearby hospitals in Maps<ExternalLink size={14}/></a>}
      {hospitals.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-2">{hospitals.map(hospital => <article key={hospital.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4"><div className="flex gap-3"><span className="mt-0.5 text-emerald-700"><Hospital size={18}/></span><div><h3 className="font-semibold text-slate-900">{hospital.name}</h3><p className="mt-1 text-xs text-slate-500">{hospital.address || 'Address not listed on OpenStreetMap'}</p><p className="mt-2 text-xs font-semibold text-emerald-800">{hospital.distance.toFixed(1)} km away</p></div></div><a aria-label={`Open ${hospital.name} in maps`} className="shrink-0 rounded-lg border border-slate-200 p-2 text-sky-800 hover:bg-sky-50" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hospital.name} ${hospital.lat},${hospital.lon}`)}`} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a></article>)}</div>}
      <p className="mt-4 text-[11px] text-slate-400">Hospital listings use OpenStreetMap data and may be incomplete. © OpenStreetMap contributors.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-violet-50 p-3 text-violet-700"><Search size={20}/></span><div><h2 className="text-xl font-bold text-slate-900">Medicine & pharmacy finder</h2><p className="mt-1 text-sm text-slate-600">Look up a medicine and find nearby pharmacies. Confirm the prescribed medicine, current price, stock, and prescription requirements with a licensed pharmacist.</p></div></div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="sr-only">Medicine name</span><input value={medicineQuery} onChange={event => setMedicineQuery(event.target.value)} placeholder="Enter generic or brand medicine name" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500"/></label><a href={priceLookup} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Check official medicine price <ExternalLink size={15}/></a><a href={`https://www.google.com/search?q=${encodeURIComponent(`${medicineSearch} price pharmacy India`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Compare pharmacy prices <ExternalLink size={15}/></a></div>
      <div className="mt-4 flex flex-wrap gap-2">{['Paracetamol 500 mg', 'ORS (oral rehydration salts)', 'Cetirizine 10 mg'].map(name => <button key={name} onClick={() => setMedicineQuery(name)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-violet-300 hover:bg-violet-50">{name}</button>)}</div>
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950"><strong>Medicine safety:</strong> This app does not prescribe medicines or confirm pharmacy stock. Use only the medicine and strength advised by your clinician. Prescription medicines require a valid prescription; verify the current MRP and availability with the pharmacy.</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div><h3 className="font-semibold text-slate-900">Nearby pharmacies</h3><p className="mt-1 text-xs text-slate-500">Search mapped pharmacies within 10 km of your location.</p></div><button onClick={findPharmacies} disabled={loadingPharmacies} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"><MapPin size={16}/>{loadingPharmacies ? 'Searching…' : 'Find pharmacies near me'}</button></div>
      {pharmacyError && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{pharmacyError}</p>}
      {pharmacyMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{pharmacyMessage}</p>}
      {!pharmacies.length && <a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:underline" href={pharmacyMapSearch} target="_blank" rel="noreferrer"><MapPin size={15}/>Open pharmacies in Maps<ExternalLink size={14}/></a>}
      {pharmacies.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{pharmacies.map(pharmacy => <article key={pharmacy.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><h4 className="font-semibold text-slate-900">{pharmacy.name}</h4><p className="mt-1 text-xs text-slate-500">{pharmacy.address || 'Address not listed on OpenStreetMap'}</p><p className="mt-2 text-xs font-semibold text-emerald-800">{pharmacy.distance.toFixed(1)} km away · Price and stock not verified</p><a className="mt-2 inline-block text-xs font-semibold text-sky-800 hover:underline" href={`https://www.google.com/search?q=${encodeURIComponent(`${medicineSearch} ${pharmacy.name} price`)}`} target="_blank" rel="noreferrer">Check {medicineSearch} price / order online</a></div><a aria-label={`Open ${pharmacy.name} in maps`} className="shrink-0 rounded-lg border border-slate-200 p-2 text-sky-800 hover:bg-sky-50" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pharmacy.name} ${pharmacy.lat},${pharmacy.lon}`)}`} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a></article>)}</div>}
      <p className="mt-3 text-[11px] text-slate-400">Medicine price lookup opens the Government of India NPPA Pharma Sahi Daam portal. Nearby pharmacy listings use OpenStreetMap and may be incomplete.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Upcoming appointments</h2><p className="text-sm text-slate-500">Requests and confirmed visits</p></div><a href="/appointments" className="text-sm font-semibold text-sky-800 hover:underline">View all</a></div>{upcoming.length ? <div className="mt-4 divide-y divide-slate-100">{upcoming.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{item.doctorName}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={14}/>{new Date(item.scheduledAt).toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{item.status}</span></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No upcoming appointments. Browse the doctor list to request a time.</p>}</section>
  </div>;
}

function DoctorCard({ doctor }) {
  const user = getStoredUser();
  const available = Boolean(doctor.acceptingAppointments);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState('');
  const [contactMode, setContactMode] = useState('');
  const [copied, setCopied] = useState(false);

  const copyContact = async value => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy is unavailable in this browser. Select and copy the contact details shown.'); }
  };

  const openMessages = async () => {
    setOpen(true); setThread([]); setDraft(''); setError(''); setLoadingThread(true);
    try { setThread(await getMessageThread(doctor.id)); }
    catch (e) { setError(e.message || 'Could not load this conversation.'); }
    finally { setLoadingThread(false); }
  };
  const send = async event => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const result = await sendPatientMessage(doctor.id, draft.trim());
      setThread(current => [...current, result]); setDraft('');
    } catch (e) { setError(e.message || 'Message could not be sent.'); }
    finally { setBusy(false); }
  };

  return <>
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-sky-50 p-3 text-sky-700"><Stethoscope size={20}/></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{available ? 'Accepting appointments' : 'Currently unavailable'}</span></div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{doctor.name}</h3><p className="mt-1 text-sm font-semibold text-sky-800">{doctor.specialty}</p><p className="mt-2 text-sm text-slate-600">{doctor.experienceYears ? `${doctor.experienceYears} years of experience` : 'Experience not listed'}</p>
      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800"><Star size={13} fill="currentColor"/>{doctor.rating?.toFixed(1) || 'N/A'} <span className="font-normal">sample rating</span></div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{doctor.phone && <><button type="button" onClick={() => setContactMode('call')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Phone size={14}/>Call / voicemail</button><button type="button" onClick={openMessages} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><MessageSquare size={14}/>Text message</button></>}{doctor.email && <button type="button" onClick={() => setContactMode('email')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Mail size={14}/>Email</button>}</div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Call and email open your device's configured phone or mail app. App messages are delivered to the doctor's signed-in inbox.</p>
      <a href="/doctors" className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white ${available ? 'bg-sky-700 hover:bg-sky-800' : 'pointer-events-none bg-slate-400'}`} aria-disabled={!available}><CalendarDays size={14}/>{available ? 'Request an appointment' : 'Contact the clinic'}</a>
    </article>
    {contactMode && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setContactMode(''); }}><section role="dialog" aria-modal="true" aria-labelledby={`contact-title-${doctor.id}`} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id={`contact-title-${doctor.id}`} className="text-lg font-bold text-slate-900">{contactMode === 'call' ? `Call ${doctor.name}` : `Email ${doctor.name}`}</h2><p className="mt-1 text-sm text-slate-500">Choose how to continue using your device.</p></div><button type="button" onClick={() => setContactMode('')} aria-label="Close contact options" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>{contactMode === 'call' ? <><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">Doctor phone</p><p className="mt-1 text-xl font-semibold tracking-wide text-slate-900">{doctor.phone}</p></div><div className="mt-4 grid grid-cols-2 gap-2"><a href={`tel:${String(doctor.phone).replace(/[^+\d]/g, '')}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-3 text-sm font-semibold text-white hover:bg-sky-800"><Phone size={16}/>Call now</a><button type="button" onClick={() => copyContact(doctor.phone)} className="rounded-lg border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{copied ? 'Copied' : 'Copy number'}</button></div><p className="mt-3 text-xs leading-relaxed text-slate-500">If the doctor cannot answer, leave a voicemail after the call connects. Calling depends on a phone or dialer configured on your device.</p></> : <><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">Doctor email</p><p className="mt-1 break-all text-base font-semibold text-slate-900">{doctor.email}</p></div><div className="mt-4 grid grid-cols-2 gap-2"><a href={`mailto:${doctor.email}?subject=${encodeURIComponent('Patient message')}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-3 text-sm font-semibold text-white hover:bg-sky-800"><Mail size={16}/>Compose email</a><button type="button" onClick={() => copyContact(doctor.email)} className="rounded-lg border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{copied ? 'Copied' : 'Copy address'}</button></div><p className="mt-3 text-xs leading-relaxed text-slate-500">Compose opens your configured mail app. If no mail app is configured, copy the address and use webmail.</p></>}</section></div>}
    {open && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-3 sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby={`message-title-${doctor.id}`} className="flex max-h-[min(680px,calc(100vh-24px))] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4"><div><h2 id={`message-title-${doctor.id}`} className="font-bold text-slate-900">Message {doctor.name}</h2><p className="mt-1 text-xs text-slate-500">Private patient and doctor conversation</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close messages" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X size={18}/></button></header><div className="flex-1 space-y-3 overflow-y-auto bg-white p-4">{loadingThread ? <p className="py-10 text-center text-sm text-slate-500">Loading messages...</p> : thread.length ? thread.map(item => <div key={item.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${item.senderId === user?.id ? 'ml-auto bg-sky-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'}`}><p className="whitespace-pre-wrap break-words">{item.message}</p><p className={`mt-1 text-[10px] ${item.senderId === user?.id ? 'text-sky-100' : 'text-slate-400'}`}>{item.senderId === user?.id ? 'You' : doctor.name} · {new Date(item.sentAt).toLocaleString()}</p></div>) : <div className="py-10 text-center"><MessageSquare size={24} className="mx-auto text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-700">Start a conversation</p><p className="mt-1 text-xs text-slate-500">Write to the doctor about an appointment or care question.</p></div>}</div>{error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}<form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 bg-slate-50 p-3"><label className="sr-only" htmlFor={`message-input-${doctor.id}`}>Your message</label><textarea id={`message-input-${doctor.id}`} rows={2} maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write your message..." className="min-h-11 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"/><button disabled={busy || !draft.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"><Send size={15}/>{busy ? 'Sending...' : 'Send'}</button></form></section></div>}
  </>;
}
