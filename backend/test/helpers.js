'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { fakeVerify } = require('../src/middleware/auth');
const { createMemoryItemRepository } = require('../src/repositories/memoryItemRepository');
const { createFakeNotificationAdapter } = require('../src/adapters/notificationAdapter');

const CLOUD = 'unifind-test';
const config = { corsOrigins: ['http://localhost:8080'], cloudinaryCloudName: CLOUD, serveFrontend: false };

function setup(overrides = {}) {
  const repo = overrides.repo || createMemoryItemRepository();
  const notifier = overrides.notifier || createFakeNotificationAdapter();
  const app = createApp({ config, verifyToken: fakeVerify, repo, notifier });
  const as = (uid) => ({
    post: (body) => request(app).post('/api/items').set('Authorization', `Bearer dev:${uid}`).send(body),
    get: (url) => request(app).get(url).set('Authorization', `Bearer dev:${uid}`),
  });
  return { app, repo, notifier, as };
}

const report = (fields) => ({ type: 'lost', title: 'Black wallet', category: 'wallets', description: '', date: '2026-11-20', ...fields });

module.exports = { setup, report, CLOUD };
