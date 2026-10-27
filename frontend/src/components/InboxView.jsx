
import React, { useEffect, useRef, useState } from 'react';
import { api, loadChannels } from '../api';
import { Localized } from '../i18n';
export default function InboxView({ initialConversation }) {
  const [channels,setChannels]=useState([]),[channelId,setChannelId]=useState(''),[subscribers,setSubscribers]=useState([]),[subscriberId,setSubscriberId]=useState(''),[messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const messageListRef=useRef(null),lastMessageId=useRef(null);
  useEffect(()=>{loadChannels().then(list=>{setChannels(list);const saved=localStorage.getItem('flowbot_channel_id')||localStorage.getItem('flowbot_tg_channel');const chosen=list.find(c=>String(c.id)===String(initialConversation?.channelId))||list.find(c=>String(c.id)===String(saved))||list[0];if(chosen){setChannelId(String(chosen.id));if(String(chosen.id)===String(initialConversation?.channelId)&&initialConversation?.subscriberId)setSubscriberId(String(initialConversation.subscriberId));}}).catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    if(!channelId)return;
    let alive=true,loading=false;
    const refresh=async()=>{
      if(loading)return;
      loading=true;
      try{
        const rows=await api(`/api/chat/subscribers/${encodeURIComponent(channelId)}`);
        if(!alive)return;
        setSubscribers(rows);
        if(!rows.length){setSubscriberId('');setMessages([]);}
        else setSubscriberId(current=>rows.some(s=>String(s.id)===current)?current:String(rows[0].id));
      }catch(e){if(alive)setError(e.message)}
      finally{loading=false}
    };
    refresh();
    const timer=window.setInterval(refresh,3000);
    return()=>{alive=false;window.clearInterval(timer)};
  },[channelId]);
  useEffect(()=>{
    if(!subscriberId){setMessages([]);return}
    let alive=true,loading=false;
    const refresh=async()=>{
      if(loading)return;
      loading=true;
      try{const rows=await api(`/api/chat/messages/${encodeURIComponent(subscriberId)}`);if(alive)setMessages(rows)}
      catch(e){if(alive)setError(e.message)}
      finally{loading=false}
    };
    refresh();
    const timer=window.setInterval(refresh,2000);
    return()=>{alive=false;window.clearInterval(timer)};
  },[subscriberId]);
  useEffect(()=>{
    const latest=messages[messages.length-1];
    if(!latest||latest.id===lastMessageId.current)return;
    messageListRef.current?.scrollTo({top:messageListRef.current.scrollHeight,behavior:lastMessageId.current===null?'auto':'smooth'});
    lastMessageId.current=latest.id;
  },[messages]);
  const send=async e=>{e.preventDefault();if(!draft.trim()||!subscriberId||!channelId)return;setBusy(true);setError('');try{await api('/api/chat/send',{method:'POST',body:JSON.stringify({channel_id:Number(channelId),subscriber_id:Number(subscriberId),message_text:draft.trim()})});setDraft('');setMessages(await api(`/api/chat/messages/${subscriberId}`));setSubscribers(await api(`/api/chat/subscribers/${channelId}`));}catch(x){setError(x.message)}finally{setBusy(false)}};
  const active=subscribers.find(s=>String(s.id)===String(subscriberId));
  return <Localized><div className="inbox-shell grid grid-cols-1 md:grid-cols-[280px_1fr] bg-white rounded-2xl border border-slate-200 overflow-hidden">
    <aside className="inbox-sidebar border-b md:border-b-0 md:border-r border-slate-200">
      <div className="p-3 border-b"><label className="text-xs text-slate-500 block mb-1">Channel</label><select value={channelId} onChange={e=>setChannelId(e.target.value)} className="w-full border rounded-lg p-2 text-sm"><option value="">Select channel</option>{channels.map(c=><option data-no-translate key={c.id} value={c.id}>{c.page_name} · {c.platform}</option>)}</select></div>
      <div className="inbox-conversations">{subscribers.map(s=><button key={s.id} onClick={()=>setSubscriberId(String(s.id))} className={`w-full text-left p-3 border-b hover:bg-slate-50 ${String(s.id)===String(subscriberId)?'bg-blue-50':''}`}><p data-no-translate className="text-sm font-semibold truncate">{[s.first_name,s.last_name].filter(Boolean).join(' ')||s.psid}</p><p data-no-translate className="text-xs text-slate-500 truncate mt-1">{s.last_message||'No messages yet'}</p>{s.bot_paused&&<span className="text-[10px] text-amber-700">Agent handoff</span>}</button>)}</div>
    </aside>
    <section className="inbox-thread flex flex-col">
      <header className="p-3 border-b flex items-center justify-between"><div><p data-no-translate={!!active} className="text-sm font-semibold">{active?[active.first_name,active.last_name].filter(Boolean).join(' ')||active.psid:'Select a conversation'}</p><p className="text-xs text-slate-500">{active?.bot_paused?'Bot paused for agent handoff':'Conversation'}</p></div>{active?.bot_paused&&<button onClick={async()=>{try{await api(`/api/telegram/chats/${subscriberId}/pause`,{method:'PATCH',body:JSON.stringify({paused:false})});setSubscribers(await api(`/api/chat/subscribers/${channelId}`));}catch(e){setError(e.message)}}} className="text-xs border rounded-lg px-3 py-2">Resume bot</button>}</header>
      {error&&<p role="alert" className="px-3 py-2 text-xs text-red-600">{error}</p>}
      <div ref={messageListRef} className="inbox-message-list p-4 space-y-3">{messages.map(m=><div key={m.id} className={`flex ${m.sender_type==='subscriber'?'justify-start':'justify-end'}`}><div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender_type==='subscriber'?'bg-slate-100 text-slate-800':'bg-blue-600 text-white'}`}><p data-no-translate className="whitespace-pre-wrap">{m.message_text}</p><p className="text-[10px] opacity-60 mt-1">{m.created_at?new Date(m.created_at).toLocaleString():''}</p></div></div>)}</div>
      <form onSubmit={send} className="p-3 border-t flex gap-2"><input value={draft} onChange={e=>setDraft(e.target.value)} disabled={!active||busy} placeholder={active?'Write a reply…':'Select a contact first'} className="flex-1 border rounded-xl px-3 py-2 text-sm"/><button disabled={!active||busy||!draft.trim()} className="bg-blue-600 text-white rounded-xl px-4 text-sm disabled:opacity-50">{busy?'…':'Send'}</button></form>
    </section>
  </div></Localized>;
}
