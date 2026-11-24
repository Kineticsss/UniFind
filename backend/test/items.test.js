'use strict';

// API-level tests named after LA3 Worksheet B (ST-xx) and Worksheet A rows.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryItemRepository } = require('../src/repositories/memoryItemRepository');
const { setup, report, CLOUD } = require('./helpers');

const photo = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/unifind/wallet.jpg`;

test('ST-01: lost wallet matches an open found wallet; finder is alerted; both see the match', async () => {
  const { as, notifier } = setup();
  const found = await as('finder').post(report({ type: 'found', title: 'Black leather wallet', description: 'Found at the library' }));
  assert.equal(found.status, 201);
  assert.equal(found.body.matchCount, 0);
  assert.equal(found.body.notificationStatus, 'none');

  const lost = await as('owner').post(report({ title: 'Lost black wallet', description: 'leather', imageUrl: photo }));
  assert.equal(lost.status, 201);
  assert.deepEqual(Object.keys(lost.body).sort(), ['itemId', 'matchCount', 'notificationStatus']);
  assert.equal(lost.body.matchCount, 1);
  assert.equal(lost.body.notificationStatus, 'sent');
  assert.deepEqual(notifier.sent.map((s) => [s.ownerUid, s.itemId]), [['finder', lost.body.itemId]]);

  const ownerList = (await as('owner').get('/api/items/mine')).body.items;
  assert.equal(ownerList[0].matches[0].item.itemId, found.body.itemId);
  const finderList = (await as('finder').get('/api/items/mine')).body.items;
  assert.equal(finderList[0].matches[0].item.itemId, lost.body.itemId);
});

test('ST-02: every invalid field is reported and nothing is saved', async () => {
  const { as, repo } = setup();
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const res = await as('u1').post(report({ title: 'ab', category: 'pets', description: 'x'.repeat(600), date: tomorrow }));
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['category', 'date', 'description', 'title']);
  assert.equal((await repo.listByOwner('u1')).length, 0);
});

test('validation: impossible dates and wrong types are rejected', async () => {
  const { as } = setup();
  for (const body of [report({ date: '2026-02-31' }), report({ date: '2026-13-01' }), report({ type: 'stolen' }), report({ title: 42 })]) {
    assert.equal((await as('u1').post(body)).status, 400, JSON.stringify(body));
  }
});

test('ST-03: missing or invalid token gets 401 and nothing is saved', async () => {
  const { app, repo } = setup();
  const request = require('supertest');
  const none = await request(app).post('/api/items').send(report());
  assert.equal(none.status, 401);
  const bad = await request(app).post('/api/items').set('Authorization', 'Bearer expired.token.value').send(report());
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'UNAUTHENTICATED');
  assert.equal((await repo.findOpen()).length, 0);
  assert.equal((await request(app).get('/api/items')).status, 401);
});

test('ST-04: data store failure returns 503', async () => {
  const { StorageError } = require('../src/errors');
  const failing = new Proxy({}, { get: () => async () => { throw StorageError(); } });
  const res = await setup({ repo: failing }).as('u1').post(report());
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'STORAGE_UNAVAILABLE');
});

test('ST-04: a failure after the save returns 503 and leaves nothing saved', async () => {
  const { StorageError } = require('../src/errors');
  const repo = createMemoryItemRepository();
  repo.findOpen = async () => { throw StorageError(); };
  const res = await setup({ repo }).as('u1').post(report());
  assert.equal(res.status, 503);
  assert.deepEqual(await repo.listByOwner('u1'), []);
});

test('a report never matches the same user\'s own report', async () => {
  const { as } = setup();
  await as('u1').post(report({ type: 'found', title: 'Black leather wallet' }));
  const res = await as('u1').post(report({ type: 'lost', title: 'Black leather wallet' }));
  assert.equal(res.status, 201);
  assert.equal(res.body.matchCount, 0);
});

test('ST-05: notification failure still returns 201 with pending_retry, alerts run in parallel', async () => {
  const slowFail = { sendMatchAlert: () => new Promise((r) => setTimeout(() => r('failed'), 300)) };
  const { as, repo } = setup({ notifier: slowFail });
  for (const desc of ['Jansport', 'Jansport zipper', 'Jansport gray']) {
    await as('finder').post(report({ type: 'found', category: 'bags', title: 'Blue Jansport backpack', description: desc }));
  }
  const started = Date.now();
  const res = await as('owner').post(report({ category: 'bags', title: 'Blue Jansport backpack' }));
  const ms = Date.now() - started;
  assert.equal(res.status, 201);
  assert.equal(res.body.matchCount, 3);
  assert.equal(res.body.notificationStatus, 'pending_retry');
  assert.ok(ms < 800, `3 failing alerts took ${ms} ms; they should overlap, not add up`);
  assert.equal((await repo.get(res.body.itemId)).matches.length, 3);
});

test('ST-07: a report without a photo is accepted', async () => {
  const res = await setup().as('u1').post(report({ imageUrl: '' }));
  assert.equal(res.status, 201);
});

test('ST-08: imageUrl outside the project Cloudinary account is rejected', async () => {
  const { as, repo } = setup();
  for (const imageUrl of [
    'https://evil.example.com/a.jpg',
    'https://res.cloudinary.com/someone-else/image/upload/a.jpg',
    `http://res.cloudinary.com/${CLOUD}/image/upload/a.jpg`,
    `https://res.cloudinary.com.evil.com/${CLOUD}/image/upload/a.jpg`,
    'javascript:alert(1)',
  ]) {
    const res = await as('u1').post(report({ imageUrl }));
    assert.equal(res.status, 400, imageUrl);
    assert.deepEqual(Object.keys(res.body.error.fields), ['imageUrl']);
  }
  assert.equal((await repo.findOpen()).length, 0);
});

test('search: filters by type, category, keyword and date; hides owner UID', async () => {
  const { as } = setup();
  await as('a').post(report({ title: 'Black wallet', date: '2026-11-01' }));
  await as('a').post(report({ type: 'found', category: 'keys', title: 'Honda car key', date: '2026-11-10' }));
  const get = async (qs) => (await as('b').get(`/api/items?${qs}`)).body.items;
  assert.equal((await get('')).length, 2);
  assert.equal((await get('type=found')).length, 1);
  assert.equal((await get('category=wallets')).length, 1);
  assert.equal((await get('q=honda')).length, 1);
  assert.equal((await get('from=2026-11-05')).length, 1);
  const [first] = await get('');
  assert.equal(first.ownerUid, undefined);
  assert.equal(first.matches, undefined);
  assert.equal(first.isMine, false);
});

test('get one item; unknown id is 404', async () => {
  const { as } = setup();
  const { itemId } = (await as('a').post(report())).body;
  assert.equal((await as('b').get(`/api/items/${itemId}`)).body.title, 'Black wallet');
  assert.equal((await as('b').get('/api/items/nope')).status, 404);
});
