const test = require('node:test');
const assert = require('node:assert/strict');
const { extractEvents } = require('../src/services/metaWebhookParser');

test('parses Facebook Page text message events', () => {
  const events = extractEvents({ object:'page', entry:[{id:'page-1',messaging:[{sender:{id:'user-1'},message:{mid:'m1',text:'hello'},timestamp:123}]}] });
  assert.equal(events.length,1);
  assert.equal(events[0].provider,'facebook');
  assert.equal(events[0].channelPlatformId,'page-1');
  assert.equal(events[0].senderId,'user-1');
  assert.equal(events[0].text,'hello');
});

test('parses Instagram text message events and ignores echoes', () => {
  const events = extractEvents({ object:'instagram', entry:[{id:'ig-1',messaging:[
    {sender:{id:'user-1'},message:{mid:'m1',text:'হ্যালো'}},
    {sender:{id:'ig-1'},message:{is_echo:true,text:'echo'}}
  ]}] });
  assert.equal(events.length,1);
  assert.equal(events[0].provider,'instagram');
  assert.equal(events[0].text,'হ্যালো');
});

test('parses WhatsApp Cloud API text messages', () => {
  const events = extractEvents({ object:'whatsapp_business_account', entry:[{changes:[{value:{metadata:{phone_number_id:'phone-1'},messages:[{id:'wamid.1',from:'8801700000000',timestamp:'123',text:{body:'Hi'}}]}}]}] });
  assert.equal(events.length,1);
  assert.equal(events[0].provider,'whatsapp');
  assert.equal(events[0].channelPlatformId,'phone-1');
  assert.equal(events[0].senderId,'8801700000000');
  assert.equal(events[0].text,'Hi');
});

test('ignores status-only WhatsApp updates and non-text messages', () => {
  assert.deepEqual(extractEvents({ object:'whatsapp_business_account', entry:[{changes:[{value:{metadata:{phone_number_id:'phone-1'},statuses:[{id:'x',status:'delivered'}],messages:[{from:'u',image:{id:'i'}}]}}]}]}), []);
});
