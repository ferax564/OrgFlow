#!/usr/bin/env node
'use strict';

const { createApp } = require('./lib/app');

const { server, config } = createApp();
server.listen(config.port, () => {
  console.log(`OrgFlow enterprise listening on ${config.publicUrl} (${config.authMode})`);
});
