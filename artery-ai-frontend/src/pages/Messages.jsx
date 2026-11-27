import React, { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import { getMessageThread, getMessageThreads, getStoredUser, sendPatientMessage } from '../services/api';

export default function Messages() {
  const user = getStoredUser();
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshThreads = async () => {
    setError('');
    try { const rows = await getMessageThreads(); setThreads(rows); }
    catch (e) { setError(e.message || 'Could not load your messages.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refreshThreads(); }, []);

  const openThread = async id => {
    setActiveId(id); setMessages([]); setError('');
    try { setMessages(await getMessageThread(id)); }
    catch (e) { setError(e.message || 'Could not open this conversation.'); }
  };

  const active = threads.find(item => item.userId === activeId);
  const send = async event => {
    event.preventDefault();
    if (!activeId || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const result = await sendPatientMessage(activeId, draft.trim());
      setMessages(current => [...current, result]); setDraft(''); await refreshThreads();
    } catch (e) { setError(e.message || 'Message could not be sent.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Secure patient and doctor inbox</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Messages</h1><p className="mt-1 text-sm text-slate-600">Private conversations connected to your account.</p></div><button type="button" onClick={() => { refreshThreads(); if (activeId) openThread(activeId); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={16}/>Refresh</button></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[280px_1fr]">
      <aside className="border-b border-slate-200 md:border-b-0 md:border-r"><div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Conversations</div>{loading ? <p className="p-5 text-sm text-slate-500">Loading messages...</p> : threads.length ? <div className="max-h-[460px] overflow-y-auto">{threads.map(item => <button type="button" key={item.userId} onClick={() => openThread(item.userId)} className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${activeId === item.userId ? 'bg-sky-50' : ''}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-900">{item.name}</span>{item.unread > 0 && <span className="rounded-full bg-sky-700 px-2 py-0.5 text-[10px] font-bold text-white">{item.unread}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{item.lastMessage}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(item.sentAt).toLocaleString()}</p></button>)}</div> : <div className="p-5 text-center"><MessageSquare className="mx-auto text-slate-300" size={22}/><p className="mt-2 text-sm font-semibold text-slate-700">No conversations yet</p><p className="mt-1 text-xs text-slate-500">Patients can start a conversation from the doctor directory.</p></div>}</aside>
      <section className="flex min-h-[460px] flex-col"><div className="border-b border-slate-100 px-5 py-3"><p className="text-sm font-bold text-slate-900">{active?.name || 'Select a conversation'}</p><p className="text-xs text-slate-500">{active ? 'Patient and clinician messages' : 'Messages stay linked to the signed-in patient and doctor accounts.'}</p></div>{activeId ? <><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.length ? messages.map(item => <div key={item.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${item.senderId === user?.id ? 'ml-auto bg-sky-700 text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'}`}><p className="whitespace-pre-wrap break-words">{item.message}</p><p className={`mt-1 text-[10px] ${item.senderId === user?.id ? 'text-sky-100' : 'text-slate-400'}`}>{item.senderId === user?.id ? 'You' : item.senderName} · {new Date(item.sentAt).toLocaleString()}</p></div>) : <p className="py-10 text-center text-sm text-slate-500">No messages in this conversation yet.</p>}</div><form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 bg-slate-50 p-3"><label htmlFor="message-reply" className="sr-only">Write a message</label><textarea id="message-reply" rows={2} maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message..." className="min-h-11 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"/><button disabled={busy || !draft.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Send size={15}/>{busy ? 'Sending...' : 'Send'}</button></form></> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400"><MessageSquare size={34}/><p className="mt-3 text-sm font-semibold text-slate-600">Your messages will appear here</p><p className="mt-1 max-w-sm text-xs text-slate-500">Select a conversation from the list to read and reply.</p></div>}</section>
    </div>
    <p className="text-[11px] text-slate-500">Do not use messages for emergencies. Contact local emergency services for urgent care.</p>
  </div>;
}
