#!/usr/bin/env node
'use strict';
/* global AbortSignal */
// Read-only public checks. An authenticated production login/restore drill is
// deliberately separate and must use an approved test account and backup host.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const digest=text=>createHash('sha256').update(text).digest('hex');
async function check(base,mode='static'){
  const url=new URL(base);assert.equal(url.protocol,'https:','Production checks require HTTPS.');
  assert.ok(['static','enterprise'].includes(mode),'Mode must be static or enterprise.');
  if(!url.pathname.endsWith('/'))url.pathname+='/';
  async function get(route){const response=await fetch(new URL(route,url),{redirect:'manual',signal:AbortSignal.timeout(15000)});return {response,text:await response.text()};}
  const {response,text}=await get('app.html');assert.equal(response.status,200,'Planner must be accessible');
  assert.match(response.headers.get('content-type')||'',/text\/html/);
  assert.equal(digest(text),digest(fs.readFileSync(path.join(root,'app.html'),'utf8')),'Deployed planner differs from this checkout.');
  const scripts=[...text.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);assert.ok(scripts.length>0);
  for(const script of scripts){assert.match(script,/^js\/[a-zA-Z0-9_.-]+\.js$/);const asset=await get(script);assert.equal(asset.response.status,200,script);assert.equal(digest(asset.text),digest(fs.readFileSync(path.join(root,script),'utf8')),'Stale/missing asset: '+script);}
  const checks=['HTTPS planner','matching deployed HTML and '+scripts.length+' JavaScript assets'];
  if(mode==='enterprise'){
    for(const route of ['healthz','readyz']){const r=await get(route);assert.equal(r.response.status,200,route);assert.equal(JSON.parse(r.text).status,'ok');}
    const meta=await get('api/meta');assert.equal(meta.response.status,200);assert.equal(JSON.parse(meta.text).auth,'oidc','Production must use OIDC');
    for(const route of ['api/workspace','api/tokens','api/audit'])assert.equal((await get(route)).response.status,401,'Unauthenticated access: '+route);
    for(const route of ['.env','server/lib/auth.js','data/orgflow.sqlite','package-lock.json'])assert.equal((await get(route)).response.status,404,'Private path exposed: '+route);
    checks.push('readiness','OIDC configured','unauthenticated routes denied','private files denied');
  }
  return {passed:true,url:url.href,mode,checks,notVerified:['authenticated provider login/logout','external backup restore','signed desktop update']};
}
if(require.main===module)check(process.argv[2],process.argv[3]).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={check};
