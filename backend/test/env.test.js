'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config/env');

test('C-02: real modes refuse to start without their variables', () => {
  assert.throws(() => loadConfig({ AUTH_MODE: 'firebase' }), /FIREBASE_PROJECT_ID/);
  assert.throws(() => loadConfig({ NOTIFY_MODE: 'onesignal' }), /ONESIGNAL_REST_API_KEY/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'x', CLOUDINARY_CLOUD_NAME: 'c', FRONTEND_URL: 'u' }), /AUTH_MODE=fake/);
  assert.equal(loadConfig({}).authMode, 'fake');
});
