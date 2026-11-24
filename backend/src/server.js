'use strict';

const { buildApp } = require('./build');

const { app, config } = buildApp();

app.listen(config.port, () => {
  console.log(`UniFind API on port ${config.port} (auth=${config.authMode}, storage=${config.storageMode}, notify=${config.notifyMode})`);
});
