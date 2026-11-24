'use strict';

// Wires the real or fake services from env vars. Used by server.js (local) and ../../api/index.js (Vercel).

const { loadConfig } = require('./config/env');
const { createApp } = require('./app');
const { fakeVerify, firebaseVerify } = require('./middleware/auth');
const { createMemoryItemRepository } = require('./repositories/memoryItemRepository');
const { createOneSignalAdapter, createFakeNotificationAdapter } = require('./adapters/notificationAdapter');

function buildApp() {
  const config = loadConfig();

  const fbApp =
    config.authMode === 'firebase' || config.storageMode === 'firestore'
      ? require('firebase-admin/app').initializeApp({ credential: require('firebase-admin/app').cert(config.firebase), projectId: config.firebase.projectId })
      : null;

  const verifyToken = config.authMode === 'firebase' ? firebaseVerify(require('firebase-admin/auth').getAuth(fbApp)) : fakeVerify;

  const repo =
    config.storageMode === 'firestore'
      ? require('./repositories/firestoreItemRepository').createFirestoreItemRepository(require('firebase-admin/firestore').getFirestore(fbApp))
      : createMemoryItemRepository();

  const notifier =
    config.notifyMode === 'onesignal'
      ? createOneSignalAdapter({ ...config.oneSignal, frontendUrl: config.frontendUrl })
      : createFakeNotificationAdapter();

  return { app: createApp({ config, verifyToken, repo, notifier }), config };
}

module.exports = { buildApp };
