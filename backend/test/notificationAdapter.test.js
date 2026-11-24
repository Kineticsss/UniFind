'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOneSignalAdapter } = require('../src/adapters/notificationAdapter');

const opts = { appId: 'app', restApiKey: 'key', timeoutMs: 50, frontendUrl: 'https://unifind.example' };

test('I-4: sends to the external ID with the item link', async () => {
  let sent;
  const adapter = createOneSignalAdapter({ ...opts, fetchImpl: async (url, init) => ((sent = { url, init }), { ok: true }) });
  assert.equal(await adapter.sendMatchAlert('uid1', 'hello', 'item9'), 'sent');
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(body.include_aliases, { external_id: ['uid1'] });
  assert.equal(body.url, 'https://unifind.example/#/item/item9');
  assert.equal(sent.init.headers.Authorization, 'Key key');
});

test('I-4: rejected key, network error and timeout all return failed without throwing', async () => {
  const cases = [
    async () => ({ ok: false, status: 403, text: async () => 'invalid key' }),
    async () => { throw new TypeError('fetch failed'); },
    (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
  ];
  const keepAlive = setTimeout(() => {}, 1000); // AbortSignal.timeout is unref'd; keep the loop alive so the abort fires.
  for (const fetchImpl of cases) {
    assert.equal(await createOneSignalAdapter({ ...opts, fetchImpl }).sendMatchAlert('u', 'm', 'i'), 'failed');
  }
  clearTimeout(keepAlive);
});
