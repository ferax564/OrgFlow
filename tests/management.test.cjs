const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/management-core.js');
const C = require('../js/orgflow-core.js');
const fs = require('node:fs');
const path = require('node:path');
const NOW = '2026-09-16T12:00:00Z';
function fixture() { return C.validatePlanning(JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'))).planning); }
function proposed() { let w=M.createProposal(fixture(),{id:'test-proposal',name:'Test proposal',owner:'Andrea',rationale:'Add capacity'},NOW);w.scenarios.at(-1).workflow.reviewers=['Reviewer'];return C.validatePlanning(w); }
function act(w,action,input={},canApprove=true){return M.transition(w,'test-proposal',action,input,{actor:'Reviewer',now:NOW,canApprove},C.validatePlanning);}
test('management schema survives validation and old workspaces migrate non-destructively',()=>{
 const w=fixture(),s=w.scenarios[0];assert.equal(s.workflow.state,'Live');assert.deepEqual(s.assignments,[]);assert.equal(s.employees[0].capacityFte,1);assert.deepEqual(C.validatePlanning(w),w);
});
test('proposal baseline is frozen and three-way application preserves unrelated live fields',()=>{
 let w=proposed(),s=w.scenarios.at(-1),p=s.positions[0];p.title='Proposed leader';const frozen=JSON.stringify(s.baseSnapshot);w.scenarios[0].positions[0].location='New live site';
 w=act(act(w,'submit'),'approve');w=act(w,'apply');const current=w.scenarios[0],applied=w.scenarios.at(-1);
 assert.equal(current.positions[0].title,'Proposed leader');assert.equal(current.positions[0].location,'New live site');assert.equal(applied.workflow.state,'Applied');assert.equal(JSON.stringify(applied.baseSnapshot),frozen);assert.deepEqual(act(w,'apply'),w);
});
test('same-field conflicts block approval until explicit resolution, without altering original snapshot',()=>{
 let w=proposed(),s=w.scenarios.at(-1);s.positions[0].title='Plan';w.scenarios[0].positions[0].title='Live';const frozen=M.stable(s.baseSnapshot);w=act(w,'submit');assert.throws(()=>act(w,'approve'),/conflicts/);
 const preview=M.applicationPreview(w,s.id);assert.equal(preview.conflicts.length,1);w=act(w,'rebase',{resolutions:{[preview.conflicts[0].key]:'proposed'}});assert.equal(w.scenarios.at(-1).workflow.state,'Draft');assert.equal(M.stable(w.scenarios.at(-1).baseSnapshot),frozen);
 w=act(act(w,'submit'),'approve');w=act(w,'apply');assert.equal(w.scenarios[0].positions[0].title,'Plan');
});
test('review, authorization, effective date and apply gates are independent',()=>{
 let w=proposed();assert.throws(()=>act(w,'apply'),/approved/);w=act(w,'metadata',{effectiveDate:'2027-01-01'});w=act(w,'submit');assert.throws(()=>act(w,'approve',{},false),/authorized/);w=act(w,'approve');assert.throws(()=>act(w,'apply'),/cannot be applied early/);w=act(w,'schedule');assert.equal(w.scenarios.at(-1).workflow.state,'Scheduled');assert.throws(()=>act(w,'apply'),/cannot be applied early/);
});
test('editing reviewed content invalidates approval and Applied data cannot be changed',()=>{
 let w=act(act(proposed(),'submit'),'approve'),s=w.scenarios.at(-1),after=structuredClone(s);after.positions[0].title='Changed';M.invalidateDecision(s,after,{actor:'Editor',now:NOW});assert.equal(after.workflow.state,'Draft');assert.equal(after.workflow.approvedBy,'');
 w=act(w,'apply');s=w.scenarios.at(-1);after=structuredClone(s);after.positions[0].title='Changed';assert.throws(()=>M.invalidateDecision(s,after,{actor:'Editor',now:NOW}),/immutable/);
});
test('rollback creates an unapproved reversal, and retains later unrelated changes',()=>{
 let w=proposed();w.scenarios.at(-1).positions[0].title='Plan';w=act(act(act(w,'submit'),'approve'),'apply');w.scenarios[0].positions[0].location='Later site';
 const r=M.rollbackProposal(w,'test-proposal','rollback','Rollback','Admin',NOW),s=r.scenarios.at(-1),p=M.applicationPreview(r,s.id);assert.equal(s.workflow.state,'Draft');assert.equal(s.workflow.rollbackOf,'test-proposal');assert.equal(p.conflicts.length,0);assert.equal(p.result.positions[0].location,'Later site');assert.notEqual(p.result.positions[0].title,'Plan');
});
test('three-way deletion and simultaneous additions cannot silently overwrite live data',()=>{
 const b={positions:[{id:'p',title:'Old'}]},p={positions:[]},c={positions:[{id:'p',title:'New'}]};assert.equal(M.mergeSnapshots(b,p,c).conflicts.length,1);
 const added=M.mergeSnapshots({positions:[]},{positions:[{id:'p',title:'A'}]},{positions:[{id:'p',title:'B'}]});assert.equal(added.conflicts.length,1);
});
function timelineFixture(){const w=fixture(),s=w.scenarios[0],p=s.positions[0],person=s.employees.find(e=>e.id===p.personId);p.assignmentMode='timeline';p.personId='';p.hiringState='Vacant';return{w,s,p,person};}
test('dated assignments use inclusive end dates, reject overlaps and respect capacity',()=>{
 const {w,s,p,person}=timelineFixture();s.assignments=[{id:'a',positionId:p.id,personId:person.id,fte:1,startDate:'2026-09-01',endDate:'2026-09-15'}];C.validatePlanning(w);assert.equal(M.effectivePositions(s,'2026-09-15')[0].personId,person.id);assert.equal(M.effectivePositions(s,'2026-09-16')[0].personId,'');
 s.assignments.push({...s.assignments[0],id:'b',startDate:'2026-09-15',endDate:''});assert.throws(()=>C.validatePlanning(w),/overlap/);s.assignments[1].startDate='2026-09-16';C.validatePlanning(w);person.capacityFte=.5;assert.throws(()=>C.validatePlanning(w),/capacity/);
});
test('future reporting cycles are rejected even when current organization is acyclic',()=>{
 const w=fixture(),s=w.scenarios[0],p=s.positions[0],child=s.positions.find(x=>x.managerId===p.id);p.reportingMode='timeline';s.reportingLines=[{id:'r',positionId:p.id,managerId:child.id,kind:'solid',startDate:'2027-01-01',endDate:''}];assert.throws(()=>C.validatePlanning(w),/cycle/);
});
test('project over-allocation and missing references are rejected atomically',()=>{
 const w=fixture(),s=w.scenarios[0],person=s.employees[0];s.allocations=[{id:'a',personId:person.id,project:'A',fte:.6,startDate:'2026-01-01',endDate:''},{id:'b',personId:person.id,project:'B',fte:.5,startDate:'2026-09-01',endDate:''}];assert.throws(()=>C.validatePlanning(w),/capacity/);s.allocations[1].fte=.4;C.validatePlanning(w);s.allocations[1].personId='missing';assert.throws(()=>C.validatePlanning(w),/missing person/);
});
test('monthly budgets prorate by active days, keep currencies separate and flag missing assumptions',()=>{
 const s={positions:[{id:'p',title:'Engineer',fte:1,status:'Approved',hiringState:'Vacant',personId:'',startDate:'2026-09-16',endDate:''}],employees:[],costs:[{id:'c',positionId:'p',annualCost:120000,currency:'CHF',startDate:'2026-09-16',endDate:''}]};
 const [sep,oct]=M.forecast(s,{startMonth:'2026-09',months:2});assert.equal(sep.approvedFte,.5);assert.equal(sep.monthlyCost.CHF,5000);assert.equal(oct.monthlyCost.CHF,10000);assert.equal(sep.missingBudgetFte,0);assert.equal(sep.breakdown[0].activeDays,15);delete s.costs;const [row]=M.forecast(s,{startMonth:'2026-09',months:1});assert.deepEqual(row.monthlyCost,{});assert.equal(row.missingBudgetFte,.5);
});
test('CSV ambiguous aliases retain mapping metadata and explicit ignore resolves them',()=>{
 const s=fixture().scenarios[0];const r=C.prepareImport('id,title,role\nx,A,B','test.csv',s);assert.ok(r.errors.some(e=>/Multiple columns/.test(e)));assert.equal(r.headers.length,3);const good=C.prepareImport('id,title,role\nx,A,B','test.csv',s,undefined,[],{'2':'ignore'});assert.deepEqual(good.errors,[]);assert.equal(good.positions[0].title,'A');
});
test('concurrent workspaces merge independent edits and scope conflict keys by scenario',()=>{
 const doc={format:'orgflow.workspace',version:2,planning:proposed(),branding:{},palette:'indigo',theme:'light',view:{}},ours=structuredClone(doc),remote=structuredClone(doc);ours.planning.scenarios[0].positions[0].title='My title';remote.planning.scenarios[0].positions[0].location='Their location';
 let merged=M.mergeWorkspace(doc,ours,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.workspace.planning.scenarios[0].positions[0].title,'My title');assert.equal(merged.workspace.planning.scenarios[0].positions[0].location,'Their location');
 remote.planning.scenarios[0].positions[0].title='Their title';merged=M.mergeWorkspace(doc,ours,remote);assert.equal(merged.conflicts.length,1);const key=merged.conflicts[0].key;assert.ok(key.startsWith('current:'));merged=M.mergeWorkspace(doc,ours,remote,{[key]:'proposed'});assert.equal(merged.conflicts.length,0);assert.equal(merged.workspace.planning.scenarios[0].positions[0].title,'My title');
});
test('CSV structural updates preserve people capacity, skills, employee numbers and timeline fields',()=>{
 const {w,s,p,person}=timelineFixture();person.capacityFte=.8;person.skills=['Simulation'];s.assignments=[{id:'a',positionId:p.id,personId:person.id,fte:.8,startDate:'2026-09-01',endDate:''}];const checked=C.validatePlanning(w).scenarios[0];
 const r=C.prepareImport(`positionId,title\n${p.id},Updated title`,'update.csv',checked);const out=C.makeImportScenario(r,'update',checked);assert.equal(out.positions[0].assignmentMode,'timeline');assert.equal(out.assignments.length,1);assert.equal(out.employees.find(e=>e.id===person.id).capacityFte,.8);assert.deepEqual(out.employees.find(e=>e.id===person.id).skills,['Simulation']);
});
