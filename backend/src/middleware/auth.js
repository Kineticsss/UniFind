'use strict';

// Verifies "Authorization: Bearer <Firebase ID token>" before any controller code runs (ST-03).
// verifyToken(token) -> { uid } or throws. Fake mode accepts "dev:<uid>" for local dev and tests only.

const { AuthError } = require('../errors');

const fakeVerify = async (token) => {
  const match = /^dev:([\w-]{1,64})$/.exec(token);
  if (!match) throw new Error('bad fake token');
  return { uid: match[1] };
};

const firebaseVerify = (auth) => (token) => auth.verifyIdToken(token);

function requireAuth(verifyToken) {
  return async (req, res, next) => {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) return next(AuthError('Missing sign-in token.'));
    try {
      const { uid } = await verifyToken(token);
      req.user = { uid };
      next();
    } catch {
      next(AuthError('Your sign-in has expired or is invalid. Sign in again.'));
    }
  };
}

module.exports = { requireAuth, fakeVerify, firebaseVerify };
