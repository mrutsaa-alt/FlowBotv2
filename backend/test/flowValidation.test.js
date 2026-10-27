
const test = require('node:test');
const assert = require('node:assert/strict');
const { validGraph } = require('../src/services/flowValidation');
const graph = () => ({
  version: 1,
  nodes: [
    { id: 't', data: { kind: 'trigger', keyword: 'hello' } },
    { id: 'm', data: { kind: 'message', content: 'Hi' } },
    { id: 'd', data: { kind: 'delay', seconds: 5 } }
  ],
  edges: [{ id: 'e1', source: 't', target: 'm' }, { id: 'e2', source: 'm', target: 'd' }]
});
test('accepts valid bounded graph', () => assert.equal(validGraph(graph()), true));
test('rejects duplicate node ids', () => { const g=graph(); g.nodes.push({...g.nodes[0]}); assert.equal(validGraph(g),false); });
test('rejects a non-empty graph without a trigger', () => { const g=graph(); g.nodes=g.nodes.filter(n=>n.data.kind!=='trigger'); g.edges=[]; assert.equal(validGraph(g),false); });
test('rejects unknown node kinds', () => { const g=graph(); g.nodes[1].data.kind='shell'; assert.equal(validGraph(g),false); });
test('rejects edges to unknown nodes and self loops', () => {
  const a=graph(); a.edges.push({source:'m',target:'missing'}); assert.equal(validGraph(a),false);
  const b=graph(); b.edges.push({source:'m',target:'m'}); assert.equal(validGraph(b),false);
});
test('rejects out-of-range delay and more than one trigger', () => {
  const a=graph(); a.nodes[2].data.seconds=3601; assert.equal(validGraph(a),false);
  const b=graph(); b.nodes.push({id:'t2',data:{kind:'trigger',keyword:'x'}}); assert.equal(validGraph(b),false);
});
test('rejects oversized graphs', () => {
  const g=graph(); g.nodes=Array.from({length:201},(_,i)=>({id:String(i),data:{kind:'message',content:'ok'}}));
  assert.equal(validGraph(g),false);
});
test('accepts AI reply and intent nodes with bounded configuration', () => {
  const g = {nodes:[
    {id:'t',data:{kind:'trigger',keyword:'hello'}},
    {id:'i',data:{kind:'intent',intents:['pricing','other']}},
    {id:'a',data:{kind:'ai_reply',systemPrompt:'Answer briefly'}}
  ],edges:[{source:'t',target:'i'},{source:'i',target:'a',label:'pricing'}]};
  assert.equal(validGraph(g),true);
});
test('rejects oversized AI prompt and invalid intent labels', () => {
  const a={nodes:[{id:'t',data:{kind:'trigger'}},{id:'a',data:{kind:'ai_reply',systemPrompt:'x'.repeat(2001)}}],edges:[{source:'t',target:'a'}]};
  assert.equal(validGraph(a),false);
  const b={nodes:[{id:'t',data:{kind:'trigger'}},{id:'i',data:{kind:'intent',intents:'not-an-array'}}],edges:[{source:'t',target:'i'}]};
  assert.equal(validGraph(b),false);
});
