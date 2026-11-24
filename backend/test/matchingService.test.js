'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findMatches } = require('../src/services/matchingService');

let n = 0;
const item = (type, category, title, description = '') => ({ itemId: `i${++n}`, type, category, title, description, status: 'open' });

test('I-3: only same-category, opposite-type, open reports; at most 3, highest score first', () => {
  const lost = item('lost', 'wallets', 'Black leather wallet', 'brown stitching, has my school ID');
  const candidates = [
    item('found', 'wallets', 'Black leather wallet', 'brown stitching'),
    item('found', 'wallets', 'Leather wallet found'),
    item('found', 'wallets', 'Wallet with brown stitching'),
    item('found', 'wallets', 'Black leather wallet with stitching'),
    item('found', 'bags', 'Black leather wallet', 'brown stitching'), // other category
    item('lost', 'wallets', 'Black leather wallet', 'brown stitching'), // same type
    { ...item('found', 'wallets', 'Black leather wallet', 'brown stitching'), status: 'resolved' },
  ];
  const matches = findMatches(lost, candidates);
  assert.ok(matches.length <= 3 && matches.length > 0);
  assert.deepEqual(matches.map((m) => m.score), [...matches.map((m) => m.score)].sort((a, b) => b - a));
  assert.equal(matches[0].itemId, candidates[0].itemId);
  for (const m of matches) assert.ok(candidates.slice(0, 4).some((c) => c.itemId === m.itemId));
});

test('I-3: empty list when nothing passes the threshold', () => {
  assert.deepEqual(findMatches(item('lost', 'keys', 'Car key'), [item('found', 'keys', 'Locker padlock')]), []);
});

test('ST-06 pair 1: synonyms in the same category match (phone vs cellphone)', () => {
  const matches = findMatches(item('lost', 'gadgets', 'Samsung phone', 'blue case'), [item('found', 'gadgets', 'Samsung cellphone')]);
  assert.equal(matches.length, 1);
});

test('ST-06 pair 2: same words in different categories never match', () => {
  assert.deepEqual(findMatches(item('lost', 'bags', 'Jansport backpack calculus notes'), [item('found', 'school_supplies', 'Jansport backpack calculus notes')]), []);
});

test('ST-06 pair 3: generic words like "black" and "bag" stay below the threshold', () => {
  assert.deepEqual(findMatches(item('lost', 'bags', 'Black bag', 'lost my black bag'), [item('found', 'bags', 'Black bag found near canteen')]), []);
});

test('"others" needs a stronger keyword overlap', () => {
  const lost = item('lost', 'others', 'Guitar capo');
  assert.deepEqual(findMatches(lost, [item('found', 'others', 'Guitar capo')]), []);
  assert.equal(findMatches(item('lost', 'others', 'Yamaha guitar capo'), [item('found', 'others', 'Yamaha guitar capo')]).length, 1);
});
