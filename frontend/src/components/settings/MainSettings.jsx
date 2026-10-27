
import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Localized } from '../../i18n';

export default function MainSettings({ tab }) {
  const [config,setConfig] = useState({facebookAppId:'',webhookUrl:'',facebookConfigured:false,telegramConfigured:false});
  const [workspaces,setWorkspaces]=useState([]),[workspaceId,setWorkspaceId]=useState('');
  const [members,setMembers]=useState([]),[logs,setLogs]=useState([]);
  const [email,setEmail]=useState(''),[role,setRole]=useState('agent'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const refreshWorkspace=async id=>{
    if(!id)return;
    if(tab==='Team Members')setMembers(await api(`/api/workspaces/${id}/members`));
    if(tab==='Logs')setLogs(await api(`/api/workspaces/${id}/audit?limit=100`));
  };
  useEffect(() => {
    let alive=true;
    fetch('/api/public-config').then(r=>r.json()).then(d=>{if(alive)setConfig(d);}).catch(()=>{});
    api('/api/workspaces').then(rows=>{if(!alive)return;setWorkspaces(rows);if(rows[0])setWorkspaceId(String(rows[0].id));}).catch(e=>{if(alive)setError(e.message)});
    return ()=>{alive=false;};
  }, []);
  useEffect(()=>{refreshWorkspace(workspaceId).catch(e=>setError(e.message));},[workspaceId,tab]);
  const addMember=async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{await api(`/api/workspaces/${workspaceId}/members`,{method:'POST',body:JSON.stringify({email,role})});setEmail('');setNotice('Member added.');await refreshWorkspace(workspaceId);}catch(e){setError(e.message)}finally{setBusy(false)}};
  const removeMember=async id=>{if(!confirm('Remove this workspace member?'))return;try{await api(`/api/workspaces/${workspaceId}/members/${id}`,{method:'DELETE'});await refreshWorkspace(workspaceId)}catch(e){setError(e.message)}};
  if (tab === 'General') {
    return <Localized><div className="space-y-4 max-w-xl">
      <div><label className="text-xs font-medium text-slate-600 block mb-1">Meta App ID</label><input type="text" readOnly value={config.facebookAppId || 'Backend environment not configured'} className="w-full text-xs bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-slate-500 font-mono" /></div>
      <div><label className="text-xs font-medium text-slate-600 block mb-1">Webhook URL (Meta Developer Console)</label><input type="text" readOnly value={config.webhookUrl || 'Set BACKEND_URL on the backend'} className="w-full text-xs bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-slate-500 font-mono" /></div>
      <div className="text-xs rounded-xl border p-3 space-y-1"><p>Meta OAuth/webhook: <strong>{config.facebookConfigured ? 'Environment configured' : 'Needs backend credentials'}</strong></p><p>Telegram login widget: <strong>{config.telegramConfigured ? 'Token configured' : 'Optional token not configured'}</strong></p></div>
      <p className="text-xs text-slate-500">Secrets must be configured on the backend host. This screen does not expose secret values.</p>
    </div></Localized>;
  }
  if(tab==='Team Members')return <Localized><div className="space-y-4 max-w-2xl">
    <div className="flex gap-3 items-center"><label className="text-xs">Workspace</label><select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)} className="border rounded-lg px-3 py-2 text-xs">{workspaces.map(w=><option data-no-translate key={w.id} value={w.id}>{w.name} · {w.role}</option>)}</select></div>
    {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}{notice&&<p className="text-xs text-emerald-700">{notice}</p>}
    <form onSubmit={addMember} className="flex flex-col sm:flex-row gap-2"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Existing user's email" className="flex-1 border rounded-lg px-3 py-2 text-xs"/><select value={role} onChange={e=>setRole(e.target.value)} className="border rounded-lg px-3 py-2 text-xs"><option value="agent">Agent</option><option value="viewer">Viewer</option><option value="admin">Admin (owner only)</option></select><button disabled={busy||!workspaceId} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-xs disabled:opacity-50">{busy?'Saving…':'Add member'}</button></form>
    <div className="divide-y border rounded-xl">{members.map(m=><div key={m.id} className="p-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold" data-no-translate>{m.name}</p><p className="text-xs text-slate-500"><span data-no-translate>{m.email}</span> · <span data-no-translate>{m.role}</span></p></div>{m.role!=='owner'&&<button onClick={()=>removeMember(m.id)} className="text-xs text-red-600">Remove</button>}</div>)}</div>
    <p className="text-xs text-slate-500">Members must already have a FlowBot account. Viewer is read-only; owner/admin permissions are enforced by the API.</p>
  </div></Localized>;
  if(tab==='Logs')return <Localized><div className="space-y-3">
    <div className="flex gap-3 items-center"><label className="text-xs">Workspace</label><select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)} className="border rounded-lg px-3 py-2 text-xs">{workspaces.map(w=><option data-no-translate key={w.id} value={w.id}>{w.name} · {w.role}</option>)}</select></div>
    {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
    <div className="border rounded-xl divide-y">{logs.map(log=><div key={log.id} className="p-3"><p className="text-xs font-semibold">{log.action}</p><p className="text-[11px] text-slate-500">{log.resource_type||'resource'} {log.resource_id||''} · {log.created_at?new Date(log.created_at).toLocaleString():''}</p><pre className="text-[10px] text-slate-400 whitespace-pre-wrap">{JSON.stringify(log.metadata||{})}</pre></div>)}{!logs.length&&<p className="p-4 text-xs text-slate-500">No audit events yet.</p>}</div>
  </div></Localized>;
  return <Localized><div className="py-12 text-center space-y-2"><div className="text-3xl">🛠️</div><h4 className="font-bold text-sm text-slate-700">{tab} সেকশন</h4><p className="text-xs text-slate-400 max-w-sm mx-auto">এই সেকশনের live configuration এখনও provider-specific setup চায়।</p></div></Localized>;
}
