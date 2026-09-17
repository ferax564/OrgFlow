/** Optional shared host adapter. Server versions and decision records are authoritative. */
(function () {
  'use strict';
  const api={enabled:false,canWrite:true,canExport:true,isAdmin:false,version:null,session:null,saveState:'Saved',busy:false,applying:false,
    takeOver,queueSave,recordExport,flush,decision,hasPending:()=>dirty||api.busy};
  window.OrgFlowEnterprise=api;
  let timer=null,chain=Promise.resolve(),baseline=null,dirty=false,conflict=null;
  const fingerprint=doc=>JSON.stringify({planning:{...doc.planning,activeScenarioId:undefined},branding:doc.branding,palette:doc.palette,theme:doc.theme});
  function status(text){api.saveState=text;document.body.classList.toggle('enterprise-busy',api.busy);renderSaveStatus();const b=document.getElementById('serverSaveRetry');if(b){b.hidden=!['Save failed','Conflict'].includes(text);b.textContent=text==='Conflict'?'Resolve save conflict':'Retry server save';}}
  async function jsonFetch(url,options={}){const res=await fetch(url,{credentials:'same-origin',...options});const body=await res.json().catch(()=>({}));return{res,body};}
  async function takeOver(){
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),2000);
    try{const{res,body}=await jsonFetch('/api/meta',{headers:{accept:'application/json'},signal:ctrl.signal});if(!res.ok||!body.enterprise)throw new Error('local');}
    catch{clearTimeout(timeout);startLocalPlanner();return;}clearTimeout(timeout);
    try{
      const session=await jsonFetch('/api/session',{headers:{accept:'application/json'}});
      if(session.res.status===401){location.href='/auth/login';return;}
      if(session.res.status===403){location.href='/login.html?error=not_member';return;}
      if(!session.res.ok)throw new Error('The shared host could not verify your session. Reload to retry.');
      const loaded=await jsonFetch('/api/workspace',{headers:{accept:'application/json'}});
      if(!loaded.res.ok)throw new Error(loaded.body.error||'Could not load the shared organization. Reload to retry.');
      const body=loaded.body;
      let version=body.version;
      // Flush edits that never reached the server before its document
      // replaces the local copy. A failed retry stays recoverable.
      try{
        const pending=await window.OrgFlowStore?.getPending?.();
        if(pending?.payload){
          const resent=await jsonFetch('/api/workspace',{method:'PUT',headers:{'content-type':'application/json','if-match':String(pending.baseVersion??version)},body:JSON.stringify({workspace:pending.payload,version:pending.baseVersion??version})});
          if(resent.res.ok){version=resent.body.version;body.workspace=pending.payload;await window.OrgFlowStore.clearPending();}
        }
      }catch{/* the pending record stays recoverable */}
      api.applying=true;
      try{await applyEnterpriseWorkspace(body.workspace);}finally{api.applying=false;}
      // Mark the host ready only after the workspace is in memory. Callers
      // that wait on enabled+version otherwise edit a still-null workspace.
      api.enabled=true;api.session=body.session;api.version=version;api.canWrite=Boolean(body.session?.canWrite);api.canExport=Boolean(body.session?.canExport);api.isAdmin=Boolean(body.session?.isAdmin);
      baseline=structuredClone(window.enterpriseWorkspacePayload());applyChrome(body.session);status('Saved');
    }catch(error){api.enabled=true;api.canWrite=false;api.canExport=false;const el=document.getElementById('loadError');el.classList.remove('hidden');el.textContent=error.message;}
  }
  function applyChrome(session){
    document.body.classList.add('enterprise-on');document.body.classList.toggle('enterprise-readonly',!session.canWrite);document.body.classList.toggle('enterprise-no-export',!session.canExport);
    const bar=document.getElementById('enterpriseBar');bar.hidden=false;bar.classList.remove('hidden');
    bar.innerHTML=`<span>${esc(session.user?.email||'')} · ${esc(session.role)}${session.scopePositionId?' · subtree '+esc(session.scopePositionId):''}</span>${session.isAdmin?' <a href="admin.html">Admin</a>':''} <button class="small-link" id="serverSaveRetry" hidden>Retry server save</button> <a href="/auth/logout">Sign out</a>`;
    document.getElementById('serverSaveRetry').onclick=()=>{if(api.saveState==='Conflict')openConflict().catch(e=>toast(e.message));else flush().catch(e=>toast(e.message));};
    if(!session.canWrite)for(const id of ['addBtn','importBtn','sideImportBtn','brandingBtn','directoryAdd'])document.getElementById(id).hidden=true;
    if(!session.canExport)document.getElementById('exportBtn').hidden=true;
    if(!session.isAdmin)for(const id of ['exampleHarborBtn','exampleNorthstarBtn','exampleEmptyBtn','exampleFirstLightBtn','exampleLumenBtn','exampleCedarBtn'])document.getElementById(id).hidden=true;
  }
  function queueSave(){
    if(!api.enabled||!api.canWrite||api.applying)return;
    dirty=true;if(api.saveState==='Conflict')return;status('Unsaved');clearTimeout(timer);timer=setTimeout(()=>{timer=null;enqueueSave().catch(e=>toast(e.message));},250);
  }
  function enqueueSave(){const task=chain.catch(()=>{}).then(saveNow);chain=task;return task;}
  async function saveNow(){
    if(!dirty)return;if(api.saveState==='Conflict')throw new Error('Reconcile the shared workspace before saving.');
    const payload=window.enterpriseWorkspacePayload();
    if(baseline&&fingerprint(payload)===fingerprint(baseline)){dirty=false;status('Saved');return;}
    api.busy=true;status('Saving');
    try{
      const{res,body}=await jsonFetch('/api/workspace',{method:'PUT',headers:{'content-type':'application/json','if-match':String(api.version)},body:JSON.stringify({workspace:payload,version:api.version})});
      if(res.status===409){conflict={base:structuredClone(baseline),local:structuredClone(payload),remote:null,version:null,resolutions:{},page:0};status('Conflict');await persistPending(payload,'conflict');throw new Error('Someone else saved. Your edits remain here. Use Resolve save conflict.');}
      if(!res.ok)throw new Error(body.error||'Save failed.');
      accept(body);dirty=false;status('Saved');
    }catch(error){if(api.saveState!=='Conflict'){status('Save failed');await persistPending(payload,'error');}throw error;}
    finally{api.busy=false;document.body.classList.remove('enterprise-busy');renderSaveStatus();}
  }
  function accept(body,{preserveView=true}={}){
    api.version=body.version;api.applying=true;
    try{acceptEnterpriseSnapshot(body.workspace,{preserveView});baseline=structuredClone(window.enterpriseWorkspacePayload());window.OrgFlowStore?.clearPending?.().catch(()=>{});}
    finally{api.applying=false;}
  }
  // A save that cannot reach the server keeps its full payload + base version
  // in IndexedDB so a crash or reload cannot lose the unsynchronized work.
  async function persistPending(payload,reason){
    try{await window.OrgFlowStore?.putPending?.({planning:payload.planning,payload,baseVersion:api.version,reason});}catch{/* pending recovery is best-effort */}
  }
  async function flush(){clearTimeout(timer);timer=null;await chain.catch(()=>{});if(api.saveState==='Conflict')throw new Error('Resolve the save conflict first.');if(dirty)await enqueueSave();}
  async function decision(id,action,input={}){
    if(!api.canWrite||api.session?.scopePositionId)throw new Error('This action requires an unscoped editor or administrator.');
    await flush();api.busy=true;status('Saving decision');
    try{
      const{res,body}=await jsonFetch(`/api/scenarios/${encodeURIComponent(id)}/decision`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,input,version:api.version})});
      if(!res.ok){if(res.status===409){conflict={base:structuredClone(baseline),local:structuredClone(window.enterpriseWorkspacePayload()),remote:null,resolutions:{},page:0};dirty=true;status('Conflict');}throw new Error(body.error||'Decision was not saved.');}
      accept(body,{preserveView:action!=='rollback'});dirty=false;undoStack=[];redoStack=[];updateUndoButtons();status('Saved');
    }catch(error){if(api.saveState!=='Conflict')status(dirty?'Save failed':'Saved');throw error;}
    finally{api.busy=false;document.body.classList.remove('enterprise-busy');renderSaveStatus();}
  }
  async function openConflict(){
    if(!conflict)return;
    const{res,body}=await jsonFetch('/api/workspace',{headers:{accept:'application/json'}});if(!res.ok)throw new Error(body.error||'Could not load the current version.');
    conflict.remote=body.workspace;conflict.version=body.version;conflict.resolutions={};conflict.page=0;
    renderConflict();openDialog('serverConflictModal');
  }
  function renderConflict(){
    const all=OrgFlowManagement.mergeWorkspace(conflict.base,conflict.local,conflict.remote).conflicts;
    const merged=OrgFlowManagement.mergeWorkspace(conflict.base,conflict.local,conflict.remote,conflict.resolutions);
    $('#serverConflictSummary').textContent=`${all.length} conflicting fields · ${merged.conflicts.length} unresolved. Independent edits are combined. Your unsaved version remains in memory until the reconciled save succeeds.`;
    $('#serverConflictRows').innerHTML=all.slice(conflict.page*100,(conflict.page+1)*100).map(c=>`<tr><td>${esc(c.scenarioId+' / '+c.id+' / '+c.field)}</td><td>${esc(OrgFlowManagement.stable(c.proposed))}</td><td>${esc(OrgFlowManagement.stable(c.current))}</td><td><select data-server-resolution="${esc(c.key)}" aria-label="Resolve ${esc(c.id+' '+c.field)}"><option value="">Choose…</option><option value="current" ${conflict.resolutions[c.key]==='current'?'selected':''}>Latest server</option><option value="proposed" ${conflict.resolutions[c.key]==='proposed'?'selected':''}>My edits</option></select></td></tr>`).join('')||'<tr><td colspan="4">No field conflicts; the independent edits can be combined.</td></tr>';
    $('#serverConflictPrev').disabled=conflict.page===0;$('#serverConflictNext').disabled=(conflict.page+1)*100>=all.length;$('#serverConflictSave').disabled=merged.conflicts.length>0;
  }
  async function saveReconciled(){
    if(!conflict?.remote)return;const merged=OrgFlowManagement.mergeWorkspace(conflict.base,conflict.local,conflict.remote,conflict.resolutions);
    if(merged.conflicts.length)throw new Error('Choose every conflict resolution first.');merged.workspace.planning=validatePlanning(merged.workspace.planning);
    api.busy=true;
    try{
      const{res,body}=await jsonFetch('/api/workspace',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:merged.workspace,version:conflict.version})});
      if(res.status===409){await openConflict();throw new Error('The server changed again. Review the refreshed conflict list.');}
      if(!res.ok)throw new Error(body.error||'Reconciled save failed.');
      accept(body);dirty=false;conflict=null;undoStack=[];redoStack=[];updateUndoButtons();status('Saved');closeDialog('serverConflictModal',true);toast('Independent edits combined and saved.');
    }finally{api.busy=false;document.body.classList.remove('enterprise-busy');renderSaveStatus();}
  }
  async function recordExport(kind){
    if(!api.enabled)return true;if(!api.canExport){toast('You are not allowed to export this organization.');return false;}
    const{res,body}=await jsonFetch('/api/exports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind})});if(!res.ok){toast(body.error||'Export was not permitted.');return false;}return true;
  }
  document.body.insertAdjacentHTML('beforeend','<div class="modal-backdrop" id="serverConflictModal"><div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="serverConflictTitle"><div class="modal-head"><div><h2 id="serverConflictTitle">Reconcile concurrent edits</h2><p id="serverConflictSummary"></p></div><button class="iconbtn" data-close-dialog="serverConflictModal" aria-label="Close conflict review">×</button></div><div class="modal-body"><div class="planning-table-wrap"><table class="planning-table"><thead><tr><th>Field</th><th>My edits</th><th>Latest server</th><th>Choice</th></tr></thead><tbody id="serverConflictRows"></tbody></table></div><div class="pagination"><button class="btn" id="serverConflictPrev">Previous</button><button class="btn" id="serverConflictNext">Next</button></div></div><div class="modal-foot"><button class="btn" data-close-dialog="serverConflictModal">Keep reviewing later</button><button class="btn primary" id="serverConflictSave">Save reconciled workspace</button></div></div></div>');
  $('#serverConflictModal').addEventListener('keydown',e=>trapDialogFocus(e,'serverConflictModal'));
  $('#serverConflictRows').onchange=e=>{if(e.target.dataset.serverResolution){conflict.resolutions[e.target.dataset.serverResolution]=e.target.value;renderConflict();}};
  $('#serverConflictPrev').onclick=()=>{conflict.page--;renderConflict();};$('#serverConflictNext').onclick=()=>{conflict.page++;renderConflict();};$('#serverConflictSave').onclick=()=>saveReconciled().catch(e=>toast(e.message));
  api.takeOver();
})();
