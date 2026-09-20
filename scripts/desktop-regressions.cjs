#!/usr/bin/env node
'use strict';
/* global workspace, OrgFlowStore, orgflowDesktop, updateScenario, branding, writeDurable, saveWorkspaceToDisk, restoreWorkspacePicker, workspaceFileHandle:writable, workspacePayload, filePersistence */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'test-results','desktop');fs.mkdirSync(output,{recursive:true});

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orgflow-desktop-'));
  const boot=path.join(temp,'boot.cjs'),profile=path.join(temp,'profile'),file=path.join(temp,'chart.orgflow');
  fs.writeFileSync(boot,`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root,'desktop/main.cjs'))});`);
  let app,expected;
  async function launch(folder){
    const env={...process.env,PORTABLE_EXECUTABLE_DIR:path.join(temp,folder)};
    delete env.ELECTRON_RUN_AS_NODE;
    app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',boot],env,timeout:45000});
    const page=await app.firstWindow();page.on('dialog',d=>d.accept());
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>typeof workspace!=='undefined'&&workspace?.scenarios?.length);
    await page.evaluate(()=>OrgFlowStore.flush());
    return {page,errors};
  }
  try{
    const {page,errors}=await launch('portable-original');
    assert.equal(await page.evaluate(()=>orgflowDesktop.updateState().then(s=>s.phase)),'unsupported');
    await page.evaluate(()=>{updateScenario(s=>{s.positions[0].title='Survives restart and moved app';});branding.companyName='Desktop recovery test';writeDurable(workspace);});
    await page.evaluate(()=>OrgFlowStore.flush());
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.evaluate(()=>saveWorkspaceToDisk(true));assert.ok(fs.existsSync(file));
    await page.evaluate(()=>restoreWorkspacePicker());
    assert.equal(await page.evaluate(()=>workspaceFileHandle.name),'chart.orgflow');
    assert.equal(await page.evaluate(()=>orgflowDesktop.recentDocuments().then(rows=>rows.length)),1);
    expected=await page.evaluate(()=>JSON.stringify(workspacePayload().planning));
    await page.evaluate(()=>OrgFlowStore.flush());
    fs.writeFileSync(file,'{"changedOutside":true}');
    await page.evaluate(()=>saveWorkspaceToDisk());
    assert.equal(fs.readFileSync(file,'utf8'),'{"changedOutside":true}');
    assert.match(await page.evaluate(()=>filePersistence.error),/changed outside/);
    await page.evaluate(()=>{filePersistence.setTarget(null);workspaceFileHandle=null;});
    assert.deepEqual(errors,[]);
    await app.close();app=null;
    const restarted=await launch('portable-moved');
    assert.equal(await restarted.page.evaluate(()=>JSON.stringify(workspacePayload().planning)),expected);
    assert.equal(await restarted.page.evaluate(()=>branding.companyName),'Desktop recovery test');
    assert.deepEqual(restarted.errors,[]);
    await restarted.page.screenshot({path:path.join(output,'reopened.png')});
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,checks:['startup','native-save','native-open','recent-files','external-modification','full-restart','moved-portable-profile','full-planning-and-branding','update-state']},null,2));
    console.log('Desktop regressions passed: native files, external conflicts, restart, moved profile, updater state.');
  }finally{
    if(app)await app.close();fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
