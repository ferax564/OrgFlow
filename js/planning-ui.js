/** Planning screens: explicit decisions, dated records, auditable assumptions and bounded tables. */
(function () {
  'use strict';
  const M=OrgFlowManagement, state={tab:'overview',asOf:today,group:'',month:today.slice(0,7),months:12,timelineKind:'assignments',timelinePage:0,timelineSearch:'',forecast:null,forecastKey:'',forecastSource:null,record:null,recordSnapshot:'',detailMonth:'',detailPage:0};
  const names={assignments:'Dated assignments',reportingLines:'Reporting lines',costs:'Position budgets',allocations:'Project allocations',commitments:'Capacity commitments'};
  const value=v=>v==null?'':String(v),money=obj=>Object.entries(obj||{}).sort().map(([code,n])=>`${code} ${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`).join(' · ')||'Not budgeted';
  const button=(label,attrs='',primary=false)=>`<button class="btn${primary?' primary':''}" ${attrs}>${label}</button>`;
  const table=(heads,rows)=>`<div class="planning-table-wrap"><table class="planning-table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}" class="empty-row">No records in this scope.</td></tr>`}</tbody></table></div>`;
  const metric=(label,v)=>`<div class="metric"><div class="metric-label">${label}</div><div class="metric-values">${esc(value(v))}</div></div>`;
  const canEdit=()=>!enterpriseBlocksWrite()&&activeScenario().workflow?.state!=='Applied';
  const scoped=()=>Boolean(window.OrgFlowEnterprise?.enabled&&window.OrgFlowEnterprise.session?.scopePositionId);
  const canApprove=()=>!scoped()&&(!window.OrgFlowEnterprise?.enabled||window.OrgFlowEnterprise.isAdmin);
  function groupControl(){const groups=[...new Set(activeScenario().positions.map(p=>p.group).filter(Boolean))].sort();if(state.group&&!groups.includes(state.group))state.group='';return `<label>Group <select id="managementGroup"><option value="">All groups</option>${groups.map(g=>`<option value="${esc(g)}" ${g===state.group?'selected':''}>${esc(g)}</option>`).join('')}</select></label>`;}
  function scopeControls(date=true){return `<div class="management-controls">${date?`<label>As of <input id="managementDate" type="date" value="${state.asOf}"></label>`:''}${groupControl()}</div>`;}
  function render(){
    const s=activeScenario();$('#managementTitle').textContent=s.name+' · '+(s.workflow?.state||'Draft');
    $('#managementScope').textContent=`${window.OrgFlowEnterprise?.enabled?'Shared organization':'Local workspace'} · ${scoped()?'authorized subtree only':'active scenario'} · Planning has its own date and group controls; chart filters do not apply.`;
    $$('#managementPanel [data-management-tab]').forEach(b=>{b.classList.toggle('primary',b.dataset.managementTab===state.tab);b.setAttribute('aria-pressed',String(b.dataset.managementTab===state.tab));});
    try{$('#managementContent').innerHTML=state.tab==='overview'?overview():state.tab==='forecast'?forecast():state.tab==='timeline'?timeline():state.tab==='decisions'?decisions():imports();}
    catch(error){$('#managementContent').innerHTML=`<p class="issue error" role="alert">${esc(error.message)}</p>`;}
  }
  function overview(){
    const s=activeScenario(),o=M.overview(s,state.asOf,state.group);
    return scopeControls()+`<div class="comparison-metrics">${metric('Active positions',o.positions)}${metric('People seated',o.people)}${metric('Approved vacancies',o.approvedVacancies.length)}${metric('Proposed positions',o.proposedPositions.length)}</div>
    <section class="management-section"><h3>Approved vacancies requiring action</h3>${table(['Position','Group','Status',''],o.approvedVacancies.map(p=>[esc(p.title),esc(p.group||'—'),esc(p.hiringState),button('Open',`data-planning-position="${esc(p.id)}"`)]))}</section>
    <div class="management-grid"><section class="management-section"><h3>Capability coverage</h3><p class="hint">Declared capabilities, not assessed proficiency. A sole listed person is a dependency to review, not a performance rating.</p>${table(['Capability','People','Coverage'],o.capabilities.map(c=>[esc(c.skill),esc(c.people.map(p=>p.name).join(', ')),c.singlePoint?'One listed person':`${c.people.length} people`]))}${button('Edit capabilities in People', 'data-planning-directory')}</section>
    <section class="management-section"><h3>Span of control</h3>${table(['Manager position','Direct positions'],o.spans.slice(0,100).map(r=>[esc(r.title),String(r.reports)]))}<p class="hint">First 100 managers by direct report count. Counts include vacant seats.</p></section></div>
    <section class="management-section"><h3>Active capacity commitments</h3>${table(['Commitment','Group','Capability','Required FTE','People with capability'],o.commitments.map(c=>[esc(c.name),esc(c.group||'All groups'),esc(c.skill||'Any'),fteText(c.requiredFte),String(c.qualifiedPeople)]))}<p class="hint">Capability counts do not subtract project allocations. The forecast shows aggregate capacity; this is not an automatic project-assignment optimizer.</p></section>`;
  }
  function forecastRows(s){const key=JSON.stringify([state.month,state.months,state.group]);if(state.forecastSource!==s||state.forecastKey!==key){state.forecast=M.forecast(s,{startMonth:state.month,months:state.months,group:state.group});state.forecastSource=s;state.forecastKey=key;}return state.forecast;}
  function forecast(){
    const s=activeScenario(),rows=forecastRows(s),base=s.id==='current'?null:M.forecast(s.applicationBaseline||s.baseSnapshot||scenarioById('current'),{startMonth:state.month,months:state.months,group:state.group});
    const costDelta=(r,b)=>{if(!b)return '—';const out={};for(const c of new Set([...Object.keys(r.monthlyCost),...Object.keys(b.monthlyCost)]))out[c]=M.round((r.monthlyCost[c]||0)-(b.monthlyCost[c]||0));return money(out);};
    return `<div class="management-controls"><label>Start month <input type="month" id="forecastMonth" value="${state.month}"></label><label>Horizon <select id="forecastMonths">${[3,6,12,24,36].map(n=>`<option value="${n}" ${n===state.months?'selected':''}>${n} months</option>`).join('')}</select></label>${groupControl()}${button('Export forecast CSV','data-forecast-export')}</div>
    <div class="planning-callout"><b>Budget assumptions, not payroll.</b> Annual cost per FTE is prorated by position-active calendar days, then divided by 12. Currencies stay separate; missing budgets are flagged, never assumed to be zero. Costs include vacant seats. Headcounts are month-end; FTE values are monthly averages.${base?' Deltas compare with the frozen application baseline.':''}</div>
    ${table(['Month','Positions / people¹','Approved / proposed FTE','Available / allocated FTE','Required / gap FTE','Budget²','Δ budget²','Missing budget FTE',''],rows.map((r,i)=>[esc(r.month),`${r.positions} / ${r.filled}`,`${fteText(r.approvedFte)} / ${fteText(r.proposedFte)}`,`${fteText(r.availableFte)} / ${fteText(r.allocatedFte)}`,`${fteText(r.requiredFte)} / ${fteText(r.demandGapFte)}`,esc(money(r.monthlyCost)),esc(costDelta(r,base?.[i])),fteText(r.missingBudgetFte),button('Details',`data-forecast-detail="${r.month}"`)]))}
    <p class="hint">¹ Distinct seated people, not filled-seat count. ² In each recorded currency; incomplete budget deltas are not total cost estimates. Staffing and reporting use dated records when enabled; legacy snapshot assignments stay constant across position-active dates.</p>`;
  }
  function recordSummary(kind,r){const s=activeScenario(),pos=id=>s.positions.find(p=>p.id===id)?.title||id,person=id=>s.employees.find(p=>p.id===id)?.name||id;
    if(kind==='assignments')return `${pos(r.positionId)} · ${person(r.personId)} · ${fteText(r.fte)} FTE`;
    if(kind==='reportingLines')return `${pos(r.positionId)} → ${r.managerId?pos(r.managerId):'Top level'} (${r.kind})`;
    if(kind==='costs')return `${pos(r.positionId)} · ${r.currency} ${r.annualCost.toLocaleString()} / FTE / year`;
    if(kind==='allocations')return `${person(r.personId)} · ${r.project} · ${fteText(r.fte)} FTE`;
    return `${r.name} · ${r.group||'All groups'} · ${r.skill||'Any capability'} · ${fteText(r.requiredFte)} FTE`;
  }
  function timeline(){
    const kind=state.timelineKind,all=activeScenario()[kind]||[],q=state.timelineSearch.toLowerCase(),rows=all.filter(r=>!q||recordSummary(kind,r).toLowerCase().includes(q)||r.id.toLowerCase().includes(q)).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id));
    state.timelinePage=Math.max(0,Math.min(state.timelinePage,Math.ceil(rows.length/100)-1));
    return `<div class="management-controls"><label>Record type <select id="timelineKind">${Object.entries(names).map(([k,n])=>`<option value="${k}" ${k===kind?'selected':''}>${n}</option>`).join('')}</select></label><label>Search <input type="search" id="timelineSearch" value="${esc(state.timelineSearch)}"></label>${button('Add record',`data-planning-add="${kind}" ${canEdit()?'':'disabled'}`,true)}</div>
    <p class="planning-callout">Dated records describe explicit intervals. End dates are inclusive. A seat cannot have overlapping assignments; person capacity, reporting cycles and missing references are checked before saving. Budgets are position-level assumptions, not individual salary records.</p>
    ${table(['Record','Start','End (inclusive)',''],rows.slice(state.timelinePage*100,(state.timelinePage+1)*100).map(r=>[esc(recordSummary(kind,r)),esc(r.startDate),esc(r.endDate||'Open ended'),button('Edit',`data-planning-edit="${esc(r.id)}" ${canEdit()?'':'disabled'}`)+' '+button('Remove',`data-planning-remove="${esc(r.id)}" ${canEdit()?'':'disabled'}`)]))}
    <div class="pagination">${button('Previous',`data-timeline-page="-1" ${state.timelinePage?'':'disabled'}`)}<span>Page ${state.timelinePage+1} · ${rows.length} records</span>${button('Next',`data-timeline-page="1" ${(state.timelinePage+1)*100<rows.length?'':'disabled'}`)}</div>`;
  }
  function decisions(){
    const s=activeScenario(),w=s.workflow;
    if(s.id==='current')return `<div class="planning-callout"><h3>Propose before changing Current</h3><p>Create a Draft, explain the changes, review conflicts, then approve and explicitly apply it. Scheduling marks when application is allowed; the app does not apply unattended changes.</p>${button('Create scenario','data-planning-create',true)}</div>`+table(['Scenario','State','Owner','Effective date',''],workspace.scenarios.filter(x=>x.id!=='current'&&!x.archived).map(x=>[esc(x.name),esc(x.workflow.state),esc(x.workflow.owner||'Not set'),esc(x.workflow.effectiveDate||'Not set'),button('Open',`data-planning-scenario="${esc(x.id)}"`)]));
    let preview,problem='';try{preview=M.applicationPreview(workspace,s.id);}catch(e){problem=e.message;}
    const editable=canEdit(),admin=canApprove(),disabled=!editable||scoped();
    const actions=[['submit','Submit for review',w.state==='Draft'],['approve','Approve',admin&&w.state==='In review'],['schedule','Schedule',admin&&w.state==='Approved'],['apply','Apply to Current',admin&&['Approved','Scheduled'].includes(w.state)],['draft','Return to Draft',!['Draft','Applied'].includes(w.state)],['rollback','Propose rollback',w.state==='Applied']];
    return `<div class="planning-callout"><b>${window.OrgFlowEnterprise?.enabled?'Server-governed decisions':'Local planning record — no authenticated sign-off'}</b><p>${window.OrgFlowEnterprise?.enabled?'Only unscoped administrators may approve, schedule or apply. Data edits invalidate an existing review or approval.':'Local decision labels are useful for planning, but anyone with this workspace file can edit it. Use the shared server for authorized approval and audit.'} Scheduling never applies a change automatically.</p></div>
    <div class="management-grid"><section class="management-section"><h3>Decision details</h3><dl class="decision-meta"><dt>State</dt><dd>${esc(w.state)}</dd><dt>Owner</dt><dd>${esc(w.owner||'Not set')}</dd><dt>Reviewers</dt><dd>${esc(w.reviewers.join(', ')||'Not set')}</dd><dt>Effective</dt><dd>${esc(w.effectiveDate||'On explicit application')}</dd><dt>Rationale</dt><dd>${esc(w.rationale||'Not set')}</dd><dt>Approved by</dt><dd>${esc(w.approvedBy||'Not approved')}</dd></dl>${button('Edit decision details',`data-decision-metadata ${disabled?'disabled':''}`)}</section>
    <section class="management-section"><h3>Review → approve → apply</h3><div class="decision-actions">${actions.filter(a=>a[2]).map(([action,label])=>button(label,`data-decision-action="${action}" ${(!editable&&action!=='rollback')||scoped()||enterpriseBlocksWrite()?'disabled':''}`,action==='apply')).join('')}</div><p class="hint">Approval and application are separate actions. Application validates the merged organization and preserves unrelated changes in Current. Applied proposals are immutable; rollback creates a new Draft.</p></section></div>
    <section class="management-section"><h3>Application preview</h3>${problem?`<p class="issue warn">${esc(problem)}</p>`:`<p>${preview.changes.length} changed records · ${preview.conflicts.length} conflicting fields. The original comparison snapshot is never rewritten.</p>${preview.conflicts.length?table(['Record / field','Baseline','Proposed','Current','Resolution'],preview.conflicts.map(c=>[esc(`${c.collection} / ${c.id} / ${c.field}`),esc(M.stable(c.baseline)),esc(M.stable(c.proposed)),esc(M.stable(c.current)),`<select data-conflict-key="${esc(c.key)}" aria-label="Resolve ${esc(c.id+' '+c.field)}"><option value="">Choose…</option><option value="current">Keep Current</option><option value="proposed">Use proposed</option></select>`])):table(['Collection','Record','Change'],preview.changes.slice(0,100).map(c=>[esc(c.collection),esc(c.id),esc(c.kind)]))}${button('Reconcile with Current → Draft',`data-decision-action="rebase" ${disabled?'disabled':''}`)}<p class="hint">Reconciliation requires a fresh review and approval. First 100 non-conflicting changed records listed; all changes are validated.</p>`}</section>
    <div class="management-grid"><section class="management-section"><h3>Discussion</h3>${button('Add comment',`data-decision-comment ${scoped()||enterpriseBlocksWrite()?'disabled':''}`)}${w.comments.map(c=>`<article class="decision-comment"><b>${esc(c.author)}</b><small>${esc(c.at)}</small><p>${esc(c.body)}</p></article>`).join('')||'<p>No comments yet.</p>'}</section><section class="management-section"><h3>Decision history</h3>${table(['Action','Actor','Time'],w.events.slice().reverse().map(e=>[esc(e.action),esc(e.actor),esc(e.at)]))}</section></div>`;
  }
  function imports(){return `<section class="management-section"><h3>Reconcile external data without replacing your plan</h3><p>Use stable position IDs and person IDs, not names, to match records. Map source columns to OrgFlow fields and ignore fields the external system does not own. Save mappings for repeat imports. Update by ID preserves omitted fields.</p><p>Imports default to a new Draft proposal. Review the change and budget impact before submitting it for approval.</p>${button('Import CSV','data-planning-import',true)} ${button('Download template','data-planning-template')}<h3>Saved source mappings</h3>${table(['Profile','Source-owned fields','Mode',''],(workspace.importProfiles||[]).map(p=>[esc(p.name),esc(p.ownedFields.join(', ')),esc(p.mode),button('Remove',`data-remove-profile="${esc(p.name)}" ${scoped()||enterpriseBlocksWrite()?'disabled':''}`)]))}<p class="hint">This is a file/API reconciliation workflow, not a configured vendor-specific HRIS connector. Employee external IDs and capacities travel in JSON workspaces. CSV is for position snapshots; dated records travel in the workspace API.</p><h3>Automation and AI access</h3><p>The optional shared host exposes authenticated workspace and forecast APIs. MCP defaults to read-only. An explicit ORGFLOW_ALLOW_PROPOSALS=true opt-in exposes propose_changes, which creates Drafts through the authenticated /api/proposals endpoint. Proposed changes stay Draft scenarios and pass the same server-side decision gates; AI access does not grant approval rights.</p></section>`;}
  function options(rows,idField='id',labelField='name'){return rows.map(r=>[r[idField],r[labelField]||r.id]);}
  function field(name,label,type,initial,choices=[]){const id='planning-'+name;let input;if(type==='select')input=`<select id="${id}" name="${name}">${choices.map(([v,l])=>`<option value="${esc(v)}" ${value(initial)===value(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;else if(type==='textarea')input=`<textarea id="${id}" name="${name}" maxlength="3000">${esc(value(initial))}</textarea>`;else input=`<input id="${id}" name="${name}" type="${type}" value="${esc(value(initial))}" ${type==='number'?'step="0.01" min="0" max="1000000000"':''} ${type==='text'?'maxlength="3000"':''}>`;return `<div class="field"><label for="${id}">${label}</label>${input}</div>`;}
  function recordFormState(){return JSON.stringify([...new FormData($('#planningRecordForm')).entries()]);}
  function openRecord(kind,id=''){
    if(enterpriseBlocksWrite()||scoped()&&['metadata','comment'].includes(kind)){toast('This action is not available for your role or while a save is pending.');return;}
    if(activeScenario().workflow.state==='Applied'&&!['comment'].includes(kind)){toast('Copy the applied proposal before editing.');return;}
    const s=activeScenario(),record=(s[kind]||[]).find(r=>r.id===id)||{},start=record.startDate||today;
    state.record={kind,id,scenarioId:s.id};$('#planningRecordError').classList.remove('show');$('#planningRecordSave').hidden=false;
    $('#planningRecordTitle').textContent=kind==='metadata'?'Decision details':kind==='comment'?'Add comment':`${id?'Edit':'Add'} ${names[kind]?.toLowerCase()||'record'}`;
    $('#planningRecordHint').textContent='Changes are validated before saving; invalid or conflicting records leave the workspace unchanged.';
    let fields='';
    if(kind==='metadata'){const w=s.workflow;fields=field('owner','Owner *','text',w.owner)+field('reviewers','Reviewers * (comma separated)','text',w.reviewers.join(', '))+field('effectiveDate','Effective date (optional)','date',w.effectiveDate)+field('rationale','Rationale *','textarea',w.rationale);}
    else if(kind==='comment')fields=field('body','Comment *','textarea','');
    else{
      if(['assignments','reportingLines','costs'].includes(kind))fields+=field('positionId','Position *','select',record.positionId,options(s.positions,'id','title'));
      if(['assignments','allocations'].includes(kind))fields+=field('personId','Person *','select',record.personId,options(s.employees));
      if(kind==='reportingLines')fields+=field('managerId','Reports to','select',record.managerId||'',[['','Top level / none'],...options(s.positions,'id','title')])+field('kind','Relationship','select',record.kind||'solid',[['solid','Solid line'],['dotted','Dotted line']]);
      if(['assignments','allocations'].includes(kind))fields+=field('fte','Allocated FTE *','number',record.fte??1);
      if(kind==='costs')fields+=field('annualCost','Annual position budget per 1.0 FTE *','number',record.annualCost??'')+field('currency','Currency code *','text',record.currency||'CHF');
      if(kind==='allocations')fields+=field('project','Project *','text',record.project||'');
      if(kind==='commitments')fields+=field('name','Commitment *','text',record.name||'')+field('group','Group (blank = all)','text',record.group||'')+field('skill','Required capability (optional)','text',record.skill||'')+field('requiredFte','Required FTE *','number',record.requiredFte??1);
      fields+=field('startDate','Start date *','date',start)+field('endDate','End date (inclusive; optional)','date',record.endDate||'');
      if(['assignments','reportingLines'].includes(kind))fields+='<p class="planning-callout">Adding the first dated record switches this seat to timeline mode. Existing snapshot data is not employment history. For a future change, the current snapshot is preserved from today until the day before the new interval.</p>';
    }
    $('#planningRecordForm').innerHTML=fields;state.recordSnapshot=recordFormState();openDialog('planningRecordModal');
  }
  async function command(action,input={}){
    if(enterpriseBlocksWrite()){toast('Resolve the pending save or access restriction first.');return;}
    if(['apply','approve','rebase','rollback'].includes(action)&&!confirm(action==='apply'?`Apply the approved changes in “${activeScenario().name}” to Current? A rollback proposal will be available.`:action==='approve'?'Record approval of this exact proposal? Application remains a separate action.':action==='rollback'?'Create a new Draft reversing this application? Nothing is applied automatically.':'Reconcile with Current and return this proposal to Draft for a fresh review?'))return;
    if(window.OrgFlowEnterprise?.enabled)await window.OrgFlowEnterprise.decision(activeScenario().id,action,input);
    else{
      const next=action==='rollback'?M.rollbackProposal(workspace,activeScenario().id,makeId('scenario'),input.name||('Rollback · '+activeScenario().name).slice(0,80)):M.transition(workspace,activeScenario().id,action,input,{actor:'Local planner'},validatePlanning);
      commitPlanning(next,'Decision saved',{governance:true,recordUndo:false});undoStack=[];redoStack=[];updateUndoButtons();
    }
    state.forecastSource=null;render();
  }
  async function saveRecord(){
    const editing=state.record;if(!editing||editing.scenarioId!==workspace.activeScenarioId){toast('The scenario changed. Reopen this editor.');return;}
    try{
      const form=$('#planningRecordForm'),data=Object.fromEntries(new FormData(form));
      if(editing.kind==='metadata'){data.reviewers=data.reviewers.split(',').map(v=>v.trim()).filter(Boolean);await command('metadata',data);}
      else if(editing.kind==='comment')await command('comment',data);
      else{
        for(const key of ['fte','annualCost','requiredFte'])if(key in data){if(data[key].trim()==='')throw new Error('Enter a numeric value; a missing budget is not zero.');data[key]=Number(data[key]);}
        data.id=editing.id||makeId('record');
        const kind=editing.kind,source=activeScenario(),p=source.positions.find(p=>p.id===data.positionId);
        if(p&&((kind==='assignments'&&p.assignmentMode!=='timeline')||(kind==='reportingLines'&&p.reportingMode!=='timeline'))&&!confirm(`Enable ${kind==='assignments'?'assignment':'reporting'} timeline for “${p.title}”? Snapshot data before today will not be reconstructed as history.`))return;
        updateScenario(s=>{
          const rows=s[kind]||(s[kind]=[]),position=s.positions.find(p=>p.id===data.positionId);
          if(kind==='assignments'&&position.assignmentMode!=='timeline'){
            if(position.personId&&data.startDate>today){const startDate=position.startDate&&position.startDate>today?position.startDate:today,endDate=M.dayAfter(data.startDate,-1);if(startDate<=endDate)rows.push({id:makeId('record'),positionId:position.id,personId:position.personId,fte:Math.min(position.fte,s.employees.find(e=>e.id===position.personId)?.capacityFte??1),startDate,endDate});}
            position.assignmentMode='timeline';position.personId='';position.hiringState='Vacant';
          }
          if(kind==='reportingLines'&&position.reportingMode!=='timeline'){
            for(const [relation,manager]of[['solid',position.managerId],['dotted',position.secondaryManagerId]])if(manager){const endDate=relation===data.kind?M.dayAfter(data.startDate,-1):'';if(!endDate||today<=endDate)rows.push({id:makeId('record'),positionId:position.id,managerId:manager,kind:relation,startDate:today,endDate});}
            position.reportingMode='timeline'; // Preserve legacy anchors; dated relationships drive projection and access.
          }
          const index=rows.findIndex(r=>r.id===editing.id);if(index>=0)rows[index]=data;else rows.push(data);
        },'Planning record saved');
      }
      state.record=null;state.recordSnapshot='';closeDialog('planningRecordModal',true);state.forecastSource=null;render();
    }catch(error){$('#planningRecordError').textContent=error.message;$('#planningRecordError').classList.add('show');}
  }
  function canCloseDialog(id){if(id==='planningRecordModal'&&state.record&&recordFormState()!==state.recordSnapshot&&!confirm('Discard unsaved planning record edits?'))return false;if(id==='planningRecordModal'){state.record=null;state.recordSnapshot='';}return true;}
  function bulkPatch(){const patch={};for(const [id,key]of[['bulkType','type'],['bulkStatus','status'],['bulkHiring','hiringState']])if($('#'+id).value)patch[key]=$('#'+id).value;
    for(const [id,key]of[['bulkGroup','group'],['bulkSite','location'],['bulkStart','startDate'],['bulkEnd','endDate'],['bulkCostCenter','costCenter'],['bulkJobFamily','jobFamily']]){const op=$(`[data-bulk-operation="${id}"]`).value;if(op==='set'){const v=$('#'+id).value.trim();if(!v)throw new Error('Enter a value for Set, or choose Clear explicitly.');patch[key]=v;}else if(op==='clear')patch[key]='';}return patch;}
  function bulkPreview(){
    for(const op of $$('[data-bulk-operation]'))$('#'+op.dataset.bulkOperation).disabled=op.value!=='set';
    const ids=[...selectedIds],s=workspace&&activeScenario();if(!s)return null;
    try{const patch=bulkPatch();
    if(!Object.keys(patch).length){$('#bulkPreview').textContent='Keep is the default. Select Set or Clear for each field you intend to change.';$('#bulkApplyBtn').disabled=true;return null;}
      if(patch.hiringState&&s.positions.some(p=>ids.includes(p.id)&&p.assignmentMode==='timeline'))throw new Error('Selected seats use dated assignments. Edit staffing in Planning → Timeline, not the bulk editor.');
      const proposed=bulkPatchPositions(s.positions,ids,patch,workspace.positionLevels);validateScenarioData({...s,positions:proposed},workspace.positionLevels);
      const changes=[];for(const p of proposed){const before=s.positions.find(r=>r.id===p.id);for(const key of [...Object.keys(patch),...(patch.hiringState?['personId']:[])])if(!M.same(p[key],before[key]))changes.push([p.id,p.title,key,before[key],p[key]]);}
      const vacated=patch.hiringState?s.positions.filter(p=>ids.includes(p.id)&&p.personId).length:0;
      $('#bulkPreview').innerHTML=`<h3>${changes.length} field changes across ${ids.length} selected positions</h3>${vacated?`<p class="issue warn">${vacated} occupied seats will be unassigned. Person records are retained.</p>`:''}${table(['Position','Field','Before','After'],changes.slice(0,40).map(([,title,key,before,after])=>[esc(title),esc(key),esc(value(before)||'Empty'),esc(value(after)||'Empty')]))}<p class="hint">${changes.length>40?'First 40 changes shown. ':''}No fields outside this preview are changed.</p>`;$('#bulkApplyBtn').disabled=!changes.length;return{patch,proposed,vacated,changes};
    }catch(error){$('#bulkPreview').innerHTML=`<p class="issue error" role="alert">${esc(error.message)}</p>`;$('#bulkApplyBtn').disabled=true;return null;}
  }
  function applyBulk(){const preview=bulkPreview();if(!preview?.changes.length)return;if(preview.vacated&&!confirm(`Unassign ${preview.vacated} occupied seats? Person records remain in the directory.`))return;try{updateScenario(s=>{s.positions=preview.proposed;},`Updated ${selectedIds.size} positions`);closeDialog('bulkModal',true);clearSelection();}catch(e){toast(e.message);}}
  async function exportForecast(){if(!await allowEnterpriseExport('csv'))return;const rows=forecastRows(activeScenario());downloadBlob(csvBlob(['month','monthEndPositions','monthEndPeople','approvedFte','proposedFte','availableFte','allocatedFte','requiredFte','capacityGapFte','budgetByCurrency','unbudgetedFte'],rows.map(r=>[r.month,r.positions,r.filled,r.approvedFte,r.proposedFte,r.availableFte,r.allocatedFte,r.requiredFte,r.demandGapFte,JSON.stringify(r.monthlyCost),r.missingBudgetFte])),`orgflow-${slug(activeScenario().name)}-forecast.csv`);}
  function forecastDetail(month,page=0){state.detailMonth=month;state.detailPage=page;state.record=null;const row=forecastRows(activeScenario()).find(r=>r.month===month);if(!row)return;const list=row.breakdown.slice(page*100,(page+1)*100);$('#planningRecordTitle').textContent=month+' · position budget detail';$('#planningRecordHint').textContent='Month averages and active calendar days. Costs are recorded assumptions; missing values are not zero.';$('#planningRecordError').classList.remove('show');$('#planningRecordSave').hidden=true;$('#planningRecordForm').innerHTML=table(['Position','Approval','Active / filled days','Budget','Unbudgeted days'],list.map(r=>[esc(r.title),esc(r.approval),`${r.activeDays} / ${r.filledDays}`,esc(money(r.monthlyCost)),String(r.missingBudgetDays)]))+`<div class="pagination">${button('Previous',`type="button" data-detail-page="-1" ${page?'':'disabled'}`)}<span>Page ${page+1} · ${row.breakdown.length} positions</span>${button('Next',`type="button" data-detail-page="1" ${(page+1)*100<row.breakdown.length?'':'disabled'}`)}</div>`;openDialog('planningRecordModal');}
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    try{
      if(b.dataset.closeDialog){closeDialog(b.dataset.closeDialog);return;}
      if(b.dataset.managementTab){state.tab=b.dataset.managementTab;render();$('#managementPanel').scrollTop=0;}
      if(b.hasAttribute('data-planning-create'))openScenarioDialog('create');
      if(b.dataset.planningScenario){switchScenario(b.dataset.planningScenario);state.tab='decisions';render();}
      if(b.dataset.planningPosition)openDrawer(b.dataset.planningPosition);
      if(b.hasAttribute('data-planning-directory'))openDirectory();
      if(b.hasAttribute('data-planning-import'))triggerImport();
      if(b.hasAttribute('data-planning-template'))downloadTemplate();
      if(b.dataset.removeProfile&&!scoped()&&!enterpriseBlocksWrite()&&confirm('Remove this source mapping? Existing data is unchanged.')){const next=structuredClone(workspace);next.importProfiles=(next.importProfiles||[]).filter(p=>p.name!==b.dataset.removeProfile);commitPlanning(next,'Source mapping removed');render();}
      if(b.dataset.planningAdd)openRecord(b.dataset.planningAdd);
      if(b.dataset.planningEdit)openRecord(state.timelineKind,b.dataset.planningEdit);
      if(b.dataset.planningRemove&&confirm('Remove this dated record? This changes the timeline, including past dates.')){updateScenario(s=>{s[state.timelineKind]=s[state.timelineKind].filter(r=>r.id!==b.dataset.planningRemove);},'Planning record removed');render();}
      if(b.hasAttribute('data-decision-metadata'))openRecord('metadata');
      if(b.hasAttribute('data-decision-comment'))openRecord('comment');
      if(b.dataset.decisionAction){const action=b.dataset.decisionAction,input=action==='rebase'?{resolutions:Object.fromEntries($$('[data-conflict-key]').map(el=>[el.dataset.conflictKey,el.value]))}:action==='rollback'?{name:('Rollback · '+activeScenario().name).slice(0,70)+' '+makeId('').slice(-5)}:{};await command(action,input);}
      if(b.hasAttribute('data-forecast-export'))await exportForecast();
      if(b.dataset.forecastDetail)forecastDetail(b.dataset.forecastDetail);
      if(b.dataset.detailPage)forecastDetail(state.detailMonth,state.detailPage+Number(b.dataset.detailPage));
      if(b.dataset.timelinePage){state.timelinePage+=Number(b.dataset.timelinePage);render();}
      if(b.dataset.registerPage){registerPage+=Number(b.dataset.registerPage);renderPositionTable();$('#positionsPanel').scrollTop=0;}
      if(b.dataset.directoryPage){directoryPage+=Number(b.dataset.directoryPage);renderPeopleDirectory();}
    }catch(error){toast(error.message);}
  });
  document.addEventListener('change',e=>{const el=e.target;
    try{if(el.id==='managementDate'){M.date(el.value,'Planning date',true);state.asOf=el.value;render();}
    if(el.id==='managementGroup'){state.group=el.value;render();}
    if(el.id==='forecastMonth'){M.date(el.value+'-01','Forecast month',true);state.month=el.value;render();}
    if(el.id==='forecastMonths'){state.months=Number(el.value);render();}
    if(el.id==='timelineKind'){state.timelineKind=el.value;state.timelinePage=0;render();}
    if(el.id==='directoryFilter'){directoryPage=0;renderPeopleDirectory();}
    if(el.closest('#bulkFields'))bulkPreview();}catch(error){toast(error.message);}
  });
  $('#directorySearch').oninput=()=>{directoryPage=0;renderPeopleDirectory();};
  document.addEventListener('input',e=>{if(e.target.id==='timelineSearch'){state.timelineSearch=e.target.value;state.timelinePage=0;const start=e.target.selectionStart;render();$('#timelineSearch').focus();$('#timelineSearch').setSelectionRange(start,start);}if(e.target.closest('#bulkFields'))bulkPreview();});
  $('#bulkOpenBtn').onclick=()=>{if(drawerIsDirty()&&!confirm('Discard unsaved position edits?'))return;hidePositionEditor();syncBulkBar();bulkPreview();openDialog('bulkModal');};
  $('#planningRecordForm').onsubmit=e=>{e.preventDefault();saveRecord();};$('#planningRecordSave').onclick=saveRecord;
  for(const id of ['bulkModal','planningRecordModal']){$('#'+id).addEventListener('keydown',e=>trapDialogFocus(e,id));$('#'+id).addEventListener('click',e=>{if(e.target.id===id)closeDialog(id);});}
  window.OrgFlowPlanningUI={render,openRecord,command,canCloseDialog,applyBulk,previewBulk:bulkPreview};
})();
