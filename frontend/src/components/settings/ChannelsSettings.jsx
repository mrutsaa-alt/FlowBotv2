import React, { useEffect, useState } from 'react';
import { api, loadChannels } from '../../api';
import { Localized, translate, useLang } from '../../i18n';

export default function ChannelsSettings({ tab }) {
  const {lang}=useLang({bn:{},en:{}});
  const [channels, setChannels] = useState([]);
  const platformFromTab = value => String(value || 'facebook').toLowerCase().includes('whatsapp') ? 'whatsapp' : String(value || '').toLowerCase().includes('instagram') ? 'instagram' : 'facebook';
  const [platform, setPlatform] = useState(() => platformFromTab(tab));
  const [platformId, setPlatformId] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reload = async () => { try { setChannels(await loadChannels()); } catch (e) { setError(e.message); } };
  useEffect(() => { setPlatform(platformFromTab(tab)); }, [tab]);
  useEffect(() => { reload(); }, []);
  const connect = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (platform === 'facebook') {
        const data = await api('/api/facebook/oauth-url');
        if (!data.url) throw new Error('Facebook OAuth URL was not returned');
        window.location.assign(data.url); return;
      }
      const data = await api('/api/channels/meta', { method: 'POST', body: JSON.stringify({ platform, platform_id: platformId.trim(), access_token: token.trim(), name: name.trim() || undefined }) });
      setNotice(`${data.page_name || data.platform} connected successfully.`); setPlatformId(''); setName(''); setToken(''); await reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const disconnect = async (id) => {
    setDisconnecting(String(id)); setError(''); setNotice('');
    try { await api(`/api/channels/${id}`, { method: 'DELETE' }); await reload(); setNotice('Channel disconnected.'); }
    catch (e) { setError(e.message); }
    finally { setDisconnecting(''); }
  };
  const relevant = channels.filter(c => c.platform === platform);
  return <Localized><div className="space-y-4 max-w-2xl">
    <div className="rounded-2xl border bg-white p-4 space-y-3">
      <h3 className="font-bold text-sm text-slate-800">Channel connections</h3>
      <p className="text-xs text-slate-500">Connect a real provider account. Tokens are submitted to the backend and should never be pasted into public chats or committed to source control.</p>
      <label className="block text-xs font-medium text-slate-600">Platform<select value={platform} onChange={e=>setPlatform(e.target.value)} className="mt-1 w-full border rounded-xl p-2.5 bg-white"><option value="facebook">Facebook Page (OAuth)</option><option value="instagram">Instagram Professional account</option><option value="whatsapp">WhatsApp Cloud API phone number</option></select></label>
      {platform !== 'facebook' && <form onSubmit={connect} className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">{platform === 'whatsapp' ? 'Phone Number ID' : 'Instagram Professional Account ID'}<input required value={platformId} onChange={e=>setPlatformId(e.target.value)} maxLength={255} className="mt-1 w-full border rounded-xl p-2.5" placeholder={platform === 'whatsapp' ? 'Meta WhatsApp Phone Number ID' : 'Instagram account ID'} /></label>
        <label className="block text-xs font-medium text-slate-600">Display name (optional)<input value={name} onChange={e=>setName(e.target.value)} maxLength={255} className="mt-1 w-full border rounded-xl p-2.5" /></label>
        <label className="block text-xs font-medium text-slate-600">Access token<input required type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} maxLength={4096} className="mt-1 w-full border rounded-xl p-2.5 font-mono" /></label>
        <button disabled={busy} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Validating…' : `Connect ${platform}`}</button>
      </form>}
      {platform === 'facebook' && <button onClick={connect} disabled={busy} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">Connect Facebook Page with OAuth</button>}
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg">{notice}</p>}
    </div>
    <div className="rounded-2xl border bg-white p-4 space-y-3"><h4 className="font-bold text-sm">Connected {platform} accounts</h4>
      {relevant.length === 0 ? <p className="text-sm text-slate-500">{lang==='bn'?`কোনো ${translate(platform,lang)} অ্যাকাউন্ট সংযুক্ত নেই।`:`No ${platform} accounts connected.`}</p> : relevant.map(c=><div key={c.id} className="flex items-center justify-between gap-3 border rounded-xl p-3"><div><p data-no-translate className="text-sm font-semibold">{c.page_name}</p><p className="text-xs text-slate-500"><span data-no-translate>{c.platform}</span> · ID {c.platform_page_id}</p></div><button disabled={disconnecting===String(c.id)} onClick={()=>disconnect(c.id)} className="text-xs text-red-700 border border-red-200 rounded-lg px-3 py-2 disabled:opacity-50">{disconnecting===String(c.id)?(lang==='bn'?'বিচ্ছিন্ন হচ্ছে…':'Disconnecting…'):(lang==='bn'?'সংযোগ বিচ্ছিন্ন করুন':'Disconnect')}</button></div>)}
    </div>
    <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3">Provider permissions, Meta app review, webhook subscriptions and policy eligibility must be configured in Meta. A saved connection does not guarantee live delivery.</p>
    </div></Localized>
}
