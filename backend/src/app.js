'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { categories } = require('../../shared/categories.json');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { createItemService } = require('./services/itemService');
const { createItemController } = require('./controllers/itemController');

// Dependencies are passed in so tests and local dev can swap Firebase/OneSignal for fakes.
function createApp({ config, verifyToken, repo, notifier }) {
  const app = express();
  const items = createItemController({ itemService: createItemService({ repo, notifier }), cloudName: config.cloudinaryCloudName });
  const auth = requireAuth(verifyToken);

  app.set('trust proxy', 1); // Render sits behind one proxy; needed for per-client rate limits.
  app.use('/api', helmet(), cors({ origin: config.corsOrigins }), express.json({ limit: '20kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/categories', (req, res) => res.json({ categories: categories.map(({ slug, label }) => ({ slug, label })) }));
  app.post('/api/items', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), auth, items.create);
  app.get('/api/items', auth, items.search);
  app.get('/api/items/mine', auth, items.mine);
  app.get('/api/items/:id', auth, items.get);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }));

  // Local single-process run only. On Render the frontend is its own static site.
  if (config.serveFrontend) app.use(express.static(path.resolve(__dirname, '../../frontend')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
