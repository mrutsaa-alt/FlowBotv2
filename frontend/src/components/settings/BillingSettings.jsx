
import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Localized } from '../../i18n';
export default function BillingSettings() {
  const [workspaces,setWorkspaces]=useState([]),[workspaceId,setWorkspaceId]=useState(''),[billing,setBilling]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{api('/api/workspaces').then(rows=>{setWorkspaces(rows);if(rows[0])setWorkspaceId(String(rows[0].id));}).catch(e=>setError(e.message));},[]);
  useEffect(()=>{if(!workspaceId)return;api(`/api/workspaces/${workspaceId}/billing`).then(setBilling).catch(e=>setError(e.message));},[workspaceId]);
  const upgrade=async()=>{setBusy(true);setError('');setNotice('');try{const d=await api(`/api/workspaces/${workspaceId}/billing/checkout`,{method:'POST',body:JSON.stringify({})});if(!d.url)throw new Error('Checkout URL was not returned');window.location.href=d.url;}catch(e){setError(e.message)}finally{setBusy(false)}};
  return <Localized><div className="space-y-4 max-w-xl">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-sm">Workspace subscription</h3><select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)} className="border rounded-lg px-3 py-2 text-xs bg-white">{workspaces.map(w=><option data-no-translate key={w.id} value={w.id}>{w.name}</option>)}</select></div>
    {error&&<p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}{notice&&<p className="text-xs text-slate-600">{notice}</p>}
    <div className="p-4 border rounded-2xl flex items-center justify-between gap-4">
      <div><h4 className="font-bold text-sm">{billing?.plan_key==='pro'?'Pro Plan': 'Free Plan'}</h4><p className="text-xs text-slate-500 mt-1">Status: {billing?.status||'Loading…'}</p>{billing?.current_period_end&&<p className="text-xs text-slate-500">Renews/ends: {new Date(billing.current_period_end).toLocaleDateString()}</p>}</div>
      <button onClick={upgrade} disabled={!workspaceId||busy||!['owner','admin'].includes(workspaces.find(w=>String(w.id)===String(workspaceId))?.role)} className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl disabled:opacity-50">{busy?'Opening…':'Upgrade Pro'}</button>
    </div>
    <p className="text-xs text-slate-500">Checkout requires Stripe test/live keys, a recurring Price ID, webhook secret and success/cancel URLs on the backend. If not configured, the API returns a configuration error instead of pretending a payment succeeded.</p>
  </div></Localized>;
}
