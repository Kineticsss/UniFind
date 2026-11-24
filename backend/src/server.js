'use strict';

const { loadConfig } = require('./config/env');
const { createApp } = require('./app');
const { fakeVerify, firebaseVerify } = require('./middleware/auth');
const { createMemoryItemRepository } = require('./repositories/memoryItemRepository');
const { createOneSignalAdapter, createFakeNotificationAdapter } = require('./adapters/notificationAdapter');

const config = loadConfig();

function firebase() {
  const { initializeApp, cert } = require('firebase-admin/app');
  return initializeApp({ credential: cert(config.firebase), projectId: config.firebase.projectId });
}

const fbApp = config.authMode === 'firebase' || config.storageMode === 'firestore' ? firebase() : null;

const verifyToken = config.authMode === 'firebase' ? firebaseVerify(require('firebase-admin/auth').getAuth(fbApp)) : fakeVerify;

const repo =
  config.storageMode === 'firestore'
    ? require('./repositories/firestoreItemRepository').createFirestoreItemRepository(require('firebase-admin/firestore').getFirestore(fbApp))
    : createMemoryItemRepository();

const notifier =
  config.notifyMode === 'onesignal'
    ? createOneSignalAdapter({ ...config.oneSignal, frontendUrl: config.frontendUrl })
    : createFakeNotificationAdapter();

createApp({ config, verifyToken, repo, notifier }).listen(config.port, () => {
  console.log(`UniFind API on port ${config.port} (auth=${config.authMode}, storage=${config.storageMode}, notify=${config.notifyMode})`);
});
