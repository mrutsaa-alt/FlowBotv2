
import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { api, loadChannels } from '../api';
import FlowBuilder from './FlowBuilder';
import { Localized } from '../i18n';
export default function AutomationView({ builderOpen = false, onBuilderOpenChange = () => {} }) {
  const [channels,setChannels]=useState([]),[channelId,setChannelId]=useState(''),[flows,setFlows]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [editingFlow,setEditingFlow]=useState(null);
  useEffect(()=>{loadChannels().then(list=>{setChannels(list);const saved=localStorage.getItem('flowbot_channel_id')||localStorage.getItem('flowbot_tg_channel');const chosen=list.find(c=>String(c.id)===String(saved))||list[0];if(chosen)setChannelId(String(chosen.id));}).catch(e=>setError(e.message));},[]);
  const reload=async id=>{if(!id)return;setLoading(true);setError('');try{const rows=await api(`/api/flows/${encodeURIComponent(id)}`);setFlows(Array.isArray(rows)?rows:[]);}catch(e){setError(e.message);setFlows([])}finally{setLoading(false)}};
  useEffect(()=>{if(channelId){localStorage.setItem('flowbot_channel_id',String(channelId));reload(channelId)}},[channelId]);
  const toggle=async id=>{try{const flow=flows.find(f=>String(f.id)===String(id));if(!flow)return;await api(`/api/flows/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({...flow,is_active:!flow.is_active})});await reload(channelId)}catch(e){setError(e.message)}};
  const remove=async id=>{if(!confirm('Delete this automation?'))return;try{await api(`/api/flows/${encodeURIComponent(id)}`,{method:'DELETE'});await reload(channelId)}catch(e){setError(e.message)}};
  const title=f=>f.name||`Flow #${f.id}`;
  const trigger=f=>f.trigger_keyword||f.trigger_type||'trigger';
  if (builderOpen) return <Localized><div className="flow-builder-view"><FlowBuilder initialChannelId={channelId} initialFlow={editingFlow} onClose={()=>{onBuilderOpenChange(false);setEditingFlow(null);reload(channelId);}} /></div></Localized>;
  return <Localized><div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="text-xs text-slate-500 mt-1">Create, manage, and publish your automations in one place.</p></div><div className="flex gap-2"><select value={channelId} onChange={e=>setChannelId(e.target.value)} className="border rounded-xl px-3 py-2 text-xs bg-white"><option value="">Select channel</option>{channels.map(c=><option data-no-translate key={c.id} value={c.id}>{c.page_name} · {c.platform}</option>)}</select><button onClick={()=>{setEditingFlow(null);onBuilderOpenChange(true);}} className="bg-blue-600 text-white rounded-xl px-4 py-2 text-xs font-semibold">＋ Create automation</button></div></div>
    {error&&<p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between"><h3 className="text-sm font-semibold">Your automations ({flows.length})</h3><button onClick={()=>reload(channelId)} disabled={!channelId||loading} className="border rounded-lg px-3 py-2 text-xs">{loading?'Loading…':'Refresh'}</button></div>
      {!channelId?<p className="p-8 text-center text-sm text-slate-500">Connect a channel to view automations.</p>:!loading&&flows.length===0?<p className="p-8 text-center text-sm text-slate-500">No saved automations for this channel yet.</p>:
      <div className="divide-y">{flows.map(f=><div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="min-w-0"><p data-no-translate className="font-semibold text-sm text-slate-800">{title(f)}</p><p className="text-xs text-slate-500 mt-1">Trigger: {trigger(f)} · Version {f.version||1}</p><p className="text-xs text-slate-400 mt-1">Updated {f.updated_at?new Date(f.updated_at).toLocaleString():f.created_at?new Date(f.created_at).toLocaleString():'—'}</p></div><div className="flex gap-2 items-center"><span className={`text-[10px] font-bold rounded-full px-2.5 py-1 ${f.is_active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{f.is_active?'PUBLISHED':'DRAFT'}</span><button onClick={()=>{setEditingFlow(f);onBuilderOpenChange(true);}} className="inline-flex items-center gap-1.5 border rounded-lg px-3 py-2 text-xs" aria-label={`Edit ${title(f)}`}><Pencil size={13}/>Edit</button><button onClick={()=>toggle(f.id)} className="border rounded-lg px-3 py-2 text-xs">{f.is_active?'Unpublish':'Publish'}</button><button onClick={()=>remove(f.id)} className="text-red-600 border border-red-100 rounded-lg px-3 py-2 text-xs">Delete</button></div></div>)}</div>}
    </div>
  </div></Localized>;
}
