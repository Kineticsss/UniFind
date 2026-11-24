// Vercel build step: writes js/config.js from environment variables.
// These are public browser values (Firebase web config, Cloudinary unsigned preset, OneSignal app ID), not secrets.
const fs = require('node:fs');
const path = require('node:path');

const e = process.env;
const config = {
  apiBase: e.API_BASE_URL || '',
  authMode: e.AUTH_MODE || 'firebase',
  firebase: { apiKey: e.FIREBASE_API_KEY || '', authDomain: e.FIREBASE_AUTH_DOMAIN || '', projectId: e.FIREBASE_PROJECT_ID || '', appId: e.FIREBASE_APP_ID || '' },
  cloudinary: { cloudName: e.CLOUDINARY_CLOUD_NAME || '', uploadPreset: e.CLOUDINARY_UPLOAD_PRESET || '' },
  oneSignalAppId: e.ONESIGNAL_APP_ID || '',
};
fs.writeFileSync(path.join(__dirname, '../js/config.js'), `window.UNIFIND_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('Wrote js/config.js for', config.apiBase || '(same origin)');
