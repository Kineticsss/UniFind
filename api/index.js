'use strict';

// Vercel serverless entry. vercel.json sends every /api/* request here; Express does the routing.
module.exports = require('../backend/src/build').buildApp().app;
