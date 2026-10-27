const test = require('node:test');
const assert = require('node:assert/strict');
const { extractDeliveryUpdates } = require('../src/services/metaWebhookParser');

test('extracts WhatsApp sent/delivered/read/failed statuses', () => {
  const updates = extractDeliveryUpdates({object:'whatsapp_business_account',entry:[{changes:[{value:{statuses:[
    {id:'wamid.1',status:'sent',timestamp:'1760000000'},
    {id:'wamid.2',status:'delivered',timestamp:'1760000001'},
    {id:'wamid.3',status:'read',timestamp:'1760000002'},
    {id:'wamid.4',status:'failed',errors:[{title:'Undeliverable'}]}
  ]}}]}]});
  assert.deepEqual(updates.map(x=>x.status),['sent','delivered','read','failed']);
  assert.equal(updates[3].error,'Undeliverable');
});

test('extracts Facebook delivery message IDs', () => {
  const updates = extractDeliveryUpdates({object:'page',entry:[{messaging:[{delivery:{mids:['m1','m2']},timestamp:1760000000000}]}]});
  assert.deepEqual(updates.map(x=>x.messageId),['m1','m2']);
  assert.ok(updates.every(x=>x.provider==='facebook' && x.status==='delivered'));
});
