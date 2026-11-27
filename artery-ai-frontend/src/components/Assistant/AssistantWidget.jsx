import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Mic, Send, Volume2, VolumeX, X } from 'lucide-react';
import { askAssistant, getStoredUser } from '../../services/api';

export default function AssistantWidget() {
  const user = getStoredUser();
  const isPatient = user?.role?.toLowerCase() === 'patient';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef(null);
  const [messages, setMessages] = useState([{ role: 'assistant', text: isPatient ? 'Hello. I can help you find doctors, manage appointments, send messages, and locate medicine price and pharmacy tools.' : 'Hello. I can help you find pending cases, reports, X-rays, messages, and doctors in this workspace.' }]);
  const send = async (value = text) => {
    const prompt = value.trim(); if (!prompt || busy) return;
    setMessages(old => [...old, { role: 'user', text: prompt }]); setText(''); setBusy(true);
    try {
      const result = await askAssistant(prompt);
      setMessages(old => [...old, { role: 'assistant', text: result.answer, scope: result.scope }]);
      if (speakReplies && 'speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.answer)); }
    }
    catch (error) { setMessages(old => [...old, { role: 'assistant', text: error.message || 'Assistant service is not available.' }]); }
    finally { setBusy(false); }
  };
  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceError('Voice input is not supported by this browser. You can still type your question.'); return; }
    setVoiceError('');
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || 'en-IN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
      recognition.onresult = event => { const transcript = event.results?.[0]?.[0]?.transcript || ''; setText(transcript); if (transcript.trim()) send(transcript); };
      recognition.onerror = event => { setVoiceError(event.error === 'not-allowed' ? 'Allow microphone access to use voice input.' : `Voice input stopped (${event.error}).`); setListening(false); };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition; setListening(true); recognition.start();
    } catch { setListening(false); setVoiceError('Could not start voice input. Check microphone permission.'); }
  };
  useEffect(() => () => { recognitionRef.current?.stop?.(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);
  return <>
    <button onClick={() => setOpen(true)} aria-label="Open AI assistant" className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-medical-700 text-white shadow-xl hover:bg-medical-800"><MessageCircle size={23}/></button>
    {open && <section className="fixed bottom-5 right-5 z-50 flex h-[min(580px,calc(100vh-40px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white"><div className="flex items-center gap-2"><Bot size={20}/><div><div className="text-sm font-bold">CardioCare AI Assistant</div><div className="text-[10px] text-slate-300">{isPatient ? 'Patient portal help' : 'Clinical workflow help'}</div></div></div><div className="flex items-center gap-3"><button type="button" onClick={() => { setSpeakReplies(value => !value); if (speakReplies && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }} aria-label={speakReplies ? 'Turn off spoken replies' : 'Turn on spoken replies'} title={speakReplies ? 'Spoken replies on' : 'Spoken replies off'}>{speakReplies ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button onClick={() => { recognitionRef.current?.stop?.(); setListening(false); setOpen(false); }} aria-label="Close assistant"><X size={18}/></button></div></header><div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">{messages.map((message, i) => <div key={i} className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-auto bg-sky-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><p>{message.text}</p>{message.scope && <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">{message.scope}</p>}</div>)}{busy && <div className="text-xs text-slate-500">Checking the registry…</div>}</div><div className="border-t border-slate-200 bg-white p-3"><div className="mb-2 flex flex-wrap gap-1.5">{(isPatient ? ['Find a doctor', 'My appointments', 'Medicine prices', 'Message a doctor'] : ['Pending cases?', 'Show reports', 'Find X-rays', 'Messages']).map(prompt => <button key={prompt} onClick={() => send(prompt)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50">{prompt}</button>)}</div>{voiceError && <p role="status" className="mb-2 text-[11px] text-amber-800">{voiceError}</p>}<form onSubmit={e => { e.preventDefault(); send(); }} className="flex gap-2"><input value={text} onChange={e => setText(e.target.value)} placeholder="Ask or use the microphone…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/><button type="button" onClick={listening ? () => recognitionRef.current?.stop?.() : startVoice} className={`rounded-lg border px-3 ${listening ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-700'}`} aria-label={listening ? 'Stop listening' : 'Ask by voice'} title={listening ? 'Stop listening' : 'Ask by voice'}><Mic size={16}/></button><button disabled={busy || !text.trim()} className="rounded-lg bg-medical-700 px-3 text-white disabled:opacity-40" aria-label="Send message"><Send size={16}/></button></form><p className="mt-1.5 text-[10px] text-slate-400">Voice features depend on browser support and microphone permission. No voice recording is stored by this app.</p></div></section>}
  </>;
}
