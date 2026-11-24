'use strict';

// Vercel serverless entry. vercel.json sends every /api/* request here; Express does the routing.
// If startup fails (usually a missing or malformed environment variable), answer every request
// with the reason instead of crashing, so it shows on /api/health. The message never includes values.
let handler;
try {
  handler = require('../backend/src/build').buildApp().app;
} catch (err) {
  console.error('[startup]', err);
  const message = String(err.message).split('\n')[0];
  handler = (req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, startupError: message }));
  };
}

module.exports = handler;
