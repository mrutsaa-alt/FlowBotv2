import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, Controls, Handle, Position, ConnectionLineType, addEdge,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './FlowBuilder.css';
import { ArrowLeft, Bot, Check, Clock3, GitBranch, MessageSquareText, Plus, ScanSearch, Save, Send, Trash2, Workflow, X, Zap } from 'lucide-react';
import { loadChannels } from '../api';
import { getLang, Localized, translate, useLang } from '../i18n';

// Same-origin default works in hosted previews and production; set VITE_API_URL only for a separately hosted API.
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const nodeInfo = {
  trigger: { title: 'Message trigger', step: 'START', description: 'Start when a message matches', icon: Zap, tone: 'amber', color: '#d58a27' },
  message: { title: 'Send a message', step: 'ACTION', description: 'Reply to the contact', icon: MessageSquareText, tone: 'blue', color: '#4386b8' },
  condition: { title: 'Condition', step: 'BRANCH', description: 'Split the flow by a rule', icon: GitBranch, tone: 'violet', color: '#8068c5' },
  delay: { title: 'Smart delay', step: 'TIMING', description: 'Wait before the next step', icon: Clock3, tone: 'teal', color: '#278c7b' },
  ai_reply: { title: 'AI reply', step: 'AI ACTION', description: 'Generate a contextual reply', icon: Bot, tone: 'green', color: '#328866' },
  intent: { title: 'Detect intent', step: 'AI BRANCH', description: 'Route by customer intent', icon: ScanSearch, tone: 'indigo', color: '#6578b4' },
};
const defaultNodes = language => [
  { id:'trigger-1', type:'flowNode', position:{x:180,y:60}, data:{kind:'trigger',title:translate('Incoming message',language),content:translate('Keyword trigger',language),keyword:'price'} },
  { id:'message-1', type:'flowNode', position:{x:180,y:240}, data:{kind:'message',title:translate('Auto reply',language),content:translate('ধন্যবাদ আমাদের নক করার জন্য!',language)} },
];
const defaultEdges = [{id:'e-trigger-message',source:'trigger-1',target:'message-1',animated:true,interactionWidth:48,selectable:true,deletable:true}];

function authHeaders() {
  const token = localStorage.getItem('flowbot_token') || localStorage.getItem('token') || '';
  return { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) };
}
async function api(path, options={}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers:{...authHeaders(), ...(options.headers||{})} });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
function FlowNode({data,selected}) {
  const info=nodeInfo[data.kind]||nodeInfo.message;
  const Icon=info.icon;
  return <article className={`flow-node flow-node-${info.tone} ${selected?'flow-node-selected':''}`}>
    <Handle type="target" position={Position.Top} className="flow-node-handle" />
    <header className="flow-node-header">
      <span className="flow-node-icon"><Icon size={15}/></span>
      <span className="flow-node-heading"><small>{info.step}</small><strong data-no-translate={!!data.title}>{data.title||info.title}</strong></span>
      <span className="flow-node-menu" aria-hidden="true">···</span>
    </header>
    <div className="flow-node-body">
      {data.kind==='trigger'&&<><span className="flow-node-caption">When a contact sends</span><span className="flow-node-value">{data.keyword||'Add a keyword'}</span></>}
      {data.kind==='message'&&<p data-no-translate className="flow-node-message">{data.content||'Write your message in the settings panel.'}</p>}
      {data.kind==='condition'&&<><span data-no-translate className="flow-node-caption">Match this text</span><span className="flow-node-value">{data.content||'Set a condition'}</span><div className="flow-node-branches"><span>Yes</span><span>No</span></div></>}
      {data.kind==='delay'&&<><span className="flow-node-caption">Wait before continuing</span><span className="flow-node-value">{Number(data.seconds||5)} seconds</span></>}
      {data.kind==='ai_reply'&&<><span className="flow-node-caption">AI response</span><span className="flow-node-value">{data.systemPrompt||data.content||'Configure reply instructions'}</span></>}
      {data.kind==='intent'&&<><span className="flow-node-caption">Route conversation by intent</span><span className="flow-node-value">{data.content||'pricing, order, support…'}</span></>}
    </div>
    <Handle type="source" position={Position.Bottom} className="flow-node-handle" />
  </article>;
}

function BuilderCanvas({onClose,initialChannelId,initialFlow}) {
  const { lang }=useLang({bn:{},en:{}});
  const t=key=>translate(key,lang);
  const [nodes,setNodes,onNodesChange]=useNodesState(()=>defaultNodes(getLang()));
  const [edges,setEdges,onEdgesChange]=useEdgesState(defaultEdges);
  const [selectedNodeId,setSelectedNodeId]=useState('message-1');
  const [selectedEdgeId,setSelectedEdgeId]=useState('');
  const [channels,setChannels]=useState([]);
  const [flows,setFlows]=useState([]);
  const [flowId,setFlowId]=useState('');
  const [channelId,setChannelId]=useState(()=>initialChannelId||localStorage.getItem('flowbot_channel_id')||'');
  const [flowName,setFlowName]=useState(()=>lang==='bn'?'নতুন Automation':'New Automation');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const selectedNode=nodes.find(n=>n.id===selectedNodeId);
  const selectedEdge=edges.find(e=>e.id===selectedEdgeId);
  const nodeTypes=useMemo(()=>({flowNode:FlowNode}),[]);
  const {fitView}=useReactFlow();

  useEffect(()=>{
    let active=true;
    loadChannels().then(items=>{
      if(!active)return;
      setChannels(items);
      const saved=initialChannelId||localStorage.getItem('flowbot_channel_id');
      const chosen=items.find(item=>String(item.id)===String(saved))||items[0];
      if(chosen)setChannelId(String(chosen.id));
    }).catch(e=>{if(active)setStatus(e.message);});
    return()=>{active=false;};
  },[initialChannelId]);

  const loadFlows=useCallback(async()=>{
    if(!channelId){setFlows([]);return;}
    try{const data=await api(`/flows/${encodeURIComponent(channelId)}`);setFlows(Array.isArray(data)?data:[]);}
    catch(e){setStatus(e.message);}
  },[channelId]);
  useEffect(()=>{loadFlows();},[loadFlows]);
  useEffect(()=>{if(channelId)localStorage.setItem('flowbot_channel_id',String(channelId));},[channelId]);

  const selectFlow=useCallback((flow)=>{
    setFlowId(String(flow.id));setFlowName(flow.name||'Untitled flow');
    const d=flow.flow_data||{};
    if(Array.isArray(d.nodes)&&d.nodes.length){setNodes(d.nodes);setEdges(Array.isArray(d.edges)?d.edges.map(edge=>({...edge,interactionWidth:48,selectable:true,deletable:true})):[]);}
    else {setNodes([{id:'trigger-1',type:'flowNode',position:{x:180,y:60},data:{kind:'trigger',title:'Keyword trigger',content:'Incoming message',keyword:flow.trigger_keyword||''}},{id:'message-1',type:'flowNode',position:{x:180,y:240},data:{kind:'message',title:'Auto reply',content:d.replyText||''}}]);setEdges(defaultEdges);}
    setSelectedNodeId('');setSelectedEdgeId('');setDirty(false);setStatus(lang==='bn'?`"${flow.name}" লোড হয়েছে`:`"${flow.name}" loaded`);
    setTimeout(()=>fitView({padding:.2}),0);
  },[setNodes,setEdges,fitView,lang]);
  useEffect(()=>{if(initialFlow)selectFlow(initialFlow);},[initialFlow,selectFlow]);

  const onConnect=useCallback(connection=>{setEdges(es=>addEdge({...connection,id:`e-${connection.source}-${connection.target}-${Date.now()}`,type:'smoothstep',animated:true,interactionWidth:48,selectable:true,deletable:true,style:{stroke:'#4b9b8d',strokeWidth:2}},es));setSelectedEdgeId('');setDirty(true);},[setEdges]);
  const addNode=(kind)=>{
    const info=nodeInfo[kind],id=`${kind}-${crypto.randomUUID?.()||Date.now()}`;
    setNodes(ns=>[...ns,{id,type:'flowNode',position:{x:220+Math.round(Math.random()*80),y:90+ns.length*150},data:{kind,title:info.title,content:info.description,...(kind==='trigger'?{keyword:''}:{}),...(kind==='delay'?{seconds:5}:{})}}]);
    setSelectedNodeId(id);setSelectedEdgeId('');setDirty(true);
  };
  const updateNode=(field,value)=>{
    if(!selectedNode)return;
    setNodes(ns=>ns.map(n=>n.id===selectedNode.id?{...n,data:{...n.data,[field]:value}}:n));setDirty(true);
  };
  const removeNode=()=>{
    if(!selectedNode)return;
    setNodes(ns=>ns.filter(n=>n.id!==selectedNode.id));
    setEdges(es=>es.filter(e=>e.source!==selectedNode.id&&e.target!==selectedNode.id));
    setSelectedNodeId('');setDirty(true);
  };
  const updateEdgeLabel=value=>{
    if(!selectedEdge)return;
    setEdges(es=>es.map(edge=>edge.id===selectedEdge.id?{...edge,label:value,labelStyle:{fill:'#425466',fontWeight:600},style:{stroke:'#4b9b8d',strokeWidth:2}}:edge));
    setDirty(true);
  };
  const removeEdge=()=>{
    if(!selectedEdge)return;
    setEdges(es=>es.filter(edge=>edge.id!==selectedEdge.id));
    setSelectedEdgeId('');setDirty(true);
  };
  const changeChannel=event=>{
    const nextChannelId=event.target.value;
    if(nextChannelId!==channelId&&dirty&&!window.confirm('Discard unsaved changes and switch channel?'))return;
    setChannelId(nextChannelId);
    setFlowId('');
    setFlowName(lang==='bn'?'নতুন Automation':'New Automation');
    setNodes(defaultNodes(lang));
    setEdges(defaultEdges);
    setSelectedNodeId('message-1');
    setSelectedEdgeId('');
    setDirty(false);
    setStatus('');
  };
  const saveFlow=async(publish=false)=>{
    if(!channelId){setStatus(t('Connect a channel before saving this automation.'));return;}
    if(!flowName.trim()){setStatus(t('Enter a flow name.'));return;}
    if(!nodes.length||!nodes.some(n=>n.data?.kind==='trigger')){setStatus(t('At least one Trigger node is required.'));return;}
    const invalid=nodes.find(n=>n.data?.kind==='message'&&!String(n.data.content||'').trim());
    if(invalid){setStatus(lang==='bn'?`"${invalid.data.title||'Message'}" নোডে মেসেজ লিখুন।`:`Add a message to the "${invalid.data.title||'Message'}" node.`);return;}
    setBusy(true);setStatus('');
    let closeAfterPublish=false;
    try{
      const normalizedNodes=nodes.map(n=>n.data?.kind==='intent'?{...n,data:{...n.data,intents:String(n.data.content||'pricing,order,support,complaint,human,other').split(',').map(x=>x.trim()).filter(Boolean)}}:n);
      const body={channel_id:Number(channelId),name:flowName.trim(),flow_data:{version:1,nodes:normalizedNodes,edges},trigger_type:'keyword',trigger_keyword:nodes.find(n=>n.data?.kind==='trigger')?.data?.keyword||'',is_active:publish};
      const saved=flowId
        ? await api(`/flows/${encodeURIComponent(flowId)}`,{method:'PUT',body:JSON.stringify(body)})
        : await api('/flows',{method:'POST',body:JSON.stringify(body)});
      setFlowId(String(saved.id));setDirty(false);
      setStatus(publish?t('Flow published.') :t('Flow saved.'));
      await loadFlows();
      closeAfterPublish=publish;
    }catch(e){setStatus(e.message);}
    finally{setBusy(false);if(closeAfterPublish)onClose?.();}
  };
  const createNew=()=>{setFlowId('');setFlowName(lang==='bn'?'নতুন Automation':'New Automation');setNodes(defaultNodes(lang));setEdges(defaultEdges);setSelectedNodeId('message-1');setSelectedEdgeId('');setDirty(true);setStatus(t('New flow created. Save it.'));};
  const deleteFlow=async()=>{
    if(!flowId||!window.confirm(t('Delete this flow?')))return;
    setBusy(true);try{await api(`/flows/${encodeURIComponent(flowId)}`,{method:'DELETE'});createNew();await loadFlows();setStatus(t('Flow deleted.'));}catch(e){setStatus(e.message);}finally{setBusy(false);}
  };

  return <Localized><div className="flow-builder-shell">
    <header className="flow-builder-topbar">
      <button type="button" className="flow-back-button" onClick={onClose} aria-label="Back to automations"><ArrowLeft size={17}/><span>Automations</span></button>
      <div className="flow-builder-brand"><span className="flow-builder-brand-icon"><Workflow size={18}/></span><span><strong>Flow Builder</strong><small>Visual automation</small></span></div>
      <input className="flow-name-input" aria-label="Automation name" value={flowName} onChange={e=>{setFlowName(e.target.value);setDirty(true);}} />
      <select className="flow-top-select" aria-label="Connected channel" value={channelId} onChange={changeChannel}>
        <option value="">Choose channel</option>{channels.map(channel=><option key={channel.id} value={channel.id}>{channel.page_name} · {channel.platform}</option>)}
      </select>
      <select className="flow-top-select flow-saved-select" aria-label="Saved automations" value={flowId} onChange={e=>{const flow=flows.find(item=>String(item.id)===e.target.value);if(flow)selectFlow(flow);else createNew();}}>
        <option value="">New automation</option>{flows.map(flow=><option key={flow.id} value={flow.id}>{flow.name} · {flow.is_active?'Published':'Draft'}</option>)}
      </select>
      <span className={`flow-save-state ${dirty?'is-dirty':''}`}><span/>{dirty?'Unsaved':'Saved'}</span>
      <button type="button" className="flow-save-button" title="Save draft" aria-label="Save draft" disabled={busy} onClick={()=>saveFlow(false)}><Save size={15}/><span>{busy?'Saving…':'Save draft'}</span></button>
      <button type="button" className="flow-publish-button" title="Publish automation" aria-label="Publish automation" disabled={busy} onClick={()=>saveFlow(true)}><Send size={15}/><span>Publish</span></button>
    </header>
    <div className="flow-builder-workspace">
      <aside className="flow-palette">
        <div className="flow-panel-heading"><span>Build your flow</span><small>ADD A STEP</small></div>
        <div className="flow-palette-list">{Object.entries(nodeInfo).filter(([kind])=>kind!=='trigger').map(([kind,info])=>{const Icon=info.icon;return <button type="button" className="flow-palette-item" key={kind} onClick={()=>addNode(kind)}><span className={`flow-palette-icon tone-${info.tone}`}><Icon size={16}/></span><span className="flow-palette-copy"><strong>{info.title}</strong><small>{info.description}</small></span><Plus size={14} className="flow-palette-plus"/></button>;})}</div>
        <div className="flow-palette-tip"><span className="flow-tip-mark">i</span><span>Click a step to add it to the canvas. Select a step to edit its settings.</span></div>
      </aside>
      <main className="flow-canvas-panel">
        <div className="flow-canvas-toolbar"><div className="flow-canvas-breadcrumb"><span className="flow-live-mark"/><strong>{flowName||'Untitled automation'}</strong><span>›</span><span>Canvas</span></div><div className="flow-canvas-counts"><span>{nodes.length} steps</span><i/><span>{edges.length} connections</span></div>{selectedEdge&&<button type="button" className="flow-remove-connection-button" onClick={removeEdge}><Trash2 size={13}/><span>Delete connection</span></button>}<button type="button" className="flow-fit-button" onClick={()=>fitView({padding:.2,duration:250})}>Fit view</button></div>
        <div className="flow-canvas-stage"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionRadius={72} connectionLineType={ConnectionLineType.SmoothStep} snapToGrid snapGrid={[16,16]} defaultEdgeOptions={{type:'smoothstep',animated:true,interactionWidth:48,selectable:true,deletable:true,style:{stroke:'#4b9b8d',strokeWidth:2}}} onNodesChange={changes=>{onNodesChange(changes);if(changes.some(c=>c.type==='position'||c.type==='remove'))setDirty(true);}} onEdgesChange={changes=>{onEdgesChange(changes);if(changes.some(change=>['add','remove','replace'].includes(change.type)))setDirty(true);if(changes.some(change=>change.type==='remove'&&change.id===selectedEdgeId))setSelectedEdgeId('');}} onConnect={onConnect} onNodeDragStop={()=>setDirty(true)} onNodeClick={(_,node)=>{setSelectedNodeId(node.id);setSelectedEdgeId('');}} onEdgeClick={(_,edge)=>{setSelectedNodeId('');setSelectedEdgeId(edge.id);}} onPaneClick={()=>{setSelectedNodeId('');setSelectedEdgeId('');}} fitView deleteKeyCode={['Backspace','Delete']} proOptions={{hideAttribution:true}}><Background variant={BackgroundVariant.Dots} color="#cbd5d1" gap={22} size={1.2}/><Controls/></ReactFlow></div>
        {status&&<div className="flow-status-message" role="status">{status}</div>}
      </main>
      <aside className={`flow-inspector ${selectedNode||selectedEdge?'flow-inspector-open':''}`}>
        <div className="flow-panel-heading"><span>{selectedEdge?'Connection settings':'Step settings'}</span><small>{selectedEdge?'CONNECTION':selectedNode?nodeInfo[selectedNode.data.kind]?.step||'STEP':'CANVAS'}</small><button type="button" className="flow-inspector-close" aria-label="Close settings" onClick={()=>{setSelectedNodeId('');setSelectedEdgeId('');}}><X size={15}/></button></div>
        {selectedNode?<div className="flow-inspector-content"><div className="flow-inspector-intro"><span className={`flow-palette-icon tone-${nodeInfo[selectedNode.data.kind]?.tone||'blue'}`}>{React.createElement(nodeInfo[selectedNode.data.kind]?.icon||MessageSquareText,{size:17})}</span><div><strong>{nodeInfo[selectedNode.data.kind]?.title||'Flow step'}</strong><small>Customize this step</small></div></div>
          <label className="flow-field-label">Step name<input className="flow-field" value={selectedNode.data.title||''} onChange={e=>updateNode('title',e.target.value)} maxLength={160}/></label>
          {selectedNode.data.kind==='trigger'&&<label className="flow-field-label">Message contains<input className="flow-field" value={selectedNode.data.keyword||''} onChange={e=>updateNode('keyword',e.target.value)} placeholder="e.g. pricing" maxLength={255}/><small className="flow-field-help">The flow starts when an incoming message matches this keyword.</small></label>}
          {selectedNode.data.kind==='delay'&&<label className="flow-field-label">Wait duration (seconds)<input className="flow-field" type="number" min="1" max="3600" value={selectedNode.data.seconds||5} onChange={e=>updateNode('seconds',Math.max(1,Math.min(3600,Number(e.target.value)||1)))}/></label>}
          {selectedNode.data.kind==='ai_reply'&&<label className="flow-field-label">AI instructions<textarea className="flow-field flow-textarea" value={selectedNode.data.systemPrompt||selectedNode.data.content||''} onChange={e=>updateNode('systemPrompt',e.target.value)} rows={5} maxLength={2000} placeholder="Describe the tone and guidance for the reply."/><small className="flow-field-help">Requires a configured AI provider.</small></label>}
          {selectedNode.data.kind!=='ai_reply'&&selectedNode.data.kind!=='trigger'&&selectedNode.data.kind!=='delay'&&<label className="flow-field-label">{selectedNode.data.kind==='condition'?'Condition text':selectedNode.data.kind==='message'?'Message text':selectedNode.data.kind==='intent'?'Intent labels':'Content'}<textarea className="flow-field flow-textarea" value={selectedNode.data.content||''} onChange={e=>updateNode('content',e.target.value)} rows={selectedNode.data.kind==='message'?6:4} maxLength={5000} placeholder={selectedNode.data.kind==='message'?'Write the message your contact will receive.':'Enter a value for this step.'}/>{selectedNode.data.kind==='intent'&&<small className="flow-field-help">Separate intent labels with commas.</small>}</label>}
          <button type="button" className="flow-delete-button" onClick={removeNode}><Trash2 size={15}/>Delete step</button>
        </div>:selectedEdge?<div className="flow-inspector-content"><div className="flow-inspector-intro"><span className="flow-palette-icon tone-teal"><Workflow size={17}/></span><div><strong>Branch label</strong><small>Optional connection condition</small></div></div><label className="flow-field-label">Label<input className="flow-field" value={String(selectedEdge.label||'')} onChange={e=>updateEdgeLabel(e.target.value)} placeholder="yes, no, pricing…" maxLength={80}/><small className="flow-field-help">For conditions, use “yes” or “no”. For intent detection, use an intent name.</small></label><button type="button" className="flow-delete-button" onClick={removeEdge}><Trash2 size={15}/>Remove connection</button></div>:<div className="flow-inspector-empty"><span><Workflow size={21}/></span><strong>Nothing selected</strong><p>Select a step or connection to edit its settings.</p></div>}
      </aside>
    </div>
  </div></Localized>;
}
export default function FlowBuilder({onClose,initialChannelId,initialFlow}){return <ReactFlowProvider><BuilderCanvas onClose={onClose} initialChannelId={initialChannelId} initialFlow={initialFlow}/></ReactFlowProvider>;}
