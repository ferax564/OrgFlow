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
        self.linked();self.click('#fileBtn');self.assertTrue(self.page.locator('#autoSaveFile').is_visible());self.ev('filePersistence.delay=2000');self.edit();self.page.locator('#autoSaveFile').uncheck();self.page.wait_for_timeout(2150);self.assertEqual(self.ev('writes.length'),0)
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
            # The header chip must never look safe while the server copy is behind.
            for state,dot in [('Unsaved','dirty'),('Saving','dirty'),('Save failed','error'),('Conflict','error'),('Saved','saved')]:
                self.ev("s=>{OrgFlowEnterprise.saveState=s;renderSaveStatus();}",state);self.assertEqual(self.page.locator('#docDot').get_attribute('data-state'),dot,state)
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
        second.wait_for_function("() => typeof workspace!=='undefined'&&workspace?.scenarios?.length&&document.querySelectorAll('#chart .node').length>0")
        # Drain startup view persistence before deliberately ordering the two
        # competing writes; startup rendering otherwise introduces a third writer.
        second.evaluate('async()=>{clearTimeout(savedViewTimer);await OrgFlowStore.flush();}')
        self.ev("async()=>{clearTimeout(savedViewTimer);await OrgFlowStore.flush();await OrgFlowStore.readDocument();updateScenario(s=>{s.positions[0].title='First tab won';});await OrgFlowStore.flush();}")
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

    def test_25_file_menu_reports_where_work_is_saved(self):
        self.assertIn('Not saved to a file',self.page.locator('#docName').inner_text())
        self.click('#docStatusBtn');self.assertTrue(self.page.locator('#fileMenu.open').count())
        self.assertEqual(self.page.locator('#fileBtn').get_attribute('aria-expanded'),'true')
        self.page.keyboard.press('ArrowDown');self.assertTrue(self.ev("document.activeElement.closest('#fileMenu')!==null"))
        self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('#fileMenu.open').count())
        self.linked();self.ev('renderSaveStatus()')
        self.assertEqual(self.page.locator('#docName').inner_text(),'A.json')
        self.assertIn('A — OrgFlow',self.ev('document.title'))
        self.click('#fileBtn');self.assertTrue(self.page.locator('#unlinkFile').is_visible());self.assertTrue(self.page.locator('#autoSaveFile').is_checked())
        # The export menu is for sharing; workspace file actions live only in File.
        self.assertEqual(self.page.locator('#exportMenu [data-export="save"],#exportMenu [data-export="workspace"]').count(),0)
    def test_26_sidebar_sections_badges_and_panel_persist(self):
        if ARGS.dom:self.skipTest('Reload persistence requires real navigation')
        groups=self.ev('allGroups().length')
        section=self.page.locator('.side-section[data-section="group"]')
        section.locator('summary').click();self.assertTrue(self.ev("document.querySelector('[data-section=group]').open"))
        self.click('[data-chip-none="group"]');self.assertEqual(self.page.locator('#badgeGroup').inner_text(),f'0 of {groups}')
        self.assertEqual(self.page.locator('#countVisible').inner_text(),'0');self.assertTrue(self.page.locator('#filterStrip').is_visible())
        self.page.locator('#groupChips .chip').first.click();self.assertEqual(self.page.locator('#badgeGroup').inner_text(),f'1 of {groups}')
        self.click('[data-chip-all="group"]');self.assertEqual(self.page.locator('#badgeGroup').inner_text(),'All')
        self.click('#filterToggle');self.assertTrue(self.ev("document.querySelector('.layout').classList.contains('sidebar-collapsed')"))
        # Drain the deferred re-render and durable writes before reloading, as the
        # other reload tests do; WebKit otherwise reloads mid-IndexedDB commit.
        self.page.wait_for_timeout(400);self.ev("async()=>{clearTimeout(savedViewTimer);await OrgFlowStore.flush();}")
        self.page.reload();self.page.wait_for_function("() => typeof workspace!=='undefined' && workspace && document.querySelectorAll('#chart .node').length>0")
        self.assertTrue(self.ev("document.querySelector('.layout').classList.contains('sidebar-collapsed')"))
        self.assertTrue(self.ev("document.querySelector('[data-section=group]').open"))
        self.page.keyboard.press('[');self.assertFalse(self.ev("document.querySelector('.layout').classList.contains('sidebar-collapsed')"))
    def test_27_start_page_and_single_key_shortcuts(self):
        self.page.keyboard.press('?');self.assertTrue(self.page.locator('#shortcutsModal.open').count())
        self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('#shortcutsModal.open').count())
        self.page.keyboard.press('2');self.assertTrue(self.page.locator('#positionsPanel').is_visible())
        self.page.keyboard.press('1');self.assertTrue(self.page.locator('#canvasWrap').is_visible())
        zoom=self.ev('zoom');self.page.keyboard.press('-');self.assertLess(self.ev('zoom'),zoom)
        self.page.locator('#search').focus();self.page.keyboard.press('n');self.assertFalse(self.page.locator('#drawer.open').count())
        self.page.locator('#search').blur();self.page.keyboard.press('n');self.assertTrue(self.page.locator('#drawer.open').count())
        self.page.keyboard.press('Escape')
        self.click('#fileBtn');self.click('#fileNewBtn');self.assertTrue(self.page.locator('#welcomeModal.open').count())
        self.assertIn('position',self.page.locator('#continueMeta').inner_text())
        self.click('#exampleEmptyBtn');self.page.wait_for_function('() => activeScenario().positions.length===1')
        self.assertFalse(self.page.locator('#welcomeModal.open').count())
    def test_28_dropping_a_workspace_file_opens_it(self):
        if ARGS.dom:self.skipTest('Requires real drag events and IndexedDB')
        fixture=(ROOT/'examples/northstar-commerce/workspace.json').read_text()
        if not self.ev("()=>{try{const dt=new DataTransfer();dt.items.add(new File(['x'],'x.json'));return new DragEvent('drop',{dataTransfer:dt}).dataTransfer?.files.length===1}catch{return false}}"):
            self.skipTest('This engine cannot synthesize file drag events.')
        self.ev("""text=>{const dt=new DataTransfer();dt.items.add(new File([text],'northstar.json',{type:'application/json'}));
          window.dispatchEvent(new DragEvent('dragenter',{dataTransfer:dt}));
          window.__overlay=!document.querySelector('.drop-overlay').hidden;
          window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,cancelable:true}));}""",fixture)
        self.assertTrue(self.ev('window.__overlay'))
        self.page.wait_for_function("() => branding.companyName==='Northstar Commerce'")
        self.assertTrue(self.ev("document.querySelector('.drop-overlay').hidden"))

    def seat_xy(self,x,y):return self.ev("([x,y])=>{const m=document.querySelector('#seatingSvg').getScreenCTM(),p=new DOMPoint(x,y).matrixTransform(m);return [p.x,p.y]}",[x,y])
    # The canvas repaints once more when its scrollbars and legend appear; click after layout settles.
    def settle(self):self.ev("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,50))))")
    def seat_room(self):
        self.page.keyboard.press('5');self.page.wait_for_selector('#seatingPanel:not(.hidden)')
        self.page.fill('#seatingNewW','10');self.page.fill('#seatingNewD','6');self.click('#seatingCreateFirst')
        self.page.wait_for_function("()=>workspace.seating?.rooms.length===1")
        self.settle()
    def test_29_seating_draw_walls_and_rectangle_room(self):
        self.seat_room()
        self.assertEqual(self.ev("workspace.seating.rooms[0].outline"),[[100,100],[1100,100],[1100,700],[100,700]])
        self.page.keyboard.press('w')
        for x,y in [(100,100),(1100,120),(1100,400),(620,400),(640,700),(100,700)]:
            self.page.mouse.click(*self.seat_xy(x,y))
        self.page.mouse.move(*self.seat_xy(100,400))
        self.assertRegex(self.page.locator('#seatOverlay').text_content(),r'\d m','the live wall length is shown while drawing')
        self.page.keyboard.press('Enter')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].outline.length===6")
        self.assertEqual(self.ev("workspace.seating.rooms[0].outline"),[[100,100],[1100,100],[1100,400],[600,400],[600,700],[100,700]],'walls snap to the grid and to right angles')
        self.assertEqual(self.ev("OrgFlowSeatingUI.state.tool"),'select')
        self.page.keyboard.press('q')
        a=self.seat_xy(200,200);b=self.seat_xy(1000,650)
        self.page.mouse.move(*a);self.page.mouse.down();self.page.mouse.move(*b,steps=4);self.page.mouse.up()
        self.page.wait_for_function("()=>workspace.seating.rooms[0].outline.length===4")
        self.assertEqual(self.ev("workspace.seating.rooms[0].outline"),[[200,200],[1000,200],[1000,650],[200,650]])
        self.page.keyboard.press('Control+z')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].outline.length===6")
        self.page.keyboard.press('v')
        corner=self.seat_xy(1100,100);self.page.mouse.move(*corner);self.page.mouse.down();self.page.mouse.move(*self.seat_xy(1000,150),steps=3);self.page.mouse.up()
        self.page.wait_for_function("()=>workspace.seating.rooms[0].outline[1][0]===1000&&workspace.seating.rooms[0].outline[1][1]===150")
    def test_30_seating_desks_blocks_move_rotate_delete(self):
        self.seat_room()
        self.assertEqual(self.ev("OrgFlowSeatingUI.state.tool"),'block','a new room goes straight to the desk-block tool')
        a=self.seat_xy(150,150);b=self.seat_xy(1050,650)
        self.page.mouse.move(*a);self.page.mouse.down();self.page.mouse.move(*b,steps=5);self.page.mouse.up()
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks.length>0")
        n=self.ev("workspace.seating.rooms[0].desks.length");self.assertGreaterEqual(n,10)
        self.assertEqual(self.ev("OrgFlowSeating.roomIssues(workspace.seating.rooms[0])"),{'outside':[],'overlapping':[]})
        self.assertEqual(self.ev("OrgFlowSeatingUI.state.selected.size"),n)
        self.page.keyboard.press('Delete')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks.length===0")
        self.page.keyboard.press('d');self.page.mouse.click(*self.seat_xy(400,300))
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks.length===1")
        self.assertEqual(self.ev("(({x,y,label})=>({x,y,label}))(workspace.seating.rooms[0].desks[0])"),{'x':400,'y':300,'label':'D1'})
        self.page.keyboard.press('v');self.page.keyboard.press('r')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks[0].rotation===90")
        self.page.mouse.move(*self.seat_xy(400,300));self.page.mouse.down();self.page.mouse.move(*self.seat_xy(700,410),steps=4);self.page.mouse.up()
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks[0].x===700")
        self.assertEqual(self.ev("workspace.seating.rooms[0].desks[0].y"),400,'moves snap to the 50 cm grid')
        self.page.keyboard.press('Control+d')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks.length===2")
        self.assertEqual(self.ev("workspace.seating.rooms[0].desks[1].label"),'D2')
        x=self.ev("workspace.seating.rooms[0].desks[1].x");self.page.keyboard.press('ArrowRight')
        self.page.wait_for_function("x=>workspace.seating.rooms[0].desks[1].x===x+50",arg=x)
        self.page.fill('#seatLabel','Window');self.page.keyboard.press('Tab')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks[1].label==='Window'")
        self.click('#seatingAddRoom');self.page.wait_for_function("()=>workspace.seating.rooms.length===2")
        self.assertEqual(self.page.locator('.seat-room').count(),2)
        self.click('[data-seat-action="delete-room"]')
        self.page.wait_for_function("()=>workspace.seating.rooms.length===1")
    def test_31_seating_assign_people_across_scenarios(self):
        self.seat_room()
        a=self.seat_xy(150,150);b=self.seat_xy(1050,650)
        self.page.mouse.move(*a);self.page.mouse.down();self.page.mouse.move(*b,steps=5);self.page.mouse.up()
        self.page.wait_for_function("()=>workspace.seating.rooms[0].desks.length>=10")
        self.page.keyboard.press('Escape')
        filled=self.ev("people.filter(p=>p.personId).length")
        first=self.ev("people.filter(p=>p.personId).sort((a,b)=>a.personName.localeCompare(b.personName))[0]")
        desk=self.ev("workspace.seating.rooms[0].desks[0]")
        if ARGS.browser=='chromium':
            self.page.locator(f'[data-seat-position="{first["id"]}"]').drag_to(self.page.locator(f'#seatDeskLayer [data-desk-id="{desk["id"]}"]'))
        else:
            self.page.mouse.click(*self.seat_xy(desk['x'],desk['y']));self.click(f'[data-seat-position="{first["id"]}"]')
        self.page.wait_for_function("id=>workspace.seating.rooms[0].desks[0].positionId===id",arg=first['id'])
        self.assertIn(first['personName'].split()[0],self.page.locator(f'#seatDeskLayer [data-desk-id="{desk["id"]}"]').text_content())
        # Seating the same person elsewhere moves them rather than double-booking.
        other=self.ev("workspace.seating.rooms[0].desks[1]")
        self.page.mouse.click(*self.seat_xy(other['x'],other['y']))
        self.page.select_option('#seatAssign',first['id'])
        self.page.wait_for_function("id=>workspace.seating.rooms[0].desks[1].positionId===id&&!workspace.seating.rooms[0].desks[0].positionId",arg=first['id'])
        self.page.keyboard.press('Escape')
        self.click('[data-seat-action="autoseat"]')
        self.page.wait_for_function("n=>workspace.seating.rooms[0].desks.filter(d=>d.positionId).length===n",arg=filled)
        self.assertEqual(self.ev("OrgFlowSeating.summarize(workspace.seating,people).unseatedPeople"),0)
        # The position editor shows the desk.
        self.page.locator('[data-desk-id]').nth(1).click()
        self.click('[data-seat-open]')
        self.assertIn('Room 1',self.page.locator('#drawerSeat').text_content());self.assertFalse(self.ev("document.querySelector('#drawerSeat').classList.contains('hidden')"))
        self.click('#drawerClose')
        # A scenario shows its own occupants on the shared floor plan.
        self.ev("()=>createScenario('Seat move','current')")
        self.ev("id=>updateScenario(s=>{const p=s.positions.find(x=>x.id===id);p.personId='';p.hiringState='Vacant';},'Vacate')",first['id'])
        self.page.wait_for_timeout(100)
        self.assertIn('Vacant',self.page.locator(f'#seatDeskLayer [data-desk-id="{other["id"]}"]').text_content())
        self.ev("()=>switchScenario('current')");self.page.wait_for_timeout(100)
        self.assertIn(first['personName'].split()[0],self.page.locator(f'#seatDeskLayer [data-desk-id="{other["id"]}"]').text_content())
        with self.page.expect_download() as info:self.click('#seatingCsvBtn')
        csv=Path(info.value.path()).read_text(encoding='utf-8-sig')
        self.assertTrue(csv.startswith('"room","floor","desk","deskId","hotDesk","positionId"'),csv[:80]);self.assertIn(first['personName'],csv)
        with self.page.expect_download() as info:self.click('#seatingPngBtn')
        self.assertEqual(Path(info.value.path()).read_bytes()[:4],b'\x89PNG')
        if not ARGS.dom:
            self.page.wait_for_timeout(300);self.page.reload()
            self.page.wait_for_function("() => typeof workspace!=='undefined' && workspace && workspace.seating?.rooms.length===1")
            self.assertEqual(self.ev("workspace.seating.rooms[0].desks.filter(d=>d.positionId).length"),filled)
            self.assertEqual(self.ev("currentView"),'seating','the Seating tab is remembered')
    def test_32_seating_touch_drag_pans_instead_of_selecting(self):
        self.seat_room()
        self.page.keyboard.press('v')
        for _ in range(6):self.page.keyboard.press('+')
        before=self.ev("[document.querySelector('#seatingCanvas').scrollLeft,document.querySelector('#seatingCanvas').scrollTop]")
        x,y=self.seat_xy(600,400)
        self.ev("""([x,y])=>{const s=document.querySelector('#seatingSvg'),target=document.elementFromPoint(x,y);
          const fire=(type,dx,dy)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:7,pointerType:'touch',isPrimary:true,button:type==='pointermove'?-1:0,buttons:type==='pointerup'?0:1,clientX:x+dx,clientY:y+dy}));
          fire('pointerdown',0,0);s.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,pointerType:'touch',buttons:1,clientX:x-120,clientY:y-80}));s.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,pointerType:'touch',clientX:x-120,clientY:y-80}));}""",[x,y])
        after=self.ev("[document.querySelector('#seatingCanvas').scrollLeft,document.querySelector('#seatingCanvas').scrollTop]")
        self.assertGreater(after[0],before[0]);self.assertGreater(after[1],before[1])
        self.assertEqual(self.ev("OrgFlowSeatingUI.state.selected.size"),0)
    PLAN_SVG=b'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"><rect width="1000" height="600" fill="#fff"/><path d="M100 60H900V330H600V540H100Z" fill="none" stroke="#222" stroke-width="8"/><path d="M100 580H600" stroke="#c00" stroke-width="4"/></svg>'
    def test_33_seating_floor_plan_import_and_scale(self):
        self.page.keyboard.press('5');self.page.wait_for_selector('#seatingPanel:not(.hidden)')
        self.page.set_input_files('#seatingPlanFile',files=[{'name':'hq-level-2.svg','mimeType':'image/svg+xml','buffer':self.PLAN_SVG}])
        self.page.wait_for_function("()=>workspace.seating?.rooms[0]?.background")
        room=self.ev("(({name,outline,background:{x,y,w,h,opacity,hidden,image}})=>({name,outline,x,y,w,h,opacity,hidden,raster:/^data:image\\/(webp|jpeg);base64,/.test(image)}))(workspace.seating.rooms[0])")
        self.assertEqual(room,{'name':'hq level 2','outline':[[100,100],[2100,100],[2100,1300],[100,1300]],'x':100,'y':100,'w':2000,'h':1200,'opacity':0.6,'hidden':False,'raster':True})
        self.assertEqual(self.ev("OrgFlowSeatingUI.state.plan?.mode"),'calibrate','an import asks for the scale straight away')
        self.settle()
        img=lambda px,py:self.seat_xy(100+px*2,100+py*2)
        # Two points 500 image px (10 m at the default 2 cm/px) apart, mid-height so they stay clear of the canvas edges.
        for n,(px,py) in enumerate([(250,300),(750,300)],1):
            x,y=img(px,py)
            self.assertTrue(self.ev("([x,y])=>document.elementFromPoint(x,y)?.closest('#seatingSvg')!==null",[x,y]),f'calibration point {n} is off the canvas')
            self.page.mouse.click(x,y)
            self.page.wait_for_function("n=>OrgFlowSeatingUI.state.plan.points.length===n",arg=n)
        # Exact scaling is unit-tested; here clicks are only as precise as the engine's pointer (a few px, ~4 cm/px
        # at this zoom, and slow CI browsers can still be settling the canvas). Assert against the points actually picked.
        measured=self.ev("(([a,b])=>Math.hypot(b.x-a.x,b.y-a.y))(OrgFlowSeatingUI.state.plan.points)")
        diag=self.ev("(c=>({zoom:OrgFlowSeatingUI.state.zoom,scroll:[c.scrollLeft,c.scrollTop],canvas:c.getBoundingClientRect().toJSON(),points:OrgFlowSeatingUI.state.plan.points}))(document.querySelector('#seatingCanvas'))")
        self.assertAlmostEqual(measured,1000,delta=50,msg=str(diag))
        shown=re.search(r'([\d.,]+) m apart',self.page.locator('.seat-plan-card').inner_text())
        self.assertIsNotNone(shown,'the panel reports the measured distance')
        self.assertAlmostEqual(float(shown.group(1).replace(',','')),measured/100,delta=0.006)
        self.page.fill('#seatCalibM','15');self.page.keyboard.press('Enter')
        self.page.wait_for_function("()=>!OrgFlowSeatingUI.state.plan")
        bg=self.ev("(({x,y,w,h})=>({x,y,w,h}))(workspace.seating.rooms[0].background)")
        self.assertAlmostEqual(bg['w'],2000*1500/measured,delta=1,msg='scaled by real ÷ measured')
        self.assertAlmostEqual(bg['h'],1200*1500/measured,delta=1)
        self.assertEqual((bg['x'],bg['y']),(100,100),'shifted back onto the canvas')
        self.assertEqual(self.ev("workspace.seating.rooms[0].outline"),[[100,100],[100+bg['w'],100],[100+bg['w'],100+bg['h']],[100,100+bg['h']]],'walls still on the image frame follow the plan')
        self.assertIsNone(self.ev("OrgFlowSeatingUI.state.plan"))
        # Move the plan, change opacity, hide it and bring it back.
        self.click('[data-seat-action="plan-move"]');self.page.keyboard.press('ArrowRight');self.page.keyboard.press('Shift+ArrowDown')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].background.x===110&&workspace.seating.rooms[0].background.y===150")
        self.page.keyboard.press('Escape')
        self.page.locator('#seatPlanOpacity').fill('0.3');self.page.wait_for_function("()=>workspace.seating.rooms[0].background.opacity===0.3")
        self.page.locator('[data-plan-field="hidden"]').uncheck();self.page.wait_for_function("()=>workspace.seating.rooms[0].background.hidden")
        self.assertEqual(self.page.locator('#seatPlanLayer image').count(),0)
        self.page.locator('[data-plan-field="hidden"]').check();self.page.wait_for_function("()=>!workspace.seating.rooms[0].background.hidden")
        # Local history copies drop the image; restoring puts it back from the live plan.
        self.assertEqual(self.ev("JSON.parse(localStorage.getItem('orgflow.history.v1'))[0].planning.seating.rooms[0].background?.image"),'')
        self.ev("()=>{window.confirm=()=>true}");self.ev("()=>restoreHistoryIndex(0)")
        self.page.wait_for_function("()=>workspace.seating.rooms[0].background.image.startsWith('data:image/')")
        with self.page.expect_download() as info:self.click('#seatingPngBtn')
        self.assertEqual(Path(info.value.path()).read_bytes()[:4],b'\x89PNG')
        # Undo keeps working with packed plan images.
        before=self.ev("workspace.seating.rooms[0].background.opacity")
        self.page.locator('#seatPlanOpacity').fill('0.8');self.page.wait_for_function("()=>workspace.seating.rooms[0].background.opacity===0.8")
        self.page.keyboard.press('Control+z')
        self.page.wait_for_function("o=>workspace.seating.rooms[0].background.opacity===o&&workspace.seating.rooms[0].background.image.startsWith('data:image/')",arg=before)
        self.assertFalse(self.ev("undoStack.some(t=>t.includes('base64,'))"),'undo entries reference the plan instead of copying it')
        # Dropping an image on an existing room replaces its plan (the canvas must not swallow file drops).
        if self.ev("()=>{try{const dt=new DataTransfer();dt.items.add(new File(['x'],'x.svg'));return new DragEvent('drop',{dataTransfer:dt}).dataTransfer?.files.length===1}catch{return false}}"):
            old=self.ev("workspace.seating.rooms[0].background.image.length")
            self.ev("""svg=>{const dt=new DataTransfer();dt.items.add(new File([svg.replace('#c00','#00c')],'annex.svg',{type:'image/svg+xml'}));
              const target=document.querySelector('#seatingSvg'),opts={dataTransfer:dt,bubbles:true,cancelable:true};
              target.dispatchEvent(new DragEvent('dragover',opts));target.dispatchEvent(new DragEvent('drop',opts));}""",self.PLAN_SVG.decode())
            self.page.wait_for_function("n=>workspace.seating.rooms[0].background.image.length!==n",arg=old)
            self.assertEqual(self.ev("workspace.seating.rooms.length"),1,'replaces the plan of the selected room')
            self.assertEqual(self.ev("OrgFlowSeatingUI.state.plan?.mode"),'calibrate')
            self.page.keyboard.press('Escape')
        self.click('[data-seat-action="plan-remove"]')
        self.page.wait_for_function("()=>!workspace.seating.rooms[0].background")
    def test_34_seating_non_rectangular_rooms(self):
        self.seat_room()
        self.page.keyboard.press('Escape')
        for kind,corners in [('L',6),('U',8),('T',8)]:
            self.click(f'[data-seat-shape="{kind}"]')
            self.page.wait_for_function("n=>workspace.seating.rooms[0].outline.length===n",arg=corners)
        self.assertEqual(self.ev("OrgFlowSeating.bounds(workspace.seating.rooms[0].outline)"),{'x':100,'y':100,'w':1000,'h':600,'maxX':1100,'maxY':700})
        self.page.fill('#seatRoomW','20');self.page.fill('#seatRoomD','12');self.click('[data-seat-action="resize"]')
        self.page.wait_for_function("()=>OrgFlowSeating.bounds(workspace.seating.rooms[0].outline).w===2000")
        self.assertEqual(self.ev("workspace.seating.rooms[0].outline.length"),8,'resizing keeps the T shape')
        # Diagonal walls: 45° snapping keeps equal steps; Shift allows any angle.
        self.click('[data-seat-shape="rect"]');self.page.wait_for_function("()=>workspace.seating.rooms[0].outline.length===4")
        self.page.keyboard.press('w')
        for x,y in [(300,100),(900,100),(1110,290),(1100,500)]:self.page.mouse.click(*self.seat_xy(x,y))
        self.page.keyboard.down('Shift');self.page.mouse.click(*self.seat_xy(700,640));self.page.keyboard.up('Shift')
        self.page.mouse.click(*self.seat_xy(300,650));self.page.mouse.click(*self.seat_xy(110,480))
        self.page.keyboard.press('Enter')
        self.page.wait_for_function("()=>workspace.seating.rooms[0].outline.length===7")
        self.assertEqual(self.ev("workspace.seating.rooms[0].outline"),[[300,100],[900,100],[1100,300],[1100,500],[700,650],[300,650],[100,450]])

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(BrowserTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    (OUT/'results.json').write_text(json.dumps({'browser':ARGS.browser,'mode':'DOM mocks' if ARGS.dom else 'normal browser navigation','tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':[(str(t),why) for t,why in result.skipped]},indent=2))
    sys.exit(not result.wasSuccessful())
