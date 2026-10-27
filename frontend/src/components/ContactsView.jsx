
import React, { useEffect, useMemo, useState } from 'react';
import { api, loadChannels } from '../api';
import { Localized } from '../i18n';
export default function ContactsView({ onOpenConversation }) {
  const [channels,setChannels]=useState([]);
  const [channelId,setChannelId]=useState('');
  const [contacts,setContacts]=useState([]);
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [copiedId,setCopiedId]=useState('');
  const [importing,setImporting]=useState(false);
  const [importNotice,setImportNotice]=useState('');
  const [importFileKey,setImportFileKey]=useState(0);
  useEffect(()=>{loadChannels().then(list=>{setChannels(list);const saved=localStorage.getItem('flowbot_channel_id')||localStorage.getItem('flowbot_tg_channel');const chosen=list.find(c=>String(c.id)===String(saved))||list[0];if(chosen)setChannelId(String(chosen.id));}).catch(e=>setError(e.message));},[]);
  useEffect(()=>{if(!channelId)return;let alive=true;setLoading(true);setError('');api(`/api/telegram/${encodeURIComponent(channelId)}/contacts`).then(data=>{if(alive)setContacts(Array.isArray(data)?data:[]);}).catch(e=>{if(alive){setContacts([]);setError(e.message);}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false};},[channelId]);
  const selected=channels.find(c=>String(c.id)===String(channelId));
  const copyContactId=async(event,id)=>{event.stopPropagation();try{await navigator.clipboard.writeText(String(id));setCopiedId(String(id));window.setTimeout(()=>setCopiedId(current=>current===String(id)?'':''),1500);}catch{setError('কন্টাক্ট ID কপি করা যায়নি।')}};
  const setMarketingOptIn=async (contact,optedIn)=>{setError('');try{const result=await api(`/api/channels/${channelId}/contacts/${contact.id}/marketing-opt-in`,{method:'PATCH',body:JSON.stringify({opted_in:optedIn})});setContacts(old=>old.map(c=>c.id===contact.id?{...c,marketing_opt_in:result.marketing_opt_in}:c));}catch(e){setError(e.message);}};
  const filtered=useMemo(()=>contacts.filter(c=>`${c.first_name||''} ${c.last_name||''} ${c.psid||''}`.toLowerCase().includes(search.toLowerCase())),[contacts,search]);
  const parseCsv = (text) => {
    const rows=[]; let row=[], cell='', quoted=false;
    for(let i=0;i<text.length;i++) { const ch=text[i]; if(ch==='"' && quoted && text[i+1]==='"'){cell+='"';i++;} else if(ch==='"'){quoted=!quoted;} else if(ch===','&&!quoted){row.push(cell.trim());cell='';} else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';} else cell+=ch; }
    row.push(cell.trim()); if(row.some(Boolean))rows.push(row);
    if(rows.length<2) throw new Error('CSV must contain a header row and at least one contact.');
    const headers=rows.shift().map(h=>h.toLowerCase().replace(/[\s-]+/g,'_'));
    return rows.slice(0,1000).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||'']))).filter(r=>r.psid||r.id);
  };
  const importContacts = async (event) => {
    const file=event.target.files?.[0]; if(!file)return;
    setError('');setImportNotice('');
    if(!channelId){setError('CSV import করার আগে একটি channel নির্বাচন করুন।');event.target.value='';return;}
    if(file.size>800*1024){setError('CSV file must be 800 KB or smaller per import batch.');event.target.value='';return;}
    setImporting(true);
    try {
      const parsed=parseCsv(await file.text());
      if(!parsed.length)throw new Error('No rows with psid or id were found. This import targets channel contacts, not email-only CRM leads.');
      const result=await api(`/api/channels/${encodeURIComponent(channelId)}/contacts/import`,{method:'POST',body:JSON.stringify({contacts:parsed})});
      setImportNotice(`${result.imported} contacts imported/updated${result.skipped?`, ${result.skipped} skipped`:''}.`);
      const refreshed=await api(`/api/telegram/${encodeURIComponent(channelId)}/contacts`);setContacts(Array.isArray(refreshed)?refreshed:[]);
    } catch(e){setError(e.message||'Contact import failed.');} finally{setImporting(false);setImportFileKey(k=>k+1);}
  };

  return <Localized><div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
      <div><h3 className="text-sm font-semibold text-slate-800">সকল লিড ও কন্টাক্ট ({filtered.length})</h3><p className="text-[11px] text-slate-500 mt-1">CSV header: psid (or id), first_name, last_name</p></div>
      <div className="flex flex-wrap gap-2">
        <label className={`text-xs border rounded-lg px-3 py-2 cursor-pointer ${importing?'opacity-50 pointer-events-none':'hover:bg-slate-50'}`}><input key={importFileKey} type="file" accept=".csv,text/csv" className="hidden" onChange={importContacts} disabled={importing}/>{importing?'Importing…':'Import CSV'}</label>
        <select value={channelId} onChange={e=>setChannelId(e.target.value)} className="text-xs border rounded-lg px-2 py-2 bg-white"><option value="">Select channel</option>{channels.map(c=><option data-no-translate key={c.id} value={c.id}>{c.page_name} · {c.platform||'channel'}</option>)}</select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contact..." className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg outline-none"/>
      </div>
    </div>
    {error&&<p role="alert" className="p-4 text-sm text-red-600">{error}</p>}
    {importNotice&&<p role="status" className="mx-4 mt-3 text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">{importNotice}</p>}
    {loading?<p className="p-8 text-center text-sm text-slate-500">Loading contacts…</p>:filtered.length===0?<p className="p-8 text-center text-sm text-slate-500">No contacts found for this channel.</p>:
      <div className="divide-y divide-slate-100">{filtered.map(c=><div key={c.id} role="button" tabIndex={0} aria-label={`Open conversation with ${[c.first_name,c.last_name].filter(Boolean).join(' ')||c.psid}`} onClick={()=>onOpenConversation?.({channelId,subscriberId:c.id})} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpenConversation?.({channelId,subscriberId:c.id});}}} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
        <div className="flex items-center gap-3 min-w-0"><div className="w-9 h-9 shrink-0 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm">{(c.first_name||'U').charAt(0).toUpperCase()}</div><div className="min-w-0"><p data-no-translate className="font-semibold text-slate-800 text-sm truncate">{[c.first_name,c.last_name].filter(Boolean).join(' ')||'Subscriber'}</p><p className="text-xs text-slate-400 truncate">ID: <span onClick={event=>copyContactId(event,c.psid)} title="Copy contact ID" className="text-blue-600 cursor-copy hover:underline">{copiedId===String(c.psid)?'Copied!':<span data-no-translate>{c.psid}</span>}</span> · Added {c.created_at?new Date(c.created_at).toLocaleDateString():'—'}</p>{Array.isArray(c.tags)&&<div className="flex gap-1 flex-wrap mt-1">{c.tags.map(t=><span data-no-translate key={t.id} className="text-[10px] bg-slate-100 rounded px-1.5 py-0.5">{t.name}</span>)}</div>}</div></div><div className="flex items-center gap-2 shrink-0" onClick={e=>e.stopPropagation()}><span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full">{c.status||'active'}</span>{selected?.platform==='whatsapp'&&<label className="flex items-center gap-1 text-[10px] text-slate-600"><input type="checkbox" checked={!!c.marketing_opt_in} onChange={e=>setMarketingOptIn(c,e.target.checked)}/> Marketing opt-in</label>}</div>
      </div>)}</div>}
  </div></Localized>;
}
