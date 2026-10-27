import React, { useCallback, useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { Localized } from '../i18n';
import { startFacebookLogin } from '../auth/facebookLogin';

const api = (path, options = {}) => fetch(path, { ...options, headers: { ...(options.headers || {}), ...(localStorage.getItem('flowbot_token') ? { Authorization: `Bearer ${localStorage.getItem('flowbot_token')}` } : {}) } });

const dict = {
  bn: { btn: 'পেজ', title: 'আপনার Facebook পেজ', connect: '+ Facebook কানেক্ট করুন', none: 'কোনো পেজ নেই। উপরের বাটনে কানেক্ট করুন।',
    pick: 'অটোমেশন করতে একটি পেজ বেছে নিন', auto: 'অটো-রিপ্লাই', kw: 'কীওয়ার্ড (যেমন: দাম)', reply: 'রিপ্লাই মেসেজ',
    add: 'যোগ করুন', del: 'মুছুন', empty: 'এই পেজে কোনো অটো-রিপ্লাই নেই', ok: 'পেজ কানেক্ট হয়েছে ✅', fail: 'কানেক্ট হয়নি: ', close: 'বন্ধ' },
  en: { btn: 'Pages', title: 'Your Facebook Pages', connect: '+ Connect Facebook', none: 'No pages yet. Connect above.',
    pick: 'Select a page to automate', auto: 'Auto-replies', kw: 'Keyword (e.g. price)', reply: 'Reply message',
    add: 'Add', del: 'Delete', empty: 'No auto-replies for this page', ok: 'Pages connected ✅', fail: 'Connect failed: ', close: 'Close' },
};

export default function PageSelector() {
  const { t } = useLang(dict);
  const [logged, setLogged] = useState(false);
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState([]);
  const [sel, setSel] = useState(localStorage.getItem('flowbot_channel_id'));
  const [autos, setAutos] = useState([]);
  const [kw, setKw] = useState('');
  const [reply, setReply] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const c = () => setLogged(!!localStorage.getItem('flowbot_token'));
    c(); const i = setInterval(c, 1000); return () => clearInterval(i);
  }, []);

  const loadPages = useCallback(async () => {
    if (!localStorage.getItem('flowbot_token')) return;
    try {
      const response = await api('/api/pages');
      if (!response.ok) throw new Error('Could not load pages');
      const data = await response.json();
      setPages(Array.isArray(data) ? data : []);
    } catch { setPages([]); setMsg('Backend চালু নেই বা পোর্ট 5000 ঠিক নেই'); }
  }, []);

  const loadAutos = useCallback(async () => {
    if (!sel) return setAutos([]);
    try { const r = await api(`/api/pages/${sel}/automations`); setAutos(await r.json()); } catch { setAutos([]); }
  }, [sel]);

  useEffect(() => {
    const url = new URL(window.location.href);
    let handledOAuthParam = false;
    if (url.searchParams.has('connected')) { setMsg(t('ok')); setOpen(true); url.searchParams.delete('connected'); handledOAuthParam = true; }
    const connectError = url.searchParams.get('connect_error');
    if (connectError) { setMsg(t('fail') + connectError); setOpen(true); url.searchParams.delete('connect_error'); handledOAuthParam = true; }
    if (handledOAuthParam) window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  useEffect(() => { if (logged) loadPages(); }, [logged, loadPages]);
  useEffect(() => { loadAutos(); }, [loadAutos]);

  const connect = async () => {
    try { await startFacebookLogin(); }
    catch (e) { setMsg(t('fail') + (e.message || 'OAuth error')); }
  };
  const choose = (id) => { localStorage.setItem('flowbot_channel_id', String(id)); setSel(String(id)); };
  const add = async (e) => {
    e.preventDefault();
    const r = await api(`/api/pages/${sel}/automations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: kw, reply }) });
    if (r.ok) { setKw(''); setReply(''); setMsg(''); loadAutos(); } else setMsg((await r.json()).error || 'Error');
  };
  const remove = async (id) => { await api(`/api/pages/automations/${id}`, { method: 'DELETE' }); loadAutos(); };

  if (!logged) return null;
  const current = Array.isArray(pages) ? pages.find((p) => String(p.id) === String(sel)) : null;
  const input = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500';

  return (
    <Localized><>
      <button onClick={() => { setOpen(true); loadPages(); }}
        className="fixed bottom-20 left-4 z-40 bg-blue-600 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg max-w-[60vw] truncate">
        📄 {current ? current.page_name : t('btn')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-white w-full md:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl md:rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">{t('title')}</h2>
              <button onClick={() => setOpen(false)} className="text-slate-500 text-sm">{t('close')}</button>
            </div>
            {msg && <p className="text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2 break-words">{msg}</p>}
            <button onClick={connect} className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl">{t('connect')}</button>
            <div className="space-y-2">
              {pages.length === 0 && <p className="text-xs text-slate-500 text-center py-3">{t('none')}</p>}
              {pages.length > 0 && !sel && <p className="text-xs text-slate-500">{t('pick')}</p>}
              {pages.map((p) => (
                <button key={p.id} onClick={() => choose(p.id)}
                  className={`w-full text-left border rounded-xl px-4 py-3 ${String(p.id) === String(sel) ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                  <p data-no-translate className="text-sm font-semibold text-slate-800">{p.page_name}</p>
                  <p className="text-[11px] text-slate-400">ID: {p.platform_page_id}</p>
                </button>
              ))}
            </div>
            {current && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold">{t('auto')} — <span data-no-translate>{current.page_name}</span></h3>
                <form onSubmit={add} className="space-y-2">
                  <input className={input} placeholder={t('kw')} value={kw} onChange={(e) => setKw(e.target.value)} required />
                  <textarea className={input} rows={2} placeholder={t('reply')} value={reply} onChange={(e) => setReply(e.target.value)} required />
                  <button className="bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl">{t('add')}</button>
                </form>
                {autos.length === 0 && <p className="text-xs text-slate-400">{t('empty')}</p>}
                {autos.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p data-no-translate className="text-xs font-semibold text-slate-800">{a.trigger_keyword}</p>
                      <p data-no-translate className="text-xs text-slate-500 break-words">{a.flow_data?.replyText}</p>
                    </div>
                    <button onClick={() => remove(a.id)} className="text-[11px] text-red-500 font-semibold shrink-0">{t('del')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </></Localized>
  );
}
