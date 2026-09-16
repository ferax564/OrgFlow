'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createApp,mcpTools}=require('../server/lib/app');
const {validateDocument}=require('../server/lib/document');
const {filterDocument,mergeDocument}=require('../server/lib/subtree');
const {reconcileSave}=require('../server/lib/governance');
const M=require('../js/management-core');
const fixture=()=>validateDocument(JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/harbor-and-co/workspace.json'))));
async function setup(t){
 const app=createApp({memory:true,env:{AUTH_MODE:'dev',SESSION_SECRET:'governance-test-only'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 t.after(()=>new Promise(r=>app.server.close(r)));
 const request=async(cookie,route,body,method=body?'POST':'GET')=>{const res=await fetch(base+route,{method,headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,...await res.json()};};
 const login=async(email,role,scopePositionId='')=>{const r=await fetch(base+'/auth/dev/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,role,scopePositionId,canExport:true})});assert.equal(r.status,200);return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');};
 const admin=await login('admin@test.example','admin');assert.equal((await request(admin,'/api/workspace',{workspace:fixture(),version:1},'PUT')).status,200);
 return{app,base,request,login,admin};
}
async function proposal(e,cookie=e.admin){const loaded=await e.request(cookie,'/api/workspace');return e.request(cookie,'/api/proposals',{version:loaded.version,name:'API proposal',rationale:'Build the required engineering capacity',changes:[{entity:'positions',id:'POS-001',operation:'upsert',values:{title:'Proposed title'}}]});}
test('proposal API never changes Current and rejects stale or unauthorized writes',async t=>{
 const e=await setup(t),before=await e.request(e.admin,'/api/workspace'),made=await proposal(e);assert.equal(made.status,201);assert.equal(made.state,'Draft');
 const after=await e.request(e.admin,'/api/workspace');assert.deepEqual(after.workspace.planning.scenarios[0],before.workspace.planning.scenarios[0]);assert.equal(after.workspace.planning.scenarios.at(-1).positions[0].title,'Proposed title');
 const stale=await e.request(e.admin,'/api/proposals',{name:'Stale',rationale:'x',version:before.version,changes:[]});assert.equal(stale.status,409);
 for(const [role,scope]of[['viewer',''],['editor','POS-003']]){const c=await e.login(`${role}${scope}@test.example`,role,scope);assert.equal((await proposal(e,c)).status,403);}
});
test('server enforces review authorization, trusted actors, immutable application and rollback',async t=>{
 const e=await setup(t),editor=await e.login('editor@test.example','editor'),made=await proposal(e,editor);let version=made.version;
 async function act(cookie,action,input={}){const r=await e.request(cookie,`/api/scenarios/${made.scenarioId}/decision`,{action,input,version});if(r.status===200)version=r.version;return r;}
 assert.equal((await act(editor,'metadata',{owner:'Engineering',rationale:'Capacity',reviewers:['admin@test.example']})).status,200);
 assert.equal((await act(editor,'submit')).status,200);assert.equal((await act(editor,'approve')).status,403);
 const approved=await act(e.admin,'approve');assert.equal(approved.status,200);assert.equal(approved.workspace.planning.scenarios.at(-1).workflow.approvedBy,'admin@test.example');
 const applied=await act(e.admin,'apply');assert.equal(applied.status,200);assert.equal(applied.workspace.planning.scenarios[0].positions[0].title,'Proposed title');
 const repeat=await act(e.admin,'apply');assert.equal(repeat.version,applied.version);
 const malicious=structuredClone(applied.workspace);malicious.planning.scenarios.at(-1).positions[0].title='Rewrite decision';assert.equal((await e.request(e.admin,'/api/workspace',{workspace:malicious,version},'PUT')).status,400);
 const rollback=await act(e.admin,'rollback',{name:'Reversal'});assert.equal(rollback.status,200);assert.equal(rollback.workspace.planning.scenarios.at(-1).workflow.state,'Draft');assert.equal(rollback.workspace.planning.scenarios[0].positions[0].title,'Proposed title');
});
test('workspace saves cannot forge approval, discussion authors or frozen snapshots',async t=>{
 const e=await setup(t),made=await proposal(e),loaded=await e.request(e.admin,'/api/workspace');
 for(const tamper of [s=>s.workflow.state='Approved',s=>s.workflow.comments.push({id:'c',body:'forged',author:'Someone else',at:'now'}),s=>s.applicationBaseline.positions[0].title='Forged baseline']){
   const doc=structuredClone(loaded.workspace);tamper(doc.planning.scenarios.at(-1));const r=await e.request(e.admin,'/api/workspace',{workspace:doc,version:loaded.version},'PUT');assert.equal(r.status,403,r.error);
 }
 const same=await e.request(e.admin,'/api/workspace');assert.equal(same.version,made.version);
});
test('server rejects missing versions and rolls back data when audit persistence fails',async t=>{
 const e=await setup(t),loaded=await e.request(e.admin,'/api/workspace');assert.equal((await e.request(e.admin,'/api/workspace',{workspace:loaded.workspace},'PUT')).status,400);
 const prior=e.app.store.getWorkspaceRow(),audit=e.app.store.audit;e.app.store.audit=()=>{throw new Error('Simulated audit storage failure');};
 const changed=structuredClone(loaded.workspace);changed.planning.scenarios[0].positions[0].title='Must roll back';const response=await e.request(e.admin,'/api/workspace',{workspace:changed,version:loaded.version},'PUT');assert.equal(response.status,400);e.app.store.audit=audit;
 const after=e.app.store.getWorkspaceRow();assert.equal(after.document,prior.document);assert.equal(after.version,prior.version);
});
test('subtree filtering includes dated data only in scope and protects its boundary relationships',()=>{
 const doc=fixture(),s=doc.planning.scenarios[0];s.reportingLines=[{id:'outside-line',positionId:'POS-003',managerId:'POS-001',kind:'solid',startDate:'2020-01-01',endDate:''}];s.positions.find(p=>p.id==='POS-003').reportingMode='timeline';
 s.costs=[{id:'inside',positionId:'POS-008',annualCost:100000,currency:'CHF',startDate:'2026-01-01',endDate:''},{id:'secret',positionId:'POS-001',annualCost:900000,currency:'CHF',startDate:'2026-01-01',endDate:''}];s.workflow.rationale='Secret leadership plan';
 const checked=validateDocument(doc),filtered=validateDocument(filterDocument(checked,'POS-003')),inside=filtered.planning.scenarios[0];assert.deepEqual(inside.costs.map(r=>r.id),['inside']);assert.equal(inside.workflow.rationale,'');assert.equal(inside.reportingLines[0].managerId,'');
 inside.reportingLines=[];inside.positions.find(p=>p.id==='POS-003').reportingMode='snapshot';const merged=validateDocument(mergeDocument(checked,filtered,'POS-003'));assert.equal(merged.planning.scenarios[0].reportingLines[0].managerId,'POS-001');assert.equal(merged.planning.scenarios[0].positions.find(p=>p.id==='POS-003').reportingMode,'timeline');
});
test('subtree access follows effective reporting, never a stale snapshot anchor',()=>{
 const doc=fixture(),s=doc.planning.scenarios[0],p=s.positions.find(p=>p.id==='POS-008');p.reportingMode='timeline';s.reportingLines=[{id:'move',positionId:p.id,managerId:'POS-002',kind:'solid',startDate:'2020-01-01',endDate:''}];
 const checked=validateDocument(doc),filtered=filterDocument(checked,'POS-003');assert.equal(filtered.planning.scenarios[0].positions.some(x=>x.id===p.id),false);
});
test('forecast API scopes position costs; MCP proposals require explicit opt-in',async t=>{
 const e=await setup(t),loaded=await e.request(e.admin,'/api/workspace'),s=loaded.workspace.planning.scenarios[0];s.costs=[{id:'secret',positionId:'POS-001',annualCost:900000,currency:'CHF',startDate:'2026-01-01',endDate:''}];assert.equal((await e.request(e.admin,'/api/workspace',{workspace:loaded.workspace,version:loaded.version},'PUT')).status,200);
 const scoped=await e.login('scoped@test.example','viewer','POS-003'),rows=await e.request(scoped,'/api/org/forecast?month=2026-09&months=1');assert.equal(rows.status,200);assert.ok(rows.rows[0].breakdown.every(p=>p.id!=='POS-001'));assert.deepEqual(rows.rows[0].monthlyCost,{});
 assert.equal(mcpTools().some(t=>t.name==='propose_changes'),false);assert.equal(mcpTools({allowProposals:true}).some(t=>t.name==='propose_changes'),true);
});
test('invalid or oversized proposal changes leave workspace and audit unchanged',async t=>{
 const e=await setup(t),loaded=await e.request(e.admin,'/api/workspace');
 for(const changes of [[{entity:'workflow',id:'current',operation:'upsert',values:{state:'Applied'}}],[{entity:'positions',id:'POS-001',operation:'upsert',values:{managerId:'POS-001'}}],Array.from({length:501},()=>({}))]){
 const response=await e.request(e.admin,'/api/proposals',{version:loaded.version,name:'Invalid',rationale:'x',changes});assert.equal(response.status,400);assert.equal(e.app.store.getWorkspaceRow().version,loaded.version);
 }
});
test('MCP stdio speaks newline-delimited JSON and keeps writes opt-in',async t=>{
 const {spawn}=require('node:child_process');
 for(const allow of [false,true]){
  const child=spawn(process.execPath,[path.join(__dirname,'../server/mcp-stdio.js')],{env:{...process.env,ORGFLOW_API_TOKEN:'transport-test-only',ORGFLOW_ALLOW_PROPOSALS:String(allow)},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'})+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(new Error('MCP transport timed out'));},5000);child.on('exit',code=>{clearTimeout(timeout);code?reject(new Error(err)):resolve();});});
  const messages=out.trim().split('\n').map(line=>JSON.parse(line));assert.equal(messages.length,2);assert.equal(messages[0].id,1);assert.equal(messages[1].result.tools.some(t=>t.name==='propose_changes'),allow);assert.ok(messages[1].result.tools.some(t=>t.name==='workforce_forecast'));
 }
});
