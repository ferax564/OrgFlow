'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp,safeStatic,handleMcp}=require('../server/lib/app');
const {openDatabase,createStore}=require('../server/lib/db');
const {backup,restore}=require('../server/backup');
const {proposalCommand}=require('../server/lib/governance');

test('live SQLite backup restores complete data to a clean host without overwriting existing data',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orgflow-backup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source=path.join(dir,'live.sqlite'),snapshot=path.join(dir,'snapshot.sqlite'),target=path.join(dir,'restored','orgflow.sqlite');
  const db=openDatabase(source),store=createStore(db);
  const user=store.upsertUser({issuerSub:'dev:owner',email:'owner@example.test',name:'Owner'});store.ensureMembership(user);
  const document=JSON.parse(store.getWorkspaceRow().document);document.branding.companyName='Durable organization';store.saveWorkspace(document,user.id,1);
  assert.equal(backup(source,snapshot),1);assert.equal(restore(snapshot,target),1);
  assert.throws(()=>restore(snapshot,target),/new data directory/);
  const restored=openDatabase(target),recovered=createStore(restored);
  assert.equal(JSON.parse(recovered.getWorkspaceRow().document).branding.companyName,'Durable organization');
  assert.equal(recovered.listMembers()[0].email,'owner@example.test');
  restored.close();db.close();
});
test('proposal retries are atomic, duplicate-safe and reject reused keys with different contents',t=>{
  const db=openDatabase(':memory:'),store=createStore(db);t.after(()=>db.close());
  const user=store.upsertUser({issuerSub:'dev:admin',email:'admin@example.test',name:'Admin'}),membership=store.ensureMembership(user);
  const input={version:1,name:'Capacity',rationale:'Review',changes:[]};
  const first=proposalCommand(store,input,membership,user,'request-1');
  assert.deepEqual(proposalCommand(store,input,membership,user,'request-1'),first);
  assert.equal(store.getWorkspaceRow().version,2);
  assert.throws(()=>proposalCommand(store,{...input,name:'Different'},membership,user,'request-1'),/different request/);
  assert.equal(store.getWorkspaceRow().version,2);
});
test('token expiry, scopes, static allowlist and readiness checks fail closed',async t=>{
  const app=createApp({memory:true});t.after(()=>app.db.close());
  const user=app.store.upsertUser({issuerSub:'dev:admin',email:'admin@example.test',name:'Admin'});app.store.ensureMembership(user);
  const token=app.store.createApiToken(user.id,'Read only');
  assert.deepEqual(token.scopes,['read']);
  assert.throws(()=>app.store.createApiToken(user.id,'Never',{expiresInDays:1000}),/1–90/);
  app.db.prepare('UPDATE api_tokens SET expires_at=? WHERE id=?').run('2000-01-01',token.id);
  assert.equal(app.store.findToken(token.token),null);
  for(const file of ['/desktop/store.cjs','/package-lock.json','/.env','/build/icon.png','/%zz'])assert.equal(safeStatic(file),null);
  assert.ok(safeStatic('/app.html'));
  assert.equal(handleMcp({jsonrpc:'2.0',method:'notifications/initialized'},()=>{}),null);
  assert.equal(handleMcp(null,()=>{}).error.code,-32600);
});
test('OpenAPI declares every template parameter and authenticated request contract',()=>{
  const spec=require('../server/lib/openapi').spec('test');
  assert.ok(Object.keys(spec.paths).length>=25);
  for(const [path,methods] of Object.entries(spec.paths))for(const operation of Object.values(methods)){
    for(const [,name] of path.matchAll(/\{([^}]+)\}/g))assert.ok(operation.parameters.some(p=>p.name===name&&p.in==='path'&&p.required&&p.schema));
    assert.ok(operation.responses['400'].content['application/json'].schema);
  }
  assert.ok(spec.paths['/api/proposals'].post.parameters.some(p=>p.name==='Idempotency-Key'));
});

test('actual v2.1.0 release workspace migrates without losing people, scenarios or branding',()=>{
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/workspace-v2.1.0.json'),'utf8'));
  const migrated=require('../server/lib/document').validateDocument(source);
  assert.equal(migrated.planning.version,3);
  assert.equal(migrated.planning.scenarios.length,source.planning.scenarios.length);
  for(const previous of source.planning.scenarios){const current=migrated.planning.scenarios.find(s=>s.id===previous.id);assert.equal(current.positions.length,previous.positions.length);assert.equal(current.employees.length,previous.employees.length);for(const person of previous.employees)assert.equal(current.employees.find(e=>e.id===person.id).name,person.name);}
  assert.equal(migrated.branding.companyName,source.branding.companyName);
});
