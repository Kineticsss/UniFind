// Browser-side integrations: Firebase Auth (or demo sign-in), Cloudinary upload (I-5), OneSignal push.

const cfg = window.UNIFIND_CONFIG;
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/13.4.0';

// ---------- Auth ----------
// getToken() returns a fresh ID token; onChange(cb) reports { uid, name } or null.

let fb; // { auth, mod }
const listeners = [];
const emit = (user) => listeners.forEach((cb) => cb(user));

export const auth = {
  mode: cfg.authMode,
  user: null,

  async init() {
    if (cfg.authMode === 'firebase') {
      const [{ initializeApp }, mod] = await Promise.all([import(`${FIREBASE_SDK}/firebase-app.js`), import(`${FIREBASE_SDK}/firebase-auth.js`)]);
      fb = { auth: mod.getAuth(initializeApp(cfg.firebase)), mod };
      mod.onAuthStateChanged(fb.auth, (u) => {
        auth.user = u ? { uid: u.uid, name: u.displayName || u.email } : null;
        emit(auth.user);
      });
    } else {
      auth.user = JSON.parse(localStorage.getItem('unifind-demo-user') || 'null');
      emit(auth.user);
    }
  },
  onChange: (cb) => listeners.push(cb),

  async getToken() {
    if (cfg.authMode === 'firebase') return fb.auth.currentUser?.getIdToken();
    return auth.user && `dev:${auth.user.uid}`;
  },

  signInEmail: (email, password) => fb.mod.signInWithEmailAndPassword(fb.auth, email, password),
  signUpEmail: (email, password) => fb.mod.createUserWithEmailAndPassword(fb.auth, email, password),
  signInGoogle: () => fb.mod.signInWithPopup(fb.auth, new fb.mod.GoogleAuthProvider()),

  signInDemo(name) {
    const uid = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'guest';
    auth.user = { uid, name };
    localStorage.setItem('unifind-demo-user', JSON.stringify(auth.user));
    emit(auth.user);
  },

  async signOut() {
    if (cfg.authMode === 'firebase') return fb.mod.signOut(fb.auth);
    localStorage.removeItem('unifind-demo-user');
    auth.user = null;
    emit(null);
  },
};

// Firebase error codes -> plain sentences.
export function authMessage(err) {
  const map = {
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
  };
  return map[err?.code] || 'Sign-in didn\'t go through. Try again.';
}

// ---------- Cloudinary (I-5) ----------
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const uploadsEnabled = Boolean(cfg.cloudinary.cloudName && cfg.cloudinary.uploadPreset);

// Checks here are for quick feedback; the preset enforces the same limits server-side (ST-07).
export async function uploadPhoto(file) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error('Only JPG, PNG or WebP photos are allowed.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('That photo is over 5 MB. Choose a smaller one.');
  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', cfg.cloudinary.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudinary.cloudName}/image/upload`, { method: 'POST', body });
  if (!res.ok) throw new Error('The photo was rejected. Try a different JPG, PNG or WebP under 5 MB.');
  return (await res.json()).secure_url;
}

// Cloudinary URL with a resize step, e.g. thumb(url, 'c_fill,w_480,h_360').
export const thumb = (url, t) => url.replace('/image/upload/', `/image/upload/${t},f_auto,q_auto/`);

// ---------- OneSignal web push ----------
export const pushEnabled = Boolean(cfg.oneSignalAppId);
let oneSignal;

export function initPush(uid) {
  if (!pushEnabled || (!uid && !oneSignal)) return;
  if (!oneSignal) {
    oneSignal = new Promise((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        await OneSignal.init({ appId: cfg.oneSignalAppId });
        resolve(OneSignal);
      });
      const s = document.createElement('script');
      s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.defer = true;
      document.head.append(s);
    });
  }
  // External ID = Firebase UID, so the backend can target this user (LA3 C-06).
  oneSignal.then((OneSignal) => (uid ? OneSignal.login(uid) : OneSignal.logout()));
}

export async function requestPush() {
  const OneSignal = await oneSignal;
  await OneSignal.Notifications.requestPermission();
  return OneSignal.Notifications.permission;
}
export const pushGranted = async () => (oneSignal ? (await oneSignal).Notifications.permission : false);
