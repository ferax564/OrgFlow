#!/usr/bin/env python3
"""Browser regression gate. Normal navigation is the default; --dom is a restricted-host fallback.

python tests/browser-regressions.py --browser chromium
python tests/browser-regressions.py --dom --executable /usr/bin/chromium

Only the fallback mocks storage and network. Native filesystem and shared-host tests
are explicitly skipped there, not counted as verified.
"""
from pathlib import Path
import argparse, functools, http.server, json, os, re, subprocess, sys, threading, time, unittest
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
P = argparse.ArgumentParser()
P.add_argument('--dom', action='store_true')
P.add_argument('--browser', choices=['chromium','firefox','webkit'], default='chromium')
P.add_argument('--executable')
P.add_argument('--output', default='test-results/browser')
ARGS, REST = P.parse_known_args()
OUT = ROOT / ARGS.output
OUT.mkdir(parents=True, exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.driver = sync_playwright().start()
        options = {'headless':True}
        if ARGS.executable: options['executable_path']=ARGS.executable
        if ARGS.browser=='chromium': options['args']=['--no-sandbox']
        cls.browser = getattr(cls.driver, ARGS.browser).launch(**options)
        if not ARGS.dom:
            cls.server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
            cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
            cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.driver.stop()
        if not ARGS.dom: cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
        self.page=self.context.new_page();self.page.set_default_timeout(5000)
        self.errors=[];self.reject=[]
        self.page.on('pageerror',lambda error:self.errors.append(str(error)))
        def dialog(d):
            if self.reject and self.reject[0] in d.message: self.reject.pop(0);d.dismiss()
            else: d.accept('HR source' if d.type=='prompt' else None)
        self.page.on('dialog',dialog)
        if ARGS.dom:
            html=(ROOT/'app.html').read_text();scripts=re.findall(r'<script src="([^"]+)"></script>',html)
            html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
            html=re.sub(r'<link[^>]*>','',html);html=re.sub(r'<script src="[^"]+"></script>','',html)
            html=html.replace('</head>','<style>'+(ROOT/'css/app.css').read_text()+'</style></head>')
            self.page.set_content(html)
            self.page.evaluate("""()=>{class S{constructor(){this.m=new Map()}getItem(k){return this.m.get(String(k))??null}setItem(k,v){this.m.set(String(k),String(v))}removeItem(k){this.m.delete(String(k))}clear(){this.m.clear()}}Object.defineProperty(window,'localStorage',{value:new S(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:new S(),configurable:true});window.fetch=async()=>({ok:false,status:404,json:async()=>({})});}""")
            for script in scripts:self.page.add_script_tag(content=(ROOT/script).read_text())
        else:self.page.goto(self.base+'/app.html')
        self.page.wait_for_function("() => typeof workspace!=='undefined' && workspace && document.querySelectorAll('#chart .node').length>0")
        if self.page.locator('#welcomeModal.open').count():self.page.locator('#welcomeSkip').click()
        self.page.wait_for_timeout(180)
    def tearDown(self):
        self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        self.context.close()
        self.assertEqual(self.errors,[],f'Uncaught application errors: {self.errors}')
    def ev(self,code,arg=None):return self.page.evaluate(code,arg)
    def click(self,selector):self.page.locator(selector).click()
    def planning(self,tab):self.click('[data-view="management"]');self.click(f'[data-management-tab="{tab}"]')
    def linked(self):
        self.ev("""()=>{window.writes=[];window.handleA={name:'A.json',getFile:async()=>new File([JSON.stringify(workspacePayload())],'A.json'),createWritable:async()=>{let data;return{write:async blob=>{data=JSON.parse(await blob.text())},close:async()=>writes.push({target:'A',data}),abort:async()=>{}}}};workspaceFileHandle=handleA;filePersistence.setTarget(handleA,{saved:true});filePersistence.delay=30;localStorage.setItem(AUTOSAVE_KEY,'1');syncAutosaveUi();}""")
    def edit(self,title='Edited'):self.ev("title=>updateScenario(s=>{s.positions[0].title=title},'Test edit')",title)
    def test_01_boot_views_themes_and_keyboard(self):
        for view in ['positions','compare','management','chart']:self.click(f'[data-view="{view}"]')
        self.click('#themeBtn');self.assertEqual(self.ev("document.documentElement.dataset.theme"),'dark')
        self.ev("openDrawer(activeScenario().positions[0].id)");self.page.wait_for_timeout(120)
        self.page.locator('#fTitle').fill('Unsaved title');self.reject=['Discard unsaved']
        self.page.keyboard.press('Escape');self.assertTrue(self.page.locator('#drawer.open').count())
        self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('#drawer.open').count())
    def test_02_directory_cannot_leave_a_stale_position_editor(self):
        self.ev("openDrawer(activeScenario().positions[0].id)");self.page.wait_for_timeout(120)
        self.click('#directoryBtn');self.assertFalse(self.page.locator('#drawer.open').count())
        person=self.ev("activeScenario().positions[0].personId")
        self.click(f'[data-person-edit="{person}"]');self.page.locator('#personName').fill('Renamed in directory');self.click('#personSave');self.click('#directoryClose')
        self.ev("openDrawer(activeScenario().positions[0].id)");self.page.wait_for_timeout(120);self.page.locator('#fTitle').fill('New position title');self.click('#saveBtn')
        self.assertEqual(self.ev("id=>activeScenario().employees.find(p=>p.id===id).name",person),'Renamed in directory')
    def test_03_nested_escape_preserves_parent_and_focus(self):
        self.click('#directoryBtn');self.click('#directoryAdd');self.page.keyboard.press('Escape')
        self.assertTrue(self.page.locator('#directoryModal.open').count());self.assertFalse(self.page.locator('#personModal.open').count())
        self.assertEqual(self.ev('document.activeElement.id'),'directoryAdd')
        self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('#directoryModal.open').count())
    def test_04_bulk_keep_set_clear_and_preview(self):
        pid=self.ev("()=>{const p=activeScenario().positions.find(p=>p.status==='Not approved');toggleSelected(p.id);return p.id}")
        self.click('#bulkOpenBtn');self.assertEqual(self.page.locator('#bulkStatus').input_value(),'')
        self.page.locator('[data-bulk-operation="bulkCostCenter"]').select_option('set')
        self.assertTrue(self.page.locator('#bulkApplyBtn').is_disabled())
        self.page.locator('#bulkCostCenter').fill('ENG-2027');self.click('#bulkApplyBtn')
        position=self.ev('id=>activeScenario().positions.find(p=>p.id===id)',pid)
        self.assertEqual(position['status'],'Not approved');self.assertEqual(position['costCenter'],'ENG-2027')
        self.ev('id=>toggleSelected(id)',pid);self.click('#bulkOpenBtn');self.page.locator('[data-bulk-operation="bulkCostCenter"]').select_option('clear');self.click('#bulkApplyBtn')
        self.assertEqual(self.ev('id=>activeScenario().positions.find(p=>p.id===id).costCenter',pid),'')
    def test_05_bulk_vacancy_preserves_person_and_invalid_dates_atomic(self):
        before=self.ev('activeScenario().positions[0]');people=self.ev('activeScenario().employees.length')
        self.ev('id=>toggleSelected(id)',before['id']);self.click('#bulkOpenBtn')
        self.page.locator('[data-bulk-operation="bulkEnd"]').select_option('set');self.page.locator('#bulkEnd').fill('2020-01-01');self.assertTrue(self.page.locator('#bulkApplyBtn').is_disabled())
        self.page.locator('[data-bulk-operation="bulkEnd"]').select_option('keep');self.page.locator('#bulkHiring').select_option('Vacant')
        self.assertIn('personId',self.page.locator('#bulkPreview').inner_text());self.click('#bulkApplyBtn')
        self.assertEqual(self.ev('activeScenario().employees.length'),people);self.assertEqual(self.ev('activeScenario().positions[0].personId'),'')
    def test_06_duplicate_csv_mapping_is_recoverable_and_creates_draft(self):
        baseline=self.ev('JSON.stringify(activeScenario().positions)')
        self.ev("importFile(new File(['positionId,title,role\\nNEW-1,Engineering,Alias'], 'hr.csv',{type:'text/csv'}))")
        self.assertTrue(self.page.locator('#importMapWrap').is_visible());self.assertTrue(self.page.locator('#importConfirm').is_disabled())
        self.page.locator('[data-map-col="2"]').select_option('ignore');self.assertFalse(self.page.locator('#importConfirm').is_disabled());self.click('#importConfirm')
        self.assertEqual(self.ev('activeScenario().workflow.state'),'Draft');self.assertEqual(self.ev('JSON.stringify(scenarioById("current").positions)'),baseline)
    def test_07_autosave_tracks_undo_redo_and_replacement(self):
        self.linked();original=self.ev('activeScenario().positions[0].title');self.edit();self.page.wait_for_timeout(100)
        self.ev('undoChange()');self.page.wait_for_timeout(100);self.assertEqual(self.ev('writes.at(-1).data.planning.scenarios[0].positions[0].title'),original)
        self.ev('redoChange()');self.page.wait_for_timeout(100);self.assertEqual(self.ev('writes.at(-1).data.planning.scenarios[0].positions[0].title'),'Edited')
        self.ev('replaceWorkspace(emptyWorkspace(today))');self.page.wait_for_timeout(100);self.assertEqual(self.ev('writes.at(-1).data.planning.scenarios[0].positions.length'),1)
    def test_08_cancelled_and_invalid_restore_keep_linked_file(self):
        self.linked();self.ev("window.handleB={...handleA,name:'B.json',createWritable:async()=>({write:async()=>{},close:async()=>writes.push({target:'B'})})};window.showOpenFilePicker=async()=>[handleB]")
        self.reject=['Open “'];self.ev('restoreWorkspacePicker()');self.edit();self.page.wait_for_timeout(100)
        self.assertEqual(self.ev('workspaceFileHandle.name'),'A.json');self.assertEqual(self.ev('writes.map(w=>w.target)'),['A'])
        self.ev("restoreWorkspace(new File(['bad JSON'],'bad.json'),handleB)");self.assertEqual(self.ev('workspaceFileHandle.name'),'A.json')
    def test_08b_cancelled_open_does_not_remember_candidate(self):
        self.linked()
        self.ev("window.remembered=[];OrgFlowStore.putHandle=async h=>remembered.push(h.name);window.showOpenFilePicker=async()=>[{...handleA,name:'B.json'}]")
        self.reject=['Open “'];self.ev('restoreWorkspacePicker()')
        self.assertEqual(self.ev('remembered'),[])
        self.assertEqual(self.ev('workspaceFileHandle.name'),'A.json')
    def test_08c_corrupt_primary_is_preserved_when_no_valid_copy_exists(self):
        self.ev("async()=>{await OrgFlowStore.deleteDocument();localStorage.setItem(PLANNING_KEY,'{broken');await initPlanning();}")
        self.assertEqual(self.ev('localStorage.getItem(PLANNING_KEY)'),'{broken')
        self.assertIn('could not be read',self.ev('modelLoadError'))
    def test_08d_outbox_is_partitioned_by_session(self):
        if ARGS.dom:self.skipTest('Requires real IndexedDB')
        result=self.ev("""async()=>{OrgFlowStore.setPendingScope({user:'A',tenant:'org'});await OrgFlowStore.putPending({reason:'A edits'});OrgFlowStore.setPendingScope({user:'B',tenant:'org'});const other=await OrgFlowStore.getPending();await OrgFlowStore.clearPending();OrgFlowStore.setPendingScope({user:'A',tenant:'org'});return {other:other||null,own:(await OrgFlowStore.getPending()).reason};}""")
        self.assertIsNone(result['other']);self.assertEqual(result['own'],'A edits')
    def test_08e_saved_file_needs_explicit_reconnection_after_restart(self):
        self.linked()
        self.ev("async()=>{window.showSaveFilePicker=async()=>handleA;OrgFlowStore.getHandle=async()=>({handle:handleA,workspaceId:workspace.workspaceId});await resumeFileHandle();}")
        self.assertTrue(self.ev('fileHandleNeedsReconnect'))
        self.assertFalse(self.ev('filePersistence.enabled'))
    def test_09_disable_autosave_cancels_queued_write(self):
        self.linked();self.page.locator('#autoSaveFile').scroll_into_view_if_needed();self.ev('filePersistence.delay=2000');self.edit();self.page.locator('#autoSaveFile').uncheck();self.page.wait_for_timeout(2150);self.assertEqual(self.ev('writes.length'),0)
    def test_10_archived_only_compare_and_restore(self):
        self.ev("()=>{for(const s of [...workspace.scenarios])if(s.id!=='current')toggleScenarioArchive(s.id,true);setView('compare')}")
        self.assertTrue(self.page.locator('#compareWelcome').is_visible());self.assertFalse(self.page.locator('#compareContent').is_visible())
        self.ev("()=>{const s=workspace.scenarios.find(s=>s.archived);toggleScenarioArchive(s.id,false);renderComparison()}")
        self.assertTrue(self.page.locator('#compareContent').is_visible())
    def test_11_scenario_decision_lifecycle_and_rollback(self):
        self.ev("createScenario('Management proposal','current','Review capacity')")
        self.edit('Approved proposed title');self.planning('decisions');self.click('[data-decision-metadata]')
        self.page.locator('#planning-owner').fill('Andrea');self.page.locator('#planning-reviewers').fill('Reviewer');self.page.locator('#planning-rationale').fill('Add engineering capacity');self.click('#planningRecordSave')
        for action in ['submit','approve','apply']:self.click(f'[data-decision-action="{action}"]')
        self.assertEqual(self.ev('activeScenario().workflow.state'),'Applied');self.assertEqual(self.ev('scenarioById("current").positions[0].title'),'Approved proposed title')
        self.click('[data-decision-action="rollback"]');self.assertEqual(self.ev('activeScenario().workflow.state'),'Draft');self.assertEqual(self.ev('scenarioById("current").positions[0].title'),'Approved proposed title')
    def test_12_dated_records_and_forecast_drilldown(self):
        self.planning('timeline');self.page.locator('#timelineKind').select_option('costs');self.click('[data-planning-add="costs"]')
        self.page.locator('#planning-annualCost').fill('120000');self.page.locator('#planning-startDate').fill('2026-09-01');self.click('#planningRecordSave');self.assertEqual(self.ev('activeScenario().costs.length'),1)
        self.click('[data-management-tab="forecast"]');self.page.locator('#forecastMonth').fill('2026-09');self.click('[data-forecast-detail="2026-09"]')
        self.assertIn('CHF 10',self.page.locator('#planningRecordForm').inner_text());self.page.keyboard.press('Escape')
        self.click('[data-management-tab="timeline"]');self.page.locator('#timelineKind').select_option('commitments');self.click('[data-planning-add="commitments"]')
        self.page.locator('#planning-name').fill('2027 platform');self.page.locator('#planning-requiredFte').fill('3');self.click('#planningRecordSave');self.assertEqual(self.ev('activeScenario().commitments.length'),1)
    def test_13_chart_share_does_not_embed_workspace(self):
        self.ev("updateScenario(s=>s.employees.push({id:'secret-person',name:'PRIVATE NOT ON CHART'}))")
        html=self.ev('chartOnlyHTML(buildExportSVG(),activeScenario().name)');self.assertNotIn('PRIVATE NOT ON CHART',html);self.assertNotIn('orgflow.workspace',html);self.assertNotIn('applicationBaseline',html);self.assertIn('<svg',html)
    def test_14_mobile_bulk_sheet_and_filter_overlay(self):
        self.page.set_viewport_size({'width':390,'height':844});self.ev('toggleSelected(activeScenario().positions[0].id)')
        bar=self.page.locator('#bulkBar').bounding_box();self.assertLess(bar['height'],100)
        self.click('#bulkOpenBtn');box=self.page.locator('#bulkModal .modal').bounding_box();self.assertLessEqual(box['width'],390);self.assertLessEqual(box['height'],844)
        self.page.keyboard.press('Escape');self.click('#filterToggle');self.assertTrue(self.ev("document.querySelector('.layout').classList.contains('filters-open')"));self.page.keyboard.press('Escape');self.assertFalse(self.ev("document.querySelector('.layout').classList.contains('filters-open')"))
    def test_15_virtualized_chart_and_bounded_register(self):
        result=self.ev("""()=>{const template=structuredClone(activeScenario().positions[0]),next=emptyWorkspace(today),s=next.scenarios[0];s.positions=[];for(let i=0;i<2500;i++)s.positions.push({...template,id:'S-'+i,title:'Position '+i,managerId:i?'S-'+Math.floor((i-1)/5):'',personId:'',hiringState:'Vacant',startDate:'',endDate:'',group:'Test',stacked:false});replaceWorkspace(next);const a=performance.now();render();const elapsed=performance.now()-a;return{elapsed,nodes:document.querySelectorAll('#chart .node').length,total:people.length};}""")
        self.assertEqual(result['total'],2500);self.assertLess(result['nodes'],500);self.assertLess(result['elapsed'],1800)
        (OUT/'scale.json').write_text(json.dumps(result,indent=2));self.page.wait_for_timeout(500);self.page.locator('#search').fill('S-2499');self.page.wait_for_timeout(250);self.assertTrue(self.page.locator('#chart .node[data-id="S-2499"]').count());self.page.locator('#search').fill('');self.click('[data-view="positions"]');self.assertLessEqual(self.page.locator('#positionsRows tr').count(),100)
    def test_16_native_filesystem_serialization(self):
        if ARGS.dom:self.skipTest('Native filesystem requires real browser navigation; DOM harness cannot verify it.')
        result=self.ev("""async()=>{if(!window.showSaveFilePicker||!navigator.storage?.getDirectory||!window.FileSystemFileHandle?.prototype?.createWritable)return{supported:false};const root=await navigator.storage.getDirectory(),h=await root.getFileHandle('orgflow-ci.json',{create:true});if(!h.createWritable)return{supported:false};let payload={n:1};const controller=new OrgFlowPersistence.FilePersistence({readPayload:()=>payload,delay:10});controller.setTarget(h);const first=controller.save();payload={n:2};controller.changed();const second=controller.save();await Promise.all([first,second]);const saved=JSON.parse(await(await h.getFile()).text());await root.removeEntry('orgflow-ci.json');controller.dispose();return{supported:true,saved};}""")
        if not result['supported']:self.skipTest('This browser uses downloaded backups; user-picked writable files are unavailable.')
        self.assertEqual(result['saved'],{'n':2})
    def test_17_real_exports(self):
        if ARGS.dom:self.skipTest('Download/navigation is not verified in the DOM harness.')
        for function,suffix in [('exportShareableHTML()','.html'),('exportCSV()','.csv'),('exportWorkspace()','.json'),('exportCurrentPNG()','.png'),('exportBoardPack()','.pdf')]:
            with self.page.expect_download(timeout=20000) as download:self.ev(function)
            file=OUT/download.value.suggested_filename;download.value.save_as(str(file));self.assertTrue(file.name.endswith(suffix));self.assertGreater(file.stat().st_size,100)
            if suffix=='.png':self.assertEqual(file.read_bytes()[:8],b'\x89PNG\r\n\x1a\n')
            if suffix=='.pdf':self.assertTrue(file.read_bytes().startswith(b'%PDF-'))

    def test_18_shared_server_preserves_edits_and_reconciles_conflicts(self):
        if ARGS.dom:self.skipTest('Shared-host navigation requires the normal browser gate.')
        server=subprocess.Popen(['node','-e',"const {createApp}=require('./server/lib/app');const a=createApp({memory:true,env:{AUTH_MODE:'dev',SESSION_SECRET:'browser-test-secret'}});a.server.listen(0,'127.0.0.1',()=>{a.config.publicUrl='http://127.0.0.1:'+a.server.address().port;console.log(a.server.address().port)});"],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            port=int(server.stdout.readline().strip());base=f'http://127.0.0.1:{port}'
            login=self.context.request.post(base+'/auth/dev/login',data={'email':'browser-admin@example.test','role':'admin','canExport':True});self.assertEqual(login.status,200)
            fixture=json.loads((ROOT/'examples/harbor-and-co/workspace.json').read_text())
            saved=self.context.request.put(base+'/api/workspace',data={'workspace':fixture,'version':1});self.assertEqual(saved.status,200)
            self.page.goto(base+'/app.html');self.page.wait_for_function('() => window.OrgFlowEnterprise?.enabled && OrgFlowEnterprise.version===2 && workspace && workspace.scenarios')
            # Another client saves first; this page still holds the earlier version.
            remote=self.context.request.get(base+'/api/workspace').json();remote['workspace']['planning']['scenarios'][0]['positions'][0]['location']='Remote office'
            self.assertEqual(self.context.request.put(base+'/api/workspace',data={'workspace':remote['workspace'],'version':remote['version']}).status,200)
            self.edit('My local title');self.page.wait_for_function("() => OrgFlowEnterprise.saveState==='Conflict'")
            self.assertEqual(self.ev('activeScenario().positions[0].title'),'My local title')
            self.click('#serverSaveRetry');self.page.wait_for_selector('#serverConflictModal.open');self.click('#serverConflictSave');self.page.wait_for_function("() => OrgFlowEnterprise.saveState==='Saved' && !OrgFlowEnterprise.busy")
            self.assertEqual(self.ev('activeScenario().positions[0].title'),'My local title');self.assertEqual(self.ev('activeScenario().positions[0].location'),'Remote office')
            # A real shared proposal traverses authenticated metadata and decision endpoints.
            self.ev("createScenario('Shared browser proposal','current','Capacity review')");self.page.wait_for_function("() => OrgFlowEnterprise.saveState==='Saved' && !OrgFlowEnterprise.busy")
            self.planning('decisions');self.click('[data-decision-metadata]');self.page.locator('#planning-owner').fill('Engineering');self.page.locator('#planning-reviewers').fill('browser-admin@example.test');self.page.locator('#planning-rationale').fill('Real API decision test');self.click('#planningRecordSave')
            self.page.wait_for_selector('#planningRecordModal.open',state='detached')
            for action in ['submit','approve','apply']:
                self.click(f'[data-decision-action="{action}"]');self.page.wait_for_function("() => OrgFlowEnterprise.saveState==='Saved' && !OrgFlowEnterprise.busy")
            self.assertEqual(self.ev('activeScenario().workflow.state'),'Applied')
        finally:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()

    def test_19_quota_failure_does_not_block_durable_edits(self):
        if ARGS.dom:self.skipTest('Requires real IndexedDB')
        self.ev("async()=>{await OrgFlowStore.flush();const put=appStorage.setItem;appStorage.setItem=(key,value)=>{if(key===PLANNING_KEY)throw new DOMException('Full','QuotaExceededError');return put(key,value);};}")
        self.edit('Durable despite cache quota');self.ev('OrgFlowStore.flush()')
        self.assertEqual(self.ev('(async()=> (await OrgFlowStore.readDocument()).planning.scenarios[0].positions[0].title)()'),'Durable despite cache quota')
        self.edit('Second durable edit');self.ev('OrgFlowStore.flush()')
        self.page.reload();self.page.wait_for_function("() => typeof workspace!=='undefined'&&workspace?.scenarios?.length")
        self.assertEqual(self.ev('activeScenario().positions[0].title'),'Second durable edit')
    def test_20_checkpoint_failure_stops_replacement(self):
        before=self.ev('workspace.workspaceId')
        self.ev("()=>{OrgFlowStore.addCheckpoint=async()=>{throw new Error('disk full')};}")
        self.ev("loadSampleWorkspace('northstar-commerce',{skipConfirm:true})")
        self.assertEqual(self.ev('workspace.workspaceId'),before)
        self.assertIn('Checkpoint failed',self.page.locator('#toast').inner_text())
    def test_21_independent_tabs_cannot_overwrite_newer_durable_copy(self):
        if ARGS.dom:self.skipTest('Requires real IndexedDB')
        self.ev('OrgFlowStore.flush()')
        second=self.context.new_page();second.goto(self.base+'/app.html')
        second.wait_for_function("() => typeof workspace!=='undefined'&&workspace?.scenarios?.length")
        second.evaluate('OrgFlowStore.flush()')
        self.ev('OrgFlowStore.readDocument()');self.edit('First tab won');self.ev('OrgFlowStore.flush()')
        result=second.evaluate("async()=>{try{await OrgFlowStore.writeDocument(workspacePayload());return 'overwritten';}catch(e){return e.message;}}")
        self.assertIn('Another tab',result);second.close()
    def test_22_account_scope_hides_checkpoints_and_file_links(self):
        if ARGS.dom:self.skipTest('Requires real IndexedDB')
        result=self.ev("""async()=>{await OrgFlowStore.flush();OrgFlowStore.configureScope({user:'one',tenant:'org'});const id=await OrgFlowStore.addCheckpoint(workspace,'Private');OrgFlowStore.configureScope({user:'two',tenant:'org'});const list=await OrgFlowStore.listCheckpoints();return {list,read:await OrgFlowStore.readCheckpoint(id),handle:await OrgFlowStore.getHandle()||null};}""")
        self.assertEqual(result['list'],[]);self.assertIsNone(result['read']);self.assertIsNone(result['handle'])
    def test_23_interactive_export_runs_offline_and_excludes_private_fields(self):
        if ARGS.dom:self.skipTest('Requires normal asset fetch')
        self.ev("updateScenario(s=>{s.positions[0].title='EXCLUDED SECRET';s.positions.find(p=>p.id==='POS-003').title='<img src=x onerror=window.PWNED=true>';for(const p of s.positions)p.costCenter='PRIVATE COST';})")
        self.ev('openShareDialog()');self.page.locator('#shareScope').select_option('POS-003');self.page.locator('#shareDepth').select_option('1')
        with self.page.expect_download() as download:self.ev('exportInteractiveChart()')
        file=OUT/'offline-share.html';download.value.save_as(str(file));html=file.read_text()
        self.assertNotIn('EXCLUDED SECRET',html);self.assertNotIn('PRIVATE COST',html)
        viewer=self.context.new_page();errors=[];viewer.on('pageerror',lambda e:errors.append(str(e)))
        viewer.route('**/*',lambda route:route.abort())
        viewer.set_content(html);viewer.wait_for_selector('.of-card')
        initial=viewer.locator('.of-card').count();viewer.locator('#of-expand').click();expanded=viewer.locator('.of-card').count()
        self.assertGreater(expanded,initial);self.assertIsNone(viewer.evaluate('window.PWNED'))
        zoom=viewer.locator('#of-zoom-label').inner_text();viewer.locator('#of-zoom-in').click();self.assertNotEqual(viewer.locator('#of-zoom-label').inner_text(),zoom)
        viewer.locator('#of-collapse-all').click();viewer.locator('#of-search').fill('Engineer');self.assertTrue(viewer.locator('#of-hits').inner_text())
        self.assertEqual(errors,[]);viewer.screenshot(path=str(OUT/'interactive-offline.png'));viewer.close()

    def test_24_bundle_preserves_checkpoint_view_and_blocks_failed_import(self):
        if ARGS.dom:self.skipTest('Requires real IndexedDB')
        result=self.ev("""async()=>{
          await OrgFlowStore.flush();
          const before=workspace.workspaceId;
          const bundle=buildBundle({workspace:workspacePayload(),checkpoints:[{planning:workspace,branding,view:{...captureView(),zoom:0.75},theme:'dark',palette:'ocean',note:'Imported view'}]});
          const accepted=await restoreWorkspace(new File([JSON.stringify(bundle)],'recovery.orgflow'));
          await OrgFlowStore.flush();
          const rows=await OrgFlowStore.listCheckpoints();
          const checkpoint=await OrgFlowStore.readCheckpoint(rows.find(c=>c.note==='Imported view').id);
          OrgFlowStore.addCheckpoint=async()=>{throw new Error('disk full');};
          const rejected=await restoreWorkspace(new File([JSON.stringify(bundle)],'failure.orgflow'));
          return {accepted,rejected,before,after:workspace.workspaceId,view:checkpoint.view,theme:checkpoint.theme,palette:checkpoint.palette};
        }""")
        self.assertTrue(result['accepted']);self.assertFalse(result['rejected']);self.assertEqual(result['before'],result['after'])
        self.assertEqual(result['view']['zoom'],0.75);self.assertEqual(result['theme'],'dark');self.assertEqual(result['palette'],'ocean')

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(BrowserTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    (OUT/'results.json').write_text(json.dumps({'browser':ARGS.browser,'mode':'DOM mocks' if ARGS.dom else 'normal browser navigation','tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':[(str(t),why) for t,why in result.skipped]},indent=2))
    sys.exit(not result.wasSuccessful())
