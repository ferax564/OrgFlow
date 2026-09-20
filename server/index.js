#!/usr/bin/env node
'use strict';

const { createApp, assertProductionConfig } = require('./lib/app');

const { server, config, store, db } = createApp();
try {
  assertProductionConfig(config);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

server.listen(config.port, config.host, () => {
  const local = `http://127.0.0.1:${config.port}`;
  console.log(`OrgFlow enterprise on ${local} (bound ${config.host}:${config.port})`);
  if (config.authMode === 'dev') {
    console.log('Local sign-in is on — Keycloak is not required.');
    console.log(`Open ${local}/login.html  (first email becomes admin)`);
    console.log('Do not expose this port. AUTH_MODE=dev lets anyone on this machine create a session.');
  } else {
    console.log(`OIDC issuer ${config.issuer}`);
    console.log(`Login ${config.publicUrl}/auth/login`);
  }
});

store.prune();
const cleanup=setInterval(()=>{try{store.prune();}catch(error){console.error(JSON.stringify({level:'error',event:'retention_failed',message:error.message}));}},3600000);
cleanup.unref();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(cleanup);server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
