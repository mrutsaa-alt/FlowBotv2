
import React, { useEffect, useState } from 'react';
import FacebookConnect from './FacebookConnect';
import { api, loadChannels } from '../api';
import { Localized } from '../i18n';
export default function HomeView() {
  const [channels,setChannels]=useState([]),[channelId,setChannelId]=useState(''),[stats,setStats]=useState({subscribers:0,messages:0,flows:0}),[error,setError]=useState(''),[statsLoading,setStatsLoading]=useState(false),[statsError,setStatsError]=useState('');
  useEffect(()=>{loadChannels().then(list=>{setChannels(list);const saved=localStorage.getItem('flowbot_channel_id')||localStorage.getItem('flowbot_tg_channel');const chosen=list.find(c=>String(c.id)===String(saved))||list[0];if(chosen)setChannelId(String(chosen.id));}).catch(e=>setError(e.message));},[]);
  useEffect(()=>{if(!channelId){setStats({subscribers:0,messages:0,flows:0});setStatsError('');return;}let alive=true;setStatsLoading(true);setStatsError('');api(`/api/telegram/${encodeURIComponent(channelId)}/stats`).then(data=>{if(alive)setStats(data);}).catch(e=>{if(alive)setStatsError(e.message||'Could not load channel statistics');}).finally(()=>{if(alive)setStatsLoading(false);});return()=>{alive=false};},[channelId]);
  return <Localized><div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="text-xs text-slate-500">Live counts from your connected channel.</p></div><select value={channelId} onChange={e=>{setChannelId(e.target.value);localStorage.setItem('flowbot_channel_id',e.target.value)}} className="border rounded-xl px-3 py-2 text-xs bg-white"><option value="">Select channel</option>{channels.map(c=><option key={c.id} value={c.id}>{c.page_name} · {c.platform}</option>)}</select></div>
    {error&&<p role="alert" className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-400 font-medium">Connected channels</p><h3 className="text-2xl font-bold text-slate-800 mt-1">{error?'—':channels.length}</h3></div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-400 font-medium">Active automations</p><h3 className="text-2xl font-bold text-slate-800 mt-1">{!channelId?'—':statsLoading?'…':statsError?'—':stats.flows}</h3></div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-400 font-medium">Messages stored</p><h3 className="text-2xl font-bold text-slate-800 mt-1">{!channelId?'—':statsLoading?'…':statsError?'—':stats.messages}</h3></div>
    </div>
    {statsError&&<p role="alert" className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3">Statistics could not be loaded: {statsError}</p>}
    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3"><div><h3 className="text-sm font-semibold text-slate-800">চ্যানেল কানেকশন</h3><p className="text-xs text-slate-500 mt-1">Channel counts and saved connections are loaded from your workspace.</p></div><FacebookConnect/>{channels.length>0&&<div className="space-y-2">{channels.map(c=><div key={c.id} className="p-3 bg-slate-50 border rounded-xl flex justify-between items-center text-xs"><span data-no-translate>{c.page_name}</span><span className="text-emerald-700 font-semibold"><span>{c.platform}</span> · Saved</span></div>)}</div>}</div>
  </div></Localized>;
}
