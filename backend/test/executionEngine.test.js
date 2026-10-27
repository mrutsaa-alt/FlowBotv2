const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesTrigger } = require('../src/services/executionEngine');

test('matches any comma-separated keyword in a graph trigger', () => {
  assert.equal(matchesTrigger('keyword', 'price, support', 'I need SUPPORT please'), true);
  assert.equal(matchesTrigger('keyword', 'price, support', 'Can you help?'), false);
});

test('preserves default and welcome trigger behavior', () => {
  assert.equal(matchesTrigger('default', '', 'anything'), true);
  assert.equal(matchesTrigger('welcome', '', '/start'), true);
  assert.equal(matchesTrigger('welcome', '', 'hello'), true);
  assert.equal(matchesTrigger('welcome', '', 'good morning'), false);
});