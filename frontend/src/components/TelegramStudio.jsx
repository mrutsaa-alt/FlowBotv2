import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLang, Localized, translate, useLang } from '../i18n';

const api = async (path, opts = {}) => {
  const r = await fetch('/api/telegram' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('flowbot_token') ? { Authorization: `Bearer ${localStorage.getItem('flowbot_token')}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
};

const ago = (d,lang=getLang()) => {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(String(d).endsWith('Z') ? d : d + 'Z').getTime()) / 1000);
  if (s < 60) return lang==='bn'?'এইমাত্র':'just now';
  if (s < 3600) return lang==='bn'?Math.floor(s / 60)+' মি.':Math.floor(s / 60)+' min';
  if (s < 86400) return lang==='bn'?Math.floor(s / 3600)+' ঘ.':Math.floor(s / 3600)+' hr';
  return lang==='bn'?Math.floor(s / 86400)+' দিন':Math.floor(s / 86400)+' days';
};

const input = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 bg-white';
const primary = 'bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50';
const ghost = 'bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl';
const box = 'bg-white border border-slate-200 rounded-2xl';
const Err = ({ e }) => (e ? <p className="text-xs bg-red-50 text-red-600 rounded-xl px-3 py-2 break-words">{e}</p> : null);

/* ---------- বট ---------- */
function BotsTab({ bots, cid, setCid, reload }) {
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState('');
  const connect = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const b = await api('/bots', { method: 'POST', body: { token } }); setToken(''); await reload(b.id); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const remove = async (b) => { const prompt=getLang()==='bn'?`${b.page_name} মুছে ফেলবেন? সব কন্টাক্ট ও মেসেজ মুছে যাবে।`:`Delete ${b.page_name}? All contacts and messages will be deleted.`;if (confirm(prompt)) { await api('/bots/' + b.id, { method: 'DELETE' }); reload(); } };
  const cur = bots.find((b) => b.id === cid);
  const uname = cur ? cur.page_name.replace('Telegram @', '') : '';
  return (
    <Localized><div className="space-y-4">
      <form onSubmit={connect} className={box + ' p-4 space-y-3'}>
        <h3 className="text-sm font-semibold">নতুন টেলিগ্রাম বট কানেক্ট করুন</h3>
        <p className="text-xs text-slate-500">টেলিগ্রামে @BotFather → /newbot → যে Token দেবে সেটা এখানে বসান।</p>
        <input className={input} placeholder="123456789:ABCdef..." value={token} onChange={(e) => setToken(e.target.value)} required />
        <Err e={err} />
        <button className={primary} disabled={busy}>{busy ? '...' : 'কানেক্ট করুন'}</button>
      </form>
      <div className={box + ' divide-y divide-slate-100'}>
        {bots.length === 0 && <p className="p-6 text-center text-xs text-slate-500">এখনো কোনো বট কানেক্ট করা নেই</p>}
        {bots.map((b) => (
          <div key={b.id} className="p-4 flex items-center justify-between gap-3">
            <button onClick={() => setCid(b.id)} className="text-left min-w-0">
              <p data-no-translate className="text-sm font-semibold text-slate-800">{b.id === cid ? '✅ ' : ''}{b.page_name}</p>
              <p className="text-[11px] text-slate-400">{b.id === cid ? 'বর্তমানে নির্বাচিত' : 'নির্বাচন করতে ক্লিক করুন'}</p>
            </button>
            <button onClick={() => remove(b)} className="text-[11px] text-red-500 font-semibold">মুছুন</button>
          </div>
        ))}
      </div>
      {cur && (
        <div className={box + ' p-4 space-y-2'}>
          <h3 className="text-sm font-semibold">গ্রোথ লিংক (ট্র্যাকিং সহ)</h3>
          <p className="text-xs text-slate-500">উৎসের নাম দিন (যেমন: facebook)। এই লিংক দিয়ে যারা আসবে তারা স্বয়ংক্রিয়ভাবে <b>source:নাম</b> ট্যাগ পাবে।</p>
          <input className={input} placeholder="উৎসের নাম" value={src} onChange={(e) => setSrc(e.target.value.replace(/[^\w-]/g, ''))} />
          <input readOnly onFocus={(e) => e.target.select()} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono"
            value={`https://t.me/${uname}${src ? '?start=' + src : ''}`} />
        </div>
      )}
    </div></Localized>
  );
}

/* ---------- অটোমেশন ---------- */
const blank = { name: '', trigger_type: 'keyword', trigger_keyword: '', reply: '', image_url: '', add_tag: '', buttons: [] };
function FlowsTab({ cid }) {
  const [flows, setFlows] = useState([]);
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(() => api(`/${cid}/flows`).then(setFlows).catch(() => setFlows([])), [cid]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setBtn = (i, k, v) => setF({ ...f, buttons: f.buttons.map((b, j) => (j === i ? { ...b, [k]: v } : b)) });
  const save = async (e) => {
    e.preventDefault(); setErr('');
    const buttons = f.buttons.map((b) => ({ text: b.text, ...(b.kind === 'url' ? { url: b.value } : { keyword: b.value }) }));
    try { await api(`/${cid}/flows`, { method: 'POST', body: { ...f, buttons } }); setF(blank); setOpen(false); load(); }
    catch (x) { setErr(x.message); }
  };
  const toggle = async (x) => { await api('/flows/' + x.id, { method: 'PATCH' }); load(); };
  const del = async (x) => { if (confirm('মুছে ফেলবেন?')) { await api('/flows/' + x.id, { method: 'DELETE' }); load(); } };
  const label = { keyword: 'কীওয়ার্ড', welcome: 'ওয়েলকাম (/start)', default: 'ডিফল্ট' };
  return (
    <Localized><div className="space-y-4">
      {!open && <button className={primary} onClick={() => setOpen(true)}>+ নতুন অটোমেশন</button>}
      {open && (
        <form onSubmit={save} className={box + ' p-4 space-y-3'}>
          <select className={input} value={f.trigger_type} onChange={set('trigger_type')}>
            <option value="keyword">কীওয়ার্ড মিললে</option>
            <option value="welcome">নতুন কেউ /start দিলে (ওয়েলকাম)</option>
            <option value="default">কিছুই না মিললে (ডিফল্ট)</option>
          </select>
          {f.trigger_type === 'keyword' && <input className={input} placeholder="কীওয়ার্ড (কমা দিয়ে: দাম, price, কত)" value={f.trigger_keyword} onChange={set('trigger_keyword')} required />}
          <textarea className={input} rows={3} placeholder="বটের রিপ্লাই মেসেজ" value={f.reply} onChange={set('reply')} required />
          <input className={input} placeholder="ছবির লিংক (ঐচ্ছিক, https://...jpg)" value={f.image_url} onChange={set('image_url')} />
          <div className="space-y-2">
            {f.buttons.map((b, i) => (
              <div key={i} className="flex gap-2">
                <input className={input} placeholder="বাটনের লেখা" value={b.text} onChange={(e) => setBtn(i, 'text', e.target.value)} />
                <select className="text-xs border border-slate-200 rounded-xl px-2" value={b.kind} onChange={(e) => setBtn(i, 'kind', e.target.value)}>
                  <option value="url">লিংক</option><option value="keyword">কীওয়ার্ড</option>
                </select>
                <input className={input} placeholder={b.kind === 'url' ? 'https://...' : 'যে কীওয়ার্ড চালাবে'} value={b.value} onChange={(e) => setBtn(i, 'value', e.target.value)} />
                <button type="button" onClick={() => setF({ ...f, buttons: f.buttons.filter((_, j) => j !== i) })} className="text-red-500 px-1">×</button>
              </div>
            ))}
            {f.buttons.length < 4 && <button type="button" className={ghost} onClick={() => setF({ ...f, buttons: [...f.buttons, { text: '', kind: 'url', value: '' }] })}>+ বাটন যোগ করুন</button>}
          </div>
          <input className={input} placeholder="কন্টাক্টকে যে ট্যাগ দেবেন (ঐচ্ছিক)" value={f.add_tag} onChange={set('add_tag')} />
          <Err e={err} />
          <div className="flex gap-2"><button className={primary}>সেভ করুন</button><button type="button" className={ghost} onClick={() => { setOpen(false); setF(blank); }}>বাতিল</button></div>
        </form>
      )}
      <div className={box + ' divide-y divide-slate-100'}>
        {flows.length === 0 && <p className="p-6 text-center text-xs text-slate-500">কোনো অটোমেশন নেই</p>}
        {flows.map((x) => (
          <div key={x.id} className="p-4 flex justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-blue-600 font-semibold">{label[x.trigger_type] || x.trigger_type}{x.trigger_keyword ? ': ' + x.trigger_keyword : ''}</p>
              <p data-no-translate className="text-sm text-slate-700 break-words mt-1">{x.flow_data?.replyText}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {x.flow_data?.imageUrl ? '🖼 ছবি ' : ''}{x.flow_data?.buttons?.length ? `🔘 ${x.flow_data.buttons.length}টি বাটন ` : ''}{x.flow_data?.addTag ? `🏷 ${x.flow_data.addTag}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button onClick={() => toggle(x)} className={`text-[11px] font-semibold px-3 py-1 rounded-full ${x.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{x.is_active ? 'চালু' : 'বন্ধ'}</button>
              <button onClick={() => del(x)} className="text-[11px] text-red-500 font-semibold">মুছুন</button>
            </div>
          </div>
        ))}
      </div>
    </div></Localized>
  );
}

/* ---------- লাইভ চ্যাট ---------- */
function ChatTab({ cid }) {
  const {lang}=useLang({bn:{},en:{}});
  const [chats, setChats] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const end = useRef(null);
  const loadChats = useCallback(() => api(`/${cid}/chats`).then(setChats).catch(() => {}), [cid]);
  useEffect(() => { setSel(null); loadChats(); const t = setInterval(loadChats, 5000); return () => clearInterval(t); }, [loadChats]);
  const loadMsgs = useCallback((id) => api(`/chats/${id}/messages`).then(setMsgs).catch(() => {}), []);
  useEffect(() => { if (!sel) return; loadMsgs(sel.id); const t = setInterval(() => loadMsgs(sel.id), 3000); return () => clearInterval(t); }, [sel?.id, loadMsgs]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);
  const send = async (e) => {
    e.preventDefault(); if (!text.trim()) return; setErr('');
    try { await api(`/chats/${sel.id}/send`, { method: 'POST', body: { text } }); setText(''); setSel({ ...sel, bot_paused: true }); loadMsgs(sel.id); loadChats(); }
    catch (x) { setErr(x.message); }
  };
  const pause = async () => { const p = !sel.bot_paused; await api(`/chats/${sel.id}/pause`, { method: 'PATCH', body: { paused: p } }); setSel({ ...sel, bot_paused: p }); loadChats(); };
  return (
    <Localized><div className={box + ' grid md:grid-cols-3 overflow-hidden'} style={{ height: 'calc(100vh - 170px)', minHeight: 380 }}>
      <div className={`border-r border-slate-100 overflow-y-auto ${sel ? 'hidden md:block' : ''}`}>
        {chats.length === 0 && <p className="p-6 text-center text-xs text-slate-500">কেউ বটে মেসেজ করলে এখানে দেখা যাবে</p>}
        {chats.map((c) => (
          <button key={c.id} onClick={() => setSel(c)} className={`w-full text-left p-3 border-b border-slate-50 ${sel?.id === c.id ? 'bg-blue-50' : ''}`}>
            <div className="flex justify-between gap-2"><span data-no-translate className="text-xs font-semibold truncate">{c.first_name}{c.bot_paused ? ' ⏸' : ''}</span><span className="text-[10px] text-slate-400">{ago(c.last_at,lang)}</span></div>
            <p data-no-translate className="text-xs text-slate-500 truncate">{c.last_message || '—'}</p>
          </button>
        ))}
      </div>
      <div className={`md:col-span-2 flex flex-col min-h-0 ${sel ? '' : 'hidden md:flex'}`}>
        {!sel ? <p className="m-auto text-xs text-slate-400">একটি চ্যাট বেছে নিন</p> : (
          <>
            <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0"><button onClick={() => setSel(null)} className="md:hidden text-lg px-1">←</button><span data-no-translate className="text-sm font-semibold truncate">{sel.first_name}</span></div>
              <button onClick={pause} className={`text-[11px] font-semibold px-3 py-1.5 rounded-full ${sel.bot_paused ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{sel.bot_paused ? '⏸ বট বন্ধ (চালু করুন)' : '🤖 বট চালু'}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {msgs.map((m) => (
                <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs whitespace-pre-wrap break-words ${m.sender_type === 'subscriber' ? 'bg-slate-100' : m.sender_type === 'bot' ? 'bg-emerald-600 text-white ml-auto' : 'bg-blue-600 text-white ml-auto'}`}>
                  <span data-no-translate>{m.message_text}</span><div className="text-[9px] opacity-60 mt-1">{m.sender_type === 'bot' ? 'বট' : m.sender_type === 'admin' ? 'আপনি' : ''}</div>
                </div>
              ))}
              <div ref={end} />
            </div>
            <form onSubmit={send} className="p-3 border-t border-slate-100 space-y-2">
              <Err e={err} />
              <div className="flex gap-2"><input className={input} placeholder="মেসেজ লিখুন (পাঠালে বট বন্ধ হবে)" value={text} onChange={(e) => setText(e.target.value)} /><button className={primary}>পাঠান</button></div>
            </form>
          </>
        )}
      </div>
    </div></Localized>
  );
}

/* ---------- কন্টাক্ট ---------- */
function ContactsTab({ cid }) {
  const [list, setList] = useState([]);
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [qs, setQs] = useState('');
  const load = useCallback(async () => { setList(await api(`/${cid}/contacts`)); setTags(await api(`/${cid}/tags`)); }, [cid]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const addTag = async (e) => { e.preventDefault(); if (!name.trim()) return; await api(`/${cid}/tags`, { method: 'POST', body: { name } }); setName(''); load(); };
  const assign = async (sid, tid) => { if (tid) { await api(`/contacts/${sid}/tags`, { method: 'POST', body: { tag_id: Number(tid) } }); load(); } };
  const unassign = async (sid, tid) => { await api(`/contacts/${sid}/tags/${tid}`, { method: 'DELETE' }); load(); };
  const delTag = async (id) => { if (confirm(translate('ট্যাগ মুছবেন?',getLang()))) { await api('/tags/' + id, { method: 'DELETE' }); load(); } };
  const shown = list.filter((c) => (c.first_name || '').toLowerCase().includes(qs.toLowerCase()));
  return (
    <Localized><div className="space-y-4">
      <div className={box + ' p-4 space-y-3'}>
        <form onSubmit={addTag} className="flex gap-2"><input className={input} placeholder="নতুন ট্যাগ" value={name} onChange={(e) => setName(e.target.value)} /><button className={primary}>যোগ</button></form>
        <div className="flex flex-wrap gap-2">{tags.map((t) => <span key={t.id} className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full">{t.name} <button onClick={() => delTag(t.id)} className="opacity-60">×</button></span>)}</div>
      </div>
      <div className={box}>
        <div className="p-4 border-b border-slate-100 flex justify-between gap-3"><h3 className="text-sm font-semibold">কন্টাক্ট ({shown.length})</h3><input className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-36" placeholder="খুঁজুন" value={qs} onChange={(e) => setQs(e.target.value)} /></div>
        {shown.length === 0 && <p className="p-6 text-center text-xs text-slate-500">কোনো কন্টাক্ট নেই</p>}
        {shown.map((c) => (
          <div key={c.id} className="p-4 border-b border-slate-50 flex flex-wrap justify-between gap-2">
            <div><p data-no-translate className="text-sm font-semibold">{c.first_name}</p>
              <div className="flex flex-wrap gap-1 mt-1">{c.tags.map((t) => <button data-no-translate key={t.id} onClick={() => unassign(c.id, t.id)} className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{t.name} ×</button>)}</div></div>
            <select className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" value="" onChange={(e) => assign(c.id, e.target.value)}>
              <option value="">+ ট্যাগ</option>{tags.filter((t) => !c.tags.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div></Localized>
  );
}

/* ---------- ব্রডকাস্ট ---------- */
function BroadcastTab({ cid }) {
  const [list, setList] = useState([]);
  const [tags, setTags] = useState([]);
  const [f, setF] = useState({ name: '', message: '', tag_id: '' });
  const [err, setErr] = useState('');
  const load = useCallback(() => api(`/${cid}/broadcasts`).then(setList).catch(() => {}), [cid]);
  useEffect(() => { load(); api(`/${cid}/tags`).then(setTags).catch(() => {}); const t = setInterval(load, 5000); return () => clearInterval(t); }, [cid, load]);
  const send = async (e) => {
    e.preventDefault(); setErr('');
    if (!confirm(translate('এখনই সবার কাছে পাঠাবেন?',getLang()))) return;
    try { await api(`/${cid}/broadcasts`, { method: 'POST', body: { ...f, tag_id: f.tag_id || null } }); setF({ name: '', message: '', tag_id: '' }); load(); } catch (x) { setErr(x.message); }
  };
  return (
    <Localized><div className="space-y-4">
      <form onSubmit={send} className={box + ' p-4 space-y-3'}>
        <h3 className="text-sm font-semibold">নতুন ব্রডকাস্ট</h3>
        <input className={input} placeholder="ক্যাম্পেইনের নাম" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <textarea className={input} rows={3} placeholder="মেসেজ" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required />
        <select className={input} value={f.tag_id} onChange={(e) => setF({ ...f, tag_id: e.target.value })}><option value="">সব কন্টাক্ট</option>{tags.map((t) => <option key={t.id} value={t.id}>ট্যাগ: {t.name}</option>)}</select>
        <Err e={err} /><button className={primary}>পাঠান</button>
      </form>
      <div className={box + ' divide-y divide-slate-100'}>
        {list.length === 0 && <p className="p-6 text-center text-xs text-slate-500">এখনো কোনো ব্রডকাস্ট নেই</p>}
        {list.map((b) => (
          <div key={b.id} className="p-4"><div className="flex justify-between"><p className="text-sm font-semibold">{b.name}</p><span className={`text-[11px] font-semibold ${b.status === 'done' ? 'text-emerald-600' : 'text-amber-600'}`}>{b.status === 'done' ? 'সম্পন্ন' : 'পাঠানো হচ্ছে...'}</span></div>
            <p className="text-xs text-slate-500 truncate">{b.message_text}</p><p className="text-[11px] text-slate-400 mt-1">✅ {b.sent_count} • ❌ {b.failed_count}</p></div>
        ))}
      </div>
    </div></Localized>
  );
}

/* ---------- মূল স্টুডিও ---------- */
const TABS = [['bots', '🤖 বট'], ['flows', '⚡ অটোমেশন'], ['chat', '💬 লাইভ চ্যাট'], ['contacts', '👥 কন্টাক্ট'], ['broadcast', '📣 ব্রডকাস্ট']];

export default function TelegramStudio() {
  const [logged, setLogged] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('bots');
  const [bots, setBots] = useState([]);
  const [cid, setCidState] = useState(Number(localStorage.getItem('flowbot_tg_channel')) || null);
  const [stats, setStats] = useState(null);

  useEffect(() => { const c = () => setLogged(!!localStorage.getItem('google_access_token')); c(); const i = setInterval(c, 1000); return () => clearInterval(i); }, []);
  const setCid = (id) => { localStorage.setItem('flowbot_tg_channel', String(id)); setCidState(id); };
  const reload = useCallback(async (pick) => {
    const list = await api('/bots').catch(() => []);
    setBots(list);
    const want = pick || cid;
    if (list.length && !list.some((b) => b.id === want)) setCid(list[0].id);
    else if (pick) setCid(pick);
  }, [cid]);
  useEffect(() => { if (open) reload(); }, [open]);
  useEffect(() => { if (open && cid) api(`/${cid}/stats`).then(setStats).catch(() => setStats(null)); }, [open, cid, tab]);

  if (!logged) return null;
  const need = tab !== 'bots' && !cid;
  return (
    <Localized><>
      <button onClick={() => setOpen(true)} className="fixed bottom-32 left-4 z-40 bg-sky-500 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg">✈️ Telegram</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <div><p className="font-bold text-slate-900 text-sm">✈️ Telegram স্টুডিও</p>
              {stats && <p className="text-[11px] text-slate-500">👥 {stats.subscribers} • 💬 {stats.messages} • ⚡ {stats.flows} সক্রিয়</p>}</div>
            <button onClick={() => setOpen(false)} className="text-sm text-slate-500">বন্ধ</button>
          </div>
          <div className="bg-white border-b border-slate-200 flex overflow-x-auto">
            {TABS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>{label}</button>)}
          </div>
          <div className="flex-1 overflow-y-auto p-4 max-w-4xl w-full mx-auto">
            {tab === 'bots' && <BotsTab bots={bots} cid={cid} setCid={setCid} reload={reload} />}
            {need && <p className="text-center text-sm text-slate-500 py-10">আগে "🤖 বট" ট্যাবে একটি বট কানেক্ট করুন</p>}
            {!need && tab === 'flows' && <FlowsTab key={cid} cid={cid} />}
            {!need && tab === 'chat' && <ChatTab key={cid} cid={cid} />}
            {!need && tab === 'contacts' && <ContactsTab key={cid} cid={cid} />}
            {!need && tab === 'broadcast' && <BroadcastTab key={cid} cid={cid} />}
          </div>
        </div>
      )}
    </></Localized>
  );
}
