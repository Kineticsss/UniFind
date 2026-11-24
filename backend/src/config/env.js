'use strict';

// Reads env vars once. "fake"/"memory" modes need no accounts (local dev, tests).
// Real modes refuse to start when a required variable is missing (LA3 C-02).

require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env'), quiet: true });

const REQUIRED = {
  firebase: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'],
  onesignal: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'],
  production: ['CORS_ORIGINS', 'CLOUDINARY_CLOUD_NAME', 'FRONTEND_URL'],
};

function loadConfig(env = process.env) {
  // On Vercel the site and API share one domain, so it can stand in for CORS_ORIGINS and FRONTEND_URL.
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    const site = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
    env = { CORS_ORIGINS: site, FRONTEND_URL: site, ...env };
  }
  const config = {
    production: env.NODE_ENV === 'production',
    port: Number(env.PORT) || 8080,
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:8080').split(',').map((s) => s.trim()),
    serveFrontend: env.SERVE_FRONTEND === 'true',
    frontendUrl: env.FRONTEND_URL || 'http://localhost:8080',
    authMode: env.AUTH_MODE || 'fake', // fake | firebase
    storageMode: env.STORAGE_MODE || 'memory', // memory | firestore
    notifyMode: env.NOTIFY_MODE || 'fake', // fake | onesignal
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      // Dashboards store the key with literal "\n" sequences, sometimes with the JSON quotes still on.
      privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
    },
    cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME || '',
    oneSignal: { appId: env.ONESIGNAL_APP_ID, restApiKey: env.ONESIGNAL_REST_API_KEY, timeoutMs: 5000 },
  };

  const needed = [
    ...(config.authMode === 'firebase' || config.storageMode === 'firestore' ? REQUIRED.firebase : []),
    ...(config.notifyMode === 'onesignal' ? REQUIRED.onesignal : []),
    ...(config.production ? REQUIRED.production : []),
  ];
  const missing = [...new Set(needed)].filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  if (config.production && config.authMode === 'fake') throw new Error('AUTH_MODE=fake is not allowed in production.');
  if (config.production && config.corsOrigins.includes('*')) throw new Error('CORS_ORIGINS="*" is not allowed in production.');
  return config;
}

module.exports = { loadConfig };
